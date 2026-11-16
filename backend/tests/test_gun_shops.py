import asyncio
import json
import unittest
from types import SimpleNamespace

from fastapi import FastAPI, Header, HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from gun_shops import build_gun_shops_router
from models import GunShop


class GunShopTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        GunShop.__table__.create(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.app = FastAPI()

        def current_admin(authorization: str | None = Header(default=None)):
            if not authorization:
                raise HTTPException(401, "Wymagane logowanie")
            if authorization != "Bearer admin":
                raise HTTPException(403, "Brak uprawnień administratora")
            return SimpleNamespace(email="admin@example.test")

        self.app.include_router(build_gun_shops_router(lambda: self.db, current_admin))

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

    def test_create_read_update_delete_persists_contacts_location_and_license(self):
        self.assertEqual(self.request("GET"), (200, []))
        data = {"name": "  Sklep testowy  ", "phone": "+48123456789", "website": "example.test",
                "address": "Adres testowy", "latitude": 52.2, "longitude": 21.0,
                "license_number": "TEST-123", "license_source": "Źródło testowe"}
        status, shop = self.request("POST", data=data)
        self.assertEqual(status, 201)
        self.assertEqual(shop["name"], "Sklep testowy")
        self.assertEqual(shop["website"], "https://example.test")
        self.assertEqual(shop["updated_by"], "admin@example.test")
        self.assertEqual(shop["license_number"], data["license_number"])
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

    def test_incomplete_draft_does_not_invent_license_or_location(self):
        status, shop = self.request("POST", data={"name": "Do uzupełnienia"})
        self.assertEqual(status, 201)
        self.assertIsNone(shop["latitude"])
        self.assertIsNone(shop["longitude"])
        self.assertEqual(shop["license_number"], "")
        self.assertEqual(shop["license_source"], "")
        self.assertEqual(self.request("GET", "/gun-shops")[0], 404)

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
