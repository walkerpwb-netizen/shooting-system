"""Premium package rules shared by access checks and payment fulfillment."""

from calendar import monthrange
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from models import Competition, PremiumMailOutbox, PremiumOrder, User

PREMIUM_TIMEZONE = ZoneInfo("Europe/Warsaw")


def parse_premium_datetime(value):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except (ValueError, TypeError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=PREMIUM_TIMEZONE)
    return parsed.astimezone(PREMIUM_TIMEZONE)


def included_premium_packages(package, period):
    if package == "organizer" and period == "yearly":
        return ["organizer", "shooter"]
    if package == "shooter" and period in ("monthly", "yearly"):
        return ["shooter"]
    # organizer/monthly is the legacy key for one additional publication.
    return []


def effective_premium_until(user, package="shooter"):
    if user is None:
        return None
    fields = ["premium_until", "premium_organizer_paid_until"]
    if package == "shooter":
        fields.append("premium_shooter_paid_until")
    elif package != "organizer":
        raise ValueError("Unknown Premium package")
    dates = [parse_premium_datetime(getattr(user, field, None)) for field in fields]
    return max((date for date in dates if date is not None), default=None)


def effective_premium_until_iso(user, package="shooter"):
    expiration = effective_premium_until(user, package)
    return expiration.isoformat() if expiration else ""


def add_premium_period(start, period):
    months = 12 if period == "yearly" else 1
    year, month_index = divmod(start.year * 12 + start.month - 1 + months, 12)
    month = month_index + 1
    return start.replace(year=year, month=month, day=min(start.day, monthrange(year, month)[1]))


def apply_paid_premium_order(order, db):
    """Apply a verified production order in its caller's transaction.

    Autopay production remains disabled in this release. Sandbox notifications
    call this same function but can never change real account entitlements.
    The production ITN adapter must authenticate and validate the payment first.
    """
    if order.environment != "production" or order.status != "paid" or order.refunded_at:
        return False
    # The application's SessionLocal disables autoflush. Persist a caller's
    # just-verified paid status before refreshing the row under its lock.
    db.flush()
    order = db.query(PremiumOrder).filter_by(id=order.id).populate_existing().with_for_update().one()
    if order.environment != "production" or order.status != "paid" or order.entitlements_applied_at:
        return False
    scheduled = parse_premium_datetime(order.service_starts_at)
    if scheduled and datetime.now(PREMIUM_TIMEZONE) < scheduled:
        return False
    if order.contract_snapshot and not db.query(PremiumMailOutbox.id).filter(
            PremiumMailOutbox.order_id == order.id, PremiumMailOutbox.sent_at.is_not(None)).first():
        return False
    if order.package == "organizer" and order.period == "monthly":
        event = db.get(Competition, order.competition_id) if order.competition_id else None
        user = db.get(User, order.user_id) if order.user_id else None
        if not event or not user or event.created_by != user.email:
            return False
        order.publication_granted_at = datetime.now(timezone.utc).isoformat()
        order.entitlements_applied_at = order.publication_granted_at
        return True
    if not included_premium_packages(order.package, order.period):
        return False
    paid_at = parse_premium_datetime(order.paid_at)
    if paid_at is None:
        raise ValueError("A paid Premium order must have a payment timestamp")
    user = db.query(User).filter_by(id=order.user_id).populate_existing().with_for_update().first()
    if user is None:
        return False
    current_end = effective_premium_until(user, order.package)
    requested_start = parse_premium_datetime(order.service_starts_at) or paid_at
    extension_start = max(paid_at, requested_start, current_end) if current_end else max(paid_at, requested_start)
    new_end = add_premium_period(extension_start, order.period)
    field = "premium_organizer_paid_until" if order.package == "organizer" else "premium_shooter_paid_until"
    setattr(user, field, new_end.isoformat())
    # Shooter access automatically includes the organizer's annual paid expiry.
    # Its independently purchased (possibly longer) expiry is never overwritten.
    order.entitlement_starts_at = extension_start.isoformat()
    order.entitlement_ends_at = new_end.isoformat()
    order.entitlements_applied_at = datetime.now(timezone.utc).isoformat()
    return True


def has_paid_publication(user, competition, db):
    return db.query(PremiumOrder.id).filter(
        PremiumOrder.competition_id == competition.id, PremiumOrder.user_id == user.id,
        PremiumOrder.package == "organizer", PremiumOrder.period == "monthly", PremiumOrder.environment == "production",
        PremiumOrder.status == "paid", PremiumOrder.publication_granted_at.is_not(None),
        PremiumOrder.refunded_at.is_(None),
    ).first() is not None


def activate_due_premium_orders(user, db):
    for order in db.query(PremiumOrder).filter_by(user_id=user.id, environment="production", status="paid").filter(
            PremiumOrder.entitlements_applied_at.is_(None)).order_by(PremiumOrder.created_at, PremiumOrder.id).all():
        apply_paid_premium_order(order, db)


def revoke_fully_refunded_order(order, db):
    if order.refunded_at:
        return
    order.refunded_at = datetime.now(timezone.utc).isoformat()
    order.publication_granted_at = None
    if order.environment != "production" or not order.user_id:
        return
    user = db.query(User).filter_by(id=order.user_id).populate_existing().with_for_update().first()
    if not user:
        return
    field = "premium_organizer_paid_until" if order.package == "organizer" else "premium_shooter_paid_until"
    others = db.query(PremiumOrder).filter(PremiumOrder.user_id == user.id, PremiumOrder.environment == "production",
        PremiumOrder.status == "paid", PremiumOrder.refunded_at.is_(None), PremiumOrder.id != order.id,
        PremiumOrder.package == order.package, PremiumOrder.entitlements_applied_at.is_not(None)).all()
    dates = [parse_premium_datetime(row.entitlement_ends_at) for row in others]
    remaining = max((date for date in dates if date), default=None)
    setattr(user, field, remaining.isoformat() if remaining else None)
