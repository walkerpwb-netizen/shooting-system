"""Refund requests are durable and retried with the same operator MessageID."""

import json
from decimal import Decimal
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func

from autopay_api import check_config, post_xml
from autopay_protocol import payment_hash, safe_xml, signature_matches
from models import AutopayReceipt, PremiumOrder, PremiumRefund
from payment_limits import acquire_payment_limit_lock


def request_refund(order, db, config):
    check_config(order, config)
    if order.status != "paid":
        raise HTTPException(409, "Zwrot wymaga potwierdzonej wpłaty.")
    acquire_payment_limit_lock(db)
    order = db.query(PremiumOrder).filter_by(id=order.id).populate_existing().with_for_update().one()
    pending = db.query(PremiumRefund).filter(PremiumRefund.order_id == order.id, PremiumRefund.status.in_(["requested", "accepted"])).first()
    if pending:
        refund = pending
    else:
        refund = None
        for receipt in db.query(AutopayReceipt).filter_by(order_reference=order.id, environment=order.environment).order_by(AutopayReceipt.id).all():
            used = db.query(func.coalesce(func.sum(PremiumRefund.amount_grosz), 0)).filter(
                PremiumRefund.receipt_id == receipt.id, PremiumRefund.status != "failed").scalar()
            if int(used) < receipt.amount_grosz:
                stamp = datetime.now(timezone.utc).isoformat()
                refund = PremiumRefund(id=uuid4().hex, order_id=order.id, receipt_id=receipt.id, remote_id=receipt.remote_id,
                    environment=order.environment, amount_grosz=receipt.amount_grosz - int(used), status="requested",
                    created_at=stamp, updated_at=stamp)
                db.add(refund)
                break
        if refund is None:
            raise HTTPException(409, "Brak niezwróconej wpłaty dla tego zamówienia.")
    db.commit()  # Persist MessageID before any outbound request, including a timeout.
    fields = {"ServiceID": config["service"], "MessageID": refund.id, "RemoteID": refund.remote_id,
              "Amount": f"{Decimal(refund.amount_grosz) / 100:.2f}", "Currency": "PLN"}
    fields["Hash"] = payment_hash(fields.values(), config)
    root = safe_xml(post_xml(config, "/settlementapi/transactionRefund", fields))
    if (root.tag != "transactionRefund" or [node.tag for node in root] != ["serviceID", "messageID", "hash"]
            or any(len(node) for node in root) or root.findtext("serviceID") != config["service"]
            or root.findtext("messageID") != refund.id
            or not signature_matches(root.findtext("hash"), [config["service"], refund.id], config)):
        raise HTTPException(502, "Autopay nie potwierdził przyjęcia zwrotu. Nie zlecaj kolejnego zwrotu; ponów tę samą operację.")
    refund.status = "accepted"
    refund.updated_at = datetime.now(timezone.utc).isoformat()
    db.commit()


def refresh_refund(order, db, config):
    check_config(order, config)
    refund = db.query(PremiumRefund).filter_by(order_id=order.id).order_by(PremiumRefund.created_at.desc()).first()
    if not refund:
        raise HTTPException(404, "Nie zlecono zwrotu tego zamówienia.")
    fields = {"serviceId": int(config["service"]), "messageId": refund.id, "method": "TRANSACTION_REFUND"}
    fields["hash"] = payment_hash(fields.values(), config)
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
    acquire_payment_limit_lock(db)
    refund = db.query(PremiumRefund).filter_by(id=refund.id).populate_existing().with_for_update().one()
    if refund.status != "done":
        refund.provider_status = provider_status
        refund.provider_remote_id = str(result.get("remoteOutId") or "")[:100]
        refund.updated_at = datetime.now(timezone.utc).isoformat()
        refund.status = "done" if provider_status == "DONE" else "failed" if provider_status.startswith("CANCELED_") else "accepted"
    if refund.status == "done":
        # SessionLocal disables autoflush. Include this newly confirmed refund
        # in the aggregate before deciding whether the order is fully refunded.
        db.flush()
        order = db.query(PremiumOrder).filter_by(id=order.id).populate_existing().with_for_update().one()
        received = db.query(func.coalesce(func.sum(AutopayReceipt.amount_grosz), 0)).filter(
            AutopayReceipt.order_reference == order.id, AutopayReceipt.environment == order.environment).scalar()
        returned = db.query(func.coalesce(func.sum(PremiumRefund.amount_grosz), 0)).filter(
            PremiumRefund.order_id == order.id, PremiumRefund.status == "done").scalar()
        if int(returned) >= int(received):
            from premium_access import revoke_fully_refunded_order
            revoke_fully_refunded_order(order, db)
    db.commit()


def refunds_status(order, db):
    return [{"id": row.id, "status": row.status, "amount": f"{Decimal(row.amount_grosz) / 100:.2f}",
             "provider_status": row.provider_status} for row in db.query(PremiumRefund).filter_by(order_id=order.id).order_by(PremiumRefund.created_at).all()]
