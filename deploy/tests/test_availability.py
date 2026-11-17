"""Regression checks for false healthy/maintenance results and incident boundaries."""
import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "availability", Path(__file__).resolve().parents[1] / "scripts/check-availability.py")
probe = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(probe)
OFF = {"enabled": False, "restricted": False}
ON = {"enabled": True, "restricted": True}


def sample(path="/", status=200, body=b"<html>Public page</html>", headers=None, error=0):
    return {"path": path, "status": status, "curl_exit": error, "body": body,
            "headers": headers or {"content-type": "text/html"}}


class AvailabilityTests(unittest.TestCase):
    def test_healthy_html_and_valid_seo_files(self):
        self.assertEqual(probe.classify(sample(), OFF, OFF), ("healthy", "ok"))
        robots = sample("/robots.txt", body=b"User-agent: *\nSitemap: https://system-strzelecki.pl/sitemap.xml",
                        headers={"content-type": "text/plain"})
        self.assertEqual(probe.classify(robots, OFF, OFF)[0], "healthy")
        sitemap = sample("/sitemap.xml", body=b'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://system-strzelecki.pl/</loc></url></urlset>',
                         headers={"content-type": "application/xml"})
        self.assertEqual(probe.classify(sitemap, OFF, OFF)[0], "healthy")

    def test_200_error_page_is_not_a_valid_robots_or_sitemap(self):
        for path in ("/robots.txt", "/sitemap.xml"):
            self.assertEqual(probe.classify(sample(path), OFF, OFF), ("outage", "unexpected_content"))
        for body in (b"broken xml", b'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>'):
            self.assertEqual(probe.classify(sample("/sitemap.xml", body=body,
                             headers={"content-type": "application/xml"}), OFF, OFF)[0], "outage")

    def test_only_confirmed_503_with_retry_after_is_planned(self):
        headers = {"x-maintenance-mode": "1", "retry-after": "60", "cache-control": "no-store"}
        self.assertEqual(probe.classify(sample(status=503, headers=headers), ON, ON)[0], "maintenance")
        for missing in headers:
            incomplete = {key: value for key, value in headers.items() if key != missing}
            self.assertEqual(probe.classify(sample(status=503, headers=incomplete), ON, ON)[0], "outage")
        self.assertEqual(probe.classify(sample(status=503, headers=headers), OFF, OFF)[0], "outage")

    def test_no_global_suppression_during_maintenance(self):
        for response in (sample(status=502), sample(status=0, error=28), sample()):
            self.assertEqual(probe.classify(response, ON, ON)[0], "outage")

    def test_status_failure_and_transition_are_explicit(self):
        self.assertEqual(probe.classify(sample(), None, OFF)[1], "maintenance_status_unavailable")
        self.assertEqual(probe.classify(sample(), OFF, ON)[0], "transition")
        for code in (6, 7, 28, 60):  # DNS, connection, timeout, TLS certificate.
            self.assertEqual(probe.classify(sample(status=0, error=code), OFF, OFF)[1], "transport_error")

    def test_redirects_and_404_are_failures(self):
        for status in (301, 302, 404, 500, 503):
            self.assertEqual(probe.classify(sample(status=status), OFF, OFF)[0], "outage")

    def test_retry_after_validation(self):
        for value in ("", "0", "garbage", "-1"):
            self.assertFalse(probe.valid_retry_after(value))
        self.assertTrue(probe.valid_retry_after("60"))
        self.assertTrue(probe.valid_retry_after("Wed, 18 Nov 2026 12:00:00 GMT"))

    def test_status_requires_valid_public_contract(self):
        for response in (sample(body=b"<html>"), sample(body=b"{}"), sample(status=503),
                         sample(body=b'{"enabled":3,"restricted":1}')):
            self.assertIsNone(probe.maintenance_status(response))
        self.assertEqual(probe.maintenance_status(sample(body=b'{"enabled":1,"restricted":1}')), ON)

    def test_history_preserves_boundaries_and_observation_gaps(self):
        def add(state, phase, minute):
            return probe.advance(state, {"phase": phase, "finished_at": f"2026-11-17T10:{minute}:00+00:00"})
        state = add(None, "healthy", "00")
        state = add(state, "outage", "10")
        state = add(state, "outage", "20")
        state = add(state, "maintenance", "30")
        incident = state["closed"][-1]
        self.assertEqual(incident["phase"], "outage")
        self.assertEqual(incident["previous_observation_at"], "2026-11-17T10:00:00+00:00")
        self.assertEqual(incident["next_phase_observed_at"], "2026-11-17T10:30:00+00:00")
        self.assertEqual(incident["observed_span_seconds"], 600)
        state = probe.advance(state, {"phase": "healthy", "finished_at": "2026-11-17T12:00:00+00:00"})
        self.assertEqual(len(state["gaps"]), 1)
        self.assertEqual(state["current"]["phase"], "healthy")


if __name__ == "__main__":
    unittest.main()
