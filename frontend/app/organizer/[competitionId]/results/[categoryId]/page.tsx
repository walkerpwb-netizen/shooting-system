"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { apiUrl } from "@/lib/api";
import { isOrganizer } from "@/lib/auth";

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
  license_number: string;
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
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!isOrganizer()) {
      router.push("/");
      return;
    }

    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/login");
      return;
    }

    let active = true;

    async function loadLeaderboard() {
      try {
        const response = await fetch(
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

  const visibleShooters = useMemo(() => {
    const normalizedFilter = filter.trim().toLowerCase();

    if (!normalizedFilter) {
      return leaderboard?.shooters || [];
    }

    return (leaderboard?.shooters || []).filter((shooter) =>
      [
        shooter.display_name,
        shooter.license_number,
        shooter.club,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedFilter)
    );
  }, [filter, leaderboard]);

  const updatedAt = formatUpdatedAt(leaderboard?.updated_at || "");

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <Link
          href={`/organizer/${competitionId}/results`}
          className="mb-6 inline-flex rounded-xl bg-red-700 px-5 py-3 font-bold text-white transition hover:bg-red-600"
        >
          Wróć do kategorii
        </Link>

        {message && (
          <p className="mb-6 rounded-xl border border-red-900 bg-red-950/50 p-4 text-red-100">
            {message}
          </p>
        )}

        {loading ? (
          <p className="text-gray-400">
            Ładowanie wyników...
          </p>
        ) : !leaderboard ? (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-gray-300">
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
                  <span className="text-sm font-semibold text-gray-400">
                    Ostatnia aktualizacja: {updatedAt}
                  </span>
                )}
              </div>

              <h1 className="mb-3 text-4xl font-bold text-white sm:text-5xl">
                {leaderboard.category.name}
              </h1>

              <p className="text-gray-400">
                {leaderboard.competition.name} • {leaderboard.competition.location} • {leaderboard.competition.date}
              </p>
            </div>

            <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
              <div className="border-b border-zinc-800 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-white">
                      Ranking
                    </h2>

                    <p className="text-sm text-gray-400">
                      Dane do podglądu i przyszłych raportów organizatora.
                    </p>
                  </div>

                  <input
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder="Filtruj zawodnika"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-green-700 focus:outline-none md:w-80"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[820px]">
                  <div className="grid grid-cols-[80px_1.6fr_1fr_1.1fr_120px] gap-3 border-b border-zinc-800 bg-zinc-950/50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-400">
                    <p>Miejsce</p>
                    <p>Zawodnik</p>
                    <p>Licencja</p>
                    <p>Klub</p>
                    <p className="text-right">Punkty</p>
                  </div>

                  {visibleShooters.length === 0 ? (
                    <p className="px-4 py-5 text-gray-400">
                      Brak zawodników w tej klasyfikacji.
                    </p>
                  ) : (
                    visibleShooters.map((shooter) => (
                      <div
                        key={shooter.participant_id}
                        className="grid grid-cols-[80px_1.6fr_1fr_1.1fr_120px] items-center gap-3 border-b border-zinc-800 px-4 py-3 text-sm last:border-b-0 hover:bg-zinc-800/50"
                      >
                        <p className="text-lg font-black text-green-300">
                          {shooter.place}
                        </p>

                        <p className="font-semibold text-white">
                          {shooter.display_name}
                        </p>

                        <p className="text-gray-300">
                          {shooter.license_number || "brak"}
                        </p>

                        <p className="text-gray-300">
                          {shooter.club || "brak"}
                        </p>

                        <p className="text-right text-xl font-black text-white">
                          {shooter.points || "0"}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
