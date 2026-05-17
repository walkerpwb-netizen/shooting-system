import CompetitionCard from "../components/CompetitionCard";

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
          <h1 className="text-5xl font-bold text-white mb-2">
            {activeTab.title}
          </h1>

          <p className="text-gray-400">
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
                  : "bg-zinc-800 text-gray-300 hover:bg-zinc-700"
              }`}
            >
              {tab.label}
            </a>
          ))}
        </div>

        {visibleCompetitions.length === 0 ? (
          <p className="text-gray-400">
            {activeTab.empty}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
            <div className="hidden grid-cols-[1.5fr_0.7fr_1fr_1.1fr] gap-4 border-b border-zinc-800 bg-zinc-950/50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-400 lg:grid">
              <p>Nazwa zawodów</p>
              <p>Data</p>
              <p>Lokalizacja</p>
              <p className="text-right">Buttony</p>
            </div>

            <div>
              {visibleCompetitions.map((competition) => (
                <CompetitionCard
                  key={competition.id}
                  id={competition.id}
                  name={competition.name}
                  date={competition.date}
                  location={competition.location}
                  status={competition.status}
                  organizerFullName={competition.organizer_full_name}
                  sponsors={competition.sponsors}
                  participantLimit={competition.participant_limit}
                  shootersCount={competition.shooters_count}
                  disciplinesCount={competition.disciplines_count}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
