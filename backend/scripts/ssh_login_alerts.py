#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import socket
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from config import settings  # noqa: E402
from mailer import MailConfigurationError, MailDeliveryError, send_email  # noqa: E402


SSH_PATTERNS = [
    (
        "successful_login",
        re.compile(
            r"^Accepted (?P<method>\S+) for (?P<user>.+?) from "
            r"(?P<ip>\S+) port (?P<port>\d+) ssh2(?:: (?P<details>.*))?$"
        ),
    ),
    (
        "failed_password",
        re.compile(
            r"^Failed (?P<method>\S+) for (?:(?P<invalid>invalid user) )?"
            r"(?P<user>.+?) from (?P<ip>\S+) port (?P<port>\d+) ssh2$"
        ),
    ),
    (
        "invalid_user",
        re.compile(r"^Invalid user (?P<user>.+?) from (?P<ip>\S+) port (?P<port>\d+)$"),
    ),
    (
        "closed_connection",
        re.compile(
            r"^Connection (?:closed|reset) by (?:(?P<state>invalid user|authenticating user) )?"
            r"(?:(?P<user>.+?) )?(?P<ip>\S+) port (?P<port>\d+)(?: \[(?P<phase>.*?)\])?$"
        ),
    ),
    (
        "disconnect",
        re.compile(
            r"^(?:Received disconnect from|Disconnected from(?: authenticating user)?) "
            r"(?:(?P<user>.+?) )?(?P<ip>\S+) port (?P<port>\d+):?(?P<details>.*)$"
        ),
    ),
    (
        "negotiation_failed",
        re.compile(
            r"^Unable to negotiate with (?P<ip>\S+) port (?P<port>\d+): (?P<details>.*)$"
        ),
    ),
    (
        "pam_auth_failure",
        re.compile(
            r"^pam_unix\(sshd:auth\): authentication failure; (?P<details>.*?)(?:\s+user=(?P<user>\S+))?$"
        ),
    ),
]


EVENT_LABELS = {
    "successful_login": "Udane logowanie SSH",
    "failed_password": "Nieudana próba logowania SSH",
    "invalid_user": "Próba logowania na nieistniejącego użytkownika",
    "closed_connection": "Zamknięte połączenie SSH",
    "disconnect": "Rozłączone połączenie SSH",
    "negotiation_failed": "Nieudana negocjacja SSH",
    "pam_auth_failure": "Błąd uwierzytelniania PAM/SSH",
}
IMMEDIATE_PASSWORD_AUTH_ALERT_EVENTS = {"successful_login"}
FAILED_PASSWORD_SUMMARY_EVENTS = {"failed_password"}
PASSWORD_AUTH_ALERT_USERS = {"ubuntu"}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_journal_timestamp(value: str) -> str:
    if not value:
        return utc_now_iso()

    try:
        timestamp = int(value) / 1_000_000
    except ValueError:
        return value

    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat()


def extract_key_value_details(details: str) -> dict[str, str]:
    values: dict[str, str] = {}

    for key, value in re.findall(r"(\w+)=([^\s]+)", details or ""):
        values[key] = value

    return values


def event_from_entry(entry: dict[str, Any]) -> dict[str, str] | None:
    message = str(entry.get("MESSAGE", ""))

    if not message:
        return None

    for event_type, pattern in SSH_PATTERNS:
        match = pattern.search(message)

        if not match:
            continue

        data = {key: value for key, value in match.groupdict().items() if value}
        details_values = extract_key_value_details(data.get("details", ""))

        if not data.get("ip") and details_values.get("rhost"):
            data["ip"] = details_values["rhost"]

        if not data.get("user") and details_values.get("user"):
            data["user"] = details_values["user"]

        data.update({
            "event_type": event_type,
            "event_label": EVENT_LABELS.get(event_type, event_type),
            "message": message,
            "hostname": str(entry.get("_HOSTNAME") or socket.gethostname()),
            "pid": str(entry.get("_PID", "")),
            "systemd_unit": str(entry.get("_SYSTEMD_UNIT", "ssh.service")),
            "boot_id": str(entry.get("_BOOT_ID", "")),
            "timestamp": parse_journal_timestamp(str(entry.get("__REALTIME_TIMESTAMP", ""))),
        })
        return data

    return None


def email_rows(event: dict[str, str]) -> list[tuple[str, str]]:
    ordered_keys = [
        ("Zdarzenie", "event_label"),
        ("Czas", "timestamp"),
        ("Host", "hostname"),
        ("Użytkownik", "user"),
        ("Adres IP", "ip"),
        ("Port źródłowy", "port"),
        ("Metoda", "method"),
        ("Stan", "state"),
        ("Faza", "phase"),
        ("Szczegóły", "details"),
        ("PID sshd", "pid"),
        ("Unit", "systemd_unit"),
        ("Boot ID", "boot_id"),
        ("Surowy log", "message"),
    ]

    return [
        (label, event.get(key, ""))
        for label, key in ordered_keys
        if event.get(key, "")
    ]


