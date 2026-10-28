"""Autopay checkout and verified notifications, isolated by environment."""

import base64
import binascii
import hashlib
import json
import os
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Literal
from urllib.parse import parse_qs
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field

from autopay_protocol import confirmation_xml, parse_payment_date, parse_transactions, payment_hash, signature_matches
from models import Competition, PremiumMailOutbox, PremiumNotification, PremiumOrder
from premium_access import apply_paid_premium_order, included_premium_packages
from payment_reports import record_autopay_receipt
from payment_limits import acquire_payment_limit_lock, ensure_payment_capacity, payment_limit_state
from autopay_config import read_configuration, production_allowed, valid_environment
from premium_contract import TERMS_VERSION, contract_snapshot, make_quote, terms_sections, verify_quote
from premium_mail import deliver_pending_confirmations, queue_confirmation


def seller_details():
    seller = {
        "name": os.getenv("PREMIUM_SELLER_NAME", "Piotr Bronny").strip(),
        "address": os.getenv("PREMIUM_SELLER_ADDRESS", "ul. Kolejowa 125, 34-400 Nowy Targ").strip(),
        "email": os.getenv("PREMIUM_SELLER_EMAIL", "info@system-strzelecki.pl").strip(),
        "phone": os.getenv("PREMIUM_SELLER_PHONE", "+48 509 450 093").strip(),
        "nip": os.getenv("PREMIUM_SELLER_NIP", "").strip(),
        "business_type": "Działalność nierejestrowana",
    }
    return {**seller, "complete": all(seller[k] for k in ("name", "address", "email", "phone"))}


def production_config():
    try:
        value = read_configuration()
        section = value["production"]
        return {"ready": value["mode"] == "production" and production_allowed(value),
                "service": section["service_id"], "key": section["shared_key"], "gateway": section["gateway_url"],
                "algorithm": section["algorithm"], "environment": "production",
                "provider_timezone": value.get("provider_timezone", "CET"), "validity_minutes": value.get("validity_minutes", 15)}
    except HTTPException:
        return {"ready": False}


def notification_config():
    environment = "production"
    value = read_configuration()
    section = value[environment]
    if not valid_environment(environment, section):
        raise HTTPException(503, "Brak kompletnych danych tego środowiska Autopay.")
    return {"service": section["service_id"], "key": section["shared_key"], "gateway": section["gateway_url"],
            "algorithm": section["algorithm"], "environment": environment,
            "provider_timezone": value.get("provider_timezone", "CET")}




class CheckoutData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    package: Literal["shooter", "organizer"]
    period: Literal["monthly", "yearly"]
    expected_price: str = Field(max_length=20)
    terms_version: str = Field(max_length=30)
    terms_accepted: bool
    early_start_requested: bool = False
    competition_id: int | None = Field(default=None, gt=0)
    quote_token: str | None = Field(default=None, max_length=6000)


def checkout_event(data, user, db):
    if data.package != "organizer" or data.period != "monthly":
        if data.competition_id:
            raise HTTPException(400, "Ten pakiet nie wymaga wybrania wydarzenia.")
        return None
    if not data.competition_id:
        raise HTTPException(400, "Wybierz konkretne zawody lub szkolenie do dodatkowej publikacji.")
    event = db.query(Competition).filter_by(id=data.competition_id, created_by=user.email).first()
    if not event or event.status != "draft":
        raise HTTPException(400, "Wybierz własny szkic zawodów lub szkolenia.")
    from premium_access import has_paid_publication
    if has_paid_publication(user, event, db):
        raise HTTPException(409, "To wydarzenie ma już opłaconą dodatkową publikację.")
    return event


def current_amount(data, db, get_prices):
    package = get_prices(db)[data.package]
    try:
        amount = Decimal(package[f"{data.period}_price"])
        if not amount.is_finite() or amount <= 0 or amount > Decimal("999999.99"):
            raise InvalidOperation
        amount_text = f"{amount:.2f}"
    except (InvalidOperation, ValueError):
        raise HTTPException(400, "Pakiet nie ma poprawnej ceny. Skontaktuj się z administratorem.")
    if data.expected_price != amount_text:
        raise HTTPException(409, "Cena uległa zmianie. Odśwież stronę i sprawdź zamówienie.")
    return package, amount_text


