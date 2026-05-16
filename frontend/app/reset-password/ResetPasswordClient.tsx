"use client";

import Link from "next/link";
import { useState } from "react";

import { apiUrl } from "@/lib/api";

type ResetPasswordClientProps = {
  token: string;
};

export default function ResetPasswordClient({
  token,
}: ResetPasswordClientProps) {
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(
    token
      ? ""
      : "Brak tokenu resetowania hasła."
  );
  const [success, setSuccess] = useState(false);

  function validatePassword(value: string) {
    const hasUppercase = /[A-Z]/.test(value);
    const hasNumber = /[0-9]/.test(value);
    const hasMinLength = value.length >= 8;

    return hasUppercase && hasNumber && hasMinLength;
  }

  async function handleResetPassword() {
    setMessage("");

    if (!token) {
      setMessage("Brak tokenu resetowania hasła ❌");
      return;
    }

    if (password !== repeatPassword) {
      setMessage("Hasła nie są takie same ❌");
      return;
    }

    if (!validatePassword(password)) {
      setMessage("Hasło musi mieć minimum 8 znaków, dużą literę i cyfrę ❌");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        apiUrl("/reset-password"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token,
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się zmienić hasła ❌");
        return;
      }

      setSuccess(true);
      setMessage("Hasło zostało zmienione ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen w-full flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8">
        <h1 className="text-4xl font-bold text-black mb-2 text-center">
          Nowe hasło
        </h1>

        <p className="text-gray-500 text-center mb-8">
          Ustaw nowe hasło do swojego konta
        </p>

        {!success && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleResetPassword();
            }}
            className="flex flex-col gap-4"
          >
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Nowe hasło"
              className="border border-gray-300 rounded-xl px-4 py-3 text-black"
            />

            <input
              type="password"
              required
              value={repeatPassword}
              onChange={(event) => setRepeatPassword(event.target.value)}
              placeholder="Powtórz nowe hasło"
              className="border border-gray-300 rounded-xl px-4 py-3 text-black"
            />

            <button
              type="submit"
              disabled={loading || !token}
              className="bg-green-900 text-white py-3 rounded-xl font-semibold hover:bg-green-800 transition disabled:opacity-50"
            >
              {loading
                ? "Zapisywanie..."
                : "Zapisz nowe hasło"}
            </button>
          </form>
        )}

        {message && (
          <p className="text-center text-black font-medium mt-5">
            {message}
          </p>
        )}

        <div className="mt-6 text-center">
          <Link
            href="/login"
            className="text-green-900 font-semibold"
          >
            Powrót do logowania
          </Link>
        </div>
      </div>
    </main>
  );
}
