import type { Metadata } from "next";
import Link from "next/link";
import { createPageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = createPageMetadata({
  path: "/lista-kontrolna-organizacji-zawodow",
  title: "Lista kontrolna organizacji zawodów strzeleckich | System Strzelecki",
  description: "Przygotuj zawody strzeleckie krok po kroku: od ustaleń i zapisów po sprawdzenie wyników. Przykładowa lista kontrolna dla organizatora.",
});

export default function OrganizerChecklistPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-green-950 to-zinc-950 px-5 py-12 text-white sm:px-8">
      <article className="mx-auto max-w-4xl">
        <p className="text-sm font-bold uppercase tracking-widest text-emerald-300">Dla organizatorów</p>
        <h1 className="mt-4 text-4xl font-black sm:text-5xl">Lista kontrolna organizacji zawodów strzeleckich</h1>
        <p className="mt-5 text-lg leading-8 text-green-100">Uporządkuj przygotowania, podziel zadania i sprawdź informacje dla uczestników przed publikacją wydarzenia.</p>
        <p className="mt-4 text-sm text-green-200">Autor: Piotr Bronny · Aktualizacja: <time dateTime="2026-11-18">18 listopada 2026</time></p>
        <div className="mt-10 space-y-8 leading-7 text-green-100">
          <section><h2 className="text-2xl font-bold text-white">1. Ustal ramy wydarzenia</h2><ul className="mt-3 list-disc space-y-2 pl-6"><li>Ustal termin i miejsce ze strzelnicą, zakres konkurencji oraz przewidywaną liczbę uczestników.</li><li>Wyznacz osoby odpowiedzialne za organizację, bezpieczeństwo, sędziowanie i kontakt z uczestnikami. Uzgodnij z nimi zadania i zastępstwa.</li><li>Przygotuj regulamin i sprawdź wymagania właściwe dla wydarzenia, obiektu i konkurencji. Ta lista nie zastępuje regulaminu ani ustaleń z odpowiedzialnymi osobami.</li><li>Zaplanuj harmonogram, stanowiska, wyposażenie oraz sposób postępowania w razie zmiany planu.</li></ul></section>
          <section><h2 className="text-2xl font-bold text-white">2. Przygotuj informacje i zapisy</h2><ul className="mt-3 list-disc space-y-2 pl-6"><li>Podaj uczestnikom miejsce, termin, konkurencje, wymagania, koszty, termin zapisów i sposób kontaktu. Sprawdź, czy informacje są zgodne z regulaminem.</li><li>W panelu organizatora przygotuj szkic zawodów i konkurencje; przed publikacją sprawdź ustawienia i termin zapisów. Instrukcję rozpoczęcia pracy znajdziesz w <Link className="font-bold text-emerald-200 underline" href="/dla-organizatorow">ofercie dla organizatorów</Link>.</li><li>Przekaż uczestnikom <Link className="font-bold text-emerald-200 underline" href="/jak-sie-zapisac">instrukcję zapisów</Link> oraz sposób zgłaszania zmian po terminie.</li></ul></section>
          <section><h2 className="text-2xl font-bold text-white">3. Przed startem i w dniu zawodów</h2><ul className="mt-3 list-disc space-y-2 pl-6"><li>Potwierdź dostępność obiektu, osób i wyposażenia. Sprawdź listę zgłoszeń i plan obsługi uczestników.</li><li>Przypisz sędziów do wymagających tego konkurencji i upewnij się, że znają swoje zadania oraz sposób dostępu do panelu.</li><li>Przed rozpoczęciem sprawdź dane zawodów i konkurencji: po rozpoczęciu organizator nie może ich edytować ani usunąć w panelu.</li><li>Przekaż uczestnikom i obsłudze aktualny harmonogram oraz zasady obowiązujące na obiekcie.</li></ul></section>
          <section><h2 className="text-2xl font-bold text-white">4. Sprawdź wyniki i zakończ</h2><ul className="mt-3 list-disc space-y-2 pl-6"><li>Ustal, kto sprawdza wyniki i kto odpowiada na pytania uczestników. Sposób wpisywania i poprawiania wyników opisuje <Link className="font-bold text-emerald-200 underline" href="/instrukcja-sedziowania">instrukcja sędziowania</Link>.</li><li>Sprawdź klasyfikacje przed zakończeniem zawodów, następnie przygotuj i sprawdź komunikat. Zasady dostępu opisuje strona <Link className="font-bold text-emerald-200 underline" href="/publikacja-wynikow">publikacji wyników</Link>.</li><li>Po wydarzeniu zapisz uwagi zespołu: co się sprawdziło, co wymaga poprawy i kto zajmie się tym przed kolejnymi zawodami.</li></ul></section>
          <section className="rounded-xl border border-green-300/25 bg-black/20 p-5"><h2 className="text-2xl font-bold text-white">Przykład zastosowania listy</h2><p className="mt-3">Przykładowy klub planuje jednodniowe zawody z dwiema konkurencjami. Przed ogłoszeniem potwierdza termin ze strzelnicą, wyznacza osoby do kontaktu i sędziowania, przygotowuje regulamin oraz sprawdza limit i termin zapisów. Następnie tworzy szkic obu konkurencji, przypisuje sędziów i przed startem sprawdza listę zgłoszeń. Po zawodach osoba odpowiedzialna porównuje klasyfikacje z zapisanymi wynikami i sprawdza komunikat. To fikcyjny scenariusz, a szczegóły należy dostosować do danego wydarzenia.</p></section>
          <section className="border-t border-green-300/25 pt-8"><h2 className="text-2xl font-bold text-white">Podstawa i dalsze kroki</h2><p className="mt-3">Opis funkcji portalu opiera się na <Link className="font-bold text-emerald-200 underline" href="/dla-organizatorow">instrukcji dla organizatorów</Link> oraz instrukcjach <Link className="font-bold text-emerald-200 underline" href="/jak-sie-zapisac">zapisów</Link> i <Link className="font-bold text-emerald-200 underline" href="/instrukcja-sedziowania">sędziowania</Link>. Ustalenia dotyczące konkretnego wydarzenia sprawdź z jego organizatorem i obiektem.</p></section>
        </div>
      </article>
    </main>
  );
}
