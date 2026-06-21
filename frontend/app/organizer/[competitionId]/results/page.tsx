"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import ResultCategoryList from "@/app/components/ResultCategoryList";
import { apiUrl } from "@/lib/api";
import { getAccessToken, isOrganizer } from "@/lib/auth";

type OrganizerResultCategory = {
  id: string;
  name: string;
  type: "discipline" | "aggregate";
  discipline_ids: number[];
  disciplines_count: number;
};

type OrganizerResultCompetition = {
  id: number;
  name: string;
  date: string;
  location: string;
  organizer_full_name: string;
  status: string;
  completed_at: string;
  categories: OrganizerResultCategory[];
};

const statusLabels: Record<string, string> = {
  started: "Trwające",
  completed: "Zakończone",
};

export default function OrganizerResultsPage() {
  const router = useRouter();
  const params = useParams<{ competitionId: string }>();
  const competitionId = Number(params.competitionId);

  const [competition, setCompetition] = useState<OrganizerResultCompetition | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isOrganizer()) {
      router.push("/");
      return;
    }

    const token = getAccessToken();

    if (!token) {
      router.push("/login");
      return;
    }

    let active = true;

    async function loadResults() {
      try {
        const response = await fetch(
          apiUrl(`/organizer/competitions/${competitionId}/results`),
          {
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        const data = await response.json();

        if (!response.ok) {
          setMessage(data.detail || "Nie udało się pobrać wyników zawodów.");
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

    loadResults();
    const intervalId = window.setInterval(loadResults, 10000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [competitionId, router]);

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
          href={`/organizer/${competitionId}`}
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
          <p className="text-zinc-600 dark:text-gray-400">
            Ładowanie wyników...
          </p>
        ) : !competition ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-gray-300">
            Wyniki są dostępne po rozpoczęciu zawodów.
          </p>
        ) : (
          <>
            <div className="mb-8">
              <p className="mb-3 inline-flex rounded-full border border-green-700 bg-green-950/70 px-4 py-2 text-sm font-bold text-green-200">
                Wyniki organizatora
              </p>

              <h1 className="mb-3 text-4xl font-bold text-zinc-950 dark:text-white sm:text-5xl">
                {competition.name}
              </h1>

              <div className="flex flex-wrap gap-x-5 gap-y-2 text-zinc-600 dark:text-gray-400">
                <span>{competition.location}</span>
                <span>{competition.date}</span>
                <span>{statusLabels[competition.status] || competition.status}</span>
              </div>
            </div>

            <section className="mb-8">
              <h2 className="mb-4 text-2xl font-bold text-zinc-950 dark:text-white">
                Dostępne konkurencje
              </h2>

              {disciplineCategories.length === 0 ? (
                <ResultCategoryList
                  categories={disciplineCategories}
                  emptyMessage="Brak konkurencji w tych zawodach."
                  hrefPrefix={`/organizer/${competition.id}/results`}
                />
              ) : (
                <ResultCategoryList
                  categories={disciplineCategories}
                  emptyMessage="Brak konkurencji w tych zawodach."
                  hrefPrefix={`/organizer/${competition.id}/results`}
                />
              )}
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-bold text-zinc-950 dark:text-white">
                Klasyfikacje zbiorcze
              </h2>

              <ResultCategoryList
                categories={aggregateCategories}
                hrefPrefix={`/organizer/${competition.id}/results`}
              />
            </section>
          </>
        )}
      </div>
    </main>
  );
}
