import CompetitionList from "../components/CompetitionList";
import CompetitionParticipationFilterButton from "../components/CompetitionParticipationFilterButton";

import { apiUrl } from "@/lib/api";

type CompetitionStatusTab = "upcoming" | "live" | "finished" | "joined";

type Competition = {
  id: number;
  name: string;
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

type CompetitionsPageProps = {
  searchParams: Promise<{
    status?: string;
  }>;
};

const tabs: {
  key: Exclude<CompetitionStatusTab, "joined">;
  label: string;
  title: string;
  empty: string;
  statuses: string[];
}[] = [
  {
    key: "live",
    label: "Aktualnie trwające zawody",
    title: "Aktualnie Trwające Zawody",
    empty: "Brak aktualnie trwających zawodów.",
    statuses: ["started"],
  },
  {
    key: "upcoming",
    label: "Nadchodzące zawody",
    title: "Nadchodzące Zawody",
    empty: "Brak nadchodzących zawodów.",
    statuses: ["published"],
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
  const { status } = await searchParams;
  const competitions: Competition[] = await getCompetitions();
  const defaultTabKey: CompetitionStatusTab = competitions.some(
    (competition) => competition.status === "started"
  )
    ? "live"
    : "upcoming";
  const joinedTab = {
    key: "joined" as const,
    title: "Zawody, w których bierzesz udział",
    empty: "Nie bierzesz udziału w nadchodzących ani trwających zawodach.",
    statuses: ["published", "started"],
  };
  const activeTab = status === "joined"
    ? joinedTab
    : tabs.find((tab) => tab.key === status)
    || tabs.find((tab) => tab.key === defaultTabKey)
    || tabs[0];
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

          <CompetitionParticipationFilterButton
            competitions={competitions}
            isActive={activeTab.key === "joined"}
          />
        </div>

        <CompetitionList
          competitions={visibleCompetitions}
          emptyMessage={activeTab.empty}
          dateSortDirection={activeTab.key === "finished" ? "desc" : "asc"}
          mapHref={`/competitions/map?status=${activeTab.key === "joined" ? "upcoming" : activeTab.key}`}
          onlyMyEntries={activeTab.key === "joined"}
        />
      </div>
    </main>
  );
}
