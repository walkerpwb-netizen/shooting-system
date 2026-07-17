"use client";

import NextImage from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import QrCodeScanner from "@/components/QrCodeScanner";
import { apiUrl } from "@/lib/api";
import { authFetch, getAccessToken, isOrganizer } from "@/lib/auth";
import {
  POWER_FACTOR_OPTIONS,
  getClayTargetsCount,
  getDynamicDisciplineDivisions,
  isDynamicStageDisciplineType,
} from "@/lib/disciplines";

type CompetitionDiscipline = {
  id: number;
  name: string;
  discipline_type: string;
  discipline_type_label?: string;
  shots_count: number;
  trap_variant?: string;
  trap_series_count?: number;
  clay_variant?: string;
  clay_series_count?: number;
  ammo_type: string;
  ammo_price: string;
  clay_price?: string;
  entry_fee: string;
  fixed_power_factor?: string;
  fixed_division?: string;
};

type Competition = {
  id: number;
  name: string;
  date: string;
  location: string;
  status: string;
  entry_fee: string;
  disciplines: CompetitionDiscipline[];
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
type AddDisciplineDraft = {
  discipline_id: string;
  ammo_type: "" | "own" | "club";
  division: string;
  power_factor: "" | "minor" | "major";
};

function licenseDigits(value: string) {
  return value.replace(/\D/g, "");
}

function licenseFromQrPayload(value: string) {
  try {
    const parsed = JSON.parse(value);

    if (Array.isArray(parsed)) {
      const licenseNumber = parsed[2];

      return typeof licenseNumber === "string" || typeof licenseNumber === "number"
        ? String(licenseNumber).trim()
        : "";
    }

    if (parsed && typeof parsed === "object") {
      const payload = parsed as Record<string, unknown>;
      const licenseNumber = payload.license_number ?? payload.licenseNumber;

      return typeof licenseNumber === "string" || typeof licenseNumber === "number"
        ? String(licenseNumber).trim()
        : "";
    }
  } catch {
    // Plain license numbers are handled below.
  }

  return value.trim();
}

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
  const [scannerOpen, setScannerOpen] = useState(false);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [disciplineDrafts, setDisciplineDrafts] = useState<Record<number, AddDisciplineDraft>>({});
  const [addingDisciplineId, setAddingDisciplineId] = useState<number | null>(null);

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

    async function loadPayments() {
      try {
        const response = await authFetch(
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

  function handleParticipantQrScan(value: string) {
    const scannedLicense = licenseFromQrPayload(value);
    const scannedLicenseDigits = licenseDigits(scannedLicense);

    setScannerOpen(false);

    if (!scannedLicense) {
      setMessage("Nie rozpoznano numeru licencji w kodzie QR ❌");
      return;
    }

    const participant = participants.find((currentParticipant) => {
      const currentLicense = currentParticipant.license_number || "";

      return currentLicense.toLocaleLowerCase("pl-PL")
        === scannedLicense.toLocaleLowerCase("pl-PL")
        || Boolean(
          scannedLicenseDigits
          && licenseDigits(currentLicense) === scannedLicenseDigits
        );
    });

    if (!participant) {
      setMessage("Brak zawodnika z zeskanowaną licencją na liście opłat ❌");
      return;
    }

    setFilter(participantName(participant));
    setMessage(`Znaleziono zawodnika: ${participantName(participant)} ✅`);
  }

  function availableDisciplines(participant: PaymentParticipant) {
    if (!competition) {
      return [];
    }

    const assignedIds = new Set(participant.disciplines.map((discipline) => discipline.id));

    return competition.disciplines.filter((discipline) => !assignedIds.has(discipline.id));
  }

  function getDisciplineDraft(participant: PaymentParticipant) {
    const available = availableDisciplines(participant);
    const current = disciplineDrafts[participant.id];

    if (current) {
      return current;
    }

    return {
      discipline_id: available[0]?.id ? String(available[0].id) : "",
      ammo_type: "",
      division: "",
      power_factor: "",
    } satisfies AddDisciplineDraft;
  }

  function updateDisciplineDraft(
    participant: PaymentParticipant,
    changes: Partial<AddDisciplineDraft>
  ) {
    setDisciplineDrafts((current) => {
      const draft = {
        ...getDisciplineDraft(participant),
        ...changes,
      };

      if (changes.discipline_id) {
        draft.division = "";
        draft.power_factor = "";
      }

      return {
        ...current,
        [participant.id]: draft,
      };
    });
  }

  function estimateAddedDisciplineFee(discipline: CompetitionDiscipline | undefined, ammoType: AddDisciplineDraft["ammo_type"]) {
    if (!competition || !discipline) {
      return 0;
    }

    const competitionFee = parseFee(competition.entry_fee);
    const entryFee = competitionFee === 0
      ? parseFee(discipline.entry_fee)
      : 0;
    const ammoFee = ammoType === "club"
      ? parseFee(discipline.ammo_price) * (discipline.shots_count || 0)
        + parseFee(discipline.clay_price || "") * getClayTargetsCount(discipline)
      : 0;

    return entryFee + ammoFee;
  }

  async function addParticipantDiscipline(participant: PaymentParticipant) {
    const token = getAccessToken();

    if (!token) {
      router.push("/login");
      return;
    }

    if (!competition) {
      return;
    }

    const draft = getDisciplineDraft(participant);
    const discipline = competition.disciplines.find(
      (item) => item.id === Number(draft.discipline_id)
    );

    if (!discipline) {
      setMessage("Wybierz konkurencję do dopisania ❌");
      return;
    }

    if (!draft.ammo_type) {
      setMessage("Wybierz typ amunicji dla dopisywanej konkurencji ❌");
      return;
    }

    if (
      isDynamicStageDisciplineType(discipline.discipline_type)
      && (
        !discipline.fixed_division
        && !draft.division
        || (!discipline.fixed_power_factor && !draft.power_factor)
      )
    ) {
      setMessage("Wybierz dywizję i Power Factor dla dopisywanej konkurencji ❌");
      return;
    }

    try {
      setAddingDisciplineId(participant.id);
      setMessage("");

      const response = await authFetch(
        apiUrl(`/organizer/competitions/${competitionId}/participants/${participant.id}/disciplines`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            discipline_id: discipline.id,
            ammo_type: draft.ammo_type,
            division: draft.division,
            power_factor: draft.power_factor,
          }),
        }
      );
      const data = await readJsonResponse(response);

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się dopisać konkurencji ❌");
        return;
      }

      setParticipants((currentParticipants) =>
        currentParticipants.map((currentParticipant) =>
          currentParticipant.id === participant.id
            ? data.participant
            : currentParticipant
        )
      );
      setDisciplineDrafts((current) => {
        const updated = {
          ...current,
        };

        delete updated[participant.id];

        return updated;
      });
      setMessage(`Dopisano konkurencję. Dopłata: ${data.fee_difference || "0.00"} zł ✅`);
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setAddingDisciplineId(null);
    }
  }

  async function updateParticipant(
    participant: PaymentParticipant,
    changes: Partial<Pick<PaymentParticipant, "checked_in" | "paid">>
  ) {
    const token = getAccessToken();

    if (!token) {
      router.push("/login");
      return;
    }

    try {
      setSavingId(participant.id);
      setMessage("");

      const response = await authFetch(
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

  function renderAddDisciplineControls(participant: PaymentParticipant, compact = false) {
    const available = availableDisciplines(participant);

    if (competition?.status !== "started" || available.length === 0) {
      return null;
    }

    const draft = getDisciplineDraft(participant);
    const selectedDiscipline = competition.disciplines.find(
      (discipline) => discipline.id === Number(draft.discipline_id)
    );
    const dynamicDiscipline = selectedDiscipline
      ? isDynamicStageDisciplineType(selectedDiscipline.discipline_type)
      : false;
    const divisionOptions = selectedDiscipline
      ? getDynamicDisciplineDivisions(selectedDiscipline.discipline_type)
      : [];
    const estimatedFee = estimateAddedDisciplineFee(selectedDiscipline, draft.ammo_type);
    const isAdding = addingDisciplineId === participant.id;

    return (
      <div className={`rounded-lg border border-zinc-700 bg-zinc-950/60 p-2 ${compact ? "space-y-2" : "space-y-2"}`}>
        <select
          value={draft.discipline_id}
          onChange={(event) => updateDisciplineDraft(participant, {
            discipline_id: event.target.value,
          })}
          disabled={isAdding}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white focus:outline-none focus:border-green-600 disabled:opacity-60"
        >
          {available.map((discipline) => (
            <option key={discipline.id} value={discipline.id}>
              {discipline.name}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 rounded-md border border-zinc-700 px-2 py-2 text-xs font-bold text-gray-200">
            <input
              type="radio"
              name={`add-ammo-${participant.id}`}
              checked={draft.ammo_type === "own"}
              onChange={() => updateDisciplineDraft(participant, {
                ammo_type: "own",
              })}
              disabled={isAdding}
            />
            Własna
          </label>

          <label className="flex items-center gap-2 rounded-md border border-zinc-700 px-2 py-2 text-xs font-bold text-gray-200">
            <input
              type="radio"
              name={`add-ammo-${participant.id}`}
              checked={draft.ammo_type === "club"}
              onChange={() => updateDisciplineDraft(participant, {
                ammo_type: "club",
              })}
              disabled={isAdding}
            />
            Klubowa
          </label>
        </div>

        {dynamicDiscipline && selectedDiscipline && (
          <div className="grid gap-2">
            {selectedDiscipline.fixed_division ? (
              <p className="rounded-md border border-zinc-700 px-2 py-2 text-xs font-bold text-gray-300">
                Dywizja: {selectedDiscipline.fixed_division}
              </p>
            ) : (
              <select
                value={draft.division}
                onChange={(event) => updateDisciplineDraft(participant, {
                  division: event.target.value,
                })}
                disabled={isAdding}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white focus:outline-none focus:border-green-600 disabled:opacity-60"
              >
                <option value="">Dywizja</option>
                {divisionOptions.map((division) => (
                  <option key={division} value={division}>
                    {division}
                  </option>
                ))}
              </select>
            )}

            {selectedDiscipline.fixed_power_factor ? (
              <p className="rounded-md border border-zinc-700 px-2 py-2 text-xs font-bold text-gray-300">
                PF: {selectedDiscipline.fixed_power_factor === "major" ? "Major" : "Minor"}
              </p>
            ) : (
              <select
                value={draft.power_factor}
                onChange={(event) => updateDisciplineDraft(participant, {
                  power_factor: event.target.value as AddDisciplineDraft["power_factor"],
                })}
                disabled={isAdding}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white focus:outline-none focus:border-green-600 disabled:opacity-60"
              >
                <option value="">Power Factor</option>
                {POWER_FACTOR_OPTIONS.map((powerFactor) => (
                  <option key={powerFactor} value={powerFactor}>
                    {powerFactor === "major" ? "Major" : "Minor"}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {estimatedFee > 0 && (
          <p className="text-xs font-semibold text-red-200">
            Szacowana dopłata: {formatFee(estimatedFee)}
          </p>
        )}

        <button
          type="button"
          onClick={() => addParticipantDiscipline(participant)}
          disabled={isAdding}
          className="w-full rounded-md bg-blue-700 px-3 py-2 text-sm font-bold text-white transition hover:bg-blue-600 disabled:opacity-50"
        >
          {isAdding ? "Dopisywanie..." : "Dopisz konkurencję"}
        </button>
      </div>
    );
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="w-full">
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

                <div className="mt-4 flex flex-col gap-3">
                  <input
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder="Filtruj zawodnika"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-base text-white placeholder:text-gray-500 focus:outline-none focus:border-green-700"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      setMessage("");
                      setScannerOpen(true);
                    }}
                    className="group flex items-center gap-3 text-left"
                  >
                    <NextImage
                      src="/icons/skaner.jpeg"
                      alt=""
                      width={1254}
                      height={1254}
                      sizes="64px"
                      className="h-16 w-16 shrink-0 rounded-xl object-cover shadow-[0_8px_24px_rgba(34,197,94,0.2)] transition group-hover:scale-[1.03]"
                    />

                    <span>
                      <span className="block font-black text-white transition group-hover:text-green-300">
                        Skanuj QR licencji zawodnika
                      </span>
                      <span className="mt-1 block text-sm leading-5 text-gray-400">
                        Zeskanuj kod, aby szybko odnaleźć zawodnika na liście.
                      </span>
                    </span>
                  </button>
                </div>
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

                        {renderAddDisciplineControls(participant, true)}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="hidden md:block bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
              <div className="min-w-[1380px]">
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

                    <div className="flex items-center gap-3">
                      <input
                        value={filter}
                        onChange={(event) => setFilter(event.target.value)}
                        placeholder="Filtruj po nazwisku, licencji, klubie lub konkurencji"
                        className="w-[420px] bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-green-700"
                      />

                      <button
                        type="button"
                        onClick={() => {
                          setMessage("");
                          setScannerOpen(true);
                        }}
                        className="group flex items-center gap-2 text-left"
                      >
                        <NextImage
                          src="/icons/skaner.jpeg"
                          alt=""
                          width={1254}
                          height={1254}
                          sizes="56px"
                          className="h-14 w-14 shrink-0 rounded-xl object-cover shadow-[0_8px_24px_rgba(34,197,94,0.2)] transition group-hover:scale-[1.03]"
                        />

                        <span className="max-w-44">
                          <span className="block text-sm font-black text-white transition group-hover:text-green-300">
                            Skanuj QR licencji
                          </span>
                          <span className="mt-0.5 block text-xs leading-4 text-gray-400">
                            Odszukaj zawodnika na liście.
                          </span>
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-[1.5fr_1fr_1.1fr_1.4fr_0.8fr_0.9fr_0.9fr_2.1fr] gap-3 px-3 py-2 text-xs font-bold text-gray-400 border-b border-zinc-800 bg-zinc-950/40">
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
                        className="grid grid-cols-[1.5fr_1fr_1.1fr_1.4fr_0.8fr_0.9fr_0.9fr_2.1fr] gap-3 px-3 py-2 items-center text-sm border-b border-zinc-800 last:border-b-0 hover:bg-zinc-800/40"
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

                        <div className="flex flex-col gap-2">
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

                          {renderAddDisciplineControls(participant)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        )}

        {scannerOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 px-3 py-4 sm:px-6">
            <div className="mx-auto w-full max-w-5xl rounded-xl border border-zinc-800 bg-black p-3 shadow-2xl sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white sm:text-2xl">
                    Skan QR licencji zawodnika
                  </h2>
                  <p className="mt-1 text-sm text-gray-400">
                    Zeskanuj kod, aby odnaleźć zawodnika na liście obecności i opłat.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setScannerOpen(false)}
                  className="shrink-0 rounded-lg bg-zinc-800 px-4 py-2 font-semibold text-white transition hover:bg-zinc-700"
                >
                  Zamknij
                </button>
              </div>

              <QrCodeScanner
                autoStart
                onScan={handleParticipantQrScan}
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
