"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { apiUrl } from "@/lib/api";
import { authFetch, getAccessToken, isPzssClubAccount } from "@/lib/auth";

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
  name: string;
  description: string;
  scoring_type: string;
  discipline_type: string;
  discipline_type_label?: string;
  shots_count: number;
  ammo_type: string;
  ammo_price: string;
  entry_fee: string;
  shooters_count: number;
};

export default function JudgeCompetitionPage() {
  const router = useRouter();
  const params = useParams<{ competitionId: string }>();
  const competitionId = Number(params.competitionId);

  const [competitions, setCompetitions] = useState<JudgeCompetition[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = getAccessToken();

    if (!token) {
      router.push("/login");
      return;
    }

    if (isPzssClubAccount()) {
      router.replace("/profile");
      return;
    }

    async function loadCompetitions() {
      try {
        const response = await authFetch(
          apiUrl("/judge/competitions"),
          {}
        );
        const data = await response.json();

        if (!response.ok) {
          setMessage(data.detail || "Nie udało się pobrać konkurencji ❌");
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

  const competition = useMemo(
    () => competitions.find((item) => item.id === competitionId),
    [competitionId, competitions]
  );

  return (
    <main className="min-h-screen px-4 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 sm:mb-6">
          <Link
            href="/judge"
            className="mb-3 inline-flex bg-red-700 px-4 py-3 font-bold text-white shadow-lg shadow-red-950/30 transition hover:bg-red-600 sm:mb-5 sm:px-5"
          >
            Wróć do panelu sędziego
          </Link>

          <h1 className="mb-1 text-2xl font-bold leading-tight text-zinc-950 dark:text-white sm:mb-2 sm:text-5xl">
            {competition?.name || "Konkurencje"}
          </h1>

          {competition && (
            <p className="text-sm text-zinc-500 dark:text-gray-400 sm:text-base">
              {competition.date} • {competition.location}
              {competition.is_head_judge ? " • sędzia główny" : ""}
            </p>
          )}
        </div>

        {message && (
          <p className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-white mb-6">
            {message}
          </p>
        )}

        {loading ? (
          <p className="text-gray-400">
            Ładowanie konkurencji...
          </p>
        ) : !competition ? (
          <p className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-gray-300">
            Nie masz dostępu do tych zawodów albo nie są już opublikowane.
          </p>
        ) : competition.disciplines.length === 0 ? (
          <p className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-gray-300">
            Brak konkurencji dostępnych dla Twojej funkcji.
          </p>
        ) : (
          <section>
            <div className="grid gap-4 md:grid-cols-2 md:gap-5">
              {competition.disciplines.map((discipline) => (
                <Link
                  key={discipline.id}
                  href={`/judge/${competition.id}/${discipline.id}`}
                  className="block border border-zinc-800 bg-zinc-900 p-5 transition hover:border-green-700 hover:bg-green-950/30"
                >
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-xl font-bold text-white">
                      {discipline.name}
                    </h3>

                    <span className="bg-zinc-800 text-gray-300 px-3 py-1 rounded-full text-sm font-semibold">
                      {discipline.shooters_count}
                    </span>
                  </div>

                  <p className="text-gray-400 mt-2">
                    {discipline.description || "Brak opisu"}
                  </p>

                  <div className="text-gray-300 mt-4 space-y-1">
                    <p>
                      Rodzaj: {discipline.discipline_type_label || "Nie podano"}
                    </p>
                    <p>
                      Punktacja: {discipline.scoring_type}
                    </p>
                    <p>
                      Strzały: {discipline.shots_count}
                    </p>
                    <p>
                      Amunicja: {discipline.ammo_type || "Nie podano"}
                    </p>
                    <p>
                      Cena amunicji: {discipline.ammo_price || "0"} zł/szt.
                    </p>
                    {discipline.entry_fee && (
                      <p>
                        Opłata konkurencji: {discipline.entry_fee} zł
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
