"""Durable refunds: withdraw access before sending, settle only on signed DONE."""

import asyncio
import json
import logging
from decimal import Decimal
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func

from autopay_api import check_config, post_xml
from autopay_protocol import payment_hash, safe_xml, signature_matches
from models import AutopayReceipt, PremiumOrder, PremiumRefund
from payment_limits import acquire_payment_limit_lock
from premium_access import parse_premium_datetime, revoke_order_entitlements
from premium_deadlines import withdrawal_deadline

logger = logging.getLogger(__name__)


def request_refund(order, db, config, *, admin_id=None):
    check_config(order, config)
    acquire_payment_limit_lock(db)
    order = db.query(PremiumOrder).filter_by(id=order.id).populate_existing().with_for_update().one()
    if order.status != "paid" or order.refunded_at:
        raise HTTPException(409, "Zwrot wymaga potwierdzonej, niezwróconej wpłaty.")
    if not order.refund_requested_at:
        deadline = withdrawal_deadline(order)
        if not deadline or datetime.now(timezone.utc) >= deadline:
            raise HTTPException(409, "Upłynął termin 14 dni na odstąpienie. Inne podstawy zwrotu rozpatrz indywidualnie.")
    pending = []
    for receipt in db.query(AutopayReceipt).filter_by(order_reference=order.id, environment=order.environment).order_by(AutopayReceipt.id).all():
        refund = db.query(PremiumRefund).filter(
            PremiumRefund.receipt_id == receipt.id, PremiumRefund.status.in_(["requested", "accepted"])).first()
        if not refund:
            used = db.query(func.coalesce(func.sum(PremiumRefund.amount_grosz), 0)).filter(
                PremiumRefund.receipt_id == receipt.id, PremiumRefund.status != "failed").scalar()
            if int(used) >= receipt.amount_grosz:
                continue
            stamp = datetime.now(timezone.utc).isoformat()
            refund = PremiumRefund(id=uuid4().hex, order_id=order.id, receipt_id=receipt.id, remote_id=receipt.remote_id,
                environment=order.environment, amount_grosz=receipt.amount_grosz - int(used), status="requested",
                created_at=stamp, updated_at=stamp)
            db.add(refund)
        pending.append(refund)
    if not pending:
        raise HTTPException(409, "Brak niezwróconej wpłaty dla tego zamówienia.")
    if not order.refund_requested_at:
        order.refund_requested_at = datetime.now(timezone.utc).isoformat()
        order.refund_requested_by = admin_id
        revoke_order_entitlements(order, db)
    # Withdrawal and ALL MessageIDs survive timeouts/restarts. The receipt ledger
    # remains immutable; withdrawal is not a confirmation that money was returned.
    db.commit()
    failed = False
    for refund in pending:
        try:
            fields = {"ServiceID": config["service"], "MessageID": refund.id, "RemoteID": refund.remote_id,
                      "Amount": f"{Decimal(refund.amount_grosz) / 100:.2f}", "Currency": "PLN"}
            fields["Hash"] = payment_hash(fields.values(), config)
            root = safe_xml(post_xml(config, "/settlementapi/transactionRefund", fields))
            if (root.tag != "transactionRefund" or [node.tag for node in root] != ["serviceID", "messageID", "hash"]
                    or any(len(node) for node in root) or root.findtext("serviceID") != config["service"]
                    or root.findtext("messageID") != refund.id
                    or not signature_matches(root.findtext("hash"), [config["service"], refund.id], config)):
                raise HTTPException(502, "Niepotwierdzone przyjęcie zwrotu.")
            refund = db.query(PremiumRefund).filter_by(id=refund.id).populate_existing().with_for_update().one()
            if refund.status not in ("done", "failed"):
                refund.status = "accepted"
                refund.error = None
        except HTTPException:
            db.rollback()
            refund = db.query(PremiumRefund).filter_by(id=refund.id).populate_existing().with_for_update().one()
            if refund.status != "done":
                refund.error = "Autopay nie potwierdził przyjęcia zwrotu. Sprawdź status lub ponów zlecenie."
            failed = True
        refund.updated_at = datetime.now(timezone.utc).isoformat()
        db.commit()
    if failed:
        raise HTTPException(502, "Zapisano zwrot i wycofano Premium z tego zakupu, ale Autopay nie potwierdził przyjęcia wszystkich zleceń. Sprawdź status lub ponów zwrot.")


