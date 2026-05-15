"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiUrl } from "@/lib/api";

type ActivateClientProps = {
  token: string;
};

export default function ActivateClient({
  token,
}: ActivateClientProps) {
  const [message, setMessage] = useState(
    token
      ? "Aktywowanie konta..."
      : "Brak tokenu aktywacyjnego."
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    async function activateAccount() {
      try {
        const response = await fetch(
          apiUrl(`/activate?token=${token}`)
        );

        const data = await response.json();

        if (!response.ok) {
          setMessage(data.detail || "Nie udało się aktywować konta.");
          return;
        }

        setMessage("Konto zostało aktywowane. Możesz się zalogować.");
      } catch (error) {
        console.error(error);
        setMessage("Błąd połączenia z serwerem.");
      }
    }

    activateAccount();
  }, [token]);

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 text-center">
        <h1 className="text-4xl font-bold text-black mb-4">
          Aktywacja konta
        </h1>

        <p className="text-gray-700 mb-6">
          {message}
        </p>

        <Link
          href="/login"
          className="inline-block bg-green-900 text-white px-5 py-3 rounded-xl font-semibold"
        >
          Przejdź do logowania
        </Link>
      </div>
    </main>
  );
}