def should_send_alert(event: dict[str, str]) -> bool:
    return (
        event.get("event_type") in IMMEDIATE_PASSWORD_AUTH_ALERT_EVENTS
        and event.get("method") == "password"
        and event.get("user") in PASSWORD_AUTH_ALERT_USERS
    )


def should_include_failed_summary(event: dict[str, str]) -> bool:
    return (
        event.get("event_type") in FAILED_PASSWORD_SUMMARY_EVENTS
        and event.get("method") == "password"
        and event.get("user") in PASSWORD_AUTH_ALERT_USERS
    )


def send_ssh_alert(event: dict[str, str]) -> None:
    notification_email = settings.admin_new_user_notification_email

    if not notification_email:
        print("SSH alert skipped: ADMIN_NEW_USER_NOTIFICATION_EMAIL is not configured", flush=True)
        return

    subject_bits = [
        "[SSH]",
        event.get("event_label", "Zdarzenie SSH"),
    ]

    if event.get("user"):
        subject_bits.append(f"user={event['user']}")

    if event.get("ip"):
        subject_bits.append(f"ip={event['ip']}")

    subject = " ".join(subject_bits)
    rows = email_rows(event)
    text_body = (
        "Dzień dobry,\n\n"
        "Wykryto zdarzenie logowania SSH na VPS Systemu Strzeleckiego.\n\n"
        + "\n".join(f"{label}: {value}" for label, value in rows)
        + "\n\nTo wiadomość automatyczna.\n"
    )
    html_rows = "".join(
        "<tr>"
        f"<th align=\"left\" style=\"padding:4px 12px 4px 0;vertical-align:top\">{escape(label)}</th>"
        f"<td style=\"padding:4px 0\"><pre style=\"margin:0;white-space:pre-wrap\">{escape(value)}</pre></td>"
        "</tr>"
        for label, value in rows
    )
    html_body = f"""
    <p>Dzień dobry,</p>
    <p>Wykryto zdarzenie logowania SSH na VPS Systemu Strzeleckiego.</p>
    <table>{html_rows}</table>
    <p>To wiadomość automatyczna.</p>
    """.strip()

    send_email(notification_email, subject, text_body, html_body)
    print(f"SSH alert sent: {subject}", flush=True)


def summarize_failed_events(events: list[dict[str, str]]) -> dict[str, Any]:
    by_ip: dict[str, list[dict[str, str]]] = defaultdict(list)

    for event in events:
        by_ip[event.get("ip", "unknown")].append(event)

    ip_counts = Counter(event.get("ip", "unknown") for event in events)
    sorted_ips = sorted(ip_counts.items(), key=lambda item: (-item[1], item[0]))
    timestamps = sorted(event.get("timestamp", "") for event in events if event.get("timestamp"))

    return {
        "total": len(events),
        "unique_ips": len(ip_counts),
        "first_timestamp": timestamps[0] if timestamps else "",
        "last_timestamp": timestamps[-1] if timestamps else "",
        "sorted_ips": sorted_ips,
        "by_ip": by_ip,
    }


