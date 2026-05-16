"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiUrl } from "@/lib/api";

type HistoricalCompetition = {
  id: number;
  name: string;
  date: string;
  location: string;
  organizer_full_name: string;
  shooters_count: number;
  status: string;
  completed_at: string;
};

function formatCompletedAt(value: string) {
  if (!value) {
    return "brak daty zakończenia";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "brak daty zakończenia";
  }

  return date.toLocaleString(
    "pl-PL",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

export default function HistoricalResultsPage() {
  const [competitions, setCompetitions] = useState<HistoricalCompetition[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadCompetitions() {
      try {
        const response = await fetch(
          apiUrl("/historical-results/competitions"),
          {
            cache: "no-store",
          }
        );
        const data = await response.json();

        if (!response.ok) {
          setMessage(data.detail || "Nie udało się pobrać wyników historycznych.");
          return;
        }

        if (active) {
          setCompetitions(data);
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

    loadCompetitions();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <p className="mb-3 inline-flex rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-bold text-zinc-200">
            Archiwum
          </p>

          <h1 className="mb-2 text-4xl font-bold text-white sm:text-5xl">
            Wyniki Historyczne
          </h1>

          <p className="max-w-2xl text-gray-400">
            Zakończone zawody starsze niż 24 godziny, posortowane od najnowszych.
          </p>
        </div>

        {message && (
          <p className="mb-6 rounded-xl border border-red-900 bg-red-950/50 p-4 text-red-100">
            {message}
          </p>
        )}

        {loading ? (
          <p className="text-gray-400">
            Ładowanie wyników historycznych...
          </p>
        ) : competitions.length === 0 ? (
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="mb-2 text-2xl font-bold text-white">
              Brak wyników historycznych
            </h2>

            <p className="text-gray-400">
              Zawody trafią tutaj 24 godziny po zakończeniu.
            </p>
          </section>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {competitions.map((competition) => (
              <Link
                key={competition.id}
                href={`/historical-results/${competition.id}`}
                className="ui-block group rounded-xl border border-zinc-800 bg-zinc-900 p-6 transition hover:border-green-700 hover:bg-zinc-800"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="rounded-full bg-zinc-700 px-3 py-1 text-sm font-bold text-white">
                    Zakończone
                  </span>

                  <span className="text-sm font-semibold text-gray-400">
                    {competition.shooters_count} zawodników
                  </span>
                </div>

                <h2 className="mb-4 text-2xl font-bold text-white group-hover:text-green-200">
                  {competition.name}
                </h2>

                <div className="space-y-2 text-sm text-gray-300">
                  <p>
                    Organizator: {competition.organizer_full_name || "brak danych"}
                  </p>

                  <p>
                    Lokalizacja: {competition.location}
                  </p>

                  <p>
                    Data: {competition.date}
                  </p>

                  <p>
                    Zakończone: {formatCompletedAt(competition.completed_at)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
