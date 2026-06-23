from fastapi import FastAPI, File, UploadFile, Request
from fastapi import Depends, HTTPException, Cookie
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import func, or_, text
from PIL import Image, ImageOps, UnidentifiedImageError

from database import SessionLocal
from config import settings
from mailer import (
    ACTIVATION_LINK_PLACEHOLDER,
    MailConfigurationError,
    MailDeliveryError,
    default_activation_email_template,
    send_activation_email,
    send_password_reset_email,
)

from models import (
    AdDailyStat,
    AppSetting,
    User,
    Competition,
    Discipline,
    CompetitionParticipant,
    ParticipantDiscipline,
    JudgeInvitation,
    DisciplineResult,
    Achievement,
    RankingEntry,
)

from passlib.context import CryptContext

from jose import jwt
from jose import JWTError

from datetime import datetime, timedelta, timezone, time
from typing import Optional
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from io import BytesIO
import hashlib
import json
import math
import os
import platform
import re
import secrets
import shutil
import subprocess
import unicodedata
from pathlib import Path
from uuid import uuid4
from zoneinfo import ZoneInfo


ALGORITHM = "HS256"
ACCESS_TOKEN_TTL = timedelta(minutes=15)
REFRESH_TOKEN_TTL = timedelta(days=30)
REFRESH_TOKEN_COOKIE_NAME = "refresh_token"
REFRESH_TOKEN_COOKIE_PATH = "/api"
APP_TIMEZONE = ZoneInfo("Europe/Warsaw")
PROFILE_DATE_FORMATS = ("%Y-%m-%d", "%d.%m.%Y", "%d-%m-%Y", "%d/%m/%Y")
PASSWORD_RESET_LIMIT = 3
PASSWORD_RESET_WINDOW = timedelta(hours=1)
PASSWORD_RESET_TOKEN_TTL = timedelta(minutes=30)
LOGIN_IP_LIMIT = 10
LOGIN_IP_WINDOW = timedelta(minutes=1)
LOGIN_EMAIL_FAILURE_LIMIT = 5
LOGIN_EMAIL_FAILURE_WINDOW = timedelta(minutes=15)
PREMIUM_EXPIRED_DETAIL = "Status premium wygasł"
BACKUP_DIR = Path("/home/ubuntu/backups/shooting-system/postgres")
UPLOADS_DIR = Path(__file__).resolve().parent / "uploads"
PROFILE_PHOTO_DIR = UPLOADS_DIR / "profile-photos"
EMAIL_ASSET_DIR = UPLOADS_DIR / "email-assets"
PROFILE_PHOTO_ROUTE_PREFIX = "/uploads/profile-photos"
EMAIL_ASSET_ROUTE_PREFIX = "/uploads/email-assets"
PROFILE_PHOTO_SIZE = 320
PROFILE_PHOTO_MAX_BYTES = 8 * 1024 * 1024
PROFILE_PHOTO_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
EMAIL_ASSET_MAX_BYTES = 8 * 1024 * 1024
EMAIL_ASSET_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ACTIVATION_EMAIL_SETTING_KEY = "activation_email_template"
MONITORED_LOG_FILES = [
    {
        "name": "Frontend error",
        "path": Path("/home/ubuntu/.pm2/logs/shooting-frontend-error.log"),
    },
    {
        "name": "Frontend output",
        "path": Path("/home/ubuntu/.pm2/logs/shooting-frontend-out.log"),
    },
    {
        "name": "PM2 daemon",
        "path": Path("/home/ubuntu/.pm2/pm2.log"),
    },
    {
        "name": "Nginx error",
        "path": Path("/var/log/nginx/error.log"),
    },
]
MONITORED_SERVICES = [
    "shooting-backend.service",
    "pm2-ubuntu.service",
    "nginx.service",
    "postgresql.service",
    "shooting-postgres-backup.timer",
]

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)

app = FastAPI()
PROFILE_PHOTO_DIR.mkdir(parents=True, exist_ok=True)
EMAIL_ASSET_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="login"
)
optional_oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="login",
    auto_error=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RegisterData(BaseModel):
    email: str
    password: str
    terms_accepted: bool = False
    privacy_policy_accepted: bool = False
    results_publication_accepted: bool = False


class PzssClubRegisterData(BaseModel):
    short_name: str
    full_name: str
    email: str
    phone_number: str
    password: str
    terms_accepted: bool = False
    privacy_policy_accepted: bool = False
    results_publication_accepted: bool = False


class PzssClubApprovalData(BaseModel):
    license_number: str


class AdminCreateUserData(BaseModel):
    email: str
    password: str


class LoginData(BaseModel):
    email: str
    password: str


class ForgotPasswordData(BaseModel):
    email: str


class ResetPasswordData(BaseModel):
    token: str
    password: str


class ActivationEmailTemplateData(BaseModel):
    subject: str
    text_body: str
    html_body: str


class PremiumPackageSettingsData(BaseModel):
    monthly_price: str
    yearly_price: str
    features: list[str]


class PremiumSettingsData(BaseModel):
    shooter: PremiumPackageSettingsData
    organizer: PremiumPackageSettingsData


class CompetitionData(BaseModel):
    name: str
    date: str
    location: str
    entry_fee: str = ""
    organizer_full_name: str = ""
    organizer_logo: str = ""
    sponsors: str = ""
    sponsor_logo: str = ""
    participant_limit: Optional[int] = None
    pzss_license_calendar: bool = False
    requires_licensed_judge: Optional[bool] = None


class DisciplineData(BaseModel):
    name: str
    description: str
    scoring_type: str = "points"
    discipline_type: str
    shots_count: int
    trap_variant: str = ""
    trap_series_count: int = 0
    clay_variant: str = ""
    clay_series_count: int = 0
    ammo_type: str
    ammo_price: str
    clay_price: str = ""
    entry_fee: str = ""


class ProfileData(BaseModel):
    first_name: str
    last_name: str
    license_number: str = ""
    license_uuid: str = ""
    license_club_code: str = ""
    no_license: bool = False
    club: str = ""
    no_club: bool = False
    verified_club_id: Optional[int] = None
    voivodeship: str = ""
    birth_date: str
    phone_number: str = ""
    organizer_name: str = ""
    judge_license_number: str = ""
    judge_license_valid_until: str = ""


class UserRoleData(BaseModel):
    role: str = ""
    roles: list[str] = []


class UserPremiumDisabledData(BaseModel):
    premium_disabled: bool = False


class RoleRequestData(BaseModel):
    role: str
    confirmed: bool = False
    phone_number: str = ""
    organizer_name: str = ""
    judge_license_number: str = ""
    judge_license_valid_until: str = ""


class JoinDisciplineData(BaseModel):
    discipline_id: int
    ammo_type: str


class JoinCompetitionData(BaseModel):
    disciplines: list[JoinDisciplineData]
    entry_type: str = "shooter"


class ManualParticipantData(BaseModel):
    first_name: str
    last_name: str
    birth_date: str
    license_number: str
    club: str
    disciplines: list[JoinDisciplineData]


class JudgeInvitationData(BaseModel):
    judge_license_number: str = ""
    judge_email: str = ""
    discipline_ids: list[int] = []
    is_head_judge: bool = False


class JudgeAssignmentRemovalData(BaseModel):
    judge_email: str
    discipline_id: Optional[int] = None


class JudgeResultData(BaseModel):
    participant_id: int
    points: str
    result_data: Optional[str] = None


class ParticipantPaymentStatusData(BaseModel):
    checked_in: Optional[bool] = None
    paid: Optional[bool] = None


class ParticipantSquadGroupData(BaseModel):
    group_number: int
    squad_position: int = 0


class ResultsTableSettingsData(BaseModel):
    grid_template_columns: str
    min_width: str
    row_padding_y: str


class UiSettingsData(BaseModel):
    block_padding: str
    block_min_height: str
    block_radius: str
    button_padding_x: str
    button_padding_y: str
    button_min_height: str
    button_radius: str
    navbar_padding_x: str
    navbar_padding_y: str
    navbar_content_max_width: str


class ProfileSettingsData(BaseModel):
    label_color: str
    value_color: str
    label_font_size: str
    value_font_size: str
    row_gap: str
    achievement_icon_size: str = "4rem"
    achievement_gap: str = "1.25rem"


class AdminGenerateCompetitionData(BaseModel):
    status: str = "started"
    participants_count: int = 12
    disciplines_count: int = 3
    include_results: bool = True


class AdminGenerateParticipantsData(BaseModel):
    competition_id: int
    count: int = 10
    checked_in: bool = True
    paid: bool = True
    include_results: bool = False


class AdminGenerateResultsData(BaseModel):
    competition_id: int
    overwrite: bool = True


class AdEventData(BaseModel):
    slot: str
    device: str
    event_type: str = "impression"


ALLOWED_ROLES = ["user", "shooter", "organizer", "judge", "admin"]
USER_ACCOUNT_TYPE = "user"
PZSS_CLUB_ACCOUNT_TYPE = "pzss_club"
PZSS_CLUB_PENDING = "pending"
PZSS_CLUB_APPROVED = "approved"
PZSS_CLUB_REJECTED = "rejected"
CLUB_MEMBERSHIP_PENDING = "pending"
CLUB_MEMBERSHIP_CONFIRMED = "confirmed"
POLISH_VOIVODESHIPS = [
    "dolnośląskie",
    "kujawsko-pomorskie",
    "lubelskie",
    "lubuskie",
    "łódzkie",
    "małopolskie",
    "mazowieckie",
    "opolskie",
    "podkarpackie",
    "podlaskie",
    "pomorskie",
    "śląskie",
    "świętokrzyskie",
    "warmińsko-mazurskie",
    "wielkopolskie",
    "zachodniopomorskie",
]
TEST_COMPETITION_STATUSES = ["draft", "published", "started", "completed"]
TEST_FIRST_NAMES = [
    "Jan",
    "Anna",
    "Piotr",
    "Katarzyna",
    "Tomasz",
    "Marta",
    "Michał",
    "Agnieszka",
    "Paweł",
    "Magdalena",
]
TEST_LAST_NAMES = [
    "Kowalski",
    "Nowak",
    "Wiśniewski",
    "Wójcik",
    "Kowalczyk",
    "Kamiński",
    "Lewandowski",
    "Zieliński",
    "Szymański",
    "Woźniak",
]
TEST_CLUBS = [
    "Test Klub Alfa",
    "Test Klub Bravo",
    "Test Klub Cel",
    "Test Klub Delta",
]
TEST_DISCIPLINE_TEMPLATES = [
    {
        "name": "Pistolet sportowy TEST",
        "description": "Konkurencja testowa pistoletowa",
        "scoring_type": "points",
        "shots_count": 10,
        "discipline_type": "pistol",
        "ammo_type": "9mm",
        "ammo_price": "1.20",
        "entry_fee": "25.00",
    },
    {
        "name": "Karabin sportowy TEST",
        "description": "Konkurencja testowa karabinowa",
        "scoring_type": "points",
        "shots_count": 10,
        "discipline_type": "rifle",
        "ammo_type": ".223",
        "ammo_price": "2.50",
        "entry_fee": "30.00",
    },
    {
        "name": "Strzelba dynamiczna TEST",
        "description": "Konkurencja testowa strzelbowa",
        "scoring_type": "points",
        "shots_count": 8,
        "discipline_type": "shotgun",
        "ammo_type": "12/70",
        "ammo_price": "2.00",
        "entry_fee": "35.00",
    },
]
RESULTS_TABLE_SETTINGS_DEFAULTS = {
    "grid_template_columns": "80px 1.6fr 1fr 1.1fr 120px",
    "min_width": "820px",
    "row_padding_y": "0.75rem",
}
UI_SETTINGS_DEFAULTS = {
    "block_padding": "1.5rem",
    "block_min_height": "0px",
    "block_radius": "1.5rem",
    "button_padding_x": "1.25rem",
    "button_padding_y": "0.75rem",
    "button_min_height": "0px",
    "button_radius": "0.75rem",
    "navbar_padding_x": "1.5rem",
    "navbar_padding_y": "0.75rem",
    "navbar_content_max_width": "100%",
}
PROFILE_SETTINGS_DEFAULTS = {
    "profile_label_color": "#f87171",
    "profile_value_color": "#f9fafb",
    "profile_label_font_size": "1.125rem",
    "profile_value_font_size": "1.25rem",
    "profile_row_gap": "2rem",
    "profile_achievement_icon_size": "4rem",
    "profile_achievement_gap": "1.25rem",
}
PREMIUM_SETTINGS_KEY = "premium_packages"
PREMIUM_FEATURES = {
    "shooter": [
        {"id": "live_results", "label": "Wyniki na Żywo"},
        {"id": "historical_results", "label": "Wyniki Historyczne"},
        {"id": "ranking", "label": "Ranking"},
        {"id": "achievements", "label": "Odznaczenia"},
        {"id": "statistics", "label": "Moje statystyki"},
        {"id": "profile_badges", "label": "Odznaczenia w profilu"},
    ],
    "organizer": [
        {
            "id": "unlimited_active_publications",
            "label": "Nielimitowana liczba jednocześnie opublikowanych zawodów",
        },
    ],
}
PREMIUM_SETTINGS_DEFAULTS = {
    "shooter": {
        "monthly_price": "19.99",
        "yearly_price": "199.00",
        "features": [
            "live_results",
            "historical_results",
            "ranking",
            "achievements",
            "statistics",
            "profile_badges",
        ],
    },
    "organizer": {
        "monthly_price": "99.00",
        "yearly_price": "500.00",
        "features": [
            "unlimited_active_publications",
        ],
    },
}
ORGANIZER_FREE_ACTIVE_PUBLICATIONS_LIMIT = 1
ACHIEVEMENT_CATEGORY_IDS = ["overall", "pistol", "rifle", "shotgun"]
ACHIEVEMENT_MEDALS = {
    1: "gold",
    2: "silver",
    3: "bronze",
}
MIN_STATISTICS_DISCIPLINE_SHOOTERS = 50
RANKING_LIMIT = 1000
DISCIPLINE_TYPE_GROUPS = [
    {
        "firearm_type": "pistol",
        "options": [
            ("pistol-air-10m", "Pistolet pneumatyczny 10 m (Ppn)"),
            ("pistol-sport-25m", "Pistolet sportowy 25 m (Psp)"),
            ("pistol-rapid-fire-25m", "Pistolet szybkostrzelny 25 m (Psz)"),
            ("pistol-free-50m", "Pistolet dowolny 50 m (Pdw)"),
            ("pistol-center-fire-25m", "Pistolet centralnego zapłonu 25 m (Pcz)"),
            ("pistol-standard-25m", "Pistolet standardowy 25 m (Pst)"),
            ("ipsc-pistol", "IPSC Pistolet"),
            ("idpa", "IDPA"),
            ("action-air", "Action Air"),
        ],
    },
    {
        "firearm_type": "rifle",
        "options": [
            ("rifle-air-10m", "Karabin pneumatyczny 10 m (Kpn)"),
            ("rifle-sport-50m-60-prone", "Karabin sportowy 50 m - 60 leżąc (Ksp 60)"),
            ("rifle-3-positions-50m", "Karabin 3 postawy 50 m (Ksp 3×20 / Kdw 3×40)"),
            ("rifle-free-300m-prone", "Karabin dowolny 300 m - leżąc"),
            ("rifle-free-300m-3-positions", "Karabin dowolny 300 m - 3 postawy"),
            ("rifle-standard-300m", "Karabin standardowy 300 m (Kst)"),
            ("moving-target", "Ruchoma tarcza (RT)"),
            ("long-range", "Strzelanie długodystansowe (Long Range)"),
            ("centerfire-rifle", "Karabin centralnego zapłonu (KCZ)"),
            ("practical-rifle", "Karabin praktyczny (KPr)"),
            ("pcc", "PCC (Pistol Caliber Carbine)"),
            ("2gun", "2GUN"),
            ("3gun", "3-Gun (Multi-Gun)"),
        ],
    },
    {
        "firearm_type": "shotgun",
        "options": [
            ("trap", "Trap"),
            ("skeet", "Skeet"),
            ("double-trap", "Double Trap"),
            ("trap-mix", "Trap MIX"),
            ("skeet-mix", "Skeet MIX"),
            ("practical-shotgun", "Strzelba praktyczna (SPr)"),
            ("ipsc-shotgun", "IPSC Shotgun"),
        ],
    },
    {
        "firearm_type": "",
        "options": [
            ("black-powder", "Strzelectwo czarnoprochowe"),
            ("cowboy-action-shooting", "Strzelectwo westernowe (Cowboy Action Shooting - CAS)"),
            ("sporting-clays", "Strzelectwo parkurowe (Sporting Clays / Parcours de Chasse)"),
            ("historical-shooting", "Strzelectwo historyczne"),
            ("kurkowe-shooting", "Strzelectwo kurkowe"),
        ],
    },
]
DISCIPLINE_TYPE_LABELS = {
    value: label
    for group in DISCIPLINE_TYPE_GROUPS
    for value, label in group["options"]
}
DISCIPLINE_TYPE_LABELS.update({
    "pistol": "Konkurencja pistoletowa",
    "rifle": "Konkurencja karabinowa",
    "shotgun": "Konkurencja strzelbowa",
})
DISCIPLINE_TYPE_FIREARM_TYPES = {
    value: group["firearm_type"]
    for group in DISCIPLINE_TYPE_GROUPS
    for value, _label in group["options"]
}
DISCIPLINE_TYPE_FIREARM_TYPES.update({
    "pistol": "pistol",
    "rifle": "rifle",
    "shotgun": "shotgun",
})
DISCIPLINE_TYPES = list(DISCIPLINE_TYPE_LABELS.keys())
DETAILED_DISCIPLINE_TYPES = [
    value
    for group in DISCIPLINE_TYPE_GROUPS
    for value, _label in group["options"]
]
RANKING_AGGREGATE_METRICS = ["overall", "pistol", "rifle", "shotgun"]
RANKING_METRICS = RANKING_AGGREGATE_METRICS + DETAILED_DISCIPLINE_TYPES
RANKING_METRIC_LABELS = {
    "overall": "Suma ogólna",
    "pistol": "Konkurencje pistoletowe i rewolwerowe",
    "rifle": "Konkurencje karabinowe",
    "shotgun": "Konkurencje strzelbowe",
}
RANKING_METRIC_LABELS.update({
    discipline_type: DISCIPLINE_TYPE_LABELS[discipline_type]
    for discipline_type in DETAILED_DISCIPLINE_TYPES
})
AD_SLOTS = ["home_desktop_left", "home_desktop_right", "home_mobile_top"]
AD_SLOT_LABELS = {
    "home_desktop_left": "Home desktop - lewa kolumna",
    "home_desktop_right": "Home desktop - prawa kolumna",
    "home_mobile_top": "Home mobile - pasek pod nawigacją",
}
AD_DEVICES = ["desktop", "mobile"]
AD_EVENT_TYPES = ["impression", "click"]
TRAP_DISCIPLINE_TYPE = "trap"
SKEET_DISCIPLINE_TYPE = "skeet"
CLAY_HIT_POINTS = 5
TRAP_TARGETS_PER_SERIES = 25
TRAP_SHOTS_PER_TARGET = 2
TRAP_VARIANT_SERIES = {
    "trap-25": 1,
    "trap-50": 2,
    "trap-75": 3,
    "trap-125": 5,
}
TRAP_MANUAL_VARIANT = "manual"
SQUAD_GROUP_SIZE = 5
SKEET_TARGETS_PER_SERIES = 25
SKEET_SHOTS_PER_TARGET = 1
SKEET_VARIANT_SERIES = {
    "skeet-25": 1,
    "skeet-50": 2,
    "skeet-75": 3,
    "skeet-125": 5,
}
CLAY_MANUAL_VARIANT = "manual"
SKEET_SQUAD_GROUP_SIZE = 6
SKEET_QUALIFICATION_STAGES = [
    (1, [("single", ["high"]), ("double", ["high", "low"])]),
    (2, [("single", ["high"]), ("double", ["high", "low"])]),
    (3, [("single", ["high"]), ("double", ["high", "low"])]),
    (4, [("single", ["high"]), ("single", ["low"])]),
    (5, [("single", ["low"]), ("double", ["low", "high"])]),
    (6, [("single", ["low"]), ("double", ["low", "high"])]),
    (7, [("double", ["low", "high"])]),
    (4, [("double", ["high", "low"]), ("double", ["low", "high"])]),
    (8, [("single", ["high"]), ("single", ["low"])]),
]
SKEET_TARGET_SEQUENCE = [
    {
        "station": station,
        "presentation": presentation,
        "house": house,
    }
    for station, stage_presentations in SKEET_QUALIFICATION_STAGES
    for presentation, houses in stage_presentations
    for house in houses
]


def primary_role(roles: list[str]):
    for role in ["admin", "organizer", "judge", "shooter", "user"]:
        if role in roles:
            return role

    return "user"


def normalize_roles(roles: list[str]):
    normalized_roles = []

    for role in roles:
        if role in ALLOWED_ROLES and role not in normalized_roles:
            normalized_roles.append(role)

    if not normalized_roles:
        normalized_roles.append("user")

    if "admin" not in normalized_roles and "user" not in normalized_roles:
        normalized_roles.insert(0, "user")

    return sorted(
        normalized_roles,
        key=lambda role: ALLOWED_ROLES.index(role)
    )


def get_user_roles(user: User):
    if user.roles:
        return normalize_roles([
            role.strip()
            for role in user.roles.split(",")
            if role.strip()
        ])

    return normalize_roles([user.role or "user"])


def set_user_roles(user: User, roles: list[str]):
    normalized_roles = normalize_roles(roles)
    user.roles = ",".join(normalized_roles)
    user.role = primary_role(normalized_roles)


def validate_results_table_settings(data: ResultsTableSettingsData):
    grid_template_columns = data.grid_template_columns.strip()
    min_width = data.min_width.strip()
    row_padding_y = data.row_padding_y.strip()
    safe_css_pattern = r"^[0-9a-zA-Z.%_(), -]+$"
    size_pattern = r"^\d+(\.\d+)?(px|rem|em|%)$"

    if not re.fullmatch(safe_css_pattern, grid_template_columns):
        raise HTTPException(
            status_code=400,
            detail="Układ kolumn może zawierać tylko bezpieczne wartości CSS"
        )

    if len(grid_template_columns.split()) != 5:
        raise HTTPException(
            status_code=400,
            detail="Podaj 5 wartości: Miejsce Zawodnik Licencja Klub Punkty"
        )

    if not re.fullmatch(size_pattern, min_width):
        raise HTTPException(
            status_code=400,
            detail="Minimalna szerokość musi mieć jednostkę px, rem, em albo %"
        )

    if not re.fullmatch(size_pattern, row_padding_y):
        raise HTTPException(
            status_code=400,
            detail="Wysokość wiersza musi mieć jednostkę px, rem, em albo %"
        )

    return {
        "grid_template_columns": grid_template_columns,
        "min_width": min_width,
        "row_padding_y": row_padding_y,
    }


def validate_ui_settings(data: UiSettingsData):
    settings = {
        "block_padding": data.block_padding.strip(),
        "block_min_height": data.block_min_height.strip(),
        "block_radius": data.block_radius.strip(),
        "button_padding_x": data.button_padding_x.strip(),
        "button_padding_y": data.button_padding_y.strip(),
        "button_min_height": data.button_min_height.strip(),
        "button_radius": data.button_radius.strip(),
        "navbar_padding_x": data.navbar_padding_x.strip(),
        "navbar_padding_y": data.navbar_padding_y.strip(),
        "navbar_content_max_width": data.navbar_content_max_width.strip(),
    }
    size_pattern = r"^\d+(\.\d+)?(px|rem|em|%)$"

    for key, value in settings.items():
        if not re.fullmatch(size_pattern, value):
            raise HTTPException(
                status_code=400,
                detail=f"Wartość {key} musi mieć jednostkę px, rem, em albo %"
            )

    return settings


def validate_profile_settings(data: ProfileSettingsData):
    settings = {
        "profile_label_color": data.label_color.strip(),
        "profile_value_color": data.value_color.strip(),
        "profile_label_font_size": data.label_font_size.strip(),
        "profile_value_font_size": data.value_font_size.strip(),
        "profile_row_gap": data.row_gap.strip(),
        "profile_achievement_icon_size": data.achievement_icon_size.strip(),
        "profile_achievement_gap": data.achievement_gap.strip(),
    }
    color_pattern = r"^#[0-9a-fA-F]{6}$"
    size_pattern = r"^\d+(\.\d+)?(px|rem|em|%)$"

    for key in ["profile_label_color", "profile_value_color"]:
        if not re.fullmatch(color_pattern, settings[key]):
            raise HTTPException(
                status_code=400,
                detail="Kolor profilu musi być w formacie HEX, np. #f87171"
            )

    for key in [
        "profile_label_font_size",
        "profile_value_font_size",
        "profile_row_gap",
        "profile_achievement_icon_size",
        "profile_achievement_gap",
    ]:
        if not re.fullmatch(size_pattern, settings[key]):
            raise HTTPException(
                status_code=400,
                detail=f"Wartość {key} musi mieć jednostkę px, rem, em albo %"
            )

    return settings


def normalize_premium_price(value: str):
    price_text = (value or "").strip().replace(",", ".")

    try:
        price = Decimal(price_text)
    except (InvalidOperation, ValueError):
        raise HTTPException(
            status_code=400,
            detail="Cena premium musi być poprawną liczbą"
        )

    if price < 0:
        raise HTTPException(
            status_code=400,
            detail="Cena premium nie może być ujemna"
        )

    if price > Decimal("999999.99"):
        raise HTTPException(
            status_code=400,
            detail="Cena premium jest zbyt wysoka"
        )

    return str(price.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def premium_feature_ids(package_type: str):
    return {
        feature["id"]
        for feature in PREMIUM_FEATURES[package_type]
    }


def normalize_premium_package(package_type: str, package):
    allowed_feature_ids = premium_feature_ids(package_type)
    selected_features = []

    for feature_id in package.features:
        if feature_id not in allowed_feature_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Nieprawidłowa funkcja premium: {feature_id}"
            )

        if feature_id not in selected_features:
            selected_features.append(feature_id)

    return {
        "monthly_price": normalize_premium_price(package.monthly_price),
        "yearly_price": normalize_premium_price(package.yearly_price),
        "features": selected_features,
    }


def validate_premium_settings(data: PremiumSettingsData):
    return {
        "shooter": normalize_premium_package("shooter", data.shooter),
        "organizer": normalize_premium_package("organizer", data.organizer),
    }


def validate_registration_consents(data: RegisterData | PzssClubRegisterData):
    if (
        not data.terms_accepted
        or not data.privacy_policy_accepted
        or not data.results_publication_accepted
    ):
        raise HTTPException(
            status_code=400,
            detail="Zaznacz wszystkie wymagane zgody"
        )


def get_setting_value(key: str, db):
    setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == key)
        .first()
    )

    if setting:
        return setting.value

    defaults = {
        **RESULTS_TABLE_SETTINGS_DEFAULTS,
        **UI_SETTINGS_DEFAULTS,
        **PROFILE_SETTINGS_DEFAULTS,
    }

    return defaults[key]


def set_setting_value(key: str, value: str, db):
    setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == key)
        .first()
    )

    if not setting:
        setting = AppSetting(
            key=key,
            value=value,
        )
        db.add(setting)
    else:
        setting.value = value


def get_activation_email_template(db):
    defaults = default_activation_email_template()
    setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == ACTIVATION_EMAIL_SETTING_KEY)
        .first()
    )

    if not setting:
        return defaults

    try:
        stored = json.loads(setting.value)
    except (TypeError, json.JSONDecodeError):
        return defaults

    if not isinstance(stored, dict):
        return defaults

    return {
        key: stored.get(key, default) if isinstance(stored.get(key, default), str) else default
        for key, default in defaults.items()
    }


def validate_activation_email_template(data: ActivationEmailTemplateData):
    template = {
        "subject": data.subject.strip(),
        "text_body": data.text_body.strip(),
        "html_body": data.html_body.strip(),
    }

    if not template["subject"]:
        raise HTTPException(status_code=400, detail="Temat wiadomości nie może być pusty")

    if len(template["subject"]) > 200:
        raise HTTPException(status_code=400, detail="Temat może mieć maksymalnie 200 znaków")

    if len(template["text_body"]) > 20000 or len(template["html_body"]) > 100000:
        raise HTTPException(status_code=400, detail="Szablon wiadomości jest zbyt długi")

    for field in ("text_body", "html_body"):
        if ACTIVATION_LINK_PLACEHOLDER not in template[field]:
            raise HTTPException(
                status_code=400,
                detail=f"W treści tekstowej i HTML musi pozostać znacznik {ACTIVATION_LINK_PLACEHOLDER}",
            )

    return template


def get_results_table_settings(db):
    return {
        key: get_setting_value(key, db)
        for key in RESULTS_TABLE_SETTINGS_DEFAULTS
    }


def get_ui_settings(db):
    return {
        key: get_setting_value(key, db)
        for key in UI_SETTINGS_DEFAULTS
    }


def get_profile_settings(db):
    stored_settings = {
        key: get_setting_value(key, db)
        for key in PROFILE_SETTINGS_DEFAULTS
    }

    return {
        "label_color": stored_settings["profile_label_color"],
        "value_color": stored_settings["profile_value_color"],
        "label_font_size": stored_settings["profile_label_font_size"],
        "value_font_size": stored_settings["profile_value_font_size"],
        "row_gap": stored_settings["profile_row_gap"],
        "achievement_icon_size": stored_settings["profile_achievement_icon_size"],
        "achievement_gap": stored_settings["profile_achievement_gap"],
    }


def get_premium_settings(db):
    setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == PREMIUM_SETTINGS_KEY)
        .first()
    )
    stored = {}

    if setting:
        try:
            stored = json.loads(setting.value)
        except (TypeError, json.JSONDecodeError):
            stored = {}

    if not isinstance(stored, dict):
        stored = {}

    packages = {}

    for package_type, defaults in PREMIUM_SETTINGS_DEFAULTS.items():
        stored_package = stored.get(package_type, {})

        if not isinstance(stored_package, dict):
            stored_package = {}

        allowed_feature_ids = premium_feature_ids(package_type)
        stored_features = stored_package.get("features", defaults["features"])

        if not isinstance(stored_features, list):
            stored_features = defaults["features"]

        features = [
            feature_id
            for feature_id in stored_features
            if isinstance(feature_id, str) and feature_id in allowed_feature_ids
        ]

        packages[package_type] = {
            "monthly_price": str(stored_package.get("monthly_price") or defaults["monthly_price"]),
            "yearly_price": str(stored_package.get("yearly_price") or defaults["yearly_price"]),
            "features": features,
            "available_features": PREMIUM_FEATURES[package_type],
        }

    return packages


def validate_ad_event(data: AdEventData):
    slot = (data.slot or "").strip()
    device = (data.device or "").strip()
    event_type = (data.event_type or "impression").strip()

    if slot not in AD_SLOTS:
        raise HTTPException(
            status_code=400,
            detail="Nieprawidłowy slot reklamowy"
        )

    if device not in AD_DEVICES:
        raise HTTPException(
            status_code=400,
            detail="Nieprawidłowy typ urządzenia"
        )

    if event_type not in AD_EVENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Nieprawidłowy typ zdarzenia reklamowego"
        )

    return slot, device, event_type


def record_ad_event(slot: str, device: str, event_type: str, db):
    today = datetime.now(APP_TIMEZONE).date().isoformat()
    stat = (
        db.query(AdDailyStat)
        .filter(
            AdDailyStat.date == today,
            AdDailyStat.slot == slot,
            AdDailyStat.device == device,
        )
        .first()
    )

    if not stat:
        stat = AdDailyStat(
            date=today,
            slot=slot,
            device=device,
            impressions=0,
            clicks=0,
        )
        db.add(stat)

    if event_type == "click":
        stat.clicks = (stat.clicks or 0) + 1
    else:
        stat.impressions = (stat.impressions or 0) + 1

    stat.updated_at = now_iso()
    db.commit()
    db.refresh(stat)

    return stat


def ad_report(days: int, db):
    safe_days = min(max(days, 1), 366)
    start_date = (
        datetime.now(APP_TIMEZONE).date() - timedelta(days=safe_days - 1)
    ).isoformat()
    rows = (
        db.query(AdDailyStat)
        .filter(AdDailyStat.date >= start_date)
        .order_by(AdDailyStat.date.desc(), AdDailyStat.slot.asc(), AdDailyStat.device.asc())
        .all()
    )
    totals_by_slot = {
        slot: {
            "slot": slot,
            "label": AD_SLOT_LABELS[slot],
            "impressions": 0,
            "clicks": 0,
        }
        for slot in AD_SLOTS
    }
    totals_by_device = {
        device: {
            "device": device,
            "impressions": 0,
            "clicks": 0,
        }
        for device in AD_DEVICES
    }
    total_impressions = 0
    total_clicks = 0
    report_rows = []

    for row in rows:
        impressions = int(row.impressions or 0)
        clicks = int(row.clicks or 0)
        label = AD_SLOT_LABELS.get(row.slot, row.slot)

        total_impressions += impressions
        total_clicks += clicks

        if row.slot in totals_by_slot:
            totals_by_slot[row.slot]["impressions"] += impressions
            totals_by_slot[row.slot]["clicks"] += clicks

        if row.device in totals_by_device:
            totals_by_device[row.device]["impressions"] += impressions
            totals_by_device[row.device]["clicks"] += clicks

        report_rows.append({
            "date": row.date,
            "slot": row.slot,
            "label": label,
            "device": row.device,
            "impressions": impressions,
            "clicks": clicks,
            "ctr": round((clicks / impressions) * 100, 2) if impressions else 0,
        })

    return {
        "days": safe_days,
        "start_date": start_date,
        "generated_at": now_iso(),
        "total_impressions": total_impressions,
        "total_clicks": total_clicks,
        "ctr": round((total_clicks / total_impressions) * 100, 2) if total_impressions else 0,
        "totals_by_slot": list(totals_by_slot.values()),
        "totals_by_device": list(totals_by_device.values()),
        "rows": report_rows,
    }


