"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { CompetitionListItem } from "./CompetitionList";
import { apiUrl } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

type CompetitionParticipationFilterButtonProps = {
  competitions: CompetitionListItem[];
  isActive: boolean;
};

const participantStatuses = new Set(["published", "started"]);

export default function CompetitionParticipationFilterButton({
  competitions,
  isActive,
}: CompetitionParticipationFilterButtonProps) {
  const [entryTypes, setEntryTypes] = useState<Record<string, string>>({});

  useEffect(() => {
    const token = getAccessToken();

    if (!token) {
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
      }
    }

    loadEntryTypes();
  }, []);

  const hasParticipantCompetition = useMemo(() => (
    competitions.some((competition) => (
      participantStatuses.has(competition.status)
      && Boolean(entryTypes[String(competition.id)])
    ))
  ), [competitions, entryTypes]);

  if (!hasParticipantCompetition) {
    return null;
  }

  return (
    <Link
      href="/competitions?status=joined"
      className={`ui-button px-5 py-3 rounded-xl font-bold transition ${
        isActive
          ? "bg-green-700 text-white"
          : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700"
      }`}
    >
      Biorę udział
    </Link>
  );
}