def create_production_order(data, user, db, get_prices):
    config = production_config()
    if not config["ready"]:
        raise HTTPException(503, "Płatności są chwilowo niedostępne. Spróbuj ponownie później.")
    environment = config["environment"]
    if not user.is_active:
        raise HTTPException(403, "Aktywuj konto przed zakupem Premium.")
    if not data.quote_token:
        raise HTTPException(400, "Odśwież podsumowanie i zaakceptuj aktualne warunki zakupu.")
    if not data.terms_accepted or data.terms_version != TERMS_VERSION:
        raise HTTPException(400, "Zaakceptuj aktualny Regulamin Premium.")
    package, amount_text = current_amount(data, db, get_prices)
    event = checkout_event(data, user, db)
    quote = verify_quote(data.quote_token, data, user, amount_text)
    acquire_payment_limit_lock(db)
    existing = db.query(PremiumOrder).filter_by(request_id=quote["id"]).first()
    if existing:
        if existing.user_id != user.id or existing.environment != environment:
            raise HTTPException(409, "Nieprawidłowy identyfikator zamówienia.")
        if existing.provider_closed_at or existing.status == "paid" or datetime.fromisoformat(existing.gateway_valid_until) <= datetime.now(timezone.utc):
            raise HTTPException(409, "Zamówienie jest zamknięte lub wygasło. Sprawdź jego status.")
        return gateway_response(existing, user, config)
    ensure_payment_capacity(db, int(Decimal(amount_text) * 100))
    valid_until = datetime.now(timezone.utc) + timedelta(minutes=config.get("validity_minutes", 15))
    order = PremiumOrder(
        id=uuid4().hex, user_id=user.id, package=data.package, period=data.period,
        amount=amount_text, currency="PLN", environment=environment, service_id=config["service"],
        status="pending", created_at=datetime.now(timezone.utc).isoformat(),
        terms_version=TERMS_VERSION, terms_accepted_at=datetime.now(timezone.utc).isoformat(),
        competition_id=data.competition_id, early_start_requested=int(data.early_start_requested),
        request_id=quote["id"], service_starts_at=quote["service_starts_at"], service_ends_at=quote["service_ends_at"],
        gateway_valid_until=valid_until.isoformat(),
        contract_snapshot=contract_snapshot(quote, user, package, event),
        offer_snapshot=json.dumps({
            **package,
            "included_packages": included_premium_packages(data.package, data.period),
        }, ensure_ascii=False),
    )
    db.add(order)
    db.commit()
    return gateway_response(order, user, config)


def gateway_response(order, user, config):
    from autopay_protocol import provider_timezone
    validity = datetime.fromisoformat(order.gateway_valid_until).astimezone(provider_timezone(config.get("provider_timezone", "CET"))).strftime("%Y-%m-%d %H:%M:%S")
    fields = {"ServiceID": config["service"], "OrderID": order.id, "Amount": order.amount,
              "Currency": order.currency, "CustomerEmail": user.email, "ValidityTime": validity, "LinkValidityTime": validity}
    fields["Hash"] = payment_hash(fields.values(), config)
    return {"order_id": order.id, "environment": order.environment, "gateway_url": config["gateway"], "fields": fields}


