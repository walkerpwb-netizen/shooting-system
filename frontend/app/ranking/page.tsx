"use client";

import { useEffect, useMemo, useState } from "react";

import { apiUrl } from "@/lib/api";

type RankingScope = "national" | "voivodeship" | "county";
type RankingMetric = "overall" | "pistol" | "rifle" | "shotgun";

type RankingRegion = {
  postal_code: string;
  voivodeship_key: string;
  voivodeship_name: string;
  county_key: string;
  county_name: string;
};

type RankingRow = {
  place: number;
  user_id: number;
  display_name: string;
  club: string;
  postal_code: string;
  city: string;
  voivodeship: string;
  county: string;
  points: string;
};

type RankingResponse = {
  scope: RankingScope;
  metric: RankingMetric;
  metric_label: string;
  limit: number;
  minimum_discipline_shooters: number;
  reference_region: RankingRegion | null;
  message: string;
  rows: RankingRow[];
  updated_at: string;
};

const scopes: Array<{ id: RankingScope; label: string }> = [
  {
    id: "national",
    label: "Ranking Krajowy",
  },
  {
    id: "voivodeship",
    label: "Ranking Wojewódzki",
  },
  {
    id: "county",
    label: "Ranking Powiatowy",
  },
];

const metrics: Array<{ id: RankingMetric; label: string }> = [
  {
    id: "overall",
    label: "Suma ogólna",
  },
  {
    id: "pistol",
    label: "Suma punktów pistolet",
  },
  {
    id: "rifle",
    label: "Suma punktów karabin",
  },
  {
    id: "shotgun",
    label: "Suma punktów strzelba",
  },
];

function scopeDescription(ranking: RankingResponse | null, scope: RankingScope) {
  if (!ranking) {
    return "";
  }

  if (scope === "national") {
    return "Top 1000 zawodników z najwyższą sumą punktów w Polsce.";
  }

  if (!ranking.reference_region) {
    return ranking.message;
  }

  if (scope === "voivodeship") {
    return `Ranking dla województwa: ${ranking.reference_region.voivodeship_name}.`;
  }

  return `Ranking dla powiatu: ${ranking.reference_region.county_name}.`;
}

export default function RankingPage() {
  const [scope, setScope] = useState<RankingScope>("national");
  const [metric, setMetric] = useState<RankingMetric>("overall");
  const [ranking, setRanking] = useState<RankingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const activeDescription = useMemo(
    () => scopeDescription(ranking, scope),
    [ranking, scope]
  );

  useEffect(() => {
    let active = true;

    async function loadRanking() {
      try {
        setLoading(true);

        const token = localStorage.getItem("token");
        const response = await fetch(
          apiUrl(`/rankings?scope=${scope}&metric=${metric}`),
          {
            headers: token
              ? {
                  Authorization: `Bearer ${token}`,
                }
              : undefined,
            cache: "no-store",
          }
        );
        const data = await response.json();

        if (!response.ok) {
          if (active) {
            setRanking(null);
            setMessage(data.detail || "Nie udało się pobrać rankingu.");
          }
          return;
        }

        if (active) {
          setRanking(data);
          setMessage(data.message || "");
        }
      } catch (error) {
        console.error(error);

        if (active) {
          setRanking(null);
          setMessage("Błąd połączenia z serwerem.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadRanking();

    return () => {
      active = false;
    };
  }, [metric, scope]);

  return (
    <main className="min-h-screen bg-white px-6 py-8 text-zinc-950 dark:bg-black dark:text-red-400 sm:px-10 lg:px-14">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-red-400 sm:text-5xl">
            Ranking
          </h1>

          <p className="mt-3 max-w-3xl text-zinc-600 dark:text-red-100">
            W rankingu biorą udział zawodnicy z uzupełnionym kodem pocztowym. Wyniki liczą tylko konkurencje z minimum 50 zawodnikami.
          </p>
        </div>

        <div className="mb-6 flex flex-col gap-4 border-b border-red-200 pb-6 dark:border-red-950 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap gap-3">
            {scopes.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setScope(item.id)}
                className={`px-4 py-3 font-semibold transition ${
                  scope === item.id
                    ? "bg-red-700 text-white"
                    : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-red-100 dark:hover:bg-zinc-800"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="w-full max-w-sm">
            <span className="mb-2 block text-sm font-semibold text-red-700 dark:text-red-300">
              Klasyfikacja
            </span>
            <select
              value={metric}
              onChange={(event) => setMetric(event.target.value as RankingMetric)}
              className="w-full rounded-lg border border-red-300 bg-white px-4 py-3 text-zinc-950 outline-none transition focus:border-red-500 dark:border-red-900/60 dark:bg-black dark:text-red-50"
            >
              {metrics.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                >
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {activeDescription && (
          <p className="mb-5 text-zinc-700 dark:text-red-100">
            {activeDescription}
          </p>
        )}

        {message && scope !== "national" && !ranking?.reference_region && (
          <p className="mb-6 border border-yellow-500/50 bg-yellow-400/10 px-4 py-3 text-yellow-900 dark:text-yellow-100">
            {message}
          </p>
        )}

        {loading ? (
          <p className="text-zinc-700 dark:text-red-100">
            Ładowanie rankingu...
          </p>
        ) : ranking && ranking.rows.length > 0 ? (
          <section className="overflow-hidden border border-red-200 dark:border-red-950">
            <div className="overflow-x-auto">
              <div className="grid min-w-[980px] grid-cols-[5rem_minmax(15rem,1.4fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_9rem] gap-4 bg-red-700 px-4 py-3 text-sm font-bold uppercase text-white">
                <span>Miejsce</span>
                <span>Zawodnik</span>
                <span>Klub</span>
                <span>Miejscowość</span>
                <span>Region</span>
                <span className="text-right">Punkty</span>
              </div>

              <div className="min-w-[980px] divide-y divide-red-100 dark:divide-red-950">
                {ranking.rows.map((row) => (
                  <div
                    key={`${row.user_id}-${row.place}`}
                    className="grid grid-cols-[5rem_minmax(15rem,1.4fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_9rem] gap-4 px-4 py-4 text-sm sm:text-base"
                  >
                    <span className="font-black text-red-700 dark:text-red-300">
                      {row.place}
                    </span>

                    <span className="min-w-0 font-semibold text-zinc-950 dark:text-white">
                      {row.display_name}
                    </span>

                    <span className="min-w-0 text-zinc-700 dark:text-red-100">
                      {row.club || "Brak"}
                    </span>

                    <span className="min-w-0 text-zinc-700 dark:text-red-100">
                      {row.city || "Nie podano"}
                    </span>

                    <span className="min-w-0 text-zinc-700 dark:text-red-100">
                      {scope === "county" ? row.county : row.voivodeship}
                    </span>

                    <span className="text-right font-bold text-zinc-950 dark:text-white">
                      {row.points}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <p className="border border-red-200 px-4 py-5 text-zinc-700 dark:border-red-950 dark:text-red-100">
            Brak zawodników w tej klasyfikacji.
          </p>
        )}
      </div>
    </main>
  );
}
