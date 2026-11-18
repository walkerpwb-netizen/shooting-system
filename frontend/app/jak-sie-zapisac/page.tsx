import type { Metadata } from "next";
import Link from "next/link";
import { createPageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = createPageMetadata({
  path: "/jak-sie-zapisac",
  title: "Jak zapisać się na zawody i szkolenia | System Strzelecki",
  description: "Instrukcja zapisów na zawody i szkolenia: konto, wybór konkurencji lub bloków, opłaty, terminy i potwierdzenie zgłoszenia.",
});

export default function RegistrationGuidePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-green-950 to-zinc-950 px-5 py-12 text-white sm:px-8">
      <article className="mx-auto max-w-4xl">
        <p className="text-sm font-bold uppercase tracking-widest text-emerald-300">Poradnik uczestnika</p>
        <h1 className="mt-4 text-4xl font-black sm:text-5xl">Jak zapisać się na zawody lub szkolenie</h1>
        <p className="mt-5 text-lg leading-8 text-green-100">Sprawdź wydarzenie, przygotuj konto i potwierdź wybór w formularzu zapisów.</p>
        <p className="mt-4 text-sm text-green-200">Autor: Piotr Bronny, właściciel portalu · Aktualizacja: <time dateTime="2026-11-18">18 listopada 2026</time></p>
        <nav aria-label="Listy wydarzeń" className="mt-7 flex flex-wrap gap-4 font-bold text-emerald-200 underline underline-offset-4"><Link href="/competitions">Zobacz zawody</Link><Link href="/trainings">Zobacz szkolenia</Link></nav>

        <div className="mt-10 space-y-8 leading-7 text-green-100">
          <section><h2 className="text-2xl font-bold text-white">1. Wybierz wydarzenie</h2><p className="mt-3">Otwórz listę zawodów albo szkoleń i przejdź do szczegółów wybranego wydarzenia. Sprawdź opis, termin, miejsce, wymagania organizatora, opłaty oraz termin i limit zapisów, jeśli zostały podane.</p></section>
          <section><h2 className="text-2xl font-bold text-white">2. Przygotuj konto i profil</h2><p className="mt-3">Zaloguj się na osobiste konto. Jeśli go nie masz, <Link className="font-bold text-emerald-200 underline" href="/register">zarejestruj się</Link> i aktywuj je linkiem z e-maila. Uzupełnij profil: imię, nazwisko, województwo, datę urodzenia, klub i numer licencji albo odpowiednio zaznacz brak klubu i licencji. Konto klubu PZSS nie służy do zapisu uczestnika. Warunki udziału określa także organizator wydarzenia.</p></section>
          <section><h2 className="text-2xl font-bold text-white">3. Wybierz konkurencje lub bloki</h2><p className="mt-3">Na stronie wydarzenia wybierz „Zapisz się”. Zaznacz co najmniej jedną konkurencję albo blok szkolenia, jeśli są dostępne. W szkoleniu bez bloków nie ma takiego wyboru. Przy każdej wybranej pozycji wskaż amunicję własną lub klubową; w konkurencjach dynamicznych uzupełnij dywizję i Power Factor, jeśli nie są ustalone z góry.</p><p className="mt-3 rounded-xl border border-green-300/25 bg-black/20 p-4"><strong>Przykład:</strong> jeśli wybierasz dwie konkurencje, zaznacz obie i wybierz rodzaj amunicji osobno dla każdej. Dostępne opcje zależą od wydarzenia.</p></section>
          <section><h2 className="text-2xl font-bold text-white">4. Sprawdź sumę i potwierdź zapis</h2><p className="mt-3">Sprawdź podsumowanie i wybierz „Potwierdź zapis”. Suma może obejmować opłatę za wydarzenie lub wybrane pozycje, amunicję i rzutki oraz rabat klubowy, gdy ma zastosowanie. Pokazaną opłatę uiszcza się organizatorowi w dniu wydarzenia. Opłata za udział jest odrębna od pakietu Premium; sam zapis nie wymaga Premium.</p></section>
          <section><h2 className="text-2xl font-bold text-white">5. Sprawdź komunikat</h2><p className="mt-3">Przed rozpoczęciem wydarzenia poprawny zapis potwierdza komunikat o zapisaniu. Przy zgłoszeniu do wydarzenia już trwającego komunikat informuje o oczekiwaniu na potwierdzenie udziału i opłaty przez organizatora, zanim uczestnik pojawi się na liście.</p></section>
          <section className="border-t border-green-300/25 pt-8"><h2 className="text-2xl font-bold text-white">Częste pytania</h2><h3 className="mt-5 text-lg font-bold text-emerald-200">Dlaczego nie mogę się zapisać?</h3><p className="mt-2">Sprawdź, czy konto jest aktywne, profil kompletny, termin zapisów nie minął, a limit miejsc nie został osiągnięty. Zakończone wydarzenie nie przyjmuje zapisów. Jeśli problem pozostaje, skontaktuj się z organizatorem lub przez <Link className="font-bold text-emerald-200 underline" href="/kontakt">formularz kontaktowy</Link>.</p><h3 className="mt-5 text-lg font-bold text-emerald-200">Czy mogę się wypisać?</h3><p className="mt-2">Na stronie wydarzenia wybierz „Wypisz się” i potwierdź decyzję. System blokuje wypisanie na 48 godzin przed datą wydarzenia, liczoną od początku tej daty, oraz później. W sprawie zmian po terminie skontaktuj się z organizatorem.</p></section>
        </div>
      </article>
    </main>
  );
}
