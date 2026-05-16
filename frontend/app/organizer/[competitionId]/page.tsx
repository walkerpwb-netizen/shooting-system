"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { apiUrl } from "@/lib/api";
import { isOrganizer } from "@/lib/auth";

type Competition = {
  id: number;
  name: string;
  date: string;
  location: string;
  entry_fee: string;
  organizer_full_name: string;
  organizer_logo: string;
  sponsors: string;
  sponsor_logo: string;
  participant_limit: number | null;
  status: string;
  disciplines_count: number;
  disciplines: {
    id: number;
    name: string;
    description: string;
    scoring_type: string;
    shots_count: number;
    ammo_type: string;
    ammo_price: string;
    entry_fee: string;
  }[];
  participants: {
    id: number;
    display_name: string;
    total_fee: string;
  }[];
  judges: {
    id: number;
    user_email: string;
    display_name: string;
    is_head_judge: boolean;
  }[];
  judge_assignments: {
    id: number;
    judge_email: string;
    discipline_id: number | null;
    discipline_name: string;
    display_name: string;
    is_head_judge: boolean;
  }[];
};

function parseFee(value: string) {
  const fee = Number((value || "0").replace(",", "."));

  return Number.isFinite(fee)
    ? fee
    : 0;
}

function formatFee(value: number) {
  return `${value.toFixed(2)} zł`;
}

const competitionStatusLabels: Record<string, string> = {
  draft: "Szkic",
  published: "Opublikowane",
  started: "Trwające",
  completed: "Zakończone",
};

function getCompetitionStatusLabel(status: string) {
  return competitionStatusLabels[status] || status;
}

