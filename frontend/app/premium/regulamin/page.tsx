import type { Metadata } from "next";
import Link from "next/link";
import AutopayPaymentInfo from "@/components/AutopayPaymentInfo";
import PremiumSellerDetails from "@/components/PremiumSellerDetails";
import { getPremiumData, type PremiumCommerce } from "@/lib/premiumCommerce";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Regulamin Premium | System Strzelecki", alternates: { canonical: "/premium/regulamin" } };



export default async function PremiumTermsPage() {
  const commerce = await getPremiumData<PremiumCommerce>("/premium/commerce");
  const seller = commerce?.seller;
  const sections = await getPremiumData<{ title: string; paragraphs: string[] }[]>("/premium/terms");
  return (
    <main className="min-h-screen px-5 py-12 text-white print:bg-white print:text-black">
      <article className="mx-auto max-w-4xl space-y-8 rounded-3xl border border-green-800 bg-green-950 p-6 sm:p-10 print:border-0 print:bg-white">
        <header><Link href="/premium" className="text-emerald-200 underline print:text-black">Pakiety i cennik Premium</Link><h1 className="mt-5 text-4xl font-black">Regulamin Premium</h1><p className="mt-3">Wersja {commerce?.terms_version || "2026-10-26.2"}.</p></header>
        <section className="space-y-3 leading-7">
          <h2 className="text-2xl font-bold">1. Sprzedawca i kontakt</h2>
          <PremiumSellerDetails seller={seller} />
        </section>
        {sections?.map((section) => <section key={section.title} className="space-y-3 leading-7"><h2 className="text-2xl font-bold">{section.title}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>)}
        {!sections && <p role="alert">Nie udało się pobrać pełnej treści regulaminu. Odśwież stronę.</p>}
        <AutopayPaymentInfo />
        <section className="space-y-3 leading-7"><h2 className="text-2xl font-bold">Załącznik — wzór odstąpienia od umowy</h2><div className="space-y-3 rounded-xl border border-green-700 p-5"><p>Adresat: sprzedawca wskazany w punkcie 1 Regulaminu Premium.</p><p>Niniejszym informuję o odstąpieniu od umowy o świadczenie usługi Premium.</p><p>Data zawarcia umowy / numer zamówienia: …</p><p>Imię i nazwisko, adres oraz e-mail konta: …</p><p>Data: …</p><p>Podpis konsumenta (tylko przy przesłaniu na papierze): …</p></div></section>
        <nav className="flex flex-wrap gap-5 text-emerald-200 underline print:text-black"><Link href="/regulamin">Regulamin serwisu</Link><Link href="/polityka-prywatnosci">Polityka prywatności</Link><Link href="/kontakt">Kontakt</Link><a href="https://polubowne.uokik.gov.pl/">Pozasądowe rozwiązywanie sporów — UOKiK</a></nav>
      </article>
    </main>
  );
}
