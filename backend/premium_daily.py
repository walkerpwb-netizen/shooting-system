"""Public daily Premium offer; purchasing requires an active registered account."""

import re
from decimal import Decimal

from fastapi import HTTPException

PRICE_PER_DAY = "1.00"
MINIMUM_AMOUNT = "10.00"
MAXIMUM_AMOUNT = "999999.00"


def require_daily_purchase_access(user):
    if user is None or not user.is_active:
        raise HTTPException(403, "Aktywuj konto przed zakupem Premium.")


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
