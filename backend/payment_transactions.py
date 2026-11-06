"""Admin overview of every production checkout, including unpaid attempts."""

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import case, func, or_

from models import AutopayReceipt, PremiumNotification, PremiumOrder, PremiumRefund, User
from payment_reports import receipt_description
from premium_deadlines import withdrawal_deadline


TransactionStatus = Literal["started", "pending", "paid", "failed", "cancelled", "refund_pending", "refunded", "unknown"]
STATUS_LABELS = {
    "started": "Rozpoczęta", "pending": "Oczekująca", "paid": "Zakończona — opłacona",
    "failed": "Nieudana", "cancelled": "Anulowana", "refund_pending": "W trakcie zwrotu",
    "refunded": "Zwrot zrealizowany", "unknown": "Nieznany status",
}


def transaction_overview(db, *, status=None, search="", page=1, page_size=25):
    refund_pending = db.query(PremiumRefund.id).filter(
        PremiumRefund.order_id == PremiumOrder.id, PremiumRefund.environment == "production",
        PremiumRefund.status.in_(["requested", "accepted"]),
    ).exists()
    display_status = case(
        (PremiumOrder.refunded_at.is_not(None), "refunded"),
        ((PremiumOrder.status == "paid") & (refund_pending | PremiumOrder.refund_requested_at.is_not(None)), "refund_pending"),
        ((PremiumOrder.status == "pending") & PremiumOrder.remote_id.is_(None), "started"),
        (PremiumOrder.status.in_(["pending", "paid", "failed", "cancelled"]), PremiumOrder.status),
        else_="unknown",
    )
    query = db.query(PremiumOrder, User, display_status.label("display_status")).outerjoin(
        User, PremiumOrder.user_id == User.id,
    ).filter(PremiumOrder.environment == "production")
    if search.strip():
        escaped = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        receipt_match = db.query(AutopayReceipt.id).filter(
            AutopayReceipt.order_reference == PremiumOrder.id, AutopayReceipt.environment == "production",
            or_(AutopayReceipt.remote_id.ilike(pattern, escape="\\"),
                AutopayReceipt.payer_email.ilike(pattern, escape="\\"),
                AutopayReceipt.payer_name.ilike(pattern, escape="\\")),
        ).exists()
        attempt_match = db.query(PremiumNotification.id).filter(
            PremiumNotification.order_reference == PremiumOrder.id, PremiumNotification.environment == "production",
            PremiumNotification.confirmation == "CONFIRMED", PremiumNotification.remote_id.ilike(pattern, escape="\\"),
        ).exists()
        query = query.filter(or_(receipt_match, attempt_match, *[
            field.ilike(pattern, escape="\\") for field in
            (PremiumOrder.id, PremiumOrder.remote_id, User.email, User.first_name, User.last_name)
        ]))
    counts = {key: 0 for key in STATUS_LABELS}
    for key, count in query.with_entities(display_status, func.count(PremiumOrder.id)).group_by(display_status).all():
        counts[key] = count
    if status:
        query = query.filter(display_status == status)
    total = query.count()
    page = min(page, max(1, (total + page_size - 1) // page_size))
    rows = query.order_by(PremiumOrder.created_at.desc(), PremiumOrder.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    ids = [order.id for order, _, _ in rows]
    attempts, receipts, refunds = {}, {}, {}
    if ids:
        for refund in db.query(PremiumRefund).filter(PremiumRefund.order_id.in_(ids), PremiumRefund.environment == "production").order_by(PremiumRefund.created_at, PremiumRefund.id).all():
            refunds.setdefault(refund.order_id, []).append({"id": refund.id, "status": refund.status,
                "provider_status": refund.provider_status, "error": refund.error})
        for notification in db.query(PremiumNotification).filter(
            PremiumNotification.order_reference.in_(ids), PremiumNotification.environment == "production",
            PremiumNotification.confirmation == "CONFIRMED",
        ).order_by(PremiumNotification.first_seen_at, PremiumNotification.id).all():
            key = (notification.order_reference, notification.remote_id)
            previous = attempts.get(key)
            state = previous["provider_status"] if previous and previous["provider_status"] == "SUCCESS" else notification.payment_status
            attempts[key] = {"remote_id": notification.remote_id, "provider_status": state,
                             "last_seen_at": max(notification.last_seen_at, previous["last_seen_at"] if previous else "")}
        for receipt in db.query(AutopayReceipt).filter(
            AutopayReceipt.order_reference.in_(ids), AutopayReceipt.environment == "production",
        ).order_by(AutopayReceipt.id).all():
            receipts.setdefault(receipt.order_reference, []).append(receipt)
            key = (receipt.order_reference, receipt.remote_id)
            attempts[key] = {"remote_id": receipt.remote_id, "provider_status": "SUCCESS",
                             "last_seen_at": attempts.get(key, {}).get("last_seen_at", receipt.recorded_at)}
    entries = []
    for order, user, state in rows:
        deadline = withdrawal_deadline(order)
        paid = receipts.get(order.id, [])
        payer = paid[0] if paid else None
        order_attempts = [value for (oid, _), value in attempts.items() if oid == order.id]
        if order.remote_id and not any(value["remote_id"] == order.remote_id for value in order_attempts):
            order_attempts.append({"remote_id": order.remote_id, "provider_status":
                                   {"paid": "SUCCESS", "failed": "FAILURE", "pending": "PENDING"}.get(order.status, order.status),
                                   "last_seen_at": None})
        entries.append({
            "id": order.id, "status": state, "status_label": STATUS_LABELS[state], "amount": order.amount,
            "currency": order.currency, "description": receipt_description(order.package, order.period, order.duration_days),
            "created_at": order.created_at, "paid_at": order.paid_at,
            "payer_email": payer.payer_email if payer else user.email if user else "",
            "payer_name": payer.payer_name if payer else " ".join(filter(None, [user.first_name, user.last_name])) if user else "",
            "service_starts_at": order.service_starts_at, "service_ends_at": order.service_ends_at,
            "entitlements_applied_at": order.entitlements_applied_at, "refunded_at": order.refunded_at,
            "refund_requested_at": order.refund_requested_at,
            "refund_deadline": deadline.isoformat() if deadline else None,
            "can_request_refund": bool(state == "paid" and paid and deadline and datetime.now(timezone.utc) < deadline),
            "refunds": refunds.get(order.id, []),
            "attempts": order_attempts,
            "provider_updated_at": max((value["last_seen_at"] for value in order_attempts if value["last_seen_at"]), default=None),
        })
    return {"entries": entries, "total": total, "counts": counts, "page": page, "page_size": page_size,
            "updated_at": datetime.now(timezone.utc).isoformat()}


def build_transactions_router(get_db, get_current_admin):
    router = APIRouter(prefix="/transactions", tags=["Transakcje Autopay"])

    @router.get("")
    def overview(response: Response, status: TransactionStatus | None = None,
                 search: str = Query(default="", max_length=100), page: int = Query(default=1, ge=1),
                 page_size: int = Query(default=25, ge=1, le=100),
                 admin=Depends(get_current_admin), db=Depends(get_db)):
        response.headers["Cache-Control"] = "no-store"
        return transaction_overview(db, status=status, search=search, page=page, page_size=page_size)

    @router.post("/{order_id}/check")
    def check(order_id: str, tasks: BackgroundTasks, response: Response,
              admin=Depends(get_current_admin), db=Depends(get_db)):
        response.headers["Cache-Control"] = "no-store"
        order = db.query(PremiumOrder).filter_by(id=order_id, environment="production").first()
        if not order:
            raise HTTPException(404, "Nie znaleziono transakcji.")
        from autopay_api import refresh_order
        from premium_payments import notification_config, schedule_confirmation
        refresh_order(order, db, notification_config())
        schedule_confirmation(order.id, tasks, db)
        return {"message": "Sprawdzono status w Autopay."}

    @router.post("/{order_id}/refund", status_code=202)
    def refund(order_id: str, response: Response, admin=Depends(get_current_admin), db=Depends(get_db)):
        response.headers["Cache-Control"] = "no-store"
        order = db.query(PremiumOrder).filter_by(id=order_id, environment="production").first()
        if not order:
            raise HTTPException(404, "Nie znaleziono transakcji.")
        from premium_refunds import request_refund
        from premium_payments import notification_config
        try:
            request_refund(order, db, notification_config(), admin_id=getattr(admin, "id", None))
        except HTTPException as error:
            if error.status_code == 502 and order.refund_requested_at:
                return {"message": error.detail, "warning": True}
            raise
        return {"message": "Zlecono zwrot do Autopay. Premium z tego zakupu zostało wycofane. Trwa oczekiwanie na potwierdzenie zwrotu pieniędzy.", "warning": False}

    @router.post("/{order_id}/refund-check")
    def refund_check(order_id: str, response: Response, admin=Depends(get_current_admin), db=Depends(get_db)):
        response.headers["Cache-Control"] = "no-store"
        order = db.query(PremiumOrder).filter_by(id=order_id, environment="production").first()
        if not order:
            raise HTTPException(404, "Nie znaleziono transakcji.")
        from premium_refunds import refresh_refund
        from premium_payments import notification_config
        config = notification_config()
        ids = [row.id for row in db.query(PremiumRefund).filter_by(order_id=order.id, environment="production").all() if row.status != "done"]
        if not ids:
            raise HTTPException(409, "Brak zwrotów oczekujących na sprawdzenie.")
        for refund_id in ids:
            refresh_refund(order, db, config, refund_id=refund_id)
        return {"message": "Sprawdzono wykonanie zwrotu w Autopay."}

    return router
