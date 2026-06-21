import Link from "next/link";

const sections = [
  {
    title: "1. Administrator danych",
    content: [
      "Administratorem danych osobowych jest właściciel serwisu System-Strzelecki.pl.",
      "Kontakt: adres e-mail: walkerpwb@gmail.com",
    ],
  },
  {
    title: "2. Zakres przetwarzanych danych",
    content: [
      "Podczas korzystania z serwisu mogą być przetwarzane następujące dane:",
    ],
    groups: [
      {
        title: "Dane publiczne",
        items: [
          "imię i nazwisko",
          "nazwa klubu",
          "województwo zamieszkania",
          "wyniki zawodów",
          "pozycje rankingowe",
        ],
      },
      {
        title: "Dane dostępne wyłącznie dla organizatorów zawodów",
        items: [
          "numer licencji zawodniczej PZSS",
          "numer licencji sędziowskiej",
          "data ważności licencji sędziowskiej",
          "data urodzenia",
          "adres e-mail",
          "numer telefonu",
        ],
      },
      {
        title: "Dane dobrowolne",
        items: [
          "zdjęcie profilowe",
        ],
      },
    ],
  },
  {
    title: "3. Cele przetwarzania danych",
    content: [
      "Dane przetwarzane są w celu:",
    ],
    items: [
      "utworzenia i prowadzenia konta użytkownika",
      "organizacji zawodów sportowych",
      "publikacji wyników zawodów",
      "prowadzenia rankingów sportowych",
      "kontaktu z użytkownikiem",
      "zapewnienia bezpieczeństwa serwisu",
      "dochodzenia lub obrony roszczeń",
    ],
  },
  {
    title: "4. Udostępnianie danych",
    numberedGroups: [
      {
        intro: "Publicznie dostępne mogą być:",
        items: [
          "imię i nazwisko",
          "nazwa klubu",
          "województwo",
          "wyniki zawodów",
          "rankingi",
        ],
      },
      {
        intro: "Organizator zawodów, do których zapisze się użytkownik, może uzyskać dostęp do:",
        items: [
          "danych identyfikacyjnych uczestnika",
          "numerów licencji",
          "daty urodzenia",
          "adresu e-mail",
          "numeru telefonu",
        ],
      },
      {
        intro: "Dane nie są sprzedawane osobom trzecim.",
      },
    ],
  },
  {
    title: "5. Podstawa prawna przetwarzania",
    content: [
      "Dane przetwarzane są na podstawie:",
    ],
    items: [
      "art. 6 ust. 1 lit. b RODO - wykonanie umowy o świadczenie usług drogą elektroniczną",
      "art. 6 ust. 1 lit. f RODO - prawnie uzasadniony interes administratora polegający na prowadzeniu serwisu oraz publikacji wyników sportowych",
    ],
  },
  {
    title: "6. Okres przechowywania danych",
    content: [
      "Dane konta przechowywane są przez okres posiadania konta.",
      "Wyniki zawodów oraz dane niezbędne do zachowania historii sportowej mogą być przechowywane również po usunięciu konta użytkownika.",
    ],
  },
  {
    title: "7. Prawa użytkownika",
    content: [
      "Użytkownik ma prawo do:",
    ],
    items: [
      "dostępu do swoich danych",
      "sprostowania danych",
      "usunięcia danych",
      "ograniczenia przetwarzania",
      "wniesienia sprzeciwu",
      "przenoszenia danych",
      "wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych",
    ],
  },
  {
    title: "8. Bezpieczeństwo danych",
    content: [
      "Administrator stosuje środki techniczne i organizacyjne mające na celu ochronę danych przed nieuprawnionym dostępem, utratą lub zniszczeniem.",
    ],
  },
  {
    title: "9. Pliki cookies",
    content: [
      "Serwis wykorzystuje pliki cookies niezbędne do prawidłowego działania serwisu oraz poprawy komfortu korzystania z platformy.",
    ],
  },
  {
    title: "10. Zmiany polityki prywatności",
    content: [
      "Administrator może aktualizować niniejszą politykę prywatności. Aktualna wersja dokumentu będzie zawsze dostępna w serwisie.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-white px-6 py-10 text-zinc-950 dark:bg-black dark:text-white">
      <article className="mx-auto w-full max-w-4xl">
        <p className="mb-3 text-sm font-bold uppercase text-green-700 dark:text-green-300">
          Dokument prawny
        </p>

        <h1 className="mb-6 text-4xl font-bold">
          Polityka prywatności serwisu System-Strzelecki.pl
        </h1>

        <div className="space-y-8 rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-base leading-7 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="mb-3 text-2xl font-bold text-zinc-950 dark:text-white">
                {section.title}
              </h2>

              {section.content?.map((paragraph) => (
                <p key={paragraph} className="mb-3">
                  {paragraph}
                </p>
              ))}

              {section.items && (
                <ul className="list-disc space-y-2 pl-5">
                  {section.items.map((item) => (
                    <li key={item}>
                      {item}
                    </li>
                  ))}
                </ul>
              )}

              {section.groups?.map((group) => (
                <div key={group.title} className="mt-5">
                  <h3 className="mb-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    {group.title}
                  </h3>

                  <ul className="list-disc space-y-2 pl-5">
                    {group.items.map((item) => (
                      <li key={item}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {section.numberedGroups && (
                <ol className="list-decimal space-y-4 pl-5">
                  {section.numberedGroups.map((group) => (
                    <li key={group.intro}>
                      <p className={group.items ? "mb-2" : ""}>
                        {group.intro}
                      </p>

                      {group.items && (
                        <ul className="list-disc space-y-2 pl-5">
                          {group.items.map((item) => (
                            <li key={item}>
                              {item}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ol>
              )}
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
