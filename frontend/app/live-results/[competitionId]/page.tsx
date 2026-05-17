"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import ResultCategoryList from "@/app/components/ResultCategoryList";
import { apiUrl } from "@/lib/api";

type LiveCategory = {
  id: string;
  name: string;
  type: "discipline" | "aggregate";
  discipline_ids: number[];
  disciplines_count: number;
};

type LiveCompetitionDetails = {
  id: number;
  name: string;
  date: string;
  location: string;
  organizer_full_name: string;
  status: string;
  completed_at: string;
  categories: LiveCategory[];
};

export default function LiveCompetitionPage() {
  const params = useParams<{ competitionId: string }>();
  const competitionId = Number(params.competitionId);

  const [competition, setCompetition] = useState<LiveCompetitionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadCompetition() {
      try {
        const response = await fetch(
          apiUrl(`/live-results/competitions/${competitionId}`),
          {
            cache: "no-store",
          }
        );
        const data = await response.json();

        if (!response.ok) {
          setMessage(data.detail || "Nie udało się pobrać zawodów.");
          return;
        }

        if (active) {
          setCompetition(data);
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

    loadCompetition();
    const intervalId = window.setInterval(loadCompetition, 10000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [competitionId]);

  const disciplineCategories = competition?.categories.filter(
    (category) => category.type === "discipline"
  ) || [];
  const aggregateCategories = competition?.categories.filter(
    (category) => category.type === "aggregate"
  ) || [];

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/live-results"
          className="ui-button mb-6 inline-flex rounded-xl bg-red-700 px-5 py-3 font-bold text-white transition hover:bg-red-600"
        >
          Wróć do zawodów
        </Link>

        {message && (
          <p className="mb-6 rounded-xl border border-red-900 bg-red-950/50 p-4 text-red-100">
            {message}
          </p>
        )}

        {loading ? (
          <p className="text-gray-400">
            Ładowanie kategorii...
          </p>
        ) : !competition ? (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-gray-300">
            Te zawody nie są aktualnie dostępne w wynikach na żywo.
          </p>
        ) : (
          <>
            <div className="mb-8">
              <p className="mb-3 inline-flex rounded-full border border-green-700 bg-green-950/70 px-4 py-2 text-sm font-bold text-green-200">
                {competition.status === "completed"
                  ? "Zakończone - widoczne 24 h"
                  : "Wyniki na żywo"}
              </p>

              <h1 className="mb-3 text-4xl font-bold text-white sm:text-5xl">
                {competition.name}
              </h1>

              <div className="flex flex-wrap gap-x-5 gap-y-2 text-gray-400">
                <span>{competition.location}</span>
                <span>{competition.date}</span>
                <span>{competition.organizer_full_name}</span>
              </div>
            </div>

            <section className="mb-8">
              <h2 className="mb-4 text-2xl font-bold text-white">
                Dostępne konkurencje
              </h2>

              {disciplineCategories.length === 0 ? (
                <ResultCategoryList
                  categories={disciplineCategories}
                  emptyMessage="Brak konkurencji w tych zawodach."
                  hrefPrefix={`/live-results/${competition.id}`}
                />
              ) : (
                <ResultCategoryList
                  categories={disciplineCategories}
                  emptyMessage="Brak konkurencji w tych zawodach."
                  hrefPrefix={`/live-results/${competition.id}`}
                />
              )}
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-bold text-white">
                Klasyfikacje zbiorcze
              </h2>

              <ResultCategoryList
                categories={aggregateCategories}
                hrefPrefix={`/live-results/${competition.id}`}
              />
            </section>
          </>
        )}
      </div>
    </main>
  );
}