def refresh_refund(order, db, config, *, refund_id=None):
    check_config(order, config)
    query = db.query(PremiumRefund).filter_by(order_id=order.id)
    if refund_id:
        query = query.filter_by(id=refund_id)
    refund = query.order_by(PremiumRefund.created_at.desc()).populate_existing().with_for_update().first()
    if not refund:
        raise HTTPException(404, "Nie zlecono zwrotu tego zamówienia.")
    last = parse_premium_datetime(refund.last_checked_at)
    if refund.status == "done" or (last and (datetime.now(timezone.utc) - last).total_seconds() < 15):
        db.commit()
        return
    refund.last_checked_at = datetime.now(timezone.utc).isoformat()
    db.commit()  # Bound the rate across browser requests and the background worker.
    fields = {"serviceId": int(config["service"]), "messageId": refund.id, "method": "TRANSACTION_REFUND"}
    fields["hash"] = payment_hash(fields.values(), config)
    try:
        try:
            result = json.loads(post_xml(config, "/settlementapi/outDetails/v2", fields, json_body=True))
        except (ValueError, UnicodeError):
            raise HTTPException(502, "Niepoprawna odpowiedź o statusie zwrotu.") from None
        if (not isinstance(result, dict) or str(result.get("serviceId")) != config["service"] or result.get("messageId") != refund.id
                or not signature_matches(result.get("hash"), [result.get(key) for key in ("serviceId", "messageId", "status", "remoteOutId")], config)):
            raise HTTPException(502, "Nieprawidłowy podpis statusu zwrotu. Stan wpłaty nie został zmieniony.")
        provider_status = result.get("status")
        allowed = {"NEW", "WAITING_FOR_TRANSFER_DATA", "COMMISSIONS_CALCULATED", "CANCELED_AMOUNT_EXCEEDS_TRANSACTION",
                   "FAILED_ATTEMPT_OF_BALANCE_CHANGE", "CANCELED_NO_FUNDS_ON_BALANCE", "CANCELED_MANUALLY_BY_SERVICES", "PROCESSING", "DONE"}
        if not isinstance(provider_status, str) or provider_status not in allowed:
            raise HTTPException(502, "Nieobsługiwany status zwrotu operatora.")
    except HTTPException:
        db.rollback()
        refund = db.query(PremiumRefund).filter_by(id=refund.id).populate_existing().with_for_update().one()
        if refund.status != "done":
            refund.error = "Nie udało się potwierdzić wykonania zwrotu w Autopay. Premium z tego zakupu pozostaje wycofane."
            db.commit()
        raise
    acquire_payment_limit_lock(db)
    refund = db.query(PremiumRefund).filter_by(id=refund.id).populate_existing().with_for_update().one()
    if refund.status != "done":
        refund.provider_status = provider_status
        refund.provider_remote_id = str(result.get("remoteOutId") or "")[:100]
        refund.updated_at = datetime.now(timezone.utc).isoformat()
        refund.status = "done" if provider_status == "DONE" else "failed" if provider_status.startswith("CANCELED_") else "accepted"
        refund.error = "Autopay nie zrealizował zwrotu. Sprawdź saldo i ponów zlecenie." if refund.status == "failed" else None
    if refund.status == "done":
        db.flush()
        order = db.query(PremiumOrder).filter_by(id=order.id).populate_existing().with_for_update().one()
        received = db.query(func.coalesce(func.sum(AutopayReceipt.amount_grosz), 0)).filter(
            AutopayReceipt.order_reference == order.id, AutopayReceipt.environment == order.environment).scalar()
        returned = db.query(func.coalesce(func.sum(PremiumRefund.amount_grosz), 0)).filter(
            PremiumRefund.order_id == order.id, PremiumRefund.status == "done").scalar()
        if int(received) > 0 and int(returned) >= int(received):
            from premium_access import revoke_fully_refunded_order
            revoke_fully_refunded_order(order, db)
    db.commit()


def refunds_status(order, db):
    return [{"id": row.id, "status": row.status, "amount": f"{Decimal(row.amount_grosz) / 100:.2f}",
             "provider_status": row.provider_status, "error": row.error} for row in db.query(PremiumRefund).filter_by(order_id=order.id).order_by(PremiumRefund.created_at).all()]


def refresh_pending_refunds():
    """Check only previously authorized refunds; never initiate money movements."""
    from database import SessionLocal
    from premium_payments import notification_config
    with SessionLocal() as db:
        ids = [row.id for row in db.query(PremiumRefund).filter(
            PremiumRefund.environment == "production", PremiumRefund.status.in_(["requested", "accepted"])
        ).order_by(PremiumRefund.last_checked_at.asc().nullsfirst(), PremiumRefund.created_at).limit(20).all()]
    if not ids:
        return
    config = notification_config()
    for refund_id in ids:
        with SessionLocal() as db:
            refund = db.get(PremiumRefund, refund_id)
            order = db.get(PremiumOrder, refund.order_id) if refund and refund.order_id else None
            if order:
                try:
                    refresh_refund(order, db, config, refund_id=refund_id)
                except HTTPException:
                    logger.warning("Autopay refund status could not be confirmed for request %s", refund_id)


async def refund_status_loop():
    while True:
        try:
            await asyncio.to_thread(refresh_pending_refunds)
        except Exception:
            # Never log credentials, operator payloads or SQL connection URLs.
            logger.warning("Autopay refund status worker will retry in one minute")
        await asyncio.sleep(60)
