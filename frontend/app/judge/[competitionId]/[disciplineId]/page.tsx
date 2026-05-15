"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { apiUrl } from "@/lib/api";
import { isJudge } from "@/lib/auth";

type JudgeCompetition = {
  id: number;
  name: string;
  date: string;
  location: string;
  status: string;
  is_head_judge: boolean;
  disciplines: JudgeDiscipline[];
};

type JudgeDiscipline = {
  id: number;
  name: string;
  description: string;
  scoring_type: string;
  shots_count: number;
  ammo_type: string;
  ammo_price: string;
  entry_fee: string;
  shooters_count: number;
};

type Shooter = {
  participant_id: number;
  user_email: string;
  first_name: string;
  last_name: string;
  license_number: string;
  club: string;
  points: string;
};

type SortField = "name" | "license" | "club" | "points";
type SortDirection = "asc" | "desc";

function getShooterName(shooter: Shooter) {
  return [shooter.last_name, shooter.first_name].filter(Boolean).join(" ")
    || shooter.user_email;
}

function getSortValue(shooter: Shooter, field: SortField) {
  if (field === "name") {
    return getShooterName(shooter);
  }

  if (field === "license") {
    return shooter.license_number || "";
  }

  if (field === "club") {
    return shooter.club || "";
  }

  return shooter.points || "";
}

