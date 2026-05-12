from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

from database import engine
from database import Base
from database import SessionLocal

from models import User

from passlib.context import CryptContext

from jose import jwt
from datetime import datetime, timedelta


SECRET_KEY = "SUPER_SECRET_KEY"
ALGORITHM = "HS256"

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)


app = FastAPI()

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


@app.get("/")
def root():
    return {"message": "Backend działa poprawnie"}


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

    hashed_password = pwd_context.hash(data.password)

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
        "exp": datetime.utcnow() + timedelta(days=7)
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
    }
class ForgotPasswordData(BaseModel):
    email: str


@app.post("/forgot-password")
def forgot_password(data: ForgotPasswordData):

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