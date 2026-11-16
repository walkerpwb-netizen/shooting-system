import asyncio
import json
import unittest
import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from types import SimpleNamespace
from uuid import uuid4

from fastapi import FastAPI, Header, HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from gun_shops import build_gun_shops_router
from models import GunShop, GunShopSubmission


class GunShopTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        GunShop.__table__.create(self.engine)
        GunShopSubmission.__table__.create(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.app = FastAPI()

        def current_admin(authorization: str | None = Header(default=None)):
            if not authorization:
                raise HTTPException(401, "Wymagane logowanie")
            if authorization != "Bearer admin":
                raise HTTPException(403, "Brak uprawnień administratora")
            return SimpleNamespace(email="admin@example.test")

        def current_user(authorization: str | None = Header(default=None)):
            if not authorization:
                raise HTTPException(401, "Wymagane logowanie")
            return SimpleNamespace(email="user@example.test", first_name="Jan", last_name="Testowy")

        self.app.include_router(build_gun_shops_router(lambda: self.db, current_admin, current_user))

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def request(self, method, path="/admin/gun-shops", data=None, token="admin"):
        messages = []
        body = json.dumps(data).encode() if data is not None else b""

        async def run():
            async def receive():
                return {"type": "http.request", "body": body, "more_body": False}

            async def send(message):
                messages.append(message)

            headers = [(b"content-type", b"application/json")]
            if token is not None:
                headers.append((b"authorization", f"Bearer {token}".encode()))
            await self.app({"type": "http", "method": method, "path": path, "raw_path": path.encode(),
                            "query_string": b"", "headers": headers, "scheme": "http",
                            "server": ("test", 80), "client": ("127.0.0.1", 1234),
                            "root_path": "", "http_version": "1.1"}, receive, send)

        asyncio.run(run())
        status = next(message["status"] for message in messages if message["type"] == "http.response.start")
        response = b"".join(message.get("body", b"") for message in messages if message["type"] == "http.response.body")
        return status, json.loads(response)

    def test_create_read_update_delete_persists_contacts_location_and_source(self):
        self.assertEqual(self.request("GET"), (200, []))
        data = {"name": "  Sklep testowy  ", "phone": "+48123456789", "website": "example.test",
                "address": "Adres testowy", "latitude": 52.2, "longitude": 21.0,
                "license_source": "Źródło testowe"}
        status, shop = self.request("POST", data=data)
        self.assertEqual(status, 201)
        self.assertEqual(shop["name"], "Sklep testowy")
        self.assertEqual(shop["website"], "https://example.test")
        self.assertEqual(shop["updated_by"], "admin@example.test")
        self.assertNotIn("license_number", shop)
        self.assertEqual(shop["license_source"], data["license_source"])
        self.db.expire_all()
        self.assertEqual(self.request("GET")[1], [shop])
        data.update(name="Nowa nazwa", latitude=51.0, longitude=20.0)
        status, updated = self.request("PUT", f'/admin/gun-shops/{shop["id"]}', data)
        self.assertEqual(status, 200)
        self.assertEqual(updated["name"], "Nowa nazwa")
        self.assertEqual(updated["latitude"], 51.0)
        self.assertEqual(updated["created_at"], shop["created_at"])
        self.assertEqual(self.request("DELETE", f'/admin/gun-shops/{shop["id"]}')[0], 200)
        self.assertEqual(self.request("GET"), (200, []))

    def test_incomplete_draft_does_not_invent_source_or_location(self):
        status, shop = self.request("POST", data={"name": "Do uzupełnienia"})
        self.assertEqual(status, 201)
        self.assertIsNone(shop["latitude"])
        self.assertIsNone(shop["longitude"])
        self.assertNotIn("license_number", shop)
        self.assertEqual(shop["license_source"], "")
        self.assertEqual(self.request("GET", "/gun-shops"), (200, []))

    def test_all_operations_require_administrator(self):
        for token, expected in ((None, 401), ("shooter", 403)):
            for method, path in (("GET", "/admin/gun-shops"), ("POST", "/admin/gun-shops"),
                                 ("PUT", "/admin/gun-shops/1"), ("DELETE", "/admin/gun-shops/1")):
                with self.subTest(token=token, method=method):
                    self.assertEqual(self.request(method, path, {"name": "Test"}, token)[0], expected)
        self.assertEqual(self.db.query(GunShop).count(), 0)

    def test_validation_rejects_partial_foreign_nonfinite_coordinates_and_unsafe_urls(self):
        for update in ({"name": " "}, {"latitude": 52.0}, {"longitude": 21.0},
                       {"latitude": 60.0, "longitude": 21.0}, {"latitude": 52.0, "longitude": 30.0},
                       {"latitude": "NaN", "longitude": 21.0},
                       {"latitude": "Infinity", "longitude": 21.0},
                       {"website": "javascript:alert(1)"}, {"website": "ftp://example.test"},
                       {"website": "https://user:password@example.test"}, {"website": "https://[broken"}):
            with self.subTest(update=update):
                self.assertEqual(self.request("POST", data={"name": "Test", **update})[0], 422)
        self.assertEqual(self.db.query(GunShop).count(), 0)

    def test_missing_shop_returns_404_without_creating_a_record(self):
        self.assertEqual(self.request("PUT", "/admin/gun-shops/9999", {"name": "Test"})[0], 404)
        self.assertEqual(self.request("DELETE", "/admin/gun-shops/9999")[0], 404)
        self.assertEqual(self.db.query(GunShop).count(), 0)


SHOP_DATA = {"name": "Sklep testowy", "phone": "+48123456789", "website": "https://example.test",
             "address": "Adres testowy", "latitude": 52.2, "longitude": 21.0,
             "license_source": "Testowe źródło informacji"}


class GunShopSubmissionTests(unittest.TestCase):
    setUp = GunShopTests.setUp
    tearDown = GunShopTests.tearDown
    request = GunShopTests.request

    def submit(self, **updates):
        status, entry = self.request("POST", "/gun-shop-submissions", {**SHOP_DATA, **updates}, token="shooter")
        self.assertEqual(status, 201)
        return entry

    def approve(self, entry):
        return self.request("PUT", f'/admin/gun-shop-submissions/{entry["id"]}/approve')

    def test_pending_submission_is_private_and_requires_logged_in_submitter(self):
        self.assertEqual(self.request("POST", "/gun-shop-submissions", SHOP_DATA, token=None)[0], 401)
        entry = self.submit(is_published=True)
        self.assertEqual(entry["status"], "pending")
        self.assertEqual(entry["submitted_by_name"], "Jan Testowy")
        self.assertEqual(self.request("GET", "/gun-shops", token=None), (200, []))
        self.assertEqual(self.request("GET")[1], [])
        self.assertEqual(self.request("GET", "/admin/gun-shop-submissions")[1], [entry])

    def test_all_moderation_routes_require_administrator(self):
        entry = self.submit()
        path = f'/admin/gun-shop-submissions/{entry["id"]}'
        for token, status in ((None, 401), ("shooter", 403)):
            for method, target in (("GET", "/admin/gun-shop-submissions"), ("PUT", path),
                                   ("PUT", path + "/approve"), ("PUT", path + "/reject")):
                with self.subTest(token=token, target=target):
                    self.assertEqual(self.request(method, target, SHOP_DATA, token)[0], status)
        self.assertEqual(self.db.query(GunShop).count(), 0)

    def test_approval_publishes_once_keeps_review_history_and_hides_private_metadata(self):
        entry = self.submit()
        status, shop = self.approve(entry)
        self.assertEqual(status, 200)
        self.assertTrue(shop["is_published"])
        self.assertEqual(self.approve(entry), (200, shop))
        self.assertEqual(self.db.query(GunShop).count(), 1)
        reviewed = self.db.get(GunShopSubmission, entry["id"])
        self.assertEqual(reviewed.status, "approved")
        self.assertEqual(reviewed.approved_shop_id, shop["id"])
        self.assertEqual(reviewed.reviewed_by, "admin@example.test")
        self.assertEqual(self.request("GET", "/admin/gun-shop-submissions")[1], [])
        published = self.request("GET", "/gun-shops", token=None)[1]
        self.assertEqual(published[0]["id"], shop["id"])
        self.assertTrue({"license_source", "updated_by", "identity_key", "submitted_by_email"}.isdisjoint(published[0]))

    def test_admin_can_edit_and_publish_submission_without_license_information(self):
        entry = self.submit(license_source="")
        self.assertEqual(self.request("GET", "/gun-shops")[1], [])
        self.assertEqual(self.request("PUT", f'/admin/gun-shop-submissions/{entry["id"]}', {**SHOP_DATA, "license_source": ""})[0], 200)
        status, shop = self.approve(entry)
        self.assertEqual(status, 200)
        self.assertNotIn("license_number", shop)
        self.assertEqual(shop["license_source"], "")

    def test_rejection_never_publishes_and_approved_record_cannot_be_rejected(self):
        entry = self.submit()
        path = f'/admin/gun-shop-submissions/{entry["id"]}/reject'
        self.assertEqual(self.request("PUT", path)[1]["status"], "rejected")
        self.assertEqual(self.request("GET", "/gun-shops")[1], [])
        self.assertEqual(self.approve(entry)[0], 200)
        self.assertEqual(self.request("PUT", path)[0], 409)

    def test_change_is_moderated_and_updates_the_same_shop(self):
        _, original = self.approve(self.submit())
        change = self.submit(source_shop_id=original["id"], name="Nowa nazwa")
        self.assertEqual(self.request("GET", "/gun-shops")[1][0]["name"], SHOP_DATA["name"])
        status, updated = self.approve(change)
        self.assertEqual(status, 200)
        self.assertEqual(updated["id"], original["id"])
        self.assertEqual(updated["name"], "Nowa nazwa")
        self.assertEqual(self.db.query(GunShop).count(), 1)

    def test_contact_correction_preserves_existing_information_source(self):
        _, original = self.approve(self.submit())
        change = self.submit(source_shop_id=original["id"], name="Nowa nazwa", license_source="")
        status, updated = self.approve(change)
        self.assertEqual(status, 200)
        self.assertNotIn("license_number", updated)
        self.assertEqual(updated["license_source"], original["license_source"])

    def test_deleted_source_is_not_recreated_and_private_source_is_not_exposed(self):
        _, draft = self.request("POST", data={"name": "Prywatny szkic"})
        self.assertEqual(self.request("POST", "/gun-shop-submissions", {**SHOP_DATA, "source_shop_id": draft["id"]})[0], 404)
        _, original = self.approve(self.submit())
        change = self.submit(source_shop_id=original["id"], name="Zmiana")
        self.assertEqual(self.request("DELETE", f'/admin/gun-shops/{original["id"]}')[0], 200)
        self.assertEqual(self.approve(change)[0], 409)
        self.assertEqual(self.request("GET", "/gun-shops")[1], [])
        self.assertEqual(self.request("POST", "/gun-shop-submissions", {**SHOP_DATA, "source_shop_id": 9999})[0], 404)

    def test_identical_submissions_do_not_create_duplicate_shops(self):
        first = self.submit()
        second = self.submit(name="  SKLEP   TESTOWY  ")
        self.assertEqual(self.approve(first)[0], 200)
        self.assertEqual(self.approve(second)[0], 409)
        self.assertEqual(self.db.query(GunShop).count(), 1)
        self.assertEqual(self.db.get(GunShopSubmission, second["id"]).status, "pending")
        self.assertEqual(self.request("POST", data=SHOP_DATA)[0], 409)

    def test_publication_is_explicit_and_requires_complete_data(self):
        self.assertEqual(self.request("POST", data={"name": "Niekompletny", "is_published": True})[0], 422)
        status, shop = self.request("POST", data={**SHOP_DATA, "license_source": "", "is_published": True})
        self.assertEqual(status, 201)
        self.assertEqual(len(self.request("GET", "/gun-shops")[1]), 1)
        self.assertEqual(self.request("PUT", f'/admin/gun-shops/{shop["id"]}', SHOP_DATA)[0], 200)
        self.assertEqual(self.request("GET", "/gun-shops")[1], [])

    def test_legacy_license_number_input_is_not_stored_or_returned(self):
        entry = self.submit(license_number="LEGACY-NUMBER")
        self.assertNotIn("license_number", entry)
        _, shop = self.approve(entry)
        self.assertNotIn("license_number", shop)
        self.assertNotIn("license_number", self.request("GET", "/gun-shops")[1][0])
        self.assertNotIn("license_number", GunShop.__table__.columns)
        self.assertNotIn("license_number", GunShopSubmission.__table__.columns)

    def test_submission_requires_contact_and_location_and_cannot_change_source_on_edit(self):
        for updates in ({"phone": ""}, {"website": ""}, {"latitude": None, "longitude": None},
                        {"latitude": 60}, {"website": "javascript:alert(1)"}):
            with self.subTest(updates=updates):
                self.assertEqual(self.request("POST", "/gun-shop-submissions", {**SHOP_DATA, **updates})[0], 422)
        entry = self.submit()
        self.assertEqual(self.request("PUT", f'/admin/gun-shop-submissions/{entry["id"]}', {**SHOP_DATA, "source_shop_id": 5})[0], 409)


@unittest.skipUnless(os.environ.get("TEST_POSTGRES_URL"), "TEST_POSTGRES_URL is not configured")
class ConcurrentShopApprovalTests(unittest.TestCase):
    request = GunShopTests.request

    def setUp(self):
        self.schema = "shop_approval_" + uuid4().hex
        self.admin_engine = create_engine(os.environ["TEST_POSTGRES_URL"])
        with self.admin_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{self.schema}"'))
        self.engine = create_engine(os.environ["TEST_POSTGRES_URL"], connect_args={"options": f"-csearch_path={self.schema}"})
        GunShop.__table__.create(self.engine)
        GunShopSubmission.__table__.create(self.engine)
        self.sessions = sessionmaker(bind=self.engine)
        self.app = FastAPI()
        def get_db():
            with self.sessions() as db:
                yield db
        actor = SimpleNamespace(email="admin@example.test", first_name="Test", last_name="Admin")
        self.app.include_router(build_gun_shops_router(get_db, lambda: actor, lambda: actor))

    def tearDown(self):
        self.engine.dispose()
        with self.admin_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{self.schema}" CASCADE'))
        self.admin_engine.dispose()

    def approve_together(self, ids):
        barrier = Barrier(2)
        def approve(entry_id):
            barrier.wait(timeout=10)
            return self.request("PUT", f"/admin/gun-shop-submissions/{entry_id}/approve")
        with ThreadPoolExecutor(max_workers=2) as pool:
            return list(pool.map(approve, ids))

    def test_parallel_approval_of_one_submission_returns_one_shop(self):
        _, entry = self.request("POST", "/gun-shop-submissions", SHOP_DATA)
        results = self.approve_together([entry["id"], entry["id"]])
        self.assertEqual([status for status, _ in results], [200, 200])
        self.assertEqual(results[0][1]["id"], results[1][1]["id"])
        self.assertEqual(len(self.request("GET", "/gun-shops")[1]), 1)

    def test_parallel_identical_submissions_do_not_duplicate_the_directory(self):
        _, first = self.request("POST", "/gun-shop-submissions", SHOP_DATA)
        _, second = self.request("POST", "/gun-shop-submissions", SHOP_DATA)
        results = self.approve_together([first["id"], second["id"]])
        self.assertEqual(sorted(status for status, _ in results), [200, 409])
        self.assertEqual(len(self.request("GET", "/gun-shops")[1]), 1)
