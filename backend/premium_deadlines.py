"""The ordinary consumer withdrawal window, in Polish calendar days."""
from datetime import date, datetime, time, timedelta

from premium_access import PREMIUM_TIMEZONE, parse_premium_datetime


def _polish_holidays(year):
    # Gregorian Easter (Meeus/Jones/Butcher); Pentecost and Corpus Christi move.
    a, b, c = year % 19, year // 100, year % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    easter = date(year, (h + l - 7 * m + 114) // 31, (h + l - 7 * m + 114) % 31 + 1)
    days = {(1, 1), (1, 6), (5, 1), (5, 3), (8, 15), (11, 1), (11, 11), (12, 25), (12, 26)}
    if year >= 2025:
        days.add((12, 24))
    return {date(year, month, day) for month, day in days} | {easter, easter + timedelta(days=1), easter + timedelta(days=49), easter + timedelta(days=60)}


def withdrawal_deadline(order):
    paid = parse_premium_datetime(order.paid_at)
    if not paid:
        return None
    last_day = paid.date() + timedelta(days=14)
    while last_day.weekday() >= 5 or last_day in _polish_holidays(last_day.year):
        last_day += timedelta(days=1)
    # Exclusive boundary: the consumer has the whole final day, also across DST.
    return datetime.combine(last_day + timedelta(days=1), time.min, tzinfo=PREMIUM_TIMEZONE)
