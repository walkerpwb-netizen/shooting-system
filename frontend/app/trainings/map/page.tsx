import type { Metadata } from "next";
import Link from "next/link";

import CompetitionsMapClient from "@/app/competitions/map/CompetitionsMapClient";
import { apiUrl } from "@/lib/api";

export const metadata: Metadata = {
  title: "Mapa szkoleń i zawodów strzeleckich | System Strzelecki",
  description:
    "Znajdź szkolenia i zawody strzeleckie na mapie oraz sprawdź lokalizację nadchodzących, trwających i zakończonych wydarzeń.",
  openGraph: {
    title: "Mapa szkoleń i zawodów strzeleckich | System Strzelecki",
    description:
      "Mapa opublikowanych szkoleń i zawodów strzeleckich z dokładnymi lokalizacjami wydarzeń.",
    url: "/trainings/map",
    siteName: "System Strzelecki",
    type: "website",
  },
  alternates: {
    canonical: "/trainings/map",
  },
};

type TrainingStatusTab = "upcoming" | "live" | "finished";

type Training = {
  id: number;
  name: string;
  event_type?: "competition" | "training";
  date: string;
  location: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
};

type TrainingsMapPageProps = {
  searchParams: Promise<{
    status?: string;
  }>;
};

const tabs: {
  key: TrainingStatusTab;
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

async function getTrainings() {
  const [trainingsResponse, competitionsResponse] = await Promise.all([
    fetch(apiUrl("/trainings"), { cache: "no-store" }),
    fetch(apiUrl("/competitions"), { cache: "no-store" }),
  ]);

  const trainings = trainingsResponse.ok
    ? await trainingsResponse.json()
    : [];
  const competitions = competitionsResponse.ok
    ? await competitionsResponse.json()
    : [];

  return [...trainings, ...competitions];
}

export default async function TrainingsMapPage({
  searchParams,
}: TrainingsMapPageProps) {
  const { status } = await searchParams;
  const trainings: Training[] = await getTrainings();
  const defaultTabKey: TrainingStatusTab = trainings.some(
    (training) => training.status === "started"
  )
    ? "live"
    : "upcoming";
  const activeTab = tabs.find((tab) => tab.key === status)
    || tabs.find((tab) => tab.key === defaultTabKey)
    || tabs[0];
  const visibleTrainings = trainings.filter((training) =>
    activeTab.statuses.includes(training.status)
  );

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="w-full">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="mb-2 text-4xl font-bold text-zinc-950 dark:text-white md:text-5xl">
              Mapa szkoleń i zawodów
            </h1>
            <p className="text-zinc-600 dark:text-gray-400">
              Szkolenia i zawody z dodaną dokładną lokalizacją
            </p>
          </div>

          <Link
            href={`/trainings?status=${activeTab.key}`}
            className="ui-button inline-flex w-full items-center justify-center rounded-xl bg-zinc-100 px-5 py-3 font-bold text-zinc-800 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700 md:w-auto"
          >
            Wróć do szkoleń
          </Link>
        </div>

        <div className="mb-6 flex flex-wrap gap-3">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={`/trainings/map?status=${tab.key}`}
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
          competitions={visibleTrainings}
          emptyMessage="Brak szkoleń i zawodów z dodaną dokładną lokalizacją dla tego widoku."
        />
      </div>
    </main>
  );
}
