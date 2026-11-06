"""Premium package rules shared by access checks and payment fulfillment."""

from calendar import monthrange
from datetime import datetime, timedelta, timezone
import json
from zoneinfo import ZoneInfo

from sqlalchemy.orm import object_session

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


def pending_paid_premium_orders(db, user_ids):
    """Read scheduled purchases once for a profile or an entire admin list."""
    grouped = {}
    if not user_ids:
        return grouped
    for order in db.query(PremiumOrder).filter(
        PremiumOrder.user_id.in_(user_ids), PremiumOrder.environment == "production",
        PremiumOrder.status == "paid", PremiumOrder.refunded_at.is_(None), PremiumOrder.refund_requested_at.is_(None),
        PremiumOrder.entitlements_applied_at.is_(None), PremiumOrder.service_ends_at.is_not(None),
    ).all():
        grouped.setdefault(order.user_id, []).append(order)
    return grouped


def premium_display_fields(user, orders=None, now=None):
    """Show continuous paid renewals without granting access before their start.

    Authorization and fulfillment continue using effective_premium_until. In
    particular, displaying January must not make fulfillment add February.
    """
    current_time = now or datetime.now(PREMIUM_TIMEZONE)
    if orders is None:
        db = object_session(user)
        orders = pending_paid_premium_orders(db, [user.id]).get(user.id, []) if db else []
    result = {}
    for package, prefix in (("shooter", "premium"), ("organizer", "premium_organizer")):
        active_end = effective_premium_until(user, package)
        coverage_end = active_end
        periods = []
        for order in orders:
            if (order.user_id != user.id or order.environment != "production" or order.status != "paid"
                    or order.refunded_at or order.refund_requested_at or order.entitlements_applied_at
                    or package not in included_premium_packages(order.package, order.period)):
                continue
            start = parse_premium_datetime(order.service_starts_at)
            end = parse_premium_datetime(order.service_ends_at)
            if start and end and end > start:
                periods.append((start, end))
        periods.sort()
        # Keep continuous renewals visible even if the owner has not logged in
        # since their start. A purchase after a gap cannot bridge that gap.
        if coverage_end:
            for start, end in periods:
                if start <= coverage_end:
                    coverage_end = max(coverage_end, end)
        next_period = next((period for period in periods if period[1] > current_time), (None, None))
        result[f"{prefix}_coverage_until"] = coverage_end.isoformat() if coverage_end else ""
        result[f"{prefix}_scheduled_starts_at"] = next_period[0].isoformat() if next_period[0] else ""
        result[f"{prefix}_scheduled_ends_at"] = next_period[1].isoformat() if next_period[1] else ""
    return result


def add_premium_period(start, period):
    months = 12 if period == "yearly" else 1
    year, month_index = divmod(start.year * 12 + start.month - 1 + months, 12)
    month = month_index + 1
    return start.replace(year=year, month=month, day=min(start.day, monthrange(year, month)[1]))


def apply_paid_premium_order(order, db):
    """Apply a verified production order in its caller's transaction.

    The production ITN adapter authenticates and validates the payment first.
    """
    if order.environment != "production" or order.status != "paid" or order.refunded_at or order.refund_requested_at:
        return False
    # The application's SessionLocal disables autoflush. Persist a caller's
    # just-verified paid status before refreshing the row under its lock.
    db.flush()
    order = db.query(PremiumOrder).filter_by(id=order.id).populate_existing().with_for_update().one()
    if order.environment != "production" or order.status != "paid" or order.refunded_at or order.refund_requested_at or order.entitlements_applied_at:
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
        PremiumOrder.refunded_at.is_(None), PremiumOrder.refund_requested_at.is_(None),
    ).first() is not None


def activate_due_premium_orders(user, db):
    orders = db.query(PremiumOrder).filter_by(user_id=user.id, environment="production", status="paid").filter(
            PremiumOrder.entitlements_applied_at.is_(None), PremiumOrder.refund_requested_at.is_(None), PremiumOrder.refunded_at.is_(None)).all()
    orders.sort(key=lambda order: (parse_premium_datetime(order.service_starts_at) or parse_premium_datetime(order.paid_at), order.created_at, order.id))
    for order in orders:
        apply_paid_premium_order(order, db)


