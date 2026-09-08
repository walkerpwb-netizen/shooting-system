import type { Metadata } from "next";
import Link from "next/link";

import CompetitionsMapClient from "./CompetitionsMapClient";
import { apiUrl } from "@/lib/api";

export const metadata: Metadata = {
  title: "Mapa zawodów i szkoleń strzeleckich | System Strzelecki",
  description:
    "Znajdź zawody i szkolenia strzeleckie na mapie oraz sprawdź lokalizację nadchodzących, trwających i zakończonych wydarzeń.",
  openGraph: {
    title: "Mapa zawodów i szkoleń strzeleckich | System Strzelecki",
    description:
      "Mapa opublikowanych zawodów i szkoleń strzeleckich z dokładnymi lokalizacjami wydarzeń.",
    url: "/competitions/map",
    siteName: "System Strzelecki",
    type: "website",
  },
  alternates: {
    canonical: "/competitions/map",
  },
};

type CompetitionStatusTab = "upcoming" | "live" | "finished";

type Competition = {
  id: number;
  name: string;
  event_type?: "competition" | "training";
  date: string;
  location: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
};

type CompetitionsMapPageProps = {
  searchParams: Promise<{
    status?: string;
  }>;
};

const tabs: {
  key: CompetitionStatusTab;
  label: string;
  statuses: string[];
}[] = [
  {
    key: "live",
    label: "Trwające",
    statuses: ["started"],
  },
  {
    key: "upcoming",
    label: "Nadchodzące",
    statuses: ["published"],
  },
  {
    key: "finished",
    label: "Zakończone",
    statuses: ["completed"],
  },
];

async function getCompetitions() {
  const [competitionsResponse, trainingsResponse] = await Promise.all([
    fetch(apiUrl("/competitions"), { cache: "no-store" }),
    fetch(apiUrl("/trainings"), { cache: "no-store" }),
  ]);

  const competitions = competitionsResponse.ok
    ? await competitionsResponse.json()
    : [];
  const trainings = trainingsResponse.ok
    ? await trainingsResponse.json()
    : [];

  return [...competitions, ...trainings];
}

export default async function CompetitionsMapPage({
  searchParams,
}: CompetitionsMapPageProps) {
  const { status } = await searchParams;
  const competitions: Competition[] = await getCompetitions();
  const defaultTabKey: CompetitionStatusTab = competitions.some(
    (competition) => competition.status === "started"
  )
    ? "live"
    : "upcoming";
  const activeTab = tabs.find((tab) => tab.key === status)
    || tabs.find((tab) => tab.key === defaultTabKey)
    || tabs[0];
  const visibleCompetitions = competitions.filter((competition) =>
    activeTab.statuses.includes(competition.status)
  );

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="w-full">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="mb-2 text-4xl font-bold text-zinc-950 dark:text-white md:text-5xl">
              Mapa zawodów i szkoleń
            </h1>
            <p className="text-zinc-600 dark:text-gray-400">
              Zawody i szkolenia z dodaną dokładną lokalizacją
            </p>
          </div>

          <Link
            href={`/competitions?status=${activeTab.key}`}
            className="ui-button inline-flex w-full items-center justify-center rounded-xl bg-zinc-100 px-5 py-3 font-bold text-zinc-800 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700 md:w-auto"
          >
            Wróć do zawodów
          </Link>
        </div>

        <div className="mb-6 flex flex-wrap gap-3">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={`/competitions/map?status=${tab.key}`}
              className={`ui-button rounded-xl px-5 py-3 font-bold transition ${
                activeTab.key === tab.key
                  ? "bg-green-700 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <CompetitionsMapClient
          competitions={visibleCompetitions}
          emptyMessage="Brak zawodów i szkoleń z dodaną dokładną lokalizacją dla tego widoku."
        />
      </div>
    </main>
  );
}
