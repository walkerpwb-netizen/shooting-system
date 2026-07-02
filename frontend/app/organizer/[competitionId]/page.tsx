"use client";

import type { DragEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { apiUrl } from "@/lib/api";
import { getAccessToken, isOrganizer } from "@/lib/auth";
import {
  POWER_FACTOR_OPTIONS,
  getDynamicDisciplineDivisions,
  getClayTargetsCount,
  isClayDisciplineType,
  isDynamicStageDisciplineType,
} from "@/lib/disciplines";
import { getDirectionsHref, hasMapCoordinates } from "@/lib/maps";

type Competition = {
  id: number;
  name: string;
  date: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  entry_fee: string;
  organizer_full_name: string;
  organizer_logo: string;
  sponsors: string;
  sponsor_logo: string;
  participant_limit: number | null;
  requires_licensed_judge: boolean;
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
    fixed_power_factor?: string;
    fixed_division?: string;
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
  division: string;
  power_factor: string;
  squad_group_number: number;
  squad_position: number;
};

type SquadAssignmentItem = {
  participant: Competition["participants"][number];
  assignment: ParticipantDisciplineAssignment;
};

type SquadDraftItem = SquadAssignmentItem & {
  groupNumber: number;
  squadPosition: number;
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
  division: string;
  power_factor: "" | "minor" | "major";
};

type ManualFormErrors = Partial<Record<keyof ManualParticipantForm | "disciplines" | "ammo_type" | "division" | "power_factor", string>>;

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
const ALL_DISCIPLINES_VALUE = "all";

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

function claySquadPositionLabel(disciplineType: string, position: number) {
  if (disciplineType === "trap" && position === 6) {
    return "Pozycja 6 - oczekujący";
  }

  return `Pozycja ${position}`;
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
  const [randomizingDisciplineId, setRandomizingDisciplineId] = useState<number | null>(null);
  const [editingSquadDisciplineId, setEditingSquadDisciplineId] = useState<number | null>(null);
  const [squadDraft, setSquadDraft] = useState<SquadDraftItem[]>([]);
  const [draggingSquadAssignmentId, setDraggingSquadAssignmentId] = useState<number | null>(null);
  const [savingSquadLayout, setSavingSquadLayout] = useState(false);

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

      const clayFee = parseFee(discipline.clay_price || "") * getClayTargetsCount(discipline);

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
        isClayDisciplineType(discipline.discipline_type)
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
          .filter((item): item is SquadAssignmentItem => item !== null);

        return {
          discipline,
          assignments,
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
      delete updatedErrors.division;
      delete updatedErrors.power_factor;

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
          division: "",
          power_factor: "",
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

  function updateManualDynamicField(
    disciplineId: number,
    field: "division" | "power_factor",
    value: string
  ) {
    setManualFormErrors((current) => {
      const updatedErrors = {
        ...current,
      };

      delete updatedErrors.division;
      delete updatedErrors.power_factor;

      return updatedErrors;
    });
    setManualDisciplines((current) =>
      current.map((item) =>
        item.discipline_id === disciplineId
          ? {
              ...item,
              [field]: value,
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

    const missingDynamicFields = manualDisciplines.some((selectedDiscipline) => {
      const discipline = competition.disciplines.find((item) => item.id === selectedDiscipline.discipline_id);

      return Boolean(
        discipline
        && isDynamicStageDisciplineType(discipline.discipline_type)
        && (
          !selectedDiscipline.division
          && !discipline.fixed_division
          || (!discipline.fixed_power_factor && !selectedDiscipline.power_factor)
        )
      );
    });

    if (missingDynamicFields) {
      errors.division = "Wybierz dywizję i Power Factor przy każdej konkurencji IPSC/dynamicznej, która tego wymaga.";
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

    if (!competition) {
      setMessage("Nie udało się odczytać danych zawodów ❌");
      return;
    }

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
        apiUrl(`/organizer/judges/search?competition_id=${competition.id}&query=${encodeURIComponent(searchQuery)}`),
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

    const selectedDisciplineIds = headJudge
      ? []
      : judgeDiscipline === ALL_DISCIPLINES_VALUE
        ? competition.disciplines.map((discipline) => discipline.id)
        : [Number(judgeDiscipline)].filter((disciplineId) => Number.isFinite(disciplineId));
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
            judge_email: selectedJudge.email,
            discipline_ids: selectedDisciplineIds,
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

  function startSquadLayoutEditing(
    disciplineId: number,
    assignments: SquadAssignmentItem[]
  ) {
    setMessage("");
    setEditingSquadDisciplineId(disciplineId);
    setSquadDraft(assignments.map(({ participant, assignment }) => ({
      participant,
      assignment,
      groupNumber: assignment.squad_group_number || 1,
      squadPosition: assignment.squad_position || 1,
    })));
  }

  function cancelSquadLayoutEditing() {
    setEditingSquadDisciplineId(null);
    setSquadDraft([]);
    setDraggingSquadAssignmentId(null);
  }

  function moveSquadDraftAssignment(
    participantDisciplineId: number,
    targetGroupNumber: number,
    targetPosition: number
  ) {
    setSquadDraft((currentDraft) => {
      const source = currentDraft.find(
        (item) => item.assignment.participant_discipline_id === participantDisciplineId
      );

      if (!source) {
        return currentDraft;
      }

      const target = currentDraft.find(
        (item) =>
          item.groupNumber === targetGroupNumber
          && item.squadPosition === targetPosition
      );

      return currentDraft.map((item) => {
        if (item.assignment.participant_discipline_id === participantDisciplineId) {
          return {
            ...item,
            groupNumber: targetGroupNumber,
            squadPosition: targetPosition,
          };
        }

        if (target && item.assignment.participant_discipline_id === target.assignment.participant_discipline_id) {
          return {
            ...item,
            groupNumber: source.groupNumber,
            squadPosition: source.squadPosition,
          };
        }

        return item;
      });
    });
  }

  function handleSquadDragStart(
    event: DragEvent<HTMLElement>,
    participantDisciplineId: number
  ) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      "text/plain",
      String(participantDisciplineId)
    );
    setDraggingSquadAssignmentId(participantDisciplineId);
  }

  function handleSquadDrop(
    event: DragEvent<HTMLElement>,
    targetGroupNumber: number,
    targetPosition: number
  ) {
    event.preventDefault();
    const participantDisciplineId = Number(
      event.dataTransfer.getData("text/plain")
      || draggingSquadAssignmentId
      || 0
    );

    if (participantDisciplineId > 0) {
      moveSquadDraftAssignment(
        participantDisciplineId,
        targetGroupNumber,
        targetPosition
      );
    }

    setDraggingSquadAssignmentId(null);
  }

  async function saveSquadLayout(disciplineId: number) {
    if (!competition || editingSquadDisciplineId !== disciplineId) {
      return;
    }

    const token = getAccessToken();

    try {
      setSavingSquadLayout(true);
      setMessage("");

      const response = await fetch(
        apiUrl(`/organizer/competitions/${competition.id}/disciplines/${disciplineId}/squad-groups/layout`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            assignments: squadDraft.map((item) => ({
              participant_discipline_id: item.assignment.participant_discipline_id,
              group_number: item.groupNumber,
              squad_position: item.squadPosition,
            })),
          }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się zapisać układu grup ❌");
        return;
      }

      cancelSquadLayoutEditing();
      setMessage("Układ grup zapisany i uzupełniony ✅");
      await fetchOrganizerCompetition();
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setSavingSquadLayout(false);
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

  const hasDirections = competition
    ? hasMapCoordinates(competition.latitude, competition.longitude)
    : false;
  const directionsHref = hasDirections && competition
    ? getDirectionsHref(competition.latitude as number, competition.longitude as number)
    : "";

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
              {competition.date} •{" "}
              {hasDirections ? (
                <a
                  href={directionsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-green-500/70 underline-offset-4 transition hover:text-green-300"
                  title="Nawiguj do miejsca zawodów"
                >
                  {competition.location}
                </a>
              ) : (
                competition.location
              )}{" "}
              • {getCompetitionStatusLabel(competition.status)}
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
                {hasDirections ? (
                  <a
                    href={directionsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex text-left underline decoration-green-700/60 underline-offset-4 transition hover:text-green-700"
                    title="Nawiguj do miejsca zawodów"
                  >
                    📍 {competition.location}
                  </a>
                ) : (
                  <p>📍 {competition.location}</p>
                )}
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
                      {getClayTargetsCount(discipline) > 0 ? (
                        <p className="text-gray-700 text-sm">
                          Rzutki: {getClayTargetsCount(discipline)}, cena: {discipline.clay_price || "0"} zł/szt.
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section id="judges" className="scroll-mt-24 space-y-6">
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
                <p className="text-sm font-semibold text-zinc-600">
                  Sędziów możesz dodawać i zmieniać także po opublikowaniu zawodów.
                </p>

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
                    placeholder={competition.requires_licensed_judge
                      ? "Numer licencji albo imię i nazwisko sędziego"
                      : "Imię i nazwisko użytkownika"}
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
                          {judge.judge_license_number
                            ? `Licencja: ${judge.judge_license_number}`
                            : "Licencja PZSS niewymagana"}
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
                      {selectedJudge.judge_license_number
                        ? `Licencja: ${selectedJudge.judge_license_number}`
                        : "Licencja PZSS niewymagana"}
                    </p>
                    {competition.requires_licensed_judge && (
                      <p className="text-sm text-green-900">
                        Klasa: {selectedJudge.judge_license_class_label}
                      </p>
                    )}
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
                  <option value={ALL_DISCIPLINES_VALUE}>Wszystkie konkurencje</option>

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
                        Zawodnicy są przydzielani po potwierdzeniu przybycia i opłaty. Trap korzysta z grup 6-osobowych: 5 stanowisk strzelających i 1 pozycja oczekująca, a Skeet z grup do 6 osób.
                      </p>
                    </div>

                    <div className="space-y-4">
                      {squadDisciplines.map(({ discipline, assignments, groupStatuses }) => {
                        const squadSize = 6;
                        const isEditing = editingSquadDisciplineId === discipline.id;
                        const layoutItems: SquadDraftItem[] = isEditing
                          ? squadDraft
                          : assignments.map(({ participant, assignment }) => ({
                              participant,
                              assignment,
                              groupNumber: assignment.squad_group_number || 1,
                              squadPosition: assignment.squad_position || 1,
                            }));
                        const maxGroupNumber = Math.max(
                          1,
                          ...layoutItems.map((item) => item.groupNumber)
                        );
                        const activeGroupNumbers = isEditing
                          ? Array.from(
                              { length: maxGroupNumber + 1 },
                              (_item, index) => index + 1
                            )
                          : Array.from(
                              new Set(layoutItems.map((item) => item.groupNumber))
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

                              <div className="flex flex-wrap gap-2">
                                {isEditing ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => saveSquadLayout(discipline.id)}
                                      disabled={savingSquadLayout}
                                      className="rounded-xl bg-blue-700 px-4 py-2 font-bold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-400"
                                    >
                                      {savingSquadLayout ? "Zapisuję..." : "Zapisz"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelSquadLayoutEditing}
                                      disabled={savingSquadLayout}
                                      className="rounded-xl bg-gray-200 px-4 py-2 font-bold text-gray-800 transition hover:bg-gray-300 disabled:opacity-50"
                                    >
                                      Anuluj
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => startSquadLayoutEditing(
                                      discipline.id,
                                      assignments
                                    )}
                                    disabled={
                                      competition.status === "completed"
                                      || assignments.length === 0
                                      || editingSquadDisciplineId !== null
                                    }
                                    className="rounded-xl bg-blue-700 px-4 py-2 font-bold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-400"
                                  >
                                    Dostosuj grupy ręcznie
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => randomizeSquadGroups(discipline.id)}
                                  disabled={
                                    competition.status === "started" ||
                                    competition.status === "completed" ||
                                    randomizingDisciplineId === discipline.id ||
                                    assignments.length === 0 ||
                                    editingSquadDisciplineId !== null
                                  }
                                  className="rounded-xl bg-green-700 px-4 py-2 font-bold text-white transition hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-gray-400"
                                >
                                  {randomizingDisciplineId === discipline.id
                                    ? "Losuję..."
                                    : "Losuj grupy"}
                                </button>
                              </div>
                            </div>

                            {isEditing && (
                              <p className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900">
                                Przeciągaj zawodników między pozycjami. Upuszczenie na zajęte pole zamienia zawodników miejscami. Zmiany trafią do systemu dopiero po kliknięciu „Zapisz”.
                              </p>
                            )}

                          {competition.status === "started" && (
                            <p className="mb-3 rounded-xl border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm font-semibold text-yellow-800">
                              Losowanie grup jest zablokowane po rozpoczęciu zawodów. Grupy, które jeszcze nie wystartowały, nadal możesz dostosować ręcznie.
                            </p>
                          )}

                          {assignments.length === 0 ? (
                            <p className="text-sm text-gray-500">
                              Brak potwierdzonych zawodników w tej konkurencji.
                            </p>
                          ) : (
                            <div className="space-y-3">
                              {activeGroupNumbers.map((groupNumber) => {
                                const groupAssignments = layoutItems
                                  .filter((item) => item.groupNumber === groupNumber)
                                  .sort((firstItem, secondItem) =>
                                    firstItem.squadPosition - secondItem.squadPosition
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
                                      {(isEditing
                                        ? Array.from({ length: squadSize }, (_item, index) => index + 1)
                                        : groupAssignments.map((item) => item.squadPosition)
                                      ).map((position) => {
                                        const item = groupAssignments.find(
                                          (currentItem) => currentItem.squadPosition === position
                                        );
                                        const canDrop = isEditing && !groupLocked;

                                        return (
                                          <div
                                            key={position}
                                            onDragOver={(event) => {
                                              if (canDrop) {
                                                event.preventDefault();
                                                event.dataTransfer.dropEffect = "move";
                                              }
                                            }}
                                            onDrop={(event) => {
                                              if (canDrop) {
                                                handleSquadDrop(event, groupNumber, position);
                                              }
                                            }}
                                            className={`min-h-14 rounded-lg border-2 px-3 py-2 transition ${
                                              item
                                                ? "border-white bg-white"
                                                : canDrop
                                                  ? "border-dashed border-blue-300 bg-blue-50/60"
                                                  : "border-dashed border-gray-200 bg-white/60"
                                            }`}
                                          >
                                            {item ? (
                                              <div
                                                draggable={canDrop}
                                                onDragStart={(event) => {
                                                  if (canDrop) {
                                                    handleSquadDragStart(
                                                      event,
                                                      item.assignment.participant_discipline_id
                                                    );
                                                  }
                                                }}
                                                onDragEnd={() => setDraggingSquadAssignmentId(null)}
                                                className={`flex items-center gap-3 ${
                                                  canDrop
                                                    ? "cursor-grab active:cursor-grabbing"
                                                    : ""
                                                } ${
                                                  draggingSquadAssignmentId === item.assignment.participant_discipline_id
                                                    ? "opacity-40"
                                                    : ""
                                                }`}
                                              >
                                                {isEditing && (
                                                  <span
                                                    aria-hidden="true"
                                                    className="text-xl font-black text-blue-500"
                                                  >
                                                    ⋮⋮
                                                  </span>
                                                )}
                                                <div className="min-w-0">
                                                  <p className="text-xs font-bold text-gray-500">
                                                    {claySquadPositionLabel(
                                                      discipline.discipline_type,
                                                      position
                                                    )}
                                                  </p>
                                                  {isEditing ? (
                                                    <p className="truncate font-semibold text-gray-900">
                                                      {item.participant.display_name}
                                                    </p>
                                                  ) : (
                                                    <Link
                                                      href={`/profile/${item.participant.id}`}
                                                      className="font-semibold text-gray-900 transition hover:text-green-700"
                                                    >
                                                      {item.participant.display_name}
                                                    </Link>
                                                  )}
                                                </div>
                                              </div>
                                            ) : (
                                              <p className="py-1 text-sm font-semibold text-gray-400">
                                                {claySquadPositionLabel(
                                                  discipline.discipline_type,
                                                  position
                                                )} — wolne
                                              </p>
                                            )}
                                          </div>
                                        );
                                      })}
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
                          {(manualFormErrors.disciplines || manualFormErrors.ammo_type || manualFormErrors.division) && (
                            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                              {manualFormErrors.disciplines || manualFormErrors.ammo_type || manualFormErrors.division}
                            </div>
                          )}

                          {competition.disciplines.map((discipline) => {
                            const selectedDiscipline = manualDisciplines.find(
                              (item) => item.discipline_id === discipline.id
                            );
                            const dynamicDiscipline = isDynamicStageDisciplineType(discipline.discipline_type);
                            const divisionOptions = getDynamicDisciplineDivisions(discipline.discipline_type);
                            const disciplineHasError =
                              Boolean(manualFormErrors.disciplines) ||
                              Boolean(manualFormErrors.ammo_type && selectedDiscipline && !selectedDiscipline.ammo_type) ||
                              Boolean(manualFormErrors.division && selectedDiscipline && dynamicDiscipline && ((!selectedDiscipline.division && !discipline.fixed_division) || (!selectedDiscipline.power_factor && !discipline.fixed_power_factor)));

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
                                  <div className="mt-3 space-y-3 text-sm">
                                    <div className="grid sm:grid-cols-2 gap-2">
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

                                    {dynamicDiscipline && (
                                      <div className="grid gap-2 sm:grid-cols-2">
                                        {discipline.fixed_division ? (
                                          <div className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700">
                                            <span className="mb-1 block">Dywizja</span>
                                            <span className="text-base font-black text-gray-950">
                                              Stała {discipline.fixed_division}
                                            </span>
                                          </div>
                                        ) : (
                                          <label className="block font-semibold text-gray-700">
                                            <span className="mb-1 block">Dywizja</span>
                                            <select
                                              value={selectedDiscipline.division}
                                              onChange={(event) => updateManualDynamicField(discipline.id, "division", event.target.value)}
                                              className={`w-full rounded-lg border px-3 py-2 ${
                                                manualFormErrors.division && !selectedDiscipline.division
                                                  ? "border-red-300 bg-white"
                                                  : "border-gray-200"
                                              }`}
                                            >
                                              <option value="">Wybierz dywizję</option>
                                              {divisionOptions.map((division) => (
                                                <option key={division} value={division}>
                                                  {division}
                                                </option>
                                              ))}
                                            </select>
                                          </label>
                                        )}

                                        {discipline.fixed_power_factor ? (
                                          <div className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700">
                                            <span className="mb-1 block">Power Factor</span>
                                            <span className="text-base font-black text-gray-950">
                                              Stały {discipline.fixed_power_factor === "major" ? "Major" : "Minor"}
                                            </span>
                                          </div>
                                        ) : (
                                          <label className="block font-semibold text-gray-700">
                                            <span className="mb-1 block">Power Factor</span>
                                            <select
                                              value={selectedDiscipline.power_factor}
                                              onChange={(event) => updateManualDynamicField(discipline.id, "power_factor", event.target.value)}
                                              className={`w-full rounded-lg border px-3 py-2 ${
                                                manualFormErrors.division && !selectedDiscipline.power_factor
                                                  ? "border-red-300 bg-white"
                                                  : "border-gray-200"
                                              }`}
                                            >
                                              <option value="">Wybierz PF</option>
                                              {POWER_FACTOR_OPTIONS.map((powerFactor) => (
                                                <option key={powerFactor} value={powerFactor}>
                                                  {powerFactor === "major" ? "Major" : "Minor"}
                                                </option>
                                              ))}
                                            </select>
                                          </label>
                                        )}
                                      </div>
                                    )}
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
