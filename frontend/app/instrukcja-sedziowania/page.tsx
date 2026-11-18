import type { Metadata } from "next";
import Link from "next/link";
import { createPageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = createPageMetadata({
  path: "/instrukcja-sedziowania",
  title: "Sędziowanie i publikacja wyników | System Strzelecki",
  description: "Jak sędzia wprowadza i poprawia wyniki, a organizator sprawdza klasyfikacje i udostępnia komunikat zawodów.",
});

export default function JudgingGuidePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-green-950 to-zinc-950 px-5 py-12 text-white sm:px-8">
      <article className="mx-auto max-w-4xl">
        <p className="text-sm font-bold uppercase tracking-widest text-emerald-300">Poradnik sędziego i organizatora</p>
        <h1 className="mt-4 text-4xl font-black sm:text-5xl">Sędziowanie i publikacja wyników</h1>
        <p className="mt-5 text-lg leading-8 text-green-100">Od przypisania sędziego do sprawdzenia klasyfikacji i komunikatu zawodów.</p>
        <p className="mt-4 text-sm text-green-200">Autor: Piotr Bronny, właściciel portalu · Aktualizacja: <time dateTime="2026-11-18">18 listopada 2026</time></p>
        <nav aria-label="Przydatne odnośniki" className="mt-7 flex flex-wrap gap-4 font-bold text-emerald-200 underline underline-offset-4"><Link href="/dla-organizatorow">Oferta dla organizatorów</Link><Link href="/historical-results">Archiwum wyników</Link></nav>

        <div className="mt-10 space-y-8 leading-7 text-green-100">
          <section><h2 className="text-2xl font-bold text-white">1. Przygotuj dostęp</h2><p className="mt-3">Organizator przypisuje sędziów do zawodów lub konkurencji. Sędzia loguje się na konto osobiste i otwiera <Link className="font-bold text-emerald-200 underline" href="/judge">Panel Sędziego</Link>. Widzi przypisane opublikowane lub trwające zawody oraz dostępne dla swojej funkcji konkurencje. Sędzia główny widzi wszystkie konkurencje zawodów; przypisanie do całych zawodów również daje dostęp do wszystkich. Konto klubu PZSS nie służy do pracy w tym panelu. Gdy zawody wymagają licencjonowanego sędziego, konto musi mieć odpowiednią rolę.</p><p className="mt-3">Jeśli zawodów lub konkurencji nie widać, sprawdź z organizatorem publikację, przypisanie i konto użyte do logowania.</p></section>
          <section><h2 className="text-2xl font-bold text-white">2. Rozpocznij zawody i wpisz wynik</h2><p className="mt-3">Organizator rozpoczyna opublikowane zawody najwcześniej w dniu zawodów, po spełnieniu wymaganych warunków. Sędzia wybiera zawody i konkurencję, odnajduje zawodnika na liście i wprowadza wynik w odpowiednim ekranie. Zapis jest dostępny po rozpoczęciu i tylko dla zawodnika zapisanego do danej konkurencji. Sprawdź komunikat po zapisie.</p><p className="mt-3">Ekran zależy od konfiguracji: przy zwykłym wyniku użyj „Dodaj wynik”; w Trap i Skeet wprowadza się trafienia w ekranie grupy, a w konkurencjach z torami dostępne są pola wyniku toru. Inne formaty mają własne pola. Zawsze stosuj regulamin zawodów i sprawdź ustawienia konkurencji — ten opis nie potwierdza obsługi każdego regulaminu.</p></section>
          <section><h2 className="text-2xl font-bold text-white">Przykład na fikcyjnych danych</h2><p className="mt-3 rounded-xl border border-green-300/25 bg-black/20 p-4">W zwykłej konkurencji punktowej sędzia wybiera z listy fikcyjnego zawodnika „Zawodnik Testowy”, klika „Dodaj wynik” i wpisuje <strong>85</strong>. Po potwierdzeniu sprawdza komunikat i wartość przy zawodniku. Jeżeli prawidłowy wynik to 86, w trakcie zawodów wybiera „Edytuj wynik”, wpisuje 86 i ponownie sprawdza zapis. To przykład sposobu obsługi, bez danych rzeczywistej osoby; zasady punktacji ustala regulamin konkurencji.</p></section>
          <section><h2 className="text-2xl font-bold text-white">3. Sprawdź i popraw wyniki</h2><p className="mt-3">Podczas trwania zawodów uprawniony sędzia może poprawić wynik w odpowiednim ekranie; sposób poprawy zależy od rodzaju konkurencji. Organizator może otworzyć wyniki zawodów w swoim panelu i sprawdzić klasyfikacje. Po zakończeniu zapis przez panel sędziego jest zablokowany. Jeżeli błąd wykryto później, skontaktuj się z organizatorem i przez <Link className="font-bold text-emerald-200 underline" href="/kontakt">formularz kontaktowy</Link>; nie zakładaj możliwości samodzielnej korekty w panelu.</p><p className="mt-3">System automatycznie kończy trwające zawody o 22:00 w dniu zawodów lub przy późniejszej obsłudze po tej godzinie. Warto sprawdzić wyniki przed zakończeniem.</p></section>
          <section><h2 className="text-2xl font-bold text-white">4. Udostępnij wyniki</h2><p className="mt-3">Organizator sprawdza wyniki w panelu i może pobrać komunikat PDF lub arkusz Excel. Wyniki na żywo są dostępne po zalogowaniu z aktywnym Premium Strzelca. Zakończone zawody trafiają do archiwum, którego publiczna lista zawiera podsumowania. Dostęp do szczegółów zawodów zakończonych ponad trzy dni wcześniej wymaga Premium. Przed przekazaniem pliku sprawdź jego treść i zasady publikacji danych.</p><p className="mt-3">Szczegółowe zasady znajdziesz na stronie <Link className="font-bold text-emerald-200 underline" href="/publikacja-wynikow">publikacji wyników</Link> oraz w <Link className="font-bold text-emerald-200 underline" href="/dla-organizatorow">ofercie dla organizatorów</Link>.</p></section>
        </div>
      </article>
    </main>
  );
}
