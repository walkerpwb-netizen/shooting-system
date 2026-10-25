import type { Metadata } from "next";
import Link from "next/link";
import { getPremiumData, type PremiumCommerce } from "@/lib/premiumCommerce";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Regulamin Premium | System Strzelecki", alternates: { canonical: "/premium/regulamin" } };

const sections = [
  {
    title: "2. Przedmiot usługi i wymagania techniczne",
    paragraphs: [
      "Premium jest odpłatną usługą cyfrową rozszerzającą funkcje konta w Systemie Strzeleckim. Pakiet Strzelca i pakiet Organizatora są odrębnymi usługami. Zakres wybranego pakietu i jego cena są prezentowane na stronie Premium oraz w podsumowaniu przed złożeniem zamówienia.",
      "Premium Organizatora umożliwia publikowanie więcej niż jednych aktywnych zawodów jednocześnie. Panel organizatora, tworzenie szkiców bez limitu, obsługa sędziów, wyników, PDF, raportów i statystyk pozostają bezpłatne. Premium nie obejmuje opłat startowych pobieranych przez organizatorów zawodów.",
      "Do korzystania z usługi potrzebne są: aktywne konto, dostęp do Internetu, aktualna przeglądarka obsługująca JavaScript, pliki cookie sesji i pamięć lokalną oraz działający adres e-mail. Premium nie wymaga instalowania dodatkowego płatnego oprogramowania. Użytkownik nie może dostarczać treści bezprawnych ani naruszać bezpieczeństwa systemu.",
    ],
  },
  {
    title: "3. Ceny i zawarcie umowy",
    paragraphs: [
      "Aktualny cennik jest dostępny publicznie pod adresem /premium. Podane kwoty w PLN są całkowitymi cenami do zapłaty za wybrany okres, z uwzględnieniem podatków, jeżeli mają zastosowanie. Serwis nie dolicza kosztów dostawy. Cena za rok dotyczy całego roku, a nie miesięcznej raty.",
      "Po uruchomieniu sprzedaży użytkownik wybierze pakiet i okres, zaloguje się lub zarejestruje i aktywuje konto, sprawdzi zakres i całkowitą cenę oraz zaakceptuje Regulamin Premium. Ostateczne zamówienie będzie wymagało osobnego, jednoznacznego potwierdzenia obowiązku zapłaty. Zmiana ceny przed potwierdzeniem wymaga ponownego sprawdzenia i akceptacji podsumowania.",
      "Umowa zostanie zawarta po potwierdzeniu skutecznej płatności przez operatora. Potwierdzenie warunków umowy i regulamin na trwałym nośniku zostaną przekazane na e-mail konta. Późniejsza zmiana cennika nie zmienia ceny zawartej umowy. Na żądanie kupującego sprzedawca wystawia dokument sprzedaży zgodnie z przepisami.",
    ],
  },
  {
    title: "4. Autopay i stan przygotowania sprzedaży",
    paragraphs: [
      "Planowanym operatorem płatności jest Autopay S.A. z siedzibą w Sopocie. Dostępne metody płatności będą prezentowane w bramce operatora po zatwierdzeniu integracji. Serwis nie przechowuje numerów kart ani danych logowania do banku.",
      "Obecnie sprzedaż i rzeczywiste płatności są wyłączone do czasu pozytywnej weryfikacji Autopay. Wybranie „Kup Premium”, logowanie lub wyświetlenie podsumowania nie zawiera umowy odpłatnej i nie powoduje obowiązku zapłaty.",
      "Testy są dostępne wyłącznie dla administratora w środowisku testowym Autopay. Testowe zamówienia nie pobierają rzeczywistych środków i nie aktywują Premium. Sam powrót z bramki płatności nie jest potwierdzeniem zapłaty; wiążące jest zweryfikowane powiadomienie operatora.",
    ],
  },
  {
    title: "5. Okres dostępu i zakończenie usługi",
    paragraphs: [
      "Pakiet jest przewidziany na jeden miesiąc albo jeden rok, zgodnie z wyborem w podsumowaniu. Opłata jest jednorazowa. Brak automatycznego odnawiania, cyklicznego obciążania rachunku lub karty i obowiązku zakupu kolejnego okresu.",
      "Po uruchomieniu sprzedaży dostęp będzie aktywowany po potwierdzeniu płatności: przed upływem terminu do odstąpienia wyłącznie na wyraźne żądanie użytkownika, a w pozostałych przypadkach po upływie tego terminu. Dokładna data rozpoczęcia i zakończenia dostępu będzie podana przed zamówieniem i w potwierdzeniu umowy.",
      "Po zakończeniu opłaconego okresu wygasają funkcje objęte Premium, a konto zachowuje dostęp do funkcji bezpłatnych. Zakończenie Premium samo w sobie nie usuwa konta ani zapisanych wyników. Zakończenie usługi wcześniej, reklamacje i odstąpienie można zgłosić sprzedawcy pod danymi z punktu 1.",
    ],
  },
  {
    title: "6. Prawo odstąpienia od umowy",
    paragraphs: [
      "Konsument oraz osoba fizyczna zawierająca umowę bezpośrednio związaną z jej działalnością gospodarczą, gdy umowa nie ma dla niej charakteru zawodowego, mogą odstąpić od umowy zawartej na odległość w ciągu 14 dni od jej zawarcia, bez podawania przyczyny.",
      "Wystarczy przed upływem terminu wysłać jednoznaczne oświadczenie e-mailem lub pocztą na adres sprzedawcy wskazany w punkcie 1. Można skorzystać z poniższego wzoru, lecz nie jest to obowiązkowe. Sprzedawca potwierdzi otrzymanie oświadczenia na trwałym nośniku.",
      "Zwrot należnej płatności nastąpi nie później niż w ciągu 14 dni od otrzymania oświadczenia, przy użyciu tej samej metody płatności, chyba że kupujący wyraźnie zgodzi się na inną metodę niewiążącą się z kosztami. Jeżeli na wyraźne żądanie użytkownika usługa rozpoczęła się przed upływem terminu do odstąpienia i użytkownik otrzymał wymagane prawem informacje, rozliczeniu podlega kwota proporcjonalna do świadczenia spełnionego do chwili odstąpienia. Bez takiego żądania lub wymaganych informacji użytkownik nie ponosi tych kosztów. Samo uruchomienie dostępu nie pozbawia prawa do odstąpienia.",
    ],
  },
  {
    title: "7. Reklamacje i zgodność usługi z umową",
    paragraphs: [
      "Sprzedawca odpowiada za zgodność usługi cyfrowej z umową przez okres jej dostarczania zgodnie z ustawą o prawach konsumenta. Zapewnia aktualizacje, w tym aktualizacje bezpieczeństwa, niezbędne do zachowania zgodności usługi z umową.",
      "Reklamację można złożyć e-mailem lub pocztą na dane z punktu 1. Warto podać e-mail konta, numer zamówienia, opis problemu i oczekiwane rozwiązanie. Brak numeru zamówienia nie wyłącza możliwości reklamacji. Sprzedawca odpowie na reklamację konsumenta w ciągu 14 dni od jej otrzymania.",
      "W razie braku zgodności z umową uprawniony kupujący może żądać doprowadzenia usługi do zgodności, a w przypadkach określonych przepisami także obniżenia ceny albo odstąpienia od umowy. Regulamin nie ogranicza ustawowych uprawnień kupującego. W sprawach płatności można skontaktować się ze sprzedawcą; zgłoszenie nie wymaga wcześniejszej reklamacji u operatora.",
      "Konsument może skorzystać z pomocy miejskiego lub powiatowego rzecznika konsumentów oraz informacji o pozasądowym rozwiązywaniu sporów dostępnych na stronie UOKiK. Skorzystanie z takich trybów zależy od zasad danego postępowania.",
    ],
  },
  {
    title: "8. Dane osobowe i postanowienia końcowe",
    paragraphs: [
      "Dane konta i zamówienia są przetwarzane w celu obsługi umowy, płatności, obowiązków prawnych, reklamacji i roszczeń. Szczegóły określa Polityka prywatności serwisu. Dane niezbędne do obsługi płatności mogą być przekazywane Autopay po uruchomieniu integracji, a w testach w zakresie potrzebnym do przeprowadzenia testu.",
      "Regulamin jest udostępniony bezpłatnie przed zamówieniem i można go zapisać lub wydrukować z przeglądarki. Do konkretnej umowy stosuje się wersję zaakceptowaną przy jej zawarciu. Aktualizacja regulaminu nie zmienia automatycznie warunków już zawartych umów ani nie ogranicza nabytych praw.",
      "W sprawach nieuregulowanych stosuje się właściwe przepisy prawa polskiego, w szczególności Kodeks cywilny, ustawę o prawach konsumenta i ustawę o świadczeniu usług drogą elektroniczną. Nie wyłącza to bezwzględnie obowiązującej ochrony przysługującej konsumentowi. Regulamin Premium uzupełnia ogólny Regulamin serwisu w zakresie usług Premium.",
    ],
  },
];