export default function OrganizerCompetitionPage() {
  const router = useRouter();
  const params = useParams<{ competitionId: string }>();
  const competitionId = Number(params.competitionId);

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [judgeEmail, setJudgeEmail] = useState("");
  const [judgeDiscipline, setJudgeDiscipline] = useState("");
  const [headJudge, setHeadJudge] = useState(false);

  useEffect(() => {
    if (!isOrganizer()) {
      router.push("/");
      return;
    }

    fetchOrganizerCompetitions();
  }, [router]);

  async function fetchOrganizerCompetitions() {
    const token = localStorage.getItem("token");

    try {
      const response = await fetch(
        apiUrl("/my-competitions"),
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

  const competition = useMemo(
    () => competitions.find((item) => item.id === competitionId),
    [competitionId, competitions]
  );

  const assignedJudgeEmails = useMemo(() => {
    if (!competition) {
      return new Set<string>();
    }

    return new Set([
      ...competition.judge_assignments.map(
        (assignment) => assignment.judge_email
      ),
      ...competition.judges
        .filter((judge) => judge.is_head_judge)
        .map((judge) => judge.user_email),
    ]);
  }, [competition]);

  const availableJudges = useMemo(() => {
    if (!competition) {
      return [];
    }

    return competition.judges.filter(
      (judge) => !assignedJudgeEmails.has(judge.user_email)
    );
  }, [assignedJudgeEmails, competition]);

  const participantsTotalFee = useMemo(() => {
    if (!competition) {
      return 0;
    }

    return competition.participants.reduce(
      (sum, participant) => sum + parseFee(participant.total_fee),
      0
    );
  }, [competition]);

  async function inviteJudge() {
    if (!competition) {
      return;
    }

    if (!judgeEmail) {
      setMessage("Wybierz sędziego ❌");
      return;
    }

    const token = localStorage.getItem("token");

    try {
      setMessage("");

      const response = await fetch(
        apiUrl(`/competitions/${competition.id}/judge-invitations`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            judge_email: judgeEmail,
            discipline_ids: judgeDiscipline
              ? [Number(judgeDiscipline)]
              : [],
            is_head_judge: headJudge,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się przypisać sędziego ❌");
        return;
      }

      setMessage("Sędzia przypisany do zawodów ✅");
      setJudgeEmail("");
      setJudgeDiscipline("");
      setHeadJudge(false);
      fetchOrganizerCompetitions();
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  async function removeJudgeAssignment(
    assignment: Competition["judge_assignments"][number]
  ) {
    if (!competition) {
      return;
    }

    const confirmed = window.confirm(
      "Czy usunąć to przypisanie sędziego?"
    );

    if (!confirmed) {
      return;
    }

    const token = localStorage.getItem("token");

    try {
      setMessage("");

      const response = await fetch(
        apiUrl(`/competitions/${competition.id}/judge-invitations/remove`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            judge_email: assignment.judge_email,
            discipline_id: assignment.discipline_id,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się usunąć przypisania sędziego ❌");
        return;
      }

      setMessage("Przypisanie sędziego usunięte ✅");
      fetchOrganizerCompetitions();
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  async function removeParticipant(
    participant: Competition["participants"][number]
  ) {
    if (!competition) {
      return;
    }

    const confirmed = window.confirm(
      `Czy usunąć zawodnika "${participant.display_name}" z listy tych zawodów?`
    );

    if (!confirmed) {
      return;
    }

    const token = localStorage.getItem("token");

    try {
      setMessage("");

      const response = await fetch(
        apiUrl(`/organizer/competitions/${competition.id}/participants/${participant.id}`),
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się usunąć zawodnika ❌");
        return;
      }

      setMessage("Zawodnik usunięty z listy zawodów ✅");
      fetchOrganizerCompetitions();
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <Link
            href="/organizer"
            className="inline-flex mb-5 bg-red-700 hover:bg-red-600 text-white px-5 py-3 rounded-xl font-bold shadow-lg shadow-red-950/30 transition"
          >
            Wróć do panelu organizatora
          </Link>

          <h1 className="text-5xl font-bold text-white mb-2">
            {competition?.name || "Szczegóły zawodów"}
          </h1>

          {competition && (
            <p className="text-gray-400">
              {competition.date} • {competition.location} • {getCompetitionStatusLabel(competition.status)}
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
            Ładowanie zawodów...
          </p>
        ) : !competition ? (
          <p className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-gray-300">
            Nie znaleziono tych zawodów w Twoim panelu.
          </p>
        ) : (
          <div className="grid xl:grid-cols-[1fr_1fr] gap-6">
            <section className="bg-white rounded-3xl p-6 text-black shadow-xl">
              <div className="flex items-center justify-between gap-4 mb-5">
                <h2 className="text-3xl font-bold">
                  {competition.name}
                </h2>

                <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-semibold">
                  {getCompetitionStatusLabel(competition.status)}
                </span>
              </div>

              {(competition.organizer_logo || competition.sponsor_logo) && (
                <div className="grid grid-cols-2 gap-3 mb-5">
                  {competition.organizer_logo && (
                    <div className="h-20 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden">
                      <img
                        src={competition.organizer_logo}
                        alt="Logo organizatora"
                        className="h-full w-full object-contain p-2"
                      />
                    </div>
                  )}

                  {competition.sponsor_logo && (
                    <div className="h-20 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden">
                      <img
                        src={competition.sponsor_logo}
                        alt="Logo sponsora"
                        className="h-full w-full object-contain p-2"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2 text-gray-700 text-lg">
                <p>📅 {competition.date}</p>
                <p>📍 {competition.location}</p>
                {competition.organizer_full_name && (
                  <p>🏢 {competition.organizer_full_name}</p>
                )}
                {competition.sponsors && (
                  <p>🤝 Sponsorzy: {competition.sponsors}</p>
                )}
                <p>🎯 Dyscypliny: {competition.disciplines_count}</p>
                {competition.participant_limit && (
                  <p>
                    👥 Limit zawodników: {competition.participants.length}/{competition.participant_limit}
                  </p>
                )}
              </div>

              <div className="mt-6 border-t border-gray-200 pt-5">
                <h3 className="text-xl font-bold mb-3">
                  Konkurencje
                </h3>

                <div className="space-y-3">
                  {competition.disciplines.map((discipline) => (
                    <div
                      key={discipline.id}
                      className="border border-gray-200 rounded-2xl p-4"
                    >
                      <p className="font-bold">
                        {discipline.name}
                      </p>
                      <p className="text-gray-600">
                        {discipline.description || "Brak opisu"}
                      </p>
                      <p className="text-gray-700 text-sm mt-2">
                        Punktacja: {discipline.scoring_type}, strzały: {discipline.shots_count}
                      </p>
                      <p className="text-gray-700 text-sm">
                        Amunicja: {discipline.ammo_type || "brak"}, cena: {discipline.ammo_price || "0"} zł/szt.
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <div className="bg-white rounded-3xl p-6 text-black shadow-xl">
                <h2 className="text-2xl font-bold mb-4">
                  Sędziowie
                </h2>

                {competition.judges.length === 0 ? (
                  <p className="text-gray-500">
                    Brak sędziów zapisanych do tych zawodów.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {competition.judges.map((judge) => (
                      <p
                        key={judge.id}
                        className="bg-green-50 rounded-xl px-3 py-2"
                      >
                        {judge.display_name}
                        {assignedJudgeEmails.has(judge.user_email) && (
                          <span className="ml-2 text-green-800 font-bold">
                            przypisany
                          </span>
                        )}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-3xl p-6 text-black shadow-xl">
                <h2 className="text-2xl font-bold mb-4">
                  Przypisane funkcje
                </h2>

                {competition.judge_assignments.length === 0 ? (
                  <p className="text-gray-500">
                    Brak przypisanych funkcji sędziowskich.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {competition.judge_assignments.map((assignment) => (
                      <div
                        key={assignment.id}
                        className="bg-green-50 rounded-xl px-3 py-2 flex items-center justify-between gap-3"
                      >
                        <div>
                          <p>{assignment.display_name}</p>
                          <p className="text-sm text-gray-600">
                            {assignment.discipline_name}
                            {assignment.is_head_judge && (
                              <span className="ml-2 text-green-800 font-bold">
                                sędzia główny
                              </span>
                            )}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeJudgeAssignment(assignment)}
                          className="bg-red-700 hover:bg-red-600 text-white w-8 h-8 rounded-full font-black leading-none transition"
                          aria-label="Usuń przypisanie sędziego"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-3xl p-6 text-black shadow-xl space-y-3">
                <h2 className="text-2xl font-bold">
                  Przypisz sędziego do funkcji
                </h2>

                {availableJudges.length === 0 && (
                  <p className="text-gray-600 text-sm">
                    Na tej liście pojawią się tylko wolni sędziowie, którzy dołączyli do tych zawodów jako sędzia i nie mają jeszcze przypisanej funkcji.
                  </p>
                )}

                <select
                  value={judgeEmail}
                  onChange={(event) => setJudgeEmail(event.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-3"
                >
                  <option value="">Wybierz sędziego</option>

                  {availableJudges.map((judge) => (
                    <option
                      key={judge.id}
                      value={judge.user_email}
                    >
                      {judge.display_name}
                    </option>
                  ))}
                </select>

                <select
                  value={judgeDiscipline}
                  onChange={(event) => setJudgeDiscipline(event.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-3"
                >
                  <option value="">Całe zawody</option>

                  {competition.disciplines.map((discipline) => (
                    <option
                      key={discipline.id}
                      value={discipline.id}
                    >
                      {discipline.name}
                    </option>
                  ))}
                </select>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={headJudge}
                    onChange={(event) => setHeadJudge(event.target.checked)}
                  />
                  Sędzia główny zawodów
                </label>

                <button
                  type="button"
                  onClick={inviteJudge}
                  disabled={availableJudges.length === 0 || !judgeEmail}
                  className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold transition"
                >
                  Przypisz sędziego
                </button>
              </div>

              <div className="bg-white rounded-3xl p-6 text-black shadow-xl">
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-2xl font-bold">
                      Zawodnicy
                    </h2>
                    <p className="text-gray-500">
                      Suma opłat: {formatFee(participantsTotalFee)}
                    </p>
                  </div>

                  <span className="bg-red-100 text-red-800 px-4 py-2 rounded-xl font-bold">
                    Do zapłaty
                  </span>
                </div>

                <Link
                  href={`/organizer/${competition.id}/payments`}
                  className="block w-full bg-green-700 hover:bg-green-600 text-white text-center py-3 rounded-xl font-bold mb-4 transition"
                >
                  Otwórz listę obecności i opłat
                </Link>

                {competition.participants.length === 0 ? (
                  <p className="text-gray-500">
                    Brak zapisanych zawodników.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {competition.participants.map((participant) => (
                      <div
                        key={participant.id}
                        className="bg-gray-100 rounded-xl px-3 py-2 grid grid-cols-[1fr_auto_auto] gap-3 items-center"
                      >
                        <p>
                          {participant.display_name}
                        </p>

                        <p className="font-black text-red-700">
                          {formatFee(parseFee(participant.total_fee))}
                        </p>

                        <button
                          type="button"
                          onClick={() => removeParticipant(participant)}
                          className="bg-red-700 hover:bg-red-600 text-white w-8 h-8 rounded-full font-black leading-none transition"
                          aria-label="Usuń zawodnika z listy zawodów"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
