"""Autopay preparation: sandbox only. Production payments are intentionally unavailable."""

import base64
import binascii
import hashlib
import hmac
import json
import os
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Literal
from urllib.parse import parse_qs, urlparse
from uuid import uuid4
from xml.etree.ElementTree import Element, SubElement, tostring

from defusedxml.ElementTree import fromstring
from defusedxml.common import DefusedXmlException
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field

from models import PremiumOrder

TERMS_VERSION = "2026-10-25"
ITN_FIELDS = (
    "orderID", "remoteID", "amount", "currency", "gatewayID",
    "paymentDate", "paymentStatus", "paymentStatusDetails",
    "addressIP", "customerNumber", "title", "customerData",
)
CUSTOMER_FIELDS = (
    "fName", "lName", "streetName", "streetHouseNo", "streetStaircaseNo",
    "streetPremiseNo", "postalCode", "city", "nrb", "senderData",
)


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


def sandbox_config():
    # No production host or production credentials are accepted in this release.
    mode = os.getenv("AUTOPAY_MODE", "disabled").strip()
    service = os.getenv("AUTOPAY_SANDBOX_SERVICE_ID", "").strip()
    key = os.getenv("AUTOPAY_SANDBOX_SHARED_KEY", "").strip()
    gateway = os.getenv("AUTOPAY_SANDBOX_GATEWAY_URL", "").strip()
    algorithm = os.getenv("AUTOPAY_SANDBOX_HASH_ALGORITHM", "sha256").strip().lower()
    parsed = urlparse(gateway)
    valid = (
        mode == "sandbox" and re.fullmatch(r"[0-9]{1,10}", service)
        and key and parsed.scheme == "https" and parsed.netloc == "testpay.autopay.eu"
        and parsed.path not in ("", "/") and not parsed.query and not parsed.fragment
        and algorithm in ("sha256", "sha512")
    )
    return {"ready": bool(valid), "service": service, "key": key,
            "gateway": gateway, "algorithm": algorithm}


def payment_hash(values, config):
    payload = "|".join([str(v) for v in values if v not in (None, "")] + [config["key"]])
    return hashlib.new(config["algorithm"], payload.encode("utf-8")).hexdigest()


class CheckoutData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    package: Literal["shooter", "organizer"]
    period: Literal["monthly", "yearly"]
    expected_price: str = Field(max_length=20)
    terms_version: str = Field(max_length=30)
    terms_accepted: bool


def create_sandbox_order(data, user, db, get_prices, is_admin):
    config = sandbox_config()
    if not config["ready"]:
        raise HTTPException(503, "Sprzedaż Premium oczekuje na zatwierdzenie Autopay. Płatności są wyłączone.")
    if not user.is_active or not is_admin(user):
        raise HTTPException(403, "Testy Autopay są dostępne wyłącznie dla aktywnego administratora.")
    if not data.terms_accepted or data.terms_version != TERMS_VERSION:
        raise HTTPException(400, "Zaakceptuj aktualny Regulamin Premium.")
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
    order = PremiumOrder(
        id=uuid4().hex, user_id=user.id, package=data.package, period=data.period,
        amount=amount_text, currency="PLN", environment="sandbox", service_id=config["service"],
        status="pending", created_at=datetime.now(timezone.utc).isoformat(),
        terms_version=TERMS_VERSION, terms_accepted_at=datetime.now(timezone.utc).isoformat(),
        offer_snapshot=json.dumps(package, ensure_ascii=False),
    )
    db.add(order)
    db.commit()
    fields = {"ServiceID": config["service"], "OrderID": order.id, "Amount": order.amount,
              "Currency": order.currency, "CustomerEmail": user.email}
    fields["Hash"] = payment_hash(fields.values(), config)
    return {"order_id": order.id, "environment": "sandbox", "gateway_url": config["gateway"], "fields": fields}


