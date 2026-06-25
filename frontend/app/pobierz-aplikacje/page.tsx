import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pobierz aplikację | System Strzelecki",
  description:
    "Instrukcja instalacji Systemu Strzeleckiego na telefonach z Androidem oraz na iPhone i iPadzie.",
};

const androidSteps = [
  {
    title: "Otwórz stronę w Chrome",
    description:
      "Uruchom przeglądarkę Google Chrome na telefonie lub tablecie i wejdź na stronę Systemu Strzeleckiego. Nie korzystaj z trybu incognito.",
  },
  {
    title: "Otwórz menu przeglądarki",
    description:
      "Dotknij ikony trzech kropek po prawej stronie paska adresu. W zależności od wersji Chrome może znajdować się u góry albo u dołu ekranu.",
  },
  {
    title: "Wybierz instalację",
    description:
      "Dotknij „Dodaj do ekranu głównego”, a następnie „Zainstaluj”. W niektórych wersjach Chrome opcja może od razu nazywać się „Zainstaluj aplikację”.",
  },
  {
    title: "Potwierdź",
    description:
      "Sprawdź nazwę aplikacji i potwierdź przyciskiem „Zainstaluj” lub „Dodaj”. Android umieści ikonę Systemu Strzeleckiego na ekranie głównym albo w szufladzie aplikacji.",
  },
  {
    title: "Uruchom aplikację",
    description:
      "Dotknij nowej ikony. System Strzelecki otworzy się w osobnym oknie, bez standardowego paska adresu przeglądarki.",
  },
];

const iosSteps = [
  {
    title: "Otwórz stronę w Safari",
    description:
      "Na iPhonie lub iPadzie uruchom Safari i wejdź na stronę Systemu Strzeleckiego. Safari jest zalecaną przeglądarką do instalacji aplikacji internetowej na iOS.",
  },
  {
    title: "Otwórz arkusz udostępniania",
    description:
      "Dotknij przycisku udostępniania — kwadratu ze strzałką skierowaną do góry. Przy niektórych układach Safari najpierw trzeba dotknąć przycisku menu, a następnie „Udostępnij”.",
  },
  {
    title: "Wybierz „Dodaj do ekranu Głównego”",
    description:
      "Przewiń listę działań i dotknij „Dodaj do ekranu Głównego”. Jeżeli tej pozycji nie widać, wybierz „Edytuj czynności” na dole listy i dodaj ją do dostępnych działań.",
  },
  {
    title: "Włącz tryb aplikacji",
    description:
      "Jeżeli pojawi się przełącznik „Otwieraj jako aplikację internetową” lub „Open as Web App”, pozostaw go włączonego. Dzięki temu strona będzie uruchamiana w osobnym oknie.",
  },
  {
    title: "Dodaj ikonę",
    description:
      "Sprawdź nazwę, dotknij „Dodaj” w prawym górnym rogu, a następnie znajdź ikonę Systemu Strzeleckiego na ekranie początkowym.",
  },
];

