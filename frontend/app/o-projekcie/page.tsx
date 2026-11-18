import type { Metadata } from "next";
import Link from "next/link";
import SocialMediaIcons from "@/components/SocialMediaIcons";
import { createPageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = createPageMetadata({
  path: "/o-projekcie",
  title: "O projekcie | System Strzelecki",
  description: "Poznaj System Strzelecki, jego autora i wydawcę oraz sposoby kontaktu.",
});

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-green-950 to-zinc-950 px-5 py-12 text-white sm:px-8 sm:py-16">
      <div className="mx-auto max-w-4xl">
        <p className="text-sm font-bold uppercase tracking-widest text-emerald-300">System Strzelecki</p>
        <h1 className="mt-4 text-4xl font-black sm:text-6xl">O projekcie</h1>
        <p className="mt-6 text-lg leading-8 text-green-100">System Strzelecki pomaga w organizacji zawodów strzeleckich: od publikacji wydarzeń i zapisów, przez obsługę sędziowania, po wyniki. W serwisie znajdziesz również szkolenia i katalog strzelnic.</p>

        <section className="mt-10 rounded-2xl border border-green-300/20 bg-black/20 p-6 sm:p-8">
          <h2 className="text-2xl font-black">Autor i wydawca</h2>
          <p className="mt-4 leading-7 text-green-100">Autor: Piotr Bronny.</p>
          <p className="mt-3 leading-7 text-green-100">Wydawcą serwisu jest osoba fizyczna prowadząca działalność nierejestrowaną, bez wpisu do CEIDG.</p>
          <p className="mt-3 leading-7 text-green-100">Dane sprzedawcy Premium i warunki korzystania z usługi znajdziesz w <Link className="font-bold text-emerald-200 underline underline-offset-4" href="/premium/regulamin">regulaminie Premium</Link>.</p>
        </section>

        <section className="mt-10 rounded-2xl border border-green-300/20 bg-black/20 p-6 sm:p-8">
          <h2 className="text-2xl font-black">Kontakt i profile</h2>
          <p className="mt-4 leading-7 text-green-100">Masz pytanie o projekt lub chcesz porozmawiać o współpracy? Odwiedź stronę <Link className="font-bold text-emerald-200 underline underline-offset-4" href="/kontakt">kontaktu</Link> albo znajdź nas w mediach społecznościowych.</p>
          <div className="mt-5"><SocialMediaIcons /></div>
        </section>
      </div>
    </main>
  );
}
