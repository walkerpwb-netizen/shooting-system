from fastapi import FastAPI
from fastapi import Depends, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer

from database import engine
from database import Base
from database import SessionLocal

from models import User, Competition, Discipline

from passlib.context import CryptContext

from jose import jwt
from jose import JWTError

from datetime import datetime, timedelta, timezone


SECRET_KEY = "SUPER_SECRET_KEY"
ALGORITHM = "HS256"

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)

app = FastAPI()

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="login"
)

Base.metadata.create_all(bind=engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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


class CompetitionData(BaseModel):
    name: str
    date: str
    location: str


class DisciplineData(BaseModel):
    name: str
    description: str
    scoring_type: str
    shots_count: int


def get_current_user(
    token: str = Depends(oauth2_scheme)
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

    db = SessionLocal()

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

    return user


def get_current_admin(
    user: User = Depends(get_current_user)
):

    if user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Brak uprawnień administratora"
        )

    return user


def get_current_organizer(
    user: User = Depends(get_current_user)
):

    if user.role not in ["organizer", "admin"]:
        raise HTTPException(
            status_code=403,
            detail="Brak uprawnień organizatora"
        )

    return user


def get_current_judge(
    user: User = Depends(get_current_user)
):

    if user.role not in ["judge", "admin"]:
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
def get_competitions():

    db = SessionLocal()

    competitions = (
        db.query(Competition)
        .filter(Competition.status == "published")
        .all()
    )

    return competitions


@app.post("/register")
def register(data: RegisterData):

    db = SessionLocal()

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

    new_user = User(
        email=data.email,
        hashed_password=hashed_password,
    )

    db.add(new_user)

    db.commit()

    db.refresh(new_user)

    return {
        "message": "Użytkownik zapisany w bazie",
        "email": new_user.email,
    }


@app.post("/login")
def login(data: LoginData):

    db = SessionLocal()

    user = (
        db.query(User)
        .filter(User.email == data.email)
        .first()
    )

    if not user:
        return {
            "message": "Nieprawidłowy email lub hasło"
        }

    valid_password = pwd_context.verify(
        data.password,
        user.hashed_password
    )

    if not valid_password:
        return {
            "message": "Nieprawidłowy email lub hasło"
        }

    payload = {
        "sub": user.email,
        "role": user.role,
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
        "role": user.role,
    }


@app.post("/forgot-password")
def forgot_password(
    data: ForgotPasswordData
):

    db = SessionLocal()

    user = (
        db.query(User)
        .filter(User.email == data.email)
        .first()
    )

    if not user:
        return {
            "message": "Jeśli konto istnieje, email został wysłany"
        }

    return {
        "message": "Link resetowania hasła został wysłany"
    }


@app.post("/competitions")
def create_competition(
    data: CompetitionData,
    user: User = Depends(get_current_organizer)
):

    db = SessionLocal()

    competition = Competition(
        name=data.name,
        date=data.date,
        location=data.location,
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
    user: User = Depends(get_current_organizer)
):

    db = SessionLocal()

    competitions = (
        db.query(Competition)
        .filter(Competition.created_by == user.email)
        .all()
    )

    return competitions


@app.post("/competitions/{competition_id}/disciplines")
def create_discipline(
    competition_id: int,
    data: DisciplineData,
    user: User = Depends(get_current_organizer)
):

    db = SessionLocal()

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

    discipline = Discipline(
        competition_id=competition.id,
        name=data.name,
        description=data.description,
        scoring_type=data.scoring_type,
        shots_count=data.shots_count,
    )

    db.add(discipline)

    db.commit()

    db.refresh(discipline)

    return {
        "message": "Konkurencja dodana",
        "discipline_id": discipline.id,
    }


@app.get("/me")
def get_me(
    user: User = Depends(get_current_user)
):

    return {
        "email": user.email,
        "role": user.role,
    }

@app.delete("/competitions/{competition_id}")
def delete_competition(
    competition_id: int,
    user: User = Depends(get_current_organizer)
):

    db = SessionLocal()

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

    db.delete(competition)

    db.commit()

    return {
        "message": "Zawody usunięte"
    }