function StepList({
  steps,
}: {
  steps: Array<{ title: string; description: string }>;
}) {
  return (
    <ol className="mt-8 space-y-5">
      {steps.map((step, index) => (
        <li
          key={step.title}
          className="flex gap-4 rounded-2xl border border-white/10 bg-black/20 p-5"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-400 font-black text-emerald-950">
            {index + 1}
          </span>
          <div>
            <h3 className="text-lg font-black text-white">{step.title}</h3>
            <p className="mt-2 leading-7 text-zinc-300">{step.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function DownloadAppPage() {
  return (
    <main className="min-h-screen bg-[#031c18] text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.22),transparent_42%),linear-gradient(180deg,#073c35_0%,#031c18_100%)] px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
          <Image
            src="/icons/system-strzelecki-512.png"
            alt="Ikona aplikacji System Strzelecki"
            width={160}
            height={160}
            priority
            className="h-32 w-32 rounded-[2rem] shadow-2xl sm:h-40 sm:w-40"
          />
          <p className="mt-8 text-xs font-black uppercase tracking-[0.24em] text-emerald-300">
            Aplikacja internetowa PWA
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-[-0.04em] sm:text-6xl">
            Pobierz Aplikację
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-zinc-300">
            Dodaj System Strzelecki do ekranu głównego telefonu. Aplikacja będzie
            uruchamiać się w osobnym oknie i pozostanie zawsze pod ręką — bez
            pobierania jej ze sklepu Google Play lub App Store.
          </p>
          <div className="mt-8 rounded-xl border border-amber-300/30 bg-amber-300/10 px-5 py-4 text-left text-sm leading-6 text-amber-100">
            <strong>Ważne:</strong> obecna wersja wymaga połączenia z internetem.
            Instalacja nie włącza jeszcze trybu offline ani powiadomień push.
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-10 px-4 py-12 sm:px-6 sm:py-16">
        <section
          id="android"
          className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl sm:p-8 lg:p-10"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">
                Google Chrome
              </p>
              <h2 className="mt-2 text-3xl font-black sm:text-4xl">
                Instalacja na Androidzie
              </h2>
            </div>
            <span className="w-fit rounded-full border border-emerald-300/25 bg-emerald-300/10 px-4 py-2 text-sm font-bold text-emerald-100">
              Telefon lub tablet
            </span>
          </div>

          <StepList steps={androidSteps} />

          <div className="mt-7 rounded-2xl border border-sky-300/20 bg-sky-300/[0.08] p-5">
            <h3 className="font-black text-sky-100">
              Gdy widzisz tylko „Utwórz skrót”
            </h3>
            <p className="mt-2 leading-7 text-zinc-300">
              Możesz dodać skrót, ale najpierw odśwież stronę i ponownie sprawdź
              menu Chrome. Upewnij się też, że używasz aktualnej wersji
              przeglądarki i strony otwartej bezpośrednio w Chrome, a nie wewnątrz
              Facebooka, Messengera lub innej aplikacji.
            </p>
          </div>

          <a
            href="https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid"
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex font-bold text-emerald-300 underline decoration-emerald-300/40 underline-offset-4 hover:text-emerald-200"
          >
            Oficjalna instrukcja Google Chrome
          </a>
        </section>

        <section
          id="ios"
          className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl sm:p-8 lg:p-10"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">
                Apple Safari
              </p>
              <h2 className="mt-2 text-3xl font-black sm:text-4xl">
                Instalacja na iOS i iPadOS
              </h2>
            </div>
            <span className="w-fit rounded-full border border-emerald-300/25 bg-emerald-300/10 px-4 py-2 text-sm font-bold text-emerald-100">
              iPhone lub iPad
            </span>
          </div>

          <StepList steps={iosSteps} />

          <div className="mt-7 rounded-2xl border border-sky-300/20 bg-sky-300/[0.08] p-5">
            <h3 className="font-black text-sky-100">
              Gdy nie ma opcji „Dodaj do ekranu Głównego”
            </h3>
            <p className="mt-2 leading-7 text-zinc-300">
              Otwórz stronę bezpośrednio w Safari, nie w podglądzie linku innej
              aplikacji. W arkuszu udostępniania przewiń na sam dół, wybierz
              „Edytuj czynności” i włącz pozycję „Dodaj do ekranu Głównego”.
            </p>
          </div>

          <a
            href="https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios"
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex font-bold text-emerald-300 underline decoration-emerald-300/40 underline-offset-4 hover:text-emerald-200"
          >
            Oficjalna instrukcja Apple
          </a>
        </section>

        <section className="rounded-[2rem] border border-emerald-300/15 bg-emerald-300/[0.07] p-6 sm:p-8">
          <h2 className="text-2xl font-black">Po instalacji</h2>
          <ul className="mt-5 space-y-3 text-zinc-200">
            <li className="flex gap-3">
              <span className="font-black text-emerald-300">✓</span>
              Uruchamiaj System Strzelecki bezpośrednio z jego ikony.
            </li>
            <li className="flex gap-3">
              <span className="font-black text-emerald-300">✓</span>
              Logowanie i funkcje systemu działają tak samo jak w przeglądarce.
            </li>
            <li className="flex gap-3">
              <span className="font-black text-emerald-300">✓</span>
              Aktualizacje pojawiają się automatycznie przy kolejnym otwarciu
              strony — nie trzeba pobierać ich ze sklepu.
            </li>
          </ul>
        </section>

        <div className="text-center">
          <Link
            href="/"
            className="inline-flex rounded-xl bg-emerald-400 px-7 py-3.5 font-black text-emerald-950 transition hover:bg-emerald-300"
          >
            Wróć na stronę główną
          </Link>
        </div>
      </div>
    </main>
  );
}
