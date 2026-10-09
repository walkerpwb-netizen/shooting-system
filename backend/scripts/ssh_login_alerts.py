#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import socket
import subprocess
import sys
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
PASSWORD_AUTH_ALERT_EVENTS = {"successful_login", "failed_password"}


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
        event.get("event_type") in PASSWORD_AUTH_ALERT_EVENTS
        and event.get("method") == "password"
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


def iter_journal_entries(since: str):
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Send email alerts for SSH login events.")
    parser.add_argument("--since", default="now")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    run(args.since, args.dry_run, args.limit)
