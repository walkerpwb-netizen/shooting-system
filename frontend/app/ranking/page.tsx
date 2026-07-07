"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { apiUrl } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { authHeaderFromToken, PREMIUM_LOGIN_REQUIRED_MESSAGE } from "@/lib/premium";

type RankingMetric = string;
type RankingScope = "national" | "regional";

type RankingRow = {
  place: number;
  user_id: number;
  display_name: string;
  club: string;
  voivodeship: string;
  points: string;
};

type RankingResponse = {
  scope: RankingScope;
  voivodeship: string;
  metric: RankingMetric;
  metric_label: string;
  limit: number;
  minimum_discipline_shooters: number;
  message: string;
  rows: RankingRow[];
  updated_at: string;
};

type UserProfileResponse = {
  voivodeship?: string;
};

const metricGroups: Array<{
  label: string;
  options: Array<{ id: RankingMetric; label: string }>;
}> = [
  {
    label: "Klasyfikacje grupowe",
    options: [
      { id: "overall", label: "Ranking ogólny" },
      { id: "pistol", label: "Konkurencje pistoletowe i rewolwerowe" },
      { id: "rifle", label: "Konkurencje karabinowe" },
      { id: "shotgun", label: "Konkurencje strzelbowe" },
    ],
  },
  {
    label: "Konkurencje pistoletowe i rewolwerowe",
    options: [
      { id: "pistol-air-10m", label: "Pistolet pneumatyczny 10 m (Ppn)" },
      { id: "pistol-sport-25m", label: "Pistolet sportowy 25 m (Psp)" },
      { id: "pistol-rapid-fire-25m", label: "Pistolet szybkostrzelny 25 m (Psz)" },
      { id: "pistol-free-50m", label: "Pistolet dowolny 50 m (Pdw)" },
      { id: "pistol-center-fire-25m", label: "Pistolet centralnego zapłonu 25 m (Pcz)" },
      { id: "pistol-rimfire-25m", label: "Pistolet bocznego zapłonu 25 m" },
      { id: "pistol-rimfire-10m", label: "Pistolet bocznego zapłonu 10 m" },
      { id: "pistol-standard-25m", label: "Pistolet standardowy 25 m (Pst)" },
      { id: "ipsc-pistol", label: "IPSC Pistolet" },
      { id: "idpa", label: "IDPA" },
      { id: "action-air", label: "Action Air" },
    ],
  },
  {
    label: "Konkurencje karabinowe",
    options: [
      { id: "rifle-air-10m", label: "Karabin pneumatyczny 10 m (Kpn)" },
      { id: "rifle-sport-50m-60-prone", label: "Karabin sportowy 50 m - 60 leżąc (Ksp 60)" },
      { id: "rifle-3-positions-50m", label: "Karabin 3 postawy 50 m (Ksp 3×20 / Kdw 3×40)" },
      { id: "rifle-free-300m-prone", label: "Karabin dowolny 300 m - leżąc" },
      { id: "rifle-free-300m-3-positions", label: "Karabin dowolny 300 m - 3 postawy" },
      { id: "rifle-standard-300m", label: "Karabin standardowy 300 m (Kst)" },
      { id: "moving-target", label: "Ruchoma tarcza (RT)" },
      { id: "long-range", label: "Strzelanie długodystansowe (Long Range)" },
      { id: "centerfire-rifle", label: "Karabin centralnego zapłonu (KCZ)" },
      { id: "practical-rifle", label: "Karabin praktyczny (KPr)" },
      { id: "pcc", label: "PCC (Pistol Caliber Carbine)" },
      { id: "2gun", label: "2GUN" },
      { id: "3gun", label: "3-Gun (Multi-Gun)" },
    ],
  },
  {
    label: "Konkurencje strzelbowe",
    options: [
      { id: "trap", label: "Trap" },
      { id: "skeet", label: "Skeet" },
      { id: "double-trap", label: "Double Trap" },
      { id: "trap-mix", label: "Trap MIX" },
      { id: "skeet-mix", label: "Skeet MIX" },
      { id: "practical-shotgun", label: "Strzelba praktyczna (SPr)" },
      { id: "ipsc-shotgun", label: "IPSC Shotgun" },
    ],
  },
  {
    label: "Dyscypliny niszowe i historyczne",
    options: [
      { id: "black-powder", label: "Strzelectwo czarnoprochowe" },
      { id: "cowboy-action-shooting", label: "Strzelectwo westernowe (Cowboy Action Shooting - CAS)" },
      { id: "sporting-clays", label: "Strzelectwo parkurowe (Sporting Clays / Parcours de Chasse)" },
      { id: "historical-shooting", label: "Strzelectwo historyczne" },
      { id: "kurkowe-shooting", label: "Strzelectwo kurkowe" },
    ],
  },
];

const voivodeships = [
  "dolnośląskie",
  "kujawsko-pomorskie",
  "lubelskie",
  "lubuskie",
  "łódzkie",
  "małopolskie",
  "mazowieckie",
  "opolskie",
  "podkarpackie",
  "podlaskie",
  "pomorskie",
  "śląskie",
  "świętokrzyskie",
  "warmińsko-mazurskie",
  "wielkopolskie",
  "zachodniopomorskie",
];

function rankingTitle(scope: RankingScope, voivodeship: string) {
  if (scope === "regional") {
    return `Ranking Wojewódzki${voivodeship ? ` - ${voivodeship}` : ""}`;
  }

  return "Ranking Krajowy";
}

