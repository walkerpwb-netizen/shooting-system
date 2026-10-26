"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { apiUrl } from "@/lib/api";
import { authFetch, getAuthSnapshot, subscribeToAuthChange } from "@/lib/auth";

export default function SupportClient() {
  const router = useRouter();
  const snapshot = useSyncExternalStore(subscribeToAuthChange, getAuthSnapshot, () => "");
  const [access, setAccess] = useState<{ snapshot: string; allowed: boolean; error?: string } | null>(null);
  const [amount, setAmount] = useState("");
  const allowed = access?.snapshot === snapshot && access.allowed;
  const error = access?.snapshot === snapshot ? access.error : "";

  useEffect(() => {
    const controller = new AbortController();

    async function verifyAccess() {
      try {
        // Verify the current role with the backend, never with localStorage alone.
        const response = await authFetch(apiUrl("/me"), {
          cache: "no-store",
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (!response.ok) throw new Error("Nie udało się sprawdzić uprawnień. Odśwież stronę i spróbuj ponownie.");

        const profile = await response.json();
        if (controller.signal.aborted) return;
        const roles = Array.isArray(profile.roles)
          ? profile.roles
          : String(profile.roles || profile.role || "").split(",");
        if (!roles.includes("admin")) {
          router.replace("/");
          return;
        }
        setAccess({ snapshot, allowed: true });
      } catch (error) {
        if (!controller.signal.aborted) {
          setAccess({
            snapshot,
            allowed: false,
            error: error instanceof Error ? error.message : "Nie udało się sprawdzić uprawnień.",
          });
        }
      }
    }

    void verifyAccess();
    return () => controller.abort();
  }, [router, snapshot]);

  if (!allowed) {
    return (
      <main className="min-h-screen px-5 py-12 text-white">
        <p className="mx-auto max-w-2xl" role={error ? "alert" : "status"}>
          {error || "Sprawdzanie uprawnień…"}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-900 via-green-950 to-zinc-950 px-5 py-12 text-white sm:px-8 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <section className="rounded-3xl border border-emerald-200/25 bg-black/25 p-6 shadow-2xl sm:p-10">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-200">
            Razem rozwijamy System Strzelecki
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Wesprzyj nas</h1>
          <div className="mt-6 space-y-4 text-lg leading-8 text-green-50">
            <p>
              Podoba Ci się System Strzelecki i kierunek, w którym go rozwijamy?
              Dołóż swoją cegiełkę do jego przyszłości.
            </p>
            <p>
              Tworzenie tego autorskiego projektu wymaga czasu, pracy i środków.
              Twoje wsparcie pomoże nam utrzymywać serwis, udoskonalać jego działanie
              i szybciej tworzyć kolejne rozwiązania dla strzelców, organizatorów i sędziów.
              Każda kwota, nawet niewielka, przybliża nas do następnego kroku.
            </p>
            <p className="font-semibold text-emerald-200">Dziękujemy za każdą cegiełkę i za to, że jesteś z nami!</p>
          </div>

          <section aria-labelledby="support-amount-heading" className="mt-8 rounded-2xl border border-emerald-200/25 bg-green-950/80 p-5 sm:p-7">
            <h2 id="support-amount-heading" className="text-2xl font-bold">Dołóż swoją cegiełkę</h2>
            <p className="mt-2 leading-7 text-green-100">Wybierz dowolną kwotę, którą chcesz wesprzeć rozwój projektu.</p>
            <label htmlFor="support-amount" className="mt-6 block font-semibold">Kwota wsparcia</label>
            <div className="relative mt-2 max-w-sm">
              <input
                id="support-amount"
                name="amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="np. 20,00"
                aria-describedby="support-currency support-payment-status"
                maxLength={12}
                className="min-h-14 w-full rounded-xl border border-emerald-200/50 bg-black/30 py-3 pl-4 pr-20 text-xl font-bold text-white placeholder:text-green-100/50 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
              <span id="support-currency" className="pointer-events-none absolute inset-y-0 right-4 flex items-center font-bold text-emerald-200">PLN</span>
            </div>
            <button
              type="button"
              disabled
              aria-describedby="support-payment-status"
              className="mt-5 flex min-h-14 w-full items-center justify-center rounded-xl bg-emerald-300 px-6 py-4 text-lg font-black text-green-950 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              Wesprzyj przez Autopay
            </button>
            <p id="support-payment-status" className="mt-3 text-sm leading-6 text-green-100">
              Płatności Autopay uruchomimy wkrótce. Obecnie wpłaty są niedostępne.
            </p>
            <Image
              src="/payments/autopay-methods.png"
              alt="Autopay — planowane płatności online"
              width={485}
              height={115}
              unoptimized
              className="mt-5 h-auto w-full max-w-sm"
            />
          </section>

          <section aria-labelledby="support-sharing-heading" className="mt-8 border-t border-emerald-200/20 pt-6">
            <h2 id="support-sharing-heading" className="text-xl font-bold">Dobre słowo też pomaga</h2>
            <p className="mt-3 leading-7 text-green-100">
              Możesz nas wesprzeć również, polecając System Strzelecki znajomym strzelcom,
              organizatorom zawodów i sędziom. Dzięki Tobie dotrzemy do kolejnych osób,
              którym nasz projekt ułatwi realizowanie strzeleckiej pasji.
            </p>
          </section>
        </section>
      </div>
    </main>
  );
}