def revoke_fully_refunded_order(order, db):
    if order.refunded_at:
        return
    order.refunded_at = datetime.now(timezone.utc).isoformat()
    if not order.refund_requested_at:
        revoke_order_entitlements(order, db)


def revoke_order_entitlements(order, db):
    """Withdraw only this purchase; the refund itself may still be unsettled."""
    order.publication_granted_at = None
    if not included_premium_packages(order.package, order.period):
        return
    if order.environment != "production" or not order.user_id:
        return
    # Lock dependent orders before the user, matching fulfillment's order -> user
    # lock order. The caller already holds the withdrawal order and payment lock.
    db.flush()
    others = db.query(PremiumOrder).filter(PremiumOrder.user_id == order.user_id, PremiumOrder.environment == "production",
        PremiumOrder.status == "paid", PremiumOrder.refunded_at.is_(None), PremiumOrder.refund_requested_at.is_(None),
        PremiumOrder.id != order.id).order_by(PremiumOrder.id).populate_existing().with_for_update().all()
    user = db.query(User).filter_by(id=order.user_id).populate_existing().with_for_update().first()
    if not user:
        return
    if order.entitlements_applied_at:
        field = "premium_organizer_paid_until" if order.package == "organizer" else "premium_shooter_paid_until"
        dates = [parse_premium_datetime(row.entitlement_ends_at) for row in others
                 if row.package == order.package and row.entitlements_applied_at]
        remaining = max((date for date in dates if date), default=None)
        setattr(user, field, remaining.isoformat() if remaining else None)
    reflow_pending_renewals(order, user, others)


def reflow_pending_renewals(withdrawn, user, orders):
    """Close only gaps caused by this withdrawal, keeping paid calendar periods.

    Original contracts/confirmation emails and receipt/refund records are never
    rewritten. The live schedule has its own append-only adjustment history.
    """
    removed_start = parse_premium_datetime(withdrawn.entitlement_starts_at or withdrawn.service_starts_at)
    removed_end = parse_premium_datetime(withdrawn.entitlement_ends_at or withdrawn.service_ends_at)
    if not removed_start or not removed_end:
        return
    now = datetime.now(PREMIUM_TIMEZONE)
    changed_ends = {package: {removed_end: removed_start}
                    for package in included_premium_packages(withdrawn.package, withdrawn.period)}
    available = {package: effective_premium_until(user, package) for package in ("shooter", "organizer")}
    pending = [row for row in orders if not row.entitlements_applied_at
               and included_premium_packages(row.package, row.period)
               and parse_premium_datetime(row.service_starts_at) and parse_premium_datetime(row.service_ends_at)]
    pending.sort(key=lambda row: (parse_premium_datetime(row.service_starts_at), row.created_at, row.id))
    for row in pending:
        start, end = parse_premium_datetime(row.service_starts_at), parse_premium_datetime(row.service_ends_at)
        packages = included_premium_packages(row.package, row.period)
        replacement = changed_ends.get(row.package, {}).get(start)
        paid = parse_premium_datetime(row.paid_at)
        if replacement and paid:
            earliest = paid if row.early_start_requested else paid + timedelta(days=14)
            new_start = max(date for date in (replacement, earliest, now, available[row.package]) if date)
            if new_start < start:
                new_end = add_premium_period(new_start, row.period)
                history = json.loads(row.service_schedule_history or "[]")
                history.append({"reason": "earlier_purchase_withdrawn", "withdrawn_order_id": withdrawn.id,
                    "changed_at": now.isoformat(), "previous_starts_at": row.service_starts_at,
                    "previous_ends_at": row.service_ends_at, "starts_at": new_start.isoformat(), "ends_at": new_end.isoformat()})
                row.service_schedule_history = json.dumps(history, ensure_ascii=False)
                row.service_starts_at, row.service_ends_at = new_start.isoformat(), new_end.isoformat()
                for package in packages:
                    changed_ends.setdefault(package, {})[end] = new_end
                start, end = new_start, new_end
        for package in packages:
            available[package] = max(available[package], end) if available[package] else end
