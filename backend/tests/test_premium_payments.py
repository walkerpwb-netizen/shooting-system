import asyncio
import base64
import hashlib
import json
import os
import unittest
import tempfile
from pathlib import Path
from datetime import datetime, timezone
from unittest.mock import patch
from urllib.parse import urlencode
from xml.etree.ElementTree import fromstring

from fastapi import FastAPI, Header, HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base
from models import Competition, PremiumOrder, User
from premium_contract import make_quote
from premium_payments import (
    CheckoutData, TERMS_VERSION, build_premium_router, create_production_order,
    payment_hash, process_itn, production_config, seller_details,
)
from payment_reports import record_autopay_receipt


ENV = {
    "AUTOPAY_MODE": "production", "AUTOPAY_PRODUCTION_SERVICE_ID": "12345",
    "AUTOPAY_PRODUCTION_SHARED_KEY": "synthetic-payment-key",
    "AUTOPAY_PRODUCTION_GATEWAY_URL": "https://pay.autopay.eu/payment",
    "AUTOPAY_PRODUCTION_HASH_ALGORITHM": "sha256", "AUTOPAY_PRODUCTION_CALLBACKS_CONFIGURED": "true",
}


class PremiumPaymentTests(unittest.TestCase):
    def setUp(self):
        self.config_directory = tempfile.TemporaryDirectory()
        self.config_path_patch = patch("autopay_config.CONFIG_PATH", Path(self.config_directory.name) / "autopay.json")
        self.config_path_patch.start()
        self.clock = patch("payment_limits.current_time", return_value=datetime(2026, 10, 25, tzinfo=timezone.utc))
        self.clock.start()
        self.environment = patch.dict(os.environ, ENV)
        self.environment.start()
        smtp_ready = patch("mailer.is_mail_configured", return_value=True)
        smtp_ready.start(); self.addCleanup(smtp_ready.stop)
        smtp_send = patch("mailer.send_email")
        smtp_send.start(); self.addCleanup(smtp_send.stop)
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        with self.engine.connect() as connection:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        Base.metadata.create_all(self.engine)
        factory = sessionmaker(bind=self.engine, autoflush=False)
        self.db = factory()
        mail_db = patch("database.SessionLocal", factory)
        mail_db.start(); self.addCleanup(mail_db.stop)
        self.admin = User(email="admin@example.test", role="admin", is_active=1,
                          premium_until="2026-12-31T23:59:59+01:00")
        self.db.add(self.admin)
        self.db.commit()
        self.event = Competition(name="Test", date="2026-11-30", location="Test", created_by=self.admin.email, status="draft")
        self.db.add(self.event)
        self.db.commit()
        self.prices = {kind: {"monthly_price": "12.34", "yearly_price": "123.45", "features": ["ranking"]}
                       for kind in ("shooter", "organizer")}
        self.data = CheckoutData(package="shooter", period="monthly", expected_price="12.34",
                                 terms_version=TERMS_VERSION, terms_accepted=True)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        self.environment.stop()
        self.clock.stop()
        self.config_path_patch.stop()
        self.config_directory.cleanup()

    def checkout(self, data=None, user=None):
        data = data or self.data
        if data.package == "organizer" and data.period == "monthly" and data.competition_id is None:
            data = data.model_copy(update={"competition_id": self.event.id})
        account = user or self.admin
        if not data.quote_token:
            q = make_quote(account, data.package, data.period, data.expected_price, data.early_start_requested,
                           data.competition_id, seller_details(), db=self.db)
            data = data.model_copy(update={"quote_token": q["quote_token"]})
        return create_production_order(data, account, self.db, lambda db: self.prices)

    def notification(self, order_id, amount="12.34", currency="PLN", status="SUCCESS", service="12345", remote="remote123"):
        values = [service, order_id, remote, amount, currency, "20261025200000", status]
        signature = payment_hash(values, production_config())
        return (f"<transactionList><serviceID>{service}</serviceID><transactions><transaction>"
                f"<orderID>{order_id}</orderID><remoteID>{remote}</remoteID><amount>{amount}</amount>"
                f"<currency>{currency}</currency><paymentDate>20261025200000</paymentDate>"
                f"<paymentStatus>{status}</paymentStatus></transaction></transactions>"
                f"<hash>{signature}</hash></transactionList>").encode()

    def test_official_hash_vector(self):
        config = {"key": "2test2", "algorithm": "sha256"}
        self.assertEqual(payment_hash(["2", "100", "1.50"], config),
                         "2ab52e6918c6ad3b69a8228a2ab815f11ad58533eeed963dd990df8d8c3709d1")
        self.assertEqual(payment_hash(["2", "", "100", None, "1.50"], config),
                         payment_hash(["2", "100", "1.50"], config))

    def test_disabled_and_unknown_modes_never_create_orders(self):
        for mode in ("", "disabled", "unsupported", "live"):
            with self.subTest(mode=mode), patch.dict(os.environ, {"AUTOPAY_MODE": mode}):
                self.assertFalse(production_config()["ready"])
                with self.assertRaises(HTTPException) as error:
                    self.checkout()
                self.assertEqual(error.exception.status_code, 503)
        self.assertEqual(self.db.query(PremiumOrder).count(), 0)

    def test_only_exact_production_gateway_is_accepted(self):
        for url in ("https://pay.autopay.eu.evil.test/payment", "https://pay.autopay.eu@evil.test/payment",
                    "http://pay.autopay.eu/payment", "https://pay.autopay.eu/", "https://pay.autopay.eu/payment?redirect=other"):
            with self.subTest(url=url), patch.dict(os.environ, {"AUTOPAY_PRODUCTION_GATEWAY_URL": url}):
                self.assertFalse(production_config()["ready"])

    def test_only_active_accounts_can_start_checkout_without_requiring_admin(self):
        self.admin.role = "user"; self.admin.is_active = 0
        with self.assertRaises(HTTPException) as error:
            self.checkout()
        self.assertEqual(error.exception.status_code, 403)
        self.admin.is_active = 1
        self.assertEqual(self.checkout()["environment"], "production")

    def test_current_price_and_explicit_current_terms_are_required(self):
        for update, code in (({"expected_price": "0.01"}, 409), ({"terms_accepted": False}, 400),
                             ({"terms_version": "old"}, 400)):
            with self.subTest(update=update), self.assertRaises(HTTPException) as error:
                self.checkout(self.data.model_copy(update=update))
            self.assertEqual(error.exception.status_code, code)
        self.assertEqual(self.db.query(PremiumOrder).count(), 0)

    def test_all_packages_use_admin_prices_and_preserve_offer_and_consent(self):
        for kind in ("shooter", "organizer"):
            for period, price in (("monthly", "12.34"), ("yearly", "123.45")):
                result = self.checkout(self.data.model_copy(update={"package": kind, "period": period, "expected_price": price}))
                order = self.db.get(PremiumOrder, result["order_id"])
                self.assertEqual((order.package, order.period, order.amount), (kind, period, price))
                self.assertEqual(order.terms_version, TERMS_VERSION)
                self.assertTrue(order.terms_accepted_at)
                self.assertIn("ranking", order.offer_snapshot)
                self.assertEqual(json.loads(order.offer_snapshot)["included_packages"],
                                 ["organizer", "shooter"] if kind == "organizer" and period == "yearly"
                                 else ["shooter"] if kind == "shooter" else [])
                self.assertNotIn("synthetic-payment-key", str(result))
                self.assertEqual(result["fields"]["Hash"], hashlib.sha256(
                    f"12345|{order.id}|{price}|PLN|admin@example.test|{result['fields']['ValidityTime']}|{result['fields']['LinkValidityTime']}|synthetic-payment-key".encode()).hexdigest())

    def test_signed_itn_is_idempotent_and_preserves_existing_access_until_scheduled_start(self):
        order_id = self.checkout()["order_id"]
        self.prices["shooter"]["monthly_price"] = "99.99"
        for status in ("SUCCESS", "SUCCESS", "FAILURE", "PENDING"):
            reply = fromstring(process_itn(self.notification(order_id, status=status), self.db, production_config()))
            self.assertEqual(reply.findtext(".//confirmation"), "CONFIRMED")
            self.assertEqual(reply.findtext("hash"), payment_hash(["12345", order_id, "CONFIRMED"], production_config()))
            self.assertEqual(self.db.get(PremiumOrder, order_id).status, "paid")
        self.assertEqual(self.admin.premium_until, "2026-12-31T23:59:59+01:00")
        self.assertIsNone(self.admin.premium_shooter_paid_until)
        self.assertIsNone(self.admin.premium_organizer_paid_until)

    def test_annual_organizer_does_not_activate_before_scheduled_start_and_confirmation(self):
        data = self.data.model_copy(update={"package": "organizer", "period": "yearly", "expected_price": "123.45"})
        order_id = self.checkout(data)["order_id"]
        process_itn(self.notification(order_id, amount="123.45"), self.db, production_config())
        self.db.refresh(self.admin)
        self.assertIsNone(self.admin.premium_organizer_paid_until)
        self.assertIsNone(self.admin.premium_shooter_paid_until)
        self.assertIsNone(self.db.get(PremiumOrder, order_id).entitlements_applied_at)

    def test_wrong_amount_currency_order_or_status_never_confirms(self):
        order_id = self.checkout()["order_id"]
        for update in ({"amount": "0.01"}, {"currency": "EUR"}, {"order_id": "unknown"}, {"status": "BOGUS"}):
            args = {"order_id": order_id, **update}
            reply = fromstring(process_itn(self.notification(**args), self.db, production_config()))
            self.assertEqual(reply.findtext(".//confirmation"), "NOTCONFIRMED")
            self.assertEqual(self.db.get(PremiumOrder, order_id).status, "pending")

    def test_bad_signatures_wrong_service_and_xml_attacks_are_rejected(self):
        order_id = self.checkout()["order_id"]
        valid = self.notification(order_id)
        for xml in (valid.replace(b"SUCCESS", b"FAILURE"), self.notification(order_id, service="999")):
            reply = fromstring(process_itn(xml, self.db, production_config()))
            self.assertEqual(reply.findtext(".//confirmation"), "NOTCONFIRMED")
            self.assertEqual(self.db.get(PremiumOrder, order_id).status, "pending")
        for xml in (b"<!DOCTYPE x [<!ENTITY x 'attack'>]><transactionList>&x;</transactionList>",
                    b"<broken", valid.replace(b"<amount>", b"<extra>1</extra><amount>")):
            with self.subTest(xml=xml[:70]), self.assertRaises(HTTPException):
                process_itn(xml, self.db, production_config())
            self.assertEqual(self.db.get(PremiumOrder, order_id).status, "pending")

    def test_default_customer_data_is_included_in_signature_and_not_stored(self):
        order_id = self.checkout()["order_id"]
        xml = self.notification(order_id)
        original_hash = fromstring(xml).findtext("hash")
        signature = payment_hash(["12345", order_id, "remote123", "12.34", "PLN",
                                  "20261025200000", "SUCCESS", "Jan", "Testowy", "Nowy Targ"], production_config())
        xml = xml.replace(b"</transaction>", b"<customerData><fName>Jan</fName><lName>Testowy</lName><city>Nowy Targ</city></customerData></transaction>")
        xml = xml.replace(original_hash.encode(), signature.encode())
        self.assertEqual(fromstring(process_itn(xml, self.db, production_config())).findtext(".//confirmation"), "CONFIRMED")
        self.assertNotIn("Testowy", self.db.get(PremiumOrder, order_id).offer_snapshot)

    def test_non_ascii_signature_is_rejected_without_server_error(self):
        order_id = self.checkout()["order_id"]
        xml = self.notification(order_id)
        original_hash = fromstring(xml).findtext("hash")
        reply = fromstring(process_itn(xml.replace(original_hash.encode(), "ą".encode()), self.db, production_config()))
        self.assertEqual(reply.findtext(".//confirmation"), "NOTCONFIRMED")

    def test_status_endpoint_is_scoped_to_order_owner_and_does_not_mutate_it(self):
        order_id = self.checkout()["order_id"]
        router = build_premium_router(lambda: self.db, lambda: self.admin, lambda db: self.prices, lambda u: True)
        endpoint = next(route.endpoint for route in router.routes if route.path == "/premium/orders/{order_id}")
        with self.assertRaises(HTTPException) as error:
            endpoint(order_id, user=User(id=self.admin.id + 1), db=self.db)
        self.assertEqual(error.exception.status_code, 404)
        self.assertEqual(endpoint(order_id, user=self.admin, db=self.db)["status"], "pending")

    def test_seller_identity_is_public_and_no_nip_is_invented(self):
        seller = seller_details()
        self.assertTrue(seller["complete"])
        self.assertEqual(seller["name"], "Piotr Bronny")
        self.assertEqual(seller["nip"], "")

    def test_account_deletion_preserves_order_without_blocking_user_deletion(self):
        order_id = self.checkout()["order_id"]
        self.db.delete(self.admin)
        self.db.commit()
        self.db.expire_all()
        self.assertIsNone(self.db.get(PremiumOrder, order_id).user_id)

    def request(self, method, path, body=b"", content_type="application/json", authorized=False):
        if method == "POST" and path == "/premium/checkout":
            data = CheckoutData.model_validate_json(body)
            if not data.quote_token:
                q = make_quote(self.admin, data.package, data.period, data.expected_price, data.early_start_requested,
                               data.competition_id, seller_details(), db=self.db)
                body = data.model_copy(update={"quote_token": q["quote_token"]}).model_dump_json().encode()
        app = FastAPI()

        def current_user(authorization: str | None = Header(default=None)):
            if authorization != "Bearer test":
                raise HTTPException(401, "Wymagane logowanie")
            return self.admin

        app.include_router(build_premium_router(lambda: self.db, current_user,
                                               lambda db: self.prices, lambda u: u.role == "admin"))
        messages = []

        async def run():
            headers = [(b"content-type", content_type.encode())]
            if authorized:
                headers.append((b"authorization", b"Bearer test"))

            async def receive():
                return {"type": "http.request", "body": body, "more_body": False}

            async def send(message):
                messages.append(message)

            await app({"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
                       "method": method, "scheme": "https", "path": path, "raw_path": path.encode(),
                       "query_string": b"", "root_path": "", "headers": headers,
                       "server": ("example.test", 443), "client": ("127.0.0.1", 1234)}, receive, send)

        asyncio.run(run())
        status = next(m["status"] for m in messages if m["type"] == "http.response.start")
        payload = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
        return status, payload

    def test_http_routes_authentication_checkout_form_itn_and_order_status(self):
        status, body = self.request("GET", "/premium/commerce")
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)["sales_enabled"])
        status, _ = self.request("POST", "/premium/checkout", self.data.model_dump_json().encode())
        self.assertEqual(status, 401)
        status, body = self.request("POST", "/premium/checkout", self.data.model_dump_json().encode(), authorized=True)
        self.assertEqual(status, 200)
        order_id = json.loads(body)["order_id"]
        status, _ = self.request("GET", f"/premium/orders/{order_id}")
        self.assertEqual(status, 401)
        xml = self.notification(order_id)
        form = urlencode({"transactions": base64.b64encode(xml).decode()}).encode()
        status, body = self.request("POST", "/premium/autopay/production/itn", form, "application/x-www-form-urlencoded")
        self.assertEqual(status, 200)
        self.assertEqual(fromstring(body).findtext(".//confirmation"), "CONFIRMED")
        status, body = self.request("GET", f"/premium/orders/{order_id}", authorized=True)
        self.assertEqual((status, json.loads(body)["status"]), (200, "paid"))

    def test_http_itn_rejects_invalid_transport_and_oversized_request(self):
        for body, content_type, expected in (
            (b"not-xml", "text/xml", 415),
            (b"transactions=not-base64!", "application/x-www-form-urlencoded", 400),
            (b"transactions=a&transactions=b", "application/x-www-form-urlencoded", 400),
            (b"x" * 65537, "application/x-www-form-urlencoded", 413),
        ):
            with self.subTest(expected=expected):
                self.assertEqual(self.request("POST", "/premium/autopay/production/itn", body, content_type)[0], expected)

    def test_checkout_brake_is_enforced_on_server_but_does_not_block_existing_itn_or_status(self):
        existing = self.checkout()["order_id"]
        seed = self.db.get(PremiumOrder, self.checkout()["order_id"])
        seed.environment, seed.amount = "production", "10272.83"
        self.db.commit()
        transaction = fromstring(self.notification(seed.id, amount=seed.amount)).find(".//transaction")
        record_autopay_receipt(seed, transaction, self.db)
        self.db.commit()
        status, body = self.request("GET", "/premium/commerce")
        public = json.loads(body)
        self.assertTrue(public["payments_temporarily_unavailable"])
        self.assertEqual(public["payment_unavailable_message"], "Trwają prace serwisowe. Wpłata jest w tym momencie niedostępna.")
        for private in ("received", "reserved", "committed", "limit", "stop_at", "quarter"):
            self.assertNotIn(private, public)
        status, body = self.request("POST", "/premium/checkout", self.data.model_dump_json().encode(), authorized=True)
        self.assertEqual(status, 503)
        self.assertEqual(json.loads(body)["detail"], public["payment_unavailable_message"])
        self.assertEqual(self.db.query(PremiumOrder).count(), 2)
        # Previously issued payments must still be acknowledged and recorded.
        process_itn(self.notification(existing, remote="previous123"), self.db, production_config())
        status, body = self.request("GET", f"/premium/orders/{existing}", authorized=True)
        self.assertEqual((status, json.loads(body)["status"]), (200, "paid"))

    def test_checkout_rejects_a_new_order_that_would_cross_threshold(self):
        seed = self.db.get(PremiumOrder, self.checkout()["order_id"])
        seed.environment, seed.amount = "production", "10270.00"
        self.db.commit()
        transaction = fromstring(self.notification(seed.id, amount=seed.amount)).find(".//transaction")
        record_autopay_receipt(seed, transaction, self.db)
        self.db.commit()
        self.assertFalse(json.loads(self.request("GET", "/premium/commerce")[1])["payments_temporarily_unavailable"])
        status, _ = self.request("POST", "/premium/checkout", self.data.model_dump_json().encode(), authorized=True)
        self.assertEqual(status, 503)
        self.assertEqual(self.db.query(PremiumOrder).count(), 1)


if __name__ == "__main__":
    unittest.main()
