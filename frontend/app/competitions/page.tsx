import CompetitionList from "../components/CompetitionList";

import { apiUrl } from "@/lib/api";

type CompetitionStatusTab = "upcoming" | "live" | "finished";

type Competition = {
  id: number;
  name: string;
  date: string;
  location: string;
  organizer_full_name: string;
  sponsors: string;
  participant_limit: number | null;
  shooters_count: number;
  status: string;
  disciplines_count: number;
};

type CompetitionsPageProps = {
  searchParams: Promise<{
    status?: string;
  }>;
};

const tabs: {
  key: CompetitionStatusTab;
  label: string;
  title: string;
  empty: string;
  statuses: string[];
}[] = [
  {
    key: "upcoming",
    label: "Nadchodzące zawody",
    title: "Nadchodzące Zawody",
    empty: "Brak nadchodzących zawodów.",
    statuses: ["published"],
  },
  {
    key: "live",
    label: "Aktualnie trwające zawody",
    title: "Aktualnie Trwające Zawody",
    empty: "Brak aktualnie trwających zawodów.",
    statuses: ["started"],
  },
  {
    key: "finished",
    label: "Zakończone zawody",
    title: "Zakończone Zawody",
    empty: "Brak zakończonych zawodów.",
    statuses: ["completed"],
  },
];

async function getCompetitions() {
  const response = await fetch(
    apiUrl("/competitions"),
    {
      cache: "no-store",
    }
  );

  if (!response.ok) {
    return [];
  }

  return response.json();
}

function parseCompetitionTime(dateValue: string) {
  const normalizedDate = dateValue.includes(".")
    ? dateValue.split(".").reverse().join("-")
    : dateValue;
  const time = new Date(`${normalizedDate}T00:00:00`).getTime();

  return Number.isNaN(time)
    ? 0
    : time;
}

export default async function CompetitionsPage({
  searchParams,
}: CompetitionsPageProps) {
  const { status = "upcoming" } = await searchParams;
  const activeTab = tabs.find((tab) => tab.key === status) || tabs[0];
  const competitions: Competition[] = await getCompetitions();
  const visibleCompetitions = competitions
    .filter((competition) => activeTab.statuses.includes(competition.status))
    .sort((firstCompetition, secondCompetition) => {
      const firstTime = parseCompetitionTime(firstCompetition.date);
      const secondTime = parseCompetitionTime(secondCompetition.date);

      return activeTab.key === "finished"
        ? secondTime - firstTime
        : firstTime - secondTime;
    });

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <div className="mb-10">
          <h1 className="text-5xl font-bold text-zinc-950 dark:text-white mb-2">
            {activeTab.title}
          </h1>

          <p className="text-zinc-600 dark:text-gray-400">
            Opublikowane zawody strzeleckie
          </p>
        </div>

        <div className="flex flex-wrap gap-3 mb-8">
          {tabs.map((tab) => (
            <a
              key={tab.key}
              href={`/competitions?status=${tab.key}`}
              className={`ui-button px-5 py-3 rounded-xl font-bold transition ${
                activeTab.key === tab.key
                  ? "bg-green-700 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700"
              }`}
            >
              {tab.label}
            </a>
          ))}
        </div>

        <CompetitionList
          competitions={visibleCompetitions}
          emptyMessage={activeTab.empty}
        />
      </div>
    </main>
  );
}
