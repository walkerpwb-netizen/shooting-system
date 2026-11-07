"use client";

import AutopayMethodsBanner from "@/components/AutopayMethodsBanner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { getAuthSnapshot, subscribeToAuthChange } from "@/lib/auth";
import { premiumPrice, PAYMENT_MAINTENANCE_MESSAGE, type DailyPremiumOffer, type PremiumCommerce } from "@/lib/premiumCommerce";
import { buildAuthPath, storeAuthRedirectPath } from "@/lib/authRedirect";

export default function SupportClient({ offer, commerce }: { offer: DailyPremiumOffer | null; commerce: PremiumCommerce | null }) {
  const router = useRouter();
  const snapshot = useSyncExternalStore(subscribeToAuthChange, getAuthSnapshot, () => "");
  const [amount, setAmount] = useState("");
  const signedIn = Boolean(snapshot.split("|")[0]);
  const paymentsAvailable = Boolean(commerce?.sales_enabled && commerce.payments_temporarily_unavailable === false);
  const normalizedAmount = amount.trim().replace(",", ".");
  const validAmount = Boolean(offer && /^[1-9][0-9]{0,5}(?:\.0{1,2})?$/.test(normalizedAmount)
    && Number(normalizedAmount) >= Number(offer.minimum_amount) && Number(normalizedAmount) <= Number(offer.maximum_amount));
  const days = validAmount && offer ? Number(normalizedAmount) / Number(offer.price_per_day) : null;

  const checkoutPath = validAmount
    ? `/premium/zakup?pakiet=shooter&okres=daily&kwota=${Number(normalizedAmount).toFixed(2)}`
    : "/wesprzyj-nas";

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
            if (!validAmount || !paymentsAvailable) return;
            if (!signedIn) storeAuthRedirectPath(checkoutPath);
            router.push(signedIn ? checkoutPath : buildAuthPath("/login", checkoutPath));
          }}>
            <h2 id="support-amount-heading" className="text-2xl font-bold">Każda złotówka wsparcia to 1 dodatkowy dzień Premium dla Ciebie</h2>
            <p className="mt-2 leading-7 text-green-100">Cena za 1 dzień Premium Strzelca: <strong>{offer ? premiumPrice(offer.price_per_day) : "—"}</strong>. Minimalny zakup: {offer ? premiumPrice(offer.minimum_amount) : "—"}. Wybierz kwotę w pełnych złotych.</p>
            <p className="mt-3 leading-7 text-green-100">Kupujesz odpłatną usługę Premium Strzelca. Zakupione dni przedłużają obecny dostęp; jeśli nie masz aktywnego Premium, datę rozpoczęcia wybierzesz zgodnie z zasadami w podsumowaniu. Płatność jednorazowa, bez automatycznego odnawiania.</p>
            {!offer && <p role="alert" className="mt-4 text-amber-100">Nie udało się pobrać aktualnej oferty. <button type="button" className="underline" onClick={() => router.refresh()}>Odśwież stronę</button>.</p>}
            {!paymentsAvailable && <p role="status" className="mt-4 text-amber-100">{commerce?.payments_temporarily_unavailable !== false ? commerce?.payment_unavailable_message || PAYMENT_MAINTENANCE_MESSAGE : "Płatności są chwilowo niedostępne. Spróbuj ponownie później."}</p>}
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
              disabled={!validAmount || !paymentsAvailable}
              aria-describedby="support-payment-status"
              className="mt-5 flex min-h-14 w-full items-center justify-center rounded-xl bg-emerald-300 px-6 py-4 text-lg font-black text-green-950 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {signedIn ? "Przejdź do podsumowania zakupu" : "Zaloguj się i przejdź do podsumowania"}
            </button>
            {!signedIn && <div className="mt-4 space-y-2 text-sm leading-6 text-green-100">
              <p>Do zakupu i przypisania dni Premium potrzebujesz zarejestrowanego, aktywnego konta. Po zalogowaniu wrócisz do wybranej kwoty i podsumowania.</p>
              <div className="flex flex-wrap gap-4 font-semibold text-emerald-200 underline">
                <Link href={buildAuthPath("/login", checkoutPath)} onClick={() => storeAuthRedirectPath(checkoutPath)}>Mam konto — zaloguj się</Link>
                <Link href={buildAuthPath("/register", checkoutPath)} onClick={() => storeAuthRedirectPath(checkoutPath)}>Załóż konto</Link>
              </div>
            </div>}
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