PDF_TEXT_TRANSLATION = str.maketrans({
    "ą": "a", "ć": "c", "ę": "e", "ł": "l", "ń": "n", "ó": "o", "ś": "s", "ż": "z", "ź": "z",
    "Ą": "A", "Ć": "C", "Ę": "E", "Ł": "L", "Ń": "N", "Ó": "O", "Ś": "S", "Ż": "Z", "Ź": "Z",
})


def pdf_safe_text(value) -> str:
    raw = str(value or "").translate(PDF_TEXT_TRANSLATION)
    normalized = unicodedata.normalize("NFKD", raw)
    return "".join(char for char in normalized if ord(char) < 128)


def pdf_escape(value) -> str:
    return (
        pdf_safe_text(value)
        .replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
    )


def pdf_number(value) -> str:
    return f"{int(value or 0):,}".replace(",", " ")


def pdf_ctr(clicks, impressions) -> str:
    if not impressions:
        return "0.00%"
    return f"{(clicks / impressions) * 100:.2f}%"


def build_pdf(objects: list[bytes]) -> bytes:
    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]

    for index, obj in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{index} 0 obj\n".encode("latin-1"))
        output.extend(obj)
        output.extend(b"\nendobj\n")

    xref_offset = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode("latin-1"))
    output.extend(b"0000000000 65535 f \n")

    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("latin-1"))

    output.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode("latin-1")
    )
    return bytes(output)


def build_ad_report_pdf(report: dict) -> bytes:
    page_width = 595
    page_height = 842
    margin_x = 42
    bottom_y = 44
    y = 790
    current_page: list[str] = []
    pages: list[list[str]] = []

    def new_page():
        nonlocal y, current_page
        if current_page:
            pages.append(current_page)
        current_page = []
        y = 790

    def add_line(text: str, size: int = 10, font: str = "F1", x: int = margin_x, gap: int = 15):
        nonlocal y
        if y < bottom_y:
            new_page()
        current_page.append(f"BT /{font} {size} Tf {x} {y} Td ({pdf_escape(text)}) Tj ET\n")
        y -= gap

    def add_gap(amount: int = 8):
        nonlocal y
        y -= amount
        if y < bottom_y:
            new_page()

    def shorten(value: str, length: int) -> str:
        safe = pdf_safe_text(value)
        if len(safe) <= length:
            return safe
        return safe[: max(0, length - 3)] + "..."

    end_date = datetime.now(APP_TIMEZONE).date().isoformat()
    generated_at = report.get("generated_at") or now_iso()
    period_days = int(report.get("days") or 0)
    start_date = report.get("start_date") or ""

    add_line("Raport statystyk reklamowych", 18, "F2", gap=24)
    add_line("Shooting System", 12, "F2")
    add_line(f"Adres strony: {settings.frontend_url}")
    add_line("Typ raportu: reklamy na stronie glownej")
    add_line(f"Okres raportu: {start_date} - {end_date} ({period_days} dni)")
    add_line(f"Wygenerowano: {generated_at}")
    add_gap(10)

    add_line("Identyfikacja pomiaru", 13, "F2", gap=18)
    add_line("Raport obejmuje sloty reklamowe: lewa kolumna desktop, prawa kolumna desktop oraz pasek mobilny.")
    add_line("Odsłona jest zliczana przez mechanizm strony po pojawieniu się slotu reklamy w obszarze ekranu użytkownika.")
    add_line("Kliknięcie jest zliczane po interakcji użytkownika ze slotem reklamowym.")
    add_line("Dane są agregowane dziennie według daty, slotu i typu urządzenia; raport nie zawiera danych osobowych użytkowników.")
    add_gap(10)

    total_impressions = int(report.get("total_impressions") or 0)
    total_clicks = int(report.get("total_clicks") or 0)
    add_line("Podsumowanie", 13, "F2", gap=18)
    add_line(f"Łączne odsłony: {pdf_number(total_impressions)}")
    add_line(f"Łączne kliknięcia: {pdf_number(total_clicks)}")
    add_line(f"CTR: {pdf_ctr(total_clicks, total_impressions)}")
    add_gap(10)

    add_line("Podsumowanie według slotów", 13, "F2", gap=18)
    add_line(f"{'Slot':<38} {'Odsłony':>10} {'Kliknięcia':>10} {'CTR':>8}", 9, "F3")
    add_line("-" * 72, 9, "F3")
    for item in report.get("totals_by_slot", []):
        impressions = int(item.get("impressions") or 0)
        clicks = int(item.get("clicks") or 0)
        add_line(
            f"{shorten(item.get('label') or item.get('slot') or '', 38):<38} {pdf_number(impressions):>10} {pdf_number(clicks):>10} {pdf_ctr(clicks, impressions):>8}",
            9,
            "F3",
        )
    add_gap(10)

    device_labels = {"desktop": "Komputer", "mobile": "Telefon"}
    add_line("Podsumowanie według urządzeń", 13, "F2", gap=18)
    add_line(f"{'Urządzenie':<38} {'Odsłony':>10} {'Kliknięcia':>10} {'CTR':>8}", 9, "F3")
    add_line("-" * 72, 9, "F3")
    for item in report.get("totals_by_device", []):
        impressions = int(item.get("impressions") or 0)
        clicks = int(item.get("clicks") or 0)
        label = device_labels.get(item.get("device"), item.get("device") or "")
        add_line(
            f"{shorten(label, 38):<38} {pdf_number(impressions):>10} {pdf_number(clicks):>10} {pdf_ctr(clicks, impressions):>8}",
            9,
            "F3",
        )
    add_gap(10)

    add_line("Dane dzienne", 13, "F2", gap=18)
    if report.get("rows"):
        add_line(f"{'Data':<11} {'Slot':<28} {'Urz.':<8} {'Odsłony':>9} {'Klikn.':>8} {'CTR':>8}", 8, "F3", gap=12)
        add_line("-" * 82, 8, "F3", gap=12)
        for row in report.get("rows", []):
            impressions = int(row.get("impressions") or 0)
            clicks = int(row.get("clicks") or 0)
            device = device_labels.get(row.get("device"), row.get("device") or "")
            add_line(
                f"{shorten(row.get('date') or '', 11):<11} {shorten(row.get('label') or row.get('slot') or '', 28):<28} {shorten(device, 8):<8} {pdf_number(impressions):>9} {pdf_number(clicks):>8} {pdf_ctr(clicks, impressions):>8}",
                8,
                "F3",
                gap=12,
            )
    else:
        add_line("Brak zdarzen reklamowych w wybranym okresie.")

    if current_page:
        pages.append(current_page)

    objects: list[bytes] = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
    ]

    page_object_ids = []
    for page in pages:
        page_id = len(objects) + 1
        content_id = page_id + 1
        page_object_ids.append(page_id)
        stream = "".join(page).encode("latin-1", "replace")
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_width} {page_height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents {content_id} 0 R >>".encode("latin-1")
        )
        objects.append(b"<< /Length " + str(len(stream)).encode("latin-1") + b" >>\nstream\n" + stream + b"endstream")

    kids = " ".join(f"{page_id} 0 R" for page_id in page_object_ids)
    objects[1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_object_ids)} >>".encode("latin-1")

    return build_pdf(objects)


def pdf_filename_slug(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", pdf_safe_text(value).lower()).strip("-")
    return slug or "raport"


def competition_head_judge_name(competition: Competition, db) -> str:
    judge = (
        db.query(CompetitionParticipant)
        .filter(
            CompetitionParticipant.competition_id == competition.id,
            CompetitionParticipant.entry_type == "judge",
            CompetitionParticipant.is_head_judge == 1,
        )
        .first()
    )

    if not judge:
        return ""

    data = public_participant(judge, db)
    return participant_result_display_name(data) or data.get("user_email", "")


def competition_discipline_categories(competition: Competition, db):
    disciplines = (
        db.query(Discipline)
        .filter(Discipline.competition_id == competition.id)
        .order_by(Discipline.id.asc())
        .all()
    )
    return [
        category
        for category in live_result_categories(disciplines)
        if category["type"] == "discipline"
    ]


def build_competition_results_pdf(competition: Competition, db) -> bytes:
    page_width = 595
    page_height = 842
    margin_x = 38
    bottom_y = 42
    y = 790
    current_page: list[str] = []
    pages: list[list[str]] = []

    def new_page():
        nonlocal y, current_page
        if current_page:
            pages.append(current_page)
        current_page = []
        y = 790

    def ensure_space(height: int):
        if y - height < bottom_y:
            new_page()

    def add_line(text: str, size: int = 10, font: str = "F1", x: int = margin_x, gap: int = 14):
        nonlocal y
        ensure_space(gap)
        current_page.append(f"BT /{font} {size} Tf {x} {y} Td ({pdf_escape(text)}) Tj ET\n")
        y -= gap

    def add_gap(amount: int = 8):
        nonlocal y
        y -= amount
        if y < bottom_y:
            new_page()

    def add_rule():
        nonlocal y
        ensure_space(12)
        current_page.append(f"0.6 w {margin_x} {y} m {page_width - margin_x} {y} l S\n")
        y -= 12

    def shorten(value: str, length: int) -> str:
        safe = pdf_safe_text(value)
        if len(safe) <= length:
            return safe
        return safe[: max(0, length - 3)] + "..."

    categories = competition_discipline_categories(competition, db)
    head_judge = competition_head_judge_name(competition, db)

    add_line("KOMUNIKAT KLASYFIKACYJNY", 18, "F2", gap=24)
    add_line(competition.name, 15, "F2", gap=20)
    add_line(f"Data zawodów: {competition.date}")
    add_line(f"Miejsce: {competition.location}")
    add_line(f"Organizator: {competition.organizer_full_name or competition.created_by}")
    if competition.sponsors:
        add_line(f"Sponsorzy: {competition.sponsors}")
    if head_judge:
        add_line(f"Sedzia glowny: {head_judge}")
    add_gap(10)

    if not categories:
        add_line("Brak konkurencji w tych zawodach.", 12, "F2")
    else:
        for index, category in enumerate(categories, start=1):
            if index > 1:
                new_page()

            payload = result_category_payload(
                competition,
                category["id"],
                db,
                include_license=True,
            )
            shooters = payload.get("shooters", [])
            add_line(f"Konkurencja {index}: {category['name']}", 15, "F2", gap=20)
            add_line(f"Zawody: {competition.name}")
            add_line(f"Data i miejsce: {competition.date}, {competition.location}")
            add_line(f"Liczba sklasyfikowanych zawodników: {len(shooters)}")
            add_rule()

            add_line(
                f"{'M-ce':<5} {'Nazwisko i imię':<25} {'Licencja':<12} {'Klub':<20} {'Wynik':>8}",
                8,
                "F3",
                gap=12,
            )
            add_line("-" * 86, 8, "F3", gap=12)

            if not shooters:
                add_line("Brak sklasyfikowanych zawodników w tej konkurencji.")
                continue

            for shooter in shooters:
                add_line(
                    f"{str(shooter.get('place', '')):<5} {shorten(shooter.get('display_name') or '', 25):<25} {shorten(shooter.get('license_number') or '', 12):<12} {shorten(shooter.get('club') or '', 20):<20} {shorten(shooter.get('points') or '0', 8):>8}",
                    8,
                    "F3",
                    gap=12,
                )

            add_gap(12)
            add_rule()
            add_line("Podpis sedziego glownego: ................................................", 10, "F1", gap=16)
            add_line("Podpis organizatora: ....................................................", 10, "F1", gap=16)

    if current_page:
        pages.append(current_page)

    objects: list[bytes] = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
    ]

    page_object_ids = []
    for page_index, page in enumerate(pages, start=1):
        page_id = len(objects) + 1
        content_id = page_id + 1
        page_object_ids.append(page_id)
        footer = f"BT /F1 8 Tf {margin_x} 24 Td (Strona {page_index} / {len(pages)}) Tj ET\n"
        stream = ("".join(page) + footer).encode("latin-1", "replace")
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_width} {page_height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents {content_id} 0 R >>".encode("latin-1")
        )
        objects.append(b"<< /Length " + str(len(stream)).encode("latin-1") + b" >>\nstream\n" + stream + b"endstream")

    kids = " ".join(f"{page_id} 0 R" for page_id in page_object_ids)
    objects[1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_object_ids)} >>".encode("latin-1")

    return build_pdf(objects)


def has_role(user: User, role: str):
    return role in get_user_roles(user)


def normalize_birth_date(value: str):
    raw_value = (value or "").strip()

    for date_format in PROFILE_DATE_FORMATS:
        try:
            parsed_date = datetime.strptime(raw_value, date_format).date()
        except ValueError:
            continue

        today = datetime.now(APP_TIMEZONE).date()

        if parsed_date > today or parsed_date.year < 1900:
            return ""

        return parsed_date.isoformat()

    return ""


def normalize_phone_number(value: str):
    raw_value = (value or "").strip()
    has_plus_prefix = raw_value.startswith("+")
    digits = re.sub(r"\D", "", raw_value)

    if len(digits) < 7 or len(digits) > 15:
        return ""

    return f"+{digits}" if has_plus_prefix else digits


def normalize_text(value: str):
    return re.sub(r"\s+", " ", (value or "").strip())


def normalize_unique_key(value: str):
    normalized_value = normalize_text(value).lower()

    return normalized_value or ""


def normalize_voivodeship(value: str):
    normalized_value = normalize_text(value).lower()

    for voivodeship in POLISH_VOIVODESHIPS:
        if normalized_value == voivodeship.lower():
            return voivodeship

    return ""


def normalize_optional_phone_number(value: str):
    if not (value or "").strip():
        return ""

    return normalize_phone_number(value)


def normalize_valid_until_date(value: str):
    raw_value = (value or "").strip()

    for date_format in PROFILE_DATE_FORMATS:
        try:
            parsed_date = datetime.strptime(raw_value, date_format).date()
        except ValueError:
            continue

        today = datetime.now(APP_TIMEZONE).date()

        if parsed_date < today or parsed_date.year < 1900:
            return ""

        return parsed_date.isoformat()

    return ""


def is_profile_complete(user: User):
    has_club = bool(getattr(user, "no_club", 0)) or bool((user.club or "").strip())
    has_license = bool(getattr(user, "no_license", 0)) or bool((user.license_number or "").strip())

    return all([
        (user.first_name or "").strip(),
        (user.last_name or "").strip(),
        normalize_voivodeship(getattr(user, "voivodeship", "") or ""),
        has_club,
        has_license,
        normalize_birth_date(user.birth_date or ""),
    ])


def ensure_shooter_role(user: User):
    if is_profile_complete(user) and not has_role(user, "shooter"):
        set_user_roles(user, get_user_roles(user) + ["shooter"])


def is_user_online(user: User):
    if not user.last_seen:
        return False

    try:
        last_seen = datetime.fromisoformat(user.last_seen)
    except ValueError:
        return False

    return datetime.now(timezone.utc) - last_seen <= timedelta(minutes=5)


def is_pzss_club_account(user: User):
    return getattr(user, "account_type", "") == PZSS_CLUB_ACCOUNT_TYPE


def is_approved_pzss_club(user: User):
    return (
        is_pzss_club_account(user)
        and getattr(user, "pzss_club_status", "") == PZSS_CLUB_APPROVED
    )


def pzss_club_display_name(user: User):
    return (
        getattr(user, "pzss_club_short_name", "")
        or getattr(user, "organizer_name", "")
        or getattr(user, "pzss_club_full_name", "")
        or getattr(user, "club", "")
        or user.email
    )


def public_user(user: User):
    roles = get_user_roles(user)

    return {
        "id": user.id,
        "email": user.email,
        "role": primary_role(roles),
        "roles": roles,
        "is_active": bool(user.is_active),
        "first_name": user.first_name or "",
        "last_name": user.last_name or "",
        "club": user.club or "",
        "no_club": bool(getattr(user, "no_club", 0)),
        "license_number": user.license_number or "",
        "no_license": bool(getattr(user, "no_license", 0)),
        "voivodeship": getattr(user, "voivodeship", "") or "",
        "phone_number": user.phone_number or "",
        "organizer_name": getattr(user, "organizer_name", "") or "",
        "judge_license_number": user.judge_license_number or "",
        "judge_license_valid_until": getattr(user, "judge_license_valid_until", "") or "",
        "profile_complete": is_profile_complete(user),
        "last_seen": user.last_seen or "",
        "requested_role": user.requested_role or "",
        "password_reset_required": bool(user.password_reset_required),
        "premium_until": getattr(user, "premium_until", "") or "",
        "premium_disabled": bool(getattr(user, "premium_disabled", 0)),
        "profile_photo_url": getattr(user, "profile_photo_url", "") or "",
        "account_type": getattr(user, "account_type", "") or USER_ACCOUNT_TYPE,
        "pzss_club_short_name": getattr(user, "pzss_club_short_name", "") or "",
        "pzss_club_full_name": getattr(user, "pzss_club_full_name", "") or "",
        "pzss_club_license_number": getattr(user, "pzss_club_license_number", "") or "",
        "pzss_club_status": getattr(user, "pzss_club_status", "") or "",
        "verified_club_id": getattr(user, "verified_club_id", None),
        "club_membership_status": getattr(user, "club_membership_status", "") or "",
        "status": "online" if is_user_online(user) else "offline",
    }




def admin_user_info_value(value):
    if isinstance(value, bool):
        return "tak" if value else "nie"

    if isinstance(value, list):
        return ", ".join(str(item) for item in value) if value else "brak"

    if value is None or value == "":
        return "brak"

    return str(value)


def admin_user_info_row(label: str, value):
    return {
        "label": label,
        "value": admin_user_info_value(value),
    }


def admin_user_profile_info(user: User):
    roles = get_user_roles(user)

    return {
        "id": user.id,
        "email": user.email,
        "display_name": " ".join([
            user.first_name or "",
            user.last_name or "",
        ]).strip() or user.email,
        "sections": [
            {
                "title": "Konto",
                "rows": [
                    admin_user_info_row("ID", user.id),
                    admin_user_info_row("E-mail", user.email),
                    admin_user_info_row("Status online", "online" if is_user_online(user) else "offline"),
                    admin_user_info_row("Konto aktywne", bool(user.is_active)),
                    admin_user_info_row("Profil kompletny", is_profile_complete(user)),
                    admin_user_info_row("Ostatnia aktywność", user.last_seen),
                    admin_user_info_row("Wymuszony reset hasła", bool(user.password_reset_required)),
                ],
            },
            {
                "title": "Role i uprawnienia",
                "rows": [
                    admin_user_info_row("Rola główna", primary_role(roles)),
                    admin_user_info_row("Role", roles),
                    admin_user_info_row("Pole legacy role", user.role),
                    admin_user_info_row("Pole raw roles", user.roles),
                    admin_user_info_row("Typ konta", getattr(user, "account_type", "") or USER_ACCOUNT_TYPE),
                    admin_user_info_row("Status klubu PZSS", getattr(user, "pzss_club_status", "")),
                    admin_user_info_row("Licencja klubu PZSS", getattr(user, "pzss_club_license_number", "")),
                    admin_user_info_row("Prośba o rolę", user.requested_role),
                ],
            },
            {
                "title": "Profil strzelca",
                "rows": [
                    admin_user_info_row("Imię", user.first_name),
                    admin_user_info_row("Nazwisko", user.last_name),
                    admin_user_info_row("Data urodzenia", user.birth_date),
                    admin_user_info_row("Telefon", user.phone_number),
                    admin_user_info_row("Województwo", getattr(user, "voivodeship", "")),
                    admin_user_info_row("Klub", user.club),
                    admin_user_info_row("Brak klubu", bool(getattr(user, "no_club", 0))),
                    admin_user_info_row("Zweryfikowany klub ID", getattr(user, "verified_club_id", None)),
                    admin_user_info_row("Status członkostwa", getattr(user, "club_membership_status", "")),
                    admin_user_info_row("Nazwa skrócona PZSS", getattr(user, "pzss_club_short_name", "")),
                    admin_user_info_row("Nazwa pełna PZSS", getattr(user, "pzss_club_full_name", "")),
                    admin_user_info_row("Numer licencji", user.license_number),
                    admin_user_info_row("Brak licencji", bool(getattr(user, "no_license", 0))),
                    admin_user_info_row("UUID licencji / QR", getattr(user, "license_uuid", "")),
                    admin_user_info_row("Kod klubowy licencji", getattr(user, "license_club_code", "")),
                ],
            },
            {
                "title": "Organizator i sędzia",
                "rows": [
                    admin_user_info_row("Nazwa organizatora", getattr(user, "organizer_name", "")),
                    admin_user_info_row("Klucz organizatora", getattr(user, "organizer_name_key", "")),
                    admin_user_info_row("Numer licencji sędziowskiej", user.judge_license_number),
                    admin_user_info_row("Klucz licencji sędziowskiej", getattr(user, "judge_license_number_key", "")),
                    admin_user_info_row("Ważność licencji sędziowskiej", getattr(user, "judge_license_valid_until", "")),
                ],
            },
            {
                "title": "Premium",
                "rows": [
                    admin_user_info_row("Premium do", getattr(user, "premium_until", "")),
                    admin_user_info_row("Premium ręcznie wyłączone", bool(getattr(user, "premium_disabled", 0))),
                ],
            },
            {
                "title": "Zdjęcie profilowe",
                "rows": [
                    admin_user_info_row("Zdjęcie", getattr(user, "profile_photo_url", "")),
                ],
            },
            {
                "title": "Techniczne ukryte",
                "rows": [
                    admin_user_info_row("Hash hasła", "zapisany (ukryty)" if user.hashed_password else "brak"),
                    admin_user_info_row("Token aktywacyjny", "istnieje (ukryty)" if user.activation_token else "brak"),
                    admin_user_info_row("Token resetu hasła", "istnieje (ukryty)" if user.password_reset_token else "brak"),
                ],
            },
        ],
    }


def ensure_profile_qr_uuid(user: User, db):
    if getattr(user, "license_uuid", "") or not is_profile_complete(user):
        return

    user.license_uuid = str(uuid4())
    db.commit()
    db.refresh(user)


def auth_session_response(user: User, access_token: str):
    return {
        "message": "Logowanie poprawne",
        "access_token": access_token,
        "token": access_token,
        "email": user.email,
        "role": primary_role(get_user_roles(user)),
        "roles": get_user_roles(user),
        "profile_complete": is_profile_complete(user),
        "account_type": getattr(user, "account_type", "") or USER_ACCOUNT_TYPE,
        "pzss_club_status": getattr(user, "pzss_club_status", "") or "",
    }


def private_user_response(user: User, db, message: str = ""):
    ensure_profile_qr_uuid(user, db)
    response = public_user(user)
    response.update({
        "birth_date": user.birth_date or "",
        "license_uuid": getattr(user, "license_uuid", "") or "",
        "license_club_code": getattr(user, "license_club_code", "") or "",
        "achievements": user_achievements(user.email, db),
    })

    if message:
        response["message"] = message

    return response




def profile_photo_path_from_url(photo_url: str):
    if not photo_url or not photo_url.startswith(f"{PROFILE_PHOTO_ROUTE_PREFIX}/"):
        return None

    file_name = Path(photo_url).name

    if not file_name:
        return None

    file_path = PROFILE_PHOTO_DIR / file_name

    try:
        file_path.resolve().relative_to(PROFILE_PHOTO_DIR.resolve())
    except ValueError:
        return None

    return file_path


def delete_profile_photo_file(photo_url: str):
    file_path = profile_photo_path_from_url(photo_url)

    if file_path and file_path.exists():
        file_path.unlink()


def normalized_profile_photo(image: Image.Image):
    image = ImageOps.exif_transpose(image)

    if image.mode in ["RGBA", "LA"] or (image.mode == "P" and "transparency" in image.info):
        alpha_image = image.convert("RGBA")
        background = Image.new("RGBA", alpha_image.size, (255, 255, 255, 255))
        background.alpha_composite(alpha_image)
        image = background.convert("RGB")
    else:
        image = image.convert("RGB")

    width, height = image.size
    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    image = image.crop((left, top, left + side, top + side))

    return image.resize(
        (PROFILE_PHOTO_SIZE, PROFILE_PHOTO_SIZE),
        Image.Resampling.LANCZOS,
    )


def save_profile_photo(file: UploadFile, user: User, db):
    content_type = (file.content_type or "").lower()

    if content_type not in PROFILE_PHOTO_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Dodaj zdjęcie w formacie JPG, PNG albo WebP"
        )

    contents = file.file.read(PROFILE_PHOTO_MAX_BYTES + 1)

    if len(contents) > PROFILE_PHOTO_MAX_BYTES:
        raise HTTPException(
            status_code=400,
            detail="Zdjęcie może mieć maksymalnie 8 MB"
        )

    try:
        image = Image.open(BytesIO(contents))
        image.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(
            status_code=400,
            detail="Nie udało się odczytać zdjęcia"
        ) from exc

    output_image = normalized_profile_photo(image)
    file_name = f"{user.id}-{uuid4().hex}.webp"
    file_path = PROFILE_PHOTO_DIR / file_name
    output_image.save(
        file_path,
        format="WEBP",
        quality=82,
        method=6,
    )

    db_user = (
        db.query(User)
        .filter(User.email == user.email)
        .first()
    )

    if not db_user:
        delete_profile_photo_file(f"{PROFILE_PHOTO_ROUTE_PREFIX}/{file_name}")
        raise HTTPException(
            status_code=404,
            detail="Użytkownik nie istnieje"
        )

    old_photo_url = getattr(db_user, "profile_photo_url", "") or ""
    db_user.profile_photo_url = f"{PROFILE_PHOTO_ROUTE_PREFIX}/{file_name}"
    db.commit()
    db.refresh(db_user)
    delete_profile_photo_file(old_photo_url)

    return db_user


def save_email_asset(file: UploadFile):
    content_type = (file.content_type or "").lower()

    if content_type not in EMAIL_ASSET_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Dodaj grafikę w formacie JPG, PNG, WebP albo GIF",
        )

    contents = file.file.read(EMAIL_ASSET_MAX_BYTES + 1)

    if len(contents) > EMAIL_ASSET_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Grafika może mieć maksymalnie 8 MB")

    try:
        image = Image.open(BytesIO(contents))
        image.seek(0)
        image.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=400, detail="Nie udało się odczytać grafiki") from exc

    image = ImageOps.exif_transpose(image)
    image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)

    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA" if "transparency" in image.info else "RGB")

    file_name = f"{uuid4().hex}.png"
    image.save(
        EMAIL_ASSET_DIR / file_name,
        format="PNG",
        optimize=True,
    )

    relative_url = f"{EMAIL_ASSET_ROUTE_PREFIX}/{file_name}"
    return {
        "path": relative_url,
        "url": f"{settings.frontend_url}/api{relative_url}",
    }

def organizer_display_name(user: User):
    return (
        normalize_text(getattr(user, "organizer_name", "") or "")
        or normalize_text(f"{user.first_name or ''} {user.last_name or ''}")
        or user.email
    )


def judge_by_license_number(license_number: str, db):
    license_key = normalize_unique_key(license_number)

    if not license_key:
        return None

    return (
        db.query(User)
        .filter(
            or_(
                User.judge_license_number_key == license_key,
                func.lower(User.judge_license_number) == license_key,
            )
        )
        .first()
    )


JUDGE_LICENSE_CLASSES = {
    "I": 1,
    "II": 2,
    "III": 3,
}


def judge_license_class(license_number: str) -> Optional[int]:
    if not license_number:
        return None

    for part in license_number.split("/"):
        normalized_part = part.strip().upper()

        if normalized_part in JUDGE_LICENSE_CLASSES:
            return JUDGE_LICENSE_CLASSES[normalized_part]

    match = re.search(r"/\s*(I{1,3})\s*/", license_number.upper())

    if match:
        return JUDGE_LICENSE_CLASSES.get(match.group(1))

    return None


def judge_license_class_label(license_class: Optional[int]) -> str:
    if license_class in (1, 2, 3):
        return f"klasa {license_class}"

    return "nierozpoznana"


def can_be_head_judge_from_license(license_number: str) -> bool:
    return judge_license_class(license_number) in (1, 2)


def judge_search_response(judge: User, licensed_judge_required: bool = True):
    license_class = judge_license_class(judge.judge_license_number or "")
    data = public_user(judge)
    data.update({
        "judge_license_number": judge.judge_license_number or "",
        "judge_license_valid_until": getattr(judge, "judge_license_valid_until", "") or "",
        "judge_license_class": license_class,
        "judge_license_class_label": judge_license_class_label(license_class),
        "can_be_head_judge": not licensed_judge_required or license_class in (1, 2),
    })

    return data


def create_password_reset_token(user: User):
    token = secrets.token_urlsafe(32)
    user.password_reset_token = token
    user.password_reset_expires_at = (
        datetime.now(timezone.utc) + PASSWORD_RESET_TOKEN_TTL
    ).isoformat()
    user.password_reset_required = 1
    return token


def password_reset_token_expired(user: User) -> bool:
    expires_at = getattr(user, "password_reset_expires_at", "") or ""

    if not expires_at:
        return True

    try:
        expires_at_datetime = datetime.fromisoformat(expires_at)
    except ValueError:
        return True

    if expires_at_datetime.tzinfo is None:
        expires_at_datetime = expires_at_datetime.replace(tzinfo=timezone.utc)

    return datetime.now(timezone.utc) >= expires_at_datetime


def clear_password_reset_token(user: User) -> None:
    user.password_reset_token = None
    user.password_reset_expires_at = None
    user.password_reset_required = 0


def token_payload(user: User, token_type: str, expires_delta: timedelta):
    roles = get_user_roles(user)

    payload = {
        "sub": user.email,
        "role": primary_role(roles),
        "roles": roles,
        "typ": token_type,
        "exp": datetime.now(timezone.utc) + expires_delta,
    }

    if token_type == "refresh":
        payload["ver"] = getattr(user, "refresh_token_version", 0) or 0

    return payload


def create_auth_token(user: User, token_type: str, expires_delta: timedelta):
    return jwt.encode(
        token_payload(user, token_type, expires_delta),
        settings.secret_key,
        algorithm=ALGORITHM,
    )


def create_access_token(user: User):
    return create_auth_token(user, "access", ACCESS_TOKEN_TTL)


def create_refresh_token(user: User):
    return create_auth_token(user, "refresh", REFRESH_TOKEN_TTL)


def set_refresh_token_cookie(response: Response, token: str):
    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE_NAME,
        value=token,
        max_age=int(REFRESH_TOKEN_TTL.total_seconds()),
        httponly=True,
        secure=True,
        samesite="lax",
        path=REFRESH_TOKEN_COOKIE_PATH,
    )


def clear_refresh_token_cookie(response: Response):
    response.delete_cookie(
        key=REFRESH_TOKEN_COOKIE_NAME,
        httponly=True,
        secure=True,
        samesite="lax",
        path=REFRESH_TOKEN_COOKIE_PATH,
    )


def decode_auth_token(token: str, expected_type: str):
    payload = jwt.decode(
        token,
        settings.secret_key,
        algorithms=[ALGORITHM],
    )

    if payload.get("typ") != expected_type:
        raise JWTError("Invalid token type")

    return payload


def password_reset_link(token: str):
    return f"{settings.frontend_url}/reset-password?token={token}"


def password_reset_rate_limit_key(email: str):
    normalized_email = email.strip().lower()
    email_hash = hashlib.sha256(normalized_email.encode("utf-8")).hexdigest()

    return f"password_reset_rate:{email_hash}"


def enforce_password_reset_rate_limit(email: str, db) -> None:
    now = datetime.now(timezone.utc)
    key = password_reset_rate_limit_key(email)
    setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == key)
        .first()
    )
    window_started_at = now
    count = 0

    if setting:
        try:
            state = json.loads(setting.value)
            window_started_at = datetime.fromisoformat(state.get("window_started_at", ""))
            count = int(state.get("count", 0))
        except (TypeError, ValueError, json.JSONDecodeError):
            window_started_at = now
            count = 0

        if window_started_at.tzinfo is None:
            window_started_at = window_started_at.replace(tzinfo=timezone.utc)

    elapsed = now - window_started_at

    if elapsed >= PASSWORD_RESET_WINDOW:
        window_started_at = now
        count = 0

    if count >= PASSWORD_RESET_LIMIT:
        retry_after_seconds = max(
            60,
            int((PASSWORD_RESET_WINDOW - elapsed).total_seconds()),
        )
        retry_after_minutes = math.ceil(retry_after_seconds / 60)
        raise HTTPException(
            status_code=429,
            detail=f"Limit resetów hasła został wykorzystany. Spróbuj ponownie za około {retry_after_minutes} min."
        )

    value = json.dumps({
        "window_started_at": window_started_at.isoformat(),
        "count": count + 1,
    })

    if setting:
        setting.value = value
    else:
        db.add(AppSetting(
            key=key,
            value=value,
        ))


