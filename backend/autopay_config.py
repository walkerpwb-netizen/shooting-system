"""Admin-only credentials stored atomically in a private, Git-ignored server file."""

import fcntl
import json
import os
import re
import stat
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, SecretStr, ValidationError

CONFIG_PATH = Path(__file__).resolve().parent / ".private" / "autopay.json"
GATEWAYS = {"production": "https://pay.autopay.eu/payment"}
ERROR = "Nie można odczytać lub zapisać konfiguracji Autopay. Skontaktuj się z administratorem serwera."


class EnvironmentData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    service_id: str = Field(max_length=10)
    gateway_url: str = Field(max_length=200)
    algorithm: Literal["sha256", "sha512"]
    shared_key: SecretStr = SecretStr("")
    remove_key: bool = False


class ConfigurationData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=0)
    mode: Literal["disabled", "production"]
    production: EnvironmentData
    provider_timezone: Literal["CET", "Europe/Warsaw"] = "CET"
    validity_minutes: int = Field(default=15, ge=5, le=60)
    production_callbacks_configured: bool = False
    merchant_model_confirmed: bool = True


def environment_defaults():
    value = {"revision": 0, "mode": os.getenv("AUTOPAY_MODE", "disabled").strip(), "updated_at": "", "updated_by": "",
             "production_callbacks_configured": os.getenv("AUTOPAY_PRODUCTION_CALLBACKS_CONFIGURED", "").lower() in ("true", "1")}
    if value["mode"] not in ("disabled", "production"):
        value["mode"] = "disabled"
    for name in GATEWAYS:
        prefix = f"AUTOPAY_{name.upper()}_"
        value[name] = {
            "service_id": os.getenv(prefix + "SERVICE_ID", "").strip(),
            "shared_key": os.getenv(prefix + "SHARED_KEY", "").strip(),
            "gateway_url": os.getenv(prefix + "GATEWAY_URL", GATEWAYS[name]).strip(),
            "algorithm": os.getenv(prefix + "HASH_ALGORITHM", "sha256").strip().lower(),
        }
    return value


def valid_environment(name, section):
    return bool(re.fullmatch(r"[0-9]{1,10}", section["service_id"]) and section["shared_key"]
                and section["gateway_url"] == GATEWAYS[name] and section["algorithm"] in ("sha256", "sha512"))


def production_allowed(value):
    from mailer import is_mail_configured
    return bool(valid_environment("production", value["production"]) and value.get("merchant_model_confirmed", True)
                and value.get("production_callbacks_configured", False) and is_mail_configured())


