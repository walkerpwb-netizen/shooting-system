"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { apiUrl } from "@/lib/api";
import { getAccessToken, isOrganizer } from "@/lib/auth";

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
  missing_judge_disciplines: string[];
  disciplines: {
    id: number;
    name: string;
    description: string;
    scoring_type: string;
    discipline_type: string;
    discipline_type_label?: string;
    shots_count: number;
    trap_variant?: string;
    trap_series_count?: number;
    clay_variant?: string;
    clay_series_count?: number;
    squad_group_statuses?: Record<string, "not-started" | "in-progress" | "completed">;
    ammo_type: string;
    ammo_price: string;
    clay_price?: string;
    entry_fee: string;
  }[];
  participants: {
    id: number;
    display_name: string;
    total_fee: string;
    checked_in: boolean;
    paid: boolean;
    disciplines: ParticipantDisciplineAssignment[];
  }[];
  judges: {
    id: number;
    user_email: string;
    display_name: string;
    judge_license_number: string;
    is_head_judge: boolean;
  }[];
  judge_assignments: {
    id: number;
    judge_email: string;
    discipline_id: number | null;
    discipline_name: string;
    display_name: string;
    judge_license_number: string;
    is_head_judge: boolean;
  }[];
};

type ParticipantDisciplineAssignment = {
  participant_discipline_id: number;
  id: number;
  name: string;
  ammo_type: string;
  squad_group_number: number;
  squad_position: number;
};

type JudgeSearchResult = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  club: string;
  phone_number: string;
  judge_license_number: string;
  judge_license_valid_until: string;
  judge_license_class: number | null;
  judge_license_class_label: string;
  can_be_head_judge: boolean;
};

type ManualParticipantForm = {
  first_name: string;
  last_name: string;
  birth_date: string;
  license_number: string;
  club: string;
};

type ManualDisciplineSelection = {
  discipline_id: number;
  ammo_type: "" | "own" | "club";
};

type ManualFormErrors = Partial<Record<keyof ManualParticipantForm | "disciplines" | "ammo_type", string>>;

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

function canViewCompetitionResults(status: string) {
  return status === "started" || status === "completed";
}

function isTrapGroupLocked(status: string | undefined) {
  return status === "in-progress" || status === "completed";
}

function trapGroupStatusLabel(status: string | undefined) {
  if (status === "completed") {
    return "Zakończona";
  }

  if (status === "in-progress") {
    return "Rozpoczęta";
  }

  return "";
}

function isValidManualBirthDate(value: string) {
  const rawValue = value.trim();
  const isoMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const polishMatch = rawValue.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);

  const year = isoMatch
    ? Number(isoMatch[1])
    : polishMatch
      ? Number(polishMatch[3])
      : 0;
  const month = isoMatch
    ? Number(isoMatch[2])
    : polishMatch
      ? Number(polishMatch[2])
      : 0;
  const day = isoMatch
    ? Number(isoMatch[3])
    : polishMatch
      ? Number(polishMatch[1])
      : 0;

  if (!year || !month || !day || year < 1900) {
    return false;
  }

  const parsedDate = new Date(year, month - 1, day);
  const today = new Date();

  return (
    parsedDate.getFullYear() === year &&
    parsedDate.getMonth() === month - 1 &&
    parsedDate.getDate() === day &&
    parsedDate <= today
  );
}

