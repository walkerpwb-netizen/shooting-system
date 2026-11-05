import json
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from models import PremiumNotification, PremiumOrder, PremiumRefund
from payment_transactions import transaction_overview
import test_payment_reports as reports


class PaymentTransactionsTests(unittest.TestCase):
    setUp = reports.PaymentReportsTests.setUp
    tearDown = reports.PaymentReportsTests.tearDown
    make_engine = reports.PaymentReportsTests.make_engine
    order = reports.PaymentReportsTests.order
    receipt = reports.PaymentReportsTests.receipt
    transaction = reports.PaymentReportsTests.transaction
    request = reports.PaymentReportsTests.request

    def notification(self, order, remote, status, stamp, confirmation="CONFIRMED"):
        notification = PremiumNotification(digest=f"{order.id}{remote}{status}"[:64], environment=order.environment,
            service_id=order.service_id, order_reference=order.id, remote_id=remote, payment_status=status,
            confirmation=confirmation, first_seen_at=stamp, last_seen_at=stamp, deliveries=1)
        self.db.add(notification)
        self.db.commit()
        return notification

    def test_every_checkout_status_is_visible_and_only_receipts_count_as_income(self):
        started = self.order()
        # Local link expiry never proves the operator has cancelled a payment.
        started.gateway_valid_until = "2020-01-01T00:00:00Z"
        pending = self.order(); pending.remote_id = "pending"
        failed = self.order(); failed.status = "failed"
        cancelled = self.order(); cancelled.status = "cancelled"
        paid = self.order(); paid.status = "paid"
        refunded = self.order(); refunded.status = "paid"; refunded.refunded_at = "2026-10-26T12:00:00Z"
        refunding = self.order(); refunding.status = "paid"
        self.db.add(PremiumRefund(id="refund", order_id=refunding.id, remote_id="remote", environment="production",
            amount_grosz=1000, status="accepted", created_at="2026-10-26T12:00:00Z", updated_at="2026-10-26T12:00:00Z"))
        self.order(environment="retired")
        self.db.commit()
        data = transaction_overview(self.db)
        self.assertEqual(data["total"], 7)
        states = {row["id"]: row["status"] for row in data["entries"]}
        self.assertEqual(states, {started.id: "started", pending.id: "pending", failed.id: "failed",
            cancelled.id: "cancelled", paid.id: "paid", refunded.id: "refunded", refunding.id: "refund_pending"})
        self.assertEqual(sum(data["counts"].values()), 7)
        code, _, body = self.request("/admin/payments?year=2026", "admin")
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(body)["annual"]["amount"], "0.00")

    def test_filters_pagination_and_literal_search_do_not_duplicate_attempts(self):
        order = self.order(); order.status = "failed"
        self.notification(order, "attempt1", "FAILURE", "2026-10-25T12:00:00Z")
        self.notification(order, "attempt2", "PENDING", "2026-10-25T12:01:00Z")
        self.order()
        self.db.commit()
        self.assertEqual(transaction_overview(self.db, status="failed")["total"], 1)
        self.assertEqual(transaction_overview(self.db, search="attempt2")["total"], 1)
        self.assertEqual(transaction_overview(self.db, search="Łucja")["total"], 2)
        self.assertEqual(transaction_overview(self.db, search="%_")["total"], 0)
        self.assertEqual(transaction_overview(self.db, page_size=1)["total"], 2)
        self.assertEqual(len(transaction_overview(self.db, page_size=1)["entries"]), 1)
        self.assertEqual(transaction_overview(self.db, page=99, page_size=1)["page"], 2)

    def test_attempts_preserve_success_and_ignore_unconfirmed_notifications(self):
        receipt = self.receipt(remote="paidAttempt")
        order = self.db.get(PremiumOrder, receipt.order_id)
        order.status = "paid"
        self.notification(order, "paidAttempt", "SUCCESS", "2026-10-25T12:00:00Z")
        self.notification(order, "paidAttempt", "PENDING", "2026-10-25T12:01:00Z")
        self.notification(order, "failedAttempt", "FAILURE", "2026-10-25T12:02:00Z")
        self.notification(order, "forged", "SUCCESS", "2026-10-25T12:03:00Z", confirmation="NOTCONFIRMED")
        self.db.commit()
        row = transaction_overview(self.db)["entries"][0]
        self.assertEqual(row["status"], "paid")
        self.assertEqual({a["remote_id"]: a["provider_status"] for a in row["attempts"]},
                         {"paidAttempt": "SUCCESS", "failedAttempt": "FAILURE"})
        self.assertEqual(row["provider_updated_at"], "2026-10-25T12:02:00Z")
        self.assertEqual(transaction_overview(self.db, search="forged")["total"], 0)
        self.db.delete(self.user); self.db.commit()
        row = transaction_overview(self.db)["entries"][0]
        self.assertEqual(row["payer_email"], "buyer@example.test")
        self.assertEqual(transaction_overview(self.db, search="buyer@example.test")["total"], 1)

    def test_admin_only_routes_and_validated_filters_and_no_secret_snapshots(self):
        order = self.order()
        order.contract_snapshot = '{"secret": "not-for-overview"}'
        self.db.commit()
        check_path = f"/admin/payments/transactions/{order.id}/check"
        with patch("autopay_api.refresh_order") as refresh:
            for path, method in (("/admin/payments/transactions", "GET"), (check_path, "POST")):
                self.assertEqual(self.request(path, method=method)[0], 401)
                self.assertEqual(self.request(path, "organizer", method=method)[0], 403)
            refresh.assert_not_called()
        code, headers, body = self.request("/admin/payments/transactions", "admin")
        self.assertEqual(code, 200)
        self.assertEqual(headers[b"cache-control"], b"no-store")
        self.assertNotIn(b"not-for-overview", body)
        self.assertNotIn(b"contract_snapshot", body)
        for query in ("status=SUCCESS", "page=0", "page_size=101", "search=" + "a" * 101):
            self.assertEqual(self.request("/admin/payments/transactions?" + query, "admin")[0], 422)

    def test_check_uses_verified_operator_workflow_and_failure_preserves_status(self):
        order = self.order()
        path = f"/admin/payments/transactions/{order.id}/check"
        with patch("premium_payments.notification_config", return_value={"environment": "production"}), \
             patch("autopay_api.refresh_order", side_effect=HTTPException(502, "Błąd podpisu")):
            self.assertEqual(self.request(path, "admin", method="POST")[0], 502)
        self.assertEqual(order.status, "pending")
        with patch("premium_payments.notification_config", return_value={"environment": "production"}), \
             patch("autopay_api.refresh_order") as refresh, patch("premium_payments.schedule_confirmation") as schedule:
            self.assertEqual(self.request(path, "admin", method="POST")[0], 200)
            refresh.assert_called_once_with(order, self.db, {"environment": "production"})
            self.assertEqual(schedule.call_args.args[0], order.id)
        retired = self.order(environment="retired")
        with patch("autopay_api.refresh_order") as refresh:
            self.assertEqual(self.request(f"/admin/payments/transactions/{retired.id}/check", "admin", method="POST")[0], 404)
            refresh.assert_not_called()