export default function JudgeDisciplinePage() {
  const router = useRouter();
  const params = useParams<{
    competitionId: string;
    disciplineId: string;
  }>();
  const competitionId = Number(params.competitionId);
  const disciplineId = Number(params.disciplineId);

  const [competitions, setCompetitions] = useState<JudgeCompetition[]>([]);
  const [shooters, setShooters] = useState<Shooter[]>([]);
  const [loading, setLoading] = useState(true);
  const [shootersLoading, setShootersLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [shooterFilter, setShooterFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  useEffect(() => {
    if (!isJudge()) {
      router.push("/");
      return;
    }

    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/login");
      return;
    }

    async function loadData() {
      try {
        const competitionsResponse = await fetch(
          apiUrl("/judge/competitions"),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        const competitionsData = await competitionsResponse.json();

        if (!competitionsResponse.ok) {
          setMessage(competitionsData.detail || "Nie udało się pobrać konkurencji ❌");
          return;
        }

        setCompetitions(competitionsData);
        setLoading(false);

        const shootersResponse = await fetch(
          apiUrl(`/judge/competitions/${competitionId}/disciplines/${disciplineId}/shooters`),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        const shootersData = await shootersResponse.json();

        if (!shootersResponse.ok) {
          setMessage(shootersData.detail || "Nie udało się pobrać zawodników ❌");
          return;
        }

        setShooters(shootersData.shooters);
      } catch (error) {
        console.error(error);
        setMessage("Błąd połączenia z serwerem ❌");
      } finally {
        setLoading(false);
        setShootersLoading(false);
      }
    }

    loadData();
  }, [competitionId, disciplineId, router]);

  const competition = useMemo(
    () => competitions.find((item) => item.id === competitionId),
    [competitionId, competitions]
  );
  const discipline = competition?.disciplines.find(
    (item) => item.id === disciplineId
  );

  const sortedShooters = useMemo(() => {
    const normalizedFilter = shooterFilter.trim().toLowerCase();
    const visibleShooters = shooters.filter((shooter) => {
      if (!normalizedFilter) {
        return true;
      }

      return [
        getShooterName(shooter),
        shooter.license_number,
        shooter.club,
        shooter.user_email,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedFilter);
    });

    return visibleShooters.sort((firstShooter, secondShooter) => {
      const firstValue = getSortValue(firstShooter, sortField);
      const secondValue = getSortValue(secondShooter, sortField);
      const sortResult = firstValue.localeCompare(
        secondValue,
        "pl",
        {
          sensitivity: "base",
          numeric: true,
        }
      );

      return sortDirection === "asc"
        ? sortResult
        : -sortResult;
    });
  }, [shooterFilter, shooters, sortDirection, sortField]);

  const resultsEnabled = competition?.status === "started";

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
      return;
    }

    setSortField(field);
    setSortDirection("asc");
  }

  function sortMark(field: SortField) {
    if (sortField !== field) {
      return "↕";
    }

    return sortDirection === "asc" ? "↑" : "↓";
  }

  async function saveResult(shooter: Shooter) {
    if (!resultsEnabled) {
      return;
    }

    const points = window.prompt(
      `Podaj wynik: ${getShooterName(shooter)}`,
      shooter.points || ""
    );

    if (points === null) {
      return;
    }

    const token = localStorage.getItem("token");

    try {
      setMessage("");

      const response = await fetch(
        apiUrl(`/judge/competitions/${competitionId}/disciplines/${disciplineId}/results`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            participant_id: shooter.participant_id,
            points,
          }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się zapisać wyniku ❌");
        return;
      }

      setShooters((currentShooters) =>
        currentShooters.map((currentShooter) =>
          currentShooter.participant_id === shooter.participant_id
            ? {
                ...currentShooter,
                points: data.points,
              }
            : currentShooter
        )
      );
      setMessage("Wynik zapisany ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <Link
            href={`/judge/${competitionId}`}
            className="inline-flex mb-5 bg-red-700 hover:bg-red-600 text-white px-5 py-3 rounded-xl font-bold shadow-lg shadow-red-950/30 transition"
          >
            Wróć do konkurencji
          </Link>

          <h1 className="text-5xl font-bold text-white mb-2">
            {discipline?.name || "Lista zawodników"}
          </h1>

          {competition && (
            <p className="text-gray-400">
              {competition.name} • {competition.date} • {competition.location}
            </p>
          )}
        </div>

        {message && (
          <p className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-white mb-6">
            {message}
          </p>
        )}

        {loading ? (
          <p className="text-gray-400">
            Ładowanie konkurencji...
          </p>
        ) : !competition || !discipline ? (
          <p className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-gray-300">
            Nie masz dostępu do tej konkurencji albo zawody nie są już opublikowane.
          </p>
        ) : (
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
            <div className="min-w-[980px]">
              <div className="px-3 py-3 border-b border-zinc-800">
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-bold text-white">
                      {discipline.name}
                    </h2>
                    <p className="text-gray-400">
                      Lista zawodników startujących w konkurencji.
                    </p>
                  </div>

                  <input
                    value={shooterFilter}
                    onChange={(event) => setShooterFilter(event.target.value)}
                    placeholder="Filtruj strzelca"
                    className="w-full md:w-80 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-green-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-[1.5fr_1fr_1.2fr_0.8fr_1fr] gap-3 px-3 py-2 text-xs font-bold text-gray-400 border-b border-zinc-800 bg-zinc-950/40">
                <button
                  type="button"
                  onClick={() => toggleSort("name")}
                  className="text-left hover:text-white transition"
                >
                  Nazwisko Imię {sortMark("name")}
                </button>

                <button
                  type="button"
                  onClick={() => toggleSort("license")}
                  className="text-left hover:text-white transition"
                >
                  Licencja {sortMark("license")}
                </button>

                <button
                  type="button"
                  onClick={() => toggleSort("club")}
                  className="text-left hover:text-white transition"
                >
                  Klub {sortMark("club")}
                </button>

                <button
                  type="button"
                  onClick={() => toggleSort("points")}
                  className="text-left hover:text-white transition"
                >
                  Punkty {sortMark("points")}
                </button>

                <p>Wynik</p>
              </div>

              {shootersLoading ? (
                <p className="px-3 py-4 text-gray-400">
                  Ładowanie zawodników...
                </p>
              ) : sortedShooters.length === 0 ? (
                <p className="px-3 py-4 text-gray-400">
                  Brak zawodników pasujących do filtra.
                </p>
              ) : (
                sortedShooters.map((shooter) => (
                  <div
                    key={shooter.participant_id}
                    className="grid grid-cols-[1.5fr_1fr_1.2fr_0.8fr_1fr] gap-3 px-3 py-2 items-center text-sm border-b border-zinc-800 last:border-b-0 hover:bg-zinc-800/40"
                  >
                    <p className="text-white font-semibold">
                      {getShooterName(shooter)}
                    </p>

                    <p className="text-gray-300">
                      {shooter.license_number || "brak"}
                    </p>

                    <p className="text-gray-300">
                      {shooter.club || "brak"}
                    </p>

                    <p className="text-gray-300 font-bold">
                      {shooter.points || "brak"}
                    </p>

                    <button
                      type="button"
                      onClick={() => saveResult(shooter)}
                      disabled={!resultsEnabled}
                      title={!resultsEnabled ? "Zawody jeszcze się nie rozpoczęły" : ""}
                      className={`px-3 py-2 rounded-md text-white font-bold text-sm transition ${
                        !resultsEnabled
                          ? "bg-zinc-700 text-gray-300 cursor-not-allowed"
                          : shooter.points
                          ? "bg-red-700 hover:bg-red-600"
                          : "bg-green-700 hover:bg-green-600"
                      }`}
                    >
                      {!resultsEnabled
                        ? "Zawody jeszcze się nie rozpoczęły"
                        : shooter.points
                        ? "Edytuj wynik"
                        : "Dodaj wynik"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
