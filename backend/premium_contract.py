"""Immutable offer/terms snapshots and short-lived signed checkout quotes."""

import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException

from config import settings
from premium_access import add_premium_period, effective_premium_until, parse_premium_datetime

TERMS_VERSION = "2026-10-26.2"
EARLY_START_TEXT = (
    "Żądam rozpoczęcia świadczenia usługi przed upływem 14 dni na odstąpienie od umowy. "
    "Przyjmuję do wiadomości, że przy odstąpieniu po rozpoczęciu usługi zapłacę za świadczenie "
    "spełnione do chwili odstąpienia, zgodnie z regulaminem. Samo rozpoczęcie nie pozbawia mnie prawa odstąpienia."
)


@lru_cache(maxsize=1)
def terms_sections():
    return json.loads(Path(__file__).with_name("premium_terms.json").read_text(encoding="utf-8"))


def now():
    return datetime.now(timezone.utc)


def _encode(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def queued_access_until(user, package, db, exclude_order=None):
    from models import PremiumOrder
    query = db.query(PremiumOrder).filter_by(user_id=user.id, environment="production", status="paid").filter(
        PremiumOrder.refunded_at.is_(None), PremiumOrder.service_ends_at.is_not(None))
    if exclude_order:
        query = query.filter(PremiumOrder.id != exclude_order)
    dates = [parse_premium_datetime(row.service_ends_at) for row in query.all()
             if row.package == package or (package == "shooter" and row.package == "organizer" and row.period == "yearly")]
    return max((date for date in dates if date), default=None)


def make_quote(user, package, period, amount, early_start, competition_id, seller, *, environment="sandbox", db=None):
    issued = now()
    start = issued if early_start else issued + timedelta(days=14)
    existing = effective_premium_until(user, package)
    if existing and not (package == "organizer" and period == "monthly"):
        start = max(start, existing)
    if db is not None and environment == "production" and not (package == "organizer" and period == "monthly"):
        queued = queued_access_until(user, package, db)
        if queued:
            start = max(start, queued)
    value = {"id": str(uuid4()), "user_id": user.id, "package": package, "period": period, "environment": environment,
             "amount": amount, "early_start_requested": bool(early_start), "competition_id": competition_id,
             "terms_version": TERMS_VERSION, "issued_at": issued.isoformat(),
             "expires_at": (issued + timedelta(minutes=15)).isoformat(), "service_starts_at": start.isoformat(),
             "existing_access_until": existing.isoformat() if existing and existing > issued else None,
             "renews_existing_access": bool(existing and existing > issued and not (package == "organizer" and period == "monthly")),
             "service_ends_at": None if package == "organizer" and period == "monthly" else add_premium_period(start, period).isoformat(),
             "seller": seller, "terms_digest": hashlib.sha256(json.dumps(terms_sections(), ensure_ascii=False).encode()).hexdigest()}
    encoded = _encode(json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode())
    signature = hmac.new(settings.secret_key.encode(), encoded.encode(), hashlib.sha256).digest()
    return {**value, "quote_token": encoded + "." + _encode(signature), "early_start_text": EARLY_START_TEXT}


def verify_quote(token, data, user, amount, *, environment="sandbox"):
    try:
        encoded, signature = token.split(".")
        expected = _encode(hmac.new(settings.secret_key.encode(), encoded.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(expected, signature):
            raise ValueError
        value = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
        if (value.get("environment") != environment or value["user_id"] != user.id or value["package"] != data.package or value["period"] != data.period
                or value["amount"] != amount or value["competition_id"] != data.competition_id
                or value["early_start_requested"] != data.early_start_requested or value["terms_version"] != TERMS_VERSION
                or datetime.fromisoformat(value["expires_at"]) <= now()
                or value["terms_digest"] != hashlib.sha256(json.dumps(terms_sections(), ensure_ascii=False).encode()).hexdigest()):
            raise ValueError
        return value
    except (ValueError, KeyError, TypeError, UnicodeError):
        raise HTTPException(409, "Podsumowanie wygasło lub uległo zmianie. Odśwież ofertę i sprawdź warunki zakupu.") from None


def contract_snapshot(quote, user, package, event=None, *, test_email_requested=False):
    return json.dumps({**{k: v for k, v in quote.items() if k != "quote_token"},
                       "email": user.email, "offer": package, "terms": terms_sections(),
                       "early_start_text": EARLY_START_TEXT if quote["early_start_requested"] else "Nie żądam wcześniejszego rozpoczęcia.",
                       "event": {"id": event.id, "name": event.name} if event else None,
                       "test_email_requested": test_email_requested}, ensure_ascii=False)


def contract_text(order):
    value = json.loads(order.contract_snapshot)
    seller = value["seller"]
    lines = ["TEST SANDBOX — NIE JEST UMOWĄ ODPŁATNĄ" if order.environment == "sandbox" else "Potwierdzenie zakupu Premium",
             f"Zamówienie: {order.id}", f"Usługa: {order.package} / {order.period}",
             f"Kwota: {order.amount} {order.currency}", f"Sprzedawca: {seller['name']}, {seller['address']}",
             f"Kontakt: {seller['email']}, {seller['phone']}", f"Forma: {seller['business_type']}",
             f"Płatność potwierdzona: {order.paid_at}", f"Początek: {order.service_starts_at}",
             f"Koniec: {order.service_ends_at or 'jednorazowa dodatkowa publikacja'}", value["early_start_text"],
             f"Regulamin Premium — wersja {value['terms_version']}"]
    if value.get("event"):
        lines.append(f"Wydarzenie: {value['event']['name']} (ID {value['event']['id']})")
    for section in value["terms"]:
        lines.extend(["", section["title"], *section["paragraphs"]])
    lines.extend(["", "Wzór odstąpienia: niniejszym informuję o odstąpieniu od umowy Premium.",
                  "Podaj numer zamówienia, datę zawarcia umowy, imię i nazwisko, adres, e-mail i datę oświadczenia.",
                  f"Wyślij do: {seller['email']} lub {seller['address']}."])
    return "\n".join(lines)
