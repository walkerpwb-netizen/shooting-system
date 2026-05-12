Kontynuujemy projekt shooting-system.

Poniżej aktualny status projektu:
# SHOOTING SYSTEM — STATUS PROJEKTU

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

cd backend
source venv/bin/activate
python3 -m uvicorn main:app --reload --host 0.0.0.0

Backend działa na:
http://127.0.0.1:8000

Swagger:
http://127.0.0.1:8000/docs

---

# FRONTEND

Uruchamianie frontendu:

cd frontend
npm run dev

Frontend działa na:
http://localhost:3000

---

# GOTOWE FUNKCJE

## Rejestracja użytkownika

Frontend:
- formularz register/page.tsx
- walidacja email
- sprawdzanie zgodności haseł
- sprawdzanie siły hasła
- komunikaty błędów
- loading button
- komunikat o istniejącym emailu
- komunikat o poprawnej rejestracji

Backend:
- endpoint POST /register
- zapis użytkownika do SQLite
- sprawdzanie czy email istnieje
- blokada duplikatów
- hashowanie hasła bcrypt
- SQLAlchemy ORM
- SQLite database

---

# LOGOWANIE

Backend:
- endpoint POST /login
- sprawdzanie hasła przez bcrypt/passlib
- JWT token generation

Frontend:
- jeszcze do zrobienia

---

# ODZYSKIWANIE HASŁA

Plan:
- formularz "Nie pamiętasz hasła?"
- endpoint reset password
- token resetujący
- wysyłka emaila

---

# WAŻNE PACZKI

Backend:

python3 -m pip install sqlalchemy
python3 -m pip install aiosqlite
python3 -m pip install python-multipart
python3 -m pip install "passlib[bcrypt]"
python3 -m pip install python-jose

---

# AKTUALNA LOGIKA REJESTRACJI

Frontend:
1. użytkownik wpisuje email
2. użytkownik wpisuje hasło
3. użytkownik powtarza hasło
4. frontend sprawdza:
   - poprawność emaila
   - zgodność haseł
   - siłę hasła
5. frontend wysyła request POST /register
6. backend sprawdza czy email istnieje
7. jeśli istnieje → zwraca komunikat błędu
8. jeśli nie istnieje:
   - hasło jest hashowane bcryptem
   - użytkownik zapisywany jest do SQLite
9. frontend pokazuje komunikat sukcesu

---

# UWAGI

- projekt działa lokalnie
- backend i frontend uruchamiane osobno
- baza danych: SQLite
- auth oparty o JWT
- hasła są hashowane bcryptem
- backend działa na FastAPI
- frontend działa na Next.js

---

# TODO

- frontend logowania
- zapis tokenu JWT
- sesja użytkownika
- logout
- reset hasła
- panel użytkownika
- tworzenie zawodów
- edycja zawodów
- usuwanie zawodów
- zapisy na zawody
- ranking zawodników
- role admin/user
- panel admina
- wysyłka maili
- deployment aplikacji