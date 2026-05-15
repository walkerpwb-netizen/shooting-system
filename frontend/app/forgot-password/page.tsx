"use client";

import Link from "next/link";
import { useState } from "react";

import { apiUrl } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleForgotPassword() {
    setMessage("");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      setMessage("Podaj poprawny adres email ❌");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        apiUrl("/forgot-password"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
          }),
        }
      );

      const data = await response.json();

      setMessage(data.message + " ✅");

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
          Odzyskiwanie hasła
        </h1>

        <p className="text-gray-500 text-center mb-8">
          Podaj adres email swojego konta
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleForgotPassword();
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

          <button
            type="submit"
            disabled={loading}
            className="bg-green-900 text-white py-3 rounded-xl font-semibold hover:bg-green-800 transition disabled:opacity-50"
          >
            {loading
              ? "Wysyłanie..."
              : "Wyślij link resetujący"}
          </button>

          {message && (
            <p className="text-center text-black font-medium">
              {message}
            </p>
          )}

        </form>

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
