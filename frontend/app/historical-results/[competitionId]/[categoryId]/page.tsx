"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import ResultsLeaderboardTable from "@/app/components/ResultsLeaderboardTable";
import { apiUrl } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { authHeaderFromToken } from "@/lib/premium";

type HistoricalCompetition = {
  id: number;
  name: string;
  date: string;
  location: string;
  organizer_full_name: string;
  status: string;
  completed_at: string;
};

type HistoricalCategory = {
  id: string;
  name: string;
  type: "discipline" | "aggregate";
  discipline_ids: number[];
  disciplines_count: number;
};

type HistoricalShooter = {
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

type HistoricalLeaderboard = {
  competition: HistoricalCompetition;
  category: HistoricalCategory;
  shooters: HistoricalShooter[];
  updated_at: string;
};

export default function HistoricalLeaderboardPage() {
  const params = useParams<{
    competitionId: string;
    categoryId: string;
  }>();
  const competitionId = Number(params.competitionId);
  const categoryId = params.categoryId;

  const [leaderboard, setLeaderboard] = useState<HistoricalLeaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadLeaderboard() {
      try {
        const token = getAccessToken();
        const response = await fetch(
          apiUrl(`/historical-results/competitions/${competitionId}/categories/${categoryId}`),
          {
            headers: authHeaderFromToken(token),
            cache: "no-store",
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

    return () => {
      active = false;
    };
  }, [categoryId, competitionId]);

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="w-full">
        <Link
          href={`/historical-results/${competitionId}`}
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
            Ta klasyfikacja nie jest dostępna w historii.
          </p>
        ) : (
          <>
            <div className="mb-8">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-zinc-200 bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                  Wyniki historyczne
                </span>
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
              description="Lista jest posortowana od najwyższego wyniku."
              emptyMessage="Brak zawodników w tej klasyfikacji."
            />
          </>
        )}
      </div>
    </main>
  );
}
