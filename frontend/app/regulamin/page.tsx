import Link from "next/link";

const sections = [
  {
    title: "§1 Postanowienia ogólne",
    items: [
      "Regulamin określa zasady korzystania z serwisu internetowego System-Strzelecki",
      "Właścicielem i administratorem serwisu jest właściciel domeny System-Strzelecki",
      "Serwis służy do organizacji, obsługi i publikacji wyników zawodów strzeleckich oraz prowadzenia rankingów i statystyk.",
    ],
  },
  {
    title: "§2 Definicje",
    items: [
      "Serwis - platforma internetowa dostępna pod adresem https://system-strzelecki.pl",
      "Użytkownik - osoba posiadająca konto w serwisie.",
      "Strzelec - użytkownik biorący udział w zawodach.",
      "Organizator - użytkownik organizujący zawody przy wykorzystaniu serwisu.",
      "Administrator - właściciel serwisu.",
    ],
  },
  {
    title: "§3 Rejestracja konta",
    items: [
      "Korzystanie z wybranych funkcji serwisu wymaga założenia konta.",
      "Użytkownik zobowiązany jest do podawania prawdziwych danych.",
      "Użytkownik odpowiada za bezpieczeństwo swojego hasła.",
      "Zabrania się udostępniania konta osobom trzecim.",
    ],
  },
  {
    title: "§4 Dane publikowane publicznie",
    items: [
      "Użytkownik wyraża zgodę na publikację następujących danych w związku z udziałem w zawodach oraz rankingach: imię i nazwisko, nazwa klubu sportowego, województwo zamieszkania, wyniki sportowe, pozycje rankingowe.",
      "Dane wskazane powyżej mogą być publicznie dostępne dla wszystkich użytkowników internetu.",
    ],
  },
  {
    title: "§5 Dane dostępne dla organizatorów",
    items: [
      "W przypadku zapisania się na zawody organizator może uzyskać dostęp do następujących danych uczestnika: imię i nazwisko, numer licencji zawodniczej PZSS, numer licencji sędziowskiej (jeżeli dotyczy), termin ważności licencji sędziowskiej, data urodzenia, adres e-mail, numer telefonu, nazwa klubu.",
      "Dane te są udostępniane wyłącznie w celu organizacji i przeprowadzenia zawodów.",
    ],
  },
  {
    title: "§6 Zdjęcie profilowe",
    items: [
      "Dodanie zdjęcia profilowego jest dobrowolne.",
      "Użytkownik ponosi odpowiedzialność za zgodność publikowanego zdjęcia z obowiązującym prawem.",
    ],
  },
  {
    title: "§7 Odpowiedzialność",
    items: [
      "Administrator dokłada należytej staranności w zakresie prawidłowego działania serwisu.",
      "Administrator nie odpowiada za błędne dane wprowadzone przez użytkowników.",
      "Administrator może czasowo ograniczyć dostęp do serwisu w związku z pracami technicznymi.",
    ],
  },
  {
    title: "§8 Usunięcie konta",
    items: [
      "Użytkownik może w każdej chwili wystąpić o usunięcie swojego konta.",
      "Dane niezbędne do zachowania integralności historycznych wyników zawodów mogą być przechowywane zgodnie z obowiązującymi przepisami prawa.",
    ],
  },
  {
    title: "§9 Postanowienia końcowe",
    items: [
      "Administrator może aktualizować regulamin.",
      "O istotnych zmianach użytkownicy zostaną poinformowani poprzez serwis.",
      "Regulamin obowiązuje od dnia publikacji.",
    ],
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white px-6 py-10 text-zinc-950 dark:bg-black dark:text-white">
      <article className="mx-auto w-full max-w-4xl">
        <p className="mb-3 text-sm font-bold uppercase text-green-700 dark:text-green-300">
          Dokument prawny
        </p>

        <h1 className="mb-6 text-4xl font-bold">
          Regulamin serwisu System-Strzelecki.pl
        </h1>

        <div className="space-y-8 rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-base leading-7 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="mb-3 text-2xl font-bold text-zinc-950 dark:text-white">
                {section.title}
              </h2>

              <ol className="list-decimal space-y-2 pl-5">
                {section.items.map((item) => (
                  <li key={item}>
                    {item}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>

        <Link
          href="/register"
          className="mt-8 inline-flex rounded-xl bg-green-900 px-5 py-3 font-semibold text-white transition hover:bg-green-800"
        >
          Powrót do rejestracji
        </Link>
      </article>
    </main>
  );
}