def process_itn(xml, db, config):
    try:
        root = fromstring(xml, forbid_dtd=True)
    except (DefusedXmlException, ValueError, SyntaxError):
        raise HTTPException(400, "Niepoprawny XML ITN.")
    if root.tag != "transactionList" or [n.tag for n in root] != ["serviceID", "transactions", "hash"]:
        raise HTTPException(400, "Nieobsługiwany format ITN.")
    service = root.findtext("serviceID", "")
    transactions = list(root.find("transactions"))
    if service != config["service"] or not transactions or len(transactions) > 50:
        raise HTTPException(400, "Niepoprawny serwis lub lista transakcji.")
    values = [service]
    for transaction in transactions:
        tags = [n.tag for n in transaction]
        if (transaction.tag != "transaction" or len(tags) != len(set(tags))
                or tags != [f for f in ITN_FIELDS if f in tags]
                or any(len(n) for n in transaction if n.tag != "customerData")
                or not all(transaction.findtext(f) for f in (
                    "orderID", "remoteID", "amount", "currency", "paymentDate", "paymentStatus"))):
            raise HTTPException(400, "Nieobsługiwane pola ITN.")
        for node in transaction:
            if node.tag == "customerData":
                customer_tags = [n.tag for n in node]
                if (len(customer_tags) != len(set(customer_tags))
                        or customer_tags != [f for f in CUSTOMER_FIELDS if f in customer_tags]
                        or any(len(n) for n in node)):
                    raise HTTPException(400, "Nieobsługiwane pola customerData w ITN.")
                values.extend(n.text for n in node)
            else:
                values.append(node.text)
    signature = root.findtext("hash", "")
    if (not re.fullmatch(r"[0-9a-fA-F]{64}|[0-9a-fA-F]{128}", signature)
            or not hmac.compare_digest(payment_hash(values, config), signature.lower())):
        raise HTTPException(400, "Niepoprawny podpis ITN.")
    confirmations = []
    for transaction in transactions:
        order_id = transaction.findtext("orderID")
        order = db.query(PremiumOrder).filter_by(id=order_id).with_for_update().first()
        status = transaction.findtext("paymentStatus")
        valid = bool(
            order and order.environment == "sandbox" and order.service_id == service
            and order.amount == transaction.findtext("amount")
            and order.currency == transaction.findtext("currency")
            and status in ("SUCCESS", "PENDING", "FAILURE")
        )
        if valid and order.status != "paid":
            order.status = {"SUCCESS": "paid", "PENDING": "pending", "FAILURE": "failed"}[status]
            order.remote_id = transaction.findtext("remoteID")
            if status == "SUCCESS":
                order.paid_at = datetime.now(timezone.utc).isoformat()
            # Sandbox transactions never grant or extend real Premium rights.
        confirmations.append((order_id, "CONFIRMED" if valid else "NOTCONFIRMED"))
    db.commit()
    reply = Element("confirmationList")
    SubElement(reply, "serviceID").text = service
    items = SubElement(reply, "transactionsConfirmations")
    for order_id, confirmation in confirmations:
        item = SubElement(items, "transactionConfirmed")
        SubElement(item, "orderID").text = order_id
        SubElement(item, "confirmation").text = confirmation
    SubElement(reply, "hash").text = payment_hash([service] + [v for pair in confirmations for v in pair], config)
    return tostring(reply, encoding="utf-8", xml_declaration=True)


def build_premium_router(get_db, get_current_user, get_prices, is_admin):
    router = APIRouter(prefix="/premium", tags=["Premium"])

    @router.get("/commerce")
    def commerce():
        return {"sales_enabled": False, "verification_status": "pending",
                "sandbox_ready": sandbox_config()["ready"], "seller": seller_details(),
                "terms_version": TERMS_VERSION}

    @router.post("/checkout")
    def checkout(data: CheckoutData, user=Depends(get_current_user), db=Depends(get_db)):
        return create_sandbox_order(data, user, db, get_prices, is_admin)

    @router.get("/orders/{order_id}")
    def order_status(order_id: str, user=Depends(get_current_user), db=Depends(get_db)):
        order = db.query(PremiumOrder).filter_by(id=order_id, user_id=user.id).first()
        if not order:
            raise HTTPException(404, "Nie znaleziono zamówienia.")
        return {k: getattr(order, k) for k in (
            "id", "package", "period", "amount", "currency", "status", "environment", "created_at", "paid_at")}

    @router.post("/autopay/itn")
    async def itn(request: Request, db=Depends(get_db)):
        config = sandbox_config()
        if not config["ready"]:
            raise HTTPException(503, "Odbiór ITN jest wyłączony.")
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
        return Response(process_itn(xml, db, config), media_type="application/xml")

    return router