def client_ip_from_request(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")

    if forwarded_for:
        first_ip = forwarded_for.split(",", 1)[0].strip()

        if first_ip:
            return first_ip[:128]

    if request.client and request.client.host:
        return request.client.host[:128]

    return "unknown"


def rate_limit_key(prefix: str, identifier: str):
    normalized_identifier = (identifier or "unknown").strip().lower()
    identifier_hash = hashlib.sha256(
        normalized_identifier.encode("utf-8")
    ).hexdigest()

    return f"{prefix}:{identifier_hash}"


def enforce_fixed_window_rate_limit(
    key: str,
    limit: int,
    window: timedelta,
    detail_prefix: str,
    db,
) -> None:
    now = datetime.now(timezone.utc)
    setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == key)
        .first()
    )
    window_started_at = now
    count = 0

    if setting:
        try:
            state = json.loads(setting.value)
            window_started_at = datetime.fromisoformat(state.get("window_started_at", ""))
            count = int(state.get("count", 0))
        except (TypeError, ValueError, json.JSONDecodeError):
            window_started_at = now
            count = 0

        if window_started_at.tzinfo is None:
            window_started_at = window_started_at.replace(tzinfo=timezone.utc)

    elapsed = now - window_started_at

    if elapsed >= window:
        window_started_at = now
        count = 0
        elapsed = timedelta(0)

    if count >= limit:
        retry_after_seconds = max(
            1,
            int((window - elapsed).total_seconds()),
        )
        retry_after_minutes = math.ceil(retry_after_seconds / 60)
        raise HTTPException(
            status_code=429,
            detail=f"{detail_prefix} Spróbuj ponownie za około {retry_after_minutes} min.",
        )

    value = json.dumps({
        "window_started_at": window_started_at.isoformat(),
        "count": count + 1,
    })

    if setting:
        setting.value = value
    else:
        db.add(AppSetting(
            key=key,
            value=value,
        ))


def enforce_login_ip_rate_limit(ip_address: str, db) -> None:
    enforce_fixed_window_rate_limit(
        rate_limit_key("login_ip_rate", ip_address),
        LOGIN_IP_LIMIT,
        LOGIN_IP_WINDOW,
        "Zbyt wiele prób logowania z tego adresu IP.",
        db,
    )


def enforce_failed_login_email_rate_limit(email: str, db) -> None:
    enforce_fixed_window_rate_limit(
        rate_limit_key("login_email_failed_rate", email),
        LOGIN_EMAIL_FAILURE_LIMIT,
        LOGIN_EMAIL_FAILURE_WINDOW,
        "Zbyt wiele błędnych prób logowania dla tego konta.",
        db,
    )


def clear_failed_login_email_rate_limit(email: str, db) -> None:
    key = rate_limit_key("login_email_failed_rate", email)
    setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == key)
        .first()
    )

    if setting:
        db.delete(setting)


def send_password_reset_for_user(user: User, db) -> None:
    enforce_password_reset_rate_limit(user.email, db)
    token = create_password_reset_token(user)
    send_password_reset_email(
        user.email,
        password_reset_link(token),
    )


def delete_competition_with_dependencies(competition: Competition, db):
    (
        db.query(Achievement)
        .filter(Achievement.competition_id == competition.id)
        .delete(synchronize_session=False)
    )

    (
        db.query(DisciplineResult)
        .filter(DisciplineResult.competition_id == competition.id)
        .delete(synchronize_session=False)
    )

    participant_ids = [
        participant.id
        for participant in (
            db.query(CompetitionParticipant)
            .filter(CompetitionParticipant.competition_id == competition.id)
            .all()
        )
    ]

    if participant_ids:
        (
            db.query(Achievement)
            .filter(Achievement.participant_id.in_(participant_ids))
            .delete(synchronize_session=False)
        )

        (
            db.query(ParticipantDiscipline)
            .filter(ParticipantDiscipline.participant_id.in_(participant_ids))
            .delete(synchronize_session=False)
        )

    (
        db.query(CompetitionParticipant)
        .filter(CompetitionParticipant.competition_id == competition.id)
        .delete()
    )

    (
        db.query(JudgeInvitation)
        .filter(JudgeInvitation.competition_id == competition.id)
        .delete()
    )

    (
        db.query(Discipline)
        .filter(Discipline.competition_id == competition.id)
        .delete()
    )

    db.delete(competition)


def validate_test_count(value: int, minimum: int, maximum: int, label: str):
    if value < minimum or value > maximum:
        raise HTTPException(
            status_code=400,
            detail=f"{label} musi być od {minimum} do {maximum}"
        )

    return value


