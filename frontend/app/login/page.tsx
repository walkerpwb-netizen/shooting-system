"use client";

import Link from "next/link";
import { useState } from "react";

import { apiUrl } from "@/lib/api";
import { setSessionAuth } from "@/lib/auth";

type LoginKind = "user" | "club";

function validateEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function LoginPage() {
  const [loginKind, setLoginKind] = useState<LoginKind>("user");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [clubEmail, setClubEmail] = useState("");
  const [clubPassword, setClubPassword] = useState("");
  const [loadingKind, setLoadingKind] = useState<LoginKind | null>(null);
  const [userMessage, setUserMessage] = useState("");
  const [clubMessage, setClubMessage] = useState("");

  async function handleLogin(kind: LoginKind) {
    const email = kind === "club" ? clubEmail : userEmail;
    const password = kind === "club" ? clubPassword : userPassword;
    const setMessage = kind === "club" ? setClubMessage : setUserMessage;

    setMessage("");

    if (!validateEmail(email)) {
      setMessage("Podaj poprawny adres e-mail");
      return;
    }

    if (!password) {
      setMessage("Podaj hasło");
      return;
    }

    try {
      setLoadingKind(kind);

      const response = await fetch(apiUrl("/login"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await response.json();

      if (data.message === "Nieprawidłowy e-mail lub hasło") {
        setMessage("Nieprawidłowy e-mail lub hasło");
        return;
      }

      if (data.message === "Konto nie zostało aktywowane") {
        setMessage("Aktywuj konto linkiem z e-maila przed logowaniem");
        return;
      }

      if (data.message === "Konto klubu oczekuje na weryfikację administratora") {
        window.alert("Konto klubu PZSS jest jeszcze niezweryfikowane przez administratora.");
        setMessage("Konto klubu oczekuje na weryfikację administratora");
        return;
      }

      if (data.message?.startsWith("Hasło wymaga zresetowania")) {
        setMessage(data.message);
        return;
      }

      if (kind === "club" && data.account_type !== "pzss_club") {
        setMessage("To logowanie jest przeznaczone wyłącznie dla klubów PZSS");
        return;
      }

      setSessionAuth(data);
      setMessage("Logowanie poprawne");

      setTimeout(() => {
        window.location.href = "/";
      }, 700);
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem");
    } finally {
      setLoadingKind(null);
    }
  }

  const isClubLogin = loginKind === "club";
  const email = isClubLogin ? clubEmail : userEmail;
  const password = isClubLogin ? clubPassword : userPassword;
  const message = isClubLogin ? clubMessage : userMessage;

  return (
    <main className="min-h-screen w-full flex items-center justify-center px-6 py-10">
      <section className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl p-8">
        <div className="mb-6 grid grid-cols-2 rounded-xl bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setLoginKind("user")}
            className={`rounded-lg px-4 py-3 font-bold transition ${!isClubLogin ? "bg-green-900 text-white" : "text-gray-700"}`}
          >
            Użytkownik
          </button>

          <button
            type="button"
            onClick={() => setLoginKind("club")}
            className={`rounded-lg px-4 py-3 font-bold transition ${isClubLogin ? "bg-green-900 text-white" : "text-gray-700"}`}
          >
            Klub PZSS
          </button>
        </div>

        <h1 className="text-4xl font-bold text-black mb-2 text-center">
          {isClubLogin ? "Logowanie klubu PZSS" : "Logowanie"}
        </h1>

        <p className="text-gray-500 text-center mb-8">
          {isClubLogin
            ? "Konto klubu zarejestrowanego w PZSS"
            : "Konto zawodnika, organizatora lub sędziego"}
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleLogin(loginKind);
          }}
          className="flex flex-col gap-4"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(event) => {
              if (isClubLogin) {
                setClubEmail(event.target.value);
              } else {
                setUserEmail(event.target.value);
              }
            }}
            placeholder={isClubLogin ? "E-mail klubu z PZSS" : "Adres e-mail"}
            className="border border-gray-300 rounded-xl px-4 py-3 text-black"
          />

          <input
            type="password"
            required
            value={password}
            onChange={(event) => {
              if (isClubLogin) {
                setClubPassword(event.target.value);
              } else {
                setUserPassword(event.target.value);
              }
            }}
            placeholder="Hasło"
            className="border border-gray-300 rounded-xl px-4 py-3 text-black"
          />

          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-sm font-semibold text-green-900 hover:text-green-700"
            >
              Nie pamiętam hasła
            </Link>
          </div>

          <button
            type="submit"
            disabled={loadingKind !== null}
            className="bg-green-900 text-white py-3 rounded-xl font-semibold hover:bg-green-800 transition disabled:opacity-50"
          >
            {loadingKind === loginKind
              ? "Logowanie..."
              : isClubLogin ? "Zaloguj klub" : "Zaloguj się"}
          </button>

          {message && (
            <p className="text-center text-black font-medium">
              {message}
            </p>
          )}
        </form>

        <div className="mt-6 text-center">
          <p className="text-black">
            {isClubLogin ? "Klub nie ma konta?" : "Nie masz konta?"}
          </p>
          <Link
            href={isClubLogin ? "/register?type=pzss-club" : "/register"}
            className="text-green-900 font-semibold"
          >
            {isClubLogin ? "Rejestracja klubu PZSS" : "Rejestracja"}
          </Link>
        </div>
      </section>
    </main>
  );
}
