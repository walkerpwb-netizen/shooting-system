from fastapi import FastAPI
from fastapi import Depends, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import or_

from database import engine
from database import Base
from database import SessionLocal

from models import (
    AppSetting,
    User,
    Competition,
    Discipline,
    CompetitionParticipant,
    ParticipantDiscipline,
    JudgeInvitation,
    DisciplineResult,
    Achievement,
)

from passlib.context import CryptContext

from jose import jwt
from jose import JWTError

from datetime import datetime, timedelta, timezone, time
from typing import Optional
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import re
import secrets
from uuid import uuid4
from zoneinfo import ZoneInfo


SECRET_KEY = "SUPER_SECRET_KEY"
ALGORITHM = "HS256"
APP_TIMEZONE = ZoneInfo("Europe/Warsaw")
PROFILE_DATE_FORMATS = ("%Y-%m-%d", "%d.%m.%Y", "%d-%m-%Y", "%d/%m/%Y")

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)

app = FastAPI()

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="login"
)
optional_oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="login",
    auto_error=False,
)

Base.metadata.create_all(bind=engine)


def ensure_schema_updates():
    with engine.begin() as connection:
        user_columns = {
            row[1]
            for row in connection.exec_driver_sql("PRAGMA table_info(users)")
        }

        user_column_definitions = {
            "is_active": "INTEGER DEFAULT 1",
            "activation_token": "VARCHAR",
            "first_name": "VARCHAR",
            "last_name": "VARCHAR",
            "license_number": "VARCHAR",
            "judge_license_number": "VARCHAR",
            "club": "VARCHAR",
            "birth_date": "VARCHAR",
            "phone_number": "VARCHAR",
            "last_seen": "VARCHAR",
            "requested_role": "VARCHAR",
            "roles": "VARCHAR",
            "password_reset_token": "VARCHAR",
            "password_reset_required": "INTEGER DEFAULT 0",
        }

        for column_name, column_definition in user_column_definitions.items():
            if column_name not in user_columns:
                connection.exec_driver_sql(
                    f"ALTER TABLE users ADD COLUMN {column_name} {column_definition}"
                )

        connection.exec_driver_sql(
            "UPDATE users SET roles = COALESCE(NULLIF(role, ''), 'user') "
            "WHERE roles IS NULL OR roles = ''"
        )

        competition_columns = {
            row[1]
            for row in connection.exec_driver_sql("PRAGMA table_info(competitions)")
        }

        if "entry_fee" not in competition_columns:
            connection.exec_driver_sql(
                "ALTER TABLE competitions ADD COLUMN entry_fee VARCHAR"
            )

        competition_column_definitions = {
            "organizer_full_name": "VARCHAR",
            "organizer_logo": "VARCHAR",
            "sponsors": "VARCHAR",
            "sponsor_logo": "VARCHAR",
            "participant_limit": "INTEGER",
            "completed_at": "VARCHAR",
        }

        for column_name, column_definition in competition_column_definitions.items():
            if column_name not in competition_columns:
                connection.exec_driver_sql(
                    f"ALTER TABLE competitions ADD COLUMN {column_name} {column_definition}"
                )

        discipline_columns = {
            row[1]
            for row in connection.exec_driver_sql("PRAGMA table_info(disciplines)")
        }

        discipline_column_definitions = {
            "ammo_type": "VARCHAR",
            "ammo_price": "VARCHAR",
            "entry_fee": "VARCHAR",
        }

        for column_name, column_definition in discipline_column_definitions.items():
            if column_name not in discipline_columns:
                connection.exec_driver_sql(
                    f"ALTER TABLE disciplines ADD COLUMN {column_name} {column_definition}"
                )

        connection.exec_driver_sql(
            "UPDATE disciplines SET name = 'Pistolet' "
            "WHERE lower(name) IN ('pistol', 'pistolet')"
        )

        participant_columns = {
            row[1]
            for row in connection.exec_driver_sql(
                "PRAGMA table_info(competition_participants)"
            )
        }

        participant_column_definitions = {
            "first_name": "VARCHAR",
            "last_name": "VARCHAR",
            "license_number": "VARCHAR",
            "club": "VARCHAR",
            "birth_date": "VARCHAR",
            "entry_type": "VARCHAR DEFAULT 'shooter'",
            "is_head_judge": "INTEGER DEFAULT 0",
            "total_fee": "VARCHAR",
            "checked_in": "INTEGER DEFAULT 0",
            "checked_in_at": "VARCHAR",
            "paid": "INTEGER DEFAULT 0",
            "paid_at": "VARCHAR",
        }

        for column_name, column_definition in participant_column_definitions.items():
            if column_name not in participant_columns:
                connection.exec_driver_sql(
                    f"ALTER TABLE competition_participants ADD COLUMN {column_name} {column_definition}"
                )


