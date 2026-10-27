#!/usr/bin/python3
"""Persistent, IP-restricted maintenance mode for the production nginx site."""

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import ipaddress
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


STATE_DIR = Path("/var/lib/shooting-system/maintenance")
CONFIG_PATH = STATE_DIR / "state.conf"
STATE_PREFIX = "# maintenance-state: "


def address(value):
    try:
        parsed = ipaddress.ip_address(value)
        if getattr(parsed, "scope_id", None) is not None:
            raise ValueError("Scoped IPv6 addresses cannot be used in nginx geo rules")
        return str(parsed)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"Nieprawidłowy adres IP: {value}") from exc


def initial_state():
    return {"enabled": False, "allowed_ips": [], "updated_at": None}


def read_state():
    if not CONFIG_PATH.exists():
        raise RuntimeError("Tryb serwisowy nie jest zainstalowany. Uruchom wdrożenie aplikacji.")
    first_line = CONFIG_PATH.read_text().splitlines()[0]
    if not first_line.startswith(STATE_PREFIX):
        raise RuntimeError(f"Nieprawidłowy plik stanu: {CONFIG_PATH}")
    return json.loads(first_line[len(STATE_PREFIX):])


def render_config(state):
    # Only validated individual IPs enter nginx syntax; forwarded headers are ignored.
    ips = sorted({address(ip) for ip in state["allowed_ips"]} | {"127.0.0.1", "::1"})
    lines = [
        STATE_PREFIX + json.dumps(state, ensure_ascii=True, sort_keys=True),
        'map "" $shooting_maintenance_enabled {',
        f'    default {int(state["enabled"])};',
        "}",
        "geo $remote_addr $shooting_maintenance_allowed {",
        "    default 0;",
        *[f"    {ip} 1;" for ip in ips],
        "}",
        "",
    ]
    return "\n".join(lines)


def atomic_write(path, content):
    descriptor, temporary = tempfile.mkstemp(prefix=".maintenance-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
            os.fchmod(output.fileno(), 0o644)
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


@contextmanager
def state_lock():
    STATE_DIR.mkdir(parents=True, exist_ok=True, mode=0o755)
    with (STATE_DIR / "control.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield


def run(command):
    subprocess.run(command, check=True)


def update_state(state):
    previous = CONFIG_PATH.read_text()
    state["updated_at"] = datetime.now(timezone.utc).isoformat()
    atomic_write(CONFIG_PATH, render_config(state))
    try:
        run(["/usr/sbin/nginx", "-t"])
        run(["/usr/bin/systemctl", "reload", "nginx"])
    except (subprocess.CalledProcessError, OSError):
        atomic_write(CONFIG_PATH, previous)
        # Reapply the previous configuration even if the failed reload was partial.
        try:
            run(["/usr/sbin/nginx", "-t"])
            run(["/usr/bin/systemctl", "reload", "nginx"])
        except (subprocess.CalledProcessError, OSError) as exc:
            raise RuntimeError(
                "Przywrócono poprzedni plik stanu, ale przeładowanie nginx nie powiodło się. "
                "Sprawdź: sudo nginx -t oraz sudo systemctl status nginx"
            ) from exc
        raise RuntimeError("Zmiana nie powiodła się. Przywrócono poprzedni stan.")


def show_status(state):
    print("Tryb serwisowy: " + ("WŁĄCZONY" if state["enabled"] else "WYŁĄCZONY"))
    print("IP z dostępem testowym: " + (", ".join(state["allowed_ips"]) or "brak"))
    print("Ostatnia zmiana (UTC): " + (state["updated_at"] or "brak"))
    print("Kontrole lokalne serwera i podpisane powiadomienia Autopay pozostają dostępne.")


def main():
    parser = argparse.ArgumentParser(description="Tryb serwisowy Systemu Strzeleckiego")
    subparsers = parser.add_subparsers(dest="command", required=True)
    enable = subparsers.add_parser("on", help="włącz tryb i ustaw listę dozwolonych IP")
    enable.add_argument("--allow", type=address, action="append", default=[], metavar="IP")
    enable.add_argument("--ssh", action="store_true", help="dopuść IP bieżącego połączenia SSH")
    subparsers.add_parser("off", help="przywróć publiczny dostęp")
    subparsers.add_parser("status", help="pokaż stan i dozwolone IP")
    for name, help_text in (("allow-add", "dodaj IP do wyjątków"), ("allow-remove", "usuń IP z wyjątków")):
        command = subparsers.add_parser(name, help=help_text)
        command.add_argument("ip", type=address)
    subparsers.add_parser("install", help="inicjalizacja przez skrypt wdrożenia; zachowuje stan")
    args = parser.parse_args()
    arguments = sys.argv[1:]
    if args.command == "on":
        if args.ssh:
            connection = os.environ.get("SSH_CONNECTION", "").split()
            if not connection:
                parser.error("Brak połączenia SSH. Użyj: maintenance on --allow TWOJE_PUBLICZNE_IP")
            try:
                ssh_ip = address(connection[0])
            except argparse.ArgumentTypeError as exc:
                parser.error(str(exc))
            args.allow.append(ssh_ip)
            # Resolve SSH_CONNECTION before sudo, which normally removes it.
            arguments = ["on", *[part for ip in args.allow for part in ("--allow", ip)]]
        if not args.allow:
            parser.error("Podaj --allow TWOJE_PUBLICZNE_IP albo --ssh. Dotychczasowa lista zostanie zastąpiona.")
    if os.geteuid() != 0:
        return subprocess.call(["sudo", str(Path(__file__).resolve()), *arguments])
    with state_lock():
        if args.command == "install":
            if not CONFIG_PATH.exists():
                atomic_write(CONFIG_PATH, render_config(initial_state()))
            show_status(read_state())
            return 0
        state = read_state()
        if args.command == "status":
            show_status(state)
            return 0
        if args.command == "on":
            state.update(enabled=True, allowed_ips=sorted(set(args.allow)))
        elif args.command == "off":
            state["enabled"] = False
        elif args.command == "allow-add":
            state["allowed_ips"] = sorted(set(state["allowed_ips"]) | {args.ip})
        elif args.command == "allow-remove":
            state["allowed_ips"] = [ip for ip in state["allowed_ips"] if ip != args.ip]
            if state["enabled"] and not state["allowed_ips"]:
                raise RuntimeError("Nie można usunąć ostatniego IP podczas prac. Dodaj nowe IP lub użyj maintenance off.")
        update_state(state)
        show_status(state)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, OSError, ValueError) as error:
        print(f"Błąd: {error}", file=sys.stderr)
        sys.exit(1)
