"use client";

import { useEffect, useState } from "react";

import ResultCompetitionList from "@/app/components/ResultCompetitionList";
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
        ) : (
          <ResultCompetitionList
            competitions={competitions}
            emptyTitle="Brak wyników historycznych"
            emptyText="Zawody trafią tutaj 24 godziny po zakończeniu."
            hrefPrefix="/historical-results"
          />
        )}
      </div>
    </main>
  );
}
