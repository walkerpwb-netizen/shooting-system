"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import CompetitionCard from "./CompetitionCard";
import { apiUrl } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

export type CompetitionListItem = {
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

type DateSortDirection = "asc" | "desc";

type CompetitionListProps = {
  competitions: CompetitionListItem[];
  emptyMessage: string;
  dateSortDirection?: DateSortDirection;
  mapHref?: string;
  onlyMyEntries?: boolean;
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
  firstCompetition: CompetitionListItem,
  secondCompetition: CompetitionListItem,
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

export default function CompetitionList({
  competitions,
  emptyMessage,
  dateSortDirection = "asc",
  mapHref = "/competitions/map",
  onlyMyEntries = false,
}: CompetitionListProps) {
  const [nameFilter, setNameFilter] = useState("");
  const [entryTypes, setEntryTypes] = useState<Record<string, string>>({});
  const [entriesLoaded, setEntriesLoaded] = useState(false);

  useEffect(() => {
    const token = getAccessToken();

    if (!token) {
      Promise.resolve().then(() => {
        setEntriesLoaded(true);
      });
      return;
    }

    async function loadEntryTypes() {
      try {
        const response = await fetch(
          apiUrl("/competitions/my-entries"),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          return;
        }

        const data = await response.json();
        setEntryTypes(data || {});
      } catch (error) {
        console.error(error);
      } finally {
        setEntriesLoaded(true);
      }
    }

    loadEntryTypes();
  }, []);

  const visibleCompetitions = useMemo(() => {
    const normalizedFilter = nameFilter.trim().toLowerCase();

    return competitions
      .filter((competition) => (
        !onlyMyEntries || Boolean(entryTypes[String(competition.id)])
      ))
      .filter((competition) =>
        competition.name.toLowerCase().includes(normalizedFilter)
      )
      .sort((firstCompetition, secondCompetition) =>
        compareCompetitionsByDate(firstCompetition, secondCompetition, dateSortDirection)
      );
  }, [competitions, dateSortDirection, entryTypes, nameFilter, onlyMyEntries]);

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
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto">
          <input
            value={nameFilter}
            onChange={(event) => setNameFilter(event.target.value)}
            placeholder="Filtruj po nazwie zawodów"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-500 focus:border-green-700 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-gray-500 sm:w-80"
          />

          <Link
            href={mapHref}
            className="ui-button inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-800 px-4 py-2 text-sm font-bold text-white transition hover:bg-green-700 sm:w-auto"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z" />
              <path d="M9 3v15" />
              <path d="M15 6v15" />
            </svg>
            Szukaj zawodów na mapie
          </Link>
        </div>

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

      {onlyMyEntries && !entriesLoaded ? (
        <p className="px-4 py-5 text-zinc-600 dark:text-gray-400">
          Ładowanie Twoich zawodów...
        </p>
      ) : visibleCompetitions.length === 0 ? (
        <p className="px-4 py-5 text-zinc-600 dark:text-gray-400">
          {onlyMyEntries
            ? emptyMessage
            : "Brak zawodów pasujących do filtra."}
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
              organizerLogo={competition.organizer_logo}
              participantLimit={competition.participant_limit}
              pzssLicenseCalendar={competition.pzss_license_calendar}
              shootersCount={competition.shooters_count}
              disciplinesCount={competition.disciplines_count}
              entryType={entryTypes[String(competition.id)] || ""}
            />
          ))}
        </div>
      )}
    </section>
  );
}
