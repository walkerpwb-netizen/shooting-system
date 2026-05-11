Kontynuujemy projekt shooting-system.

Poniżej aktualny status projektu:
# SHOOTING SYSTEM — STATUS PROJEKT

## STACK

Frontend:
- Next.js 16
- React
- TypeScript
- TailwindCSS

Backend:
- FastAPI
- SQLAlchemy
- SQLite

---

# STRUKTURA

shooting-system/
├── frontend/
└── backend/

---

# BACKEND

Pliki:
- main.py
- database.py
- models.py
- database.db

Uruchamianie backendu:

```bash
cd backend
source venv/bin/activate
python3 -m uvicorn main:app --reload --host 0.0.0.0
Backend działa na:
http://127.0.0.1:8000
Swagger:
http://127.0.0.1:8000/docs
FRONTEND
Uruchamianie frontendu:
cd frontend
npm run dev
Frontend działa na:
http://localhost:3000
GOTOWE FUNKCJE
Rejestracja użytkownika
Frontend:
formularz register/page.tsx
walidacja email
sprawdzanie zgodności haseł
sprawdzanie siły hasła
komunikaty błędów
loading button
Backend:
endpoint POST /register
zapis użytkownika do SQLite
sprawdzanie czy email istnieje
blokada duplikatów
LOGOWANIE
Backend:
endpoint POST /login
sprawdzanie hasła przez bcrypt/passlib
Frontend:
jeszcze do zrobienia
ODZYSKIWANIE HASŁA
Plan:
formularz "Nie pamiętasz hasła?"
endpoint reset password
token resetujący
wysyłka emaila
WAŻNE PACZKI
Backend:
python3 -m pip install sqlalchemy
python3 -m pip install aiosqlite
python3 -m pip install python-multipart
python3 -m pip install "passlib[bcrypt]"
UWAGI
projekt działa lokalnie
backend i frontend uruchamiane osobno
baza danych: SQLite
hasła mają być hashowane bcryptem
TODO
dokończyć logowanie
zrobić reset hasła
JWT auth
sesja użytkownika
panel użytkownika
tworzenie zawodów
zapisy na zawody
ranking
role admin/user