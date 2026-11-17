#!/usr/bin/env python3
"""Read-only public HTTPS probe. Network failures are data, never notifications."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import json
from pathlib import Path
import subprocess
import tempfile
import xml.etree.ElementTree as ET

ORIGIN = "https://system-strzelecki.pl"
PATHS = ("/", "/robots.txt", "/sitemap.xml", "/competitions", "/trainings",
         "/shooting-ranges/map", "/kontakt")
NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"


def now():
    return datetime.now(timezone.utc).isoformat()


def fetch(path):
    # No --resolve, proxy, redirects, retries or TLS bypass. Each request is a sample.
    with tempfile.TemporaryDirectory() as directory:
        body_file = Path(directory) / "body"
        headers_file = Path(directory) / "headers"
        started = now()
        result = subprocess.run([
            "curl", "--silent", "--show-error", "--noproxy", "*",
            "--proto", "=https", "--connect-timeout", "8", "--max-time", "20",
            "--max-filesize", "4194304", "--user-agent", "ShootingAvailability/1.0",
            "--header", "Cache-Control: no-cache", "--output", str(body_file),
            "--dump-header", str(headers_file), "--write-out", "%{json}", ORIGIN + path,
        ], capture_output=True, text=True, timeout=25)
        metrics = json.loads(result.stdout or "{}")
        headers = {}
        for line in headers_file.read_text().splitlines() if headers_file.exists() else []:
            if ":" in line:
                key, value = line.split(":", 1)
                if key.lower() in ("content-type", "retry-after", "x-maintenance-mode", "cache-control", "location"):
                    headers[key.lower()] = value.strip()
        return {
            "path": path, "url": ORIGIN + path, "started_at": started, "finished_at": now(),
            "status": metrics.get("http_code", 0), "seconds": metrics.get("time_total"),
            "remote_ip": metrics.get("remote_ip"), "curl_exit": result.returncode,
            "error": result.stderr.strip()[:500], "headers": headers,
            "body": body_file.read_bytes() if body_file.exists() else b"",
        }


def maintenance_status(sample):
    if sample["curl_exit"] or sample["status"] != 200:
        return None
    try:
        value = json.loads(sample["body"])
        if value.get("enabled") in (0, 1) and value.get("restricted") in (0, 1):
            return {"enabled": bool(value["enabled"]), "restricted": bool(value["restricted"])}
    except (ValueError, AttributeError):
        pass
    return None


def valid_retry_after(value):
    if value.isascii() and value.isdigit():
        return int(value) > 0
    try:
        return parsedate_to_datetime(value).tzinfo is not None
    except (ValueError, TypeError, OverflowError):
        return False


def sitemap_urls(body):
    root = ET.fromstring(body)
    if root.tag != NS + "urlset":
        raise ValueError("Expected sitemap urlset")
    urls = [node.text for node in root.findall(NS + "url/" + NS + "loc")]
    if not urls or any(not url or not url.startswith(ORIGIN + "/") for url in urls):
        raise ValueError("Empty sitemap or unexpected origin")
    return urls


def classify(sample, before, after):
    if sample["curl_exit"]:
        return "outage", "transport_error"
    if before is None or after is None:
        return "outage", "maintenance_status_unavailable"
    if before != after:
        return "transition", "maintenance_changed_during_probe"
    headers = sample["headers"]
    if before["enabled"] and before["restricted"]:
        if (sample["status"] == 503 and headers.get("x-maintenance-mode") == "1"
                and valid_retry_after(headers.get("retry-after", ""))
                and "no-store" in headers.get("cache-control", "")):
            return "maintenance", "planned_maintenance"
        return "outage", "invalid_maintenance_response"
    if sample["status"] != 200:
        return "outage", "unexpected_http_status"
    try:
        content_type = headers.get("content-type", "").lower()
        if sample["path"] == "/robots.txt":
            text = sample["body"].decode("utf-8").lower()
            assert "text/plain" in content_type and "user-agent:" in text
            assert "sitemap: " + ORIGIN + "/sitemap.xml" in text
        elif sample["path"] == "/sitemap.xml":
            assert "xml" in content_type
            sitemap_urls(sample["body"])
        else:
            assert "text/html" in content_type and b"<html" in sample["body"].lower()
    except (AssertionError, ValueError, ET.ParseError):
        return "outage", "unexpected_content"
    return "healthy", "ok"


def advance(previous, record):
    """Carry bounded incident history, including observation gaps (not uptime)."""
    stamp = record["finished_at"]
    state = previous or {"schema": 1, "current": None, "closed": [], "gaps": []}
    last = state.get("last_observed_at")
    if last and (datetime.fromisoformat(stamp) - datetime.fromisoformat(last)).total_seconds() > 1800:
        state["gaps"] = (state.get("gaps", []) + [{"from": last, "to": stamp}])[-100:]
    phase = record["phase"]
    current = state.get("current")
    if current and current["phase"] != phase:
        current["next_phase_observed_at"] = stamp
        current["observed_span_seconds"] = (
            datetime.fromisoformat(current["last_observed_at"]) - datetime.fromisoformat(current["first_observed_at"])
        ).total_seconds()
        state["closed"] = (state["closed"] + [current])[-100:]
        current = None
    if current is None:
        current = {"phase": phase, "first_observed_at": stamp, "previous_observation_at": last, "samples": 0}
    current.update(last_observed_at=stamp, samples=current["samples"] + 1)
    state.update(current=current, last_observed_at=stamp)
    return state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--previous", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    before = fetch("/maintenance/status")
    with ThreadPoolExecutor(max_workers=4) as executor:
        samples = list(executor.map(fetch, PATHS))
    # Follow one real, currently published event detail without hard-coding an ID.
    sitemap = next(sample for sample in samples if sample["path"] == "/sitemap.xml")
    if sitemap["status"] == 200 and not sitemap["curl_exit"]:
        try:
            details = [url[len(ORIGIN):] for url in sitemap_urls(sitemap["body"])
                       if url[len(ORIGIN):].startswith(("/competitions/", "/trainings/"))
                       and url.rsplit("/", 1)[-1].isdigit()]
            if details:
                samples.append(fetch(details[0]))
        except (ValueError, ET.ParseError):
            pass  # Content validation below records the invalid sitemap.
    after = fetch("/maintenance/status")
    before_state, after_state = maintenance_status(before), maintenance_status(after)
    for sample in samples:
        sample["phase"], sample["reason"] = classify(sample, before_state, after_state)
    phases = {sample["phase"] for sample in samples}
    phase = next((item for item in ("outage", "transition", "maintenance") if item in phases), "healthy")
    record = {"schema": 1, "origin": ORIGIN, "finished_at": now(), "phase": phase,
              "maintenance_before": before_state, "maintenance_after": after_state,
              "samples": samples, "status_samples": [before, after]}
    for sample in samples + [before, after]:
        del sample["body"]  # Store metrics, never page bodies, cookies or credentials.
    previous = None
    if args.previous and args.previous.exists():
        previous = json.loads(args.previous.read_text())
    state = advance(previous, record)
    for filename, value in (("record.json", record), ("state.json", state)):
        (args.output / filename).write_text(json.dumps(value, indent=2) + "\n")
    summary = [f"Availability: {phase}", f"Observed (UTC): {record['finished_at']}",
               f"Current phase first observed: {state['current']['first_observed_at']}",
               "", "| Path | HTTP | Seconds | Result |", "|---|---:|---:|---|"]
    summary.extend(f"| {s['path']} | {s['status']} | {s['seconds']} | {s['phase']}: {s['reason']} |" for s in samples)
    summary += ["", "Alerts disabled. Samples bound the incident; they do not prove exact downtime."]
    (args.output / "summary.md").write_text("\n".join(summary) + "\n")
    print("\n".join(summary))
    # An outage is recorded without failing the workflow and activating GitHub failure notifications.


if __name__ == "__main__":
    main()
