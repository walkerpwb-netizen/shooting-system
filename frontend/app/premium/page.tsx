import type { Metadata } from "next";
import Link from "next/link";
import AutopayPaymentInfo from "@/components/AutopayPaymentInfo";
import { getPremiumData, premiumOfferDetails, premiumPackageNames, premiumPrice, type PremiumPrices } from "@/lib/premiumCommerce";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Premium — pakiety i cennik | System Strzelecki",
  description: "Poznaj Premium dla strzelców i organizatorów zawodów. Aktualny cennik, zakres pakietów i zasady zakupu.",
  alternates: { canonical: "/premium" },
};

export default async function PremiumPage() {
  const prices = await getPremiumData<PremiumPrices>("/settings/premium");
  return (
    <main className="min-h-screen bg-gradient-to-b from-green-950 to-zinc-950 px-5 py-12 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-bold uppercase tracking-widest text-emerald-300">System Strzelecki Premium</p>
        <h1 className="mt-4 text-4xl font-black sm:text-6xl">Więcej możliwości.<br />Twój pakiet Premium.</h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-green-100">Rozwijaj swoją pasję strzelecką lub publikuj więcej zawodów i szkoleń. Wybierz dostęp Premium dla strzelca, jednorazową dodatkową publikację albo roczny pakiet organizatora bez limitu. Bez automatycznego odnawiania.</p>
        <div className="mt-8 rounded-2xl border border-amber-300/40 bg-amber-300/10 p-5 text-amber-100" role="status">
          <strong>Przygotowujemy sprzedaż Premium.</strong> Płatności zostaną udostępnione po pozytywnej weryfikacji Autopay. Teraz możesz sprawdzić ofertę i przygotować zakup. Nie pobieramy opłat.
        </div>
        {!prices ? (
          <p role="alert" className="my-10 rounded-xl border border-red-300/40 p-6">Nie udało się pobrać cennika. Odśwież stronę lub <Link className="underline" href="/kontakt">skontaktuj się z nami</Link>.</p>
        ) : (
          <section aria-label="Pakiety i cennik Premium" className="mt-10 grid gap-6 md:grid-cols-2">
            {(["shooter", "organizer"] as const).map((kind) => {
              const pack = prices[kind];
              return (
                <article key={kind} className="flex flex-col rounded-3xl border border-green-300/25 bg-green-950/60 p-6 shadow-xl sm:p-8">
                  <h2 className="text-3xl font-black">{premiumPackageNames[kind]}</h2>
                  <p className="mt-4 leading-7 text-green-100">{kind === "shooter"
                    ? "Dostęp do funkcji Premium na Twoim koncie strzelca. Sprawdzaj wyniki i śledź swoje postępy."
                    : "Za każde dodatkowe opublikowane zawody lub szkolenie zapłacisz jednorazowo. Możesz też wybrać roczny pakiet publikacji bez limitu. Panel organizatora, szkice, sędziowie, wyniki, PDF i raporty pozostają bezpłatne."}</p>
                  <ul className="my-6 flex-1 space-y-3 text-green-100">
                    {pack.available_features.filter((feature) => pack.features.includes(feature.id)).map((feature) => (
                      <li key={feature.id} className="flex gap-3"><span aria-hidden="true" className="text-emerald-300">✓</span><span>{kind === "organizer" && "W rocznym pakiecie: "}{feature.label}</span></li>
                    ))}
                    {pack.features.length === 0 && <li>Zakres pakietu jest przygotowywany.</li>}
                  </ul>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {(["monthly", "yearly"] as const).map((period) => {
                      const offer = premiumOfferDetails(kind, period);
                      return <div key={period} className="rounded-2xl border border-green-200/20 bg-black/25 p-4">
                        <h3 className="font-bold text-green-100">{offer.title}</h3>
                        <p className="mt-3 text-3xl font-black">{premiumPrice(pack[`${period}_price`])}</p>
                        <p className="mt-2 text-sm text-green-200">{offer.priceCaption}</p>
                        <Link href={`/premium/zakup?pakiet=${kind}&okres=${offer.queryPeriod}`} className="mt-5 block rounded-xl bg-emerald-300 px-4 py-3 text-center font-black text-green-950 transition hover:bg-white">Kup Premium<span className="sr-only"> — {premiumPackageNames[kind]}, {offer.summary}</span></Link>
                      </div>;
                    })}
                  </div>
                </article>
              );
            })}
          </section>
        )}
        <section className="mt-10 grid gap-6 rounded-3xl border border-green-300/20 bg-black/20 p-6 sm:grid-cols-3 sm:p-8" aria-label="Jak kupić Premium">
          <div><h2 className="font-black text-emerald-300">1. Wybierz ofertę</h2><p className="mt-2 leading-7 text-green-100">Strzelec wybiera miesiąc lub rok dostępu. Organizator wybiera jednorazową dodatkową publikację albo roczny pakiet bez limitu. Cennik jest aktualizowany na bieżąco.</p></div>
          <div><h2 className="font-black text-emerald-300">2. Zaloguj się</h2><p className="mt-2 leading-7 text-green-100">Użyj swojego konta lub zarejestruj nowe. Po aktywacji wrócisz do wybranego pakietu.</p></div>
          <div><h2 className="font-black text-emerald-300">3. Sprawdź podsumowanie</h2><p className="mt-2 leading-7 text-green-100">Po uruchomieniu sprzedaży zapłacisz przez Autopay. Obecnie rzeczywiste płatności są wyłączone.</p></div>
        </section>
        <p className="mt-8 leading-7 text-green-100">Zakup dotyczy wyłącznie wybranej usługi. Premium nie jest opłatą startową za zawody. Bez dodatkowej opłaty lub pakietu rocznego organizator może mieć jedno aktywne opublikowane wydarzenie — zawody lub szkolenie. Szkice są bez limitu. Jednorazowa opłata obejmuje publikację jednego dodatkowego wydarzenia.</p>
        <AutopayPaymentInfo />
        <nav aria-label="Informacje o zakupie Premium" className="mt-6 flex flex-wrap gap-6 font-semibold text-emerald-200 underline underline-offset-4">
          <Link href="/premium/regulamin">Regulamin Premium i dane sprzedawcy</Link>
          <Link href="/polityka-prywatnosci">Polityka prywatności</Link>
          <Link href="/kontakt">Kontakt i reklamacje</Link>
        </nav>
      </div>
    </main>
  );
}
