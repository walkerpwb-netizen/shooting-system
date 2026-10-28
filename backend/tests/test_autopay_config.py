import asyncio
import json
import os
import stat
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI, Header, HTTPException

from autopay_config import (
    ConfigurationData, GATEWAYS, build_autopay_settings_router, configuration_status,
    read_configuration, save_configuration,
)
from premium_payments import production_config


class AutopayConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "private" / "autopay.json"
        self.path_patch = patch("autopay_config.CONFIG_PATH", self.path)
        self.path_patch.start()
        self.env_patch = patch.dict(os.environ, {"AUTOPAY_MODE": "disabled", **{
            f"AUTOPAY_{name}_{field}": "" for name in ("PRODUCTION",)
            for field in ("SERVICE_ID", "SHARED_KEY")}})
        self.env_patch.start()
        smtp = patch("mailer.is_mail_configured", return_value=True)
        smtp.start(); self.addCleanup(smtp.stop)
        self.admin = SimpleNamespace(email="admin@example.test", is_active=1)

    def tearDown(self):
        self.env_patch.stop()
        self.path_patch.stop()
        self.temp.cleanup()

    def payload(self, revision=0, mode="disabled"):
        return {"revision": revision, "mode": mode, "production_callbacks_configured": True, **{name: {
            "service_id": "67890", "gateway_url": GATEWAYS[name],
            "algorithm": "sha256", "shared_key": f"private-{name}-test-key", "remove_key": False,
        } for name in GATEWAYS}}

    def save(self, payload):
        return save_configuration(ConfigurationData.model_validate(payload), self.admin)

    def request(self, method="GET", payload=None, role="admin", raw=None):
        app = FastAPI()

        def admin(authorization: str | None = Header(default=None)):
            if authorization is None:
                raise HTTPException(401, "Wymagane logowanie")
            if authorization != "Bearer admin":
                raise HTTPException(403, "Brak uprawnień administratora")
            return self.admin

        app.include_router(build_autopay_settings_router(admin))
        messages = []
        body = raw if raw is not None else json.dumps(payload).encode() if payload is not None else b""

        async def run():
            async def receive():
                return {"type": "http.request", "body": body, "more_body": False}

            async def send(message):
                messages.append(message)

            headers = [(b"content-type", b"application/json")]
            if role:
                headers.append((b"authorization", f"Bearer {role}".encode()))
            await app({"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": method,
                       "scheme": "https", "path": "/admin/settings/autopay", "raw_path": b"/admin/settings/autopay",
                       "root_path": "", "query_string": b"", "headers": headers,
                       "server": ("example.test", 443), "client": ("127.0.0.1", 1234)}, receive, send)

        asyncio.run(run())
        start = next(m for m in messages if m["type"] == "http.response.start")
        raw = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
        return start["status"], dict(start["headers"]), json.loads(raw)

    def test_only_admin_can_read_or_write(self):
        for method in ("GET", "PUT"):
            self.assertEqual(self.request(method, self.payload(), role=None)[0], 401)
            self.assertEqual(self.request(method, self.payload(), role="organizer")[0], 403)
        self.admin.is_active = 0
        for method in ("GET", "PUT"):
            self.assertEqual(self.request(method, self.payload())[0], 403)
        self.assertFalse(self.path.exists())

    def test_private_atomic_storage_and_masked_round_trip(self):
        code, headers, saved = self.request("PUT", self.payload())
        self.assertEqual(code, 200)
        self.assertEqual(headers[b"cache-control"], b"no-store")
        self.assertFalse(saved["sales_enabled"])
        self.assertEqual(saved["revision"], 1)
        self.assertTrue(saved["production"]["complete"])
        self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(self.path.parent.stat().st_mode), 0o700)
        self.assertEqual(read_configuration()["production"]["shared_key"], "private-production-test-key")
        code, headers, loaded = self.request()
        self.assertEqual(code, 200)
        self.assertEqual(headers[b"cache-control"], b"no-store")
        self.assertEqual(saved, loaded)
        self.assertNotIn("private-production-test-key", json.dumps(loaded))
        self.assertNotIn("shared_key", loaded["production"])
        self.assertEqual(loaded["notification_url"], "https://system-strzelecki.pl/api/premium/autopay/production/itn")
        self.assertFalse(production_config()["ready"])

    def test_production_configuration_takes_effect_without_restart(self):
        self.save(self.payload(mode="production"))
        config = production_config()
        self.assertTrue(config["ready"])
        self.assertEqual(config["service"], "67890")
        self.assertEqual(config["key"], "private-production-test-key")
        self.assertEqual(config["gateway"], GATEWAYS["production"])
        value = self.payload(revision=1)
        value["production"]["shared_key"] = ""
        self.save(value)
        self.assertFalse(production_config()["ready"])

    def test_blank_preserves_key_and_explicit_remove_does_not_fall_back_to_environment(self):
        self.save(self.payload())
        value = self.payload(revision=1)
        value["production"]["shared_key"] = ""
        self.save(value)
        self.assertEqual(read_configuration()["production"]["shared_key"], "private-production-test-key")
        value["revision"] = 2
        value["production"]["remove_key"] = True
        with patch.dict(os.environ, {"AUTOPAY_PRODUCTION_SHARED_KEY": "fallback-must-not-return"}):
            status = self.save(value)
            self.assertFalse(status["production"]["key_configured"])
            self.assertEqual(read_configuration()["production"]["shared_key"], "")

    def test_invalid_input_never_echoes_secret_or_overwrites_existing_configuration(self):
        self.save(self.payload())
        before = self.path.read_bytes()
        for change in ({"mode": "unsupported"}, {"unknown": "private-secret-in-extra-field"}, {"revision": "wrong"}):
            value = {**self.payload(revision=1), **change}
            code, _, result = self.request("PUT", value)
            self.assertEqual(code, 400)
            self.assertNotIn("private-", json.dumps(result))
            self.assertEqual(self.path.read_bytes(), before)
        for name, field, value in (("production", "gateway_url", "https://invalid.example/payment"),
                                   ("production", "service_id", "not-number"),
                                   ("production", "shared_key", "private-secret\nvalue"),
                                   ("production", "algorithm", "md5"),
                                   ("production", "gateway_url", "https://evil.example/payment")):
            payload = self.payload(revision=1)
            payload[name][field] = value
            code, _, body = self.request("PUT", payload)
            self.assertEqual(code, 400)
            self.assertNotIn("private-", json.dumps(body))
            self.assertEqual(self.path.read_bytes(), before)

    def test_key_cannot_be_kept_for_a_changed_service_or_algorithm(self):
        self.save(self.payload())
        value = self.payload(revision=1)
        value["production"].update(service_id="54321", shared_key="")
        self.assertEqual(self.request("PUT", value)[0], 400)
        value["production"]["shared_key"] = "new-service-key"
        self.assertEqual(self.request("PUT", value)[0], 200)

    def test_incomplete_production_configuration_cannot_be_enabled(self):
        value = self.payload(mode="production")
        value["production"]["shared_key"] = ""
        self.assertEqual(self.request("PUT", value)[0], 400)
        self.assertFalse(self.path.exists())
        value["mode"] = "disabled"
        self.assertEqual(self.request("PUT", value)[0], 200)

    def test_retired_options_are_rejected_and_saved_legacy_data_is_pruned(self):
        for change in ({"mode": "sandbox"}, {"sandbox": {"shared_key": "private-retired"}}, {"shared_credentials_confirmed": True}):
            status, _, body = self.request("PUT", {**self.payload(), **change})
            self.assertEqual(status, 400)
            self.assertNotIn("private-", json.dumps(body))
        self.save(self.payload())
        legacy = read_configuration()
        legacy["sandbox"] = {"shared_key": "private-retired"}
        self.path.write_text(json.dumps(legacy))
        self.save(self.payload(revision=1))
        saved = read_configuration()
        self.assertNotIn("sandbox", saved)
        self.assertEqual(saved["production"]["shared_key"], "private-production-test-key")

    def test_bad_json_oversized_body_and_production_mode_are_rejected_without_secret_echo(self):
        for raw, code in ((b"{broken", 400), (b"x" * 8193, 413), (b"[]", 400)):
            self.assertEqual(self.request("PUT", raw=raw)[0], code)
        self.assertNotIn("private-production-test-key", repr(ConfigurationData.model_validate(self.payload())))

    def test_corrupt_unsafe_or_symlinked_configuration_disables_payments(self):
        self.save(self.payload(mode="production"))
        self.path.chmod(0o644)
        self.assertEqual(self.request()[0], 503)
        self.assertFalse(production_config()["ready"])
        self.path.chmod(0o600)
        self.path.write_text("{broken")
        self.assertEqual(self.request()[0], 503)
        self.assertFalse(production_config()["ready"])
        self.path.unlink()
        self.path.symlink_to(Path(self.temp.name) / "missing")
        self.assertEqual(self.request()[0], 503)
        self.assertFalse(production_config()["ready"])

    def test_failed_atomic_replace_keeps_old_file_and_removes_temporary_secret_file(self):
        self.save(self.payload())
        original = self.path.read_bytes()
        with patch("autopay_config.os.replace", side_effect=OSError("failure")):
            self.assertEqual(self.request("PUT", self.payload(revision=1))[0], 503)
        self.assertEqual(self.path.read_bytes(), original)
        self.assertEqual(list(self.path.parent.glob(".autopay-*")), [])

    def test_concurrent_updates_use_revision_to_prevent_lost_keys(self):
        barrier = Barrier(2)

        def save(number):
            value = self.payload()
            value["production"]["shared_key"] = f"private-key-{number}"
            barrier.wait(timeout=10)
            try:
                return self.save(value)["revision"]
            except HTTPException as error:
                return error.status_code

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(save, range(2)))
        self.assertCountEqual(results, [1, 409])
        self.assertIn(read_configuration()["production"]["shared_key"], ["private-key-0", "private-key-1"])
        self.assertEqual(configuration_status(read_configuration())["revision"], 1)


if __name__ == "__main__":
    unittest.main()
