import Link from "next/link";

const publishedData = [
  "imienia i nazwiska",
  "nazwy klubu sportowego",
  "województwa zamieszkania",
  "uzyskanych wyników sportowych",
  "zajętych miejsc",
  "pozycji rankingowych",
  "historii startów w zawodach",
];

export default function ResultsPublicationPage() {
  return (
    <main className="min-h-screen bg-white px-6 py-10 text-zinc-950 dark:bg-black dark:text-white">
      <article className="mx-auto w-full max-w-4xl">
        <p className="mb-3 text-sm font-bold uppercase text-green-700 dark:text-green-300">
          Dokument prawny
        </p>

        <h1 className="mb-6 text-4xl font-bold">
          Zgoda na publikację wyników sportowych i danych rankingowych
        </h1>

        <div className="space-y-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-base leading-7 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
          <p>
            Rejestrując konto w serwisie System-Strzelecki.pl oraz biorąc udział w zawodach obsługiwanych przez serwis, przyjmuję do wiadomości, że istotą działania platformy jest publikacja wyników zawodów sportowych oraz tworzenie rankingów zawodników.
          </p>

          <p>
            Wyrażam zgodę na publikację i przetwarzanie następujących danych:
          </p>

          <ul className="list-disc space-y-2 pl-5">
            {publishedData.map((item) => (
              <li key={item}>
                {item}
              </li>
            ))}
          </ul>

          <p>
            Przyjmuję do wiadomości, że powyższe dane mogą być publicznie dostępne w sieci Internet dla wszystkich użytkowników serwisu oraz osób odwiedzających stronę.
          </p>

          <p>
            Rozumiem, że publikacja wyników zawodów i rankingów stanowi podstawową funkcjonalność serwisu System-Strzelecki.pl i jest niezbędna do prawidłowego działania platformy.
          </p>

          <p>
            Przyjmuję do wiadomości, że usunięcie konta użytkownika nie powoduje automatycznego usunięcia historycznych wyników zawodów, miejsc rankingowych oraz danych niezbędnych do zachowania integralności archiwum sportowego i rankingów.
          </p>

          <p>
            Potwierdzam, że zapoznałem się z Regulaminem oraz Polityką Prywatności serwisu System-Strzelecki.pl.
          </p>
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
