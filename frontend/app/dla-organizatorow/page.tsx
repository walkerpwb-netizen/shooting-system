import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { createPageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = createPageMetadata({
  path: "/dla-organizatorow",
  title: "System do organizacji zawodów strzeleckich | System Strzelecki",
  description: "Poznaj panel organizatora: przygotowanie zawodów, zapisy, sędziowanie i wyniki. Sprawdź zasady publikacji i aktualny cennik.",
});

const steps = [
  { title: "1. Przygotuj zawody", text: "W panelu organizatora utwórz szkic, uzupełnij dane wydarzenia i konkurencje. Przed publikacją sprawdź termin zapisów i ustawienia zawodów." },
  { title: "2. Opublikuj i obsługuj zapisy", text: "Opublikowane zawody pojawią się w serwisie. W panelu sprawdzisz zapisy i obecność zawodników oraz przypiszesz sędziów do konkurencji." },
  { title: "3. Przeprowadź sędziowanie", text: "Po rozpoczęciu zawodów sędziowie wprowadzają wyniki na swoich ekranach. Sposób obsługi zależy od konkurencji; nie każda ma taki sam interfejs." },
  { title: "4. Udostępnij wyniki", text: "W panelu organizatora sprawdzisz wyniki i pobierzesz komunikat PDF lub arkusz Excel. Uczestnicy mogą korzystać z wyników i archiwum zgodnie z zasadami dostępu." },
];

export default function OrganizerOfferPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-green-950 to-zinc-950 px-5 py-12 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-bold uppercase tracking-widest text-emerald-300">Dla organizatorów zawodów</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-black sm:text-6xl">Organizuj zawody strzeleckie w jednym systemie</h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-green-100">Od przygotowania wydarzenia i zapisów, przez pracę sędziów, po wyniki i komunikat zawodów. Zobacz, jak zacząć i jakie są zasady publikacji.</p>
        <div className="mt-8 flex flex-wrap gap-3 font-bold">
          <Link href="/register" className="rounded-xl bg-emerald-300 px-6 py-3 text-green-950 hover:bg-white">Załóż konto</Link>
          <Link href="#jak-zaczac" className="rounded-xl border border-emerald-300/40 px-6 py-3 hover:bg-white/10">Jak zacząć</Link>
          <Link href="/kontakt" className="rounded-xl border border-emerald-300/40 px-6 py-3 hover:bg-white/10">Kontakt w sprawie wdrożenia</Link>
        </div>

        <section id="jak-zaczac" className="mt-16 scroll-mt-8">
          <h2 className="text-3xl font-black">Od szkicu do wyników</h2>
          <p className="mt-4 max-w-3xl leading-7 text-green-100">Załóż i aktywuj konto. Po zalogowaniu wybierz w menu „Panel Organizatora”, potwierdź przyjęcie roli i uzupełnij wymagane dane, w tym nazwę organizatora i telefon.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {steps.map((step) => <article key={step.title} className="rounded-2xl border border-green-300/20 bg-black/20 p-6"><h3 className="text-xl font-bold text-emerald-200">{step.title}</h3><p className="mt-3 leading-7 text-green-100">{step.text}</p></article>)}
          </div>
          <p className="mt-5 leading-7 text-green-100">Przed rozpoczęciem przypisz sędziów do wymagających tego konkurencji. Po rozpoczęciu edycja i usunięcie zawodów są zablokowane dla organizatora. <Link className="font-bold text-emerald-200 underline" href="/instrukcja-sedziowania">Przeczytaj instrukcję sędziowania i wyników</Link>.</p>
        </section>

        <section className="mt-16">
          <h2 className="text-3xl font-black">Zobacz ekrany systemu</h2>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <figure className="overflow-hidden rounded-2xl border border-green-300/20 bg-black/20"><Image src="/home-screens/organizer-panel.png" alt="Szczegóły zawodów w panelu organizatora z przypisywaniem sędziów" width={1200} height={750} className="h-auto w-full" /><figcaption className="p-4 text-green-100">Panel organizatora: zawody, sędziowie i wyniki.</figcaption></figure>
            <figure className="overflow-hidden rounded-2xl border border-green-300/20 bg-black/20"><Image src="/home-screens/judge-trap.png" alt="Ekran sędziowski konkurencji Trap" width={1200} height={750} className="h-auto w-full" /><figcaption className="p-4 text-green-100">Przykładowy ekran sędziowski konkurencji Trap.</figcaption></figure>
          </div>
        </section>

        <section className="mt-16 rounded-3xl border border-green-300/25 bg-black/20 p-6 sm:p-8">
          <h2 className="text-3xl font-black">Bezpłatnie i Premium</h2>
          <p className="mt-4 leading-7 text-green-100">Panel organizatora, szkice, sędziowie, wyniki, PDF i raporty są bezpłatne. Bez dodatkowej opłaty lub pakietu rocznego możesz mieć jedno aktywne opublikowane wydarzenie: zawody albo szkolenie. Liczba szkiców nie jest ograniczona.</p>
          <p className="mt-4 leading-7 text-green-100">Dodatkową publikację można opłacić jednorazowo albo wybrać roczny pakiet organizatora bez limitu publikacji. Dostępność płatności, aktualne ceny i pełne warunki sprawdzisz w cenniku.</p>
          <p className="mt-4 leading-7 text-green-100">Wyniki na żywo i ranking wymagają zalogowania i Premium Strzelca. Szczegółowe wyniki zawodów zakończonych ponad trzy dni wcześniej wymagają Premium; publiczne archiwum zawiera podsumowania zawodów.</p>
          <Link href="/premium" className="mt-6 inline-block font-bold text-emerald-200 underline underline-offset-4">Sprawdź aktualny cennik i warunki Premium</Link>
        </section>
        <nav aria-label="Dalsze kroki dla organizatora" className="mt-10 flex flex-wrap gap-6 font-bold text-emerald-200 underline underline-offset-4">
          <Link href="/register">Załóż konto</Link><Link href="/competitions">Zobacz zawody</Link><Link href="/kontakt">Porozmawiaj o wdrożeniu</Link>
        </nav>
      </div>
    </main>
  );
}
