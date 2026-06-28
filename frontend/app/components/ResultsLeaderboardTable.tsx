"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type ResultShooter = {
  participant_id: number;
  display_name: string;
  first_name?: string;
  last_name?: string;
  license_number?: string;
  club: string;
  points: string;
  place: number;
  round_scores?: number[];
  practical_shotgun?: boolean;
  time_seconds?: string;
  hits?: number | string;
  targets_count?: number | string;
  final_result?: string;
  disqualified?: boolean;
  disqualification_reason?: string;
};

type ResultsLeaderboardTableProps = {
  shooters: ResultShooter[];
  description: string;
  emptyMessage: string;
  showLicense?: boolean;
};

function shooterName(shooter: ResultShooter) {
  return [
    shooter.last_name,
    shooter.first_name,
  ]
    .filter(Boolean)
    .join(" ")
    || shooter.display_name;
}

export default function ResultsLeaderboardTable({
  shooters,
  description,
  emptyMessage,
  showLicense = false,
}: ResultsLeaderboardTableProps) {
  const [filter, setFilter] = useState("");
  const showRoundScores = shooters.some((shooter) => (shooter.round_scores?.length || 0) > 0);
  const showPracticalShotgunScores = shooters.some((shooter) => shooter.practical_shotgun);

  const visibleShooters = useMemo(() => {
    const normalizedFilter = filter.trim().toLowerCase();

    if (!normalizedFilter) {
      return shooters;
    }

    return shooters.filter((shooter) =>
      [
        shooterName(shooter),
        shooter.license_number,
        shooter.club,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedFilter)
    );
  }, [filter, shooters]);

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-zinc-950 dark:text-white">
              Ranking
            </h2>

            <p className="text-sm text-zinc-600 dark:text-gray-400">
              {description}
            </p>
          </div>

          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filtruj zawodnika"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-500 focus:border-green-700 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-gray-500 md:w-80"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        {visibleShooters.length === 0 ? (
          <p className="px-4 py-5 text-zinc-600 dark:text-gray-400">
            {emptyMessage}
          </p>
        ) : (
          <table className="w-max min-w-full table-auto border-collapse text-left text-sm sm:text-base">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-gray-400">
                <th className="whitespace-nowrap px-4 py-3">Miejsce</th>
                <th className="whitespace-nowrap px-4 py-3">Zawodnik</th>
                {showPracticalShotgunScores ? (
                  <>
                    <th className="whitespace-nowrap px-4 py-3">Czas</th>
                    <th className="whitespace-nowrap px-4 py-3">Trafienia</th>
                    <th className="whitespace-nowrap px-4 py-3">Wynik końcowy</th>
                  </>
                ) : (
                  <>
                    <th className="whitespace-nowrap px-4 py-3">Punkty</th>
                    {showRoundScores && (
                      <th className="whitespace-nowrap px-4 py-3">Wyniki serii</th>
                    )}
                  </>
                )}
                <th className="whitespace-nowrap px-4 py-3">Klub</th>
                {showLicense && (
                  <th className="whitespace-nowrap px-4 py-3">Licencja</th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {visibleShooters.map((shooter) => (
                <tr
                  key={shooter.participant_id}
                  className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-lg font-black text-green-300">
                    {shooter.place}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3">
                    <Link
                      href={`/profile/${shooter.participant_id}`}
                      className="font-semibold text-zinc-950 transition hover:text-green-700 dark:text-white dark:hover:text-green-300"
                    >
                      {shooterName(shooter)}
                    </Link>
                  </td>

                  {showPracticalShotgunScores ? (
                    <>
                      <td className="whitespace-nowrap px-4 py-3 font-bold text-zinc-700 dark:text-gray-300">
                        {shooter.time_seconds ? `${shooter.time_seconds} s` : "–"}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 font-bold text-zinc-700 dark:text-gray-300">
                        {shooter.hits !== "" && shooter.hits !== undefined
                          ? `${shooter.hits}/${shooter.targets_count || "–"}`
                          : `–/${shooter.targets_count || "–"}`}
                      </td>

                      <td className={`whitespace-nowrap px-4 py-3 text-xl font-black ${
                        shooter.disqualified
                          ? "text-red-600 dark:text-red-400"
                          : "text-zinc-950 dark:text-white"
                      }`}>
                        {shooter.final_result || shooter.points || "0"}
                        {shooter.disqualified && shooter.disqualification_reason ? (
                          <span className="ml-2 text-xs font-bold text-red-500">
                            {shooter.disqualification_reason}
                          </span>
                        ) : null}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="whitespace-nowrap px-4 py-3 text-xl font-black text-zinc-950 dark:text-white">
                        {shooter.points || "0"}
                      </td>

                      {showRoundScores && (
                        <td className="whitespace-nowrap px-4 py-3 font-bold text-zinc-700 dark:text-gray-300">
                          {shooter.round_scores
                            ?.map((score, index) => `S${index + 1}: ${score}/25`)
                            .join(" • ") || "–"}
                        </td>
                      )}
                    </>
                  )}

                  <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-gray-300">
                    {shooter.club || "brak"}
                  </td>

                  {showLicense && (
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-gray-300">
                      {shooter.license_number || "brak"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