def test_person_name(index: int, used_person_names: set[tuple[str, str]] | None = None):
    used_names = used_person_names if used_person_names is not None else set()
    first_names_count = len(TEST_FIRST_NAMES)
    last_names_count = len(TEST_LAST_NAMES)
    combinations_count = first_names_count * last_names_count

    for offset in range(combinations_count):
        candidate_index = index + offset
        first_name = TEST_FIRST_NAMES[candidate_index % first_names_count]
        last_name = TEST_LAST_NAMES[(candidate_index // first_names_count) % last_names_count]
        name_key = (first_name.casefold(), last_name.casefold())

        if name_key not in used_names:
            used_names.add(name_key)
            return first_name, last_name

    fallback_number = index + 1

    while True:
        first_name = TEST_FIRST_NAMES[index % first_names_count]
        last_name = f"{TEST_LAST_NAMES[(index // first_names_count) % last_names_count]}-{fallback_number}"
        name_key = (first_name.casefold(), last_name.casefold())

        if name_key not in used_names:
            used_names.add(name_key)
            return first_name, last_name

        fallback_number += 1


def test_person_data(
    competition_id: int,
    index: int,
    used_person_names: set[tuple[str, str]] | None = None,
):
    first_name, last_name = test_person_name(index, used_person_names)
    club = TEST_CLUBS[index % len(TEST_CLUBS)]
    year = 1975 + (index % 28)
    month = (index % 12) + 1
    day = (index % 27) + 1

    return {
        "first_name": first_name,
        "last_name": last_name,
        "club": club,
        "birth_date": f"{year:04d}-{month:02d}-{day:02d}",
        "license_number": f"TEST-{competition_id}-{index + 1:03d}",
    }


def test_participant_disciplines(disciplines: list[Discipline], index: int):
    if not disciplines:
        return []

    selected_disciplines = [
        discipline
        for discipline_index, discipline in enumerate(disciplines)
        if (index + discipline_index) % 3 != 0
    ]

    if not selected_disciplines:
        selected_disciplines = [disciplines[index % len(disciplines)]]

    return [
        JoinDisciplineData(
            discipline_id=discipline.id,
            ammo_type="club" if (index + discipline.id) % 2 == 0 else "own",
        )
        for discipline in selected_disciplines
    ]


def test_discipline_name(template_name: str, index: int):
    if index < len(TEST_DISCIPLINE_TEMPLATES):
        return template_name

    return f"{template_name} {index + 1}"


def create_test_participant(
    competition: Competition,
    disciplines: list[Discipline],
    index: int,
    checked_in: bool,
    paid: bool,
    db,
    used_person_names: set[tuple[str, str]] | None = None,
):
    selected_disciplines = test_participant_disciplines(disciplines, index)
    disciplines_by_id = {
        discipline.id: discipline
        for discipline in disciplines
    }
    person = test_person_data(competition.id, index, used_person_names)
    timestamp = now_iso()

    participant = CompetitionParticipant(
        competition_id=competition.id,
        user_email=f"test-{competition.id}-{index + 1}-{uuid4()}@test.local",
        first_name=person["first_name"],
        last_name=person["last_name"],
        birth_date=person["birth_date"],
        license_number=person["license_number"],
        club=person["club"],
        entry_type="shooter",
        is_head_judge=0,
        total_fee=calculate_total_fee_from_selection(
            competition,
            selected_disciplines,
            disciplines_by_id,
        ),
        checked_in=1 if checked_in else 0,
        checked_in_at=timestamp if checked_in else None,
        paid=1 if paid else 0,
        paid_at=timestamp if paid else None,
    )

    db.add(participant)
    db.flush()

    for selected_discipline in selected_disciplines:
        db.add(ParticipantDiscipline(
            participant_id=participant.id,
            discipline_id=selected_discipline.discipline_id,
            ammo_type=selected_discipline.ammo_type,
        ))

    return participant


def test_result_points(participant: CompetitionParticipant, discipline: Discipline):
    return str((participant.id * 37 + discipline.id * 17) % 100)


def generate_test_results_for_competition(
    competition: Competition,
    judge_email: str,
    overwrite: bool,
    db,
):
    participant_disciplines = (
        db.query(ParticipantDiscipline)
        .all()
    )
    participants_by_id = {
        participant.id: participant
        for participant in (
            db.query(CompetitionParticipant)
            .filter(
                CompetitionParticipant.competition_id == competition.id,
                CompetitionParticipant.entry_type == "shooter",
            )
            .all()
        )
    }
    disciplines_by_id = {
        discipline.id: discipline
        for discipline in (
            db.query(Discipline)
            .filter(Discipline.competition_id == competition.id)
            .all()
        )
    }
    changed_count = 0

    for participant_discipline in participant_disciplines:
        participant = participants_by_id.get(participant_discipline.participant_id)
        discipline = disciplines_by_id.get(participant_discipline.discipline_id)

        if not participant or not discipline:
            continue

        result = (
            db.query(DisciplineResult)
            .filter(
                DisciplineResult.participant_id == participant.id,
                DisciplineResult.discipline_id == discipline.id,
            )
            .first()
        )
        points = test_result_points(participant, discipline)

        if result:
            if not overwrite:
                continue

            result.points = points
            result.judge_email = judge_email
        else:
            db.add(DisciplineResult(
                competition_id=competition.id,
                discipline_id=discipline.id,
                participant_id=participant.id,
                judge_email=judge_email,
                points=points,
            ))

        changed_count += 1

    return changed_count


def delete_user_with_dependencies(user: User, db):
    participants = (
        db.query(CompetitionParticipant)
        .filter(CompetitionParticipant.user_email == user.email)
        .all()
    )
    participant_ids = [
        participant.id
        for participant in participants
    ]

    if participant_ids:
        (
            db.query(Achievement)
            .filter(Achievement.participant_id.in_(participant_ids))
            .delete(synchronize_session=False)
        )

        (
            db.query(ParticipantDiscipline)
            .filter(ParticipantDiscipline.participant_id.in_(participant_ids))
            .delete(synchronize_session=False)
        )

        (
            db.query(DisciplineResult)
            .filter(DisciplineResult.participant_id.in_(participant_ids))
            .delete(synchronize_session=False)
        )

    (
        db.query(CompetitionParticipant)
        .filter(CompetitionParticipant.user_email == user.email)
        .delete(synchronize_session=False)
    )

    (
        db.query(JudgeInvitation)
        .filter(JudgeInvitation.judge_email == user.email)
        .delete(synchronize_session=False)
    )

    delete_profile_photo_file(getattr(user, "profile_photo_url", "") or "")
    db.delete(user)
    db.commit()


def delete_participant_with_dependencies(participant: CompetitionParticipant, db):
    (
        db.query(Achievement)
        .filter(Achievement.participant_id == participant.id)
        .delete(synchronize_session=False)
    )

    (
        db.query(ParticipantDiscipline)
        .filter(ParticipantDiscipline.participant_id == participant.id)
        .delete(synchronize_session=False)
    )

    (
        db.query(DisciplineResult)
        .filter(DisciplineResult.participant_id == participant.id)
        .delete(synchronize_session=False)
    )

    db.delete(participant)


def can_view_participant_private_fields(
    viewer: Optional[User],
    competition: Optional[Competition],
):
    if not viewer:
        return False

    if has_role(viewer, "admin"):
        return True

    return bool(
        competition
        and competition.created_by == viewer.email
    )


def public_participant(
    participant: CompetitionParticipant,
    db,
    include_private: bool = False,
):
    user = (
        db.query(User)
        .filter(User.email == participant.user_email)
        .first()
    )
    first_name = participant.first_name or (user.first_name if user else "") or ""
    last_name = participant.last_name or (user.last_name if user else "") or ""
    license_number = (
        participant.license_number or (user.license_number if user else "") or ""
    )
    judge_license_number = user.judge_license_number if user else ""
    club = participant.club or (user.club if user else "") or ""
    display_name = f"Uczestnik #{participant.id}"

    if first_name and last_name:
        display_name = f"{last_name} {first_name}"

        if club:
            display_name = f"{display_name} - {club}"

    return {
        "id": participant.id,
        "user_email": participant.user_email if include_private else "",
        "entry_type": participant.entry_type or "shooter",
        "total_fee": participant.total_fee or calculate_participant_total_fee(participant, db),
        "first_name": first_name,
        "last_name": last_name,
        "license_number": license_number if include_private else "",
        "judge_license_number": judge_license_number if include_private else "",
        "club": club,
        "display_name": display_name,
    }


def participant_result_display_name(participant_data):
    full_name = " ".join([
        participant_data["last_name"],
        participant_data["first_name"],
    ]).strip()

    return full_name or participant_data["display_name"]


def public_shooter_participants(competition: Competition, db):
    query = (
        db.query(CompetitionParticipant)
        .filter(
            CompetitionParticipant.competition_id == competition.id,
            or_(
                CompetitionParticipant.entry_type == "shooter",
                CompetitionParticipant.entry_type.is_(None),
            ),
        )
    )

    if competition.status in ["started", "completed"]:
        query = query.filter(
            CompetitionParticipant.checked_in == 1,
            CompetitionParticipant.paid == 1,
        )

    return query.all()


def staff_participant(participant: CompetitionParticipant, db):
    public_data = public_participant(participant, db, include_private=True)
    public_data["is_head_judge"] = bool(participant.is_head_judge)
    public_data["checked_in"] = bool(participant.checked_in)
    public_data["paid"] = bool(participant.paid)
    public_data["disciplines"] = participant_discipline_assignments(participant, db)
    return public_data


def participant_payment_row(participant: CompetitionParticipant, db):
    user = (
        db.query(User)
        .filter(User.email == participant.user_email)
        .first()
    )
    first_name = participant.first_name or (user.first_name if user else "") or ""
    last_name = participant.last_name or (user.last_name if user else "") or ""
    license_number = (
        participant.license_number or (user.license_number if user else "") or ""
    )
    club = participant.club or (user.club if user else "") or ""
    participant_disciplines = (
        db.query(ParticipantDiscipline)
        .filter(ParticipantDiscipline.participant_id == participant.id)
        .all()
    )
    discipline_ids = [
        participant_discipline.discipline_id
        for participant_discipline in participant_disciplines
    ]
    disciplines = []

    if discipline_ids:
        disciplines = (
            db.query(Discipline)
            .filter(Discipline.id.in_(discipline_ids))
            .all()
        )

    return {
        **public_participant(participant, db, include_private=True),
        "first_name": first_name,
        "last_name": last_name,
        "license_number": license_number,
        "club": club,
        "disciplines": [
            {
                "id": discipline.id,
                "name": discipline.name,
            }
            for discipline in disciplines
        ],
        "checked_in": bool(participant.checked_in),
        "checked_in_at": participant.checked_in_at or "",
        "paid": bool(participant.paid),
        "paid_at": participant.paid_at or "",
    }


def participant_discipline_assignments(participant: CompetitionParticipant, db):
    participant_confirmed = is_participant_confirmed(participant)
    participant_disciplines = (
        db.query(ParticipantDiscipline)
        .filter(ParticipantDiscipline.participant_id == participant.id)
        .order_by(ParticipantDiscipline.id.asc())
        .all()
    )
    discipline_ids = [
        participant_discipline.discipline_id
        for participant_discipline in participant_disciplines
    ]
    disciplines_by_id = {}

    if discipline_ids:
        disciplines_by_id = {
            discipline.id: discipline
            for discipline in (
                db.query(Discipline)
                .filter(Discipline.id.in_(discipline_ids))
                .all()
            )
        }

    return [
        {
            "participant_discipline_id": participant_discipline.id,
            "id": participant_discipline.discipline_id,
            "name": disciplines_by_id.get(participant_discipline.discipline_id).name
                if participant_discipline.discipline_id in disciplines_by_id
                else "",
            "ammo_type": participant_discipline.ammo_type,
            "squad_group_number": (
                int(getattr(participant_discipline, "squad_group_number", 0) or 0)
                if participant_confirmed
                else 0
            ),
            "squad_position": (
                int(getattr(participant_discipline, "squad_position", 0) or 0)
                if participant_confirmed
                else 0
            ),
        }
        for participant_discipline in participant_disciplines
    ]


def is_participant_confirmed(participant: CompetitionParticipant):
    return bool(
        getattr(participant, "checked_in", 0)
        and getattr(participant, "paid", 0)
    )


def next_squad_group_number(discipline_id: int, db):
    discipline = (
        db.query(Discipline)
        .filter(Discipline.id == discipline_id)
        .first()
    )
    locked_group_numbers = set()

    if discipline:
        locked_group_numbers = {
            group_number
            for group_number, status in trap_squad_group_statuses(discipline, db).items()
            if trap_squad_group_is_locked(status)
        }

    group_counts: dict[int, int] = {}
    rows = (
        db.query(ParticipantDiscipline.squad_group_number, func.count(ParticipantDiscipline.id))
        .join(CompetitionParticipant, CompetitionParticipant.id == ParticipantDiscipline.participant_id)
        .filter(ParticipantDiscipline.discipline_id == discipline_id)
        .filter(
            CompetitionParticipant.checked_in == 1,
            CompetitionParticipant.paid == 1,
        )
        .filter(
            or_(
                CompetitionParticipant.entry_type == "shooter",
                CompetitionParticipant.entry_type.is_(None),
            )
        )
        .group_by(ParticipantDiscipline.squad_group_number)
        .all()
    )

    for raw_group_number, count in rows:
        group_number = int(raw_group_number or 0)

        if group_number > 0:
            group_counts[group_number] = int(count or 0)

    group_size = clay_squad_group_size(discipline)

    if not group_counts:
        return 1

    max_group_number = max(group_counts)

    for group_number in range(1, max_group_number + 1):
        if group_number in locked_group_numbers:
            continue

        if group_counts.get(group_number, 0) < group_size:
            return group_number

    return max_group_number + 1


def discipline_clay_variant(discipline: Discipline):
    value = (getattr(discipline, "clay_variant", "") or "").strip()

    if value:
        return value

    if normalize_discipline_type(getattr(discipline, "discipline_type", "") or "") == TRAP_DISCIPLINE_TYPE:
        return (getattr(discipline, "trap_variant", "") or "").strip()

    return ""


def discipline_clay_series_count(discipline: Discipline):
    value = int(getattr(discipline, "clay_series_count", 0) or 0)

    if value > 0:
        return value

    if normalize_discipline_type(getattr(discipline, "discipline_type", "") or "") == TRAP_DISCIPLINE_TYPE:
        return max(int(getattr(discipline, "trap_series_count", 0) or 0), 0)

    return 0


def is_clay_squad_discipline(discipline: Discipline):
    discipline_type = normalize_discipline_type(
        getattr(discipline, "discipline_type", "") or ""
    )
    return (
        discipline_type in [TRAP_DISCIPLINE_TYPE, SKEET_DISCIPLINE_TYPE]
        and bool(discipline_clay_variant(discipline))
        and discipline_clay_series_count(discipline) > 0
    )


def is_trap_squad_discipline(discipline: Discipline):
    return is_clay_squad_discipline(discipline)


def clay_squad_group_size(discipline: Discipline | None):
    if (
        discipline
        and normalize_discipline_type(getattr(discipline, "discipline_type", "") or "")
        == SKEET_DISCIPLINE_TYPE
    ):
        return SKEET_SQUAD_GROUP_SIZE

    return SQUAD_GROUP_SIZE


def next_squad_position(discipline_id: int, group_number: int, db):
    occupied_positions = {
        int(position)
        for (position,) in (
            db.query(ParticipantDiscipline.squad_position)
            .join(CompetitionParticipant, CompetitionParticipant.id == ParticipantDiscipline.participant_id)
            .filter(
                ParticipantDiscipline.discipline_id == discipline_id,
                ParticipantDiscipline.squad_group_number == group_number,
                ParticipantDiscipline.squad_position.is_not(None),
                CompetitionParticipant.checked_in == 1,
                CompetitionParticipant.paid == 1,
            )
            .all()
        )
        if int(position or 0) > 0
    }

    for position in range(1, SKEET_SQUAD_GROUP_SIZE + 1):
        if position not in occupied_positions:
            return position

    return len(occupied_positions) + 1


def trap_result_scores(result_data: str):
    try:
        parsed = json.loads(result_data or "[]")
    except (TypeError, ValueError):
        return []

    if not isinstance(parsed, list):
        return []

    return [
        score
        if score in [0, 1]
        else None
        for score in parsed
    ]


def clay_result_scores(discipline: Discipline, result_data: str):
    discipline_type = normalize_discipline_type(
        getattr(discipline, "discipline_type", "") or ""
    )

    if discipline_type != SKEET_DISCIPLINE_TYPE:
        return trap_result_scores(result_data)

    try:
        parsed = json.loads(result_data or "{}")
    except (TypeError, ValueError):
        return []

    if not isinstance(parsed, dict) or parsed.get("discipline") != "skeet":
        return []

    scores = []

    for round_data in parsed.get("rounds", []):
        if not isinstance(round_data, dict):
            continue

        targets = round_data.get("targets", [])
        if not isinstance(targets, list):
            continue

        for target in targets:
            if not isinstance(target, dict):
                scores.append(None)
                continue

            score = target.get("score")
            scores.append(score if score in [0, 1] else None)

    return scores


def validate_skeet_result_data(discipline: Discipline, result_data: str):
    try:
        parsed = json.loads(result_data or "{}")
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Nieprawidłowy zapis wyniku Skeet")

    if not isinstance(parsed, dict) or parsed.get("discipline") != "skeet":
        raise HTTPException(status_code=400, detail="Nieprawidłowy zapis wyniku Skeet")

    rounds = parsed.get("rounds")
    expected_rounds = discipline_clay_series_count(discipline)

    if not isinstance(rounds, list) or len(rounds) != expected_rounds:
        raise HTTPException(status_code=400, detail="Nieprawidłowa liczba serii Skeet")

    scores = []

    for round_index, round_data in enumerate(rounds):
        if not isinstance(round_data, dict):
            raise HTTPException(status_code=400, detail="Nieprawidłowa seria Skeet")

        if int(round_data.get("round_number", 0) or 0) != round_index + 1:
            raise HTTPException(status_code=400, detail="Nieprawidłowa kolejność serii Skeet")

        targets = round_data.get("targets")

        if not isinstance(targets, list) or len(targets) != SKEET_TARGETS_PER_SERIES:
            raise HTTPException(status_code=400, detail="Seria Skeet musi zawierać 25 rzutek")

        for target_index, target in enumerate(targets):
            if not isinstance(target, dict) or int(target.get("number", 0) or 0) != target_index + 1:
                raise HTTPException(status_code=400, detail="Nieprawidłowa sekwencja Skeet")

            expected_target = SKEET_TARGET_SEQUENCE[target_index]
            if any(
                target.get(field) != expected_target[field]
                for field in ["station", "presentation", "house"]
            ):
                raise HTTPException(status_code=400, detail="Wynik nie odpowiada oficjalnej sekwencji Skeet")

            score = target.get("score")

            if score not in [0, 1, None]:
                raise HTTPException(status_code=400, detail="Wynik rzutka Skeet musi wynosić 0 lub 1")

            scores.append(score)

    return parsed, sum(1 for score in scores if score == 1) * CLAY_HIT_POINTS


def validate_trap_result_data(discipline: Discipline, result_data: str):
    try:
        parsed = json.loads(result_data or "[]")
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Nieprawidłowy zapis wyniku Trap")

    expected_scores = discipline_clay_series_count(discipline) * TRAP_TARGETS_PER_SERIES

    if not isinstance(parsed, list) or len(parsed) != expected_scores:
        raise HTTPException(status_code=400, detail="Nieprawidłowa liczba rzutek Trap")

    if any(score not in [0, 1, None] for score in parsed):
        raise HTTPException(status_code=400, detail="Wynik rzutka Trap musi wynosić 0 lub 1")

    return parsed, sum(1 for score in parsed if score == 1) * CLAY_HIT_POINTS


def trap_result_has_started(result: DisciplineResult | None, discipline: Discipline | None = None):
    if not result:
        return False

    scores = (
        clay_result_scores(discipline, getattr(result, "result_data", "") or "")
        if discipline
        else trap_result_scores(getattr(result, "result_data", "") or "")
    )

    if any(score in [0, 1] for score in scores):
        return True

    return bool((getattr(result, "points", "") or "").strip())


def trap_result_is_complete(
    result: DisciplineResult | None,
    expected_scores_count: int,
    discipline: Discipline | None = None,
):
    if not result or expected_scores_count <= 0:
        return False

    scores = (
        clay_result_scores(discipline, getattr(result, "result_data", "") or "")
        if discipline
        else trap_result_scores(getattr(result, "result_data", "") or "")
    )

    if len(scores) < expected_scores_count:
        return False

    return all(score in [0, 1] for score in scores[:expected_scores_count])


def trap_squad_group_statuses(discipline: Discipline, db):
    if not discipline or not is_clay_squad_discipline(discipline):
        return {}

    expected_scores_count = max(
        discipline_clay_series_count(discipline),
        0,
    ) * TRAP_TARGETS_PER_SERIES
    participant_disciplines = (
        db.query(ParticipantDiscipline)
        .join(CompetitionParticipant, CompetitionParticipant.id == ParticipantDiscipline.participant_id)
        .filter(
            ParticipantDiscipline.discipline_id == discipline.id,
            ParticipantDiscipline.squad_group_number > 0,
            CompetitionParticipant.checked_in == 1,
            CompetitionParticipant.paid == 1,
            or_(
                CompetitionParticipant.entry_type == "shooter",
                CompetitionParticipant.entry_type.is_(None),
            ),
        )
        .all()
    )
    participant_ids = [
        participant_discipline.participant_id
        for participant_discipline in participant_disciplines
    ]
    results_by_participant_id = {}

    if participant_ids:
        results_by_participant_id = {
            result.participant_id: result
            for result in (
                db.query(DisciplineResult)
                .filter(
                    DisciplineResult.discipline_id == discipline.id,
                    DisciplineResult.participant_id.in_(participant_ids),
                )
                .all()
            )
        }

    groups: dict[int, list[ParticipantDiscipline]] = {}

    for participant_discipline in participant_disciplines:
        group_number = int(getattr(participant_discipline, "squad_group_number", 0) or 0)

        if group_number <= 0:
            continue

        groups.setdefault(group_number, []).append(participant_discipline)

    statuses = {}

    for group_number, group_participant_disciplines in groups.items():
        group_results = [
            results_by_participant_id.get(participant_discipline.participant_id)
            for participant_discipline in group_participant_disciplines
        ]

        if group_results and all(
            trap_result_is_complete(result, expected_scores_count, discipline)
            for result in group_results
        ):
            statuses[group_number] = "completed"
        elif any(trap_result_has_started(result, discipline) for result in group_results):
            statuses[group_number] = "in-progress"
        else:
            statuses[group_number] = "not-started"

    return statuses


def trap_squad_group_is_locked(status: str | None):
    return status in ["in-progress", "completed"]


def validate_trap_squad_groups_before_start(competition: Competition, db):
    trap_disciplines = [
        discipline
        for discipline in (
            db.query(Discipline)
            .filter(Discipline.competition_id == competition.id)
            .all()
        )
        if is_clay_squad_discipline(discipline)
    ]

    for discipline in trap_disciplines:
        participant_disciplines = (
            db.query(ParticipantDiscipline)
            .join(CompetitionParticipant, CompetitionParticipant.id == ParticipantDiscipline.participant_id)
            .filter(
                ParticipantDiscipline.discipline_id == discipline.id,
                CompetitionParticipant.checked_in == 1,
                CompetitionParticipant.paid == 1,
                or_(
                    CompetitionParticipant.entry_type == "shooter",
                    CompetitionParticipant.entry_type.is_(None),
                ),
            )
            .all()
        )

        if not participant_disciplines:
            continue

        if any(
            int(getattr(participant_discipline, "squad_group_number", 0) or 0) <= 0
            for participant_discipline in participant_disciplines
        ):
            raise HTTPException(
                status_code=400,
                detail="Organizator najpierw musi wylosować zawodnikom grupy."
            )

        group_counts: dict[int, int] = {}

        for participant_discipline in participant_disciplines:
            group_number = int(getattr(participant_discipline, "squad_group_number", 0) or 0)
            group_counts[group_number] = group_counts.get(group_number, 0) + 1

        if any(count > clay_squad_group_size(discipline) for count in group_counts.values()):
            raise HTTPException(
                status_code=400,
                detail="Popraw grupy startowe konkurencji rzutkowych przed rozpoczęciem zawodów."
            )

        if normalize_discipline_type(discipline.discipline_type or "") == SKEET_DISCIPLINE_TYPE:
            positions_by_group: dict[int, set[int]] = {}

            for participant_discipline in participant_disciplines:
                group_number = int(participant_discipline.squad_group_number or 0)
                position = int(getattr(participant_discipline, "squad_position", 0) or 0)

                if position <= 0 or position > SKEET_SQUAD_GROUP_SIZE:
                    raise HTTPException(
                        status_code=400,
                        detail="Każdy zawodnik Skeet musi mieć pozycję od 1 do 6 w grupie."
                    )

                group_positions = positions_by_group.setdefault(group_number, set())
                if position in group_positions:
                    raise HTTPException(
                        status_code=400,
                        detail="Pozycje zawodników w grupie Skeet nie mogą się powtarzać."
                    )
                group_positions.add(position)


def assign_squad_group(participant_discipline: ParticipantDiscipline, db):
    participant = (
        db.query(CompetitionParticipant)
        .filter(CompetitionParticipant.id == participant_discipline.participant_id)
        .first()
    )

    if not participant or not is_participant_confirmed(participant):
        participant_discipline.squad_group_number = None
        participant_discipline.squad_position = None
        return

    discipline = (
        db.query(Discipline)
        .filter(Discipline.id == participant_discipline.discipline_id)
        .first()
    )

    if not discipline or not is_clay_squad_discipline(discipline):
        participant_discipline.squad_group_number = None
        participant_discipline.squad_position = None
        return

    group_number = next_squad_group_number(
        participant_discipline.discipline_id,
        db,
    )
    participant_discipline.squad_group_number = group_number
    participant_discipline.squad_position = next_squad_position(
        participant_discipline.discipline_id,
        group_number,
        db,
    )


def sync_participant_squad_groups(
    participant: CompetitionParticipant,
    db,
    reset_existing: bool = False,
):
    participant_disciplines = (
        db.query(ParticipantDiscipline)
        .filter(ParticipantDiscipline.participant_id == participant.id)
        .order_by(ParticipantDiscipline.id.asc())
        .all()
    )

    if not is_participant_confirmed(participant):
        for participant_discipline in participant_disciplines:
            participant_discipline.squad_group_number = None
            participant_discipline.squad_position = None
        return

    if reset_existing:
        for participant_discipline in participant_disciplines:
            participant_discipline.squad_group_number = None
            participant_discipline.squad_position = None

    for participant_discipline in participant_disciplines:
        if int(getattr(participant_discipline, "squad_group_number", 0) or 0) > 0:
            discipline = (
                db.query(Discipline)
                .filter(Discipline.id == participant_discipline.discipline_id)
                .first()
            )

            if discipline and is_clay_squad_discipline(discipline):
                continue

        assign_squad_group(participant_discipline, db)


def parse_price(value):
    if value is None:
        return Decimal("0")

    try:
        return Decimal(str(value).replace(",", "."))
    except (InvalidOperation, ValueError):
        return Decimal("0")


def format_money(value: Decimal):
    return str(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def calculate_total_fee_from_selection(
    competition: Competition,
    selected_disciplines,
    disciplines_by_id,
):
    if not selected_disciplines:
        return "0.00"

    competition_fee = parse_price(competition.entry_fee)
    disciplines_fee = Decimal("0")

    if competition_fee == 0:
        for selected_discipline in selected_disciplines:
            discipline = disciplines_by_id.get(selected_discipline.discipline_id)

            if discipline:
                disciplines_fee += parse_price(discipline.entry_fee)

    ammo_fee = Decimal("0")

    for selected_discipline in selected_disciplines:
        if selected_discipline.ammo_type != "club":
            continue

        discipline = disciplines_by_id.get(selected_discipline.discipline_id)

        if not discipline:
            continue

        ammo_fee += parse_price(discipline.ammo_price) * Decimal(discipline.shots_count or 0)
        ammo_fee += parse_price(getattr(discipline, "clay_price", "") or "") * Decimal(trap_targets_count(discipline))

    return format_money(competition_fee + disciplines_fee + ammo_fee)


def calculate_participant_total_fee(participant: CompetitionParticipant, db):
    if (participant.entry_type or "shooter") != "shooter":
        return "0.00"

    competition = (
        db.query(Competition)
        .filter(Competition.id == participant.competition_id)
        .first()
    )

    if not competition:
        return participant.total_fee or "0.00"

    participant_disciplines = (
        db.query(ParticipantDiscipline)
        .filter(ParticipantDiscipline.participant_id == participant.id)
        .all()
    )
    disciplines_by_id = {
        discipline.id: discipline
        for discipline in (
            db.query(Discipline)
            .filter(Discipline.competition_id == competition.id)
            .all()
        )
    }

    return calculate_total_fee_from_selection(
        competition,
        participant_disciplines,
        disciplines_by_id,
    )


def judge_can_access_discipline(
    judge: User,
    competition_id: int,
    discipline_id: int,
    db,
):
    participant = (
        db.query(CompetitionParticipant)
        .filter(
            CompetitionParticipant.competition_id == competition_id,
            CompetitionParticipant.user_email == judge.email,
            CompetitionParticipant.entry_type == "judge",
        )
        .first()
    )

    if not participant:
        return False

    if participant.is_head_judge:
        return True

    assignment = (
        db.query(JudgeInvitation)
        .filter(
            JudgeInvitation.competition_id == competition_id,
            JudgeInvitation.judge_email == judge.email,
        )
        .filter(
            (JudgeInvitation.discipline_id == discipline_id)
            | (JudgeInvitation.discipline_id.is_(None))
        )
        .first()
    )

    return bool(assignment)


def discipline_shooters_count(competition_id: int, discipline_id: int, db):
    participant_ids = [
        participant.id
        for participant in (
            db.query(CompetitionParticipant)
            .filter(
                CompetitionParticipant.competition_id == competition_id,
                CompetitionParticipant.entry_type == "shooter",
            )
            .all()
        )
    ]

    if not participant_ids:
        return 0

    return (
        db.query(ParticipantDiscipline)
        .filter(
            ParticipantDiscipline.discipline_id == discipline_id,
            ParticipantDiscipline.participant_id.in_(participant_ids),
        )
        .count()
    )


def normalize_search_text(value: str):
    return (value or "").lower()


def normalize_discipline_type(value: str):
    discipline_type = normalize_search_text(value).strip()

    if discipline_type in DISCIPLINE_TYPES:
        return discipline_type

    return ""


def trap_targets_count(discipline: Discipline):
    if normalize_discipline_type(getattr(discipline, "discipline_type", "") or "") not in [
        TRAP_DISCIPLINE_TYPE,
        SKEET_DISCIPLINE_TYPE,
    ]:
        return 0

    return discipline_clay_series_count(discipline) * TRAP_TARGETS_PER_SERIES


def normalize_trap_variant(value: str):
    return normalize_search_text(value).strip()


def clay_configuration_from_data(data: DisciplineData, discipline_type: str):
    legacy_variant = data.trap_variant if discipline_type == TRAP_DISCIPLINE_TYPE else ""
    variant = normalize_trap_variant(data.clay_variant or legacy_variant)
    manual_series_count = data.clay_series_count or (
        data.trap_series_count if discipline_type == TRAP_DISCIPLINE_TYPE else 0
    )
    variant_series = (
        TRAP_VARIANT_SERIES
        if discipline_type == TRAP_DISCIPLINE_TYPE
        else SKEET_VARIANT_SERIES
    )

    if variant in variant_series:
        return variant, variant_series[variant]

    if variant == CLAY_MANUAL_VARIANT:
        return variant, max(int(manual_series_count or 0), 0)

    return variant, 0


def normalize_discipline_payload(data: DisciplineData, discipline_type: str):
    if discipline_type not in [TRAP_DISCIPLINE_TYPE, SKEET_DISCIPLINE_TYPE]:
        return {
            "shots_count": data.shots_count,
            "trap_variant": "",
            "trap_series_count": 0,
            "clay_variant": "",
            "clay_series_count": 0,
            "clay_price": "",
        }

    clay_variant, clay_series_count = clay_configuration_from_data(data, discipline_type)
    variant_series = (
        TRAP_VARIANT_SERIES
        if discipline_type == TRAP_DISCIPLINE_TYPE
        else SKEET_VARIANT_SERIES
    )
    discipline_label = "Trapa" if discipline_type == TRAP_DISCIPLINE_TYPE else "Skeet"

    if clay_variant not in [*variant_series.keys(), CLAY_MANUAL_VARIANT]:
        raise HTTPException(
            status_code=400,
            detail=f"Wybierz rodzaj {discipline_label}"
        )

    if clay_series_count <= 0:
        raise HTTPException(
            status_code=400,
            detail=f"Podaj liczbę serii {discipline_label}"
        )

    if parse_price(data.clay_price) <= 0:
        raise HTTPException(
            status_code=400,
            detail="Podaj cenę za rzutek"
        )

    shots_per_target = (
        TRAP_SHOTS_PER_TARGET
        if discipline_type == TRAP_DISCIPLINE_TYPE
        else SKEET_SHOTS_PER_TARGET
    )

    return {
        "shots_count": clay_series_count * TRAP_TARGETS_PER_SERIES * shots_per_target,
        "trap_variant": clay_variant if discipline_type == TRAP_DISCIPLINE_TYPE else "",
        "trap_series_count": clay_series_count if discipline_type == TRAP_DISCIPLINE_TYPE else 0,
        "clay_variant": clay_variant,
        "clay_series_count": clay_series_count,
        "clay_price": data.clay_price,
    }


def discipline_firearm_type(discipline: Discipline):
    discipline_type = normalize_discipline_type(
        getattr(discipline, "discipline_type", "") or ""
    )

    return DISCIPLINE_TYPE_FIREARM_TYPES.get(discipline_type, "")


def parse_points(value: str):
    normalized_value = (value or "").strip().replace(",", ".")
    match = re.search(r"-?\d+(?:\.\d+)?", normalized_value)

    if not match:
        return Decimal("0")

    try:
        return Decimal(match.group(0))
    except InvalidOperation:
        return Decimal("0")


def format_points(value: Decimal):
    normalized = value.normalize()

    if normalized == normalized.to_integral():
        return str(normalized.quantize(Decimal("1")))

    return format(normalized, "f")


def format_average_points(total: Decimal, starts_count: int):
    if starts_count <= 0:
        return "0"

    average = (total / Decimal(starts_count)).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )
    return format_points(average)


def empty_statistics_group():
    return {
        "starts_count": 0,
        "points_sum": "0",
        "average_points": "0",
    }


def empty_ammunition_usage():
    return {
        "items": [],
        "total_shots_count": 0,
    }


def ammunition_usage_from_results(results: list[DisciplineResult], disciplines_by_id: dict[int, Discipline]):
    usage_by_type = {}

    for result in results:
        discipline = disciplines_by_id.get(result.discipline_id)

        if not discipline:
            continue

        ammo_type = normalize_text(discipline.ammo_type or "") or "Nie podano"
        shots_count = max(int(discipline.shots_count or 0), 0)

        if ammo_type not in usage_by_type:
            usage_by_type[ammo_type] = {
                "ammo_type": ammo_type,
                "starts_count": 0,
                "shots_count": 0,
            }

        usage_by_type[ammo_type]["starts_count"] += 1
        usage_by_type[ammo_type]["shots_count"] += shots_count

    items = sorted(
        usage_by_type.values(),
        key=lambda item: (-item["shots_count"], item["ammo_type"].lower()),
    )

    return {
        "items": items,
        "total_shots_count": sum(item["shots_count"] for item in items),
    }


def discipline_statistics_shooters_count(
    competition: Competition,
    discipline_id: int,
    db,
):
    participant_ids = [
        participant.id
        for participant in public_shooter_participants(competition, db)
    ]

    if not participant_ids:
        return 0

    return (
        db.query(ParticipantDiscipline)
        .filter(
            ParticipantDiscipline.discipline_id == discipline_id,
            ParticipantDiscipline.participant_id.in_(participant_ids),
        )
        .count()
    )


def user_competition_statistics(user: User, db):
    statistics = {
        "pistol": {
            "starts_count": 0,
            "points_sum": Decimal("0"),
        },
        "rifle": {
            "starts_count": 0,
            "points_sum": Decimal("0"),
        },
        "shotgun": {
            "starts_count": 0,
            "points_sum": Decimal("0"),
        },
    }
    discipline_type_statistics = {
        discipline_type: {
            "starts_count": 0,
            "points_sum": Decimal("0"),
        }
        for discipline_type in DETAILED_DISCIPLINE_TYPES
    }
    total_points_sum = Decimal("0")

    participants = (
        db.query(CompetitionParticipant)
        .filter(
            CompetitionParticipant.user_email == user.email,
            or_(
                CompetitionParticipant.entry_type == "shooter",
                CompetitionParticipant.entry_type.is_(None),
            ),
        )
        .all()
    )
    participant_ids = [
        participant.id
        for participant in participants
    ]

    if not participant_ids:
        return {
            "minimum_discipline_shooters": MIN_STATISTICS_DISCIPLINE_SHOOTERS,
            "categories": {
                "pistol": empty_statistics_group(),
                "rifle": empty_statistics_group(),
                "shotgun": empty_statistics_group(),
            },
            "discipline_types": {
                discipline_type: empty_statistics_group()
                for discipline_type in DETAILED_DISCIPLINE_TYPES
            },
            "total_points_sum": "0",
            "ammunition_usage": empty_ammunition_usage(),
            "updated_at": datetime.now(APP_TIMEZONE).isoformat(),
        }

    results = (
        db.query(DisciplineResult)
        .filter(DisciplineResult.participant_id.in_(participant_ids))
        .all()
    )
    discipline_ids = {
        result.discipline_id
        for result in results
    }
    competition_ids = {
        result.competition_id
        for result in results
    }

    disciplines_by_id = {}
    competitions_by_id = {}

    if discipline_ids:
        disciplines_by_id = {
            discipline.id: discipline
            for discipline in (
                db.query(Discipline)
                .filter(Discipline.id.in_(discipline_ids))
                .all()
            )
        }

    if competition_ids:
        competitions_by_id = {
            competition.id: competition
            for competition in (
                db.query(Competition)
                .filter(Competition.id.in_(competition_ids))
                .all()
            )
        }

    eligible_discipline_ids = set()

    for discipline in disciplines_by_id.values():
        competition = competitions_by_id.get(discipline.competition_id)

        if not competition:
            continue

        if (
            discipline_statistics_shooters_count(competition, discipline.id, db)
            >= MIN_STATISTICS_DISCIPLINE_SHOOTERS
        ):
            eligible_discipline_ids.add(discipline.id)

    for result in results:
        if result.discipline_id not in eligible_discipline_ids:
            continue

        discipline = disciplines_by_id.get(result.discipline_id)

        if not discipline:
            continue

        points = parse_points(result.points)
        firearm_type = discipline_firearm_type(discipline)
        discipline_type = normalize_discipline_type(discipline.discipline_type or "")
        total_points_sum += points

        if discipline_type in discipline_type_statistics:
            discipline_type_statistics[discipline_type]["starts_count"] += 1
            discipline_type_statistics[discipline_type]["points_sum"] += points

        if firearm_type not in statistics:
            continue

        statistics[firearm_type]["starts_count"] += 1
        statistics[firearm_type]["points_sum"] += points

    return {
        "minimum_discipline_shooters": MIN_STATISTICS_DISCIPLINE_SHOOTERS,
        "categories": {
            firearm_type: {
                "starts_count": category_statistics["starts_count"],
                "points_sum": format_points(category_statistics["points_sum"]),
                "average_points": format_average_points(
                    category_statistics["points_sum"],
                    category_statistics["starts_count"],
                ),
            }
            for firearm_type, category_statistics in statistics.items()
        },
        "discipline_types": {
            discipline_type: {
                "starts_count": discipline_statistics["starts_count"],
                "points_sum": format_points(discipline_statistics["points_sum"]),
                "average_points": format_average_points(
                    discipline_statistics["points_sum"],
                    discipline_statistics["starts_count"],
                ),
            }
            for discipline_type, discipline_statistics in discipline_type_statistics.items()
        },
        "total_points_sum": format_points(total_points_sum),
        "ammunition_usage": ammunition_usage_from_results(results, disciplines_by_id),
        "updated_at": datetime.now(APP_TIMEZONE).isoformat(),
    }


def ranking_points_for_metric(statistics, metric: str):
    if metric == "overall":
        return parse_points(statistics["total_points_sum"])

    if metric in statistics["categories"]:
        return parse_points(statistics["categories"][metric]["points_sum"])

    return parse_points(
        statistics.get("discipline_types", {})
        .get(metric, empty_statistics_group())["points_sum"]
    )


def ranking_rows(metric: str, db, voivodeship: str = ""):
    users_query = db.query(User)

    if voivodeship:
        users_query = users_query.filter(User.voivodeship == voivodeship)

    users = users_query.all()
    rows = []

    for user in users:
        if not is_profile_complete(user):
            continue

        statistics = user_competition_statistics(user, db)
        points_value = ranking_points_for_metric(statistics, metric)

        if points_value <= 0:
            continue

        rows.append({
            "user_id": user.id,
            "display_name": " ".join([
                user.last_name or "",
                user.first_name or "",
            ]).strip() or user.email,
            "first_name": user.first_name or "",
            "last_name": user.last_name or "",
            "club": user.club or "",
            "voivodeship": user.voivodeship or "",
            "points_value": points_value,
            "points": format_points(points_value),
        })

    rows.sort(
        key=lambda row: (
            -row["points_value"],
            row["last_name"].lower(),
            row["first_name"].lower(),
            row["display_name"].lower(),
        )
    )
    rows = rows[:RANKING_LIMIT]

    for index, row in enumerate(rows, start=1):
        row["place"] = index
        del row["points_value"]

    return {
        "rows": rows,
        "message": "",
    }


def cached_ranking_rows(metric: str, db, voivodeship: str = ""):
    scope = "regional" if voivodeship else "national"
    query = (
        db.query(RankingEntry)
        .filter(
            RankingEntry.scope == scope,
            RankingEntry.metric == metric,
        )
    )

    if scope == "regional":
        query = query.filter(RankingEntry.voivodeship == voivodeship)
    else:
        query = query.filter(RankingEntry.voivodeship == "")

    entries = (
        query
        .order_by(RankingEntry.place.asc())
        .limit(RANKING_LIMIT)
        .all()
    )

    return {
        "rows": [
            {
                "place": entry.place,
                "user_id": entry.user_id,
                "display_name": entry.display_name,
                "club": entry.club or "",
                "voivodeship": entry.voivodeship or "",
                "points": entry.points,
            }
            for entry in entries
        ],
        "updated_at": entries[0].updated_at if entries else "",
        "message": "",
    }


def eligible_ranking_discipline_ids(db):
    rows = (
        db.query(
            ParticipantDiscipline.discipline_id,
            func.count(ParticipantDiscipline.id),
        )
        .join(
            CompetitionParticipant,
            CompetitionParticipant.id == ParticipantDiscipline.participant_id,
        )
        .join(Discipline, Discipline.id == ParticipantDiscipline.discipline_id)
        .join(Competition, Competition.id == Discipline.competition_id)
        .filter(
            Competition.status == "completed",
            or_(
                CompetitionParticipant.entry_type == "shooter",
                CompetitionParticipant.entry_type.is_(None),
            ),
        )
        .group_by(ParticipantDiscipline.discipline_id)
        .having(func.count(ParticipantDiscipline.id) >= MIN_STATISTICS_DISCIPLINE_SHOOTERS)
        .all()
    )

    return {
        discipline_id
        for discipline_id, _count in rows
    }


def ranking_user_display_name(user: User):
    return " ".join([
        user.last_name or "",
        user.first_name or "",
    ]).strip() or user.email


def add_cached_ranking_entries(
    db,
    user_rankings: dict[int, dict],
    metric: str,
    scope: str,
    updated_at: str,
    voivodeship: str = "",
):
    ranked_users = [
        user_ranking
        for user_ranking in user_rankings.values()
        if (
            user_ranking["voivodeship"] == voivodeship
            if scope == "regional"
            else True
        )
        and user_ranking["points"].get(metric, Decimal("0")) > 0
    ]

    ranked_users.sort(
        key=lambda user_ranking: (
            -user_ranking["points"][metric],
            user_ranking["last_name"].lower(),
            user_ranking["first_name"].lower(),
            user_ranking["display_name"].lower(),
        )
    )

    inserted_count = 0

    for place, user_ranking in enumerate(ranked_users[:RANKING_LIMIT], start=1):
        points_value = user_ranking["points"][metric]
        db.add(RankingEntry(
            scope=scope,
            voivodeship=voivodeship if scope == "regional" else "",
            metric=metric,
            metric_label=RANKING_METRIC_LABELS[metric],
            place=place,
            user_id=user_ranking["user_id"],
            display_name=user_ranking["display_name"],
            first_name=user_ranking["first_name"],
            last_name=user_ranking["last_name"],
            club=user_ranking["club"],
            points=format_points(points_value),
            points_value=str(points_value),
            updated_at=updated_at,
        ))
        inserted_count += 1

    return inserted_count


def rebuild_ranking_entries(db):
    updated_at = datetime.now(APP_TIMEZONE).isoformat()

    db.query(RankingEntry).delete(synchronize_session=False)

    eligible_discipline_ids = eligible_ranking_discipline_ids(db)

    if not eligible_discipline_ids:
        return 0

    rows = (
        db.query(
            User,
            DisciplineResult.points,
            Discipline.discipline_type,
        )
        .join(
            CompetitionParticipant,
            CompetitionParticipant.user_email == User.email,
        )
        .join(
            DisciplineResult,
            DisciplineResult.participant_id == CompetitionParticipant.id,
        )
        .join(Discipline, Discipline.id == DisciplineResult.discipline_id)
        .join(Competition, Competition.id == DisciplineResult.competition_id)
        .filter(
            Competition.status == "completed",
            DisciplineResult.discipline_id.in_(eligible_discipline_ids),
            or_(
                CompetitionParticipant.entry_type == "shooter",
                CompetitionParticipant.entry_type.is_(None),
            ),
        )
        .all()
    )

    user_rankings: dict[int, dict] = {}

    for user, result_points, raw_discipline_type in rows:
        if not is_profile_complete(user):
            continue

        discipline_type = normalize_discipline_type(raw_discipline_type or "")
        points = parse_points(result_points)

        if points <= 0:
            continue

        user_ranking = user_rankings.setdefault(
            user.id,
            {
                "user_id": user.id,
                "display_name": ranking_user_display_name(user),
                "first_name": user.first_name or "",
                "last_name": user.last_name or "",
                "club": user.club or "",
                "voivodeship": normalize_voivodeship(user.voivodeship or ""),
                "points": {},
            },
        )

        user_ranking["points"]["overall"] = (
            user_ranking["points"].get("overall", Decimal("0")) + points
        )

        firearm_type = DISCIPLINE_TYPE_FIREARM_TYPES.get(discipline_type, "")

        if firearm_type in ["pistol", "rifle", "shotgun"]:
            user_ranking["points"][firearm_type] = (
                user_ranking["points"].get(firearm_type, Decimal("0")) + points
            )

        if discipline_type in DETAILED_DISCIPLINE_TYPES:
            user_ranking["points"][discipline_type] = (
                user_ranking["points"].get(discipline_type, Decimal("0")) + points
            )

    voivodeships = {
        user_ranking["voivodeship"]
        for user_ranking in user_rankings.values()
        if user_ranking["voivodeship"]
    }
    inserted_count = 0

    for metric in RANKING_METRICS:
        inserted_count += add_cached_ranking_entries(
            db,
            user_rankings,
            metric,
            "national",
            updated_at,
        )

        for voivodeship in voivodeships:
            inserted_count += add_cached_ranking_entries(
                db,
                user_rankings,
                metric,
                "regional",
                updated_at,
                voivodeship,
            )

    return inserted_count


def live_result_categories(disciplines: list[Discipline]):
    categories = [
        {
            "id": f"discipline-{discipline.id}",
            "name": discipline.name,
            "type": "discipline",
            "discipline_ids": [discipline.id],
            "disciplines_count": 1,
        }
        for discipline in disciplines
    ]

    aggregate_definitions = [
        ("overall", "Całe zawody"),
        ("pistol", "Konkurencje pistoletowe i rewolwerowe"),
        ("rifle", "Konkurencje karabinowe"),
        ("shotgun", "Konkurencje strzelbowe"),
    ]

    for category_id, category_name in aggregate_definitions:
        if category_id == "overall":
            discipline_ids = [discipline.id for discipline in disciplines]
        else:
            discipline_ids = [
                discipline.id
                for discipline in disciplines
                if discipline_firearm_type(discipline) == category_id
            ]

        categories.append({
            "id": category_id,
            "name": category_name,
            "type": "aggregate",
            "discipline_ids": discipline_ids,
            "disciplines_count": len(discipline_ids),
        })

    return categories


def live_category_discipline_ids(category_id: str, disciplines: list[Discipline]):
    if category_id.startswith("discipline-"):
        try:
            discipline_id = int(category_id.replace("discipline-", "", 1))
        except ValueError:
            return []

        return [
            discipline.id
            for discipline in disciplines
            if discipline.id == discipline_id
        ]

    if category_id == "overall":
        return [discipline.id for discipline in disciplines]

    if category_id in ["pistol", "rifle", "shotgun"]:
        return [
            discipline.id
            for discipline in disciplines
            if discipline_firearm_type(discipline) == category_id
        ]

    return []


def now_iso():
    return datetime.now(APP_TIMEZONE).isoformat()


def premium_end_of_year_iso():
    now = datetime.now(APP_TIMEZONE)
    return datetime(
        now.year,
        12,
        31,
        23,
        59,
        59,
        tzinfo=APP_TIMEZONE,
    ).isoformat()


def premium_until_datetime(user: Optional[User]):
    if not user or not getattr(user, "premium_until", None):
        return None

    try:
        value = datetime.fromisoformat(user.premium_until)
    except ValueError:
        return None

    if value.tzinfo is None:
        return value.replace(tzinfo=APP_TIMEZONE)

    return value.astimezone(APP_TIMEZONE)


def has_active_premium(user: Optional[User]):
    if not user or getattr(user, "premium_disabled", 0):
        return False

    premium_until = premium_until_datetime(user)

    if not premium_until:
        return False

    return datetime.now(APP_TIMEZONE) <= premium_until


def require_active_premium(user: Optional[User]):
    if not has_active_premium(user):
        raise HTTPException(
            status_code=403,
            detail=PREMIUM_EXPIRED_DETAIL,
        )


def organizer_active_publications_count(
    organizer_email: str,
    db,
    exclude_competition_id: Optional[int] = None,
):
    query = (
        db.query(Competition)
        .filter(
            Competition.created_by == organizer_email,
            Competition.status.in_(["published", "started"]),
        )
    )

    if exclude_competition_id is not None:
        query = query.filter(Competition.id != exclude_competition_id)

    return query.count()


def require_organizer_publication_slot(
    user: User,
    competition: Competition,
    db,
):
    if competition.status in ["published", "started"]:
        return

    active_publications_count = organizer_active_publications_count(
        user.email,
        db,
        exclude_competition_id=competition.id,
    )

    if active_publications_count < ORGANIZER_FREE_ACTIVE_PUBLICATIONS_LIMIT:
        return

    if has_active_premium(user):
        return

    premium_settings = get_premium_settings(db)
    organizer_package = premium_settings["organizer"]

    raise HTTPException(
        status_code=403,
        detail=(
            "Darmowy limit organizatora to 1 jednocześnie opublikowane zawody. "
            "Aby opublikować kolejne zawody, wykup dodatkową publikację za "
            f"{organizer_package['monthly_price']} zł albo roczny pakiet Premium "
            f"Organizatora za {organizer_package['yearly_price']} zł."
        ),
    )


def completed_at_datetime(competition: Competition):
    if not competition.completed_at:
        return None

    try:
        value = datetime.fromisoformat(competition.completed_at)
    except ValueError:
        return None

    if value.tzinfo is None:
        return value.replace(tzinfo=APP_TIMEZONE)

    return value.astimezone(APP_TIMEZONE)


def mark_competition_completed(
    competition: Competition,
    completed_at: Optional[datetime] = None,
):
    competition.status = "completed"

    if not competition.completed_at:
        competition.completed_at = (
            completed_at.astimezone(APP_TIMEZONE).isoformat()
            if completed_at
            else now_iso()
        )


def is_recently_completed_competition(competition: Competition):
    if competition.status != "completed":
        return False

    completed_at = completed_at_datetime(competition)

    if not completed_at:
        return False

    return datetime.now(APP_TIMEZONE) - completed_at < timedelta(hours=24)


def is_live_results_competition(competition: Competition):
    return (
        competition.status == "started"
        or is_recently_completed_competition(competition)
    )


def is_historical_results_competition(competition: Competition):
    return competition.status == "completed"


def is_premium_locked_historical_competition(competition: Competition):
    if not is_historical_results_competition(competition):
        return False

    completed_at = completed_at_datetime(competition)

    if completed_at:
        return datetime.now(APP_TIMEZONE) - completed_at > timedelta(days=3)

    competition_date = parse_competition_date(competition.date)

    if not competition_date:
        return False

    competition_date = competition_date.replace(tzinfo=APP_TIMEZONE)

    return datetime.now(APP_TIMEZONE) - competition_date > timedelta(days=3)


def require_historical_results_access(competition: Competition, user: Optional[User]):
    if is_premium_locked_historical_competition(competition):
        require_active_premium(user)


def competition_result_summary(competition: Competition, db, premium_locked: bool = False):
    shooters_count = len(public_shooter_participants(competition, db))

    return {
        "id": competition.id,
        "name": competition.name,
        "date": competition.date,
        "location": competition.location,
        "organizer_full_name": competition.organizer_full_name or competition.created_by,
        "organizer_logo": competition.organizer_logo or "",
        "sponsor_logo": competition.sponsor_logo or "",
        "shooters_count": shooters_count,
        "status": competition.status,
        "completed_at": competition.completed_at or "",
        "premium_locked": premium_locked,
    }


def shooter_entry_filter():
    return or_(
        CompetitionParticipant.entry_type == "shooter",
        CompetitionParticipant.entry_type.is_(None),
    )


def count_disciplines_by_competition(db, competition_ids: list[int]):
    if not competition_ids:
        return {}

    return {
        competition_id: int(count or 0)
        for competition_id, count in (
            db.query(Discipline.competition_id, func.count(Discipline.id))
            .filter(Discipline.competition_id.in_(competition_ids))
            .group_by(Discipline.competition_id)
            .all()
        )
    }


def count_shooters_by_competition(db, competition_ids: list[int]):
    if not competition_ids:
        return {}

    return {
        competition_id: int(count or 0)
        for competition_id, count in (
            db.query(CompetitionParticipant.competition_id, func.count(CompetitionParticipant.id))
            .filter(CompetitionParticipant.competition_id.in_(competition_ids))
            .filter(shooter_entry_filter())
            .group_by(CompetitionParticipant.competition_id)
            .all()
        )
    }


def count_judges_by_competition(db, competition_ids: list[int]):
    if not competition_ids:
        return {}

    return {
        competition_id: int(count or 0)
        for competition_id, count in (
            db.query(CompetitionParticipant.competition_id, func.count(CompetitionParticipant.id))
            .filter(CompetitionParticipant.competition_id.in_(competition_ids))
            .filter(CompetitionParticipant.entry_type == "judge")
            .group_by(CompetitionParticipant.competition_id)
            .all()
        )
    }


def missing_judge_disciplines_by_competition(db, competition_ids: list[int]):
    if not competition_ids:
        return {}

    disciplines = (
        db.query(Discipline)
        .filter(Discipline.competition_id.in_(competition_ids))
        .order_by(Discipline.id.asc())
        .all()
    )
    assigned_discipline_ids = {
        int(discipline_id)
        for (discipline_id,) in (
            db.query(JudgeInvitation.discipline_id)
            .filter(
                JudgeInvitation.competition_id.in_(competition_ids),
                JudgeInvitation.discipline_id.is_not(None),
            )
            .all()
        )
        if discipline_id is not None
    }
    result = {competition_id: [] for competition_id in competition_ids}

    for discipline in disciplines:
        if discipline.id not in assigned_discipline_ids:
            result.setdefault(discipline.competition_id, []).append(discipline.name)

    return result


def validate_judges_assigned_before_start(competition: Competition, db):
    missing_disciplines = missing_judge_disciplines_by_competition(
        db,
        [competition.id],
    ).get(competition.id, [])

    if missing_disciplines:
        raise HTTPException(
            status_code=400,
            detail=(
                "Nie można rozpocząć zawodów. Przypisz sędziego do każdej konkurencji. "
                f"Brak sędziego dla: {', '.join(missing_disciplines)}. "
                "Sędzia główny nie jest wymagany."
            ),
        )


def competition_list_row(
    competition: Competition,
    disciplines_count: int = 0,
    shooters_count: int = 0,
    judges_count: int = 0,
    missing_judge_disciplines: Optional[list[str]] = None,
):
    return {
        "id": competition.id,
        "name": competition.name,
        "date": competition.date,
        "location": competition.location,
        "entry_fee": competition.entry_fee or "",
        "organizer_full_name": competition.organizer_full_name or "",
        "organizer_logo": "",
        "has_organizer_logo": bool(competition.organizer_logo),
        "sponsors": competition.sponsors or "",
        "sponsor_logo": "",
        "has_sponsor_logo": bool(competition.sponsor_logo),
        "participant_limit": competition.participant_limit,
        "pzss_license_calendar": bool(getattr(competition, "pzss_license_calendar", 0)),
        "requires_licensed_judge": bool(getattr(competition, "requires_licensed_judge", 1)),
        "shooters_count": shooters_count,
        "judges_count": judges_count,
        "missing_judge_disciplines": missing_judge_disciplines or [],
        "status": competition.status,
        "disciplines_count": disciplines_count,
    }


def historical_sort_key(competition: Competition):
    competition_date = parse_competition_date(competition.date)

    if competition_date:
        return competition_date.timestamp()

    return float(competition.id)


def get_result_competition_or_404(
    competition_id: int,
    history: bool,
    db,
):
    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    is_visible = (
        is_historical_results_competition(competition)
        if history
        else is_live_results_competition(competition)
    )

    if not is_visible:
        raise HTTPException(
            status_code=404,
            detail=(
                "Zawody nie są dostępne w wynikach historycznych"
                if history
                else "Zawody nie są aktualnie dostępne w wynikach na żywo"
            )
        )

    return competition


def result_competition_details(competition: Competition, db):
    disciplines = (
        db.query(Discipline)
        .filter(Discipline.competition_id == competition.id)
        .all()
    )

    return {
        "id": competition.id,
        "name": competition.name,
        "date": competition.date,
        "location": competition.location,
        "organizer_full_name": competition.organizer_full_name or competition.created_by,
        "status": competition.status,
        "completed_at": competition.completed_at or "",
        "categories": live_result_categories(disciplines),
    }


def result_category_payload(competition: Competition, category_id: str, db, include_license: bool = False):
    disciplines = (
        db.query(Discipline)
        .filter(Discipline.competition_id == competition.id)
        .all()
    )
    categories = live_result_categories(disciplines)
    category = next(
        (item for item in categories if item["id"] == category_id),
        None,
    )

    if not category:
        raise HTTPException(
            status_code=404,
            detail="Kategoria wyników nie istnieje"
        )

    discipline_ids = live_category_discipline_ids(category_id, disciplines)
    participants = public_shooter_participants(competition, db)
    participant_ids = [participant.id for participant in participants]
    participant_discipline_rows = []

    if participant_ids and discipline_ids:
        participant_discipline_rows = (
            db.query(ParticipantDiscipline)
            .filter(
                ParticipantDiscipline.participant_id.in_(participant_ids),
                ParticipantDiscipline.discipline_id.in_(discipline_ids),
            )
            .all()
        )

    discipline_ids_by_participant = {}

    for row in participant_discipline_rows:
        discipline_ids_by_participant.setdefault(row.participant_id, set()).add(
            row.discipline_id
        )

    results = []

    if participant_ids and discipline_ids:
        results = (
            db.query(DisciplineResult)
            .filter(
                DisciplineResult.competition_id == competition.id,
                DisciplineResult.participant_id.in_(participant_ids),
                DisciplineResult.discipline_id.in_(discipline_ids),
            )
            .all()
        )

    points_by_participant = {}
    results_by_participant = {}

    for result in results:
        points_by_participant.setdefault(result.participant_id, Decimal("0"))
        points_by_participant[result.participant_id] += parse_points(result.points)
        results_by_participant[result.participant_id] = result

    skeet_discipline = next(
        (
            discipline
            for discipline in disciplines
            if discipline.id in discipline_ids
            and normalize_discipline_type(discipline.discipline_type or "") == SKEET_DISCIPLINE_TYPE
        ),
        None,
    ) if len(discipline_ids) == 1 else None

    rows = []

    for participant in participants:
        selected_discipline_ids = discipline_ids_by_participant.get(participant.id)

        if not selected_discipline_ids:
            continue

        participant_data = public_participant(
            participant,
            db,
            include_private=include_license,
        )
        points_value = points_by_participant.get(participant.id, Decimal("0"))

        row = {
            "participant_id": participant.id,
            "display_name": participant_result_display_name(participant_data),
            "first_name": participant_data["first_name"],
            "last_name": participant_data["last_name"],
            "club": participant_data["club"],
            "points": format_points(points_value),
            "disciplines_count": len(selected_discipline_ids),
        }

        if skeet_discipline:
            result = results_by_participant.get(participant.id)
            scores = clay_result_scores(
                skeet_discipline,
                getattr(result, "result_data", "") or "" if result else "",
            )
            rounds = [
                scores[index:index + SKEET_TARGETS_PER_SERIES]
                for index in range(0, len(scores), SKEET_TARGETS_PER_SERIES)
            ]
            round_totals = [
                sum(1 for score in round_scores if score == 1) * CLAY_HIT_POINTS
                for round_scores in rounds
            ]
            row["round_scores"] = round_totals
            row["_countback_key"] = tuple(
                [-round_total for round_total in reversed(round_totals)]
                + [-(score or 0) for score in reversed(scores)]
            )

        if include_license:
            row["license_number"] = participant_data["license_number"]

        rows.append(row)

    rows.sort(
        key=lambda row: (
            -parse_points(row["points"]),
            row.get("_countback_key", ()),
            row["last_name"].lower(),
            row["first_name"].lower(),
            row["display_name"].lower(),
        )
    )

    previous_ranking_key = None
    current_place = 0

    for index, row in enumerate(rows, start=1):
        ranking_key = (
            row["points"],
            row.get("_countback_key", ()),
        )
        if ranking_key != previous_ranking_key:
            current_place = index
            previous_ranking_key = ranking_key
        row["place"] = current_place
        row.pop("_countback_key", None)

    return {
        "competition": {
            "id": competition.id,
            "name": competition.name,
            "date": competition.date,
            "location": competition.location,
            "organizer_full_name": competition.organizer_full_name or competition.created_by,
            "status": competition.status,
            "completed_at": competition.completed_at or "",
        },
        "category": category,
        "shooters": rows,
        "updated_at": datetime.now(APP_TIMEZONE).isoformat(),
    }


def public_achievement(achievement: Achievement, competition: Optional[Competition] = None):
    return {
        "id": achievement.id,
        "competition_id": achievement.competition_id,
        "competition_name": competition.name if competition else "",
        "competition_date": competition.date if competition else "",
        "competition_location": competition.location if competition else "",
        "category_id": achievement.category_id,
        "category_name": achievement.category_name,
        "badge_type": achievement.badge_type,
        "medal": achievement.medal,
        "place": achievement.place,
        "points": achievement.points,
        "historical_path": achievement.historical_path,
        "awarded_at": achievement.awarded_at,
    }


def user_achievements(user_email: str, db):
    if not user_email:
        return []

    achievements = (
        db.query(Achievement)
        .filter(Achievement.user_email == user_email)
        .order_by(
            Achievement.awarded_at.desc(),
            Achievement.competition_id.desc(),
            Achievement.place.asc(),
        )
        .all()
    )
    competition_ids = {
        achievement.competition_id
        for achievement in achievements
    }
    competitions_by_id = {}

    if competition_ids:
        competitions_by_id = {
            competition.id: competition
            for competition in (
                db.query(Competition)
                .filter(Competition.id.in_(competition_ids))
                .all()
            )
        }

    return [
        public_achievement(
            achievement,
            competitions_by_id.get(achievement.competition_id),
        )
        for achievement in achievements
    ]


def award_achievements_for_competition(competition: Competition, db):
    (
        db.query(Achievement)
        .filter(Achievement.competition_id == competition.id)
        .delete(synchronize_session=False)
    )

    if competition.status != "completed":
        return 0

    participants_by_id = {
        participant.id: participant
        for participant in (
            db.query(CompetitionParticipant)
            .filter(CompetitionParticipant.competition_id == competition.id)
            .all()
        )
    }
    participant_emails = {
        participant.user_email
        for participant in participants_by_id.values()
        if participant.user_email
    }
    users_by_email = {}

    if participant_emails:
        users_by_email = {
            user.email: user
            for user in (
                db.query(User)
                .filter(User.email.in_(participant_emails))
                .all()
            )
        }

    awarded_at = competition.completed_at or now_iso()
    awarded_count = 0

    for category_id in ACHIEVEMENT_CATEGORY_IDS:
        payload = result_category_payload(competition, category_id, db)
        category = payload["category"]
        category_shooters = payload["shooters"]

        if not category["discipline_ids"] or len(category_shooters) <= 50:
            continue

        for shooter in category_shooters[:3]:
            place = shooter["place"]
            participant = participants_by_id.get(shooter["participant_id"])
            user = users_by_email.get(participant.user_email) if participant else None

            if not user or not is_profile_complete(user):
                continue

            db.add(Achievement(
                user_email=user.email,
                competition_id=competition.id,
                participant_id=participant.id,
                category_id=category_id,
                category_name=category["name"],
                badge_type=category_id,
                medal=ACHIEVEMENT_MEDALS[place],
                place=place,
                points=shooter["points"],
                historical_path=f"/historical-results/{competition.id}/{category_id}",
                awarded_at=awarded_at,
            ))
            awarded_count += 1

    return awarded_count


def refresh_ranking_and_achievement_entries(
    db,
    achievement_competitions: tuple[Competition, ...] = (),
):
    ranking_entries_count = rebuild_ranking_entries(db)
    achievement_entries_count = sum(
        award_achievements_for_competition(competition, db)
        for competition in achievement_competitions
    )

    return {
        "ranking_entries_count": ranking_entries_count,
        "achievement_entries_count": achievement_entries_count,
    }


def get_organizer_result_competition_or_404(
    competition_id: int,
    user: User,
    db,
):
    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    if competition.created_by != user.email and not has_role(user, "admin"):
        raise HTTPException(
            status_code=403,
            detail="Nie masz dostępu do wyników tych zawodów"
        )

    if competition.status not in ["started", "completed"]:
        raise HTTPException(
            status_code=400,
            detail="Wyniki są dostępne po rozpoczęciu zawodów"
        )

    return competition


def can_leave_competition(competition: Competition):
    competition_date = parse_competition_date(competition.date)

    if not competition_date:
        return False

    now = datetime.now()

    return competition_date - now > timedelta(hours=48)


def parse_competition_date(date_value: str):
    for date_format in ["%Y-%m-%d", "%d.%m.%Y"]:
        try:
            return datetime.strptime(date_value, date_format)
        except ValueError:
            continue

    return None


def sort_competitions_by_date(competitions, descending: bool = False):
    def sort_key(competition: Competition):
        competition_date = parse_competition_date(competition.date)
        timestamp = competition_date.timestamp() if competition_date else None
        date_value = (
            -timestamp
            if descending and timestamp is not None
            else timestamp
            if timestamp is not None
            else float("inf")
        )

        return (
            date_value,
            normalize_text(competition.name).lower(),
            competition.id or 0,
        )

    return sorted(competitions, key=sort_key)


def sort_competitions_by_nearest_date(competitions):
    today = datetime.now(APP_TIMEZONE).date()

    def sort_key(competition: Competition):
        competition_date = parse_competition_date(competition.date)

        if not competition_date:
            return (
                2,
                float("inf"),
                normalize_text(competition.name).lower(),
                competition.id or 0,
            )

        date_only = competition_date.date()
        is_future_or_today = date_only >= today
        distance = abs((date_only - today).days)

        return (
            0 if is_future_or_today else 1,
            distance,
            normalize_text(competition.name).lower(),
            competition.id or 0,
        )

    return sorted(competitions, key=sort_key)


def can_start_competition(competition: Competition):
    competition_date = parse_competition_date(competition.date)

    if not competition_date:
        return False

    return datetime.now(APP_TIMEZONE).date() >= competition_date.date()


def should_auto_complete_competition(competition: Competition):
    if competition.status != "started":
        return False

    competition_date = parse_competition_date(competition.date)

    if not competition_date:
        return False

    now = datetime.now(APP_TIMEZONE)

    if competition_date.date() < now.date():
        return True

    return (
        competition_date.date() == now.date()
        and now.time() >= time(22, 0)
    )


def auto_complete_started_competitions(db):
    competitions = (
        db.query(Competition)
        .filter(Competition.status == "started")
        .all()
    )

    completed_competitions = []

    for competition in competitions:
        if should_auto_complete_competition(competition):
            competition_date = parse_competition_date(competition.date)
            completed_at = (
                datetime.combine(
                    competition_date.date(),
                    time(22, 0),
                    tzinfo=APP_TIMEZONE,
                )
                if competition_date
                else None
            )
            mark_competition_completed(competition, completed_at)
            completed_competitions.append(competition)

    if completed_competitions:
        refresh_ranking_and_achievement_entries(
            db,
            tuple(completed_competitions),
        )
        db.commit()


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


def backfill_participant_total_fees():
    db = SessionLocal()

    try:
        participants = (
            db.query(CompetitionParticipant)
            .filter(
                CompetitionParticipant.entry_type == "shooter",
                (CompetitionParticipant.total_fee.is_(None))
                | (CompetitionParticipant.total_fee == ""),
            )
            .all()
        )

        for participant in participants:
            participant.total_fee = calculate_participant_total_fee(participant, db)

        if participants:
            db.commit()
    finally:
        db.close()


def backfill_competition_derived_cache():
    cache_key = "competition_derived_cache_version"
    cache_version = "2026-06-21-ranking-achievements-v1"
    db = SessionLocal()

    try:
        setting = (
            db.query(AppSetting)
            .filter(AppSetting.key == cache_key)
            .first()
        )

        if setting and setting.value == cache_version:
            return

        completed_competitions = (
            db.query(Competition)
            .filter(Competition.status == "completed")
            .all()
        )

        db.query(Achievement).delete(synchronize_session=False)
        refresh_ranking_and_achievement_entries(
            db,
            tuple(completed_competitions),
        )

        if setting:
            setting.value = cache_version
        else:
            db.add(AppSetting(
                key=cache_key,
                value=cache_version,
            ))

        db.commit()
    finally:
        db.close()


backfill_participant_total_fees()
backfill_competition_derived_cache()


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db=Depends(get_db),
):

    try:
        payload = decode_auth_token(token, "access")

        email = payload.get("sub")

        if email is None:
            raise HTTPException(
                status_code=401,
                detail="Nieprawidłowy token"
            )

    except JWTError:
        raise HTTPException(
            status_code=401,
            detail="Nieprawidłowy token"
        )

    user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Użytkownik nie istnieje"
        )

    user.last_seen = datetime.now(timezone.utc).isoformat()
    db.commit()

    return user


