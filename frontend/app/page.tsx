import Image from "next/image";
import Link from "next/link";

import TrackedAdSlot from "@/components/TrackedAdSlot";

type FeatureKind =
  | "qr"
  | "organizer"
  | "live"
  | "judge"
  | "history"
  | "ranking";

type Feature = {
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  kind: FeatureKind;
};

const features: Feature[] = [
  {
    eyebrow: "QR zawodnika",
    title: "Skanuj zawodników w kilka sekund",
    description:
      "Każdy zawodnik posiada własny kod QR na licencji i w profilu. Organizator lub sędzia może zeskanować go podczas rejestracji albo bezpośrednio na stanowisku — bez ręcznego wyszukiwania danych.",
    bullets: [
      "szybka identyfikacja zawodnika",
      "mniej pomyłek przy obsłudze",
      "działa na telefonie, tablecie i komputerze",
    ],
    kind: "qr",
  },
  {
    eyebrow: "Panel organizatora",
    title: "Zarządzaj zawodami z jednego miejsca",
    description:
      "Twórz i publikuj zawody, zarządzaj zapisami, sędziami oraz wynikami bez pracy w wielu osobnych plikach. Panel jest prosty, czytelny i przygotowany pod realną obsługę zawodów.",
    bullets: [
      "aktualne i historyczne zawody",
      "publikacja i zakończenie zawodów",
      "dostęp do wyników, sędziów i szczegółów",
    ],
    kind: "organizer",
  },
  {
    eyebrow: "Wyniki na żywo",
    title: "Wyniki aktualizowane na bieżąco",
    description:
      "Zawodnicy, trenerzy i kibice mogą śledzić wyniki w trakcie trwania zawodów. Klasyfikacja aktualizuje się po każdym wpisanym wyniku — bez czekania na końcowy komunikat.",
    bullets: [
      "podgląd wyników live",
      "klasyfikacje w czasie rzeczywistym",
      "dostęp z telefonu, tabletu i komputera",
    ],
    kind: "live",
  },
  {
    eyebrow: "Interfejs sędziowski",
    title: "Czytelne ekrany do pracy na strzelnicy",
    description:
      "Interfejsy sędziowskie pozwalają szybko wprowadzać wyniki podczas zawodów. Bez zbędnych kliknięć, chaosu i szukania zawodnika na długiej liście.",
    bullets: [
      "szybkie wpisywanie wyników",
      "obsługa różnych konkurencji",
      "wygoda pracy na stanowisku",
    ],
    kind: "judge",
  },
  {
    eyebrow: "Historia wyników",
    title: "Historia startów zawodnika",
    description:
      "Zawodnik gromadzi swoje wyniki i starty w jednym miejscu. Może łatwo sprawdzić postępy, poprzednie zawody i osiągnięcia z różnych konkurencji.",
    bullets: [
      "archiwum wyników",
      "historia startów",
      "podgląd osiągnięć sportowych",
    ],
    kind: "history",
  },
  {
    eyebrow: "Rankingi",
    title: "Rankingi regionalne i ogólnopolskie",
    description:
      "System może automatycznie tworzyć rankingi na podstawie wyników zawodników. To dodatkowa motywacja do startów i prosty sposób porównywania osiągnięć w różnych konkurencjach.",
    bullets: [
      "rankingi zawodników",
      "klasyfikacje regionalne",
      "zestawienia ogólnopolskie",
    ],
    kind: "ranking",
  },
];

const featureScreens: Record<FeatureKind, { src: string; alt: string }> = {
  qr: {
    src: "/home-screens/qr-attendance.png",
    alt: "Lista obecności i opłat z szybkim skanowaniem licencji QR",
  },
  organizer: {
    src: "/home-screens/organizer-panel.png",
    alt: "Panel organizatora zawodów z obsługą sędziów, opłat i grup",
  },
  live: {
    src: "/home-screens/live-groups.png",
    alt: "Bieżący status grup startowych podczas zawodów",
  },
  judge: {
    src: "/home-screens/judge-trap.png",
    alt: "Pełnoekranowy interfejs sędziowski konkurencji Trap",
  },
  history: {
    src: "/home-screens/history-statistics.png",
    alt: "Statystyki i historia startów zawodnika",
  },
  ranking: {
    src: "/home-screens/live-ranking.png",
    alt: "Ranking zawodników aktualizowany podczas zawodów",
  },
};

function FeatureScreen({ kind }: { kind: FeatureKind }) {
  const screen = featureScreens[kind];

  return (
    <div className="relative mx-auto w-full max-w-[650px]">
      <div className="absolute -inset-4 rounded-[2rem] bg-emerald-400/10 blur-2xl" />
      <div className="relative overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#071713] shadow-[0_28px_80px_rgba(0,0,0,0.38)]">
        <Image
          src={screen.src}
          alt={screen.alt}
          width={2880}
          height={1578}
          sizes="(min-width: 1024px) 650px, 100vw"
          className="h-auto w-full"
        />
      </div>
    </div>
  );
}

