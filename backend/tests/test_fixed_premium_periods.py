"""Fixed new package lengths and preservation of previously agreed calendar terms."""

import json
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from models import AutopayReceipt, PremiumMailOutbox, PremiumOrder
from premium_access import apply_paid_premium_order, premium_display_fields, revoke_order_entitlements
from premium_contract import make_quote, verify_quote
from premium_payments import process_itn, production_config, seller_details
from test_premium_payments import PremiumPaymentTests

WARSAW = ZoneInfo("Europe/Warsaw")


class FixedPremiumPeriodTests(unittest.TestCase):
    setUp = PremiumPaymentTests.setUp
    tearDown = PremiumPaymentTests.tearDown
    checkout = PremiumPaymentTests.checkout
    notification = PremiumPaymentTests.notification

    def pay(self, order_id, remote):
        order = self.db.get(PremiumOrder, order_id)
        process_itn(self.notification(order.id, amount=order.amount, remote=remote), self.db, production_config())
        return order

    def test_mid_month_february_month_end_and_august_year_always_use_purchased_days(self):
        self.admin.premium_until = None
        for package, period, start, expected, days in (
            ("shooter", "monthly", "2027-02-15T12:00:00+01:00", "2027-03-18T12:00:00+01:00", 31),
            ("shooter", "monthly", "2027-01-31T12:00:00+01:00", "2027-03-03T12:00:00+01:00", 31),
            ("shooter", "monthly", "2027-03-15T12:00:00+01:00", "2027-04-15T12:00:00+02:00", 31),
            ("shooter", "monthly", "2027-12-15T12:00:00+01:00", "2028-01-15T12:00:00+01:00", 31),
            ("shooter", "yearly", "2027-08-15T12:00:00+02:00", "2028-08-14T12:00:00+02:00", 365),
            ("organizer", "yearly", "2027-08-15T12:00:00+02:00", "2028-08-14T12:00:00+02:00", 365),
            ("shooter", "yearly", "2028-02-01T12:00:00+01:00", "2029-01-31T12:00:00+01:00", 365),
        ):
            with self.subTest(package=package, period=period, start=start), patch("premium_contract.now", return_value=datetime.fromisoformat(start)):
                quote = make_quote(self.admin, package, period, "12.34", True, None, seller_details())
            self.assertEqual(quote["duration_days"], days)
            self.assertEqual(quote["service_starts_at"], start)
            self.assertEqual(quote["service_ends_at"], expected)

    def test_verified_payments_stack_31_days_not_calendar_months_and_activate_once(self):
        first = self.pay(self.checkout()["order_id"], "fixed1")
        second = self.pay(self.checkout()["order_id"], "fixed2")
        self.assertEqual(first.duration_days, 31)
        self.assertEqual(second.duration_days, 31)
        self.assertEqual(second.service_starts_at, "2027-01-31T23:59:59+01:00")
        self.assertEqual(second.service_ends_at, "2027-03-03T23:59:59+01:00")
        self.assertEqual(premium_display_fields(self.admin)["premium_coverage_until"], second.service_ends_at)
        self.assertEqual([r.duration_days for r in self.db.query(AutopayReceipt).all()], [31, 31])
        self.assertEqual(json.loads(second.contract_snapshot)["duration_days"], 31)
        self.assertIn("Zakupiony okres: 31 dni", self.db.query(PremiumMailOutbox).filter_by(order_id=second.id).one().body)
        self.db.query(PremiumMailOutbox).filter_by(order_id=first.id).one().sent_at = datetime.now(timezone.utc).isoformat()
        self.db.commit()
        with patch("premium_access.datetime", wraps=datetime) as clock:
            clock.now.return_value = datetime(2027, 1, 1, tzinfo=timezone.utc)
            self.assertTrue(apply_paid_premium_order(first, self.db))
            self.db.commit()
            self.assertFalse(apply_paid_premium_order(first, self.db))
        self.assertEqual(self.admin.premium_shooter_paid_until, "2027-01-31T23:59:59+01:00")

    def test_refund_preserves_31_days_for_remaining_packages_and_their_original_contract(self):
        first = self.pay(self.checkout()["order_id"], "refund1")
        second = self.pay(self.checkout()["order_id"], "refund2")
        third = self.pay(self.checkout()["order_id"], "refund3")
        original_contract = third.contract_snapshot
        first.refund_requested_at = datetime.now(timezone.utc).isoformat()
        revoke_order_entitlements(first, self.db)
        self.db.commit()
        self.assertEqual(second.service_starts_at, self.admin.premium_until)
        self.assertEqual(second.service_ends_at, "2027-01-31T23:59:59+01:00")
        self.assertEqual(third.service_ends_at, "2027-03-03T23:59:59+01:00")
        self.assertEqual(third.contract_snapshot, original_contract)
        self.assertEqual(premium_display_fields(self.admin)["premium_coverage_until"], third.service_ends_at)
        self.pay(third.id, "refund3")
        self.assertEqual(third.service_ends_at, "2027-03-03T23:59:59+01:00")

    def test_older_calendar_order_keeps_its_terms_when_confirmed_after_the_change(self):
        self.admin.premium_until = "2027-01-31T12:00:00+01:00"
        order = self.db.get(PremiumOrder, self.checkout()["order_id"])
        # An order accepted before this change had no purchased day count.
        order.duration_days = None
        order.service_starts_at = self.admin.premium_until
        order.service_ends_at = "2027-02-28T12:00:00+01:00"
        snapshot = json.loads(order.contract_snapshot)
        snapshot["duration_days"] = None
        snapshot["terms_version"] = "2026-11-06"
        order.contract_snapshot = json.dumps(snapshot)
        self.db.commit()
        self.pay(order.id, "older1")
        self.assertEqual(order.service_ends_at, "2027-02-28T12:00:00+01:00")
        self.assertEqual(json.loads(order.contract_snapshot)["terms_version"], "2026-11-06")

    def test_annual_organizer_activates_365_days_for_both_packages(self):
        self.admin.premium_until = None
        self.db.commit()
        data = self.data.model_copy(update={"package": "organizer", "period": "yearly", "expected_price": "123.45", "early_start_requested": True})
        order = self.pay(self.checkout(data)["order_id"], "bundle1")
        self.assertEqual(order.duration_days, 365)
        self.db.query(PremiumMailOutbox).filter_by(order_id=order.id).one().sent_at = datetime.now(timezone.utc).isoformat()
        self.db.commit()
        self.assertTrue(apply_paid_premium_order(order, self.db))
        self.db.commit()
        start = datetime.fromisoformat(order.entitlement_starts_at).astimezone(WARSAW)
        expected = (start + timedelta(days=365)).isoformat()
        self.assertEqual(self.admin.premium_organizer_paid_until, expected)
        self.assertEqual(premium_display_fields(self.admin)["premium_coverage_until"], expected)

    def test_a_quote_from_the_previous_terms_version_cannot_create_new_orders(self):
        with patch("premium_contract.TERMS_VERSION", "2026-11-06"):
            old = make_quote(self.admin, "shooter", "monthly", "12.34", False, None, seller_details())
        with self.assertRaises(HTTPException) as error:
            verify_quote(old["quote_token"], self.data, self.admin, "12.34")
        self.assertEqual(error.exception.status_code, 409)


del PremiumPaymentTests
