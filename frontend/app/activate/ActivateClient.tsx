"use client";

import { useEffect, useState } from "react";

import { apiUrl } from "@/lib/api";
import { setSessionAuth } from "@/lib/auth";
import {
  consumeAuthRedirectPath,
  safeAuthRedirectPath,
} from "@/lib/authRedirect";

type ActivateClientProps = {
  token: string;
  redirectPath: string;
};

export default function ActivateClient({
  token,
  redirectPath,
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
          apiUrl(`/activate?token=${token}`),
          {
            credentials: "include",
          }
        );

        const data = await response.json();

        if (!response.ok) {
          setMessage(data.detail || "Nie udało się aktywować konta.");
          return;
        }

        setSessionAuth(data);
        const destination = safeAuthRedirectPath(redirectPath)
          || consumeAuthRedirectPath()
          || "/profile";

        setMessage("Konto zostało aktywowane. Przekierowujemy...");
        window.location.replace(destination);
      } catch (error) {
        console.error(error);
        setMessage("Błąd połączenia z serwerem.");
      }
    }

    activateAccount();
  }, [redirectPath, token]);

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 text-center">
        <h1 className="text-4xl font-bold text-black mb-4">
          Aktywacja konta
        </h1>

        <p className="text-gray-700 mb-6">
          {message}
        </p>

      </div>
    </main>
  );
}