export default async function PremiumTermsPage() {
  const commerce = await getPremiumData<PremiumCommerce>("/premium/commerce");
  const seller = commerce?.seller;
  return (
    <main className="min-h-screen px-5 py-12 text-white print:bg-white print:text-black">
      <article className="mx-auto max-w-4xl space-y-8 rounded-3xl border border-green-800 bg-green-950 p-6 sm:p-10 print:border-0 print:bg-white">
        <header><Link href="/premium" className="text-emerald-200 underline print:text-black">Pakiety i cennik Premium</Link><h1 className="mt-5 text-4xl font-black">Regulamin Premium</h1><p className="mt-3">Wersja {commerce?.terms_version || "2026-10-25"}. Sprzedaż w przygotowaniu — płatności rzeczywiste wyłączone.</p></header>
        <section className="space-y-3 leading-7">
          <h2 className="text-2xl font-bold">1. Sprzedawca i kontakt</h2>
          {seller?.complete ? <address className="space-y-2 not-italic">
            <p><strong>{seller.name}</strong> — osoba fizyczna prowadząca działalność nierejestrowaną, bez wpisu do CEIDG.</p>
            <p className="whitespace-pre-line">Adres do korespondencji i reklamacji: {seller.address}</p>
            <p>E-mail: <a className="underline" href={`mailto:${seller.email}`}>{seller.email}</a></p>
            <p>Telefon: <a className="underline" href={`tel:${seller.phone.replace(/[^+\d]/g, "")}`}>{seller.phone}</a></p>
            {seller.nip && <p>NIP: {seller.nip}</p>}
          </address> : <div className="rounded-xl border border-amber-300/40 p-4 text-amber-100 print:text-black"><strong>Dane sprzedawcy oczekują na uzupełnienie.</strong> Sprzedawcą będzie osoba fizyczna prowadząca działalność nierejestrowaną. Przed rozpoczęciem sprzedaży zostaną opublikowane imię i nazwisko, adres, e-mail i telefon kontaktowy oraz NIP, jeśli został nadany. Do tego czasu sprzedaż pozostaje wyłączona.{seller?.email && <p className="mt-2">Kontakt z serwisem: <a className="underline" href={`mailto:${seller.email}`}>{seller.email}</a></p>}</div>}
        </section>
        {sections.map((section) => <section key={section.title} className="space-y-3 leading-7"><h2 className="text-2xl font-bold">{section.title}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>)}
        <section className="space-y-3 leading-7"><h2 className="text-2xl font-bold">Załącznik — wzór odstąpienia od umowy</h2><div className="space-y-3 rounded-xl border border-green-700 p-5"><p>Adresat: sprzedawca wskazany w punkcie 1 Regulaminu Premium.</p><p>Niniejszym informuję o odstąpieniu od umowy o świadczenie usługi Premium.</p><p>Data zawarcia umowy / numer zamówienia: …</p><p>Imię i nazwisko, adres oraz e-mail konta: …</p><p>Data: …</p><p>Podpis konsumenta (tylko przy przesłaniu na papierze): …</p></div></section>
        <nav className="flex flex-wrap gap-5 text-emerald-200 underline print:text-black"><Link href="/regulamin">Regulamin serwisu</Link><Link href="/polityka-prywatnosci">Polityka prywatności</Link><Link href="/kontakt">Kontakt</Link><a href="https://polubowne.uokik.gov.pl/">Pozasądowe rozwiązywanie sporów — UOKiK</a></nav>
      </article>
    </main>
  );
}
