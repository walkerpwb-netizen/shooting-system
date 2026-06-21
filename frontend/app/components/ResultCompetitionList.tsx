"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

export type ResultCompetitionListItem = {
  id: number;
  name: string;
  date: string;
  location: string;
  organizer_full_name: string;
  organizer_logo: string;
  sponsor_logo: string;
  shooters_count: number;
  status: string;
  completed_at: string;
  premium_locked?: boolean;
};

type DateSortDirection = "asc" | "desc";

type ResultCompetitionListProps = {
  competitions: ResultCompetitionListItem[];
  emptyTitle: string;
  emptyText: string;
  hrefPrefix: string;
  live?: boolean;
  dateSortDirection?: DateSortDirection;
  onLockedClick?: () => void;
};

function parseCompetitionTime(dateValue: string) {
  const normalizedDate = dateValue.includes(".")
    ? dateValue.split(".").reverse().join("-")
    : dateValue;
  const time = new Date(`${normalizedDate}T00:00:00`).getTime();

  return Number.isNaN(time)
    ? Number.MAX_SAFE_INTEGER
    : time;
}

function compareCompetitionsByDate(
  firstCompetition: ResultCompetitionListItem,
  secondCompetition: ResultCompetitionListItem,
  direction: DateSortDirection,
) {
  const firstTime = parseCompetitionTime(firstCompetition.date);
  const secondTime = parseCompetitionTime(secondCompetition.date);
  const dateResult = firstTime - secondTime;

  if (dateResult !== 0) {
    return direction === "asc" ? dateResult : -dateResult;
  }

  return firstCompetition.name.localeCompare(secondCompetition.name, "pl", {
    sensitivity: "base",
  });
}

function statusLabel(competition: ResultCompetitionListItem, live?: boolean) {
  if (live && competition.status === "completed") {
    return "Zakończone - widoczne 24 h";
  }

  if (competition.status === "started") {
    return "Trwają";
  }

  return "Zakończone";
}

function formatCompletedAt(value: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString(
    "pl-PL",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

export default function ResultCompetitionList({
  competitions,
  emptyTitle,
  emptyText,
  hrefPrefix,
  live = false,
  dateSortDirection = "desc",
  onLockedClick,
}: ResultCompetitionListProps) {
  const [nameFilter, setNameFilter] = useState("");

  const visibleCompetitions = useMemo(() => {
    const normalizedFilter = nameFilter.trim().toLowerCase();

    return competitions
      .filter((competition) =>
        competition.name.toLowerCase().includes(normalizedFilter)
      )
      .sort((firstCompetition, secondCompetition) =>
        compareCompetitionsByDate(firstCompetition, secondCompetition, dateSortDirection)
      );
  }, [competitions, dateSortDirection, nameFilter]);

  if (competitions.length === 0) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-2 text-2xl font-bold text-zinc-950 dark:text-white">
          {emptyTitle}
        </h2>

        <p className="text-zinc-600 dark:text-gray-400">
          {emptyText}
        </p>
      </section>
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

        <span className="ui-button w-full rounded-lg bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-800 dark:bg-zinc-800 dark:text-gray-200 md:w-auto">
          Data {dateSortDirection === "asc" ? "↑" : "↓"}
        </span>
      </div>

      <div className="hidden grid-cols-[1.5fr_0.7fr_1fr_1.1fr] gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-gray-400 lg:grid">
        <p>Nazwa zawodów</p>
        <p>Data {dateSortDirection === "asc" ? "↑" : "↓"}</p>
        <p>Lokalizacja</p>
        <p aria-hidden="true" />
      </div>

      {visibleCompetitions.length === 0 ? (
        <p className="px-4 py-5 text-zinc-600 dark:text-gray-400">
          Brak zawodów pasujących do filtra.
        </p>
      ) : visibleCompetitions.map((competition) => {
        const completedAt = formatCompletedAt(competition.completed_at);

        return (
          <div
            key={competition.id}
            className="relative isolate grid gap-4 overflow-hidden border-b border-zinc-200 px-4 py-4 text-sm last:border-b-0 dark:border-zinc-800 lg:grid-cols-[1.5fr_0.7fr_1fr_1.1fr] lg:items-center"
          >
            {competition.organizer_logo && (
              <Image
                src={competition.organizer_logo}
                alt=""
                fill
                sizes="100vw"
                className="pointer-events-none z-0 object-cover object-center opacity-[0.07] saturate-75 dark:opacity-[0.12] lg:object-contain"
                unoptimized
              />
            )}

            <div className="relative z-10 min-w-0">
              <div className="mb-2 flex flex-wrap gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-bold text-white ${
                  competition.status === "started"
                    ? "bg-green-700"
                    : "bg-zinc-700"
                }`}>
                  {statusLabel(competition, live)}
                </span>

                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700 dark:bg-zinc-800 dark:text-gray-200">
                  {competition.shooters_count} zawodników
                </span>

                {competition.premium_locked && (
                  <span className="rounded-full bg-red-700 px-3 py-1 text-xs font-bold text-white">
                    Premium
                  </span>
                )}
              </div>

              <p className="truncate text-base font-bold text-zinc-950 dark:text-white">
                {competition.name}
              </p>

              <p className="mt-1 truncate text-xs text-zinc-500 dark:text-gray-500">
                Organizator: {competition.organizer_full_name || "brak danych"}
                {completedAt ? ` • Zakończone: ${completedAt}` : ""}
              </p>
            </div>

            <p className="relative z-10 text-zinc-700 dark:text-gray-300">
              {competition.date}
            </p>

            <p className="relative z-10 text-zinc-700 dark:text-gray-300">
              {competition.location}
            </p>

            <div className="relative z-10 flex flex-wrap gap-2 lg:justify-end">
              {competition.premium_locked ? (
                <button
                  type="button"
                  onClick={onLockedClick}
                  className="ui-button bg-red-800 px-4 py-2 font-semibold text-white transition hover:bg-red-700"
                >
                  Wyniki
                </button>
              ) : (
                <Link
                  href={`${hrefPrefix}/${competition.id}`}
                  className="ui-button bg-green-800 px-4 py-2 font-semibold text-white transition hover:bg-green-700"
                >
                  Wyniki
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
