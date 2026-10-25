"""Server-side brake for new checkouts. Never reject an already received payment."""

from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import exists, func, text

from models import AutopayReceipt, PremiumOrder

WARSAW = ZoneInfo("Europe/Warsaw")
LIMIT_SOURCE = "https://podatki.gov.pl/poradniki-i-informatory/dzialalnosc-nierejestrowana"
# Verified 2026 rules; an unconfigured year must fail closed.
QUARTER_LIMITS_GROSZ = {2026: 1081350}
PAYMENT_STOP_PERCENT = 95
PAYMENT_MAINTENANCE_MESSAGE = "Trwają prace serwisowe. Wpłata jest w tym momencie niedostępna."


def money(grosz):
    return f"{Decimal(grosz) / 100:.2f}"


def current_time():
    return datetime.now(WARSAW)


def acquire_payment_limit_lock(db):
    # One transaction lock shared by checkout creation and receipt recording.
    # SQLite is only used in sequential unit tests; production uses PostgreSQL.
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(174263, 95)"))


def payment_limit_state(db, now=None):
    local = (now or current_time()).astimezone(WARSAW)
    year, quarter = local.year, (local.month - 1) // 3 + 1
    start = date(year, (quarter - 1) * 3 + 1, 1)
    end = date(year + 1, 1, 1) if quarter == 4 else date(year, quarter * 3 + 1, 1)
    received = int(db.query(func.coalesce(func.sum(AutopayReceipt.amount_grosz), 0)).filter(
        AutopayReceipt.environment == "production", AutopayReceipt.currency == "PLN",
        AutopayReceipt.paid_on >= start, AutopayReceipt.paid_on < end,
    ).scalar())
    # A previously issued gateway link may still be paid. Keep its amount reserved,
    # including failed attempts and links from earlier quarters, until a receipt exists.
    # There is no timed release without confirmed cancellation by the provider.
    pending_amounts = db.query(PremiumOrder.amount).filter(
        PremiumOrder.environment == "production", PremiumOrder.currency == "PLN",
        ~exists().where(AutopayReceipt.order_reference == PremiumOrder.id,
                        AutopayReceipt.environment == "production"),
    ).all()
    reserved = sum(int(Decimal(row[0]) * 100) for row in pending_amounts)
    limit = QUARTER_LIMITS_GROSZ.get(year)
    # First whole grosz that reaches or exceeds 95%; 2026: 10 272,83 zł.
    stop_at = (limit * PAYMENT_STOP_PERCENT + 99) // 100 if limit is not None else None
    committed = received + reserved
    return {
        "year": year, "quarter": quarter, "percent": PAYMENT_STOP_PERCENT,
        "limit": money(limit) if limit is not None else None,
        "stop_at": money(stop_at) if stop_at is not None else None,
        "received": money(received), "reserved": money(reserved), "committed": money(committed),
        "remaining": money(max(0, stop_at - 1 - committed)) if stop_at is not None else None,
        "blocked": stop_at is None or committed >= stop_at - 1,
        "message": PAYMENT_MAINTENANCE_MESSAGE,
    }


def ensure_payment_capacity(db, amount_grosz, now=None):
    """Call before issuing a gateway link, in the SAME transaction as saving its order.

    Any future production adapter must preserve this transaction boundary. Production
    order rows reserve capacity until a verified receipt replaces the reservation.
    """
    acquire_payment_limit_lock(db)
    state = payment_limit_state(db, now)
    if state["blocked"] or amount_grosz > int(Decimal(state["remaining"]) * 100):
        raise HTTPException(503, PAYMENT_MAINTENANCE_MESSAGE, headers={"Cache-Control": "no-store"})
    return state