def get_optional_current_user(
    token: Optional[str] = Depends(optional_oauth2_scheme),
    db=Depends(get_db),
):
    if not token:
        return None

    try:
        payload = decode_auth_token(token, "access")
    except JWTError:
        return None

    email = payload.get("sub")

    if email is None:
        return None

    user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if not user:
        return None

    user.last_seen = datetime.now(timezone.utc).isoformat()
    db.commit()

    return user


def get_current_admin(
    user: User = Depends(get_current_user)
):

    if not has_role(user, "admin"):
        raise HTTPException(
            status_code=403,
            detail="Brak uprawnień administratora"
        )

    return user


def get_current_organizer(
    user: User = Depends(get_current_user)
):

    if not has_role(user, "organizer") and not has_role(user, "admin"):
        raise HTTPException(
            status_code=403,
            detail="Brak uprawnień organizatora"
        )

    return user


def get_current_pzss_club(
    user: User = Depends(get_current_user)
):
    if not is_approved_pzss_club(user):
        raise HTTPException(
            status_code=403,
            detail="Brak uprawnień zweryfikowanego klubu PZSS"
        )

    return user


def get_current_judge(
    user: User = Depends(get_current_user)
):

    if not has_role(user, "judge") and not has_role(user, "admin"):
        raise HTTPException(
            status_code=403,
            detail="Brak uprawnień sędziego"
        )

    return user


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def run_monitoring_command(command: list[str], timeout: float = 2.0):
    env = os.environ.copy()
    env.setdefault("HOME", "/home/ubuntu")
    env.setdefault("PM2_HOME", "/home/ubuntu/.pm2")

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            check=False,
            env=env,
            text=True,
            timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {
            "ok": False,
            "stdout": "",
            "stderr": str(exc),
            "returncode": None,
        }

    return {
        "ok": result.returncode == 0,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
        "returncode": result.returncode,
    }


def service_status(service_name: str):
    active_result = run_monitoring_command([
        "systemctl",
        "is-active",
        service_name,
    ])
    enabled_result = run_monitoring_command([
        "systemctl",
        "is-enabled",
        service_name,
    ])

    active = active_result["stdout"] or "unknown"
    enabled = enabled_result["stdout"] or "unknown"

    return {
        "name": service_name,
        "active": active,
        "enabled": enabled,
        "ok": active == "active",
    }


def database_status(db):
    started_at = datetime.now(timezone.utc)

    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        return {
            "ok": False,
            "latency_ms": None,
            "error": str(exc),
        }

    latency_ms = (
        datetime.now(timezone.utc) - started_at
    ).total_seconds() * 1000

    return {
        "ok": True,
        "latency_ms": round(latency_ms, 2),
        "error": "",
    }


def disk_status(path: str = "/"):
    usage = shutil.disk_usage(path)

    return {
        "path": path,
        "total_bytes": usage.total,
        "used_bytes": usage.used,
        "free_bytes": usage.free,
        "used_percent": round((usage.used / usage.total) * 100, 1),
    }


def file_summary(log_file: dict):
    path = log_file["path"]

    if not path.exists():
        return {
            "name": log_file["name"],
            "path": str(path),
            "exists": False,
            "size_bytes": 0,
            "modified_at": "",
        }

    stat = path.stat()

    return {
        "name": log_file["name"],
        "path": str(path),
        "exists": True,
        "size_bytes": stat.st_size,
        "modified_at": datetime.fromtimestamp(
            stat.st_mtime,
            tz=timezone.utc,
        ).isoformat(),
    }


def tail_text(path: Path, max_lines: int = 30, max_chars: int = 4000):
    if not path.exists() or not path.is_file():
        return []

    try:
        with path.open("r", encoding="utf-8", errors="replace") as file:
            lines = file.readlines()[-max_lines:]
    except OSError:
        return []

    trimmed = "".join(lines)[-max_chars:]

    return [
        line.rstrip()
        for line in trimmed.splitlines()
        if line.rstrip()
    ]