ensure_schema_updates()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://192.99.43.63",
        "http://192.99.43.63:3000",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.99\.43\.63)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RegisterData(BaseModel):
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


class DisciplineData(BaseModel):
    name: str
    description: str
    scoring_type: str
    shots_count: int
    ammo_type: str
    ammo_price: str
    entry_fee: str = ""


class ProfileData(BaseModel):
    first_name: str
    last_name: str
    license_number: str = ""
    judge_license_number: str = ""
    club: str = ""
    birth_date: str
    phone_number: str = ""


class UserRoleData(BaseModel):
    role: str = ""
    roles: list[str] = []


class RoleRequestData(BaseModel):
    role: str


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
    judge_email: str
    discipline_ids: list[int] = []
    is_head_judge: bool = False


class JudgeAssignmentRemovalData(BaseModel):
    judge_email: str
    discipline_id: Optional[int] = None


class JudgeResultData(BaseModel):
    participant_id: int
    points: str


class ParticipantPaymentStatusData(BaseModel):
    checked_in: Optional[bool] = None
    paid: Optional[bool] = None


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


ALLOWED_ROLES = ["user", "organizer", "judge", "admin"]
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
        "ammo_type": "9mm",
        "ammo_price": "1.20",
        "entry_fee": "25.00",
    },
    {
        "name": "Karabin sportowy TEST",
        "description": "Konkurencja testowa karabinowa",
        "scoring_type": "points",
        "shots_count": 10,
        "ammo_type": ".223",
        "ammo_price": "2.50",
        "entry_fee": "30.00",
    },
    {
        "name": "Strzelba dynamiczna TEST",
        "description": "Konkurencja testowa strzelbowa",
        "scoring_type": "points",
        "shots_count": 8,
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
ACHIEVEMENT_CATEGORY_IDS = ["pistol", "rifle", "shotgun", "overall"]
ACHIEVEMENT_MEDALS = {
    1: "gold",
    2: "silver",
    3: "bronze",
}


def primary_role(roles: list[str]):
    for role in ["admin", "organizer", "judge", "user"]:
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


def is_profile_complete(user: User):
    return all([
        (user.first_name or "").strip(),
        (user.last_name or "").strip(),
        normalize_birth_date(user.birth_date or ""),
        normalize_phone_number(user.phone_number or ""),
    ])


def is_user_online(user: User):
    if not user.last_seen:
        return False

    try:
        last_seen = datetime.fromisoformat(user.last_seen)
    except ValueError:
        return False

    return datetime.now(timezone.utc) - last_seen <= timedelta(minutes=5)


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
        "phone_number": user.phone_number or "",
        "last_seen": user.last_seen or "",
        "requested_role": user.requested_role or "",
        "password_reset_required": bool(user.password_reset_required),
        "status": "online" if is_user_online(user) else "offline",
    }


def create_password_reset_token(user: User):
    token = secrets.token_urlsafe(32)
    user.password_reset_token = token
    user.password_reset_required = 1
    return token


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
    db.commit()


def validate_test_count(value: int, minimum: int, maximum: int, label: str):
    if value < minimum or value > maximum:
        raise HTTPException(
            status_code=400,
            detail=f"{label} musi być od {minimum} do {maximum}"
        )

    return value


def test_person_data(competition_id: int, index: int):
    first_name = TEST_FIRST_NAMES[index % len(TEST_FIRST_NAMES)]
    last_name = TEST_LAST_NAMES[(index * 3) % len(TEST_LAST_NAMES)]
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
):
    selected_disciplines = test_participant_disciplines(disciplines, index)
    disciplines_by_id = {
        discipline.id: discipline
        for discipline in disciplines
    }
    person = test_person_data(competition.id, index)
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
    max_points = Decimal(discipline.shots_count or 10) * Decimal("10")
    spread = Decimal((participant.id * 7 + discipline.id * 11) % 32)
    bonus = Decimal((participant.id + discipline.id) % 10) / Decimal("10")
    points = max_points - spread + bonus

    if points < 0:
        points = Decimal("0")

    return format_points(points)


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


