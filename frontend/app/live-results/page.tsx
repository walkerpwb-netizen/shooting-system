"use client";

import { useEffect, useState } from "react";

import ResultCompetitionList from "@/app/components/ResultCompetitionList";
import { apiUrl } from "@/lib/api";

type LiveCompetition = {
  id: number;
  name: string;
  date: string;
  location: string;
  organizer_full_name: string;
  shooters_count: number;
  status: string;
  completed_at: string;
};

export default function LiveResultsPage() {
  const [competitions, setCompetitions] = useState<LiveCompetition[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadCompetitions() {
      try {
        const response = await fetch(
          apiUrl("/live-results/competitions"),
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
    const intervalId = window.setInterval(loadCompetitions, 10000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <p className="mb-3 inline-flex rounded-full border border-green-700 bg-green-950/70 px-4 py-2 text-sm font-bold text-green-200">
            Na żywo
          </p>

          <h1 className="mb-2 text-4xl font-bold text-white sm:text-5xl">
            Wyniki na Żywo
          </h1>

          <p className="max-w-2xl text-gray-400">
            Aktualnie trwające zawody oraz wyniki dostępne jeszcze przez 24 godziny po zakończeniu.
          </p>
        </div>

        {message && (
          <p className="mb-6 rounded-xl border border-red-900 bg-red-950/50 p-4 text-red-100">
            {message}
          </p>
        )}

        {loading ? (
          <p className="text-gray-400">
            Ładowanie zawodów...
          </p>
        ) : (
          <ResultCompetitionList
            competitions={competitions}
            emptyTitle="Brak trwających zawodów"
            emptyText="Lista pojawi się automatycznie, gdy organizator rozpocznie zawody albo zakończy je w ciągu ostatnich 24 godzin."
            hrefPrefix="/live-results"
            live
          />
        )}
      </div>
    </main>
  );
}