function FeatureSection({ feature, reversed }: { feature: Feature; reversed: boolean }) {
  return (
    <section className="grid items-center gap-10 py-14 lg:grid-cols-2 lg:gap-16 lg:py-24">
      <div className={reversed ? "lg:order-2" : ""}>
        <FeatureScreen kind={feature.kind} />
      </div>

      <div className={reversed ? "lg:order-1" : ""}>
        <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">
          {feature.eyebrow}
        </p>
        <h2 className="mt-4 max-w-xl text-3xl font-black leading-tight tracking-[-0.03em] text-white sm:text-4xl">
          {feature.title}
        </h2>
        <p className="mt-5 max-w-xl text-base leading-7 text-zinc-300 sm:text-lg">
          {feature.description}
        </p>
        <ul className="mt-7 space-y-3">
          {feature.bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-3 text-sm font-semibold text-zinc-200 sm:text-base">
              <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-400/12 text-xs text-emerald-300">
                ✓
              </span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#031c18] text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 4%, rgba(24, 160, 135, 0.28), transparent 28%), radial-gradient(circle at 12% 42%, rgba(16, 185, 129, 0.08), transparent 22%), linear-gradient(180deg, #073c35 0%, #031f1b 32%, #020d0b 100%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative">
        <TrackedAdSlot
          slot="home_mobile_top"
          device="mobile"
          placement="Mobilny baner reklamowy"
          className="min-h-20 border-x-0 border-t-0 bg-[#062c27]/95 lg:hidden"
        />

        <div className="mx-auto grid w-full max-w-[1600px] gap-8 px-4 pb-16 sm:px-6 lg:grid-cols-[160px_minmax(0,1120px)_160px] lg:justify-center lg:px-6">
          <TrackedAdSlot
            slot="home_desktop_left"
            device="desktop"
            placement="Lewa kolumna reklamowa"
            className="sticky top-6 mt-8 hidden h-[600px] rounded-2xl bg-[#062c27]/75 lg:flex"
          />

          <div className="min-w-0">
            <section className="flex min-h-[calc(100vh-3rem)] flex-col items-center justify-center pb-14 pt-16 text-center sm:pt-20 lg:min-h-[760px] lg:pb-20 lg:pt-20">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/8 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200 sm:text-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.9)]" />
                Wszystko, czego potrzebują zawody
              </div>

              <h1 className="mt-7 w-full text-4xl font-black leading-[0.98] tracking-[-0.055em] text-white sm:text-6xl lg:text-[clamp(4.75rem,5vw,6rem)]">
                System Organizacji
                <span className="block text-emerald-300">Zawodów Strzeleckich</span>
              </h1>

              <p className="mt-8 max-w-3xl text-base leading-7 text-zinc-300 sm:text-xl sm:leading-8">
                Kompleksowy system do obsługi zawodów strzeleckich. Rejestracja zawodników,
                sędziowanie, wyniki na żywo, rankingi i historia startów w jednym miejscu.
              </p>

              <div className="mt-9 flex w-full max-w-md flex-col justify-center gap-3 sm:w-auto sm:max-w-none sm:flex-row">
                <Link
                  href="/register"
                  className="rounded-xl bg-emerald-400 px-7 py-3.5 text-sm font-black text-[#05221d] shadow-[0_12px_35px_rgba(52,211,153,0.2)] transition hover:-translate-y-0.5 hover:bg-emerald-300"
                >
                  Załóż konto
                </Link>
                <Link
                  href="/competitions"
                  className="rounded-xl border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-black text-white transition hover:-translate-y-0.5 hover:border-emerald-300/50 hover:bg-white/10"
                >
                  Przeglądaj zawody
                </Link>
              </div>

              <Image
                src="/icons/system-strzelecki-logo-20260623.png"
                alt="Logo Systemu Organizacji Zawodów Strzeleckich"
                width={1560}
                height={1008}
                priority
                sizes="(min-width: 1024px) 430px, (min-width: 640px) 360px, 280px"
                className="mt-10 h-auto w-[280px] drop-shadow-[0_22px_40px_rgba(0,0,0,0.5)] sm:w-[360px] lg:w-[430px]"
              />
            </section>

            <div className="border-t border-white/8">
              {features.map((feature, index) => (
                <FeatureSection
                  key={feature.title}
                  feature={feature}
                  reversed={index % 2 === 1}
                />
              ))}
            </div>

            <section className="my-12 overflow-hidden rounded-[2rem] border border-emerald-300/15 bg-emerald-300/[0.07] px-6 py-12 text-center shadow-[0_24px_80px_rgba(0,0,0,0.2)] sm:px-10 sm:py-16">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">
                Gotowy na start?
              </p>
              <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl">
                Organizuj zawody sprawniej
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-zinc-300">
                Załóż konto lub zobacz zawody dostępne już teraz.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  href="/register"
                  className="rounded-xl bg-emerald-400 px-7 py-3.5 text-sm font-black text-[#05221d] transition hover:bg-emerald-300"
                >
                  Załóż konto
                </Link>
                <Link
                  href="/competitions"
                  className="rounded-xl border border-white/15 px-7 py-3.5 text-sm font-black text-white transition hover:bg-white/10"
                >
                  Zobacz zawody
                </Link>
              </div>
            </section>
          </div>

          <TrackedAdSlot
            slot="home_desktop_right"
            device="desktop"
            placement="Prawa kolumna reklamowa"
            className="sticky top-6 mt-8 hidden h-[600px] rounded-2xl bg-[#062c27]/75 lg:flex"
          />
        </div>
      </div>
    </main>
  );
}
