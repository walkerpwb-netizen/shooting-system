"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { CompetitionListItem } from "./CompetitionList";
import { apiUrl } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

type CompetitionParticipationFilterButtonProps = {
  competitions: CompetitionListItem[];
  isActive: boolean;
  href?: string;
  label?: string;
  entriesEndpoint?: string;
};

const participantStatuses = new Set(["published", "started"]);

export default function CompetitionParticipationFilterButton({
  competitions,
  isActive,
  href = "/competitions?status=joined",
  label = "Biorę udział",
  entriesEndpoint = "/competitions/my-entries",
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
          apiUrl(entriesEndpoint),
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
  }, [entriesEndpoint]);

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
      href={href}
      className={`ui-button px-5 py-3 rounded-xl font-bold transition ${
        isActive
          ? "bg-green-700 text-white"
          : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700"
      }`}
    >
      {label}
    </Link>
  );
}
