"use client";

import { useMemo, useState } from "react";

import CompetitionCard from "./CompetitionCard";

export type CompetitionListItem = {
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

type NameSortDirection = "asc" | "desc";

type CompetitionListProps = {
  competitions: CompetitionListItem[];
  emptyMessage: string;
};

function nextSortDirection(currentDirection: NameSortDirection) {
  return currentDirection === "asc"
    ? "desc"
    : "asc";
}

export default function CompetitionList({
  competitions,
  emptyMessage,
}: CompetitionListProps) {
  const [nameFilter, setNameFilter] = useState("");
  const [nameSortDirection, setNameSortDirection] = useState<NameSortDirection>("asc");

  const visibleCompetitions = useMemo(() => {
    const normalizedFilter = nameFilter.trim().toLowerCase();

    return competitions
      .filter((competition) =>
        competition.name.toLowerCase().includes(normalizedFilter)
      )
      .sort((firstCompetition, secondCompetition) => {
        const sortResult = firstCompetition.name.localeCompare(
          secondCompetition.name,
          "pl",
          {
            sensitivity: "base",
          }
        );

        return nameSortDirection === "asc"
          ? sortResult
          : -sortResult;
      });
  }, [competitions, nameFilter, nameSortDirection]);

  if (competitions.length === 0) {
    return (
      <p className="text-zinc-600 dark:text-gray-400">
        {emptyMessage}
      </p>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800 md:flex-row md:items-center md:justify-between">
        <input
          value={nameFilter}
          onChange={(event) => setNameFilter(event.target.value)}
          placeholder="Filtruj po nazwie zawodów"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-500 focus:border-green-700 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-gray-500 md:w-80"
        />

        <button
          type="button"
          onClick={() => setNameSortDirection((currentDirection) => nextSortDirection(currentDirection))}
          className="ui-button w-full rounded-lg bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-800 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700 md:w-auto"
        >
          Nazwa {nameSortDirection === "asc" ? "↑" : "↓"}
        </button>
      </div>

      <div className="hidden grid-cols-[1.5fr_0.7fr_1fr_1.1fr] gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-gray-400 lg:grid">
        <button
          type="button"
          onClick={() => setNameSortDirection((currentDirection) => nextSortDirection(currentDirection))}
          className="text-left transition hover:text-zinc-950 dark:hover:text-white"
        >
          Nazwa zawodów {nameSortDirection === "asc" ? "↑" : "↓"}
        </button>

        <p>Data</p>
        <p>Lokalizacja</p>
        <p aria-hidden="true" />
      </div>

      {visibleCompetitions.length === 0 ? (
        <p className="px-4 py-5 text-zinc-600 dark:text-gray-400">
          Brak zawodów pasujących do filtra.
        </p>
      ) : (
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
      )}
    </section>
  );
}