def public_participant(participant: CompetitionParticipant, db):
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
    display_name = participant.user_email

    if first_name and last_name:
        display_name = f"{last_name} {first_name}"

        if club:
            display_name = f"{display_name} - {club}"

    return {
        "id": participant.id,
        "user_email": participant.user_email,
        "entry_type": participant.entry_type or "shooter",
        "total_fee": participant.total_fee or calculate_participant_total_fee(participant, db),
        "first_name": first_name,
        "last_name": last_name,
        "license_number": license_number,
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
    public_data = public_participant(participant, db)
    public_data["is_head_judge"] = bool(participant.is_head_judge)
    public_data["checked_in"] = bool(participant.checked_in)
    public_data["paid"] = bool(participant.paid)
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
        **public_participant(participant, db),
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


def discipline_firearm_type(discipline: Discipline):
    text = " ".join([
        normalize_search_text(discipline.name),
        normalize_search_text(discipline.description),
        normalize_search_text(discipline.ammo_type),
    ])

    shotgun_keywords = ["strzelba", "shotgun", "trap", "skeet", "12/70", "12/76"]
    rifle_keywords = ["karabin", "rifle", "kbks", "carbine", ".223", ".308"]
    pistol_keywords = ["pistolet", "pistol", "handgun", "9mm", "19mm", ".45"]

    if any(keyword in text for keyword in shotgun_keywords):
        return "shotgun"

    if any(keyword in text for keyword in rifle_keywords):
        return "rifle"

    if any(keyword in text for keyword in pistol_keywords):
        return "pistol"

    return ""


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
        ("pistol", "Suma konkurencji pistoletowych"),
        ("rifle", "Suma konkurencji karabinowych"),
        ("shotgun", "Suma konkurencji strzelby"),
        ("overall", "Ranking ogólny"),
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


def competition_result_summary(competition: Competition, db):
    shooters_count = len(public_shooter_participants(competition, db))

    return {
        "id": competition.id,
        "name": competition.name,
        "date": competition.date,
        "location": competition.location,
        "organizer_full_name": competition.organizer_full_name or competition.created_by,
        "shooters_count": shooters_count,
        "status": competition.status,
        "completed_at": competition.completed_at or "",
    }


def historical_sort_key(competition: Competition):
    completed_at = completed_at_datetime(competition)

    if completed_at:
        return completed_at.timestamp()

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


def result_category_payload(competition: Competition, category_id: str, db):
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

    for result in results:
        points_by_participant.setdefault(result.participant_id, Decimal("0"))
        points_by_participant[result.participant_id] += parse_points(result.points)

    rows = []

    for participant in participants:
        selected_discipline_ids = discipline_ids_by_participant.get(participant.id)

        if not selected_discipline_ids:
            continue

        participant_data = public_participant(participant, db)
        points_value = points_by_participant.get(participant.id, Decimal("0"))

        rows.append({
            "participant_id": participant.id,
            "display_name": participant_result_display_name(participant_data),
            "first_name": participant_data["first_name"],
            "last_name": participant_data["last_name"],
            "license_number": participant_data["license_number"],
            "club": participant_data["club"],
            "points": format_points(points_value),
            "disciplines_count": len(selected_discipline_ids),
        })

    rows.sort(
        key=lambda row: (
            -parse_points(row["points"]),
            row["last_name"].lower(),
            row["first_name"].lower(),
            row["display_name"].lower(),
        )
    )

    for index, row in enumerate(rows, start=1):
        row["place"] = index

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
    shooters_count = len(public_shooter_participants(competition, db))

    (
        db.query(Achievement)
        .filter(Achievement.competition_id == competition.id)
        .delete(synchronize_session=False)
    )

    if competition.status != "completed" or shooters_count <= 50:
        return

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

    for category_id in ACHIEVEMENT_CATEGORY_IDS:
        payload = result_category_payload(competition, category_id, db)
        category = payload["category"]

        if not category["discipline_ids"]:
            continue

        for shooter in payload["shooters"][:3]:
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

    changed = False

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
            award_achievements_for_competition(competition, db)
            changed = True

    if changed:
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


backfill_participant_total_fees()


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db=Depends(get_db),
):

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

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
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )
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