export default function OrganizerCompetitionPage() {
  const router = useRouter();
  const params = useParams<{ competitionId: string }>();
  const competitionId = Number(params.competitionId);

  const [competition, setCompetition] = useState<Competition | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [judgeLicenseSearch, setJudgeLicenseSearch] = useState("");
  const [judgeSearchLoading, setJudgeSearchLoading] = useState(false);
  const [judgeSearchResults, setJudgeSearchResults] = useState<JudgeSearchResult[]>([]);
  const [selectedJudge, setSelectedJudge] = useState<JudgeSearchResult | null>(null);
  const [judgeDiscipline, setJudgeDiscipline] = useState("");
  const [headJudge, setHeadJudge] = useState(false);
  const [showManualParticipantForm, setShowManualParticipantForm] = useState(false);
  const [manualParticipant, setManualParticipant] = useState<ManualParticipantForm>({
    first_name: "",
    last_name: "",
    birth_date: "",
    license_number: "",
    club: "",
  });
  const [manualDisciplines, setManualDisciplines] = useState<ManualDisciplineSelection[]>([]);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualFormMessage, setManualFormMessage] = useState("");
  const [manualFormErrors, setManualFormErrors] = useState<ManualFormErrors>({});
  const [groupUpdatingId, setGroupUpdatingId] = useState<number | null>(null);
  const [randomizingDisciplineId, setRandomizingDisciplineId] = useState<number | null>(null);

  const fetchOrganizerCompetition = useCallback(async () => {
    const token = getAccessToken();

    try {
      const response = await fetch(
        apiUrl(`/organizer/competitions/${competitionId}`),
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

      setCompetition(data);
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setLoading(false);
    }
  }, [competitionId]);

  useEffect(() => {
    if (!isOrganizer()) {
      router.push("/");
      return;
    }

    const loadTimer = window.setTimeout(() => {
      void fetchOrganizerCompetition();
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [fetchOrganizerCompetition, router]);

  const headJudgeAssigned = useMemo(() => {
    if (!competition) {
      return false;
    }

    return competition.judge_assignments.some(
      (assignment) => assignment.is_head_judge
    );
  }, [competition]);


  const participantsTotalFee = useMemo(() => {
    if (!competition) {
      return 0;
    }

    return competition.participants.reduce(
      (sum, participant) => sum + parseFee(participant.total_fee),
      0
    );
  }, [competition]);

  const unpaidParticipantsTotalFee = useMemo(() => {
    if (!competition) {
      return 0;
    }

    return competition.participants.reduce(
      (sum, participant) =>
        participant.checked_in && participant.paid
          ? sum
          : sum + parseFee(participant.total_fee),
      0
    );
  }, [competition]);

  const manualTotalFee = useMemo(() => {
    if (!competition || manualDisciplines.length === 0) {
      return 0;
    }

    const competitionFee = parseFee(competition.entry_fee);
    let total = competitionFee;

    if (competitionFee === 0) {
      total += manualDisciplines.reduce((sum, selectedDiscipline) => {
        const discipline = competition.disciplines.find(
          (item) => item.id === selectedDiscipline.discipline_id
        );

        return sum + parseFee(discipline?.entry_fee || "");
      }, 0);
    }

    total += manualDisciplines.reduce((sum, selectedDiscipline) => {
      if (selectedDiscipline.ammo_type !== "club") {
        return sum;
      }

      const discipline = competition.disciplines.find(
        (item) => item.id === selectedDiscipline.discipline_id
      );

      if (!discipline) {
        return sum;
      }

      const clayFee = parseFee(discipline.clay_price || "") * ((discipline.clay_series_count || discipline.trap_series_count || 0) * 25);

      return sum
        + parseFee(discipline.ammo_price) * (discipline.shots_count || 0)
        + clayFee;
    }, 0);

    return total;
  }, [competition, manualDisciplines]);

  const squadDisciplines = useMemo(() => {
    if (!competition) {
      return [];
    }

    return competition.disciplines
      .filter((discipline) =>
        ["trap", "skeet"].includes(discipline.discipline_type)
        && Boolean(discipline.clay_variant || discipline.trap_variant)
        && Number(discipline.clay_series_count || discipline.trap_series_count || 0) > 0
      )
      .map((discipline) => {
        const assignments = competition.participants
          .filter((participant) => participant.checked_in && participant.paid)
          .map((participant) => {
            const assignment = participant.disciplines.find(
              (item) => item.id === discipline.id
            );

            return assignment
              ? {
                  participant,
                  assignment,
                }
              : null;
          })
          .filter((item): item is {
            participant: Competition["participants"][number];
            assignment: ParticipantDisciplineAssignment;
          } => item !== null);
        const maxGroupNumber = Math.max(
          1,
          ...assignments.map((item) => item.assignment.squad_group_number || 1)
        );
        const groupNumbers = Array.from(
          { length: maxGroupNumber + 1 },
          (_item, index) => index + 1
        );

        return {
          discipline,
          assignments,
          groupNumbers,
          groupStatuses: discipline.squad_group_statuses || {},
        };
      });
  }, [competition]);

  function manualInputClass(field: keyof ManualParticipantForm) {
    const hasError = Boolean(manualFormErrors[field]);

    return `w-full border rounded-xl px-3 py-3 ${
      hasError
        ? "border-red-300 bg-red-50 text-red-950 ring-1 ring-red-200"
        : "border-gray-300"
    }`;
  }

  function manualErrorText(field: keyof ManualParticipantForm) {
    if (!manualFormErrors[field]) {
      return null;
    }

    return (
      <p className="text-sm font-semibold text-red-700">
        {manualFormErrors[field]}
      </p>
    );
  }

  function updateManualParticipantField(
    field: keyof ManualParticipantForm,
    value: string
  ) {
    setManualParticipant((current) => ({
      ...current,
      [field]: value,
    }));
    setManualFormErrors((current) => {
      const updatedErrors = {
        ...current,
      };

      delete updatedErrors[field];

      return updatedErrors;
    });
  }

  function toggleManualDiscipline(disciplineId: number, checked: boolean) {
    setManualFormErrors((current) => {
      const updatedErrors = {
        ...current,
      };

      delete updatedErrors.disciplines;
      delete updatedErrors.ammo_type;

      return updatedErrors;
    });
    setManualDisciplines((current) => {
      if (!checked) {
        return current.filter((item) => item.discipline_id !== disciplineId);
      }

      if (current.some((item) => item.discipline_id === disciplineId)) {
        return current;
      }

      return [
        ...current,
        {
          discipline_id: disciplineId,
          ammo_type: "",
        },
      ];
    });
  }

  function updateManualAmmoType(
    disciplineId: number,
    ammoType: "own" | "club"
  ) {
    setManualFormErrors((current) => {
      const updatedErrors = {
        ...current,
      };

      delete updatedErrors.ammo_type;

      return updatedErrors;
    });
    setManualDisciplines((current) =>
      current.map((item) =>
        item.discipline_id === disciplineId
          ? {
              ...item,
              ammo_type: ammoType,
            }
          : item
      )
    );
  }

  function resetManualParticipantForm() {
    setManualParticipant({
      first_name: "",
      last_name: "",
      birth_date: "",
      license_number: "",
      club: "",
    });
    setManualDisciplines([]);
    setManualFormMessage("");
    setManualFormErrors({});
    setShowManualParticipantForm(false);
  }

  async function addManualParticipant() {
    if (!competition) {
      return;
    }

    const errors: ManualFormErrors = {};

    if (!manualParticipant.last_name.trim()) {
      errors.last_name = "Uzupełnij nazwisko.";
    }

    if (!manualParticipant.first_name.trim()) {
      errors.first_name = "Uzupełnij imię.";
    }

    if (!manualParticipant.birth_date.trim()) {
      errors.birth_date = "Uzupełnij datę urodzenia.";
    } else if (!isValidManualBirthDate(manualParticipant.birth_date)) {
      errors.birth_date = "Wpisz datę w formacie RRRR-MM-DD, np. 1987-03-18, albo DD.MM.RRRR.";
    }

    if (!manualParticipant.license_number.trim()) {
      errors.license_number = "Wpisz numer licencji albo Brak.";
    }

    if (!manualParticipant.club.trim()) {
      errors.club = "Wpisz klub albo Brak.";
    }

    if (manualDisciplines.length === 0) {
      errors.disciplines = "Wybierz minimum jedną konkurencję.";
    }

    if (manualDisciplines.some((discipline) => !discipline.ammo_type)) {
      errors.ammo_type = "Wybierz typ amunicji przy każdej wybranej konkurencji.";
    }

    if (Object.keys(errors).length > 0) {
      setMessage("");
      setManualFormErrors(errors);
      setManualFormMessage("Popraw podświetlone pola formularza.");
      return;
    }

    setManualFormErrors({});
    setManualFormMessage("");

    const token = getAccessToken();

    try {
      setManualSaving(true);
      setMessage("");

      const response = await fetch(
        apiUrl(`/organizer/competitions/${competition.id}/manual-participants`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...manualParticipant,
            disciplines: manualDisciplines,
          }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setManualFormMessage(data.detail || "Nie udało się dodać zawodnika.");
        return;
      }

      setMessage("Zawodnik dodany, obecność i opłata potwierdzone ✅");
      resetManualParticipantForm();
      fetchOrganizerCompetition();
    } catch (error) {
      console.error(error);
      setManualFormMessage("Błąd połączenia z serwerem.");
    } finally {
      setManualSaving(false);
    }
  }

  function judgeDisplayName(judge: JudgeSearchResult) {
    return [judge.last_name, judge.first_name].filter(Boolean).join(" ")
      || judge.email;
  }

  async function searchJudge() {
    const searchQuery = judgeLicenseSearch.trim();

    if (!searchQuery) {
      setMessage("Wpisz numer licencji albo imię i nazwisko sędziego ❌");
      return;
    }

    const token = getAccessToken();

    try {
      setJudgeSearchLoading(true);
      setJudgeSearchResults([]);
      setSelectedJudge(null);
      setHeadJudge(false);
      setMessage("");

      const response = await fetch(
        apiUrl(`/organizer/judges/search?query=${encodeURIComponent(searchQuery)}`),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie znaleziono sędziego ❌");
        return;
      }

      const results: JudgeSearchResult[] = Array.isArray(data) ? data : [];

      if (!results.length) {
        setMessage("Nie znaleziono sędziego o podanych danych ❌");
        return;
      }

      setJudgeSearchResults(results);

      if (results.length === 1) {
        setSelectedJudge(results[0]);
      }

      if (results.length === 1 && !results[0].can_be_head_judge) {
        setHeadJudge(false);
      }
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setJudgeSearchLoading(false);
    }
  }

  async function inviteJudge() {
    if (!competition) {
      return;
    }

    if (!selectedJudge) {
      setMessage("Najpierw wyszukaj i wybierz sędziego ❌");
      return;
    }

    if (headJudge && headJudgeAssigned) {
      setMessage("Sędzia główny jest już przypisany do tych zawodów ❌");
      return;
    }

    if (headJudge && !selectedJudge.can_be_head_judge) {
      setMessage("Ten sędzia nie może pełnić funkcji sędziego głównego zawodów ❌");
      return;
    }

    if (!headJudge && !judgeDiscipline) {
      setMessage("Wybierz konkurencję albo zaznacz sędziego głównego ❌");
      return;
    }

    const token = getAccessToken();

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
            judge_license_number: selectedJudge.judge_license_number,
            discipline_ids: headJudge ? [] : [Number(judgeDiscipline)],
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
      setJudgeLicenseSearch("");
      setSelectedJudge(null);
      setJudgeDiscipline("");
      setHeadJudge(false);
      fetchOrganizerCompetition();
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

    const token = getAccessToken();

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
      fetchOrganizerCompetition();
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  async function updateParticipantGroup(
    participantDisciplineId: number,
    groupNumber: number,
    squadPosition = 0
  ) {
    if (!competition) {
      return;
    }

    const token = getAccessToken();

    try {
      setGroupUpdatingId(participantDisciplineId);
      setMessage("");

      const response = await fetch(
        apiUrl(`/organizer/competitions/${competition.id}/squad-groups/${participantDisciplineId}`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            group_number: groupNumber,
            squad_position: squadPosition,
          }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się zmienić grupy zawodnika ❌");
        return;
      }

      setMessage("Grupa zawodnika zaktualizowana ✅");
      fetchOrganizerCompetition();
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setGroupUpdatingId(null);
    }
  }

  async function randomizeSquadGroups(disciplineId: number) {
    if (!competition) {
      return;
    }

    const confirmed = window.confirm(
      "Czy wylosować grupy dla tej konkurencji? Obecny układ grup zostanie zastąpiony."
    );

    if (!confirmed) {
      return;
    }

    const token = getAccessToken();

    try {
      setRandomizingDisciplineId(disciplineId);
      setMessage("");

      const response = await fetch(
        apiUrl(`/organizer/competitions/${competition.id}/disciplines/${disciplineId}/squad-groups/randomize`),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się wylosować grup ❌");
        return;
      }

      setMessage("Grupy zostały wylosowane ✅");
      fetchOrganizerCompetition();
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setRandomizingDisciplineId(null);
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

    const token = getAccessToken();

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
      fetchOrganizerCompetition();
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
                    <div className="relative h-20 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden">
                      <Image
                        src={competition.organizer_logo}
                        alt="Logo organizatora"
                        fill
                        sizes="160px"
                        className="object-contain p-2"
                        unoptimized
                      />
                    </div>
                  )}

                  {competition.sponsor_logo && (
                    <div className="relative h-20 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden">
                      <Image
                        src={competition.sponsor_logo}
                        alt="Logo sponsora"
                        fill
                        sizes="160px"
                        className="object-contain p-2"
                        unoptimized
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
                        Rodzaj: {discipline.discipline_type_label || "nie podano"}
                      </p>
                      <p className="text-gray-700 text-sm">
                        Punktacja: {discipline.scoring_type}, strzały: {discipline.shots_count}
                      </p>
                      <p className="text-gray-700 text-sm">
                        Amunicja: {discipline.ammo_type || "brak"}, cena: {discipline.ammo_price || "0"} zł/szt.
                      </p>
                      {(discipline.clay_series_count || discipline.trap_series_count) ? (
                        <p className="text-gray-700 text-sm">
                          Rzutki: {(discipline.clay_series_count || discipline.trap_series_count || 0) * 25}, cena: {discipline.clay_price || "0"} zł/szt.
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <div className="bg-white rounded-3xl p-6 text-black shadow-xl">
                <h2 className="text-2xl font-bold mb-4">
                  Skład Sędziowski
                </h2>

                {competition.missing_judge_disciplines.length > 0 && (
                  <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-red-900">
                    <p className="font-black">Nie można rozpocząć zawodów.</p>
                    <p className="text-sm font-semibold">
                      Przypisz sędziego do każdej konkurencji. Brak sędziego dla: {competition.missing_judge_disciplines.join(", ")}.
                      Sędzia główny nie jest wymagany.
                    </p>
                  </div>
                )}

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
                            {assignment.judge_license_number && (
                              <>Licencja: {assignment.judge_license_number} • </>
                            )}
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

              <div className="bg-white rounded-3xl p-6 text-black shadow-xl space-y-4">
                <h2 className="text-2xl font-bold">
                  Przypisz sędziego do funkcji
                </h2>

                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <input
                    type="text"
                    value={judgeLicenseSearch}
                    onChange={(event) => {
                      setJudgeLicenseSearch(event.target.value);
                      setJudgeSearchResults([]);
                      setSelectedJudge(null);
                      setHeadJudge(false);
                    }}
                    placeholder="Numer licencji albo imię i nazwisko"
                    className="w-full border border-gray-300 rounded-xl px-3 py-3"
                  />

                  <button
                    type="button"
                    onClick={searchJudge}
                    disabled={judgeSearchLoading || !judgeLicenseSearch.trim()}
                    className="bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl font-semibold transition"
                  >
                    {judgeSearchLoading ? "Szukam..." : "Szukaj"}
                  </button>
                </div>

                {judgeSearchResults.length > 1 && (
                  <div className="space-y-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                    <p className="text-sm font-semibold text-zinc-700">
                      Wybierz sędziego z listy:
                    </p>
                    {judgeSearchResults.map((judge) => (
                      <button
                        key={judge.id}
                        type="button"
                        onClick={() => {
                          setSelectedJudge(judge);
                          setHeadJudge(false);
                          setMessage("");
                        }}
                        className={`block w-full rounded-xl border px-4 py-3 text-left transition ${
                          selectedJudge?.id === judge.id
                            ? "border-green-700 bg-green-100"
                            : "border-zinc-200 bg-white hover:border-green-500"
                        }`}
                      >
                        <span className="block font-bold">{judgeDisplayName(judge)}</span>
                        <span className="block text-sm text-zinc-700">
                          Licencja: {judge.judge_license_number}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {selectedJudge && (
                  <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
                    <p className="font-bold text-green-950">
                      {judgeDisplayName(selectedJudge)}
                    </p>
                    <p className="text-sm text-green-900">
                      Licencja: {selectedJudge.judge_license_number}
                    </p>
                    <p className="text-sm text-green-900">
                      Klasa: {selectedJudge.judge_license_class_label}
                    </p>
                    {!selectedJudge.can_be_head_judge && (
                      <p className="mt-2 text-sm font-semibold text-red-700">
                        Ten sędzia może być przypisany do konkurencji, ale nie jako sędzia główny zawodów.
                      </p>
                    )}
                    {selectedJudge.judge_license_valid_until && (
                      <p className="text-sm text-green-900">
                        Ważna do: {selectedJudge.judge_license_valid_until}
                      </p>
                    )}
                    {selectedJudge.club && (
                      <p className="text-sm text-green-900">
                        Klub: {selectedJudge.club}
                      </p>
                    )}
                  </div>
                )}

                <select
                  value={judgeDiscipline}
                  onChange={(event) => setJudgeDiscipline(event.target.value)}
                  disabled={headJudge}
                  className="w-full border border-gray-300 rounded-xl px-3 py-3 disabled:bg-gray-100 disabled:text-gray-500"
                >
                  <option value="">Wybierz konkurencję</option>

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
                    onChange={(event) => {
                      setHeadJudge(event.target.checked);

                      if (event.target.checked) {
                        setJudgeDiscipline("");
                      }
                    }}
                    disabled={headJudgeAssigned || Boolean(selectedJudge && !selectedJudge.can_be_head_judge)}
                  />
                  Sędzia główny zawodów
                </label>

                {headJudgeAssigned && (
                  <p className="text-sm font-semibold text-yellow-700">
                    Sędzia główny jest już przypisany do tych zawodów.
                  </p>
                )}

                {selectedJudge && !selectedJudge.can_be_head_judge && (
                  <p className="text-sm font-semibold text-red-700">
                    Funkcja sędziego głównego jest dostępna tylko dla sędziów klasy 1 lub 2.
                  </p>
                )}

                <button
                  type="button"
                  onClick={inviteJudge}
                  disabled={!selectedJudge || (!headJudge && !judgeDiscipline) || (headJudge && !selectedJudge.can_be_head_judge)}
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

                  <span className={`px-4 py-2 rounded-xl font-bold ${
                    unpaidParticipantsTotalFee > 0
                      ? "bg-red-100 text-red-800"
                      : "bg-green-100 text-green-800"
                  }`}>
                    {unpaidParticipantsTotalFee > 0
                      ? "Do zapłaty"
                      : "Potwierdzone"}
                  </span>
                </div>

                <Link
                  href={`/organizer/${competition.id}/payments`}
                  className="block w-full bg-green-700 hover:bg-green-600 text-white text-center py-3 rounded-xl font-bold mb-4 transition"
                >
                  Otwórz listę obecności i opłat
                </Link>

                {canViewCompetitionResults(competition.status) && (
                  <Link
                    href={`/organizer/${competition.id}/results`}
                    className="block w-full bg-zinc-900 hover:bg-zinc-800 text-white text-center py-3 rounded-xl font-bold mb-4 transition"
                  >
                    Otwórz wyniki zawodów
                  </Link>
                )}

                {squadDisciplines.length > 0 && (
                  <div className="mb-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-4">
                      <h3 className="text-xl font-bold">
                        Grupy startowe konkurencji rzutkowych
                      </h3>
                      <p className="text-sm text-gray-500">
                        Zawodnicy są przydzielani po potwierdzeniu przybycia i opłaty. Trap korzysta z grup do 5 osób, a Skeet z grup do 6 osób.
                      </p>
                    </div>

                    <div className="space-y-4">
                      {squadDisciplines.map(({ discipline, assignments, groupNumbers, groupStatuses }) => {
                        const squadSize = discipline.discipline_type === "skeet" ? 6 : 5;
                        const activeGroupNumbers = Array.from(
                          new Set(
                            assignments.map((item) => item.assignment.squad_group_number || 1)
                          )
                        ).sort((firstGroup, secondGroup) => firstGroup - secondGroup);

                        return (
                          <div
                            key={discipline.id}
                            className="rounded-2xl border border-gray-200 bg-white p-4"
                          >
                          <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="font-bold text-gray-950">
                                {discipline.name}
                              </p>
                              <p className="text-sm text-gray-500">
                                {assignments.length} potwierdzonych zawodników w konkurencji
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => randomizeSquadGroups(discipline.id)}
                              disabled={
                                competition.status === "started" ||
                                competition.status === "completed" ||
                                randomizingDisciplineId === discipline.id ||
                                assignments.length === 0
                              }
                              className="bg-green-700 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl font-bold transition"
                            >
                              {randomizingDisciplineId === discipline.id
                                ? "Losuję..."
                                : "Losuj grupy"}
                            </button>
                          </div>

                          {competition.status === "started" && (
                            <p className="mb-3 rounded-xl border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm font-semibold text-yellow-800">
                              Losowanie grup jest zablokowane po rozpoczęciu zawodów.
                            </p>
                          )}

                          {assignments.length === 0 ? (
                            <p className="text-sm text-gray-500">
                              Brak potwierdzonych zawodników w tej konkurencji.
                            </p>
                          ) : (
                            <div className="space-y-3">
	                              {activeGroupNumbers.map((groupNumber) => {
	                                const groupAssignments = assignments
	                                  .filter((item) => (item.assignment.squad_group_number || 1) === groupNumber)
                                  .sort((firstItem, secondItem) =>
                                    (firstItem.assignment.squad_position || 99)
                                    - (secondItem.assignment.squad_position || 99)
	                                  );
                                  const groupStatus = groupStatuses[String(groupNumber)];
                                  const groupLocked = isTrapGroupLocked(groupStatus);
                                  const groupStatusLabel = trapGroupStatusLabel(groupStatus);

	                                return (
	                                  <div
	                                    key={groupNumber}
	                                    className={`rounded-xl border p-3 ${
                                        groupLocked
                                          ? "border-yellow-200 bg-yellow-50"
                                          : "border-gray-200 bg-gray-50"
                                      }`}
	                                  >
	                                    <div className="mb-2 flex items-center justify-between gap-3">
	                                      <div>
	                                        <p className="font-black text-gray-900">
	                                          Grupa {groupNumber}
	                                        </p>
                                        {groupStatusLabel && (
                                          <p className="text-xs font-bold uppercase text-yellow-800">
                                            {groupStatusLabel} - przenoszenie zablokowane
                                          </p>
                                        )}
                                      </div>
	                                      <p className={`text-sm font-bold ${
	                                        groupAssignments.length > squadSize
	                                          ? "text-red-700"
                                          : "text-gray-500"
                                      }`}>
                                        {groupAssignments.length}/{squadSize}
                                      </p>
                                    </div>

	                                    <div className="space-y-2">
	                                      {groupAssignments.map(({ participant, assignment }) => (
	                                        <div
                                          key={assignment.participant_discipline_id}
                                          className={`grid gap-2 rounded-lg bg-white px-3 py-2 sm:items-center ${
                                            discipline.discipline_type === "skeet"
                                              ? "sm:grid-cols-[1fr_130px_110px]"
                                              : "sm:grid-cols-[1fr_150px]"
                                          }`}
                                        >
                                          <Link
                                            href={`/profile/${participant.id}`}
                                            className="font-semibold text-gray-900 transition hover:text-green-700"
                                          >
                                            {assignment.squad_position ? `${assignment.squad_position}. ` : ""}{participant.display_name}
	                                          </Link>

	                                          <select
	                                            value={assignment.squad_group_number || 1}
	                                            onChange={(event) => updateParticipantGroup(
	                                              assignment.participant_discipline_id,
	                                              Number(event.target.value)
	                                            )}
	                                            disabled={
                                                groupLocked ||
                                                groupUpdatingId === assignment.participant_discipline_id
                                              }
	                                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
	                                          >
	                                            {groupNumbers.map((availableGroupNumber) => (
	                                              <option
	                                                key={availableGroupNumber}
	                                                value={availableGroupNumber}
                                                    disabled={
                                                      availableGroupNumber !== groupNumber &&
                                                      isTrapGroupLocked(groupStatuses[String(availableGroupNumber)])
                                                    }
	                                              >
	                                                Grupa {availableGroupNumber}
                                                    {isTrapGroupLocked(groupStatuses[String(availableGroupNumber)])
                                                      ? " (zablokowana)"
                                                      : ""}
	                                              </option>
	                                            ))}
	                                          </select>

                                          {discipline.discipline_type === "skeet" && (
                                            <select
                                              value={assignment.squad_position || 1}
                                              onChange={(event) => updateParticipantGroup(
                                                assignment.participant_discipline_id,
                                                assignment.squad_group_number || groupNumber,
                                                Number(event.target.value)
                                              )}
                                              disabled={groupLocked || groupUpdatingId === assignment.participant_discipline_id}
                                              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold disabled:bg-gray-100"
                                            >
                                              {Array.from({ length: 6 }, (_item, index) => index + 1).map((position) => (
                                                <option key={position} value={position}>Pozycja {position}</option>
                                              ))}
                                            </select>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {competition.status === "started" && (
                  <div className="mb-4">
                    <button
                      type="button"
                      onClick={() => setShowManualParticipantForm((current) => !current)}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-bold transition"
                    >
                      {showManualParticipantForm
                        ? "Zamknij formularz dodania zawodnika"
                        : "Dodaj zawodnika ręcznie"}
                    </button>

                    {showManualParticipantForm && (
                      <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-4">
                        {manualFormMessage && (
                          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 font-semibold">
                            {manualFormMessage}
                          </div>
                        )}

                        <div className="grid md:grid-cols-2 gap-3">
                          <label className="space-y-1">
                            <span className="text-sm font-semibold text-gray-700">
                              Nazwisko
                            </span>
                            <input
                              value={manualParticipant.last_name}
                              onChange={(event) => updateManualParticipantField("last_name", event.target.value)}
                              placeholder="Nazwisko"
                              className={manualInputClass("last_name")}
                            />
                            {manualErrorText("last_name")}
                          </label>

                          <label className="space-y-1">
                            <span className="text-sm font-semibold text-gray-700">
                              Imię
                            </span>
                            <input
                              value={manualParticipant.first_name}
                              onChange={(event) => updateManualParticipantField("first_name", event.target.value)}
                              placeholder="Imię"
                              className={manualInputClass("first_name")}
                            />
                            {manualErrorText("first_name")}
                          </label>

                          <label className="space-y-1">
                            <span className="text-sm font-semibold text-gray-700">
                              Data urodzenia
                            </span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={manualParticipant.birth_date}
                              onChange={(event) => updateManualParticipantField("birth_date", event.target.value)}
                              placeholder="Podaj datę urodzenia"
                              className={manualInputClass("birth_date")}
                            />
                            <p className={`text-sm ${
                              manualFormErrors.birth_date
                                ? "font-semibold text-red-700"
                                : "text-gray-500"
                            }`}>
                              Format: RRRR-MM-DD, np. 1987-03-18, albo DD.MM.RRRR.
                            </p>
                          </label>

                          <label className="space-y-1">
                            <span className="text-sm font-semibold text-gray-700">
                              Licencja
                            </span>
                            <input
                              value={manualParticipant.license_number}
                              onChange={(event) => updateManualParticipantField("license_number", event.target.value)}
                              placeholder="Nr licencji albo Brak"
                              className={manualInputClass("license_number")}
                            />
                            {manualErrorText("license_number")}
                          </label>

                          <label className="space-y-1 md:col-span-2">
                            <span className="text-sm font-semibold text-gray-700">
                              Klub
                            </span>
                            <input
                              value={manualParticipant.club}
                              onChange={(event) => updateManualParticipantField("club", event.target.value)}
                              placeholder="Klub albo Brak"
                              className={manualInputClass("club")}
                            />
                            {manualErrorText("club")}
                          </label>
                        </div>

                        <div className="space-y-3">
                          <p className="font-bold">
                            Konkurencje i amunicja
                          </p>
                          {(manualFormErrors.disciplines || manualFormErrors.ammo_type) && (
                            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                              {manualFormErrors.disciplines || manualFormErrors.ammo_type}
                            </div>
                          )}

                          {competition.disciplines.map((discipline) => {
                            const selectedDiscipline = manualDisciplines.find(
                              (item) => item.discipline_id === discipline.id
                            );
                            const disciplineHasError =
                              Boolean(manualFormErrors.disciplines) ||
                              Boolean(manualFormErrors.ammo_type && selectedDiscipline && !selectedDiscipline.ammo_type);

                            return (
                              <div
                                key={discipline.id}
                                className={`rounded-xl border p-3 ${
                                  disciplineHasError
                                    ? "border-red-300 bg-red-50 ring-1 ring-red-100"
                                    : "border-gray-200 bg-white"
                                }`}
                              >
                                <label className="flex items-center gap-2 font-bold">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(selectedDiscipline)}
                                    onChange={(event) => toggleManualDiscipline(discipline.id, event.target.checked)}
                                  />
                                  {discipline.name}
                                </label>

                                {selectedDiscipline && (
                                  <div className="grid sm:grid-cols-2 gap-2 mt-3 text-sm">
                                    <label className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                                      manualFormErrors.ammo_type && !selectedDiscipline.ammo_type
                                        ? "border-red-300 bg-white"
                                        : "border-gray-200"
                                    }`}>
                                      <input
                                        type="radio"
                                        name={`manual-ammo-${discipline.id}`}
                                        checked={selectedDiscipline.ammo_type === "own"}
                                        onChange={() => updateManualAmmoType(discipline.id, "own")}
                                      />
                                      Własna amunicja
                                    </label>

                                    <label className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                                      manualFormErrors.ammo_type && !selectedDiscipline.ammo_type
                                        ? "border-red-300 bg-white"
                                        : "border-gray-200"
                                    }`}>
                                      <input
                                        type="radio"
                                        name={`manual-ammo-${discipline.id}`}
                                        checked={selectedDiscipline.ammo_type === "club"}
                                        onChange={() => updateManualAmmoType(discipline.id, "club")}
                                      />
                                      Klubowa amunicja
                                    </label>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center">
                          <p className="text-red-700 font-bold">
                            Suma do zapłaty
                          </p>
                          <p className="text-3xl font-black text-red-700">
                            {formatFee(manualTotalFee)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={addManualParticipant}
                          disabled={manualSaving}
                          className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-60 text-white py-3 rounded-xl font-bold transition"
                        >
                          {manualSaving
                            ? "Dodawanie..."
                            : "Dodaj jako przybył i opłacone"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {competition.participants.length === 0 ? (
                  <p className="text-gray-500">
                    Brak zapisanych zawodników.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {competition.participants.map((participant) => {
                      const isConfirmed = participant.checked_in && participant.paid;

                      return (
                        <div
                          key={participant.id}
                          className="bg-gray-100 rounded-xl px-3 py-2 grid grid-cols-[1fr_auto_auto] gap-3 items-center"
                        >
                          <Link
                            href={`/profile/${participant.id}`}
                            className="font-semibold text-gray-900 transition hover:text-green-700"
                          >
                            {participant.display_name}
                          </Link>

                          <p className={isConfirmed
                            ? "font-black text-green-700"
                            : "font-black text-red-700"}
                          >
                            {isConfirmed
                              ? "Potwierdzony"
                              : formatFee(parseFee(participant.total_fee))}
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
                      );
                    })}
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
