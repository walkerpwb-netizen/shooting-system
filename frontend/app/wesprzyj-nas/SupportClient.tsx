"use client";

import AutopayMethodsBanner from "@/components/AutopayMethodsBanner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { apiUrl } from "@/lib/api";
import { authFetch, getAuthSnapshot, subscribeToAuthChange } from "@/lib/auth";
import { premiumPrice, type DailyPremiumOffer } from "@/lib/premiumCommerce";

export default function SupportClient() {
  const router = useRouter();
  const snapshot = useSyncExternalStore(subscribeToAuthChange, getAuthSnapshot, () => "");
  const [access, setAccess] = useState<{ snapshot: string; allowed: boolean; error?: string } | null>(null);
  const [amount, setAmount] = useState("");
  const [offer, setOffer] = useState<DailyPremiumOffer | null>(null);
  const allowed = access?.snapshot === snapshot && access.allowed;
  const error = access?.snapshot === snapshot ? access.error : "";
  const normalizedAmount = amount.trim().replace(",", ".");
  const validAmount = Boolean(offer && /^[1-9][0-9]{0,5}(?:\.0{1,2})?$/.test(normalizedAmount)
    && Number(normalizedAmount) >= Number(offer.minimum_amount) && Number(normalizedAmount) <= Number(offer.maximum_amount));
  const days = validAmount && offer ? Number(normalizedAmount) / Number(offer.price_per_day) : null;

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
        const offerResponse = await authFetch(apiUrl("/premium/support-offer"), { cache: "no-store", signal: controller.signal });
        if (!offerResponse.ok) throw new Error("Nie udało się pobrać oferty Premium w dniach. Odśwież stronę.");
        const dailyOffer: DailyPremiumOffer = await offerResponse.json();
        if (controller.signal.aborted) return;
        setOffer(dailyOffer);
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
          <p className="mt-4 rounded-xl border border-amber-300/40 bg-amber-300/10 p-4 text-sm text-amber-100">Podgląd administratora. Ta oferta nie jest jeszcze dostępna publicznie. Zakup korzysta z rzeczywistych płatności Autopay.</p>
          <div className="mt-6 space-y-4 text-lg leading-8 text-green-50">
            <p>
              Podoba Ci się System Strzelecki i kierunek, w którym go rozwijamy?
              Wesprzyj jego rozwój, kupując dodatkowe dni Premium Strzelca na swoim koncie.
            </p>
            <p>
              Tworzenie tego autorskiego projektu wymaga czasu, pracy i środków.
              Twoje wsparcie pomoże nam utrzymywać serwis, udoskonalać jego działanie
              i szybciej tworzyć kolejne rozwiązania dla strzelców, organizatorów i sędziów.
              Każdy zakup pomaga rozwijać projekt i zapewnia Ci dodatkowy okres dostępu Premium.
            </p>
            <p className="font-semibold text-emerald-200">Dziękujemy za wsparcie i za to, że jesteś z nami!</p>
          </div>

          <form aria-labelledby="support-amount-heading" className="mt-8 rounded-2xl border border-emerald-200/25 bg-green-950/80 p-5 sm:p-7" onSubmit={(event) => {
            event.preventDefault();
            if (validAmount) router.push(`/premium/zakup?pakiet=shooter&okres=daily&kwota=${Number(normalizedAmount).toFixed(2)}`);
          }}>
            <h2 id="support-amount-heading" className="text-2xl font-bold">Każda złotówka wsparcia to 1 dodatkowy dzień Premium dla Ciebie</h2>
            <p className="mt-2 leading-7 text-green-100">Cena za 1 dzień Premium Strzelca: <strong>{offer ? premiumPrice(offer.price_per_day) : "—"}</strong>. Minimalny zakup: {offer ? premiumPrice(offer.minimum_amount) : "—"}. Wybierz kwotę w pełnych złotych.</p>
            <p className="mt-3 leading-7 text-green-100">Kupujesz odpłatną usługę Premium Strzelca. Zakupione dni przedłużają obecny dostęp; jeśli nie masz aktywnego Premium, datę rozpoczęcia wybierzesz zgodnie z zasadami w podsumowaniu. Płatność jednorazowa, bez automatycznego odnawiania.</p>
            <label htmlFor="support-amount" className="mt-6 block font-semibold">Kwota zakupu</label>
            <div className="relative mt-2 max-w-sm">
              <input
                id="support-amount"
                name="amount"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="dowolna kwota"
                aria-describedby="support-currency support-payment-status"
                aria-invalid={amount !== "" && !validAmount}
                maxLength={12}
                className="min-h-14 w-full rounded-xl border border-emerald-200/50 bg-black/30 py-3 pl-4 pr-20 text-xl font-bold text-white placeholder:text-green-100/50 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
              <span id="support-currency" className="pointer-events-none absolute inset-y-0 right-4 flex items-center font-bold text-emerald-200">PLN</span>
            </div>
            <button
              type="submit"
              disabled={!validAmount}
              aria-describedby="support-payment-status"
              className="mt-5 flex min-h-14 w-full items-center justify-center rounded-xl bg-emerald-300 px-6 py-4 text-lg font-black text-green-950 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              Przejdź do podsumowania zakupu
            </button>
            <p id="support-payment-status" aria-live="polite" className="mt-3 leading-6 text-green-100">
              {days !== null ? <>Kupujesz <strong>{days} dni Premium Strzelca</strong> za <strong>{premiumPrice(normalizedAmount)}</strong>. Cenę i dokładne daty potwierdzisz przed zapłatą.</> : amount ? "Podaj poprawną kwotę w pełnych złotych, zgodną z minimalną kwotą zakupu." : "Wpisz kwotę, aby zobaczyć liczbę kupowanych dni."}
            </p>
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-emerald-200 underline"><Link href="/premium">Funkcje Premium Strzelca i pozostałe pakiety</Link><Link href="/premium/regulamin">Regulamin Premium i dane sprzedawcy</Link><Link href="/polityka-prywatnosci">Polityka prywatności</Link></div>
            <p className="mt-3 text-sm text-green-100">Płatności obsługuje Autopay S.A. Dostępne metody: BLIK i przelew tradycyjny.</p>
            <div className="mt-5 max-w-sm"><AutopayMethodsBanner /></div>
          </form>

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