def process_itn(xml, db, config, *, allow_batch=False):
    if config.get("environment", "production") != "production":
        raise HTTPException(503, "Nieobsługiwana konfiguracja płatności.")
    service, transactions, authentic = parse_transactions(xml, config, allow_batch=allow_batch)
    if not authentic:
        return confirmation_xml(service, [(tx.findtext("orderID"), "NOTCONFIRMED") for tx in transactions], config)
    acquire_payment_limit_lock(db)
    confirmations = []
    for transaction in transactions:
        order_id = transaction.findtext("orderID")
        order = db.query(PremiumOrder).filter_by(id=order_id).populate_existing().with_for_update().first()
        status = transaction.findtext("paymentStatus")
        valid = bool(order and order.environment == config.get("environment", "production") and order.service_id == service
                     and order.amount == transaction.findtext("amount") and order.currency == transaction.findtext("currency")
                     and status in ("SUCCESS", "PENDING", "FAILURE"))
        first_success = valid and status == "SUCCESS" and order.status != "paid"
        if valid and status == "SUCCESS":
            try:
                record_autopay_receipt(order, transaction, db, config.get("provider_timezone", "Europe/Warsaw"))
            except HTTPException:
                valid = False
        if valid and order.status != "paid":
            order.status = {"SUCCESS": "paid", "PENDING": "pending", "FAILURE": "failed"}[status]
            order.remote_id = transaction.findtext("remoteID")
            if status == "SUCCESS":
                order.paid_at = parse_payment_date(transaction.findtext("paymentDate"), config.get("provider_timezone", "Europe/Warsaw")).isoformat()
        if valid and status == "SUCCESS":
            if order.contract_snapshot:
                from premium_access import add_premium_period, parse_premium_datetime
                paid = parse_premium_datetime(order.paid_at)
                start = max(parse_premium_datetime(order.service_starts_at), paid if order.early_start_requested else paid + timedelta(days=14))
                if first_success and order.environment == "production" and not (order.package == "organizer" and order.period == "monthly"):
                    from models import User
                    from premium_access import effective_premium_until
                    from premium_contract import queued_access_until
                    owner = db.get(User, order.user_id)
                    if owner:
                        previous = [effective_premium_until(owner, order.package), queued_access_until(owner, order.package, db, order.id)]
                        start = max([start] + [end for end in previous if end])
                if not order.entitlements_applied_at:
                    order.service_starts_at = start.isoformat()
                    order.service_ends_at = None if order.package == "organizer" and order.period == "monthly" else add_premium_period(start, order.period).isoformat()
                queue_confirmation(order, db)
            apply_paid_premium_order(order, db)
        db.flush()
        result = "CONFIRMED" if valid else "NOTCONFIRMED"
        digest = hashlib.sha256(f"{config.get('environment', 'production')}|{order_id}|{transaction.findtext('remoteID')}|".encode() + xml).hexdigest()
        log = db.query(PremiumNotification).filter_by(digest=digest).first()
        stamp = datetime.now(timezone.utc).isoformat()
        if log:
            log.last_seen_at = stamp
            log.deliveries += 1
        else:
            db.add(PremiumNotification(digest=digest, environment=config.get("environment", "production"), service_id=service,
                order_reference=order_id, remote_id=transaction.findtext("remoteID"), payment_status=status,
                confirmation=result, first_seen_at=stamp, last_seen_at=stamp, deliveries=1))
        confirmations.append((order_id, result))
    db.commit()
    return confirmation_xml(service, confirmations, config)


