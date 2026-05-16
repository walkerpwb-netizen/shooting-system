"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiUrl } from "@/lib/api";

type LiveCompetition = {
  id: number;
  name: string;
  date: string;
  location: string;
  organizer_full_name: string;
  shooters_count: number;
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
            Aktualnie trwające zawody i rankingi odświeżane podczas pracy sędziów.
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
        ) : competitions.length === 0 ? (
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="mb-2 text-2xl font-bold text-white">
              Brak trwających zawodów
            </h2>

            <p className="text-gray-400">
              Lista pojawi się automatycznie, gdy organizator rozpocznie zawody.
            </p>
          </section>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {competitions.map((competition) => (
              <Link
                key={competition.id}
                href={`/live-results/${competition.id}`}
                className="group rounded-xl border border-zinc-800 bg-zinc-900 p-6 transition hover:border-green-700 hover:bg-zinc-800"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="rounded-full bg-green-700 px-3 py-1 text-sm font-bold text-white">
                    Trwają
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
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