def get_current_judge(
    user: User = Depends(get_current_user)
):

    if not has_role(user, "judge") and not has_role(user, "admin"):
        raise HTTPException(
            status_code=403,
            detail="Brak uprawnień sędziego"
        )

    return user


@app.get("/")
def root():
    return {
        "message": "Backend działa poprawnie"
    }


@app.get("/competitions")
def get_competitions(db=Depends(get_db)):
    auto_complete_started_competitions(db)

    competitions = (
        db.query(Competition)
        .filter(Competition.status.in_(["published", "started", "completed"]))
        .all()
    )

    result = []

    for competition in competitions:
        disciplines_count = (
            db.query(Discipline)
            .filter(Discipline.competition_id == competition.id)
            .count()
        )
        shooters_count = (
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
            "shooters_count": shooters_count,
            "status": competition.status,
            "disciplines_count": disciplines_count,
        })

    return result


@app.get("/competitions/{competition_id}")
def get_competition(
    competition_id: int,
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
        "status": competition.status,
        "disciplines": disciplines,
        "participants": [
            public_participant(participant, db)
            for participant in participants
        ],
    }


@app.get("/live-results/competitions")
def get_live_result_competitions(db=Depends(get_db)):
    auto_complete_started_competitions(db)

    competitions = (
        db.query(Competition)
        .filter(Competition.status.in_(["started", "completed"]))
        .order_by(Competition.id.desc())
        .all()
    )

    return [
        competition_result_summary(competition, db)
        for competition in competitions
        if is_live_results_competition(competition)
    ]


@app.get("/live-results/competitions/{competition_id}")
def get_live_result_competition(
    competition_id: int,
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)
    competition = get_result_competition_or_404(competition_id, False, db)

    return result_competition_details(competition, db)


@app.get("/live-results/competitions/{competition_id}/categories/{category_id}")
def get_live_result_category(
    competition_id: int,
    category_id: str,
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)
    competition = get_result_competition_or_404(competition_id, False, db)

    return result_category_payload(competition, category_id, db)


@app.get("/historical-results/competitions")
def get_historical_result_competitions(db=Depends(get_db)):
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

    return [
        competition_result_summary(competition, db)
        for competition in historical_competitions
    ]


@app.get("/historical-results/competitions/{competition_id}")
def get_historical_result_competition(
    competition_id: int,
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)
    competition = get_result_competition_or_404(competition_id, True, db)

    return result_competition_details(competition, db)


@app.get("/historical-results/competitions/{competition_id}/categories/{category_id}")
def get_historical_result_category(
    competition_id: int,
    category_id: str,
    db=Depends(get_db),
):
    auto_complete_started_competitions(db)
    competition = get_result_competition_or_404(competition_id, True, db)

    return result_category_payload(competition, category_id, db)