def build_premium_router(get_db, get_current_user, get_prices, is_admin):
    def no_store(response: Response):
        response.headers["Cache-Control"] = "no-store"
    router = APIRouter(prefix="/premium", tags=["Premium"], dependencies=[Depends(no_store)])

    @router.get("/terms")
    def terms():
        return terms_sections()

    @router.get("/publication-events")
    def publication_events(user=Depends(get_current_user), db=Depends(get_db)):
        return [{"id": row.id, "name": row.name, "event_type": row.event_type} for row in db.query(Competition).filter_by(
            created_by=user.email, status="draft").order_by(Competition.id.desc()).all()]

    @router.post("/quote")
    def quote(data: CheckoutData, user=Depends(get_current_user), db=Depends(get_db)):
        if not user.is_active:
            raise HTTPException(403, "Aktywuj konto przed przygotowaniem zakupu.")
        _, amount = current_amount(data, db, get_prices)
        checkout_event(data, user, db)
        return make_quote(user, data.package, data.period, amount, data.early_start_requested, data.competition_id, seller_details(),
                          db=db)

    @router.get("/commerce")
    def commerce(response: Response, db=Depends(get_db)):
        response.headers["Cache-Control"] = "no-store"
        availability = payment_limit_state(db)
        return {"sales_enabled": production_config()["ready"], "verification_status": "managed_by_operator",
                "seller": seller_details(),
                "terms_version": TERMS_VERSION,
                "payments_temporarily_unavailable": availability["blocked"],
                "payment_unavailable_message": availability["message"]}

    @router.post("/checkout")
    def checkout(data: CheckoutData, user=Depends(get_current_user), db=Depends(get_db)):
        return create_production_order(data, user, db, get_prices)

    @router.get("/orders/{order_id}")
    def order_status(order_id: str, user=Depends(get_current_user), db=Depends(get_db)):
        order = db.query(PremiumOrder).filter_by(id=order_id, user_id=user.id, environment="production").first()
        if not order:
            raise HTTPException(404, "Nie znaleziono zamówienia.")
        from premium_refunds import refunds_status
        return {
            **{k: getattr(order, k) for k in (
                "id", "package", "period", "amount", "currency", "status", "environment", "created_at", "paid_at",
                "entitlement_starts_at", "entitlement_ends_at", "competition_id", "service_starts_at", "service_ends_at",
                "gateway_valid_until", "provider_closed_at", "refunded_at")},
            "included_packages": json.loads(order.offer_snapshot).get("included_packages", []),
            "confirmation_email": email_status(order, db),
            "refunds": refunds_status(order, db),
        }

    @router.post("/orders/{order_id}/verify-return")
    def verify_return(order_id: str, data: ReturnData, user=Depends(get_current_user), db=Depends(get_db)):
        order = db.query(PremiumOrder).filter_by(id=order_id, user_id=user.id, environment="production").first()
        if not order:
            raise HTTPException(404, "Nie znaleziono zamówienia.")
        config = notification_config()
        if data.service_id != order.service_id or not signature_matches(data.hash, [data.service_id, order.id], config):
            raise HTTPException(400, "Nieprawidłowy podpis powrotu z Autopay. Status płatności sprawdź na swoim koncie.")
        return {"verified": True}

    @router.post("/orders/{order_id}/check")
    def check_order(order_id: str, tasks: BackgroundTasks, user=Depends(get_current_user), db=Depends(get_db)):
        order = owned_order(order_id, user, db, is_admin)
        from autopay_api import refresh_order
        refresh_order(order, db, notification_config())
        schedule_confirmation(order.id, tasks, db)
        return order_status(order_id, user, db)

    @router.post("/orders/{order_id}/cancel")
    def cancel_order(order_id: str, user=Depends(get_current_user), db=Depends(get_db)):
        order = owned_order(order_id, user, db, is_admin)
        from autopay_api import cancel_unpaid_order
        cancel_unpaid_order(order, db, notification_config())
        return order_status(order_id, user, db)

    @router.post("/orders/{order_id}/resend-confirmation")
    def resend_confirmation(order_id: str, tasks: BackgroundTasks, user=Depends(get_current_user), db=Depends(get_db)):
        order = owned_order(order_id, user, db, is_admin)
        schedule_confirmation(order.id, tasks, db)
        return {"message": "Zlecono ponowienie niewysłanego potwierdzenia."}

    @router.post("/orders/{order_id}/refund")
    def refund_order(order_id: str, user=Depends(get_current_user), db=Depends(get_db)):
        order = owned_order(order_id, user, db, is_admin)
        if not is_admin(user):
            raise HTTPException(403, "Zlecenie zwrotu wymaga administratora.")
        from premium_refunds import request_refund
        request_refund(order, db, notification_config())
        return order_status(order_id, user, db)

    @router.post("/orders/{order_id}/refund-check")
    def check_refund(order_id: str, user=Depends(get_current_user), db=Depends(get_db)):
        order = owned_order(order_id, user, db, is_admin)
        from premium_refunds import refresh_refund
        refresh_refund(order, db, notification_config())
        return order_status(order_id, user, db)

    @router.post("/autopay/production/itn")
    async def itn(request: Request, tasks: BackgroundTasks, db=Depends(get_db)):
        config = notification_config()
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 65536:
                raise HTTPException(413, "Zbyt duży komunikat ITN.")
        if request.headers.get("content-type", "").split(";")[0].strip() != "application/x-www-form-urlencoded":
            raise HTTPException(415, "Wymagany formularz z polem transactions.")
        try:
            form = parse_qs(body.decode("ascii"), strict_parsing=True, max_num_fields=2)
            encoded = form["transactions"]
            if len(encoded) != 1:
                raise ValueError
            xml = base64.b64decode(encoded[0], validate=True)
        except (ValueError, KeyError, UnicodeError, binascii.Error):
            raise HTTPException(400, "Niepoprawny formularz ITN.")
        reply = process_itn(xml, db, config)
        _, transactions, authentic = parse_transactions(xml, config)
        if authentic:
            for transaction in transactions:
                if transaction.findtext("paymentStatus") == "SUCCESS":
                    schedule_confirmation(transaction.findtext("orderID"), tasks, db)
        return Response(reply, media_type="application/xml", headers={"Cache-Control": "no-store"})

    return router


class ReturnData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    service_id: str = Field(max_length=10)
    hash: str = Field(max_length=128)


def owned_order(order_id, user, db, is_admin):
    order = db.query(PremiumOrder).filter_by(id=order_id, user_id=user.id, environment="production").first()
    if not order:
        raise HTTPException(404, "Nie znaleziono zamówienia.")
    if not user.is_active:
        raise HTTPException(403, "Aktywuj konto przed obsługą zamówienia.")
    return order


def email_status(order, db):
    entry = db.query(PremiumMailOutbox).filter_by(order_id=order.id).first()
    return {"queued": bool(entry), "sent_at": entry.sent_at if entry else None, "error": entry.error if entry else None}


def schedule_confirmation(order_id, tasks, db):
    if db.query(PremiumMailOutbox.id).filter(PremiumMailOutbox.order_id == order_id, PremiumMailOutbox.sent_at.is_(None)).first():
        tasks.add_task(deliver_pending_confirmations, order_id)
