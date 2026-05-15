"use client";

import Link from "next/link";
import { useState } from "react";

import { apiUrl } from "@/lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleLogin() {
    setMessage("");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      setMessage("Podaj poprawny adres email ❌");
      return;
    }

    if (!password) {
      setMessage("Podaj hasło ❌");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        apiUrl("/login"),
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

      if (data.message === "Nieprawidłowy email lub hasło") {
        setMessage("Nieprawidłowy email lub hasło ❌");
        return;
      }

      if (data.message === "Konto nie zostało aktywowane") {
        setMessage("Aktywuj konto linkiem z emaila przed logowaniem ❌");
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("email", data.email);
      localStorage.setItem("role", data.role);
      localStorage.setItem(
        "roles",
        Array.isArray(data.roles)
          ? data.roles.join(",")
          : data.role
      );

      setMessage("Logowanie poprawne ✅");

      setTimeout(() => {
        window.location.href = "/";
      }, 1000);

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
          Logowanie
        </h1>

        <p className="text-gray-500 text-center mb-8">
          Zaloguj się do konta
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
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

          <button
            type="submit"
            disabled={loading}
            className="bg-green-900 text-white py-3 rounded-xl font-semibold hover:bg-green-800 transition disabled:opacity-50"
          >
            {loading ? "Logowanie..." : "Zaloguj się"}
          </button>

          {message && (
            <p className="text-center text-black font-medium">
              {message}
            </p>
          )}

        </form>

        <div className="mt-6 text-center">
          <p className="text-black">
            Nie masz konta?
          </p>

          <Link
            href="/register"
            className="text-green-900 font-semibold"
          >
            Rejestracja
          </Link>
        </div>

      </div>
    </main>
  );
}
