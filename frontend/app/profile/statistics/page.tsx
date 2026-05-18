"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiUrl } from "@/lib/api";

type StatisticsGroup = {
  starts_count: number;
  points_sum: string;
  average_points: string;
};

type UserStatistics = {
  minimum_discipline_shooters: number;
  categories: {
    pistol: StatisticsGroup;
    rifle: StatisticsGroup;
    shotgun: StatisticsGroup;
  };
  total_points_sum: string;
  updated_at: string;
};

type StatisticsRow = {
  label: string;
  value: string | number;
};

function statisticsRows(statistics: UserStatistics): StatisticsRow[] {
  return [
    {
      label: "Ilość startów w konkurencjach pistoletowych",
      value: statistics.categories.pistol.starts_count,
    },
    {
      label: "Suma wszystkich punktów w konkurencjach pistoletowych",
      value: statistics.categories.pistol.points_sum,
    },
    {
      label: "Średnia ilość punktów w konkurencjach pistoletowych",
      value: statistics.categories.pistol.average_points,
    },
    {
      label: "Ilość startów w konkurencjach karabinowych",
      value: statistics.categories.rifle.starts_count,
    },
    {
      label: "Suma wszystkich punktów w konkurencjach karabinowych",
      value: statistics.categories.rifle.points_sum,
    },
    {
      label: "Średnia ilość punktów w konkurencjach karabinowych",
      value: statistics.categories.rifle.average_points,
    },
    {
      label: "Ilość startów w konkurencjach strzelby",
      value: statistics.categories.shotgun.starts_count,
    },
    {
      label: "Suma wszystkich punktów w konkurencjach strzelby",
      value: statistics.categories.shotgun.points_sum,
    },
    {
      label: "Średnia ilość punktów w konkurencjach strzelby",
      value: statistics.categories.shotgun.average_points,
    },
    {
      label: "Suma wszystkich punktów zdobytych we wszystkich konkurencjach",
      value: statistics.total_points_sum,
    },
  ];
}

export default function ProfileStatisticsPage() {
  const router = useRouter();

  const [statistics, setStatistics] = useState<UserStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    let active = true;

    if (!token) {
      router.push("/login");
      return;
    }

    async function loadStatistics() {
      try {
        const response = await fetch(
          apiUrl("/me/statistics"),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          }
        );
        const data = await response.json();

        if (!response.ok) {
          if (active) {
            setMessage(data.detail || "Nie udało się pobrać statystyk.");
          }
          return;
        }

        if (active) {
          setStatistics(data);
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

    loadStatistics();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="min-h-screen bg-white px-6 py-8 text-zinc-950 dark:bg-black dark:text-red-400 sm:px-10 lg:px-14">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-4xl font-bold text-red-400 sm:text-5xl">
              Moje Statystyki
            </h1>

            <p className="mt-3 text-zinc-600 dark:text-red-100">
              Do statystyk wliczane są tylko konkurencje z minimum 50 zawodnikami.
            </p>
          </div>

          <Link
            href="/profile"
            className="inline-flex bg-zinc-800 px-5 py-3 font-semibold text-white transition hover:bg-zinc-700"
          >
            Wróć do profilu
          </Link>
        </div>

        {message && (
          <p className="mb-6 border border-red-300 bg-red-50 px-4 py-3 font-medium text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
            {message}
          </p>
        )}

        {loading ? (
          <p className="text-zinc-700 dark:text-red-100">
            Ładowanie statystyk...
          </p>
        ) : statistics ? (
          <section className="overflow-hidden border border-red-200 dark:border-red-950">
            <div className="grid grid-cols-[minmax(0,1fr)_9rem] bg-red-700 px-4 py-3 text-sm font-bold uppercase text-white">
              <span>Statystyka</span>
              <span className="text-right">Wartość</span>
            </div>

            <div className="divide-y divide-red-100 dark:divide-red-950">
              {statisticsRows(statistics).map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[minmax(0,1fr)_9rem] gap-4 px-4 py-4 text-sm sm:text-base"
                >
                  <span className="font-medium text-zinc-800 dark:text-red-100">
                    {row.label}
                  </span>

                  <span className="text-right font-bold text-zinc-950 dark:text-white">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <p className="border border-red-200 px-4 py-5 text-zinc-700 dark:border-red-950 dark:text-red-100">
            Brak statystyk do wyświetlenia.
          </p>
        )}
      </div>
    </main>
  );
}
