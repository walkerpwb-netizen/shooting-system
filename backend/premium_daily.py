"""Private daily Premium offer. Opening it publicly requires an explicit change."""

import re
from decimal import Decimal

from fastapi import HTTPException

PRICE_PER_DAY = "1.00"
MINIMUM_AMOUNT = "10.00"
MAXIMUM_AMOUNT = "999999.00"


def require_daily_offer_access(user):
    roles = (getattr(user, "roles", None) or getattr(user, "role", None) or "").split(",")
    if not user.is_active or "admin" not in [role.strip() for role in roles]:
        raise HTTPException(403, "Ta oferta nie jest jeszcze dostępna publicznie.")


def daily_purchase(amount):
    # Whole PLN only: no silently rounded prices or partial days.
    if not isinstance(amount, str) or not re.fullmatch(r"[1-9][0-9]{0,5}\.00", amount):
        raise HTTPException(400, "Podaj kwotę w pełnych złotych, minimum 10 zł.")
    value = Decimal(amount)
    if not Decimal(MINIMUM_AMOUNT) <= value <= Decimal(MAXIMUM_AMOUNT):
        raise HTTPException(400, "Podaj kwotę w pełnych złotych, minimum 10 zł.")
    return int(value / Decimal(PRICE_PER_DAY))


def daily_offer():
    return {"price_per_day": PRICE_PER_DAY, "minimum_amount": MINIMUM_AMOUNT,
            "maximum_amount": MAXIMUM_AMOUNT, "package": "shooter", "period": "daily"}