export default function RankingPage() {
  const [scope, setScope] = useState<RankingScope>("national");
  const [metric, setMetric] = useState<RankingMetric>("overall");
  const [selectedVoivodeship, setSelectedVoivodeship] = useState(voivodeships[0]);
  const [ranking, setRanking] = useState<RankingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const token = getAccessToken();

    if (!token) {
      return () => {
        active = false;
      };
    }

    async function loadCurrentUserVoivodeship() {
      try {
        const response = await fetch(
          apiUrl("/me"),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          }
        );

        const data: UserProfileResponse = await response.json().catch(() => ({}));
        const profileVoivodeship = data.voivodeship || "";

        if (
          active
          && response.ok
          && voivodeships.includes(profileVoivodeship)
        ) {
          setSelectedVoivodeship(profileVoivodeship);
        }
      } catch (error) {
        console.error(error);
      }
    }

    loadCurrentUserVoivodeship();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadRanking() {
      try {
        setLoading(true);

        const token = getAccessToken();

        if (!token) {
          if (active) {
            setRanking(null);
            setMessage(PREMIUM_LOGIN_REQUIRED_MESSAGE);
            setLoading(false);
          }

          return;
        }

        const params = new URLSearchParams({
          metric,
          scope,
        });

        if (scope === "regional") {
          params.set("voivodeship", selectedVoivodeship);
        }

        const response = await fetch(
          apiUrl(`/rankings?${params.toString()}`),
          {
            headers: authHeaderFromToken(token),
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
  }, [metric, scope, selectedVoivodeship]);

  const currentTitle = rankingTitle(scope, selectedVoivodeship);
  const minimumDisciplineShooters = ranking?.minimum_discipline_shooters ?? 10;

  return (
    <main className="min-h-screen bg-white px-6 py-8 text-zinc-950 dark:bg-black dark:text-red-400 sm:px-10 lg:px-14">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-red-400 sm:text-5xl">
            Ranking
          </h1>

          <p className="mt-3 max-w-3xl text-zinc-600 dark:text-red-100">
            Top 1000 zawodników z najwyższą sumą punktów. Do rankingu wliczają się punkty zdobyte tylko za konkurencje w których wystartowało minimum {minimumDisciplineShooters} zawodników.
          </p>
        </div>

        <div className="mb-6 flex flex-wrap gap-3 border-b border-red-200 pb-5 dark:border-red-950">
          <button
            type="button"
            onClick={() => setScope("national")}
            className={`px-5 py-3 font-bold transition ${
              scope === "national"
                ? "bg-red-700 text-white"
                : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-red-100 dark:hover:bg-zinc-800"
            }`}
          >
            Ranking Krajowy
          </button>

          <button
            type="button"
            onClick={() => setScope("regional")}
            className={`px-5 py-3 font-bold transition ${
              scope === "regional"
                ? "bg-red-700 text-white"
                : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-red-100 dark:hover:bg-zinc-800"
            }`}
          >
            Ranking Wojewódzki
          </button>
        </div>

        <div className="mb-6 flex flex-col gap-4 border-b border-red-200 pb-6 dark:border-red-950 lg:flex-row lg:items-end lg:justify-between">
          <p className="font-semibold text-zinc-700 dark:text-red-100">
            {currentTitle}
          </p>

          <div className="grid w-full gap-4 sm:grid-cols-2 lg:w-auto">
            {scope === "regional" && (
              <label className="w-full lg:w-72">
                <span className="mb-2 block text-sm font-semibold text-red-700 dark:text-red-300">
                  Województwo
                </span>
                <select
                  value={selectedVoivodeship}
                  onChange={(event) => setSelectedVoivodeship(event.target.value)}
                  className="w-full rounded-lg border border-red-300 bg-white px-4 py-3 text-zinc-950 outline-none transition focus:border-red-500 dark:border-red-900/60 dark:bg-black dark:text-red-50"
                >
                  {voivodeships.map((item) => (
                    <option
                      key={item}
                      value={item}
                    >
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="w-full lg:w-72">
              <span className="mb-2 block text-sm font-semibold text-red-700 dark:text-red-300">
                Klasyfikacja
              </span>
              <select
                value={metric}
                onChange={(event) => setMetric(event.target.value as RankingMetric)}
                className="w-full rounded-lg border border-red-300 bg-white px-4 py-3 text-zinc-950 outline-none transition focus:border-red-500 dark:border-red-900/60 dark:bg-black dark:text-red-50"
              >
                {metricGroups.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((item) => (
                      <option
                        key={item.id}
                        value={item.id}
                      >
                        {item.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          </div>
        </div>

        {message && (
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
              <table className="w-max min-w-full table-auto border-collapse text-left text-sm sm:text-base">
                <thead>
                  <tr className="bg-red-700 text-sm font-bold uppercase text-white">
                    <th className="whitespace-nowrap px-4 py-3">Miejsce</th>
                    <th className="whitespace-nowrap px-4 py-3">Punkty</th>
                    <th className="whitespace-nowrap px-4 py-3">Zawodnik</th>
                    <th className="whitespace-nowrap px-4 py-3">Klub</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-red-100 dark:divide-red-950">
                  {ranking.rows.map((row) => (
                    <tr
                      key={`${row.user_id}-${row.place}`}
                      className="hover:bg-red-50/60 dark:hover:bg-red-950/20"
                    >
                      <td className="whitespace-nowrap px-4 py-4 font-black text-red-700 dark:text-red-300">
                        {row.place}
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 font-bold text-zinc-950 dark:text-white">
                        {row.points}
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 font-semibold">
                        <Link
                          href={`/profile/user-${row.user_id}`}
                          className="text-zinc-950 underline-offset-4 transition hover:text-red-700 hover:underline dark:text-white dark:hover:text-red-300"
                        >
                          {row.display_name}
                        </Link>
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-zinc-700 dark:text-red-100">
                        {row.club || "Brak"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
