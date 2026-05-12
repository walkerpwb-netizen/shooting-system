from fastapi import FastAPI
from fastapi import Depends, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer

from database import engine
from database import Base
from database import SessionLocal

from models import User

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

competitions = [
    {
        "id": 1,
        "name": "rzutki sa OK!",
        "date": "12.06.2026",
        "location": "Nowy Targ",
    },
    {
        "id": 2,
        "name": "Liga Klubowa",
        "date": "28.06.2026",
        "location": "Zakopane",
    },
]


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

    new_competition = {
        "id": len(competitions) + 1,
        "name": data.name,
        "date": data.date,
        "location": data.location,
    }

    competitions.append(new_competition)

    return {
        "message": "Zawody utworzone",
        "competition": new_competition,
        "created_by": user.email,
        "role": user.role,
    }
@app.get("/me")
def get_me(
    user: User = Depends(get_current_user)
):

    return {
        "email": user.email,
        "role": user.role,
    }