def read_configuration():
    """A saved file is authoritative, including an explicitly cleared key or disabled mode."""
    try:
        fd = os.open(CONFIG_PATH, os.O_RDONLY | os.O_NOFOLLOW)
    except FileNotFoundError:
        return environment_defaults()
    except OSError:
        raise HTTPException(503, ERROR) from None
    try:
        with os.fdopen(fd, "r", encoding="utf-8") as handle:
            info = os.fstat(handle.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_size > 16384 or stat.S_IMODE(info.st_mode) & 0o077:
                raise ValueError
            value = json.load(handle)
        if (not isinstance(value, dict) or value.get("mode") not in ("disabled", "production")
                or type(value.get("revision")) is not int or value["revision"] < 1):
            raise ValueError
        for name in GATEWAYS:
            section = value[name]
            if not isinstance(section, dict) or any(not isinstance(section.get(k), str) for k in
                                                   ("service_id", "shared_key", "gateway_url", "algorithm")):
                raise ValueError
            if (section["service_id"] and not re.fullmatch(r"[0-9]{1,10}", section["service_id"])) or (
                    section["gateway_url"] != GATEWAYS[name] or section["algorithm"] not in ("sha256", "sha512")):
                raise ValueError
        return value
    except (OSError, ValueError, KeyError, TypeError):
        raise HTTPException(503, ERROR) from None


def configuration_status(value):
    from mailer import is_mail_configured
    # No saved secret (even a fragment) is ever sent back to the browser.
    return {
        "revision": value["revision"], "mode": value["mode"], "sales_enabled": value["mode"] == "production" and production_allowed(value),
        "verification_status": "managed_by_operator",
        "updated_at": value.get("updated_at", ""), "updated_by": value.get("updated_by", ""),
        **{name: {**{k: value[name][k] for k in ("service_id", "gateway_url", "algorithm")},
                  "key_configured": bool(value[name]["shared_key"]), "complete": valid_environment(name, value[name])}
           for name in GATEWAYS},
        "notification_url": "https://system-strzelecki.pl/api/premium/autopay/production/itn",
        "return_url": "https://system-strzelecki.pl/premium/zakup",
        "provider_timezone": value.get("provider_timezone", "CET"),
        "validity_minutes": value.get("validity_minutes", 15),
        "production_callbacks_configured": value.get("production_callbacks_configured", False),
        "merchant_model_confirmed": value.get("merchant_model_confirmed", True),
        "smtp_ready": bool(is_mail_configured()),
    }


def save_configuration(data, admin):
    path = CONFIG_PATH
    temp_name = None
    try:
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        if path.parent.is_symlink():
            raise OSError
        os.chmod(path.parent, 0o700)
        fd = os.open(path.parent / "autopay.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "a") as lock:
            os.fchmod(lock.fileno(), 0o600)
            fcntl.flock(lock, fcntl.LOCK_EX)
            old = read_configuration()
            if data.revision != old["revision"]:
                raise HTTPException(409, "Konfiguracja została zmieniona w innym oknie. Wczytaj ją ponownie przed zapisem.")
            value = {"revision": old["revision"] + 1, "mode": data.mode,
                     "updated_at": datetime.now(timezone.utc).isoformat(), "updated_by": admin.email,
                     "provider_timezone": data.provider_timezone, "validity_minutes": data.validity_minutes,
                     "merchant_model_confirmed": data.merchant_model_confirmed,
                     "production_callbacks_configured": data.production_callbacks_configured}
            for name in GATEWAYS:
                section = getattr(data, name)
                key = section.shared_key.get_secret_value()
                service_id = section.service_id.strip()
                if (service_id and not re.fullmatch(r"[0-9]{1,10}", service_id)) or section.gateway_url != GATEWAYS[name]:
                    raise HTTPException(400, f"Sprawdź ID serwisu i adres bramki w sekcji {name}.")
                if len(key) > 512 or any(ord(char) < 32 or ord(char) == 127 for char in key) or (key and section.remove_key):
                    raise HTTPException(400, f"Sprawdź pole klucza w sekcji {name}.")
                if (service_id != old[name]["service_id"] or section.algorithm != old[name]["algorithm"]) and old[name]["shared_key"] and not key and not section.remove_key:
                    raise HTTPException(400, f"Zmiana ID serwisu lub algorytmu wymaga ponownego podania klucza albo jego usunięcia ({name}).")
                value[name] = {"service_id": service_id, "gateway_url": section.gateway_url, "algorithm": section.algorithm,
                               "shared_key": "" if section.remove_key else key or old[name]["shared_key"]}
            if data.mode == "production" and not production_allowed(value):
                raise HTTPException(400, "Sprzedaż wymaga kompletnych danych produkcji, potwierdzonego adresu produkcyjnego ITN i powrotu, modelu Merchanta oraz skonfigurowanej poczty.")
            fd, temp_name = tempfile.mkstemp(prefix=".autopay-", dir=path.parent)
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                os.fchmod(handle.fileno(), 0o600)
                json.dump(value, handle, ensure_ascii=False)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_name, path)
            temp_name = None
            directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
            return configuration_status(value)
    except OSError:
        raise HTTPException(503, ERROR) from None
    finally:
        if temp_name:
            Path(temp_name).unlink(missing_ok=True)


def build_autopay_settings_router(get_current_admin, get_db=None):
    router = APIRouter(prefix="/admin/settings/autopay", tags=["Konfiguracja Autopay"])

    def active_admin(admin=Depends(get_current_admin)):
        if not getattr(admin, "is_active", False):
            raise HTTPException(403, "Konfiguracja Autopay wymaga aktywnego konta administratora.")
        return admin

    db_dependency = get_db if get_db is not None else lambda: None

    @router.get("")
    def get_settings(response: Response, admin=Depends(active_admin)):
        response.headers["Cache-Control"] = "no-store"
        return configuration_status(read_configuration())

    @router.put("")
    async def update_settings(request: Request, response: Response, admin=Depends(active_admin), db=Depends(db_dependency)):
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 8192:
                raise HTTPException(413, "Formularz konfiguracji jest zbyt duży.")
        try:
            data = ConfigurationData.model_validate(json.loads(body))
        except (ValidationError, ValueError, TypeError):
            # FastAPI's default 422 includes input values. Never echo credential inputs.
            raise HTTPException(400, "Niepoprawny formularz konfiguracji Autopay. Sprawdź wymagane pola.") from None
        response.headers["Cache-Control"] = "no-store"
        if db is not None:
            from models import PremiumOrder
            from payment_limits import acquire_payment_limit_lock
            acquire_payment_limit_lock(db)
            current = read_configuration()
            for name in GATEWAYS:
                section = getattr(data, name)
                new_key = "" if section.remove_key else section.shared_key.get_secret_value() or current[name]["shared_key"]
                changed = any((section.service_id.strip() != current[name]["service_id"],
                    section.algorithm != current[name]["algorithm"], new_key != current[name]["shared_key"]))
                if changed and db.query(PremiumOrder.id).filter(PremiumOrder.environment == name,
                        PremiumOrder.provider_closed_at.is_(None), PremiumOrder.status.notin_(["paid", "cancelled"])).first():
                    raise HTTPException(409, f"Najpierw potwierdź lub anuluj rozpoczęte transakcje {name}. Zmiana ID, klucza lub algorytmu mogłaby uniemożliwić odbiór ich wyników.")
        return save_configuration(data, admin)

    @router.post("/check-connection")
    def connection_check(response: Response, admin=Depends(active_admin)):
        from autopay_api import check_connection
        from premium_payments import notification_config
        response.headers["Cache-Control"] = "no-store"
        return check_connection(notification_config())

    if get_db is not None:
        @router.get("/diagnostics")
        def diagnostics(response: Response, admin=Depends(active_admin), db=Depends(get_db)):
            from models import PremiumMailOutbox, PremiumNotification
            response.headers["Cache-Control"] = "no-store"
            notifications = db.query(PremiumNotification).order_by(PremiumNotification.id.desc()).limit(20).all()
            pending_mail = db.query(PremiumMailOutbox).filter(PremiumMailOutbox.sent_at.is_(None)).count()
            return {"notifications": [{k: getattr(row, k) for k in ("environment", "service_id", "order_reference", "remote_id",
                    "payment_status", "confirmation", "first_seen_at", "last_seen_at", "deliveries")} for row in notifications],
                    "pending_confirmation_emails": pending_mail, "production_released": True}

    return router