def send_failed_password_summary(events: list[dict[str, str]], since: str) -> None:
    notification_email = settings.admin_new_user_notification_email

    if not notification_email:
        print("SSH failed summary skipped: ADMIN_NEW_USER_NOTIFICATION_EMAIL is not configured", flush=True)
        return

    if not events:
        print("SSH failed summary skipped: no failed ubuntu password attempts", flush=True)
        return

    summary = summarize_failed_events(events)
    subject = (
        "[SSH] Dzienny raport nieudanych logowań SSH "
        f"user=ubuntu count={summary['total']}"
    )
    lines = [
        "Dzień dobry,",
        "",
        "Dzienny zbiorczy raport nieudanych prób logowania SSH hasłem na konto ubuntu.",
        "",
        f"Zakres: od {since} do teraz",
        f"Liczba prób: {summary['total']}",
        f"Liczba unikalnych IP: {summary['unique_ips']}",
    ]

    if summary["first_timestamp"]:
        lines.append(f"Pierwsza próba: {summary['first_timestamp']}")

    if summary["last_timestamp"]:
        lines.append(f"Ostatnia próba: {summary['last_timestamp']}")

    lines.extend(["", "Adresy IP:"])

    for ip, count in summary["sorted_ips"]:
        ip_events = summary["by_ip"][ip]
        first = min(event.get("timestamp", "") for event in ip_events if event.get("timestamp"))
        last = max(event.get("timestamp", "") for event in ip_events if event.get("timestamp"))
        ports = sorted({event.get("port", "") for event in ip_events if event.get("port")})
        port_text = ", ".join(ports[:10])

        if len(ports) > 10:
            port_text += f" ... (+{len(ports) - 10})"

        lines.append(
            f"- {ip}: {count} prób, pierwsza {first}, ostatnia {last}, porty: {port_text}"
        )

    lines.append("")
    lines.append("To wiadomość automatyczna.")
    text_body = "\n".join(lines) + "\n"

    html_ip_rows = "".join(
        "<tr>"
        f"<td style=\"padding:4px 12px 4px 0\"><pre style=\"margin:0\">{escape(ip)}</pre></td>"
        f"<td style=\"padding:4px 12px 4px 0;text-align:right\">{count}</td>"
        f"<td style=\"padding:4px 12px 4px 0\"><pre style=\"margin:0\">{escape(min(event.get('timestamp', '') for event in summary['by_ip'][ip] if event.get('timestamp')))}</pre></td>"
        f"<td style=\"padding:4px 0\"><pre style=\"margin:0\">{escape(max(event.get('timestamp', '') for event in summary['by_ip'][ip] if event.get('timestamp')))}</pre></td>"
        "</tr>"
        for ip, count in summary["sorted_ips"]
    )
    html_body = f"""
    <p>Dzień dobry,</p>
    <p>Dzienny zbiorczy raport nieudanych prób logowania SSH hasłem na konto <strong>ubuntu</strong>.</p>
    <table>
      <tr><th align="left">Zakres</th><td>od {escape(since)} do teraz</td></tr>
      <tr><th align="left">Liczba prób</th><td>{summary['total']}</td></tr>
      <tr><th align="left">Liczba unikalnych IP</th><td>{summary['unique_ips']}</td></tr>
      <tr><th align="left">Pierwsza próba</th><td>{escape(summary['first_timestamp'])}</td></tr>
      <tr><th align="left">Ostatnia próba</th><td>{escape(summary['last_timestamp'])}</td></tr>
    </table>
    <h3>Adresy IP</h3>
    <table>
      <tr><th align="left">Adres IP</th><th align="right">Próby</th><th align="left">Pierwsza</th><th align="left">Ostatnia</th></tr>
      {html_ip_rows}
    </table>
    <p>To wiadomość automatyczna.</p>
    """.strip()

    send_email(notification_email, subject, text_body, html_body)
    print(f"SSH failed summary sent: {subject}", flush=True)


def iter_journal_entries(since: str, until: str | None = None):
    command = [
        "journalctl",
        "-u",
        "ssh.service",
        "-o",
        "json",
        "--no-pager",
        "--since",
        since,
    ]

    if until:
        command.extend(["--until", until])

    if since == "now":
        command.append("-f")

    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    assert process.stdout is not None

    for raw_line in process.stdout:
        line = raw_line.strip()

        if not line or not line.startswith("{"):
            continue

        try:
            yield json.loads(line)
        except json.JSONDecodeError:
            print(f"Skipping invalid journal line: {line[:200]}", flush=True)

    return_code = process.wait()

    if return_code:
        raise RuntimeError(f"journalctl exited with status {return_code}")


def run(since: str, dry_run: bool, limit: int | None) -> None:
    sent_count = 0

    for entry in iter_journal_entries(since):
        event = event_from_entry(entry)

        if not event or not should_send_alert(event):
            continue

        if dry_run:
            print(json.dumps(event, ensure_ascii=False, sort_keys=True), flush=True)
        else:
            try:
                send_ssh_alert(event)
            except (MailConfigurationError, MailDeliveryError) as exc:
                print(f"Failed to send SSH alert: {exc}", flush=True)

        sent_count += 1

        if limit is not None and sent_count >= limit:
            return


def run_failed_summary(since: str, until: str | None, dry_run: bool) -> None:
    events = [
        event
        for entry in iter_journal_entries(since, until)
        if (event := event_from_entry(entry)) and should_include_failed_summary(event)
    ]

    if dry_run:
        print(json.dumps(summarize_failed_events(events), ensure_ascii=False, default=str), flush=True)
        return

    try:
        send_failed_password_summary(events, since)
    except (MailConfigurationError, MailDeliveryError) as exc:
        print(f"Failed to send SSH failed summary: {exc}", flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Send email alerts for SSH login events.")
    parser.add_argument("--since", default="now")
    parser.add_argument("--until", default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--daily-failed-summary", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()

    if args.daily_failed_summary:
        summary_since = args.since if args.since != "now" else "24 hours ago"
        run_failed_summary(summary_since, args.until, args.dry_run)
    else:
        run(args.since, args.dry_run, args.limit)
