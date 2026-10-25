import asyncio
import base64
import hashlib
import json
import os
import unittest
from unittest.mock import patch
from urllib.parse import urlencode
from xml.etree.ElementTree import fromstring

from fastapi import FastAPI, Header, HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base
from models import PremiumOrder, User
from premium_payments import (
    CheckoutData, TERMS_VERSION, build_premium_router, create_sandbox_order,
    payment_hash, process_itn, sandbox_config, seller_details,
)


ENV = {
    "AUTOPAY_MODE": "sandbox", "AUTOPAY_SANDBOX_SERVICE_ID": "12345",
    "AUTOPAY_SANDBOX_SHARED_KEY": "sandbox-test-secret",
    "AUTOPAY_SANDBOX_GATEWAY_URL": "https://testpay.autopay.eu/payment",
    "AUTOPAY_SANDBOX_HASH_ALGORITHM": "sha256",
}


class PremiumPaymentTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, ENV)
        self.environment.start()
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        with self.engine.connect() as connection:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.admin = User(email="admin@example.test", role="admin", is_active=1,
                          premium_until="2026-12-31T23:59:59+01:00")
        self.db.add(self.admin)
        self.db.commit()
        self.prices = {kind: {"monthly_price": "12.34", "yearly_price": "123.45", "features": ["ranking"]}
                       for kind in ("shooter", "organizer")}
        self.data = CheckoutData(package="shooter", period="monthly", expected_price="12.34",
                                 terms_version=TERMS_VERSION, terms_accepted=True)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        self.environment.stop()

    def checkout(self, data=None, user=None):
        return create_sandbox_order(data or self.data, user or self.admin, self.db,
                                    lambda db: self.prices, lambda user: user.role == "admin")

    def notification(self, order_id, amount="12.34", currency="PLN", status="SUCCESS", service="12345"):
        values = [service, order_id, "remote123", amount, currency, "20261025200000", status]
        signature = payment_hash(values, sandbox_config())
        return (f"<transactionList><serviceID>{service}</serviceID><transactions><transaction>"
                f"<orderID>{order_id}</orderID><remoteID>remote123</remoteID><amount>{amount}</amount>"
                f"<currency>{currency}</currency><paymentDate>20261025200000</paymentDate>"
                f"<paymentStatus>{status}</paymentStatus></transaction></transactions>"
                f"<hash>{signature}</hash></transactionList>").encode()

    def test_official_hash_vector(self):
        config = {"key": "2test2", "algorithm": "sha256"}
        self.assertEqual(payment_hash(["2", "100", "1.50"], config),
                         "2ab52e6918c6ad3b69a8228a2ab815f11ad58533eeed963dd990df8d8c3709d1")
        self.assertEqual(payment_hash(["2", "", "100", None, "1.50"], config),
                         payment_hash(["2", "100", "1.50"], config))

    def test_default_disabled_and_production_mode_never_create_orders(self):
        for mode in ("", "disabled", "production", "live"):
            with self.subTest(mode=mode), patch.dict(os.environ, {"AUTOPAY_MODE": mode}):
                self.assertFalse(sandbox_config()["ready"])
                with self.assertRaises(HTTPException) as error:
                    self.checkout()
                self.assertEqual(error.exception.status_code, 503)
        self.assertEqual(self.db.query(PremiumOrder).count(), 0)

    def test_rejects_production_and_untrusted_gateway_hosts(self):
        for url in ("https://pay.autopay.eu/payment", "https://testpay.autopay.eu.evil.test/payment",
                    "https://testpay.autopay.eu@evil.test/payment", "http://testpay.autopay.eu/payment",
                    "https://testpay.autopay.eu/", "https://testpay.autopay.eu/payment?redirect=live"):
            with self.subTest(url=url), patch.dict(os.environ, {"AUTOPAY_SANDBOX_GATEWAY_URL": url}):
                self.assertFalse(sandbox_config()["ready"])

    def test_only_active_admin_can_start_sandbox(self):
        for role, active in (("user", 1), ("admin", 0)):
            self.admin.role, self.admin.is_active = role, active
            with self.assertRaises(HTTPException) as error:
                self.checkout()
            self.assertEqual(error.exception.status_code, 403)
        self.assertEqual(self.db.query(PremiumOrder).count(), 0)

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
                self.assertNotIn("sandbox-test-secret", str(result))
                self.assertEqual(result["fields"]["Hash"], hashlib.sha256(
                    f"12345|{order.id}|{price}|PLN|admin@example.test|sandbox-test-secret".encode()).hexdigest())

    def test_signed_itn_is_idempotent_and_never_grants_real_premium(self):
        order_id = self.checkout()["order_id"]
        self.prices["shooter"]["monthly_price"] = "99.99"
        for status in ("SUCCESS", "SUCCESS", "FAILURE", "PENDING"):
            reply = fromstring(process_itn(self.notification(order_id, status=status), self.db, sandbox_config()))
            self.assertEqual(reply.findtext(".//confirmation"), "CONFIRMED")
            self.assertEqual(reply.findtext("hash"), payment_hash(["12345", order_id, "CONFIRMED"], sandbox_config()))
            self.assertEqual(self.db.get(PremiumOrder, order_id).status, "paid")
        self.assertEqual(self.admin.premium_until, "2026-12-31T23:59:59+01:00")

    def test_wrong_amount_currency_order_or_status_never_confirms(self):
        order_id = self.checkout()["order_id"]
        for update in ({"amount": "0.01"}, {"currency": "EUR"}, {"order_id": "unknown"}, {"status": "BOGUS"}):
            args = {"order_id": order_id, **update}
            reply = fromstring(process_itn(self.notification(**args), self.db, sandbox_config()))
            self.assertEqual(reply.findtext(".//confirmation"), "NOTCONFIRMED")
            self.assertEqual(self.db.get(PremiumOrder, order_id).status, "pending")

    def test_bad_signatures_wrong_service_and_xml_attacks_are_rejected(self):
        order_id = self.checkout()["order_id"]
        valid = self.notification(order_id)
        for xml in (valid.replace(b"SUCCESS", b"FAILURE"), self.notification(order_id, service="999"),
                    b"<!DOCTYPE x [<!ENTITY x 'attack'>]><transactionList>&x;</transactionList>",
                    b"<broken", valid.replace(b"<amount>", b"<extra>1</extra><amount>")):
            with self.subTest(xml=xml[:70]), self.assertRaises(HTTPException):
                process_itn(xml, self.db, sandbox_config())
            self.assertEqual(self.db.get(PremiumOrder, order_id).status, "pending")

    def test_default_customer_data_is_included_in_signature_and_not_stored(self):
        order_id = self.checkout()["order_id"]
        xml = self.notification(order_id)
        original_hash = fromstring(xml).findtext("hash")
        signature = payment_hash(["12345", order_id, "remote123", "12.34", "PLN",
                                  "20261025200000", "SUCCESS", "Jan", "Testowy", "Nowy Targ"], sandbox_config())
        xml = xml.replace(b"</transaction>", b"<customerData><fName>Jan</fName><lName>Testowy</lName><city>Nowy Targ</city></customerData></transaction>")
        xml = xml.replace(original_hash.encode(), signature.encode())
        self.assertEqual(fromstring(process_itn(xml, self.db, sandbox_config())).findtext(".//confirmation"), "CONFIRMED")
        self.assertNotIn("Testowy", self.db.get(PremiumOrder, order_id).offer_snapshot)

    def test_non_ascii_signature_is_rejected_without_server_error(self):
        order_id = self.checkout()["order_id"]
        xml = self.notification(order_id)
        original_hash = fromstring(xml).findtext("hash")
        with self.assertRaises(HTTPException) as error:
            process_itn(xml.replace(original_hash.encode(), "ą".encode()), self.db, sandbox_config())
        self.assertEqual(error.exception.status_code, 400)

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
        self.assertFalse(json.loads(body)["sales_enabled"])
        status, _ = self.request("POST", "/premium/checkout", self.data.model_dump_json().encode())
        self.assertEqual(status, 401)
        status, body = self.request("POST", "/premium/checkout", self.data.model_dump_json().encode(), authorized=True)
        self.assertEqual(status, 200)
        order_id = json.loads(body)["order_id"]
        status, _ = self.request("GET", f"/premium/orders/{order_id}")
        self.assertEqual(status, 401)
        xml = self.notification(order_id)
        form = urlencode({"transactions": base64.b64encode(xml).decode()}).encode()
        status, body = self.request("POST", "/premium/autopay/itn", form, "application/x-www-form-urlencoded")
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
                self.assertEqual(self.request("POST", "/premium/autopay/itn", body, content_type)[0], expected)


if __name__ == "__main__":
    unittest.main()
