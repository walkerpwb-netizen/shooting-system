"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiUrl } from "@/lib/api";
import { isOrganizer } from "@/lib/auth";

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

function categoryDescription(category: OrganizerResultCategory) {
  if (category.type === "discipline") {
    return "Konkurencja dostępna w tych zawodach";
  }

  if (category.disciplines_count === 0) {
    return "Brak pasujących konkurencji w tych zawodach";
  }

  if (category.disciplines_count === 1) {
    return "Suma z 1 konkurencji";
  }

  return `Suma z ${category.disciplines_count} konkurencji`;
}

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

    const token = localStorage.getItem("token");

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
          className="mb-6 inline-flex rounded-xl bg-red-700 px-5 py-3 font-bold text-white transition hover:bg-red-600"
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
            Ładowanie wyników...
          </p>
        ) : !competition ? (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-gray-300">
            Wyniki są dostępne po rozpoczęciu zawodów.
          </p>
        ) : (
          <>
            <div className="mb-8">
              <p className="mb-3 inline-flex rounded-full border border-green-700 bg-green-950/70 px-4 py-2 text-sm font-bold text-green-200">
                Wyniki organizatora
              </p>

              <h1 className="mb-3 text-4xl font-bold text-white sm:text-5xl">
                {competition.name}
              </h1>

              <div className="flex flex-wrap gap-x-5 gap-y-2 text-gray-400">
                <span>{competition.location}</span>
                <span>{competition.date}</span>
                <span>{statusLabels[competition.status] || competition.status}</span>
              </div>
            </div>

            <section className="mb-8">
              <h2 className="mb-4 text-2xl font-bold text-white">
                Dostępne konkurencje
              </h2>

              {disciplineCategories.length === 0 ? (
                <p className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-gray-400">
                  Brak konkurencji w tych zawodach.
                </p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {disciplineCategories.map((category) => (
                    <Link
                      key={category.id}
                      href={`/organizer/${competition.id}/results/${category.id}`}
                      className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition hover:border-green-700 hover:bg-zinc-800"
                    >
                      <p className="mb-2 text-xl font-bold text-white">
                        {category.name}
                      </p>

                      <p className="text-sm text-gray-400">
                        {categoryDescription(category)}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-bold text-white">
                Klasyfikacje zbiorcze
              </h2>

              <div className="grid gap-4 md:grid-cols-2">
                {aggregateCategories.map((category) => (
                  <Link
                    key={category.id}
                    href={`/organizer/${competition.id}/results/${category.id}`}
                    className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition hover:border-green-700 hover:bg-zinc-800"
                  >
                    <p className="mb-2 text-xl font-bold text-white">
                      {category.name}
                    </p>

                    <p className="text-sm text-gray-400">
                      {categoryDescription(category)}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
