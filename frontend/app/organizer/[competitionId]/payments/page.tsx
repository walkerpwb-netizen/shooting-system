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
  status: string;
};

type PaymentParticipant = {
  id: number;
  user_email: string;
  display_name: string;
  first_name: string;
  last_name: string;
  license_number: string;
  club: string;
  total_fee: string;
  disciplines: {
    id: number;
    name: string;
  }[];
  checked_in: boolean;
  checked_in_at: string;
  paid: boolean;
  paid_at: string;
};

type SortField = "name" | "license" | "club" | "disciplines" | "fee" | "checked_in" | "paid";
type SortDirection = "asc" | "desc";

function parseFee(value: string) {
  const fee = Number((value || "0").replace(",", "."));

  return Number.isFinite(fee)
    ? fee
    : 0;
}

function formatFee(value: number) {
  return `${value.toFixed(2)} zł`;
}

function participantName(participant: PaymentParticipant) {
  return [participant.last_name, participant.first_name].filter(Boolean).join(" ")
    || participant.display_name
    || participant.user_email;
}

function disciplinesText(participant: PaymentParticipant) {
  return participant.disciplines.map((discipline) => discipline.name).join(", ");
}

function getSortValue(participant: PaymentParticipant, field: SortField) {
  if (field === "name") {
    return participantName(participant);
  }

  if (field === "license") {
    return participant.license_number || "";
  }

  if (field === "club") {
    return participant.club || "";
  }

  if (field === "disciplines") {
    return disciplinesText(participant);
  }

  if (field === "fee") {
    return parseFee(participant.total_fee);
  }

  return participant[field] ? 1 : 0;
}

async function readJsonResponse(response: Response) {
  const responseText = await response.text();

  if (!responseText) {
    return {};
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return {
      detail: `Serwer zwrócił nieczytelną odpowiedź (${response.status})`,
    };
  }
}