def backup_status():
    backups = sorted(
        BACKUP_DIR.glob("shooting-system-*.dump"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    ) if BACKUP_DIR.exists() else []

    latest_backup = None

    if backups:
        latest = backups[0]
        stat = latest.stat()
        latest_backup = {
            "name": latest.name,
            "path": str(latest),
            "size_bytes": stat.st_size,
            "modified_at": datetime.fromtimestamp(
                stat.st_mtime,
                tz=timezone.utc,
            ).isoformat(),
        }

    return {
        "directory": str(BACKUP_DIR),
        "count": len(backups),
        "latest": latest_backup,
    }


def pm2_status():
    result = run_monitoring_command([
        "pm2",
        "jlist",
    ])

    if not result["ok"]:
        return {
            "ok": False,
            "processes": [],
            "error": result["stderr"] or result["stdout"],
        }

    try:
        processes = json.loads(result["stdout"] or "[]")
    except json.JSONDecodeError as exc:
        return {
            "ok": False,
            "processes": [],
            "error": str(exc),
        }

    summarized_processes = []

    for process in processes:
        env = process.get("pm2_env", {})
        monitor = process.get("monit", {})
        summarized_processes.append({
            "name": process.get("name", ""),
            "status": env.get("status", ""),
            "pid": process.get("pid"),
            "restart_count": env.get("restart_time", 0),
            "uptime_ms": (
                int(datetime.now(timezone.utc).timestamp() * 1000)
                - int(env.get("pm_uptime") or 0)
            ) if env.get("pm_uptime") else None,
            "memory_bytes": monitor.get("memory", 0),
            "cpu_percent": monitor.get("cpu", 0),
        })

    return {
        "ok": all(
            process["status"] == "online"
            for process in summarized_processes
        ),
        "processes": summarized_processes,
        "error": "",
    }


def system_status(db):
    services = [
        service_status(service_name)
        for service_name in MONITORED_SERVICES
    ]
    database = database_status(db)
    pm2 = pm2_status()
    disk = disk_status("/")
    backups = backup_status()
    logs = [
        file_summary(log_file)
        for log_file in MONITORED_LOG_FILES
    ]
    recent_logs = {
        log_file["name"]: tail_text(log_file["path"])
        for log_file in MONITORED_LOG_FILES
        if log_file["name"] in {"Frontend error", "Nginx error"}
    }

    ok = (
        database["ok"]
        and pm2["ok"]
        and all(service["ok"] for service in services)
        and disk["used_percent"] < 90
        and backups["count"] > 0
    )

    return {
        "status": "ok" if ok else "warning",
        "generated_at": utc_now_iso(),
        "hostname": platform.node(),
        "environment": {
            "python": platform.python_version(),
            "platform": platform.platform(),
        },
        "database": database,
        "services": services,
        "pm2": pm2,
        "disk": disk,
        "backups": backups,
        "logs": logs,
        "recent_logs": recent_logs,
    }


@app.get("/")
def root():
    return {
        "message": "Backend działa poprawnie"
    }


@app.get("/health")
def health(db=Depends(get_db)):
    database = database_status(db)

    if not database["ok"]:
        raise HTTPException(
            status_code=503,
            detail="Baza danych nie odpowiada"
        )

    return {
        "status": "ok",
        "generated_at": utc_now_iso(),
        "database": {
            "ok": True,
            "latency_ms": database["latency_ms"],
        },
    }


@app.get("/competitions")
def get_competitions(db=Depends(get_db)):
    auto_complete_started_competitions(db)

    competitions = (
        db.query(Competition)
        .filter(Competition.status.in_(["published", "started", "completed"]))
        .all()
    )
    competition_ids = [competition.id for competition in competitions]
    disciplines_counts = count_disciplines_by_competition(db, competition_ids)
    shooters_counts = count_shooters_by_competition(db, competition_ids)

    return [
        competition_list_row(
            competition,
            disciplines_count=disciplines_counts.get(competition.id, 0),
            shooters_count=shooters_counts.get(competition.id, 0),
        )
        for competition in sort_competitions_by_nearest_date(competitions)
    ]


@app.get("/competitions/my-entries")
def get_my_competition_entries(
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)

    participants = (
        db.query(CompetitionParticipant)
        .join(Competition, Competition.id == CompetitionParticipant.competition_id)
        .filter(CompetitionParticipant.user_email == user.email)
        .filter(Competition.status.in_(["published", "started", "completed"]))
        .all()
    )

    entries = {}

    for participant in participants:
        competition_key = str(participant.competition_id)
        entry_type = participant.entry_type or "shooter"

        if entry_type == "judge" or competition_key not in entries:
            entries[competition_key] = entry_type

    return entries


@app.get("/competitions/{competition_id}")
def get_competition(
    competition_id: int,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)

    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    disciplines = (
        db.query(Discipline)
        .filter(Discipline.competition_id == competition.id)
        .all()
    )

    participants = public_shooter_participants(competition, db)
    include_private = can_view_participant_private_fields(current_user, competition)

    return {
        "id": competition.id,
        "name": competition.name,
        "date": competition.date,
        "location": competition.location,
        "entry_fee": competition.entry_fee or "",
        "organizer_full_name": competition.organizer_full_name or "",
        "organizer_logo": competition.organizer_logo or "",
        "sponsors": competition.sponsors or "",
        "sponsor_logo": competition.sponsor_logo or "",
        "participant_limit": competition.participant_limit,
        "pzss_license_calendar": bool(getattr(competition, "pzss_license_calendar", 0)),
        "requires_licensed_judge": bool(getattr(competition, "requires_licensed_judge", 1)),
        "status": competition.status,
        "disciplines": disciplines,
        "participants": [
            public_participant(participant, db, include_private=include_private)
            for participant in participants
        ],
    }


@app.get("/live-results/competitions")
def get_live_result_competitions(
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    require_active_premium(user)
    auto_complete_started_competitions(db)

    competitions = (
        db.query(Competition)
        .filter(Competition.status.in_(["started", "completed"]))
        .all()
    )

    return [
        competition_result_summary(competition, db)
        for competition in sort_competitions_by_date(competitions, descending=True)
        if is_live_results_competition(competition)
    ]


@app.get("/live-results/competitions/{competition_id}")
def get_live_result_competition(
    competition_id: int,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    require_active_premium(user)
    auto_complete_started_competitions(db)
    competition = get_result_competition_or_404(competition_id, False, db)

    return result_competition_details(competition, db)


@app.get("/live-results/competitions/{competition_id}/categories/{category_id}")
def get_live_result_category(
    competition_id: int,
    category_id: str,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    require_active_premium(user)
    auto_complete_started_competitions(db)
    competition = get_result_competition_or_404(competition_id, False, db)

    return result_category_payload(competition, category_id, db)


@app.get("/historical-results/competitions")
def get_historical_result_competitions(
    user: Optional[User] = Depends(get_optional_current_user),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)

    competitions = (
        db.query(Competition)
        .filter(Competition.status == "completed")
        .all()
    )
    historical_competitions = [
        competition
        for competition in competitions
        if is_historical_results_competition(competition)
    ]
    historical_competitions.sort(
        key=historical_sort_key,
        reverse=True,
    )

    user_has_premium = has_active_premium(user)

    return [
        competition_result_summary(
            competition,
            db,
            premium_locked=(
                is_premium_locked_historical_competition(competition)
                and not user_has_premium
            ),
        )
        for competition in historical_competitions
    ]


@app.get("/historical-results/competitions/{competition_id}")
def get_historical_result_competition(
    competition_id: int,
    user: Optional[User] = Depends(get_optional_current_user),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)
    competition = get_result_competition_or_404(competition_id, True, db)
    require_historical_results_access(competition, user)

    return result_competition_details(competition, db)


@app.get("/historical-results/competitions/{competition_id}/categories/{category_id}")
def get_historical_result_category(
    competition_id: int,
    category_id: str,
    user: Optional[User] = Depends(get_optional_current_user),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)
    competition = get_result_competition_or_404(competition_id, True, db)
    require_historical_results_access(competition, user)

    return result_category_payload(competition, category_id, db)


@app.get("/competitions/{competition_id}/my-entry")
def get_my_competition_entry(
    competition_id: int,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    shooter_participant = (
        db.query(CompetitionParticipant)
        .filter(
            CompetitionParticipant.competition_id == competition_id,
            CompetitionParticipant.user_email == user.email,
            or_(
                CompetitionParticipant.entry_type == "shooter",
                CompetitionParticipant.entry_type.is_(None),
            ),
        )
        .first()
    )

    if shooter_participant:
        return {
            "entry_type": "shooter",
            "is_head_judge": False,
        }

    judge_participant = (
        db.query(CompetitionParticipant)
        .filter(
            CompetitionParticipant.competition_id == competition_id,
            CompetitionParticipant.user_email == user.email,
            CompetitionParticipant.entry_type == "judge",
        )
        .first()
    )

    if judge_participant:
        return {
            "entry_type": "judge",
            "is_head_judge": bool(judge_participant.is_head_judge),
        }

    return {
        "entry_type": "",
    }


@app.post("/ad-events")
def create_ad_event(
    data: AdEventData,
    db=Depends(get_db),
):
    slot, device, event_type = validate_ad_event(data)
    record_ad_event(slot, device, event_type, db)

    return {
        "status": "ok",
    }


@app.get("/settings/results-table")
def get_public_results_table_settings(db=Depends(get_db)):
    return get_results_table_settings(db)


@app.get("/settings/ui")
def get_public_ui_settings(db=Depends(get_db)):
    return get_ui_settings(db)


@app.get("/settings/profile")
def get_public_profile_settings(db=Depends(get_db)):
    return get_profile_settings(db)


@app.get("/settings/premium")
def get_public_premium_settings(db=Depends(get_db)):
    return get_premium_settings(db)


@app.get("/admin/settings/results-table")
def get_admin_results_table_settings(
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    return get_results_table_settings(db)


@app.get("/admin/settings/ui")
def get_admin_ui_settings(
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    return get_ui_settings(db)


@app.get("/admin/settings/profile")
def get_admin_profile_settings(
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    return get_profile_settings(db)


@app.get("/admin/settings/premium")
def get_admin_premium_settings(
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    return get_premium_settings(db)


@app.get("/admin/settings/activation-email")
def get_admin_activation_email_template(
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    return get_activation_email_template(db)


@app.get("/admin/monitoring")
def get_admin_monitoring(
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    return system_status(db)


@app.get("/admin/ad-report")
def get_admin_ad_report(
    days: int = 30,
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    return ad_report(days, db)


@app.get("/admin/ad-report.pdf")
def download_admin_ad_report_pdf(
    days: int = 30,
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    report = ad_report(days, db)
    pdf_bytes = build_ad_report_pdf(report)
    filename = f"raport-reklam-{report['days']}-dni.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@app.put("/admin/settings/results-table")
def update_admin_results_table_settings(
    data: ResultsTableSettingsData,
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    settings = validate_results_table_settings(data)

    for key, value in settings.items():
        set_setting_value(key, value, db)

    db.commit()

    return get_results_table_settings(db)


@app.put("/admin/settings/ui")
def update_admin_ui_settings(
    data: UiSettingsData,
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    settings = validate_ui_settings(data)

    for key, value in settings.items():
        set_setting_value(key, value, db)

    db.commit()

    return get_ui_settings(db)


@app.put("/admin/settings/profile")
def update_admin_profile_settings(
    data: ProfileSettingsData,
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    settings = validate_profile_settings(data)

    for key, value in settings.items():
        set_setting_value(key, value, db)

    db.commit()

    return get_profile_settings(db)


@app.put("/admin/settings/premium")
def update_admin_premium_settings(
    data: PremiumSettingsData,
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    premium_settings = validate_premium_settings(data)
    set_setting_value(
        PREMIUM_SETTINGS_KEY,
        json.dumps(premium_settings, ensure_ascii=False),
        db,
    )
    db.commit()

    return get_premium_settings(db)


@app.put("/admin/settings/activation-email")
def update_admin_activation_email_template(
    data: ActivationEmailTemplateData,
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    template = validate_activation_email_template(data)
    set_setting_value(
        ACTIVATION_EMAIL_SETTING_KEY,
        json.dumps(template, ensure_ascii=False),
        db,
    )
    db.commit()
    return template


@app.post("/admin/settings/activation-email/assets")
def upload_admin_activation_email_asset(
    file: UploadFile = File(...),
    admin: User = Depends(get_current_admin),
):
    return save_email_asset(file)


@app.post("/admin/settings/activation-email/test")
def send_admin_activation_email_test(
    data: ActivationEmailTemplateData,
    admin: User = Depends(get_current_admin),
):
    template = validate_activation_email_template(data)
    test_template = {
        **template,
        "subject": f"[TEST] {template['subject']}",
    }
    test_activation_link = (
        f"{settings.frontend_url}/activate?token=TEST-WIADOMOSCI-AKTYWACYJNEJ"
    )

    try:
        send_activation_email(
            admin.email,
            test_activation_link,
            test_template,
        )
    except (MailConfigurationError, MailDeliveryError) as exc:
        raise HTTPException(
            status_code=503,
            detail="Nie udało się wysłać testowej wiadomości e-mail",
        ) from exc

    return {
        "message": f"Testowa wiadomość została wysłana na {admin.email}",
    }


def public_pzss_club(user: User):
    return {
        "id": user.id,
        "email": user.email,
        "short_name": getattr(user, "pzss_club_short_name", "") or "",
        "full_name": getattr(user, "pzss_club_full_name", "") or "",
        "phone_number": user.phone_number or "",
        "license_number": getattr(user, "pzss_club_license_number", "") or "",
        "status": getattr(user, "pzss_club_status", "") or PZSS_CLUB_PENDING,
        "is_active": bool(user.is_active),
        "created_label": user.email,
    }


@app.get("/pzss-clubs/verified")
def get_verified_pzss_clubs(db=Depends(get_db)):
    clubs = (
        db.query(User)
        .filter(
            User.account_type == PZSS_CLUB_ACCOUNT_TYPE,
            User.pzss_club_status == PZSS_CLUB_APPROVED,
            User.is_active == 1,
        )
        .order_by(User.pzss_club_short_name.asc())
        .all()
    )

    return [public_pzss_club(club) for club in clubs]


@app.get("/admin/pzss-clubs")
def admin_get_pzss_clubs(
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    clubs = (
        db.query(User)
        .filter(User.account_type == PZSS_CLUB_ACCOUNT_TYPE)
        .order_by(User.id.asc())
        .all()
    )

    return [public_pzss_club(club) for club in clubs]


@app.put("/admin/pzss-clubs/{club_id}/approve")
def admin_approve_pzss_club(
    club_id: int,
    data: PzssClubApprovalData,
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    license_number = normalize_text(data.license_number)

    if not license_number:
        raise HTTPException(status_code=400, detail="Podaj numer licencji klubowej PZSS")

    club = (
        db.query(User)
        .filter(
            User.id == club_id,
            User.account_type == PZSS_CLUB_ACCOUNT_TYPE,
        )
        .first()
    )

    if not club:
        raise HTTPException(status_code=404, detail="Klub PZSS nie istnieje")

    duplicate_license = (
        db.query(User)
        .filter(
            User.id != club.id,
            User.account_type == PZSS_CLUB_ACCOUNT_TYPE,
            User.pzss_club_license_number == license_number,
        )
        .first()
    )

    if duplicate_license:
        raise HTTPException(status_code=400, detail="Ten numer licencji klubowej jest już przypisany")

    organizer_name = pzss_club_display_name(club)
    organizer_name_key = normalize_unique_key(organizer_name)
    duplicate_organizer = (
        db.query(User)
        .filter(
            User.id != club.id,
            or_(
                User.organizer_name_key == organizer_name_key,
                func.lower(User.organizer_name) == organizer_name_key,
            ),
        )
        .first()
    )

    if duplicate_organizer:
        raise HTTPException(status_code=400, detail="Nazwa organizatora dla tego klubu jest już zajęta")

    club.pzss_club_license_number = license_number
    club.pzss_club_status = PZSS_CLUB_APPROVED
    club.club = organizer_name
    club.organizer_name = organizer_name
    club.organizer_name_key = organizer_name_key
    set_user_roles(club, get_user_roles(club) + ["organizer"])
    db.commit()
    db.refresh(club)

    return public_pzss_club(club)


@app.put("/admin/pzss-clubs/{club_id}/reject")
def admin_reject_pzss_club(
    club_id: int,
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    club = (
        db.query(User)
        .filter(
            User.id == club_id,
            User.account_type == PZSS_CLUB_ACCOUNT_TYPE,
        )
        .first()
    )

    if not club:
        raise HTTPException(status_code=404, detail="Klub PZSS nie istnieje")

    club.pzss_club_status = PZSS_CLUB_REJECTED
    db.commit()
    db.refresh(club)

    return public_pzss_club(club)


@app.get("/admin/users")
def admin_get_users(
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    users = (
        db.query(User)
        .order_by(User.id.asc())
        .all()
    )

    return [
        public_user(user)
        for user in users
    ]


@app.post("/admin/users")
def admin_create_user(
    data: AdminCreateUserData,
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    email = normalize_text(data.email).lower()
    password = data.password or ""

    if not email or not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(
            status_code=400,
            detail="Podaj poprawny adres e-mail"
        )

    if len(password) < 6:
        raise HTTPException(
            status_code=400,
            detail="Hasło musi mieć minimum 6 znaków"
        )

    existing_user = (
        db.query(User)
        .filter(func.lower(User.email) == email)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Użytkownik z tym adresem e-mail już istnieje"
        )

    user = User(
        email=email,
        hashed_password=pwd_context.hash(password),
        role="user",
        roles="user",
        is_active=1,
        activation_token=None,
        password_reset_token=None,
        password_reset_expires_at=None,
        password_reset_required=0,
        premium_until=premium_end_of_year_iso(),
        premium_disabled=0,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "message": "Konto użytkownika zostało utworzone",
        "user": public_user(user),
    }


@app.get("/admin/users/{user_id}/info")
def admin_get_user_info(
    user_id: int,
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    target_user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not target_user:
        raise HTTPException(
            status_code=404,
            detail="Użytkownik nie istnieje"
        )

    return admin_user_profile_info(target_user)


@app.put("/admin/users/{user_id}/premium-disabled")
def admin_update_user_premium_disabled(
    user_id: int,
    data: UserPremiumDisabledData,
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    target_user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not target_user:
        raise HTTPException(
            status_code=404,
            detail="Użytkownik nie istnieje"
        )

    target_user.premium_disabled = 1 if data.premium_disabled else 0
    db.commit()
    db.refresh(target_user)

    return public_user(target_user)

@app.put("/admin/users/{user_id}/role")
def admin_update_user_role(
    user_id: int,
    data: UserRoleData,
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    requested_roles = data.roles or ([data.role] if data.role else [])

    if any(role not in ALLOWED_ROLES for role in requested_roles):
        raise HTTPException(
            status_code=400,
            detail="Nieprawidłowa rola"
        )

    target_user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not target_user:
        raise HTTPException(
            status_code=404,
            detail="Użytkownik nie istnieje"
        )

    normalized_roles = normalize_roles(requested_roles)

    if target_user.email == admin.email and "admin" not in normalized_roles:
        raise HTTPException(
            status_code=400,
            detail="Nie możesz odebrać sobie roli administratora"
        )

    set_user_roles(target_user, normalized_roles)
    target_user.requested_role = None
    db.commit()
    db.refresh(target_user)

    return public_user(target_user)


@app.put("/admin/users/{user_id}/role-request/approve")
def admin_approve_role_request(
    user_id: int,
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    target_user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not target_user:
        raise HTTPException(
            status_code=404,
            detail="Użytkownik nie istnieje"
        )

    if target_user.requested_role not in ["organizer", "judge"]:
        raise HTTPException(
            status_code=400,
            detail="Ten użytkownik nie ma aktywnej prośby o rolę"
        )

    set_user_roles(
        target_user,
        get_user_roles(target_user) + [target_user.requested_role]
    )
    target_user.requested_role = None
    db.commit()
    db.refresh(target_user)

    return public_user(target_user)


@app.delete("/admin/users/{user_id}/role-request")
def admin_reject_role_request(
    user_id: int,
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    target_user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not target_user:
        raise HTTPException(
            status_code=404,
            detail="Użytkownik nie istnieje"
        )

    target_user.requested_role = None
    db.commit()
    db.refresh(target_user)

    return public_user(target_user)


@app.post("/admin/users/{user_id}/password-reset")
def admin_reset_user_password(
    user_id: int,
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    target_user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not target_user:
        raise HTTPException(
            status_code=404,
            detail="Użytkownik nie istnieje"
        )

    try:
        send_password_reset_for_user(target_user, db)
        db.commit()
        db.refresh(target_user)
    except (MailConfigurationError, MailDeliveryError) as exc:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Nie udało się wysłać e-maila resetowania hasła. Spróbuj ponownie później."
        ) from exc

    return {
        "message": "Link resetowania hasła został wysłany na e-mail użytkownika",
        "user": public_user(target_user),
    }


@app.delete("/admin/users/{user_id}")
def admin_delete_user(
    user_id: int,
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    target_user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not target_user:
        raise HTTPException(
            status_code=404,
            detail="Użytkownik nie istnieje"
        )

    if target_user.email == admin.email:
        raise HTTPException(
            status_code=400,
            detail="Nie możesz usunąć własnego konta administratora"
        )

    delete_user_with_dependencies(target_user, db)

    return {
        "message": "Użytkownik usunięty"
    }


@app.get("/admin/competitions")
def admin_get_competitions(
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)

    competitions = (
        db.query(Competition)
        .all()
    )

    result = []

    for competition in sort_competitions_by_nearest_date(competitions):
        disciplines = (
            db.query(Discipline)
            .filter(Discipline.competition_id == competition.id)
            .all()
        )

        organizer = (
            db.query(User)
            .filter(User.email == competition.created_by)
            .first()
        )

        participants_count = (
            db.query(CompetitionParticipant)
            .filter(
                CompetitionParticipant.competition_id == competition.id,
                CompetitionParticipant.entry_type == "shooter",
            )
            .count()
        )

        result.append({
            "id": competition.id,
            "name": competition.name,
            "date": competition.date,
            "location": competition.location,
            "entry_fee": competition.entry_fee or "",
            "organizer_full_name": competition.organizer_full_name or "",
            "organizer_logo": competition.organizer_logo or "",
            "sponsors": competition.sponsors or "",
            "sponsor_logo": competition.sponsor_logo or "",
            "participant_limit": competition.participant_limit,
            "pzss_license_calendar": bool(getattr(competition, "pzss_license_calendar", 0)),
            "requires_licensed_judge": bool(getattr(competition, "requires_licensed_judge", 1)),
            "participants_count": participants_count,
            "status": competition.status,
            "created_by": competition.created_by,
            "organizer": {
                "email": organizer.email if organizer else competition.created_by,
                "first_name": organizer.first_name if organizer else "",
                "last_name": organizer.last_name if organizer else "",
                "phone_number": organizer.phone_number if organizer else "",
            },
            "disciplines": [
                {
                    "id": discipline.id,
                    "name": discipline.name,
                    "description": discipline.description or "",
                    "scoring_type": discipline.scoring_type,
                    "discipline_type": discipline.discipline_type or "",
                    "discipline_type_label": DISCIPLINE_TYPE_LABELS.get(
                        discipline.discipline_type or "",
                        "",
                    ),
                    "shots_count": discipline.shots_count,
                    "trap_variant": getattr(discipline, "trap_variant", "") or "",
                    "trap_series_count": getattr(discipline, "trap_series_count", 0) or 0,
                    "clay_variant": discipline_clay_variant(discipline),
                    "clay_series_count": discipline_clay_series_count(discipline),
                    "ammo_type": discipline.ammo_type or "",
                    "ammo_price": discipline.ammo_price or "",
                    "clay_price": getattr(discipline, "clay_price", "") or "",
                    "entry_fee": discipline.entry_fee or "",
                }
                for discipline in disciplines
            ],
        })

    return result


@app.delete("/admin/competitions/{competition_id}")
def admin_delete_competition(
    competition_id: int,
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    delete_competition_with_dependencies(competition, db)
    refresh_ranking_and_achievement_entries(db)
    db.commit()

    return {
        "message": "Zawody usunięte przez administratora"
    }


@app.post("/admin/test-data/competition")
def admin_generate_test_competition(
    data: AdminGenerateCompetitionData,
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    if data.status not in TEST_COMPETITION_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Nieprawidłowy status zawodów testowych"
        )

    participants_count = validate_test_count(
        data.participants_count,
        0,
        100,
        "Liczba zawodników"
    )
    disciplines_count = validate_test_count(
        data.disciplines_count,
        1,
        12,
        "Liczba dyscyplin"
    )
    today = datetime.now(APP_TIMEZONE).date()
    competition_date = (
        today + timedelta(days=7)
        if data.status in ["draft", "published"]
        else today
    )
    status_suffix = {
        "draft": "szkic",
        "published": "opublikowane",
        "started": "live",
        "completed": "historyczne",
    }[data.status]
    competition = Competition(
        name=f"TEST Generator {status_suffix} {datetime.now(APP_TIMEZONE).strftime('%Y-%m-%d %H:%M')}",
        date=competition_date.isoformat(),
        location="Strzelnica testowa",
        entry_fee="",
        organizer_full_name="Generator danych testowych",
        organizer_logo="",
        sponsors="",
        sponsor_logo="",
        participant_limit=max(participants_count + 20, 50),
        status=data.status,
        completed_at=(
            (datetime.now(APP_TIMEZONE) - timedelta(hours=25)).isoformat()
            if data.status == "completed"
            else None
        ),
        created_by=admin.email,
    )

    db.add(competition)
    db.flush()

    disciplines = []

    for index in range(disciplines_count):
        template = TEST_DISCIPLINE_TEMPLATES[index % len(TEST_DISCIPLINE_TEMPLATES)]
        discipline = Discipline(
            competition_id=competition.id,
            name=test_discipline_name(template["name"], index),
            description=template["description"],
            scoring_type=template["scoring_type"],
            discipline_type=template["discipline_type"],
            shots_count=template["shots_count"],
            ammo_type=template["ammo_type"],
            ammo_price=template["ammo_price"],
            entry_fee=template["entry_fee"],
        )
        db.add(discipline)
        db.flush()
        disciplines.append(discipline)

    checked_in = data.status in ["started", "completed"]
    paid = data.status in ["started", "completed"]
    used_person_names: set[tuple[str, str]] = set()

    for index in range(participants_count):
        create_test_participant(
            competition,
            disciplines,
            index,
            checked_in,
            paid,
            db,
            used_person_names,
        )

    results_count = 0

    if data.include_results and data.status in ["started", "completed"]:
        results_count = generate_test_results_for_competition(
            competition,
            admin.email,
            True,
            db,
        )

    if competition.status == "completed":
        refresh_ranking_and_achievement_entries(db, (competition,))

    db.commit()
    db.refresh(competition)

    return {
        "message": "Wygenerowano zawody testowe",
        "competition_id": competition.id,
        "participants_count": participants_count,
        "disciplines_count": disciplines_count,
        "results_count": results_count,
    }


@app.post("/admin/test-data/participants")
def admin_generate_test_participants(
    data: AdminGenerateParticipantsData,
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    count = validate_test_count(data.count, 1, 100, "Liczba zawodników")
    competition = (
        db.query(Competition)
        .filter(Competition.id == data.competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    disciplines = (
        db.query(Discipline)
        .filter(Discipline.competition_id == competition.id)
        .all()
    )

    if not disciplines:
        raise HTTPException(
            status_code=400,
            detail="Te zawody nie mają konkurencji"
        )

    existing_count = (
        db.query(CompetitionParticipant)
        .filter(
            CompetitionParticipant.competition_id == competition.id,
            CompetitionParticipant.entry_type == "shooter",
        )
        .count()
    )

    if competition.participant_limit and existing_count + count > competition.participant_limit:
        raise HTTPException(
            status_code=400,
            detail="Limit zawodników zostałby przekroczony"
        )

    used_person_names = {
        (
            (participant.first_name or "").strip().casefold(),
            (participant.last_name or "").strip().casefold(),
        )
        for participant in (
            db.query(CompetitionParticipant)
            .filter(
                CompetitionParticipant.competition_id == competition.id,
                CompetitionParticipant.entry_type == "shooter",
            )
            .all()
        )
        if (participant.first_name or "").strip() or (participant.last_name or "").strip()
    }
    participants = []

    for index in range(existing_count, existing_count + count):
        participants.append(create_test_participant(
            competition,
            disciplines,
            index,
            data.checked_in,
            data.paid,
            db,
            used_person_names,
        ))

    results_count = 0

    if data.include_results:
        if competition.status not in ["started", "completed"]:
            raise HTTPException(
                status_code=400,
                detail="Wyniki można generować po rozpoczęciu zawodów"
            )

        results_count = generate_test_results_for_competition(
            competition,
            admin.email,
            False,
            db,
        )

    if competition.status == "completed":
        refresh_ranking_and_achievement_entries(db, (competition,))

    db.commit()

    return {
        "message": "Wygenerowano zawodników testowych",
        "competition_id": competition.id,
        "participants_count": len(participants),
        "total_participants_count": existing_count + len(participants),
        "results_count": results_count,
    }


@app.post("/admin/test-data/results")
def admin_generate_test_results(
    data: AdminGenerateResultsData,
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    competition = (
        db.query(Competition)
        .filter(Competition.id == data.competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    if competition.status not in ["started", "completed"]:
        raise HTTPException(
            status_code=400,
            detail="Wyniki można generować po rozpoczęciu zawodów"
        )

    results_count = generate_test_results_for_competition(
        competition,
        admin.email,
        data.overwrite,
        db,
    )

    if competition.status == "completed":
        refresh_ranking_and_achievement_entries(db, (competition,))

    db.commit()

    return {
        "message": "Wygenerowano wyniki testowe",
        "competition_id": competition.id,
        "results_count": results_count,
    }


@app.delete("/admin/test-data/competitions/{competition_id}/results")
def admin_reset_test_results(
    competition_id: int,
    admin: User = Depends(get_current_admin),
    db=Depends(get_db),
):
    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    deleted_count = (
        db.query(DisciplineResult)
        .filter(DisciplineResult.competition_id == competition.id)
        .delete(synchronize_session=False)
    )

    if competition.status == "completed":
        refresh_ranking_and_achievement_entries(db, (competition,))

    db.commit()

    return {
        "message": "Wyniki zawodów zostały wyczyszczone",
        "competition_id": competition.id,
        "results_count": deleted_count,
    }


@app.post("/register")
def register(
    data: RegisterData,
    db=Depends(get_db),
):
    validate_registration_consents(data)

    existing_user = (
        db.query(User)
        .filter(User.email == data.email)
        .first()
    )

    if existing_user:
        return {
            "message": "E-mail już istnieje"
        }

    hashed_password = pwd_context.hash(
        data.password
    )

    activation_token = secrets.token_urlsafe(32)

    new_user = User(
        email=data.email,
        hashed_password=hashed_password,
        role="user",
        roles="user",
        is_active=0,
        activation_token=activation_token,
        premium_until=premium_end_of_year_iso(),
    )

    db.add(new_user)

    activation_link = f"{settings.frontend_url}/activate?token={activation_token}"

    try:
        db.flush()
        send_activation_email(
            new_user.email,
            activation_link,
            get_activation_email_template(db),
        )
        db.commit()
        db.refresh(new_user)
    except (MailConfigurationError, MailDeliveryError) as exc:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Nie udało się wysłać e-maila aktywacyjnego. Spróbuj ponownie później."
        ) from exc

    return {
        "message": "Konto utworzone. Sprawdź e-mail i aktywuj konto",
        "email": new_user.email,
    }


@app.post("/register/pzss-club")
def register_pzss_club(
    data: PzssClubRegisterData,
    db=Depends(get_db),
):
    validate_registration_consents(data)

    email = normalize_text(data.email).lower()
    short_name = normalize_text(data.short_name)
    full_name = normalize_text(data.full_name)
    phone_number = normalize_optional_phone_number(data.phone_number)
    password = data.password or ""

    if not email or not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(status_code=400, detail="Podaj poprawny adres e-mail")

    if not short_name:
        raise HTTPException(status_code=400, detail="Podaj nazwę skróconą klubu zgodną z PZSS")

    if not full_name:
        raise HTTPException(status_code=400, detail="Podaj pełną nazwę klubu zgodną z PZSS")

    if not phone_number:
        raise HTTPException(status_code=400, detail="Podaj poprawny numer telefonu do szybkiej weryfikacji")

    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Hasło musi mieć minimum 8 znaków")

    existing_user = (
        db.query(User)
        .filter(func.lower(User.email) == email)
        .first()
    )

    if existing_user:
        return {"message": "E-mail już istnieje"}

    duplicate_club = (
        db.query(User)
        .filter(
            User.account_type == PZSS_CLUB_ACCOUNT_TYPE,
            func.lower(User.pzss_club_short_name) == short_name.lower(),
        )
        .first()
    )

    if duplicate_club:
        raise HTTPException(status_code=400, detail="Klub o tej nazwie skróconej jest już zarejestrowany")

    activation_token = secrets.token_urlsafe(32)
    new_user = User(
        email=email,
        hashed_password=pwd_context.hash(password),
        role="user",
        roles="user",
        is_active=0,
        activation_token=activation_token,
        premium_until=premium_end_of_year_iso(),
        account_type=PZSS_CLUB_ACCOUNT_TYPE,
        pzss_club_short_name=short_name,
        pzss_club_full_name=full_name,
        pzss_club_status=PZSS_CLUB_PENDING,
        phone_number=phone_number,
        club=short_name,
        organizer_name=short_name,
        organizer_name_key=None,
    )

    db.add(new_user)
    activation_link = f"{settings.frontend_url}/activate?token={activation_token}"

    try:
        db.flush()
        send_activation_email(
            new_user.email,
            activation_link,
            get_activation_email_template(db),
        )
        db.commit()
        db.refresh(new_user)
    except (MailConfigurationError, MailDeliveryError) as exc:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Nie udało się wysłać e-maila aktywacyjnego. Spróbuj ponownie później."
        ) from exc

    return {
        "message": "Konto klubu utworzone. Sprawdź e-mail i aktywuj konto",
        "email": new_user.email,
    }


@app.get("/activate")
def activate_account(
    token: str,
    response: Response,
    db=Depends(get_db),
):
    user = (
        db.query(User)
        .filter(User.activation_token == token)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="Nieprawidłowy link aktywacyjny"
        )

    user.is_active = 1
    user.activation_token = None
    db.commit()

    access_token = create_access_token(user)
    refresh_token = create_refresh_token(user)
    set_refresh_token_cookie(response, refresh_token)

    session_data = auth_session_response(user, access_token)

    if is_pzss_club_account(user) and getattr(user, "pzss_club_status", "") != PZSS_CLUB_APPROVED:
        session_data["message"] = (
            "Konto zostało aktywowane. Klub oczekuje na weryfikację przez administratora"
        )
        return session_data

    session_data["message"] = "Konto zostało aktywowane"
    return session_data


@app.post("/login")
def login(
    data: LoginData,
    request: Request,
    response: Response,
    db=Depends(get_db),
):
    email = normalize_text(data.email).lower()
    enforce_login_ip_rate_limit(client_ip_from_request(request), db)
    db.commit()

    user = (
        db.query(User)
        .filter(func.lower(User.email) == email)
        .first()
    )

    if not user:
        enforce_failed_login_email_rate_limit(email, db)
        db.commit()

        return {
            "message": "Nieprawidłowy e-mail lub hasło"
        }

    if not user.is_active:
        return {
            "message": "Konto nie zostało aktywowane"
        }

    valid_password = pwd_context.verify(
        data.password,
        user.hashed_password
    )

    if not valid_password:
        enforce_failed_login_email_rate_limit(email, db)
        db.commit()

        return {
            "message": "Nieprawidłowy e-mail lub hasło"
        }

    if user.password_reset_required and user.password_reset_token:
        return {
            "message": "Hasło wymaga zresetowania. Sprawdź e-mail z linkiem do ustawienia nowego hasła",
        }

    if is_pzss_club_account(user) and getattr(user, "pzss_club_status", "") != PZSS_CLUB_APPROVED:
        return {
            "message": "Konto klubu oczekuje na weryfikację administratora"
        }

    clear_failed_login_email_rate_limit(email, db)
    user.last_seen = datetime.now(timezone.utc).isoformat()
    db.commit()

    access_token = create_access_token(user)
    refresh_token = create_refresh_token(user)
    set_refresh_token_cookie(response, refresh_token)

    return auth_session_response(user, access_token)


@app.post("/refresh")
def refresh_session(
    response: Response,
    refresh_token: Optional[str] = Cookie(
        default=None,
        alias=REFRESH_TOKEN_COOKIE_NAME,
    ),
    db=Depends(get_db),
):
    if not refresh_token:
        raise HTTPException(
            status_code=401,
            detail="Brak aktywnej sesji"
        )

    try:
        payload = decode_auth_token(refresh_token, "refresh")
    except JWTError:
        clear_refresh_token_cookie(response)
        raise HTTPException(
            status_code=401,
            detail="Nieprawidłowa sesja"
        )

    email = payload.get("sub")

    if email is None:
        clear_refresh_token_cookie(response)
        raise HTTPException(
            status_code=401,
            detail="Nieprawidłowa sesja"
        )

    user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if not user or not user.is_active:
        clear_refresh_token_cookie(response)
        raise HTTPException(
            status_code=401,
            detail="Sesja wygasła"
        )

    if is_pzss_club_account(user) and getattr(user, "pzss_club_status", "") != PZSS_CLUB_APPROVED:
        clear_refresh_token_cookie(response)
        raise HTTPException(
            status_code=401,
            detail="Konto klubu oczekuje na weryfikację administratora"
        )

    token_version = getattr(user, "refresh_token_version", 0) or 0

    if payload.get("ver") != token_version:
        clear_refresh_token_cookie(response)
        raise HTTPException(
            status_code=401,
            detail="Sesja wygasła"
        )

    user.last_seen = datetime.now(timezone.utc).isoformat()
    db.commit()

    access_token = create_access_token(user)
    rotated_refresh_token = create_refresh_token(user)
    set_refresh_token_cookie(response, rotated_refresh_token)

    session_data = auth_session_response(user, access_token)
    session_data["message"] = "Sesja odświeżona"

    return session_data


@app.post("/logout")
def logout(response: Response):
    clear_refresh_token_cookie(response)

    return {
        "message": "Wylogowano"
    }


@app.post("/forgot-password")
def forgot_password(
    data: ForgotPasswordData,
    db=Depends(get_db),
):
    user = (
        db.query(User)
        .filter(User.email == data.email)
        .first()
    )

    if not user:
        return {
            "message": "Jeśli konto istnieje, e-mail został wysłany"
        }

    try:
        send_password_reset_for_user(user, db)
        db.commit()
    except (MailConfigurationError, MailDeliveryError) as exc:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Nie udało się wysłać e-maila resetowania hasła. Spróbuj ponownie później."
        ) from exc

    return {
        "message": "Link resetowania hasła został wysłany",
    }


@app.post("/me/password-reset")
def request_my_password_reset(
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    db_user = (
        db.query(User)
        .filter(User.email == user.email)
        .first()
    )

    if not db_user:
        raise HTTPException(
            status_code=404,
            detail="Użytkownik nie istnieje"
        )

    try:
        send_password_reset_for_user(db_user, db)
        db.commit()
    except (MailConfigurationError, MailDeliveryError) as exc:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Nie udało się wysłać e-maila resetowania hasła. Spróbuj ponownie później."
        ) from exc

    return {
        "message": "Link resetowania hasła został wysłany na Twój e-mail",
    }


@app.post("/reset-password")
def reset_password(
    data: ResetPasswordData,
    db=Depends(get_db),
):
    if len(data.password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Hasło musi mieć minimum 8 znaków"
        )

    user = (
        db.query(User)
        .filter(User.password_reset_token == data.token)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="Nieprawidłowy lub wygasły link resetowania hasła"
        )

    if password_reset_token_expired(user):
        clear_password_reset_token(user)
        db.commit()
        raise HTTPException(
            status_code=404,
            detail="Nieprawidłowy lub wygasły link resetowania hasła"
        )

    user.hashed_password = pwd_context.hash(data.password)
    user.refresh_token_version = (getattr(user, "refresh_token_version", 0) or 0) + 1
    clear_password_reset_token(user)
    db.commit()

    return {
        "message": "Hasło zostało zmienione"
    }


@app.post("/competitions")
def create_competition(
    data: CompetitionData,
    user: User = Depends(get_current_organizer),
    db=Depends(get_db),
):
    if data.participant_limit is not None and data.participant_limit <= 0:
        raise HTTPException(
            status_code=400,
            detail="Limit zawodników musi być większy od zera"
        )

    if not has_role(user, "admin") and not normalize_text(user.organizer_name or ""):
        raise HTTPException(
            status_code=400,
            detail="Uzupełnij nazwę organizatora w profilu przed utworzeniem zawodów"
        )

    if data.pzss_license_calendar and not is_approved_pzss_club(user):
        raise HTTPException(
            status_code=403,
            detail="Tę opcję może zaznaczyć tylko zweryfikowany klub PZSS"
        )

    if not is_approved_pzss_club(user) and data.requires_licensed_judge is None:
        raise HTTPException(
            status_code=400,
            detail="Wybierz, czy zawody wymagają licencjonowanego sędziego PZSS"
        )

    requires_licensed_judge = (
        True
        if is_approved_pzss_club(user)
        else bool(data.requires_licensed_judge)
    )

    competition = Competition(
        name=data.name,
        date=data.date,
        location=data.location,
        entry_fee=data.entry_fee,
        organizer_full_name=organizer_display_name(user),
        organizer_logo=data.organizer_logo,
        sponsors=data.sponsors,
        sponsor_logo=data.sponsor_logo,
        participant_limit=data.participant_limit,
        pzss_license_calendar=1 if data.pzss_license_calendar else 0,
        requires_licensed_judge=1 if requires_licensed_judge else 0,
        status="draft",
        created_by=user.email,
    )

    db.add(competition)

    db.commit()

    db.refresh(competition)

    return {
        "message": "Zawody utworzone",
        "competition_id": competition.id,
    }


@app.get("/my-competitions")
def get_my_competitions(
    user: User = Depends(get_current_organizer),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)

    competitions = (
        db.query(Competition)
        .filter(Competition.created_by == user.email)
        .all()
    )
    competition_ids = [competition.id for competition in competitions]
    disciplines_counts = count_disciplines_by_competition(db, competition_ids)
    shooters_counts = count_shooters_by_competition(db, competition_ids)
    judges_counts = count_judges_by_competition(db, competition_ids)
    missing_judges = missing_judge_disciplines_by_competition(db, competition_ids)

    return [
        competition_list_row(
            competition,
            disciplines_count=disciplines_counts.get(competition.id, 0),
            shooters_count=shooters_counts.get(competition.id, 0),
            judges_count=judges_counts.get(competition.id, 0),
            missing_judge_disciplines=missing_judges.get(competition.id, []),
        )
        for competition in sort_competitions_by_date(competitions)
    ]


def organizer_competition_detail_row(competition: Competition, db):
    disciplines = (
        db.query(Discipline)
        .filter(Discipline.competition_id == competition.id)
        .all()
    )
    participants = (
        db.query(CompetitionParticipant)
        .filter(
            CompetitionParticipant.competition_id == competition.id,
            shooter_entry_filter(),
        )
        .all()
    )
    judges = (
        db.query(CompetitionParticipant)
        .filter(
            CompetitionParticipant.competition_id == competition.id,
            CompetitionParticipant.entry_type == "judge",
        )
        .all()
    )
    judge_invitations = (
        db.query(JudgeInvitation)
        .filter(JudgeInvitation.competition_id == competition.id)
        .all()
    )
    discipline_names = {
        discipline.id: discipline.name
        for discipline in disciplines
    }
    judges_by_email = {
        judge.user_email: judge
        for judge in judges
    }
    assigned_discipline_ids = {
        invitation.discipline_id
        for invitation in judge_invitations
        if invitation.discipline_id is not None
    }
    missing_judge_disciplines = [
        discipline.name
        for discipline in disciplines
        if discipline.id not in assigned_discipline_ids
    ]

    return {
        "id": competition.id,
        "name": competition.name,
        "date": competition.date,
        "location": competition.location,
        "entry_fee": competition.entry_fee or "",
        "organizer_full_name": competition.organizer_full_name or "",
        "organizer_logo": competition.organizer_logo or "",
        "sponsors": competition.sponsors or "",
        "sponsor_logo": competition.sponsor_logo or "",
        "participant_limit": competition.participant_limit,
        "pzss_license_calendar": bool(getattr(competition, "pzss_license_calendar", 0)),
        "requires_licensed_judge": bool(getattr(competition, "requires_licensed_judge", 1)),
        "shooters_count": len(participants),
        "judges_count": len(judges),
        "status": competition.status,
        "disciplines_count": len(disciplines),
        "missing_judge_disciplines": missing_judge_disciplines,
        "disciplines": [
            {
                "id": discipline.id,
                "name": discipline.name,
                "description": discipline.description or "",
                "scoring_type": discipline.scoring_type,
                "discipline_type": discipline.discipline_type or "",
                "discipline_type_label": DISCIPLINE_TYPE_LABELS.get(
                    discipline.discipline_type or "",
                    "",
                ),
                "shots_count": discipline.shots_count,
                "trap_variant": getattr(discipline, "trap_variant", "") or "",
                "trap_series_count": getattr(discipline, "trap_series_count", 0) or 0,
                "clay_variant": discipline_clay_variant(discipline),
                "clay_series_count": discipline_clay_series_count(discipline),
                "squad_group_statuses": trap_squad_group_statuses(discipline, db),
                "ammo_type": discipline.ammo_type or "",
                "ammo_price": discipline.ammo_price or "",
                "clay_price": getattr(discipline, "clay_price", "") or "",
                "entry_fee": discipline.entry_fee or "",
            }
            for discipline in disciplines
        ],
        "participants": [
            staff_participant(participant, db)
            for participant in participants
        ],
        "judges": [
            staff_participant(judge, db)
            for judge in judges
        ],
        "judge_invitations": [
            {
                "id": invitation.id,
                "judge_email": invitation.judge_email,
                "discipline_id": invitation.discipline_id,
                "is_head_judge": bool(invitation.is_head_judge),
            }
            for invitation in judge_invitations
        ],
        "judge_assignments": [
            {
                "id": invitation.id,
                "judge_email": invitation.judge_email,
                "discipline_id": invitation.discipline_id,
                "discipline_name": (
                    discipline_names.get(invitation.discipline_id)
                    if invitation.discipline_id
                    else "Całe zawody"
                ),
                "is_head_judge": bool(invitation.is_head_judge),
                "display_name": public_participant(
                    judges_by_email[invitation.judge_email],
                    db,
                    include_private=True,
                )["display_name"],
                "judge_license_number": public_participant(
                    judges_by_email[invitation.judge_email],
                    db,
                    include_private=True,
                )["judge_license_number"],
            }
            for invitation in judge_invitations
            if invitation.judge_email in judges_by_email
        ],
    }


@app.get("/organizer/competitions/{competition_id}")
def get_organizer_competition(
    competition_id: int,
    user: User = Depends(get_current_organizer),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)

    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    if competition.created_by != user.email and not has_role(user, "admin"):
        raise HTTPException(
            status_code=403,
            detail="Nie masz dostępu do tych zawodów"
        )

    return organizer_competition_detail_row(competition, db)


@app.get("/organizer/competitions/{competition_id}/payments")
def get_organizer_competition_payments(
    competition_id: int,
    user: User = Depends(get_current_organizer),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)

    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    if competition.created_by != user.email and not has_role(user, "admin"):
        raise HTTPException(
            status_code=403,
            detail="Nie masz dostępu do rozliczeń tych zawodów"
        )

    participants = (
        db.query(CompetitionParticipant)
        .filter(
            CompetitionParticipant.competition_id == competition.id,
            CompetitionParticipant.entry_type == "shooter",
        )
        .all()
    )
    participant_rows = [
        participant_payment_row(participant, db)
        for participant in participants
    ]
    total_fee = sum(
        (
            parse_price(participant["total_fee"])
            for participant in participant_rows
        ),
        Decimal("0"),
    )
    paid_total = sum(
        (
            parse_price(participant["total_fee"])
            for participant in participant_rows
            if participant["paid"]
        ),
        Decimal("0"),
    )

    return {
        "competition": {
            "id": competition.id,
            "name": competition.name,
            "date": competition.date,
            "location": competition.location,
            "status": competition.status,
        },
        "participants": participant_rows,
        "summary": {
            "participants_count": len(participant_rows),
            "checked_in_count": len([
                participant
                for participant in participant_rows
                if participant["checked_in"]
            ]),
            "paid_count": len([
                participant
                for participant in participant_rows
                if participant["paid"]
            ]),
            "total_fee": format_money(total_fee),
            "paid_total": format_money(paid_total),
            "unpaid_total": format_money(total_fee - paid_total),
        },
    }


@app.get("/organizer/competitions/{competition_id}/results")
def get_organizer_competition_results(
    competition_id: int,
    user: User = Depends(get_current_organizer),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)
    competition = get_organizer_result_competition_or_404(
        competition_id,
        user,
        db,
    )

    return result_competition_details(competition, db)


@app.get("/organizer/competitions/{competition_id}/results/{category_id}")
def get_organizer_competition_result_category(
    competition_id: int,
    category_id: str,
    user: User = Depends(get_current_organizer),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)
    competition = get_organizer_result_competition_or_404(
        competition_id,
        user,
        db,
    )

    return result_category_payload(competition, category_id, db, include_license=True)


@app.get("/organizer/competitions/{competition_id}/results.pdf")
def download_organizer_competition_results_pdf(
    competition_id: int,
    user: User = Depends(get_current_organizer),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)
    competition = get_organizer_result_competition_or_404(
        competition_id,
        user,
        db,
    )

    if competition.status != "completed":
        raise HTTPException(
            status_code=400,
            detail="Komunikat PDF można wygenerować po zakończeniu zawodów"
        )

    pdf_bytes = build_competition_results_pdf(competition, db)
    filename = f"komunikat-wynikow-{competition.id}-{pdf_filename_slug(competition.name)}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@app.put("/organizer/competitions/{competition_id}/participants/{participant_id}/payments")
def update_organizer_participant_payment_status(
    competition_id: int,
    participant_id: int,
    data: ParticipantPaymentStatusData,
    user: User = Depends(get_current_organizer),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)

    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    if competition.created_by != user.email and not has_role(user, "admin"):
        raise HTTPException(
            status_code=403,
            detail="Nie masz dostępu do rozliczeń tych zawodów"
        )

    participant = (
        db.query(CompetitionParticipant)
        .filter(
            CompetitionParticipant.id == participant_id,
            CompetitionParticipant.competition_id == competition.id,
            CompetitionParticipant.entry_type == "shooter",
        )
        .first()
    )

    if not participant:
        raise HTTPException(
            status_code=404,
            detail="Nie znaleziono zawodnika w tych zawodach"
        )

    was_confirmed = is_participant_confirmed(participant)
    now = datetime.now(APP_TIMEZONE).isoformat()

    if data.checked_in is not None:
        participant.checked_in = 1 if data.checked_in else 0
        participant.checked_in_at = now if data.checked_in else None

    if data.paid is not None:
        participant.paid = 1 if data.paid else 0
        participant.paid_at = now if data.paid else None

    sync_participant_squad_groups(
        participant,
        db,
        reset_existing=not was_confirmed and is_participant_confirmed(participant),
    )

    db.commit()
    db.refresh(participant)

    return {
        "message": "Status zawodnika zaktualizowany",
        "participant": participant_payment_row(participant, db),
    }


@app.post("/organizer/competitions/{competition_id}/manual-participants")
def organizer_add_manual_participant(
    competition_id: int,
    data: ManualParticipantData,
    user: User = Depends(get_current_organizer),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)

    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    if competition.created_by != user.email and not has_role(user, "admin"):
        raise HTTPException(
            status_code=403,
            detail="Nie masz dostępu do tych zawodów"
        )

    if competition.status != "started":
        raise HTTPException(
            status_code=400,
            detail="Ręczne dodawanie zawodnika jest dostępne tylko w trakcie zawodów"
        )

    first_name = (data.first_name or "").strip()
    last_name = (data.last_name or "").strip()
    birth_date = normalize_birth_date(data.birth_date)
    license_number = (data.license_number or "").strip()
    club = (data.club or "").strip()

    if not first_name or not last_name or not birth_date or not license_number or not club:
        raise HTTPException(
            status_code=400,
            detail="Uzupełnij imię, nazwisko, datę urodzenia, licencję albo Brak oraz klub albo Brak"
        )

    if not data.disciplines:
        raise HTTPException(
            status_code=400,
            detail="Wybierz minimum jedną konkurencję"
        )

    competition_disciplines = (
        db.query(Discipline)
        .filter(Discipline.competition_id == competition.id)
        .all()
    )
    disciplines_by_id = {
        discipline.id: discipline
        for discipline in competition_disciplines
    }
    allowed_discipline_ids = set(disciplines_by_id.keys())

    for selected_discipline in data.disciplines:
        if selected_discipline.discipline_id not in allowed_discipline_ids:
            raise HTTPException(
                status_code=400,
                detail="Wybrano konkurencję spoza tych zawodów"
            )

        if selected_discipline.ammo_type not in ["own", "club"]:
            raise HTTPException(
                status_code=400,
                detail="Wybierz typ amunicji przy każdej konkurencji"
            )

    if competition.participant_limit:
        current_shooter_count = (
            db.query(CompetitionParticipant)
            .filter(
                CompetitionParticipant.competition_id == competition.id,
                or_(
                    CompetitionParticipant.entry_type == "shooter",
                    CompetitionParticipant.entry_type.is_(None),
                ),
            )
            .count()
        )

        if current_shooter_count >= competition.participant_limit:
            raise HTTPException(
                status_code=400,
                detail="Limit zawodników został osiągnięty"
            )

    now = datetime.now(APP_TIMEZONE).isoformat()
    participant = CompetitionParticipant(
        competition_id=competition.id,
        user_email=f"manual-{uuid4()}@manual.local",
        first_name=first_name,
        last_name=last_name,
        birth_date=birth_date,
        license_number=license_number,
        club=club,
        entry_type="shooter",
        is_head_judge=0,
        total_fee=calculate_total_fee_from_selection(
            competition,
            data.disciplines,
            disciplines_by_id,
        ),
        checked_in=1,
        checked_in_at=now,
        paid=1,
        paid_at=now,
    )

    db.add(participant)
    db.commit()
    db.refresh(participant)

    for selected_discipline in data.disciplines:
        participant_discipline = ParticipantDiscipline(
            participant_id=participant.id,
            discipline_id=selected_discipline.discipline_id,
            ammo_type=selected_discipline.ammo_type,
        )
        assign_squad_group(participant_discipline, db)

        db.add(participant_discipline)

    db.commit()
    db.refresh(participant)

    return {
        "message": "Zawodnik dodany i opłacony",
        "participant": participant_payment_row(participant, db),
    }


@app.put("/organizer/competitions/{competition_id}/squad-groups/{participant_discipline_id}")
def organizer_update_squad_group(
    competition_id: int,
    participant_discipline_id: int,
    data: ParticipantSquadGroupData,
    user: User = Depends(get_current_organizer),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)

    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    if competition.created_by != user.email and not has_role(user, "admin"):
        raise HTTPException(
            status_code=403,
            detail="Nie masz dostępu do tych zawodów"
        )

    if competition.status == "completed":
        raise HTTPException(
            status_code=400,
            detail="Nie można zmieniać grup po zakończeniu zawodów"
        )

    group_number = int(data.group_number or 0)

    if group_number <= 0:
        raise HTTPException(
            status_code=400,
            detail="Podaj prawidłowy numer grupy"
        )

    participant_discipline = (
        db.query(ParticipantDiscipline)
        .join(Discipline, Discipline.id == ParticipantDiscipline.discipline_id)
        .join(CompetitionParticipant, CompetitionParticipant.id == ParticipantDiscipline.participant_id)
        .filter(
            ParticipantDiscipline.id == participant_discipline_id,
            Discipline.competition_id == competition.id,
            Discipline.discipline_type.in_([TRAP_DISCIPLINE_TYPE, SKEET_DISCIPLINE_TYPE]),
            CompetitionParticipant.checked_in == 1,
            CompetitionParticipant.paid == 1,
            or_(
                CompetitionParticipant.entry_type == "shooter",
                CompetitionParticipant.entry_type.is_(None),
            ),
        )
        .first()
    )

    if not participant_discipline:
        raise HTTPException(
            status_code=404,
            detail="Nie znaleziono zawodnika w tej konkurencji"
        )

    current_group_number = int(getattr(participant_discipline, "squad_group_number", 0) or 0)
    current_position = int(getattr(participant_discipline, "squad_position", 0) or 0)
    requested_position = int(data.squad_position or 0)

    if (
        current_group_number == group_number
        and (requested_position <= 0 or requested_position == current_position)
    ):
        return {
            "message": "Grupa zawodnika zaktualizowana",
            "participant_discipline_id": participant_discipline.id,
            "group_number": participant_discipline.squad_group_number,
            "squad_position": participant_discipline.squad_position,
        }

    discipline = (
        db.query(Discipline)
        .filter(Discipline.id == participant_discipline.discipline_id)
        .first()
    )
    if not is_clay_squad_discipline(discipline):
        raise HTTPException(
            status_code=400,
            detail="Grupy startowe są dostępne tylko dla skonfigurowanego Trap lub Skeet"
        )
    squad_group_statuses = trap_squad_group_statuses(discipline, db)
    current_group_status = squad_group_statuses.get(current_group_number)
    target_group_status = squad_group_statuses.get(group_number)

    if trap_squad_group_is_locked(current_group_status):
        raise HTTPException(
            status_code=400,
            detail="Nie można przenosić zawodników z rozpoczętej lub zakończonej grupy"
        )

    if trap_squad_group_is_locked(target_group_status):
        raise HTTPException(
            status_code=400,
            detail="Nie można przenosić zawodników do rozpoczętej lub zakończonej grupy"
        )

    group_count = (
        db.query(ParticipantDiscipline)
        .join(CompetitionParticipant, CompetitionParticipant.id == ParticipantDiscipline.participant_id)
        .filter(
            ParticipantDiscipline.discipline_id == participant_discipline.discipline_id,
            ParticipantDiscipline.squad_group_number == group_number,
            ParticipantDiscipline.id != participant_discipline.id,
            CompetitionParticipant.checked_in == 1,
            CompetitionParticipant.paid == 1,
            or_(
                CompetitionParticipant.entry_type == "shooter",
                CompetitionParticipant.entry_type.is_(None),
            ),
        )
        .count()
    )

    group_size = clay_squad_group_size(discipline)

    if group_count >= group_size:
        raise HTTPException(
            status_code=400,
            detail=f"Ta grupa ma już {group_size} zawodników"
        )

    if 1 <= requested_position <= group_size:
        occupied_assignment = (
            db.query(ParticipantDiscipline)
            .filter(
                ParticipantDiscipline.discipline_id == participant_discipline.discipline_id,
                ParticipantDiscipline.squad_group_number == group_number,
                ParticipantDiscipline.squad_position == requested_position,
                ParticipantDiscipline.id != participant_discipline.id,
            )
            .first()
        )
        if occupied_assignment and current_group_number == group_number:
            occupied_assignment.squad_position = current_position
        elif occupied_assignment:
            requested_position = next_squad_position(
                participant_discipline.discipline_id,
                group_number,
                db,
            )
        participant_discipline.squad_position = requested_position
    else:
        participant_discipline.squad_position = next_squad_position(
            participant_discipline.discipline_id,
            group_number,
            db,
        )
    participant_discipline.squad_group_number = group_number
    db.commit()

    return {
        "message": "Grupa zawodnika zaktualizowana",
        "participant_discipline_id": participant_discipline.id,
        "group_number": participant_discipline.squad_group_number,
        "squad_position": participant_discipline.squad_position,
    }


@app.post("/organizer/competitions/{competition_id}/disciplines/{discipline_id}/squad-groups/randomize")
def organizer_randomize_squad_groups(
    competition_id: int,
    discipline_id: int,
    user: User = Depends(get_current_organizer),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)

    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    if competition.created_by != user.email and not has_role(user, "admin"):
        raise HTTPException(
            status_code=403,
            detail="Nie masz dostępu do tych zawodów"
        )

    if competition.status in ["started", "completed"]:
        raise HTTPException(
            status_code=400,
            detail="Losowanie grup nie jest możliwe po rozpoczęciu zawodów"
        )

    discipline = (
        db.query(Discipline)
        .filter(
            Discipline.id == discipline_id,
            Discipline.competition_id == competition.id,
        )
        .first()
    )

    if not discipline:
        raise HTTPException(
            status_code=404,
            detail="Konkurencja nie istnieje"
        )

    if not is_clay_squad_discipline(discipline):
        raise HTTPException(
            status_code=400,
            detail="Grupy startowe są dostępne tylko dla konkurencji Trap i Skeet"
        )

    unconfirmed_participant_disciplines = (
        db.query(ParticipantDiscipline)
        .join(CompetitionParticipant, CompetitionParticipant.id == ParticipantDiscipline.participant_id)
        .filter(ParticipantDiscipline.discipline_id == discipline.id)
        .filter(
            or_(
                CompetitionParticipant.checked_in != 1,
                CompetitionParticipant.checked_in.is_(None),
                CompetitionParticipant.paid != 1,
                CompetitionParticipant.paid.is_(None),
            )
        )
        .all()
    )

    for participant_discipline in unconfirmed_participant_disciplines:
        participant_discipline.squad_group_number = None
        participant_discipline.squad_position = None

    participant_disciplines = (
        db.query(ParticipantDiscipline)
        .join(CompetitionParticipant, CompetitionParticipant.id == ParticipantDiscipline.participant_id)
        .filter(ParticipantDiscipline.discipline_id == discipline.id)
        .filter(
            CompetitionParticipant.checked_in == 1,
            CompetitionParticipant.paid == 1,
        )
        .filter(
            or_(
                CompetitionParticipant.entry_type == "shooter",
                CompetitionParticipant.entry_type.is_(None),
            )
        )
        .order_by(ParticipantDiscipline.id.asc())
        .all()
    )

    shuffled_participant_disciplines = list(participant_disciplines)
    secrets.SystemRandom().shuffle(shuffled_participant_disciplines)

    group_size = clay_squad_group_size(discipline)

    for index, participant_discipline in enumerate(shuffled_participant_disciplines):
        participant_discipline.squad_group_number = (index // group_size) + 1
        participant_discipline.squad_position = (index % group_size) + 1

    db.commit()

    return {
        "message": "Grupy wylosowane",
        "discipline_id": discipline.id,
    }


@app.delete("/organizer/competitions/{competition_id}/participants/{participant_id}")
def organizer_delete_participant(
    competition_id: int,
    participant_id: int,
    user: User = Depends(get_current_organizer),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)

    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    if competition.created_by != user.email and not has_role(user, "admin"):
        raise HTTPException(
            status_code=403,
            detail="Nie masz dostępu do tych zawodów"
        )

    participant = (
        db.query(CompetitionParticipant)
        .filter(
            CompetitionParticipant.id == participant_id,
            CompetitionParticipant.competition_id == competition.id,
            CompetitionParticipant.entry_type == "shooter",
        )
        .first()
    )

    if not participant:
        raise HTTPException(
            status_code=404,
            detail="Nie znaleziono zawodnika w tych zawodach"
        )

    delete_participant_with_dependencies(participant, db)
    db.commit()

    return {
        "message": "Zawodnik usunięty z listy zawodów",
        "participant_id": participant_id,
    }


@app.get("/judges")
def get_judges(
    user: User = Depends(get_current_organizer),
    db=Depends(get_db),
):
    judges = (
        db.query(User)
        .order_by(User.last_name.asc())
        .all()
    )

    return [
        judge_search_response(judge)
        for judge in judges
        if has_role(judge, "judge")
    ]


@app.get("/organizer/judges/search")
def search_judges(
    query: str = "",
    competition_id: int = 0,
    user: User = Depends(get_current_organizer),
    db=Depends(get_db),
):
    search_value = normalize_unique_key(query)

    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(status_code=404, detail="Zawody nie istnieją")

    if competition.created_by != user.email and not has_role(user, "admin"):
        raise HTTPException(status_code=403, detail="Brak dostępu")

    if not search_value:
        raise HTTPException(
            status_code=400,
            detail="Wpisz numer licencji albo imię i nazwisko sędziego"
        )

    licensed_judge_required = bool(
        getattr(competition, "requires_licensed_judge", 1)
    )
    candidates = [
        candidate
        for candidate in db.query(User).order_by(User.last_name.asc(), User.first_name.asc()).all()
        if candidate.is_active
        and (not licensed_judge_required or has_role(candidate, "judge"))
    ]

    exact_license_matches = [
        candidate
        for candidate in candidates
        if search_value in {
            normalize_unique_key(candidate.judge_license_number or ""),
            normalize_unique_key(getattr(candidate, "judge_license_number_key", "") or ""),
        }
    ]

    if exact_license_matches:
        return [
            judge_search_response(candidate, licensed_judge_required)
            for candidate in exact_license_matches
        ]

    search_parts = search_value.split()
    name_matches = []

    for candidate in candidates:
        name_parts = normalize_unique_key(
            f"{candidate.first_name or ''} {candidate.last_name or ''}"
        ).split()

        if search_parts and all(
            any(name_part.startswith(search_part) for name_part in name_parts)
            for search_part in search_parts
        ):
            name_matches.append(candidate)

    return [
        judge_search_response(candidate, licensed_judge_required)
        for candidate in name_matches[:20]
    ]


@app.post("/competitions/{competition_id}/judge-invitations")
def invite_judge(
    competition_id: int,
    data: JudgeInvitationData,
    user: User = Depends(get_current_organizer),
    db=Depends(get_db),
):
    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    if competition.created_by != user.email and not has_role(user, "admin"):
        raise HTTPException(
            status_code=403,
            detail="Brak dostępu"
        )

    judge = judge_by_license_number(data.judge_license_number, db)

    if not judge and data.judge_email:
        judge = (
            db.query(User)
            .filter(User.email == data.judge_email)
            .first()
        )

    licensed_judge_required = bool(
        getattr(competition, "requires_licensed_judge", 1)
    )

    if (
        not judge
        or not judge.is_active
        or (licensed_judge_required and not has_role(judge, "judge"))
    ):
        raise HTTPException(
            status_code=404,
            detail=(
                "Nie znaleziono licencjonowanego sędziego PZSS"
                if licensed_judge_required
                else "Nie znaleziono użytkownika"
            )
        )

    selected_discipline_ids = (
        []
        if data.is_head_judge
        else list(dict.fromkeys(data.discipline_ids))
    )

    if not data.is_head_judge and not selected_discipline_ids:
        raise HTTPException(
            status_code=400,
            detail="Wybierz konkurencję albo oznacz sędziego jako głównego"
        )

    competition_disciplines = (
        db.query(Discipline)
        .filter(Discipline.competition_id == competition.id)
        .all()
    )
    allowed_discipline_ids = {
        discipline.id
        for discipline in competition_disciplines
    }

    for discipline_id in selected_discipline_ids:
        if discipline_id not in allowed_discipline_ids:
            raise HTTPException(
                status_code=400,
                detail="Wybrano konkurencję spoza tych zawodów"
            )

    participant = (
        db.query(CompetitionParticipant)
        .filter(
            CompetitionParticipant.competition_id == competition.id,
            CompetitionParticipant.user_email == judge.email,
            CompetitionParticipant.entry_type == "judge",
        )
        .first()
    )

    if data.is_head_judge:
        if licensed_judge_required:
            license_class = judge_license_class(judge.judge_license_number or "")

            if license_class is None:
                raise HTTPException(
                    status_code=400,
                    detail="Nie można rozpoznać klasy sędziego z numeru licencji"
                )

            if license_class == 3:
                raise HTTPException(
                    status_code=400,
                    detail="Sędzia klasy III nie może pełnić funkcji sędziego głównego zawodów"
                )

        existing_head_assignment = (
            db.query(JudgeInvitation)
            .filter(
                JudgeInvitation.competition_id == competition.id,
                JudgeInvitation.is_head_judge == 1,
            )
            .first()
        )

        if existing_head_assignment and existing_head_assignment.judge_email != judge.email:
            raise HTTPException(
                status_code=400,
                detail="Sędzia główny jest już przypisany do tych zawodów"
            )

        if participant and participant.is_head_judge:
            raise HTTPException(
                status_code=400,
                detail="Ten sędzia jest już sędzią głównym tych zawodów"
            )
    else:
        if participant and participant.is_head_judge:
            raise HTTPException(
                status_code=400,
                detail="Ten sędzia jest już sędzią głównym tych zawodów"
            )

        existing_discipline_ids = {
            assignment.discipline_id
            for assignment in (
                db.query(JudgeInvitation)
                .filter(
                    JudgeInvitation.competition_id == competition.id,
                    JudgeInvitation.judge_email == judge.email,
                    JudgeInvitation.discipline_id.in_(selected_discipline_ids),
                )
                .all()
            )
        }
        selected_discipline_ids = [
            discipline_id
            for discipline_id in selected_discipline_ids
            if discipline_id not in existing_discipline_ids
        ]

        if not selected_discipline_ids:
            raise HTTPException(
                status_code=400,
                detail="Ten sędzia jest już przypisany do wybranych konkurencji"
            )

    if not participant:
        participant = CompetitionParticipant(
            competition_id=competition.id,
            user_email=judge.email,
            entry_type="judge",
            is_head_judge=0,
            total_fee="0.00",
            checked_in=1,
            checked_in_at=datetime.now(APP_TIMEZONE).isoformat(),
            paid=1,
            paid_at=datetime.now(APP_TIMEZONE).isoformat(),
        )
        db.add(participant)
        db.commit()
        db.refresh(participant)

    if data.is_head_judge:
        (
            db.query(ParticipantDiscipline)
            .filter(ParticipantDiscipline.participant_id == participant.id)
            .delete()
        )
        db.flush()
        (
            db.query(JudgeInvitation)
            .filter(
                JudgeInvitation.competition_id == competition.id,
                JudgeInvitation.judge_email == judge.email,
            )
            .delete()
        )
        participant.is_head_judge = 1
        db.add(JudgeInvitation(
            competition_id=competition.id,
            judge_email=judge.email,
            discipline_id=None,
            is_head_judge=1,
        ))
    else:
        participant.is_head_judge = 0

        for discipline_id in selected_discipline_ids:
            db.add(ParticipantDiscipline(
                participant_id=participant.id,
                discipline_id=discipline_id,
                ammo_type="judge",
            ))
            db.add(JudgeInvitation(
                competition_id=competition.id,
                judge_email=judge.email,
                discipline_id=discipline_id,
                is_head_judge=0,
            ))

    db.commit()

    return {
        "message": "Sędzia został przypisany do zawodów",
        "judge": judge_search_response(judge),
    }


@app.post("/competitions/{competition_id}/judge-invitations/remove")
def remove_judge_assignment(
    competition_id: int,
    data: JudgeAssignmentRemovalData,
    user: User = Depends(get_current_organizer),
    db=Depends(get_db),
):
    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    if competition.created_by != user.email and not has_role(user, "admin"):
        raise HTTPException(
            status_code=403,
            detail="Brak dostępu"
        )

    participant = (
        db.query(CompetitionParticipant)
        .filter(
            CompetitionParticipant.competition_id == competition.id,
            CompetitionParticipant.user_email == data.judge_email,
            CompetitionParticipant.entry_type == "judge",
        )
        .first()
    )

    if not participant:
        raise HTTPException(
            status_code=404,
            detail="Sędzia nie jest zapisany do tych zawodów"
        )

    invitation_query = (
        db.query(JudgeInvitation)
        .filter(
            JudgeInvitation.competition_id == competition.id,
            JudgeInvitation.judge_email == data.judge_email,
        )
    )

    if data.discipline_id is None:
        invitation_query = invitation_query.filter(
            JudgeInvitation.discipline_id.is_(None)
        )
    else:
        invitation_query = invitation_query.filter(
            JudgeInvitation.discipline_id == data.discipline_id
        )

        (
            db.query(ParticipantDiscipline)
            .filter(
                ParticipantDiscipline.participant_id == participant.id,
                ParticipantDiscipline.discipline_id == data.discipline_id,
            )
            .delete()
        )

    removed_count = invitation_query.delete(synchronize_session=False)

    if removed_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Nie znaleziono takiego przypisania sędziego"
        )

    remaining_assignments = (
        db.query(JudgeInvitation)
        .filter(
            JudgeInvitation.competition_id == competition.id,
            JudgeInvitation.judge_email == data.judge_email,
        )
        .all()
    )
    has_head_assignment = any(
        bool(assignment.is_head_judge)
        for assignment in remaining_assignments
    )

    if not has_head_assignment:
        participant.is_head_judge = 0

    if not remaining_assignments:
        delete_participant_with_dependencies(participant, db)

    db.commit()

    return {
        "message": "Przypisanie sędziego usunięte"
    }


@app.get("/judge/competitions")
def get_judge_competitions(
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)

    judge_participants = (
        db.query(CompetitionParticipant)
        .filter(
            CompetitionParticipant.user_email == user.email,
            CompetitionParticipant.entry_type == "judge",
        )
        .all()
    )

    result = []

    for judge_participant in judge_participants:
        competition = (
            db.query(Competition)
            .filter(Competition.id == judge_participant.competition_id)
            .first()
        )

        if not competition or competition.status not in ["published", "started"]:
            continue

        if (
            bool(getattr(competition, "requires_licensed_judge", 1))
            and not has_role(user, "judge")
            and not has_role(user, "admin")
        ):
            continue

        assignments = (
            db.query(JudgeInvitation)
            .filter(
                JudgeInvitation.competition_id == competition.id,
                JudgeInvitation.judge_email == user.email,
            )
            .all()
        )

        if not assignments and not judge_participant.is_head_judge:
            continue

        is_head_judge = bool(judge_participant.is_head_judge) or any(
            bool(assignment.is_head_judge)
            for assignment in assignments
        )
        has_whole_competition_assignment = any(
            assignment.discipline_id is None
            for assignment in assignments
        )
        all_disciplines = (
            db.query(Discipline)
            .filter(Discipline.competition_id == competition.id)
            .all()
        )

        if is_head_judge or has_whole_competition_assignment:
            visible_disciplines = all_disciplines
        else:
            assigned_discipline_ids = {
                assignment.discipline_id
                for assignment in assignments
                if assignment.discipline_id is not None
            }
            visible_disciplines = [
                discipline
                for discipline in all_disciplines
                if discipline.id in assigned_discipline_ids
            ]

        result.append({
            "id": competition.id,
            "name": competition.name,
            "date": competition.date,
            "location": competition.location,
            "organizer_logo": competition.organizer_logo or "",
            "sponsor_logo": competition.sponsor_logo or "",
            "status": competition.status,
            "is_head_judge": is_head_judge,
            "disciplines": [
                {
                    "id": discipline.id,
                    "name": discipline.name,
                    "description": discipline.description or "",
                    "scoring_type": discipline.scoring_type,
                    "discipline_type": discipline.discipline_type or "",
                    "discipline_type_label": DISCIPLINE_TYPE_LABELS.get(
                        discipline.discipline_type or "",
                        "",
                    ),
                    "shots_count": discipline.shots_count,
                    "trap_variant": getattr(discipline, "trap_variant", "") or "",
                    "trap_series_count": getattr(discipline, "trap_series_count", 0) or 0,
                    "clay_variant": discipline_clay_variant(discipline),
                    "clay_series_count": discipline_clay_series_count(discipline),
                    "ammo_type": discipline.ammo_type or "",
                    "ammo_price": discipline.ammo_price or "",
                    "clay_price": getattr(discipline, "clay_price", "") or "",
                    "entry_fee": discipline.entry_fee or "",
                    "shooters_count": discipline_shooters_count(
                        competition.id,
                        discipline.id,
                        db,
                    ),
                }
                for discipline in visible_disciplines
            ],
        })

    return sorted(
        result,
        key=lambda competition: (
            parse_competition_date(competition["date"]) or datetime.max,
            competition["name"].lower(),
            competition["id"],
        ),
    )


@app.get("/judge/competitions/{competition_id}/disciplines/{discipline_id}/shooters")
def get_judge_discipline_shooters(
    competition_id: int,
    discipline_id: int,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)

    if not judge_can_access_discipline(user, competition_id, discipline_id, db):
        raise HTTPException(
            status_code=403,
            detail="Nie masz dostępu do tej konkurencji"
        )

    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition or competition.status not in ["published", "started"]:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie są dostępne dla panelu sędziego"
        )

    discipline = (
        db.query(Discipline)
        .filter(
            Discipline.id == discipline_id,
            Discipline.competition_id == competition_id,
        )
        .first()
    )

    if not discipline:
        raise HTTPException(
            status_code=404,
            detail="Konkurencja nie istnieje"
        )

    participant_disciplines = (
        db.query(ParticipantDiscipline)
        .filter(ParticipantDiscipline.discipline_id == discipline_id)
        .order_by(
            ParticipantDiscipline.squad_group_number.asc(),
            ParticipantDiscipline.id.asc(),
        )
        .all()
    )

    shooters = []
    include_private = can_view_participant_private_fields(user, competition)

    for participant_discipline in participant_disciplines:
        participant = (
            db.query(CompetitionParticipant)
            .filter(
                CompetitionParticipant.id == participant_discipline.participant_id,
                CompetitionParticipant.competition_id == competition_id,
                CompetitionParticipant.entry_type == "shooter",
            )
            .first()
        )

        if not participant:
            continue

        if competition.status == "started" and (not participant.checked_in or not participant.paid):
            continue

        shooter = (
            db.query(User)
            .filter(User.email == participant.user_email)
            .first()
        )
        result = (
            db.query(DisciplineResult)
            .filter(
                DisciplineResult.participant_id == participant.id,
                DisciplineResult.discipline_id == discipline_id,
            )
            .first()
        )

        shooters.append({
            "participant_id": participant.id,
            "user_email": participant.user_email if include_private else "",
            "first_name": participant.first_name or (shooter.first_name if shooter else "") or "",
            "last_name": participant.last_name or (shooter.last_name if shooter else "") or "",
            "license_number": (
                participant.license_number or (shooter.license_number if shooter else "") or ""
            ) if include_private else "",
            "club": participant.club or (shooter.club if shooter else "") or "",
            "points": result.points if result else "",
            "result_data": (getattr(result, "result_data", "") or "") if result else "",
            "squad_group_number": int(getattr(participant_discipline, "squad_group_number", 0) or 0),
            "squad_position": int(getattr(participant_discipline, "squad_position", 0) or 0),
            "sort_email": participant.user_email,
        })

    return {
        "competition_id": competition_id,
        "discipline_id": discipline_id,
        "discipline_name": discipline.name,
        "competition_status": competition.status,
        "shooters": [
            {
                key: value
                for key, value in shooter.items()
                if key != "sort_email"
            }
            for shooter in sorted(
                shooters,
                key=lambda shooter: (
                    shooter["last_name"].lower(),
                    shooter["first_name"].lower(),
                    shooter["sort_email"].lower(),
                )
            )
        ],
    }


@app.put("/judge/competitions/{competition_id}/disciplines/{discipline_id}/results")
def save_judge_result(
    competition_id: int,
    discipline_id: int,
    data: JudgeResultData,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)

    if not judge_can_access_discipline(user, competition_id, discipline_id, db):
        raise HTTPException(
            status_code=403,
            detail="Nie masz dostępu do tej konkurencji"
        )

    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition or competition.status != "started":
        raise HTTPException(
            status_code=400,
            detail="Zawody jeszcze się nie rozpoczęły"
        )

    if not data.points.strip():
        raise HTTPException(
            status_code=400,
            detail="Podaj wynik zawodnika"
        )

    participant = (
        db.query(CompetitionParticipant)
        .filter(
            CompetitionParticipant.id == data.participant_id,
            CompetitionParticipant.competition_id == competition_id,
            CompetitionParticipant.entry_type == "shooter",
        )
        .first()
    )

    if not participant:
        raise HTTPException(
            status_code=404,
            detail="Zawodnik nie jest zapisany do tych zawodów"
        )

    participant_discipline = (
        db.query(ParticipantDiscipline)
        .filter(
            ParticipantDiscipline.participant_id == participant.id,
            ParticipantDiscipline.discipline_id == discipline_id,
        )
        .first()
    )

    if not participant_discipline:
        raise HTTPException(
            status_code=400,
            detail="Zawodnik nie startuje w tej konkurencji"
        )

    discipline = (
        db.query(Discipline)
        .filter(
            Discipline.id == discipline_id,
            Discipline.competition_id == competition_id,
        )
        .first()
    )
    result_points = data.points.strip()

    discipline_type = normalize_discipline_type(
        getattr(discipline, "discipline_type", "") or ""
    )

    if discipline_type in [TRAP_DISCIPLINE_TYPE, SKEET_DISCIPLINE_TYPE]:
        if data.result_data is None:
            raise HTTPException(status_code=400, detail="Brak szczegółowego wyniku rzutkowego")

        if discipline_type == SKEET_DISCIPLINE_TYPE:
            _parsed_result, computed_points = validate_skeet_result_data(
                discipline,
                data.result_data,
            )
        else:
            _parsed_result, computed_points = validate_trap_result_data(
                discipline,
                data.result_data,
            )

        result_points = str(computed_points)

    result = (
        db.query(DisciplineResult)
        .filter(
            DisciplineResult.participant_id == participant.id,
            DisciplineResult.discipline_id == discipline_id,
        )
        .first()
    )

    if not result:
        result = DisciplineResult(
            competition_id=competition_id,
            discipline_id=discipline_id,
            participant_id=participant.id,
            judge_email=user.email,
            points=result_points,
            result_data=data.result_data,
        )
        db.add(result)
    else:
        result.points = result_points
        result.judge_email = user.email
        if data.result_data is not None:
            result.result_data = data.result_data

    db.commit()

    return {
        "message": "Wynik zapisany",
        "points": result.points,
        "result_data": getattr(result, "result_data", "") or "",
    }


@app.post("/competitions/{competition_id}/disciplines")
def create_discipline(
    competition_id: int,
    data: DisciplineData,
    user: User = Depends(get_current_organizer),
    db=Depends(get_db),
):
    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    if competition.created_by != user.email:
        raise HTTPException(
            status_code=403,
            detail="Brak dostępu"
        )

    if competition.status != "draft":
        raise HTTPException(
            status_code=400,
            detail="Konkurencje można dodawać tylko przed publikacją zawodów"
        )

    discipline_type = normalize_discipline_type(data.discipline_type)

    if not discipline_type:
        raise HTTPException(
            status_code=400,
            detail="Wybierz rodzaj konkurencji"
        )

    discipline_payload = normalize_discipline_payload(data, discipline_type)

    if discipline_payload["shots_count"] <= 0:
        raise HTTPException(
            status_code=400,
            detail="Podaj liczbę strzałów"
        )

    discipline = Discipline(
        competition_id=competition.id,
        name=data.name,
        description=data.description,
        scoring_type=data.scoring_type,
        discipline_type=discipline_type,
        shots_count=discipline_payload["shots_count"],
        trap_variant=discipline_payload["trap_variant"],
        trap_series_count=discipline_payload["trap_series_count"],
        clay_variant=discipline_payload["clay_variant"],
        clay_series_count=discipline_payload["clay_series_count"],
        ammo_type=data.ammo_type,
        ammo_price=data.ammo_price,
        clay_price=discipline_payload["clay_price"],
        entry_fee=data.entry_fee,
    )

    db.add(discipline)

    db.commit()

    db.refresh(discipline)

    return {
        "message": "Konkurencja dodana",
        "discipline_id": discipline.id,
    }


@app.put("/competitions/{competition_id}/disciplines/{discipline_id}")
def update_discipline(
    competition_id: int,
    discipline_id: int,
    data: DisciplineData,
    user: User = Depends(get_current_organizer),
    db=Depends(get_db),
):
    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    if competition.created_by != user.email:
        raise HTTPException(
            status_code=403,
            detail="Brak dostępu"
        )

    if competition.status != "draft":
        raise HTTPException(
            status_code=400,
            detail="Konkurencje można edytować tylko przed publikacją zawodów"
        )

    discipline = (
        db.query(Discipline)
        .filter(
            Discipline.id == discipline_id,
            Discipline.competition_id == competition.id,
        )
        .first()
    )

    if not discipline:
        raise HTTPException(
            status_code=404,
            detail="Konkurencja nie istnieje"
        )

    discipline_type = normalize_discipline_type(data.discipline_type)

    if not discipline_type:
        raise HTTPException(
            status_code=400,
            detail="Wybierz rodzaj konkurencji"
        )

    discipline_payload = normalize_discipline_payload(data, discipline_type)

    if discipline_payload["shots_count"] <= 0:
        raise HTTPException(
            status_code=400,
            detail="Podaj liczbę strzałów"
        )

    discipline.name = data.name
    discipline.description = data.description
    discipline.scoring_type = data.scoring_type
    discipline.discipline_type = discipline_type
    discipline.shots_count = discipline_payload["shots_count"]
    discipline.trap_variant = discipline_payload["trap_variant"]
    discipline.trap_series_count = discipline_payload["trap_series_count"]
    discipline.clay_variant = discipline_payload["clay_variant"]
    discipline.clay_series_count = discipline_payload["clay_series_count"]
    discipline.ammo_type = data.ammo_type
    discipline.ammo_price = data.ammo_price
    discipline.clay_price = discipline_payload["clay_price"]
    discipline.entry_fee = data.entry_fee

    db.commit()

    return {
        "message": "Konkurencja zaktualizowana",
        "discipline_id": discipline.id,
    }


@app.delete("/competitions/{competition_id}/disciplines/{discipline_id}")
def delete_discipline(
    competition_id: int,
    discipline_id: int,
    user: User = Depends(get_current_organizer),
    db=Depends(get_db),
):
    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    if competition.created_by != user.email:
        raise HTTPException(
            status_code=403,
            detail="Brak dostępu"
        )

    if competition.status != "draft":
        raise HTTPException(
            status_code=400,
            detail="Konkurencje można usuwać tylko przed publikacją zawodów"
        )

    discipline = (
        db.query(Discipline)
        .filter(
            Discipline.id == discipline_id,
            Discipline.competition_id == competition.id,
        )
        .first()
    )

    if not discipline:
        raise HTTPException(
            status_code=404,
            detail="Konkurencja nie istnieje"
        )

    (
        db.query(DisciplineResult)
        .filter(DisciplineResult.discipline_id == discipline.id)
        .delete(synchronize_session=False)
    )
    (
        db.query(ParticipantDiscipline)
        .filter(ParticipantDiscipline.discipline_id == discipline.id)
        .delete(synchronize_session=False)
    )
    (
        db.query(JudgeInvitation)
        .filter(JudgeInvitation.discipline_id == discipline.id)
        .delete(synchronize_session=False)
    )

    db.delete(discipline)
    db.commit()

    return {
        "message": "Konkurencja usunięta",
        "discipline_id": discipline_id,
    }


@app.post("/competitions/{competition_id}/join")
def join_competition(
    competition_id: int,
    data: JoinCompetitionData,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)

    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    if competition.status not in ["published", "started"]:
        raise HTTPException(
            status_code=400,
            detail="Nie można zapisać się na te zawody"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=403,
            detail="Aktywuj konto przed zapisem na zawody"
        )

    if is_pzss_club_account(user):
        raise HTTPException(
            status_code=403,
            detail="Konto klubu PZSS nie może dołączać do zawodów"
        )

    if not is_profile_complete(user):
        raise HTTPException(
            status_code=400,
            detail="Uzupełnij dane konta w profilu, aby dołączyć do zawodów"
        )

    if data.entry_type != "shooter":
        raise HTTPException(
            status_code=400,
            detail="Do zawodów można dołączyć tylko jako strzelec"
        )

    if not data.disciplines:
        raise HTTPException(
            status_code=400,
            detail="Wybierz minimum jedną konkurencję"
        )

    competition_disciplines = (
        db.query(Discipline)
        .filter(Discipline.competition_id == competition.id)
        .all()
    )
    disciplines_by_id = {
        discipline.id: discipline
        for discipline in competition_disciplines
    }
    allowed_discipline_ids = set(disciplines_by_id.keys())

    for selected_discipline in data.disciplines:
        if selected_discipline.discipline_id not in allowed_discipline_ids:
            raise HTTPException(
                status_code=400,
                detail="Wybrano konkurencję spoza tych zawodów"
            )

        if selected_discipline.ammo_type not in ["own", "club"]:
            raise HTTPException(
                status_code=400,
                detail="Nieprawidłowy typ amunicji"
            )

    existing_participant = (
        db.query(CompetitionParticipant)
        .filter(
            CompetitionParticipant.competition_id == competition.id,
            CompetitionParticipant.user_email == user.email,
            or_(
                CompetitionParticipant.entry_type == "shooter",
                CompetitionParticipant.entry_type.is_(None),
            ),
        )
        .first()
    )

    if competition.participant_limit:
        existing_is_shooter = bool(existing_participant)
        current_shooter_count = (
            db.query(CompetitionParticipant)
            .filter(
                CompetitionParticipant.competition_id == competition.id,
                or_(
                    CompetitionParticipant.entry_type == "shooter",
                    CompetitionParticipant.entry_type.is_(None),
                ),
            )
            .count()
        )

        if not existing_is_shooter and current_shooter_count >= competition.participant_limit:
            raise HTTPException(
                status_code=400,
                detail="Limit zawodników został osiągnięty"
            )

    if existing_participant:
        participant = existing_participant
        participant.entry_type = "shooter"
        participant.is_head_judge = 0
        participant.total_fee = calculate_total_fee_from_selection(
            competition,
            data.disciplines,
            disciplines_by_id,
        )

        (
            db.query(ParticipantDiscipline)
            .filter(ParticipantDiscipline.participant_id == participant.id)
            .delete()
        )
    else:
        participant = CompetitionParticipant(
            competition_id=competition.id,
            user_email=user.email,
            entry_type="shooter",
            is_head_judge=0,
            total_fee=calculate_total_fee_from_selection(
                competition,
                data.disciplines,
                disciplines_by_id,
            ),
        )

        db.add(participant)
        db.commit()
        db.refresh(participant)

    for selected_discipline in data.disciplines:
        participant_discipline = ParticipantDiscipline(
            participant_id=participant.id,
            discipline_id=selected_discipline.discipline_id,
            ammo_type=selected_discipline.ammo_type,
        )
        assign_squad_group(participant_discipline, db)

        db.add(participant_discipline)

    db.commit()

    participants = public_shooter_participants(competition, db)
    include_private = can_view_participant_private_fields(user, competition)

    return {
        "message": "Zapisano na zawody",
        "participants": [
            public_participant(participant, db, include_private=include_private)
            for participant in participants
        ],
    }


@app.delete("/competitions/{competition_id}/leave")
def leave_competition(
    competition_id: int,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)

    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    if not can_leave_competition(competition):
        raise HTTPException(
            status_code=400,
            detail="Wypisanie jest możliwe najpóźniej 48 godzin przed zawodami"
        )

    participant = (
        db.query(CompetitionParticipant)
        .filter(
            CompetitionParticipant.competition_id == competition.id,
            CompetitionParticipant.user_email == user.email,
            or_(
                CompetitionParticipant.entry_type == "shooter",
                CompetitionParticipant.entry_type.is_(None),
            ),
        )
        .first()
    )

    if not participant:
        raise HTTPException(
            status_code=404,
            detail="Nie jesteś zapisany na te zawody jako strzelec"
        )

    delete_participant_with_dependencies(participant, db)
    db.commit()

    participants = public_shooter_participants(competition, db)
    include_private = can_view_participant_private_fields(user, competition)

    return {
        "message": "Wypisano z zawodów",
        "participants": [
            public_participant(participant, db, include_private=include_private)
            for participant in participants
        ],
    }


@app.get("/rankings")
def get_rankings(
    metric: str = "overall",
    scope: str = "national",
    voivodeship: str = "",
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    require_active_premium(user)

    if metric not in RANKING_METRICS:
        raise HTTPException(
            status_code=400,
            detail="Nieprawidłowa klasyfikacja rankingu"
        )

    if scope not in ["national", "regional"]:
        raise HTTPException(
            status_code=400,
            detail="Nieprawidłowy zakres rankingu"
        )

    normalized_voivodeship = ""

    if scope == "regional":
        normalized_voivodeship = normalize_voivodeship(voivodeship)

        if not normalized_voivodeship:
            raise HTTPException(
                status_code=400,
                detail="Wybierz województwo rankingu"
            )

    ranking = cached_ranking_rows(metric, db, normalized_voivodeship)

    return {
        "scope": scope,
        "voivodeship": normalized_voivodeship,
        "metric": metric,
        "metric_label": RANKING_METRIC_LABELS[metric],
        "limit": RANKING_LIMIT,
        "minimum_discipline_shooters": MIN_STATISTICS_DISCIPLINE_SHOOTERS,
        "message": ranking["message"],
        "rows": ranking["rows"],
        "updated_at": ranking["updated_at"] or datetime.now(APP_TIMEZONE).isoformat(),
    }


@app.post("/me/profile-photo")
def upload_my_profile_photo(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    db_user = save_profile_photo(file, user, db)

    return private_user_response(
        db_user,
        db,
        "Zdjęcie profilowe zaktualizowane"
    )


@app.delete("/me/profile-photo")
def delete_my_profile_photo(
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    db_user = (
        db.query(User)
        .filter(User.email == user.email)
        .first()
    )

    if not db_user:
        raise HTTPException(
            status_code=404,
            detail="Użytkownik nie istnieje"
        )

    old_photo_url = getattr(db_user, "profile_photo_url", "") or ""
    db_user.profile_photo_url = ""
    db.commit()
    db.refresh(db_user)
    delete_profile_photo_file(old_photo_url)

    return private_user_response(
        db_user,
        db,
        "Zdjęcie profilowe usunięte"
    )


def public_club_member(user: User):
    return {
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name or "",
        "last_name": user.last_name or "",
        "license_number": user.license_number or "",
        "phone_number": user.phone_number or "",
        "club": user.club or "",
        "membership_status": getattr(user, "club_membership_status", "") or CLUB_MEMBERSHIP_PENDING,
    }


@app.get("/me/club-members")
def get_my_club_members(
    club: User = Depends(get_current_pzss_club),
    db=Depends(get_db),
):
    members = (
        db.query(User)
        .filter(User.verified_club_id == club.id)
        .order_by(User.last_name.asc(), User.first_name.asc(), User.email.asc())
        .all()
    )

    return [public_club_member(member) for member in members]


@app.put("/me/club-members/{member_id}/confirm")
def confirm_my_club_member(
    member_id: int,
    club: User = Depends(get_current_pzss_club),
    db=Depends(get_db),
):
    member = (
        db.query(User)
        .filter(
            User.id == member_id,
            User.verified_club_id == club.id,
        )
        .first()
    )

    if not member:
        raise HTTPException(status_code=404, detail="Klubowicz nie istnieje na liście tego klubu")

    member.club_membership_status = CLUB_MEMBERSHIP_CONFIRMED
    member.club = pzss_club_display_name(club)
    db.commit()
    db.refresh(member)

    return public_club_member(member)


@app.delete("/me/club-members/{member_id}")
def remove_my_club_member(
    member_id: int,
    club: User = Depends(get_current_pzss_club),
    db=Depends(get_db),
):
    member = (
        db.query(User)
        .filter(
            User.id == member_id,
            User.verified_club_id == club.id,
        )
        .first()
    )

    if not member:
        raise HTTPException(status_code=404, detail="Klubowicz nie istnieje na liście tego klubu")

    member.verified_club_id = None
    member.club_membership_status = None
    db.commit()

    return {
        "message": "Klubowicz usunięty z listy",
        "member_id": member_id,
    }


@app.get("/me")
def get_me(
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    return private_user_response(user, db)


@app.get("/me/statistics")
def get_my_statistics(
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    require_active_premium(user)

    return user_competition_statistics(user, db)


@app.delete("/me")
def delete_my_account(
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    db_user = (
        db.query(User)
        .filter(User.email == user.email)
        .first()
    )

    if not db_user:
        raise HTTPException(
            status_code=404,
            detail="Użytkownik nie istnieje"
        )

    delete_user_with_dependencies(db_user, db)

    return {
        "message": "Konto zostało usunięte"
    }


def user_profile_response(profile_user: User, current_user: Optional[User], db):
    roles = get_user_roles(profile_user)
    can_view_private = bool(
        current_user
        and (
            current_user.email == profile_user.email
            or has_role(current_user, "admin")
        )
    )

    response = {
        "participant_id": 0,
        "user_id": profile_user.id,
        "first_name": profile_user.first_name or "",
        "last_name": profile_user.last_name or "",
        "club": profile_user.club or "",
        "is_owner": bool(current_user and current_user.email == profile_user.email),
        "can_view_private": can_view_private,
        "email": "",
        "role": "",
        "roles": [],
        "is_active": False,
        "license_number": "",
        "no_license": bool(getattr(profile_user, "no_license", 0)),
        "judge_license_number": "",
        "judge_license_valid_until": "",
        "voivodeship": getattr(profile_user, "voivodeship", "") or "",
        "no_club": bool(getattr(profile_user, "no_club", 0)),
        "birth_date": "",
        "phone_number": "",
        "requested_role": "",
        "profile_complete": is_profile_complete(profile_user),
        "profile_photo_url": getattr(profile_user, "profile_photo_url", "") or "",
        "achievements": user_achievements(profile_user.email, db),
    }

    if can_view_private:
        response.update({
            "email": profile_user.email,
            "role": primary_role(roles),
            "roles": roles,
            "is_active": bool(profile_user.is_active),
            "license_number": profile_user.license_number or "",
            "no_license": bool(getattr(profile_user, "no_license", 0)),
            "judge_license_number": profile_user.judge_license_number or "",
            "judge_license_valid_until": getattr(profile_user, "judge_license_valid_until", "") or "",
            "birth_date": profile_user.birth_date or "",
            "phone_number": profile_user.phone_number or "",
            "requested_role": profile_user.requested_role or "",
        })

    return response


@app.get("/users/{user_id}/profile")
def get_user_profile(
    user_id: int,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db=Depends(get_db),
):
    profile_user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not profile_user:
        raise HTTPException(
            status_code=404,
            detail="Nie znaleziono użytkownika"
        )

    return user_profile_response(profile_user, current_user, db)


@app.get("/participants/{participant_id}/profile")
def get_participant_profile(
    participant_id: int,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db=Depends(get_db),
):
    participant = (
        db.query(CompetitionParticipant)
        .filter(CompetitionParticipant.id == participant_id)
        .first()
    )

    if not participant:
        raise HTTPException(
            status_code=404,
            detail="Nie znaleziono zawodnika"
        )

    participant_user = (
        db.query(User)
        .filter(User.email == participant.user_email)
        .first()
    )
    competition = (
        db.query(Competition)
        .filter(Competition.id == participant.competition_id)
        .first()
    )
    is_owner = bool(
        current_user
        and participant_user
        and current_user.email == participant_user.email
    )
    can_view_participant_private = (
        can_view_participant_private_fields(current_user, competition)
        or is_owner
    )
    can_view_profile_private = bool(
        is_owner
        or (current_user and has_role(current_user, "admin"))
    )
    public_data = public_participant(
        participant,
        db,
        include_private=can_view_participant_private,
    )
    roles = get_user_roles(participant_user) if participant_user else []

    response = {
        "participant_id": participant.id,
        "user_id": participant_user.id if participant_user else 0,
        "first_name": public_data["first_name"],
        "last_name": public_data["last_name"],
        "club": public_data["club"],
        "is_owner": is_owner,
        "can_view_private": can_view_profile_private,
        "email": "",
        "role": "",
        "roles": [],
        "is_active": False,
        "license_number": "",
        "no_license": False,
        "judge_license_number": "",
        "judge_license_valid_until": "",
        "voivodeship": "",
        "no_club": False,
        "birth_date": "",
        "phone_number": "",
        "requested_role": "",
        "profile_complete": False,
        "profile_photo_url": getattr(participant_user, "profile_photo_url", "") or "" if participant_user else "",
        "achievements": user_achievements(participant_user.email, db) if participant_user else [],
    }

    if can_view_participant_private:
        response.update({
            "email": public_data["user_email"],
            "license_number": public_data["license_number"],
            "no_license": bool(getattr(participant_user, "no_license", 0)) if participant_user else False,
            "judge_license_number": public_data["judge_license_number"],
            "judge_license_valid_until": (
                getattr(participant_user, "judge_license_valid_until", "") or ""
            ) if participant_user else "",
        })

    if can_view_profile_private and participant_user:
        response.update({
            "email": participant_user.email,
            "role": primary_role(roles),
            "roles": roles,
            "is_active": bool(participant_user.is_active),
            "license_number": participant_user.license_number or "",
            "no_license": bool(getattr(participant_user, "no_license", 0)),
            "judge_license_number": participant_user.judge_license_number or "",
            "judge_license_valid_until": getattr(participant_user, "judge_license_valid_until", "") or "",
            "voivodeship": getattr(participant_user, "voivodeship", "") or "",
            "no_club": bool(getattr(participant_user, "no_club", 0)),
            "birth_date": participant_user.birth_date or "",
            "phone_number": participant_user.phone_number or "",
            "requested_role": participant_user.requested_role or "",
            "profile_complete": is_profile_complete(participant_user),
        })

    return response


@app.post("/me/role-request")
def request_role_change(
    data: RoleRequestData,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    if data.role not in ["organizer", "judge"]:
        raise HTTPException(
            status_code=400,
            detail="Możesz poprosić tylko o rolę organizatora albo sędziego"
        )

    if not data.confirmed:
        raise HTTPException(
            status_code=400,
            detail="Potwierdź świadomie przyjęcie wybranej roli"
        )

    db_user = (
        db.query(User)
        .filter(User.email == user.email)
        .first()
    )

    if not db_user:
        raise HTTPException(
            status_code=404,
            detail="Użytkownik nie istnieje"
        )

    if not db_user.is_active:
        raise HTTPException(
            status_code=403,
            detail="Aktywuj konto przed zmianą roli"
        )

    if not is_profile_complete(db_user):
        raise HTTPException(
            status_code=400,
            detail="Uzupełnij dane konta w profilu przed dodaniem kolejnej roli"
        )

    if data.role == "organizer":
        organizer_name = normalize_text(data.organizer_name or db_user.organizer_name or "")
        organizer_name_key = normalize_unique_key(organizer_name)
        phone_number = normalize_phone_number(data.phone_number or db_user.phone_number or "")

        if has_role(db_user, "organizer") and db_user.organizer_name_key:
            raise HTTPException(
                status_code=400,
                detail="Masz już rolę organizatora"
            )

        if not phone_number:
            raise HTTPException(
                status_code=400,
                detail="Podaj poprawny numer telefonu dla organizatora"
            )

        if not organizer_name_key:
            raise HTTPException(
                status_code=400,
                detail="Podaj nazwę organizatora"
            )

        duplicate_organizer = (
            db.query(User)
            .filter(
                User.id != db_user.id,
                or_(
                    User.organizer_name_key == organizer_name_key,
                    func.lower(User.organizer_name) == organizer_name_key,
                ),
            )
            .first()
        )

        if duplicate_organizer:
            raise HTTPException(
                status_code=400,
                detail="Ta nazwa organizatora jest już zajęta"
            )

        db_user.phone_number = phone_number
        db_user.organizer_name = organizer_name
        db_user.organizer_name_key = organizer_name_key
        set_user_roles(db_user, get_user_roles(db_user) + ["organizer"])
        db_user.requested_role = None
        db.commit()
        db.refresh(db_user)

        return private_user_response(
            db_user,
            db,
            "Rola organizatora została przyznana"
        )

    judge_license_number = normalize_text(data.judge_license_number)
    judge_license_number_key = normalize_unique_key(judge_license_number)
    judge_license_valid_until = normalize_valid_until_date(
        data.judge_license_valid_until
    )

    if has_role(db_user, "judge") and db_user.judge_license_number_key:
        raise HTTPException(
            status_code=400,
            detail="Masz już rolę sędziego"
        )

    if not judge_license_number_key:
        raise HTTPException(
            status_code=400,
            detail="Podaj numer licencji sędziowskiej"
        )

    if not judge_license_valid_until:
        raise HTTPException(
            status_code=400,
            detail="Podaj poprawną przyszłą datę ważności licencji sędziowskiej"
        )

    duplicate_judge_license = (
        db.query(User)
        .filter(
            User.id != db_user.id,
            or_(
                User.judge_license_number_key == judge_license_number_key,
                func.lower(User.judge_license_number) == judge_license_number_key,
            ),
        )
        .first()
    )

    if duplicate_judge_license:
        raise HTTPException(
            status_code=400,
            detail="Ten numer licencji sędziowskiej jest już używany"
        )

    db_user.judge_license_number = judge_license_number
    db_user.judge_license_number_key = judge_license_number_key
    db_user.judge_license_valid_until = judge_license_valid_until
    set_user_roles(db_user, get_user_roles(db_user) + ["judge"])
    db_user.requested_role = None
    db.commit()
    db.refresh(db_user)

    return private_user_response(
        db_user,
        db,
        "Rola sędziego została przyznana"
    )


@app.put("/me")
def update_me(
    data: ProfileData,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    db_user = (
        db.query(User)
        .filter(User.email == user.email)
        .first()
    )

    if not db_user:
        raise HTTPException(
            status_code=404,
            detail="Użytkownik nie istnieje"
        )

    first_name = normalize_text(data.first_name)
    last_name = normalize_text(data.last_name)
    voivodeship = normalize_voivodeship(data.voivodeship)
    club = normalize_text(data.club)
    license_number = normalize_text(data.license_number)
    license_uuid = normalize_text(data.license_uuid)
    license_club_code = normalize_text(data.license_club_code)
    birth_date = normalize_birth_date(data.birth_date)
    phone_number = normalize_optional_phone_number(data.phone_number)
    no_club = bool(data.no_club)
    no_license = bool(data.no_license)
    organizer_name = normalize_text(data.organizer_name)
    organizer_name_key = normalize_unique_key(organizer_name)
    judge_license_number = normalize_text(data.judge_license_number)
    judge_license_number_key = normalize_unique_key(judge_license_number)
    judge_license_valid_until = normalize_valid_until_date(
        data.judge_license_valid_until
    )

    if not first_name or not last_name:
        raise HTTPException(
            status_code=400,
            detail="Imię i nazwisko są wymagane"
        )

    if not voivodeship:
        raise HTTPException(
            status_code=400,
            detail="Wybierz województwo z listy"
        )

    selected_verified_club = None

    if not no_club and data.verified_club_id:
        selected_verified_club = (
            db.query(User)
            .filter(
                User.id == data.verified_club_id,
                User.account_type == PZSS_CLUB_ACCOUNT_TYPE,
                User.pzss_club_status == PZSS_CLUB_APPROVED,
                User.is_active == 1,
            )
            .first()
        )

        if not selected_verified_club:
            raise HTTPException(
                status_code=400,
                detail="Wybrany zweryfikowany klub PZSS nie istnieje"
            )

        club = pzss_club_display_name(selected_verified_club)
        license_club_code = getattr(selected_verified_club, "pzss_club_license_number", "") or license_club_code

    if not no_club and not club:
        raise HTTPException(
            status_code=400,
            detail="Podaj klub albo zaznacz, że jeszcze go nie posiadasz"
        )

    if not no_license and not license_number:
        raise HTTPException(
            status_code=400,
            detail="Podaj numer licencji zawodniczej albo zaznacz, że jeszcze jej nie posiadasz"
        )

    if not birth_date:
        raise HTTPException(
            status_code=400,
            detail="Podaj poprawną datę urodzenia"
        )

    if data.phone_number.strip() and not phone_number:
        raise HTTPException(
            status_code=400,
            detail="Podaj poprawny numer telefonu albo pozostaw pole puste"
        )

    if has_role(db_user, "organizer") and not phone_number:
        raise HTTPException(
            status_code=400,
            detail="Telefon jest wymagany dla organizatora"
        )

    if has_role(db_user, "organizer"):
        if not organizer_name_key:
            raise HTTPException(
                status_code=400,
                detail="Podaj nazwę organizatora"
            )

        duplicate_organizer = (
            db.query(User)
            .filter(
                User.id != db_user.id,
                or_(
                    User.organizer_name_key == organizer_name_key,
                    func.lower(User.organizer_name) == organizer_name_key,
                ),
            )
            .first()
        )

        if duplicate_organizer:
            raise HTTPException(
                status_code=400,
                detail="Ta nazwa organizatora jest już zajęta"
            )

    if has_role(db_user, "judge"):
        if not judge_license_number_key:
            raise HTTPException(
                status_code=400,
                detail="Podaj numer licencji sędziowskiej"
            )

        if not judge_license_valid_until:
            raise HTTPException(
                status_code=400,
                detail="Podaj poprawną przyszłą datę ważności licencji sędziowskiej"
            )

        duplicate_judge_license = (
            db.query(User)
            .filter(
                User.id != db_user.id,
                or_(
                    User.judge_license_number_key == judge_license_number_key,
                    func.lower(User.judge_license_number) == judge_license_number_key,
                ),
            )
            .first()
        )

        if duplicate_judge_license:
            raise HTTPException(
                status_code=400,
                detail="Ten numer licencji sędziowskiej jest już używany"
            )

    if not license_uuid:
        license_uuid = getattr(db_user, "license_uuid", "") or str(uuid4())

    db_user.first_name = first_name
    db_user.last_name = last_name
    db_user.voivodeship = voivodeship
    previous_verified_club_id = getattr(db_user, "verified_club_id", None)
    previous_membership_status = getattr(db_user, "club_membership_status", "") or ""
    next_verified_club_id = None if no_club else (selected_verified_club.id if selected_verified_club else None)

    db_user.club = "" if no_club else club
    db_user.no_club = 1 if no_club else 0
    db_user.verified_club_id = next_verified_club_id

    if no_club or not selected_verified_club:
        db_user.club_membership_status = None
    elif previous_verified_club_id == next_verified_club_id and previous_membership_status == CLUB_MEMBERSHIP_CONFIRMED:
        db_user.club_membership_status = CLUB_MEMBERSHIP_CONFIRMED
    else:
        db_user.club_membership_status = CLUB_MEMBERSHIP_PENDING

    db_user.license_number = "" if no_license else license_number
    db_user.license_uuid = license_uuid
    db_user.license_club_code = "" if no_club else license_club_code
    db_user.no_license = 1 if no_license else 0
    db_user.birth_date = birth_date
    db_user.phone_number = phone_number

    if has_role(db_user, "organizer"):
        db_user.organizer_name = organizer_name
        db_user.organizer_name_key = organizer_name_key

    if has_role(db_user, "judge"):
        db_user.judge_license_number = judge_license_number
        db_user.judge_license_number_key = judge_license_number_key
        db_user.judge_license_valid_until = judge_license_valid_until

    ensure_shooter_role(db_user)

    db.commit()
    db.refresh(db_user)

    return private_user_response(
        db_user,
        db,
        "Profil zaktualizowany"
    )


@app.delete("/competitions/{competition_id}")
def delete_competition(
    competition_id: int,
    user: User = Depends(get_current_organizer),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)

    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    if competition.created_by != user.email:
        raise HTTPException(
            status_code=403,
            detail="Brak dostępu"
        )

    if competition.status in ["started", "completed"] and not has_role(user, "admin"):
        raise HTTPException(
            status_code=400,
            detail="Nie można usunąć rozpoczętych lub zakończonych zawodów"
        )

    delete_competition_with_dependencies(competition, db)
    refresh_ranking_and_achievement_entries(db)
    db.commit()

    return {
        "message": "Zawody usunięte"
    }


@app.put("/competitions/{competition_id}")
def update_competition(
    competition_id: int,
    data: CompetitionData,
    user: User = Depends(get_current_organizer),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)

    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    if competition.created_by != user.email:
        raise HTTPException(
            status_code=403,
            detail="Brak dostępu"
        )

    if competition.status in ["started", "completed"] and not has_role(user, "admin"):
        raise HTTPException(
            status_code=400,
            detail="Nie można edytować rozpoczętych lub zakończonych zawodów"
        )

    if data.participant_limit is not None and data.participant_limit <= 0:
        raise HTTPException(
            status_code=400,
            detail="Limit zawodników musi być większy od zera"
        )

    if data.pzss_license_calendar and not is_approved_pzss_club(user):
        raise HTTPException(
            status_code=403,
            detail="Tę opcję może zaznaczyć tylko zweryfikowany klub PZSS"
        )

    if not is_approved_pzss_club(user) and data.requires_licensed_judge is None:
        raise HTTPException(
            status_code=400,
            detail="Wybierz, czy zawody wymagają licencjonowanego sędziego PZSS"
        )

    competition.name = data.name
    competition.date = data.date
    competition.location = data.location
    competition.entry_fee = data.entry_fee
    if normalize_text(user.organizer_name or ""):
        competition.organizer_full_name = organizer_display_name(user)

    competition.organizer_logo = data.organizer_logo
    competition.sponsors = data.sponsors
    competition.sponsor_logo = data.sponsor_logo
    competition.participant_limit = data.participant_limit
    competition.pzss_license_calendar = 1 if data.pzss_license_calendar else 0
    competition.requires_licensed_judge = (
        1
        if is_approved_pzss_club(user) or data.requires_licensed_judge
        else 0
    )

    db.commit()

    return {
        "message": "Zawody zaktualizowane",
        "competition_id": competition.id,
        "status": competition.status,
    }


@app.put("/competitions/{competition_id}/publish")
def publish_competition(
    competition_id: int,
    user: User = Depends(get_current_organizer),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)

    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    if competition.created_by != user.email:
        raise HTTPException(
            status_code=403,
            detail="Brak dostępu"
        )

    if competition.status in ["started", "completed"]:
        raise HTTPException(
            status_code=400,
            detail="Nie można publikować rozpoczętych lub zakończonych zawodów"
        )

    disciplines_count = (
        db.query(Discipline)
        .filter(Discipline.competition_id == competition.id)
        .count()
    )

    if disciplines_count == 0:
        raise HTTPException(
            status_code=400,
            detail="Nie dodano żadnej konkurencji."
        )

    require_organizer_publication_slot(user, competition, db)

    competition.status = "published"
    db.commit()

    return {
        "message": "Zawody opublikowane",
        "competition_id": competition.id,
        "status": competition.status,
    }


@app.put("/competitions/{competition_id}/unpublish")
def unpublish_competition(
    competition_id: int,
    user: User = Depends(get_current_organizer),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)

    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    if competition.created_by != user.email:
        raise HTTPException(
            status_code=403,
            detail="Brak dostępu"
        )

    if competition.status in ["started", "completed"]:
        raise HTTPException(
            status_code=400,
            detail="Nie można cofnąć publikacji rozpoczętych lub zakończonych zawodów"
        )

    if competition.status != "published":
        raise HTTPException(
            status_code=400,
            detail="Tylko opublikowane zawody można cofnąć do szkicu"
        )

    participants_count = (
        db.query(CompetitionParticipant)
        .filter(CompetitionParticipant.competition_id == competition.id)
        .count()
    )

    if participants_count > 0:
        raise HTTPException(
            status_code=400,
            detail="Nie można cofnąć publikacji zawodów, do których ktoś już dołączył"
        )

    competition.status = "draft"
    db.commit()

    return {
        "message": "Publikacja zawodów cofnięta",
        "competition_id": competition.id,
        "status": competition.status,
    }


@app.put("/competitions/{competition_id}/start")
def start_competition(
    competition_id: int,
    user: User = Depends(get_current_organizer),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)

    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    if competition.created_by != user.email:
        raise HTTPException(
            status_code=403,
            detail="Brak dostępu"
        )

    if competition.status != "published":
        raise HTTPException(
            status_code=400,
            detail="Rozpocząć można tylko opublikowane zawody"
        )

    if not can_start_competition(competition):
        raise HTTPException(
            status_code=400,
            detail="Zawody można rozpocząć najwcześniej w dniu zawodów"
        )

    validate_judges_assigned_before_start(competition, db)
    validate_trap_squad_groups_before_start(competition, db)

    competition.status = "started"
    db.commit()

    return {
        "message": "Zawody rozpoczęte",
        "competition_id": competition.id,
        "status": competition.status,
    }


@app.put("/competitions/{competition_id}/finish")
def finish_competition(
    competition_id: int,
    user: User = Depends(get_current_organizer),
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)

    competition = (
        db.query(Competition)
        .filter(Competition.id == competition_id)
        .first()
    )

    if not competition:
        raise HTTPException(
            status_code=404,
            detail="Zawody nie istnieją"
        )

    if competition.created_by != user.email:
        raise HTTPException(
            status_code=403,
            detail="Brak dostępu"
        )

    if competition.status != "started":
        raise HTTPException(
            status_code=400,
            detail="Zakończyć można tylko rozpoczęte zawody"
        )

    mark_competition_completed(competition)
    refresh_ranking_and_achievement_entries(db, (competition,))
    db.commit()

    return {
        "message": "Zawody zakończone",
        "competition_id": competition.id,
        "status": competition.status,
    }
