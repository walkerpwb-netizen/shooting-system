"use client";

import Link from "next/link";
import { useState } from "react";

import { apiUrl } from "@/lib/api";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [activationLink, setActivationLink] = useState("");

  function validatePassword(password: string) {
    const hasUppercase = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasMinLength = password.length >= 8;

    return hasUppercase && hasNumber && hasMinLength;
  }

  async function handleRegister() {
    setMessage("");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      setMessage("Podaj poprawny adres email ❌");
      return;
    }

    if (password !== repeatPassword) {
      setMessage("Hasła nie są identyczne ❌");
      return;
    }

    if (!validatePassword(password)) {
      setMessage(
        "Hasło musi mieć minimum 8 znaków, 1 dużą literę i 1 cyfrę ❌"
      );
      return;
    }

    try {
      setLoading(true);
      setActivationLink("");

      const response = await fetch(
        apiUrl("/register"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        }
      );

      const data = await response.json();

      if (data.message === "Email już istnieje") {
        setMessage("Ten email jest już zajęty ❌");
        return;
      }

      setMessage("Konto zostało utworzone. Aktywuj je linkiem z emaila ✅");
      setActivationLink(data.activation_link || "");

      setEmail("");
      setPassword("");
      setRepeatPassword("");
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
          Rejestracja
        </h1>

        <p className="text-gray-500 text-center mb-8">
          Utwórz nowe konto
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleRegister();
          }}
          className="flex flex-col gap-4"
        >

          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Adres email"
            className="border border-gray-300 rounded-xl px-4 py-3 text-black"
          />

          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Hasło"
            className="border border-gray-300 rounded-xl px-4 py-3 text-black"
          />

          <input
            type="password"
            required
            value={repeatPassword}
            onChange={(e) => setRepeatPassword(e.target.value)}
            placeholder="Powtórz hasło"
            className="border border-gray-300 rounded-xl px-4 py-3 text-black"
          />

          <div className="text-sm text-gray-500">
            Hasło musi zawierać:
            <ul className="list-disc ml-5 mt-1">
              <li>minimum 8 znaków</li>
              <li>1 dużą literę</li>
              <li>1 cyfrę</li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-green-900 text-white py-3 rounded-xl font-semibold hover:bg-green-800 transition disabled:opacity-50"
          >
            {loading ? "Tworzenie konta..." : "Utwórz konto"}
          </button>

          {message && (
            <p className="text-center text-black font-medium">
              {message}
            </p>
          )}

          {activationLink && (
            <div className="border border-green-200 bg-green-50 rounded-xl p-4">
              <p className="text-sm text-gray-700 mb-2">
                Tryb testowy: kliknij link aktywacyjny konta.
              </p>

              <Link
                href={activationLink}
                className="text-green-900 font-semibold break-all"
              >
                Aktywuj konto
              </Link>
            </div>
          )}

        </form>

        <div className="mt-6 text-center">
          <p className="text-black">
            Masz już konto?
          </p>

          <Link
            href="/login"
            className="text-green-900 font-semibold"
          >
            Logowanie
          </Link>
        </div>

      </div>
    </main>
  );
}