@app.get("/competitions/{competition_id}/my-entry")
def get_my_competition_entry(
    competition_id: int,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    participant = (
        db.query(CompetitionParticipant)
        .filter(
            CompetitionParticipant.competition_id == competition_id,
            CompetitionParticipant.user_email == user.email,
        )
        .first()
    )

    if not participant:
        return {
            "entry_type": "",
        }

    return {
        "entry_type": participant.entry_type or "shooter",
        "is_head_judge": bool(participant.is_head_judge),
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

    token = create_password_reset_token(target_user)
    db.commit()
    db.refresh(target_user)

    return {
        "message": "Wygenerowano link resetowania hasła",
        "reset_path": f"/reset-password?token={token}",
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
        .order_by(Competition.id.desc())
        .all()
    )

    result = []

    for competition in competitions:
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
                    "shots_count": discipline.shots_count,
                    "ammo_type": discipline.ammo_type or "",
                    "ammo_price": discipline.ammo_price or "",
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

    for index in range(participants_count):
        create_test_participant(
            competition,
            disciplines,
            index,
            checked_in,
            paid,
            db,
        )

    results_count = 0

    if data.include_results and data.status in ["started", "completed"]:
        results_count = generate_test_results_for_competition(
            competition,
            admin.email,
            True,
            db,
        )

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

    participants = []

    for index in range(existing_count, existing_count + count):
        participants.append(create_test_participant(
            competition,
            disciplines,
            index,
            data.checked_in,
            data.paid,
            db,
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

    db.commit()

    return {
        "message": "Wygenerowano zawodników testowych",
        "competition_id": competition.id,
        "participants_count": len(participants),
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
    existing_user = (
        db.query(User)
        .filter(User.email == data.email)
        .first()
    )

    if existing_user:
        return {
            "message": "Email już istnieje"
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
    )

    db.add(new_user)

    db.commit()

    db.refresh(new_user)

    return {
        "message": "Konto utworzone. Sprawdź email i aktywuj konto",
        "email": new_user.email,
        "activation_link": f"http://localhost:3000/activate?token={activation_token}",
    }


@app.get("/activate")
def activate_account(
    token: str,
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

    return {
        "message": "Konto zostało aktywowane"
    }


@app.post("/login")
def login(
    data: LoginData,
    db=Depends(get_db),
):
    user = (
        db.query(User)
        .filter(User.email == data.email)
        .first()
    )

    if not user:
        return {
            "message": "Nieprawidłowy email lub hasło"
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
        return {
            "message": "Nieprawidłowy email lub hasło"
        }

    if user.password_reset_required and user.password_reset_token:
        return {
            "message": "Hasło wymaga zresetowania",
            "reset_path": f"/reset-password?token={user.password_reset_token}",
        }

    user.last_seen = datetime.now(timezone.utc).isoformat()
    db.commit()

    payload = {
        "sub": user.email,
        "role": primary_role(get_user_roles(user)),
        "roles": get_user_roles(user),
        "exp": datetime.now(timezone.utc)
        + timedelta(days=7)
    }

    token = jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM
    )

    return {
        "message": "Logowanie poprawne",
        "token": token,
        "email": user.email,
        "role": primary_role(get_user_roles(user)),
        "roles": get_user_roles(user),
        "profile_complete": is_profile_complete(user),
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
            "message": "Jeśli konto istnieje, email został wysłany"
        }

    token = create_password_reset_token(user)
    db.commit()

    return {
        "message": "Link resetowania hasła został wysłany",
        "reset_path": f"/reset-password?token={token}",
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

    user.hashed_password = pwd_context.hash(data.password)
    user.password_reset_token = None
    user.password_reset_required = 0
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

    competition = Competition(
        name=data.name,
        date=data.date,
        location=data.location,
        entry_fee=data.entry_fee,
        organizer_full_name=data.organizer_full_name,
        organizer_logo=data.organizer_logo,
        sponsors=data.sponsors,
        sponsor_logo=data.sponsor_logo,
        participant_limit=data.participant_limit,
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

    result = []

    for competition in competitions:

        disciplines = (
            db.query(Discipline)
            .filter(
                Discipline.competition_id == competition.id
            )
            .all()
        )

        participants = (
            db.query(CompetitionParticipant)
            .filter(
                CompetitionParticipant.competition_id == competition.id,
                CompetitionParticipant.entry_type == "shooter",
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
            "status": competition.status,
            "disciplines_count": len(disciplines),
            "disciplines": [
                {
                    "id": discipline.id,
                    "name": discipline.name,
                    "description": discipline.description or "",
                    "scoring_type": discipline.scoring_type,
                    "shots_count": discipline.shots_count,
                    "ammo_type": discipline.ammo_type or "",
                    "ammo_price": discipline.ammo_price or "",
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
                    "display_name": (
                        public_participant(
                            db.query(CompetitionParticipant)
                            .filter(
                                CompetitionParticipant.competition_id == competition.id,
                                CompetitionParticipant.user_email == invitation.judge_email,
                                CompetitionParticipant.entry_type == "judge",
                            )
                            .first(),
                            db,
                        )["display_name"]
                    ),
                }
                for invitation in judge_invitations
                if db.query(CompetitionParticipant)
                .filter(
                    CompetitionParticipant.competition_id == competition.id,
                    CompetitionParticipant.user_email == invitation.judge_email,
                    CompetitionParticipant.entry_type == "judge",
                )
                .first()
            ],
        })

    return result


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

    return result_category_payload(competition, category_id, db)


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

    now = datetime.now(APP_TIMEZONE).isoformat()

    if data.checked_in is not None:
        participant.checked_in = 1 if data.checked_in else 0
        participant.checked_in_at = now if data.checked_in else None

    if data.paid is not None:
        participant.paid = 1 if data.paid else 0
        participant.paid_at = now if data.paid else None

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

        db.add(participant_discipline)

    db.commit()
    db.refresh(participant)

    return {
        "message": "Zawodnik dodany i opłacony",
        "participant": participant_payment_row(participant, db),
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
        public_user(judge)
        for judge in judges
        if has_role(judge, "judge")
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

    if competition.created_by != user.email:
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
            status_code=400,
            detail="Wybrany użytkownik nie dołączył do tych zawodów jako sędzia"
        )

    existing_assignment = (
        db.query(JudgeInvitation)
        .filter(
            JudgeInvitation.competition_id == competition.id,
            JudgeInvitation.judge_email == participant.user_email,
        )
        .first()
    )

    if existing_assignment or participant.is_head_judge:
        raise HTTPException(
            status_code=400,
            detail="Ten sędzia ma już przypisaną funkcję w tych zawodach"
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

    for discipline_id in data.discipline_ids:
        if discipline_id not in allowed_discipline_ids:
            raise HTTPException(
                status_code=400,
                detail="Wybrano konkurencję spoza tych zawodów"
            )

    if data.is_head_judge:
        existing_head_judge = (
            db.query(CompetitionParticipant)
            .filter(
                CompetitionParticipant.competition_id == competition.id,
                CompetitionParticipant.entry_type == "judge",
                CompetitionParticipant.is_head_judge == 1,
            )
            .first()
        )

        if existing_head_judge:
            existing_head_judge.is_head_judge = 0

        (
            db.query(JudgeInvitation)
            .filter(JudgeInvitation.competition_id == competition.id)
            .update(
                {
                    JudgeInvitation.is_head_judge: 0,
                }
            )
        )

    participant.is_head_judge = 1 if data.is_head_judge else 0

    if data.discipline_ids:
        (
            db.query(ParticipantDiscipline)
            .filter(
                ParticipantDiscipline.participant_id == participant.id,
                ParticipantDiscipline.discipline_id.in_(data.discipline_ids),
            )
            .delete(synchronize_session=False)
        )

    for discipline_id in data.discipline_ids:
        participant_discipline = ParticipantDiscipline(
            participant_id=participant.id,
            discipline_id=discipline_id,
            ammo_type="judge",
        )
        db.add(participant_discipline)

    if data.discipline_ids:
        (
            db.query(JudgeInvitation)
            .filter(
                JudgeInvitation.competition_id == competition.id,
                JudgeInvitation.judge_email == participant.user_email,
                JudgeInvitation.discipline_id.in_(data.discipline_ids),
            )
            .delete(synchronize_session=False)
        )

        for discipline_id in data.discipline_ids:
            db.add(JudgeInvitation(
                competition_id=competition.id,
                judge_email=participant.user_email,
                discipline_id=discipline_id,
                is_head_judge=1 if data.is_head_judge else 0,
            ))
    else:
        (
            db.query(JudgeInvitation)
            .filter(
                JudgeInvitation.competition_id == competition.id,
                JudgeInvitation.judge_email == participant.user_email,
                JudgeInvitation.discipline_id.is_(None),
            )
            .delete()
        )

        db.add(JudgeInvitation(
            competition_id=competition.id,
            judge_email=participant.user_email,
            discipline_id=None,
            is_head_judge=1 if data.is_head_judge else 0,
        ))

    db.commit()

    return {
        "message": "Sędzia został przypisany do zawodów"
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

    if competition.created_by != user.email:
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

    has_head_assignment = (
        db.query(JudgeInvitation)
        .filter(
            JudgeInvitation.competition_id == competition.id,
            JudgeInvitation.judge_email == data.judge_email,
            JudgeInvitation.is_head_judge == 1,
        )
        .first()
    )

    if not has_head_assignment:
        participant.is_head_judge = 0

    db.commit()

    return {
        "message": "Przypisanie sędziego usunięte"
    }


@app.get("/judge/competitions")
def get_judge_competitions(
    user: User = Depends(get_current_judge),
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
            "status": competition.status,
            "is_head_judge": is_head_judge,
            "disciplines": [
                {
                    "id": discipline.id,
                    "name": discipline.name,
                    "description": discipline.description or "",
                    "scoring_type": discipline.scoring_type,
                    "shots_count": discipline.shots_count,
                    "ammo_type": discipline.ammo_type or "",
                    "ammo_price": discipline.ammo_price or "",
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

    return result


@app.get("/judge/competitions/{competition_id}/disciplines/{discipline_id}/shooters")
def get_judge_discipline_shooters(
    competition_id: int,
    discipline_id: int,
    user: User = Depends(get_current_judge),
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
        .all()
    )

    shooters = []

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
            "user_email": participant.user_email,
            "first_name": participant.first_name or (shooter.first_name if shooter else "") or "",
            "last_name": participant.last_name or (shooter.last_name if shooter else "") or "",
            "license_number": participant.license_number or (shooter.license_number if shooter else "") or "",
            "club": participant.club or (shooter.club if shooter else "") or "",
            "points": result.points if result else "",
        })

    return {
        "competition_id": competition_id,
        "discipline_id": discipline_id,
        "discipline_name": discipline.name,
        "competition_status": competition.status,
        "shooters": sorted(
            shooters,
            key=lambda shooter: (
                shooter["last_name"].lower(),
                shooter["first_name"].lower(),
                shooter["user_email"].lower(),
            )
        ),
    }


@app.put("/judge/competitions/{competition_id}/disciplines/{discipline_id}/results")
def save_judge_result(
    competition_id: int,
    discipline_id: int,
    data: JudgeResultData,
    user: User = Depends(get_current_judge),
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
            points=data.points.strip(),
        )
        db.add(result)
    else:
        result.points = data.points.strip()
        result.judge_email = user.email

    db.commit()

    return {
        "message": "Wynik zapisany",
        "points": result.points,
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

    discipline = Discipline(
        competition_id=competition.id,
        name=data.name,
        description=data.description,
        scoring_type=data.scoring_type,
        shots_count=data.shots_count,
        ammo_type=data.ammo_type,
        ammo_price=data.ammo_price,
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

    discipline.name = data.name
    discipline.description = data.description
    discipline.scoring_type = data.scoring_type
    discipline.shots_count = data.shots_count
    discipline.ammo_type = data.ammo_type
    discipline.ammo_price = data.ammo_price
    discipline.entry_fee = data.entry_fee

    db.commit()

    return {
        "message": "Konkurencja zaktualizowana",
        "discipline_id": discipline.id,
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

    if not is_profile_complete(user):
        raise HTTPException(
            status_code=400,
            detail="Uzupełnij profil przed zapisem na zawody"
        )

    if data.entry_type not in ["shooter", "judge"]:
        raise HTTPException(
            status_code=400,
            detail="Nieprawidłowy typ zapisu"
        )

    if data.entry_type == "judge" and not has_role(user, "judge"):
        raise HTTPException(
            status_code=403,
            detail="Tylko sędzia może dołączyć do zawodów jako sędzia"
        )

    if data.entry_type == "shooter" and not data.disciplines:
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
        )
        .first()
    )

    if data.entry_type == "shooter" and competition.participant_limit:
        existing_is_shooter = (
            existing_participant
            and (existing_participant.entry_type or "shooter") == "shooter"
        )
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
        participant.entry_type = data.entry_type
        participant.is_head_judge = 0
        participant.total_fee = (
            "0.00"
            if data.entry_type == "judge"
            else calculate_total_fee_from_selection(
                competition,
                data.disciplines,
                disciplines_by_id,
            )
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
            entry_type=data.entry_type,
            is_head_judge=0,
            total_fee=(
                "0.00"
                if data.entry_type == "judge"
                else calculate_total_fee_from_selection(
                    competition,
                    data.disciplines,
                    disciplines_by_id,
                )
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

        db.add(participant_discipline)

    db.commit()

    participants = public_shooter_participants(competition, db)

    return {
        "message": "Zapisano na zawody",
        "participants": [
            public_participant(participant, db)
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
        )
        .first()
    )

    if not participant:
        raise HTTPException(
            status_code=404,
            detail="Nie jesteś zapisany na te zawody"
        )

    delete_participant_with_dependencies(participant, db)
    db.commit()

    participants = public_shooter_participants(competition, db)

    return {
        "message": "Wypisano z zawodów",
        "participants": [
            public_participant(participant, db)
            for participant in participants
        ],
    }


@app.get("/me")
def get_me(
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    roles = get_user_roles(user)

    return {
        "email": user.email,
        "role": primary_role(roles),
        "roles": roles,
        "is_active": bool(user.is_active),
        "first_name": user.first_name or "",
        "last_name": user.last_name or "",
        "license_number": user.license_number or "",
        "judge_license_number": user.judge_license_number or "",
        "club": user.club or "",
        "birth_date": user.birth_date or "",
        "phone_number": user.phone_number or "",
        "requested_role": user.requested_role or "",
        "profile_complete": is_profile_complete(user),
        "achievements": user_achievements(user.email, db),
    }


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
    public_data = public_participant(participant, db)
    is_owner = bool(
        current_user
        and participant_user
        and current_user.email == participant_user.email
    )
    roles = get_user_roles(participant_user) if participant_user else []

    response = {
        "participant_id": participant.id,
        "first_name": public_data["first_name"],
        "last_name": public_data["last_name"],
        "club": public_data["club"],
        "is_owner": is_owner,
        "email": "",
        "role": "",
        "roles": [],
        "is_active": False,
        "license_number": "",
        "judge_license_number": "",
        "birth_date": "",
        "phone_number": "",
        "requested_role": "",
        "profile_complete": False,
        "achievements": user_achievements(participant_user.email, db) if participant_user else [],
    }

    if is_owner and participant_user:
        response.update({
            "email": participant_user.email,
            "role": primary_role(roles),
            "roles": roles,
            "is_active": bool(participant_user.is_active),
            "license_number": participant_user.license_number or "",
            "judge_license_number": participant_user.judge_license_number or "",
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

    if has_role(db_user, data.role):
        raise HTTPException(
            status_code=400,
            detail="Masz już tę rolę"
        )

    db_user.requested_role = data.role
    db.commit()
    db.refresh(db_user)

    return {
        "message": "Prośba została wysłana do administratora",
        "requested_role": db_user.requested_role or "",
    }


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

    first_name = data.first_name.strip()
    last_name = data.last_name.strip()
    birth_date = normalize_birth_date(data.birth_date)
    phone_number = normalize_phone_number(data.phone_number)

    if not all([first_name, last_name, data.birth_date.strip(), data.phone_number.strip()]):
        raise HTTPException(
            status_code=400,
            detail="Imię, nazwisko, data urodzenia i numer telefonu są wymagane"
        )

    if not birth_date:
        raise HTTPException(
            status_code=400,
            detail="Podaj poprawną datę urodzenia"
        )

    if not phone_number:
        raise HTTPException(
            status_code=400,
            detail="Podaj poprawny numer telefonu"
        )

    db_user.first_name = first_name
    db_user.last_name = last_name
    db_user.license_number = data.license_number.strip()
    db_user.judge_license_number = data.judge_license_number.strip()
    db_user.club = data.club.strip()
    db_user.birth_date = birth_date
    db_user.phone_number = phone_number

    db.commit()
    roles = get_user_roles(db_user)

    return {
        "message": "Profil zaktualizowany",
        "email": db_user.email,
        "role": primary_role(roles),
        "roles": roles,
        "is_active": bool(db_user.is_active),
        "first_name": db_user.first_name,
        "last_name": db_user.last_name,
        "license_number": db_user.license_number or "",
        "judge_license_number": db_user.judge_license_number or "",
        "club": db_user.club or "",
        "birth_date": db_user.birth_date,
        "phone_number": db_user.phone_number or "",
        "requested_role": db_user.requested_role or "",
        "profile_complete": is_profile_complete(db_user),
        "achievements": user_achievements(db_user.email, db),
    }

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

    competition.name = data.name
    competition.date = data.date
    competition.location = data.location
    competition.entry_fee = data.entry_fee
    competition.organizer_full_name = data.organizer_full_name
    competition.organizer_logo = data.organizer_logo
    competition.sponsors = data.sponsors
    competition.sponsor_logo = data.sponsor_logo
    competition.participant_limit = data.participant_limit

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
            detail="Dodaj minimum jedną konkurencję przed publikacją"
        )

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
    award_achievements_for_competition(competition, db)
    db.commit()

    return {
        "message": "Zawody zakończone",
        "competition_id": competition.id,
        "status": competition.status,
    }