export default function OrganizerPaymentsPage() {
  const router = useRouter();
  const params = useParams<{ competitionId: string }>();
  const competitionId = Number(params.competitionId);

  const [competition, setCompetition] = useState<Competition | null>(null);
  const [participants, setParticipants] = useState<PaymentParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

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

    async function loadPayments() {
      try {
        const response = await fetch(
          apiUrl(`/organizer/competitions/${competitionId}/payments`),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        const data = await readJsonResponse(response);

        if (!response.ok) {
          setMessage(data.detail || "Nie udało się pobrać rozliczeń ❌");
          return;
        }

        setCompetition(data.competition);
        setParticipants(data.participants);
      } catch (error) {
        console.error(error);
        setMessage("Błąd połączenia z serwerem ❌");
      } finally {
        setLoading(false);
      }
    }

    loadPayments();
  }, [competitionId, router]);

  const summary = useMemo(() => {
    const totalFee = participants.reduce(
      (sum, participant) => sum + parseFee(participant.total_fee),
      0
    );
    const paidTotal = participants.reduce(
      (sum, participant) =>
        participant.paid
          ? sum + parseFee(participant.total_fee)
          : sum,
      0
    );

    return {
      participantsCount: participants.length,
      checkedInCount: participants.filter((participant) => participant.checked_in).length,
      paidCount: participants.filter((participant) => participant.paid).length,
      totalFee,
      paidTotal,
      unpaidTotal: totalFee - paidTotal,
    };
  }, [participants]);

  const visibleParticipants = useMemo(() => {
    const normalizedFilter = filter.trim().toLowerCase();
    const filteredParticipants = participants.filter((participant) => {
      if (!normalizedFilter) {
        return true;
      }

      return [
        participantName(participant),
        participant.license_number,
        participant.club,
        participant.user_email,
        disciplinesText(participant),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedFilter);
    });

    return filteredParticipants.sort((firstParticipant, secondParticipant) => {
      const firstValue = getSortValue(firstParticipant, sortField);
      const secondValue = getSortValue(secondParticipant, sortField);
      let sortResult = 0;

      if (typeof firstValue === "number" && typeof secondValue === "number") {
        sortResult = firstValue - secondValue;
      } else {
        sortResult = String(firstValue).localeCompare(
          String(secondValue),
          "pl",
          {
            sensitivity: "base",
            numeric: true,
          }
        );
      }

      return sortDirection === "asc"
        ? sortResult
        : -sortResult;
    });
  }, [filter, participants, sortDirection, sortField]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
      return;
    }

    setSortField(field);
    setSortDirection("asc");
  }

  function sortMark(field: SortField) {
    if (sortField !== field) {
      return "↕";
    }

    return sortDirection === "asc" ? "↑" : "↓";
  }

  async function updateParticipant(
    participant: PaymentParticipant,
    changes: Partial<Pick<PaymentParticipant, "checked_in" | "paid">>
  ) {
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/login");
      return;
    }

    try {
      setSavingId(participant.id);
      setMessage("");

      const response = await fetch(
        apiUrl(`/organizer/competitions/${competitionId}/participants/${participant.id}/payments`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(changes),
        }
      );
      const data = await readJsonResponse(response);

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się zaktualizować zawodnika ❌");
        return;
      }

      setParticipants((currentParticipants) =>
        currentParticipants.map((currentParticipant) =>
          currentParticipant.id === participant.id
            ? data.participant
            : currentParticipant
        )
      );
      setMessage("Status zawodnika zaktualizowany ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <Link
            href={`/organizer/${competitionId}`}
            className="inline-flex mb-5 bg-red-700 hover:bg-red-600 text-white px-5 py-3 rounded-xl font-bold shadow-lg shadow-red-950/30 transition"
          >
            Wróć do zawodów
          </Link>

          <h1 className="text-5xl font-bold text-white mb-2">
            Obecność i opłaty
          </h1>

          {competition && (
            <p className="text-gray-400">
              {competition.name} • {competition.date} • {competition.location}
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
            Ładowanie rozliczeń...
          </p>
        ) : !competition ? (
          <p className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-gray-300">
            Nie znaleziono zawodów albo nie masz do nich dostępu.
          </p>
        ) : (
          <section className="space-y-5">
            <div className="grid md:grid-cols-4 gap-3">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <p className="text-sm text-gray-400">
                  Zawodnicy
                </p>
                <p className="text-2xl font-black text-white">
                  {summary.participantsCount}
                </p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <p className="text-sm text-gray-400">
                  Przybyli
                </p>
                <p className="text-2xl font-black text-white">
                  {summary.checkedInCount}
                </p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <p className="text-sm text-gray-400">
                  Opłacone
                </p>
                <p className="text-2xl font-black text-green-400">
                  {formatFee(summary.paidTotal)}
                </p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <p className="text-sm text-gray-400">
                  Do pobrania
                </p>
                <p className="text-2xl font-black text-red-400">
                  {formatFee(summary.unpaidTotal)}
                </p>
              </div>
            </div>

            <div className="md:hidden bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-zinc-800">
                <h2 className="text-2xl font-bold text-white">
                  Lista zawodników
                </h2>
                <p className="text-gray-400 mt-1">
                  Potwierdzaj przybycie i opłaty w dniu zawodów.
                </p>

                <input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Filtruj zawodnika"
                  className="mt-4 w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-base text-white placeholder:text-gray-500 focus:outline-none focus:border-green-700"
                />
              </div>

              <div className="p-3 space-y-3">
                {visibleParticipants.length === 0 ? (
                  <p className="px-1 py-3 text-gray-400">
                    Brak zawodników pasujących do filtra.
                  </p>
                ) : (
                  visibleParticipants.map((participant) => {
                    const isSaving = savingId === participant.id;
                    const isComplete = participant.checked_in && participant.paid;

                    return (
                      <div
                        key={participant.id}
                        className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <Link
                              href={`/profile/${participant.id}`}
                              className="text-lg font-black text-white transition hover:text-green-300"
                            >
                              {participantName(participant)}
                            </Link>
                            {isComplete && (
                              <p className="mt-1 text-sm font-bold text-green-400">
                                Potwierdzony
                              </p>
                            )}
                          </div>

                          <p className="shrink-0 rounded-full bg-red-950/50 px-3 py-1 text-sm font-black text-red-200">
                            {formatFee(parseFee(participant.total_fee))}
                          </p>
                        </div>

                        <dl className="grid grid-cols-1 gap-3 text-sm">
                          <div className="rounded-xl bg-zinc-900 p-3">
                            <dt className="text-gray-500">
                              Licencja
                            </dt>
                            <dd className="font-bold text-gray-200">
                              {participant.license_number || "brak"}
                            </dd>
                          </div>

                          <div className="rounded-xl bg-zinc-900 p-3">
                            <dt className="text-gray-500">
                              Klub
                            </dt>
                            <dd className="font-bold text-gray-200">
                              {participant.club || "brak"}
                            </dd>
                          </div>

                          <div className="rounded-xl bg-zinc-900 p-3">
                            <dt className="text-gray-500">
                              Konkurencje
                            </dt>
                            <dd className="font-bold text-gray-200">
                              {disciplinesText(participant) || "brak"}
                            </dd>
                          </div>
                        </dl>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => updateParticipant(participant, {
                              checked_in: !participant.checked_in,
                            })}
                            disabled={isSaving}
                            className={`rounded-xl px-3 py-3 font-bold transition ${
                              participant.checked_in
                                ? "bg-green-900/70 text-green-100 hover:bg-green-800"
                                : "bg-zinc-700 text-gray-200 hover:bg-zinc-600"
                            } disabled:opacity-50`}
                          >
                            {participant.checked_in ? "Przybył" : "Brak"}
                          </button>

                          <button
                            type="button"
                            onClick={() => updateParticipant(participant, {
                              paid: !participant.paid,
                            })}
                            disabled={isSaving}
                            className={`rounded-xl px-3 py-3 font-bold transition ${
                              participant.paid
                                ? "bg-green-900/70 text-green-100 hover:bg-green-800"
                                : "bg-red-900/70 text-red-100 hover:bg-red-800"
                            } disabled:opacity-50`}
                          >
                            {participant.paid ? "Opłacone" : "Do zapłaty"}
                          </button>
                        </div>

                        {!isComplete ? (
                          <button
                            type="button"
                            onClick={() => updateParticipant(participant, {
                              checked_in: true,
                              paid: true,
                            })}
                            disabled={isSaving}
                            className="w-full rounded-xl bg-green-700 px-4 py-3 font-bold text-white transition hover:bg-green-600 disabled:opacity-50"
                          >
                            Przybył i opłacił
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => updateParticipant(participant, {
                              checked_in: false,
                              paid: false,
                            })}
                            disabled={isSaving}
                            className="w-full rounded-xl bg-red-700 px-4 py-3 font-bold text-white transition hover:bg-red-600 disabled:opacity-50"
                          >
                            Cofnij status
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="hidden md:block bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
              <div className="min-w-[1240px]">
                <div className="px-3 py-3 border-b border-zinc-800">
                  <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                    <div>
                      <h2 className="text-2xl font-bold text-white">
                        Lista zawodników
                      </h2>
                      <p className="text-gray-400">
                        Potwierdzaj przybycie i opłaty w dniu zawodów.
                      </p>
                    </div>

                    <input
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                      placeholder="Filtruj po nazwisku, licencji, klubie lub konkurencji"
                      className="w-full md:w-[420px] bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-green-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-[1.5fr_1fr_1.1fr_1.4fr_0.8fr_0.9fr_0.9fr_1.7fr] gap-3 px-3 py-2 text-xs font-bold text-gray-400 border-b border-zinc-800 bg-zinc-950/40">
                  <button
                    type="button"
                    onClick={() => toggleSort("name")}
                    className="text-left hover:text-white transition"
                  >
                    Nazwisko Imię {sortMark("name")}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleSort("license")}
                    className="text-left hover:text-white transition"
                  >
                    Licencja {sortMark("license")}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleSort("club")}
                    className="text-left hover:text-white transition"
                  >
                    Klub {sortMark("club")}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleSort("disciplines")}
                    className="text-left hover:text-white transition"
                  >
                    Konkurencje {sortMark("disciplines")}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleSort("fee")}
                    className="text-left hover:text-white transition"
                  >
                    Kwota {sortMark("fee")}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleSort("checked_in")}
                    className="text-left hover:text-white transition"
                  >
                    Obecność {sortMark("checked_in")}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleSort("paid")}
                    className="text-left hover:text-white transition"
                  >
                    Opłata {sortMark("paid")}
                  </button>

                  <p>Akcje</p>
                </div>

                {visibleParticipants.length === 0 ? (
                  <p className="px-3 py-4 text-gray-400">
                    Brak zawodników pasujących do filtra.
                  </p>
                ) : (
                  visibleParticipants.map((participant) => {
                    const isSaving = savingId === participant.id;
                    const isComplete = participant.checked_in && participant.paid;

                    return (
                      <div
                        key={participant.id}
                        className="grid grid-cols-[1.5fr_1fr_1.1fr_1.4fr_0.8fr_0.9fr_0.9fr_1.7fr] gap-3 px-3 py-2 items-center text-sm border-b border-zinc-800 last:border-b-0 hover:bg-zinc-800/40"
                      >
                        <Link
                          href={`/profile/${participant.id}`}
                          className="font-semibold text-white transition hover:text-green-300"
                        >
                          {participantName(participant)}
                        </Link>

                        <p className="text-gray-300">
                          {participant.license_number || "brak"}
                        </p>

                        <p className="text-gray-300">
                          {participant.club || "brak"}
                        </p>

                        <p className="text-gray-300">
                          {disciplinesText(participant) || "brak"}
                        </p>

                        <p className="text-red-300 font-black">
                          {formatFee(parseFee(participant.total_fee))}
                        </p>

                        <button
                          type="button"
                          onClick={() => updateParticipant(participant, {
                            checked_in: !participant.checked_in,
                          })}
                          disabled={isSaving}
                          className={`px-2 py-1 rounded-md font-bold transition ${
                            participant.checked_in
                              ? "bg-green-900/60 text-green-200 hover:bg-green-800"
                              : "bg-zinc-700 text-gray-200 hover:bg-zinc-600"
                          } disabled:opacity-50`}
                        >
                          {participant.checked_in ? "Przybył" : "Brak"}
                        </button>

                        <button
                          type="button"
                          onClick={() => updateParticipant(participant, {
                            paid: !participant.paid,
                          })}
                          disabled={isSaving}
                          className={`px-2 py-1 rounded-md font-bold transition ${
                            participant.paid
                              ? "bg-green-900/60 text-green-200 hover:bg-green-800"
                              : "bg-red-900/60 text-red-200 hover:bg-red-800"
                          } disabled:opacity-50`}
                        >
                          {participant.paid ? "Opłacone" : "Do zapłaty"}
                        </button>

                        <div className="flex gap-2">
                          {!isComplete ? (
                            <button
                              type="button"
                              onClick={() => updateParticipant(participant, {
                                checked_in: true,
                                paid: true,
                              })}
                              disabled={isSaving}
                              className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white px-3 py-2 rounded-md font-bold transition"
                            >
                              Przybył i opłacił
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => updateParticipant(participant, {
                                checked_in: false,
                                paid: false,
                              })}
                              disabled={isSaving}
                              className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white px-3 py-2 rounded-md font-bold transition"
                            >
                              Cofnij status
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
