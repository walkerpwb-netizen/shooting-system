import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


def _load_dotenv_file() -> None:
    env_path = Path(__file__).with_name(".env")

    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")

        if key and key not in os.environ:
            os.environ[key] = value


def _get_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)

    if value is None:
        return default

    return value.strip().lower() in {"1", "true", "yes", "on"}


def _get_list(name: str, default: list[str]) -> list[str]:
    value = os.getenv(name)

    if value is None:
        return default

    return [
        item.strip()
        for item in value.split(",")
        if item.strip()
    ]


def _get_optional_string(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(name)

    if value is None:
        return default

    value = value.strip()

    return value or None


@dataclass(frozen=True)
class Settings:
    secret_key: str
    database_url: str
    frontend_url: str
    cors_origins: list[str]
    cors_origin_regex: Optional[str]
    smtp_host: str
    smtp_port: int
    smtp_username: str
    smtp_password: str
    smtp_from_email: str
    smtp_from_name: str
    smtp_use_tls: bool

    @property
    def is_sqlite_database(self) -> bool:
        return self.database_url.startswith("sqlite:")


_load_dotenv_file()


settings = Settings(
    secret_key=os.getenv("SECRET_KEY", "SUPER_SECRET_KEY"),
    database_url=os.getenv("DATABASE_URL", "sqlite:///./database.db"),
    frontend_url=os.getenv("FRONTEND_URL", "https://system-strzelecki.pl").rstrip("/"),
    cors_origins=_get_list(
        "CORS_ORIGINS",
        [
            "https://system-strzelecki.pl",
            "https://www.system-strzelecki.pl",
        ],
    ),
    cors_origin_regex=_get_optional_string(
        "CORS_ORIGIN_REGEX",
        None,
    ),
    smtp_host=os.getenv("SMTP_HOST", ""),
    smtp_port=int(os.getenv("SMTP_PORT", "587")),
    smtp_username=os.getenv("SMTP_USERNAME", ""),
    smtp_password=os.getenv("SMTP_PASSWORD", ""),
    smtp_from_email=os.getenv("SMTP_FROM_EMAIL", ""),
    smtp_from_name=os.getenv("SMTP_FROM_NAME", "Shooting System"),
    smtp_use_tls=_get_bool("SMTP_USE_TLS", True),
)
