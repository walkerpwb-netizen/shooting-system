"""Exercise the real production nginx rules without changing the running site."""

from contextlib import contextmanager
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import tempfile
import threading
import time
import unittest
from unittest.mock import patch


REPO = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("maintenance", REPO / "deploy/scripts/maintenance.py")
maintenance = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(maintenance)


class ControlTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        state_dir = Path(self.temporary.name)
        self.path = state_dir / "state.conf"
        for attribute, value in (("STATE_DIR", state_dir), ("CONFIG_PATH", self.path)):
            patcher = patch.object(maintenance, attribute, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        maintenance.atomic_write(self.path, maintenance.render_config(maintenance.initial_state()))

    def test_rejects_config_injection_and_network_ranges(self):
        for value in ("1.2.3.4; default 1;", "0.0.0.0/0", "example.com", "", "::/0", "fe80::1%eth0", "fe80::1%x; default 1;"):
            with self.subTest(value=value), self.assertRaises(Exception):
                maintenance.render_config({"enabled": True, "allowed_ips": [value]})
        config = maintenance.render_config({"enabled": True, "allowed_ips": ["2001:db8::1", "192.0.2.1"]})
        self.assertIn("2001:db8::1 1;", config)
        self.assertIn("geo $remote_addr", config)
        self.assertNotIn("forwarded", config)

    def test_install_preserves_existing_mode(self):
        state = {"enabled": True, "allowed_ips": ["192.0.2.1"], "updated_at": "test"}
        maintenance.atomic_write(self.path, maintenance.render_config(state))
        with patch("sys.argv", ["maintenance", "install"]), patch("os.geteuid", return_value=0):
            maintenance.main()
        self.assertEqual(maintenance.read_state(), state)

    def test_failed_nginx_test_restores_previous_state(self):
        previous = self.path.read_text()
        with patch.object(maintenance, "run", side_effect=[subprocess.CalledProcessError(1, "nginx"), None, None]):
            with self.assertRaisesRegex(RuntimeError, "Przywrócono poprzedni stan"):
                maintenance.update_state({"enabled": True, "allowed_ips": ["192.0.2.1"]})
        self.assertEqual(self.path.read_text(), previous)

    def test_failed_reload_restores_previous_state(self):
        previous = self.path.read_text()
        with patch.object(maintenance, "run", side_effect=[None, subprocess.CalledProcessError(1, "reload"), None, None]):
            with self.assertRaises(RuntimeError):
                maintenance.update_state({"enabled": True, "allowed_ips": ["192.0.2.1"]})
        self.assertEqual(self.path.read_text(), previous)

    def test_cli_changes_and_last_address_protection(self):
        def invoke(*arguments):
            with patch("sys.argv", ["maintenance", *arguments]), patch("os.geteuid", return_value=0), patch.object(maintenance, "run"):
                return maintenance.main()

        invoke("on", "--allow", "192.0.2.1")
        self.assertTrue(maintenance.read_state()["enabled"])
        invoke("allow-add", "2001:db8::1")
        invoke("allow-remove", "192.0.2.1")
        with self.assertRaisesRegex(RuntimeError, "ostatniego IP"):
            invoke("allow-remove", "2001:db8::1")
        self.assertEqual(maintenance.read_state()["allowed_ips"], ["2001:db8::1"])
        invoke("off")
        self.assertFalse(maintenance.read_state()["enabled"])
        self.assertEqual(maintenance.read_state()["allowed_ips"], ["2001:db8::1"])

    def test_ssh_address_is_resolved_before_sudo(self):
        with patch("sys.argv", ["maintenance", "on", "--ssh"]), patch.dict("os.environ", {"SSH_CONNECTION": "2001:db8::5 12345 2001:db8::9 22"}), patch("os.geteuid", return_value=1000), patch("subprocess.call", return_value=0) as sudo:
            maintenance.main()
        self.assertEqual(sudo.call_args.args[0][-3:], ["on", "--allow", "2001:db8::5"])


class Upstream(BaseHTTPRequestHandler):
    def do_GET(self):
        self.reply()

    def do_POST(self):
        self.reply()

    def do_HEAD(self):
        self.reply()

    def reply(self):
        body = json.dumps({"upstream": True, "method": self.command, "path": self.path}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def log_message(self, *args):
        pass


@unittest.skipUnless(shutil.which("nginx"), "nginx is required for integration checks")
class NginxTests(unittest.TestCase):
    @contextmanager
    def site(self, enabled=True, allowed_ips=None):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            state = {"enabled": enabled, "allowed_ips": allowed_ips or [], "updated_at": None}
            (directory / "state.conf").write_text(maintenance.render_config(state))
            maps = (REPO / "deploy/nginx/maintenance-http.conf").read_text().replace(str(maintenance.CONFIG_PATH), str(directory / "state.conf"))
            rules = (REPO / "deploy/nginx/maintenance-server.conf").read_text().replace("/var/lib/shooting-system/maintenance/public", str(REPO / "deploy/maintenance"))
            # Exercise all actual production locations, including the Codex endpoint.
            production = (REPO / "deploy/nginx/shooting-system.conf").read_text()
            server = "server {" + production.rsplit("\nserver {", 1)[1]
            server = "\n".join(line for line in server.splitlines() if not any(value in line for value in ("ssl_certificate", "ssl_dhparam", "include /etc/letsencrypt/")))
            with socket.socket() as reserve:
                reserve.bind(("127.0.0.1", 0))
                port = reserve.getsockname()[1]
            upstream = ThreadingHTTPServer(("127.0.0.1", 0), Upstream)
            worker = threading.Thread(target=upstream.serve_forever, daemon=True)
            worker.start()
            server = server.replace("listen 443 ssl;", f"listen 127.0.0.1:{port};")
            server = server.replace("include /etc/nginx/snippets/shooting-maintenance-server.conf;", rules)
            for upstream_port in (8000, 3000):
                server = server.replace(f"127.0.0.1:{upstream_port}", f"127.0.0.1:{upstream.server_port}")
            config = directory / "nginx.conf"
            config.write_text(f"pid {directory}/nginx.pid; error_log {directory}/error.log; events {{}} http {{ access_log off; {maps} {server} }}")
            process = subprocess.Popen([shutil.which("nginx"), "-p", temporary, "-c", str(config), "-g", "daemon off;"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)

            def request(path, method="GET", source="127.0.0.2", headers=None):
                connection = http.client.HTTPConnection("127.0.0.1", port, timeout=3, source_address=(source, 0))
                try:
                    connection.request(method, path, headers=headers or {})
                    response = connection.getresponse()
                    return response.status, dict(response.getheaders()), response.read()
                finally:
                    connection.close()

            try:
                for attempt in range(100):
                    if process.poll() is not None:
                        self.fail(process.communicate()[1].decode())
                    try:
                        request("/maintenance/status")
                        break
                    except ConnectionRefusedError:
                        time.sleep(0.02)
                else:
                    self.fail("nginx did not become ready")

                def configure(state):
                    def run_control(command):
                        if "-t" in command:
                            subprocess.run([shutil.which("nginx"), "-p", temporary, "-c", str(config), "-t"], check=True, capture_output=True)
                        else:
                            process.send_signal(signal.SIGHUP)

                    with patch.object(maintenance, "CONFIG_PATH", directory / "state.conf"), patch.object(maintenance, "run", side_effect=run_control):
                        maintenance.update_state(state)
                    applied_since = None
                    for attempt in range(100):
                        current = json.loads(request("/maintenance/status")[2])
                        expected = int(state["enabled"] and "127.0.0.2" not in state["allowed_ips"])
                        if current == {"enabled": int(state["enabled"]), "restricted": expected}:
                            if applied_since is None:
                                applied_since = time.monotonic()
                            # Old workers drain briefly during a graceful reload.
                            if time.monotonic() - applied_since >= 0.25:
                                break
                        else:
                            applied_since = None
                        time.sleep(0.02)
                    else:
                        self.fail("nginx did not apply maintenance state")

                request.configure = configure
                yield request
            finally:
                process.terminate()
                process.communicate(timeout=5)
                upstream.shutdown()
                upstream.server_close()
                worker.join(timeout=5)

    def test_blocks_all_app_and_api_routes_including_writes(self):
        with self.site() as request:
            for path in ("/", "/login", "/profile", "/docs", "/openapi.json", "/_next/static/app.js", "/api/health", "/api/me", "/admin/codex-command"):
                for method in ("GET", "POST", "HEAD"):
                    with self.subTest(path=path, method=method):
                        code, headers, body = request(path, method)
                        self.assertEqual(code, 503)
                        self.assertEqual(headers["Cache-Control"], "no-store")
                        self.assertEqual(headers["Retry-After"], "60")
                        self.assertEqual(headers["X-Maintenance-Mode"], "1")
                        if method != "HEAD":
                            if path.startswith("/api/"):
                                self.assertTrue(json.loads(body)["maintenance"])
                            else:
                                self.assertIn("Trwają prace serwisowe".encode(), body)

    def test_allowed_ip_and_local_health_checks_keep_access(self):
        with self.site(allowed_ips=["127.0.0.3"]) as request:
            for source in ("127.0.0.1", "127.0.0.3"):
                for path in ("/", "/api/health", "/admin/codex-command"):
                    with self.subTest(source=source, path=path):
                        code, _, body = request(path, source=source)
                        self.assertEqual(code, 200)
                        self.assertTrue(json.loads(body)["upstream"])
                self.assertEqual(json.loads(request("/maintenance/status", source=source)[2]), {"enabled": 1, "restricted": 0})
            self.assertEqual(request("/")[0], 503)

    def test_forwarded_headers_do_not_bypass_ip_restriction(self):
        with self.site(allowed_ips=["192.0.2.1"]) as request:
            code, _, _ = request("/api/me", headers={"X-Forwarded-For": "192.0.2.1", "X-Real-IP": "127.0.0.1", "Forwarded": "for=192.0.2.1"})
            self.assertEqual(code, 503)

    def test_only_production_autopay_post_is_exempt(self):
        with self.site() as request:
            path = "/api/premium/autopay/production/itn"
            code, _, body = request(path, "POST")
            self.assertEqual(code, 200)
            self.assertEqual(json.loads(body)["method"], "POST")
            self.assertEqual(json.loads(body)["path"], path.removeprefix("/api"))
            self.assertEqual(request(path)[0], 503)
            for removed in ("/api/premium/autopay/itn", "/api/premium/autopay/sandbox/itn", path + "/extra", "/api/premium/autopay/fake/itn"):
                self.assertEqual(request(removed, "POST")[0], 503)

    def test_recovery_assets_work_without_upstreams_and_do_not_leak_ips(self):
        with self.site(allowed_ips=["192.0.2.1"]) as request:
            code, headers, body = request("/maintenance/status?fresh=1")
            self.assertEqual(code, 200)
            self.assertEqual(json.loads(body), {"enabled": 1, "restricted": 1})
            self.assertEqual(headers["Cache-Control"], "no-store")
            self.assertNotIn(b"192.0.2.1", body)
            self.assertEqual(request("/maintenance/recovery.js")[0], 200)
            self.assertEqual(request("/maintenance/status", "POST")[0], 503)
            self.assertEqual(request("/maintenance/recovery.js", "POST")[0], 503)
            self.assertEqual(request("/maintenance/page.html")[0], 404)
            # An error-page internal redirect must not exempt any later API request.
            self.assertEqual(request("/api/me")[0], 503)

    def test_off_restores_public_access(self):
        with self.site(enabled=False) as request:
            for path in ("/", "/api/health", "/admin/codex-command"):
                self.assertEqual(request(path)[0], 200)
            self.assertEqual(json.loads(request("/maintenance/status")[2]), {"enabled": 0, "restricted": 0})

    def test_atomic_state_changes_and_real_nginx_reloads(self):
        with self.site(enabled=False) as request:
            self.assertEqual(request("/")[0], 200)
            request.configure({"enabled": True, "allowed_ips": ["127.0.0.3"]})
            self.assertEqual(request("/")[0], 503)
            self.assertEqual(request("/", source="127.0.0.3")[0], 200)
            request.configure({"enabled": True, "allowed_ips": ["127.0.0.2", "127.0.0.3"]})
            self.assertEqual(request("/")[0], 200)
            request.configure({"enabled": True, "allowed_ips": ["127.0.0.3"]})
            self.assertEqual(request("/api/health")[0], 503)
            request.configure({"enabled": False, "allowed_ips": ["127.0.0.3"]})
            self.assertEqual(request("/api/health")[0], 200)


if __name__ == "__main__":
    unittest.main()
