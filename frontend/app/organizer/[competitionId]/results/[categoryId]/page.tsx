"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import ResultsLeaderboardTable from "@/app/components/ResultsLeaderboardTable";
import { apiUrl } from "@/lib/api";
import { authFetch, getAccessToken, isOrganizer } from "@/lib/auth";

type OrganizerResultCompetition = {
  id: number;
  name: string;
  date: string;
  location: string;
  organizer_full_name: string;
  status: string;
  completed_at: string;
};

type OrganizerResultCategory = {
  id: string;
  name: string;
  type: "discipline" | "aggregate";
  discipline_ids: number[];
  disciplines_count: number;
};

type OrganizerResultShooter = {
  participant_id: number;
  display_name: string;
  first_name: string;
  last_name: string;
  license_number?: string;
  club: string;
  points: string;
  disciplines_count: number;
  place: number;
};

type OrganizerLeaderboard = {
  competition: OrganizerResultCompetition;
  category: OrganizerResultCategory;
  shooters: OrganizerResultShooter[];
  updated_at: string;
};

function formatUpdatedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString(
    "pl-PL",
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }
  );
}

export default function OrganizerLeaderboardPage() {
  const router = useRouter();
  const params = useParams<{
    competitionId: string;
    categoryId: string;
  }>();
  const competitionId = Number(params.competitionId);
  const categoryId = params.categoryId;

  const [leaderboard, setLeaderboard] = useState<OrganizerLeaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isOrganizer()) {
      router.push("/");
      return;
    }

    const token = getAccessToken();

    if (!token) {
      router.push("/login");
      return;
    }

    let active = true;

    async function loadLeaderboard() {
      try {
        const response = await authFetch(
          apiUrl(`/organizer/competitions/${competitionId}/results/${categoryId}`),
          {
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        const data = await response.json();

        if (!response.ok) {
          setMessage(data.detail || "Nie udało się pobrać wyników.");
          return;
        }

        if (active) {
          setLeaderboard(data);
          setMessage("");
        }
      } catch (error) {
        console.error(error);

        if (active) {
          setMessage("Błąd połączenia z serwerem.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadLeaderboard();
    const intervalId = window.setInterval(loadLeaderboard, 5000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [categoryId, competitionId, router]);

  const updatedAt = formatUpdatedAt(leaderboard?.updated_at || "");

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="w-full">
        <Link
          href={`/organizer/${competitionId}/results`}
          className="ui-button mb-6 inline-flex rounded-xl bg-red-700 px-5 py-3 font-bold text-white transition hover:bg-red-600"
        >
          Wróć do kategorii
        </Link>

        {message && (
          <p className="mb-6 rounded-xl border border-red-900 bg-red-950/50 p-4 text-red-100">
            {message}
          </p>
        )}

        {loading ? (
          <p className="text-zinc-600 dark:text-gray-400">
            Ładowanie wyników...
          </p>
        ) : !leaderboard ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-gray-300">
            Ta klasyfikacja nie jest dostępna.
          </p>
        ) : (
          <>
            <div className="mb-8">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-green-700 bg-green-950/70 px-4 py-2 text-sm font-bold text-green-200">
                  Panel organizatora
                </span>

                {updatedAt && (
                  <span className="text-sm font-semibold text-zinc-600 dark:text-gray-400">
                    Ostatnia aktualizacja: {updatedAt}
                  </span>
                )}
              </div>

              <h1 className="mb-3 text-4xl font-bold text-zinc-950 dark:text-white sm:text-5xl">
                {leaderboard.category.name}
              </h1>

              <p className="text-zinc-600 dark:text-gray-400">
                {leaderboard.competition.name} • {leaderboard.competition.location} • {leaderboard.competition.date}
              </p>
            </div>

            <ResultsLeaderboardTable
              shooters={leaderboard.shooters}
              description="Dane do podglądu i przyszłych raportów organizatora."
              emptyMessage="Brak zawodników w tej klasyfikacji."
              showLicense
            />
          </>
        )}
      </div>
    </main>
  );
}
