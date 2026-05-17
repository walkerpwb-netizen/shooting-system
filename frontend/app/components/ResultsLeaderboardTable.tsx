"use client";

import { useEffect, useMemo, useState } from "react";

import { apiUrl } from "@/lib/api";

export type ResultShooter = {
  participant_id: number;
  display_name: string;
  first_name?: string;
  last_name?: string;
  license_number: string;
  club: string;
  points: string;
  place: number;
};

type ResultsTableSettings = {
  grid_template_columns: string;
  min_width: string;
  row_padding_y: string;
};

type ResultsLeaderboardTableProps = {
  shooters: ResultShooter[];
  description: string;
  emptyMessage: string;
};

const defaultSettings: ResultsTableSettings = {
  grid_template_columns: "80px 1.6fr 1fr 1.1fr 120px",
  min_width: "820px",
  row_padding_y: "0.75rem",
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
}: ResultsLeaderboardTableProps) {
  const [filter, setFilter] = useState("");
  const [settings, setSettings] = useState<ResultsTableSettings>(defaultSettings);

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      try {
        const response = await fetch(
          apiUrl("/settings/results-table"),
          {
            cache: "no-store",
          }
        );

        if (!response.ok) {
          return;
        }

        const data = await response.json();

        if (active) {
          setSettings({
            grid_template_columns: data.grid_template_columns || defaultSettings.grid_template_columns,
            min_width: data.min_width || defaultSettings.min_width,
            row_padding_y: data.row_padding_y || defaultSettings.row_padding_y,
          });
        }
      } catch (error) {
        console.error(error);
      }
    }

    loadSettings();

    return () => {
      active = false;
    };
  }, []);

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

  const gridStyle = {
    gridTemplateColumns: settings.grid_template_columns,
  };
  const rowStyle = {
    gridTemplateColumns: settings.grid_template_columns,
    paddingBottom: settings.row_padding_y,
    paddingTop: settings.row_padding_y,
  };

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      <div className="border-b border-zinc-800 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">
              Ranking
            </h2>

            <p className="text-sm text-gray-400">
              {description}
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
        <div style={{ minWidth: settings.min_width }}>
          <div
            style={gridStyle}
            className="grid gap-3 border-b border-zinc-800 bg-zinc-950/50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-400"
          >
            <p>Miejsce</p>
            <p>Zawodnik</p>
            <p>Licencja</p>
            <p>Klub</p>
            <p className="text-right">Punkty</p>
          </div>

          {visibleShooters.length === 0 ? (
            <p className="px-4 py-5 text-gray-400">
              {emptyMessage}
            </p>
          ) : (
            visibleShooters.map((shooter) => (
              <div
                key={shooter.participant_id}
                style={rowStyle}
                className="grid items-center gap-3 border-b border-zinc-800 px-4 text-sm last:border-b-0 hover:bg-zinc-800/50"
              >
                <p className="text-lg font-black text-green-300">
                  {shooter.place}
                </p>

                <p className="font-semibold text-white">
                  {shooterName(shooter)}
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
  );
}
