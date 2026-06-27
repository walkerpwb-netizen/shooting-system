"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiUrl } from "@/lib/api";
import { authFetch } from "@/lib/auth";

type StartHistoryDiscipline = {
  discipline_id: number;
  name: string;
  discipline_type: string;
  firearm_type: string;
  points: string;
  category_path: string;
};

type StartHistoryItem = {
  competition_id: number;
  competition_name: string;
  date: string;
  location: string;
  organizer_full_name: string;
  completed_at: string;
  participant_id: number;
  total_points: string;
  disciplines: StartHistoryDiscipline[];
  results_path: string;
};

type StartHistoryResponse = {
  starts: StartHistoryItem[];
  total_competitions: number;
  total_disciplines: number;
  total_points: string;
  updated_at: string;
};

const firearmLabels: Record<string, string> = {
  pistol: "Pistolet",
  rifle: "Karabin",
  shotgun: "Strzelba",
};

function formatDate(value: string) {
  if (!value) {
    return "Brak daty";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "long",
  }).format(date);
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);

  if (!value || Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function firearmLabel(value: string) {
  return firearmLabels[value] || "Inne";
}

export default function StartHistoryPage() {
  const router = useRouter();

  const [history, setHistory] = useState<StartHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadStartHistory() {
      try {
        const response = await authFetch(
          apiUrl("/me/start-history"),
          {
            cache: "no-store",
          }
        );

        if (response.status === 401) {
          router.push("/login");
          return;
        }

        const data = await response.json();

        if (!response.ok) {
          if (active) {
            setMessage(data.detail || "Nie udało się pobrać historii startów.");
          }
          return;
        }

        if (active) {
          setHistory(data);
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

    void loadStartHistory();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="min-h-screen bg-white px-6 py-8 text-zinc-950 dark:bg-black dark:text-red-400 sm:px-10 lg:px-14">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-red-700 dark:text-red-300">
              Moje starty
            </p>

            <h1 className="mt-2 text-4xl font-bold text-red-400 sm:text-5xl">
              Historia Startów
            </h1>

            <p className="mt-3 max-w-3xl text-zinc-600 dark:text-red-100">
              Lista zakończonych zawodów, w których masz zapisany wynik w przynajmniej jednej konkurencji.
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
            Ładowanie historii startów...
          </p>
        ) : history ? (
          <div className="space-y-8">
            <section className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-950 dark:bg-red-950/20">
                <p className="text-3xl font-black text-zinc-950 dark:text-white">
                  {history.total_competitions}
                </p>
                <p className="mt-2 text-sm font-bold uppercase text-red-700 dark:text-red-300">
                  Zawody
                </p>
              </div>

              <div className="rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-950 dark:bg-red-950/20">
                <p className="text-3xl font-black text-zinc-950 dark:text-white">
                  {history.total_disciplines}
                </p>
                <p className="mt-2 text-sm font-bold uppercase text-red-700 dark:text-red-300">
                  Konkurencje
                </p>
              </div>

              <div className="rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-950 dark:bg-red-950/20">
                <p className="text-3xl font-black text-zinc-950 dark:text-white">
                  {history.total_points}
                </p>
                <p className="mt-2 text-sm font-bold uppercase text-red-700 dark:text-red-300">
                  Punkty razem
                </p>
              </div>
            </section>

            {history.updated_at && (
              <p className="text-sm text-zinc-500 dark:text-red-100/70">
                Ostatnia aktualizacja: {formatUpdatedAt(history.updated_at)}
              </p>
            )}

            {history.starts.length > 0 ? (
              <section className="space-y-5">
                {history.starts.map((start) => (
                  <article
                    key={`${start.competition_id}-${start.participant_id}`}
                    className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm dark:border-red-950 dark:bg-zinc-950/70 sm:p-6"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-sm font-bold uppercase tracking-wide text-red-700 dark:text-red-300">
                          {formatDate(start.date)}
                        </p>

                        <h2 className="mt-2 text-2xl font-black text-zinc-950 dark:text-white">
                          {start.competition_name}
                        </h2>

                        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-red-100/80">
                          {start.location || "Brak lokalizacji"} · {start.organizer_full_name || "Brak organizatora"}
                        </p>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-end">
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left dark:border-red-950 dark:bg-black lg:text-right">
                          <p className="text-xs font-bold uppercase text-red-700 dark:text-red-300">
                            Punkty w zawodach
                          </p>
                          <p className="mt-1 text-2xl font-black text-zinc-950 dark:text-white">
                            {start.total_points}
                          </p>
                        </div>

                        <Link
                          href={start.results_path}
                          className="inline-flex justify-center bg-zinc-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700"
                        >
                          Wyniki zawodów
                        </Link>
                      </div>
                    </div>

                    <div className="mt-6 overflow-hidden rounded-xl border border-red-100 dark:border-red-950">
                      <div className="grid grid-cols-[minmax(0,1fr)_7rem] bg-red-700 px-4 py-3 text-sm font-bold uppercase text-white sm:grid-cols-[minmax(0,1fr)_9rem_7rem]">
                        <span>Konkurencja</span>
                        <span className="hidden sm:block">Typ</span>
                        <span className="text-right">Punkty</span>
                      </div>

                      <div className="divide-y divide-red-100 dark:divide-red-950">
                        {start.disciplines.map((discipline) => (
                          <Link
                            key={discipline.discipline_id}
                            href={discipline.category_path}
                            className="grid grid-cols-[minmax(0,1fr)_7rem] gap-4 px-4 py-4 text-sm transition hover:bg-red-50 dark:hover:bg-red-950/30 sm:grid-cols-[minmax(0,1fr)_9rem_7rem] sm:text-base"
                          >
                            <span className="font-semibold text-zinc-900 dark:text-red-50">
                              {discipline.name}
                            </span>

                            <span className="hidden text-zinc-600 dark:text-red-100/80 sm:block">
                              {firearmLabel(discipline.firearm_type)}
                            </span>

                            <span className="text-right font-black text-zinc-950 dark:text-white">
                              {discipline.points}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
              </section>
            ) : (
              <p className="rounded-2xl border border-red-200 px-4 py-5 text-zinc-700 dark:border-red-950 dark:text-red-100">
                Nie masz jeszcze zakończonych startów z zapisanym wynikiem.
              </p>
            )}
          </div>
        ) : (
          <p className="rounded-2xl border border-red-200 px-4 py-5 text-zinc-700 dark:border-red-950 dark:text-red-100">
            Brak historii startów do wyświetlenia.
          </p>
        )}
      </div>
    </main>
  );
}
