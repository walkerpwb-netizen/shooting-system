"""Durable confirmation queue; SMTP never delays the Autopay HTTP acknowledgment."""

import json
from datetime import datetime, timezone

from models import PremiumMailOutbox
from premium_contract import contract_text


def queue_confirmation(order, db):
    if not order.contract_snapshot:
        return
    snapshot = json.loads(order.contract_snapshot)
    if order.environment == "sandbox" and not snapshot.get("test_email_requested"):
        return
    if db.query(PremiumMailOutbox.id).filter_by(order_id=order.id).first():
        return
    db.add(PremiumMailOutbox(order_id=order.id, recipient=snapshot["email"],
        subject=("[TEST SANDBOX] " if order.environment == "sandbox" else "") + "Potwierdzenie Premium — System Strzelecki",
        body=contract_text(order), created_at=datetime.now(timezone.utc).isoformat(), attempts=0))
    db.flush()


def deliver_pending_confirmations(order_id=None):
    from database import SessionLocal
    from mailer import send_email
    from models import PremiumOrder
    from premium_access import apply_paid_premium_order

    with SessionLocal() as db:
        query = db.query(PremiumMailOutbox).filter(PremiumMailOutbox.sent_at.is_(None))
        if order_id:
            query = query.filter_by(order_id=order_id)
        entry = query.order_by(PremiumMailOutbox.id).with_for_update(skip_locked=True).first()
        if not entry:
            return
        entry.attempts += 1
        entry.attempted_at = datetime.now(timezone.utc).isoformat()
        try:
            send_email(entry.recipient, entry.subject, entry.body, copy_to_admin=False)
            entry.sent_at = datetime.now(timezone.utc).isoformat()
            entry.error = None
        except Exception:
            entry.error = "Nie udało się wysłać potwierdzenia. Sprawdź konfigurację poczty i ponów wysyłkę."
        order_reference, delivered = entry.order_id, bool(entry.sent_at)
        db.commit()  # Release the mail lock before acquiring the order lock.
        if delivered and order_reference:
            order = db.get(PremiumOrder, order_reference)
            if order:
                apply_paid_premium_order(order, db)
                db.commit()
