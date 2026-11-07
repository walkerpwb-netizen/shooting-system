"""Public daily offer: account-protected purchases with synthetic payments."""

import json
import unittest
from datetime import datetime, timedelta, timezone
from xml.etree.ElementTree import fromstring
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from models import AutopayReceipt, PremiumMailOutbox, PremiumOrder
from payment_limits import PAYMENT_MAINTENANCE_MESSAGE
from payment_reports import build_payments_csv, serialize_receipt
from payment_transactions import transaction_overview
from premium_access import add_premium_period, apply_paid_premium_order, premium_display_fields, revoke_order_entitlements
from premium_contract import make_quote
from premium_daily import daily_purchase
from premium_payments import create_production_order, process_itn, production_config, seller_details
from test_premium_payments import PremiumPaymentTests


class DailyPremiumTests(unittest.TestCase):
    setUp = PremiumPaymentTests.setUp
    tearDown = PremiumPaymentTests.tearDown
    notification = PremiumPaymentTests.notification
    request = PremiumPaymentTests.request

    def quoted(self, amount="10.00", *, period="daily", early=True):
        data = self.data.model_copy(update={"period": period, "expected_price": amount, "early_start_requested": early})
        quote = make_quote(self.admin, "shooter", period, amount, early, None, seller_details(), db=self.db)
        return data.model_copy(update={"quote_token": quote["quote_token"]}), quote

    def buy(self, amount="10.00", *, period="daily"):
        data, quote = self.quoted(amount, period=period)
        result = create_production_order(data, self.admin, self.db, lambda db: self.prices)
        return self.db.get(PremiumOrder, result["order_id"]), quote

    def pay(self, order, remote="daily123"):
        xml = self.notification(order.id, amount=order.amount, remote=remote)
        self.assertEqual(fromstring(process_itn(xml, self.db, production_config())).findtext(".//confirmation"), "CONFIRMED")

    def test_offer_is_public_but_guest_or_inactive_account_cannot_purchase(self):
        data, _ = self.quoted()
        status, body = self.request("GET", "/premium/support-offer")
        self.assertEqual(status, 200)
        self.assertEqual(set(json.loads(body)), {"price_per_day", "minimum_amount", "maximum_amount", "package", "period"})
        for path in ("/premium/quote", "/premium/checkout"):
            status, response = self.request("POST", path, data.model_dump_json().encode())
            self.assertEqual(status, 401, response)
        self.admin.role, self.admin.roles, self.admin.is_active = "shooter", "user,shooter", 0
        self.db.commit()
        for path in ("/premium/quote", "/premium/checkout"):
            status, response = self.request("POST", path, data.model_dump_json().encode(), authorized=True)
            self.assertEqual(status, 403, response)
        self.assertEqual(self.db.query(PremiumOrder).count(), 0)

    def test_registered_active_shooter_can_buy_and_receive_days_without_admin_role(self):
        self.admin.role, self.admin.roles = "shooter", "user,shooter"
        self.db.commit()
        data = self.data.model_copy(update={"period": "daily", "expected_price": "25.00", "early_start_requested": True})
        status, body = self.request("POST", "/premium/quote", data.model_dump_json().encode(), authorized=True)
        self.assertEqual(status, 200, body)
        quote = json.loads(body)
        self.assertEqual(quote["duration_days"], 25)
        data = data.model_copy(update={"quote_token": quote["quote_token"]})
        status, body = self.request("POST", "/premium/checkout", data.model_dump_json().encode(), authorized=True)
        self.assertEqual(status, 200, body)
        order = self.db.get(PremiumOrder, json.loads(body)["order_id"])
        self.assertEqual(order.user_id, self.admin.id)
        self.assertEqual(order.duration_days, 25)
        self.assertIsNone(self.admin.premium_shooter_paid_until)
        self.pay(order)
        self.assertEqual(premium_display_fields(self.admin)["premium_coverage_until"], "2027-01-25T23:59:59+01:00")
        self.assertEqual(self.db.query(AutopayReceipt).one().amount_grosz, 2500)
        self.assertEqual(self.admin.premium_until, "2026-12-31T23:59:59+01:00")

    def test_server_offer_and_amount_validation_do_not_accept_rounding_or_extra_days(self):
        status, body = self.request("GET", "/premium/support-offer", authorized=True)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["price_per_day"], "1.00")
        self.assertEqual(json.loads(body)["minimum_amount"], "10.00")
        for amount in ("0.00", "9.00", "10.01", "10", "10,00", "-10.00", "NaN", "Infinity", "1e2", "010.00", "1000000.00"):
            with self.subTest(amount=amount), self.assertRaises(HTTPException):
                daily_purchase(amount)
        for change in ({"package": "organizer"}, {"competition_id": self.event.id}):
            data, _ = self.quoted()
            with self.assertRaises(HTTPException):
                create_production_order(data.model_copy(update=change), self.admin, self.db, lambda db: self.prices)
        data, _ = self.quoted()
        with self.assertRaises(HTTPException):
            create_production_order(data.model_copy(update={"expected_price": "50.00"}), self.admin, self.db, lambda db: self.prices)
        # The client cannot send its own days count at all.
        payload = {**data.model_dump(), "duration_days": 1000}
        self.assertEqual(self.request("POST", "/premium/quote", json.dumps(payload).encode(), authorized=True)[0], 422)

    def test_paid_days_stack_after_free_access_and_are_visible_once_in_all_records(self):
        order, quote = self.buy("50.00")
        self.assertEqual(order.duration_days, 50)
        self.assertEqual(quote["duration_days"], 50)
        self.assertEqual(order.service_starts_at, "2026-12-31T23:59:59+01:00")
        self.assertEqual(order.service_ends_at, "2027-02-19T23:59:59+01:00")
        original_end = order.service_ends_at
        self.pay(order)
        self.pay(order)
        self.db.refresh(self.admin)
        self.assertEqual(self.admin.premium_until, "2026-12-31T23:59:59+01:00")
        self.assertIsNone(self.admin.premium_organizer_paid_until)
        self.assertEqual(premium_display_fields(self.admin)["premium_coverage_until"], original_end)
        self.assertEqual(premium_display_fields(self.admin)["premium_organizer_coverage_until"], self.admin.premium_until)
        self.assertEqual(order.service_ends_at, original_end)
        self.assertEqual(self.db.query(AutopayReceipt).count(), 1)
        receipt = self.db.query(AutopayReceipt).one()
        self.assertEqual(receipt.duration_days, 50)
        self.assertEqual(serialize_receipt(receipt)["amount"], "50.00")
        self.assertIn("50 dni", serialize_receipt(receipt)["description"])
        self.assertIn("50 dni", build_payments_csv([receipt], 2026).decode("utf-8-sig"))
        self.assertIn("50 dni", transaction_overview(self.db)["entries"][0]["description"])
        mail = self.db.query(PremiumMailOutbox).one()
        self.assertIn("50 dni", mail.body)
        self.assertIn("1.00 PLN", mail.body)
        status, body = self.request("GET", f"/premium/orders/{order.id}", authorized=True)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["duration_days"], 50)

    def test_start_requires_consent_and_mail_then_grants_exact_days_only_once(self):
        self.admin.premium_until = None
        self.db.commit()
        data, late = self.quoted(early=False)
        self.assertGreaterEqual(datetime.fromisoformat(late["service_starts_at"]), datetime.fromisoformat(late["issued_at"]) + timedelta(days=14))
        order, _ = self.buy()
        self.pay(order)
        self.assertFalse(apply_paid_premium_order(order, self.db))
        self.db.query(PremiumMailOutbox).one().sent_at = datetime.now(timezone.utc).isoformat()
        self.db.commit()
        self.assertTrue(apply_paid_premium_order(order, self.db))
        self.db.commit()
        self.assertFalse(apply_paid_premium_order(order, self.db))
        start = datetime.fromisoformat(order.entitlement_starts_at).astimezone(ZoneInfo("Europe/Warsaw"))
        end = datetime.fromisoformat(self.admin.premium_shooter_paid_until)
        self.assertEqual(end, start + timedelta(days=10))
        self.assertIsNone(self.admin.premium_organizer_paid_until)

    def test_daily_days_are_calendar_days_across_daylight_saving_change(self):
        start = datetime(2027, 3, 25, 12, tzinfo=ZoneInfo("Europe/Warsaw"))
        end = add_premium_period(start, "daily", 10)
        self.assertEqual(end.isoformat(), "2027-04-04T12:00:00+02:00")
        self.assertEqual((end.astimezone(timezone.utc) - start.astimezone(timezone.utc)).total_seconds(), 239 * 3600)

    def test_refund_reflows_remaining_daily_and_monthly_renewals_preserving_contracts(self):
        first, _ = self.buy("10.00")
        self.pay(first, "daily1")
        second, _ = self.buy("20.00")
        self.pay(second, "daily2")
        monthly, _ = self.buy("12.34", period="monthly")
        self.pay(monthly, "monthly3")
        contract = second.contract_snapshot
        first.refund_requested_at = datetime.now(timezone.utc).isoformat()
        revoke_order_entitlements(first, self.db)
        self.db.commit()
        self.assertEqual(second.service_starts_at, "2026-12-31T23:59:59+01:00")
        self.assertEqual(second.service_ends_at, "2027-01-20T23:59:59+01:00")
        self.assertEqual(monthly.service_starts_at, second.service_ends_at)
        self.assertEqual(monthly.service_ends_at, "2027-02-20T23:59:59+01:00")
        self.assertEqual(premium_display_fields(self.admin)["premium_coverage_until"], monthly.service_ends_at)
        self.assertEqual(second.contract_snapshot, contract)
        self.assertEqual(self.db.query(AutopayReceipt).count(), 3)

    def test_quarterly_limit_cannot_be_bypassed_by_daily_purchase(self):
        self.buy("10000.00")  # A gateway link reserves its full amount before payment.
        data, _ = self.quoted("1000.00")
        with self.assertRaises(HTTPException) as error:
            create_production_order(data, self.admin, self.db, lambda db: self.prices)
        self.assertEqual(error.exception.status_code, 503)
        self.assertEqual(error.exception.detail, PAYMENT_MAINTENANCE_MESSAGE)
        self.assertEqual(self.db.query(PremiumOrder).count(), 1)


del PremiumPaymentTests
