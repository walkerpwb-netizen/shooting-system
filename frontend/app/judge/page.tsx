"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiUrl } from "@/lib/api";
import { isJudge } from "@/lib/auth";

type JudgeCompetition = {
  id: number;
  name: string;
  date: string;
  location: string;
  is_head_judge: boolean;
  disciplines: JudgeDiscipline[];
};

type JudgeDiscipline = {
  id: number;
};

export default function JudgePage() {
  const router = useRouter();
  const [competitions, setCompetitions] = useState<JudgeCompetition[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isJudge()) {
      router.push("/");
      return;
    }

    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/login");
      return;
    }

    async function loadCompetitions() {
      try {
        const response = await fetch(
          apiUrl("/judge/competitions"),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        const data = await response.json();

        if (!response.ok) {
          setMessage(data.detail || "Nie udało się pobrać zawodów ❌");
          return;
        }

        setCompetitions(data);
      } catch (error) {
        console.error(error);
        setMessage("Błąd połączenia z serwerem ❌");
      } finally {
        setLoading(false);
      }
    }

    loadCompetitions();
  }, [router]);

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-5xl font-bold text-white mb-2">
            Panel Sędziego
          </h1>

          <p className="text-gray-400">
            Zawody przypisane do Twojego sędziowania.
          </p>
        </div>

        {message && (
          <p className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-white mb-6">
            {message}
          </p>
        )}

        {loading ? (
          <p className="text-gray-400">
            Ładowanie panelu sędziego...
          </p>
        ) : competitions.length === 0 ? (
          <p className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-gray-300">
            Nie masz jeszcze przypisanych opublikowanych zawodów.
          </p>
        ) : (
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              Zawody
            </h2>

            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
              {competitions.map((competition) => (
                <Link
                  key={competition.id}
                  href={`/judge/${competition.id}`}
                  className="block rounded-2xl p-5 border bg-zinc-900 border-zinc-800 hover:border-green-700 hover:bg-green-950/30 transition"
                >
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-2xl font-bold text-white">
                      {competition.name}
                    </h3>

                    {competition.is_head_judge && (
                      <span className="bg-green-100 text-green-900 px-3 py-1 rounded-full text-xs font-bold">
                        główny
                      </span>
                    )}
                  </div>

                  <p className="text-gray-400 mt-3">
                    {competition.date}
                  </p>

                  <p className="text-gray-400">
                    {competition.location}
                  </p>

                  <p className="text-gray-300 font-semibold mt-4">
                    Konkurencje: {competition.disciplines.length}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
