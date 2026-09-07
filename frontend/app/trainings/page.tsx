import type { Metadata } from "next";

import CompetitionList from "../components/CompetitionList";
import CompetitionParticipationFilterButton from "../components/CompetitionParticipationFilterButton";

import { apiUrl } from "@/lib/api";

export const metadata: Metadata = {
  title: "Szkolenia strzeleckie | System Strzelecki",
  description:
    "Przeglądaj opublikowane szkolenia strzeleckie: nadchodzące, trwające i zakończone wydarzenia z datą, lokalizacją oraz szczegółami organizatora.",
  openGraph: {
    title: "Szkolenia strzeleckie | System Strzelecki",
    description:
      "Lista opublikowanych szkoleń strzeleckich z datami, lokalizacjami i szczegółami wydarzeń.",
    url: "/trainings",
    siteName: "System Strzelecki",
    type: "website",
  },
  alternates: {
    canonical: "/trainings",
  },
};

type TrainingStatusTab = "upcoming" | "live" | "finished" | "joined";

type Training = {
  id: number;
  name: string;
  event_type?: "competition" | "training";
  date: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  organizer_full_name: string;
  organizer_logo: string;
  sponsors: string;
  sponsor_logo: string;
  participant_limit: number | null;
  pzss_license_calendar: boolean;
  shooters_count: number;
  status: string;
  disciplines_count: number;
};

type TrainingsPageProps = {
  searchParams: Promise<{
    status?: string;
  }>;
};

const tabs: {
  key: Exclude<TrainingStatusTab, "joined">;
  label: string;
  title: string;
  empty: string;
  statuses: string[];
}[] = [
  {
    key: "live",
    label: "Aktualnie trwające szkolenia",
    title: "Aktualnie Trwające Szkolenia",
    empty: "Brak aktualnie trwających szkoleń.",
    statuses: ["started"],
  },
  {
    key: "upcoming",
    label: "Nadchodzące szkolenia",
    title: "Nadchodzące Szkolenia",
    empty: "Brak nadchodzących szkoleń.",
    statuses: ["published"],
  },
  {
    key: "finished",
    label: "Zakończone szkolenia",
    title: "Zakończone Szkolenia",
    empty: "Brak zakończonych szkoleń.",
    statuses: ["completed"],
  },
];

async function getTrainings() {
  const response = await fetch(
    apiUrl("/trainings"),
    {
      cache: "no-store",
    }
  );

  if (!response.ok) {
    return [];
  }

  return response.json();
}

function parseTrainingTime(dateValue: string) {
  const normalizedDate = dateValue.includes(".")
    ? dateValue.split(".").reverse().join("-")
    : dateValue;
  const time = new Date(`${normalizedDate}T00:00:00`).getTime();

  return Number.isNaN(time)
    ? 0
    : time;
}

export default async function TrainingsPage({
  searchParams,
}: TrainingsPageProps) {
  const { status } = await searchParams;
  const trainings: Training[] = await getTrainings();
  const defaultTabKey: TrainingStatusTab = trainings.some(
    (training) => training.status === "started"
  )
    ? "live"
    : "upcoming";
  const joinedTab = {
    key: "joined" as const,
    title: "Szkolenia, w których bierzesz udział",
    empty: "Nie bierzesz udziału w nadchodzących ani trwających szkoleniach.",
    statuses: ["published", "started"],
  };
  const activeTab = status === "joined"
    ? joinedTab
    : tabs.find((tab) => tab.key === status)
    || tabs.find((tab) => tab.key === defaultTabKey)
    || tabs[0];
  const visibleTrainings = trainings
    .filter((training) => activeTab.statuses.includes(training.status))
    .sort((firstTraining, secondTraining) => {
      const firstTime = parseTrainingTime(firstTraining.date);
      const secondTime = parseTrainingTime(secondTraining.date);

      return activeTab.key === "finished"
        ? secondTime - firstTime
        : firstTime - secondTime;
    });

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="w-full">
        <div className="mb-10">
          <h1 className="text-5xl font-bold text-zinc-950 dark:text-white mb-2">
            {activeTab.title}
          </h1>

          <p className="text-zinc-600 dark:text-gray-400">
            Opublikowane szkolenia strzeleckie
          </p>
        </div>

        <div className="flex flex-wrap gap-3 mb-8">
          {tabs.map((tab) => (
            <a
              key={tab.key}
              href={`/trainings?status=${tab.key}`}
              className={`ui-button px-5 py-3 rounded-xl font-bold transition ${
                activeTab.key === tab.key
                  ? "bg-green-700 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700"
              }`}
            >
              {tab.label}
            </a>
          ))}

          <CompetitionParticipationFilterButton
            competitions={trainings}
            isActive={activeTab.key === "joined"}
            href="/trainings?status=joined"
            label="Moje szkolenia"
            entriesEndpoint="/trainings/my-entries"
          />
        </div>

        <CompetitionList
          competitions={visibleTrainings}
          emptyMessage={activeTab.empty}
          dateSortDirection={activeTab.key === "finished" ? "desc" : "asc"}
          mapHref={`/trainings/map?status=${activeTab.key === "joined" ? "upcoming" : activeTab.key}`}
          onlyMyEntries={activeTab.key === "joined"}
          entriesEndpoint="/trainings/my-entries"
          detailsHrefBase="/trainings"
          labels={{
            filterPlaceholder: "Filtruj po nazwie szkolenia",
            mapButton: "Szukaj szkoleń na mapie",
            nameHeader: "Nazwa szkolenia",
            loadingJoined: "Ładowanie Twoich szkoleń...",
            emptyFiltered: "Brak szkoleń pasujących do filtra.",
            shareTitle: "Skopiuj link do szkolenia",
          }}
        />
      </div>
    </main>
  );
}
