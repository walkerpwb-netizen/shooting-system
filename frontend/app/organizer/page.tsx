"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

type Discipline = {
  id?: number;
  name: string;
  description: string;
  scoring_type: string;
  shots_count: number;
  ammo_type: string;
  ammo_price: string;
  entry_fee: string;
};

type OrganizerTab = "current" | "history";
type NameSortDirection = "asc" | "desc";

const ammoTypes = [
  ".22 LR",
  "19mm",
  ".45 ACP",
  ".223 Remington",
  ".308 Winchester",
  "12/70",
  "12/76",
];

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

function isCompetitionDateReached(dateValue: string) {
  const normalizedDate = dateValue.includes(".")
    ? dateValue.split(".").reverse().join("-")
    : dateValue;
  const competitionDate = new Date(`${normalizedDate}T00:00:00`);

  if (Number.isNaN(competitionDate.getTime())) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return competitionDate <= today;
}

function nextNameSortDirection(currentDirection: NameSortDirection) {
  return currentDirection === "asc"
    ? "desc"
    : "asc";
}

export default function OrganizerPage() {
  const router = useRouter();

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [activeTab, setActiveTab] = useState<OrganizerTab>("current");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [organizerFullName, setOrganizerFullName] = useState("");
  const [organizerLogo, setOrganizerLogo] = useState("");
  const [sponsors, setSponsors] = useState("");
  const [sponsorLogo, setSponsorLogo] = useState("");
  const [useParticipantLimit, setUseParticipantLimit] = useState(false);
  const [participantLimit, setParticipantLimit] = useState("");
  const [message, setMessage] = useState("");
  const [disciplineCount, setDisciplineCount] = useState(0);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [judgeEmailByCompetition, setJudgeEmailByCompetition] = useState<Record<number, string>>({});
  const [judgeDisciplineByCompetition, setJudgeDisciplineByCompetition] = useState<Record<number, string>>({});
  const [headJudgeByCompetition, setHeadJudgeByCompetition] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [editingCompetitionId, setEditingCompetitionId] = useState<number | null>(null);
  const [editingCompetitionStatus, setEditingCompetitionStatus] = useState("");
  const [competitionNameFilter, setCompetitionNameFilter] = useState("");
  const [competitionNameSortDirection, setCompetitionNameSortDirection] = useState<NameSortDirection>("asc");
  const canManageDisciplines = !editingCompetitionId || editingCompetitionStatus === "draft";
  const existingDisciplineCount = disciplines.filter((discipline) => discipline.id).length;
  const newDisciplineCount = Math.max(
    disciplines.length - existingDisciplineCount,
    0
  );
  const visibleCompetitions = useMemo(() => {
    const normalizedFilter = competitionNameFilter.trim().toLowerCase();

    return competitions
      .filter((competition) =>
        activeTab === "history"
          ? competition.status === "completed"
          : competition.status !== "completed"
      )
      .filter((competition) =>
        competition.name.toLowerCase().includes(normalizedFilter)
      )
      .sort((firstCompetition, secondCompetition) => {
        const sortResult = firstCompetition.name.localeCompare(
          secondCompetition.name,
          "pl",
          {
            sensitivity: "base",
          }
        );

        return competitionNameSortDirection === "asc"
          ? sortResult
          : -sortResult;
      });
  }, [
    activeTab,
    competitionNameFilter,
    competitionNameSortDirection,
    competitions,
  ]);

  useEffect(() => {
    if (!isOrganizer()) {
      router.push("/");
      return;
    }

    fetchOrganizerCompetitions();
  }, [router]);

  function resetForm() {
    setName("");
    setDate("");
    setLocation("");
    setEntryFee("");
    setOrganizerFullName("");
    setOrganizerLogo("");
    setSponsors("");
    setSponsorLogo("");
    setUseParticipantLimit(false);
    setParticipantLimit("");
    setDisciplineCount(0);
    setDisciplines([]);
    setEditingCompetitionId(null);
    setEditingCompetitionStatus("");
    setMessage("");
  }

  function generateDisciplines(count: number) {
    const existingDisciplines = disciplines.filter((discipline) => discipline.id);
    const newDisciplines: Discipline[] = [...existingDisciplines];
    const newDisciplinesCount = Math.max(
      count - existingDisciplines.length,
      0
    );

    for (let i = 0; i < newDisciplinesCount; i++) {
      newDisciplines.push({
        name: "",
        description: "",
        scoring_type: "points",
        shots_count: 0,
        ammo_type: "",
        ammo_price: "",
        entry_fee: "",
      });
    }

    setDisciplines(newDisciplines);
  }

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
    }
  }

  async function inviteJudge(competition: Competition) {
    const token = localStorage.getItem("token");
    const judgeEmail = judgeEmailByCompetition[competition.id] || "";
    const disciplineValue = judgeDisciplineByCompetition[competition.id] || "";

    if (!judgeEmail) {
      setMessage("Wybierz sędziego ❌");
      return;
    }

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
            discipline_ids: disciplineValue
              ? [Number(disciplineValue)]
              : [],
            is_head_judge: Boolean(headJudgeByCompetition[competition.id]),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się przypisać sędziego ❌");
        return;
      }

      setMessage("Sędzia przypisany do zawodów ✅");
      setJudgeEmailByCompetition({
        ...judgeEmailByCompetition,
        [competition.id]: "",
      });
      setJudgeDisciplineByCompetition({
        ...judgeDisciplineByCompetition,
        [competition.id]: "",
      });
      setHeadJudgeByCompetition({
        ...headJudgeByCompetition,
        [competition.id]: false,
      });
      fetchOrganizerCompetitions();
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  async function removeJudgeAssignment(
    competition: Competition,
    assignment: Competition["judge_assignments"][number]
  ) {
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

  async function handleDeleteCompetition(
    competitionId: number
  ) {
    const confirmed = window.confirm(
      "Czy na pewno chcesz usunąć zawody?"
    );

    if (!confirmed) {
      return;
    }

    const token = localStorage.getItem("token");

    try {
      const response = await fetch(
        apiUrl(`/competitions/${competitionId}`),
        {
          method: "DELETE",

          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się usunąć zawodów ❌");
        return;
      }

      setMessage("Zawody usunięte ✅");
      fetchOrganizerCompetitions();
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  async function handlePublishCompetition(competitionId: number) {
    const token = localStorage.getItem("token");

    try {
      const response = await fetch(
        apiUrl(`/competitions/${competitionId}/publish`),
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się opublikować zawodów ❌");
        return;
      }

      setMessage("Zawody opublikowane ✅");
      fetchOrganizerCompetitions();
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  async function handleUnpublishCompetition(competitionId: number) {
    const confirmed = window.confirm(
      "Czy na pewno chcesz cofnąć publikację zawodów?"
    );

    if (!confirmed) {
      return;
    }

    const token = localStorage.getItem("token");

    try {
      const response = await fetch(
        apiUrl(`/competitions/${competitionId}/unpublish`),
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się cofnąć publikacji ❌");
        return;
      }

      setMessage("Publikacja cofnięta ✅");
      fetchOrganizerCompetitions();
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  async function handleStartCompetition(competition: Competition) {
    const confirmed = window.confirm(
      "Czy na pewno chcesz rozpocząć zawody? Po rozpoczęciu edycja i usunięcie będą zablokowane dla organizatora."
    );

    if (!confirmed) {
      return;
    }

    const token = localStorage.getItem("token");

    try {
      const response = await fetch(
        apiUrl(`/competitions/${competition.id}/start`),
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się rozpocząć zawodów ❌");
        return;
      }

      setMessage("Zawody rozpoczęte ✅");
      fetchOrganizerCompetitions();
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  async function handleFinishCompetition(competition: Competition) {
    const confirmed = window.confirm(
      "Czy na pewno chcesz zakończyć zawody? Po zakończeniu trafią do zakończonych zawodów."
    );

    if (!confirmed) {
      return;
    }

    const token = localStorage.getItem("token");

    try {
      const response = await fetch(
        apiUrl(`/competitions/${competition.id}/finish`),
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się zakończyć zawodów ❌");
        return;
      }

      setMessage("Zawody zakończone ✅");
      fetchOrganizerCompetitions();
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  function handleTogglePublication(competition: Competition) {
    if (competition.status === "started" || competition.status === "completed") {
      setMessage("Rozpoczętych lub zakończonych zawodów nie można cofnąć do szkicu ❌");
      return;
    }

    if (competition.status === "published") {
      handleUnpublishCompetition(competition.id);
      return;
    }

    handlePublishCompetition(competition.id);
  }

  function handleEditCompetition(
    competition: Competition
  ) {
    if (competition.status === "started") {
      setMessage("Rozpoczętych zawodów nie można edytować ❌");
      return;
    }

    setEditingCompetitionId(competition.id);
    setName(competition.name);
    setDate(competition.date);
    setLocation(competition.location);
    setEntryFee(competition.entry_fee || "");
    setOrganizerFullName(competition.organizer_full_name || "");
    setOrganizerLogo(competition.organizer_logo || "");
    setSponsors(competition.sponsors || "");
    setSponsorLogo(competition.sponsor_logo || "");
    setUseParticipantLimit(Boolean(competition.participant_limit));
    setParticipantLimit(
      competition.participant_limit
        ? String(competition.participant_limit)
        : ""
    );
    setEditingCompetitionStatus(competition.status);
    setDisciplineCount(0);
    setDisciplines(
      competition.disciplines.map((discipline) => ({
        id: discipline.id,
        name: discipline.name,
        description: discipline.description || "",
        scoring_type: discipline.scoring_type || "points",
        shots_count: discipline.shots_count || 0,
        ammo_type: discipline.ammo_type || "",
        ammo_price: discipline.ammo_price || "",
        entry_fee: discipline.entry_fee || "",
      }))
    );
    setMessage("");
    setShowCreateForm(true);
  }

  function handleToggleForm() {
    if (showCreateForm) {
      resetForm();
      setShowCreateForm(false);
      return;
    }

    resetForm();
    setShowCreateForm(true);
  }

  function handleLogoChange(
    file: File | undefined,
    setLogo: (value: string) => void
  ) {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setMessage("Logo musi być plikiem graficznym ❌");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      setLogo(String(reader.result || ""));
    };

    reader.readAsDataURL(file);
  }

  async function handleSaveCompetition() {
    setMessage("");

    if (!name || !date || !location) {
      setMessage("Wypełnij wszystkie pola ❌");
      return;
    }

    if (
      useParticipantLimit
      && (!participantLimit || Number(participantLimit) <= 0)
    ) {
      setMessage("Podaj prawidłowy limit zawodników ❌");
      return;
    }

    const invalidDiscipline = disciplines.some((discipline) =>
      !discipline.name
      || !discipline.shots_count
      || !discipline.ammo_type
      || !discipline.ammo_price
      || (!entryFee && !discipline.entry_fee)
    );

    if (invalidDiscipline) {
      setMessage("Uzupełnij wszystkie dane konkurencji ❌");
      return;
    }

    const token = localStorage.getItem("token");

    try {
      setLoading(true);

      const endpoint = editingCompetitionId
        ? apiUrl(`/competitions/${editingCompetitionId}`)
        : apiUrl("/competitions");

      const method = editingCompetitionId
        ? "PUT"
        : "POST";

      const response = await fetch(
        endpoint,
        {
          method,

          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },

          body: JSON.stringify({
            name,
            date,
            location,
            entry_fee: entryFee,
            organizer_full_name: organizerFullName,
            organizer_logo: organizerLogo,
            sponsors,
            sponsor_logo: sponsorLogo,
            participant_limit: useParticipantLimit
              ? Number(participantLimit)
              : null,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Błąd ❌");
        return;
      }

      const competitionId = data.competition_id;

      if (disciplines.length > 0) {
        for (const discipline of disciplines) {
          const disciplineEndpoint = discipline.id
            ? apiUrl(`/competitions/${competitionId}/disciplines/${discipline.id}`)
            : apiUrl(`/competitions/${competitionId}/disciplines`);
          const disciplineMethod = discipline.id
            ? "PUT"
            : "POST";

          const disciplineResponse = await fetch(
            disciplineEndpoint,
            {
              method: disciplineMethod,

              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },

              body: JSON.stringify({
                name: discipline.name,
                description: discipline.description,
                scoring_type: discipline.scoring_type,
                shots_count: discipline.shots_count,
                ammo_type: discipline.ammo_type,
                ammo_price: discipline.ammo_price,
                entry_fee: entryFee
                  ? ""
                  : discipline.entry_fee,
              }),
            }
          );

          if (!disciplineResponse.ok) {
            setMessage("Zawody zapisane, ale nie udało się zapisać konkurencji ❌");
            return;
          }
        }
      }

      setMessage(
        editingCompetitionId
          ? "Zawody zaktualizowane ✅"
          : "Zawody utworzone ✅"
      );

      resetForm();
      setShowCreateForm(false);
      fetchOrganizerCompetitions();
    } catch (error) {
      console.error(error);

      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-8 md:p-10">

      <div className="max-w-6xl mx-auto">

        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between mb-10">

          <div className="min-w-0">

            <h1 className="text-4xl md:text-5xl font-bold text-zinc-950 dark:text-white mb-2">
              Panel Organizatora
            </h1>

            <p className="text-zinc-600 dark:text-gray-400">
              Zarządzaj swoimi zawodami
            </p>

          </div>

          <button
            onClick={handleToggleForm}
            className="ui-button w-full md:w-auto bg-green-700 hover:bg-green-600 text-white px-6 py-4 rounded-2xl font-bold transition"
          >
            {showCreateForm
              ? "Zamknij"
              : "Nowe zawody"}
          </button>

        </div>

        <div className="flex flex-wrap items-center gap-3 mb-8">
          <button
            type="button"
            onClick={() => setActiveTab("current")}
            className={`ui-button px-5 py-3 rounded-xl font-bold transition ${
              activeTab === "current"
                ? "bg-green-700 text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700"
            }`}
          >
            Aktualne
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`ui-button px-5 py-3 rounded-xl font-bold transition ${
              activeTab === "history"
                ? "bg-green-700 text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700"
            }`}
          >
            Historyczne
          </button>
        </div>

        {showCreateForm && (

          <div className="ui-block bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-10 shadow-2xl">

            <h2 className="text-3xl font-bold text-white mb-6">
              {editingCompetitionId
                ? "Edytuj zawody"
                : "Utwórz nowe zawody"}
            </h2>

            {canManageDisciplines ? (
              <div className="mb-6">

                <label className="block mb-2 text-white font-semibold">
                  {editingCompetitionId
                    ? "Ilość nowych konkurencji do dodania"
                    : "Ilość konkurencji"}
                </label>

                <select
                  value={
                    editingCompetitionId
                      ? newDisciplineCount
                      : disciplineCount
                  }
                  onChange={(e) => {

                    const count = Number(e.target.value);

                    setDisciplineCount(count);

                    if (editingCompetitionId) {
                      generateDisciplines(existingDisciplineCount + count);
                      return;
                    }

                    generateDisciplines(count);

                  }}
                  className="w-full border border-zinc-700 bg-zinc-800 p-4 rounded-xl text-white"
                >

                  {Array.from({ length: 21 }, (_, i) => i).map((num) => (
                    <option key={num} value={num}>
                      {num}
                    </option>
                  ))}

                </select>

              </div>
            ) : (
              <p className="bg-yellow-950/30 border border-yellow-800 text-yellow-100 rounded-xl p-4 mb-6">
                Dodawanie konkurencji jest dostępne tylko przed publikacją zawodów.
              </p>
            )}

            <div className="space-y-4 mb-10">

              <input
                type="text"
                placeholder="Nazwa zawodów"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-zinc-700 bg-zinc-800 p-4 rounded-xl text-white"
              />

              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-zinc-700 bg-zinc-800 p-4 rounded-xl text-white"
              />

              <input
                type="text"
                placeholder="Lokalizacja"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full border border-zinc-700 bg-zinc-800 p-4 rounded-xl text-white"
              />

              <input
                type="text"
                placeholder="Podaj pełną nazwę organizatora"
                value={organizerFullName}
                onChange={(e) => setOrganizerFullName(e.target.value)}
                className="w-full border border-zinc-700 bg-zinc-800 p-4 rounded-xl text-white"
              />

              <label className="flex items-center gap-3 border border-zinc-700 bg-zinc-950 p-4 rounded-xl text-white font-semibold">
                <input
                  type="checkbox"
                  checked={useParticipantLimit}
                  onChange={(event) => {
                    setUseParticipantLimit(event.target.checked);

                    if (!event.target.checked) {
                      setParticipantLimit("");
                    }
                  }}
                  className="h-5 w-5"
                />
                Czy chcesz określić limit zawodników?
              </label>

              {useParticipantLimit && (
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Maksymalna liczba zawodników"
                  value={participantLimit}
                  onChange={(e) => setParticipantLimit(e.target.value)}
                  className="w-full border border-zinc-700 bg-zinc-800 p-4 rounded-xl text-white"
                />
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <div className="border border-zinc-700 bg-zinc-950 rounded-2xl p-4">
                  <p className="text-white font-semibold mb-3">
                    Logo organizatora
                  </p>

                  <div className="h-28 rounded-xl border border-dashed border-zinc-600 bg-zinc-900 flex items-center justify-center overflow-hidden mb-3">
                    {organizerLogo ? (
                      <img
                        src={organizerLogo}
                        alt="Logo organizatora"
                        className="h-full w-full object-contain p-2"
                      />
                    ) : (
                      <span className="text-gray-500 text-sm font-semibold">
                        Brak logo
                      </span>
                    )}
                  </div>

                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => handleLogoChange(
                      event.target.files?.[0],
                      setOrganizerLogo
                    )}
                    className="w-full text-sm text-gray-300 file:mr-3 file:border-0 file:rounded-lg file:bg-green-700 file:px-3 file:py-2 file:text-white file:font-semibold"
                  />

                  {organizerLogo && (
                    <button
                      type="button"
                      onClick={() => setOrganizerLogo("")}
                      className="mt-3 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
                    >
                      Usuń logo
                    </button>
                  )}
                </div>

                <div className="border border-zinc-700 bg-zinc-950 rounded-2xl p-4">
                  <p className="text-white font-semibold mb-3">
                    Logo sponsora
                  </p>

                  <div className="h-28 rounded-xl border border-dashed border-zinc-600 bg-zinc-900 flex items-center justify-center overflow-hidden mb-3">
                    {sponsorLogo ? (
                      <img
                        src={sponsorLogo}
                        alt="Logo sponsora"
                        className="h-full w-full object-contain p-2"
                      />
                    ) : (
                      <span className="text-gray-500 text-sm font-semibold">
                        Brak logo
                      </span>
                    )}
                  </div>

                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => handleLogoChange(
                      event.target.files?.[0],
                      setSponsorLogo
                    )}
                    className="w-full text-sm text-gray-300 file:mr-3 file:border-0 file:rounded-lg file:bg-green-700 file:px-3 file:py-2 file:text-white file:font-semibold"
                  />

                  {sponsorLogo && (
                    <button
                      type="button"
                      onClick={() => setSponsorLogo("")}
                      className="mt-3 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
                    >
                      Usuń logo
                    </button>
                  )}
                </div>
              </div>

              <textarea
                placeholder="Sponsorzy"
                value={sponsors}
                onChange={(e) => setSponsors(e.target.value)}
                className="w-full border border-zinc-700 bg-zinc-800 p-4 rounded-xl text-white min-h-[96px]"
              />

              <input
                type="number"
                step="0.01"
                min="0"
                placeholder=" Podaj koszt dołączenia do całuch zawodów, lub pozostaw puste jeśli pobierasz opłatę za poszczególne konkurencje"
                value={entryFee}
                onChange={(e) => setEntryFee(e.target.value)}
                className="w-full border border-zinc-700 bg-zinc-800 p-4 rounded-xl text-white"
              />

            </div>

            {canManageDisciplines && (
              <div className="space-y-6">

                {disciplines.map((discipline, index) => (

                <div
                  key={index}
                  className="border border-zinc-700 rounded-2xl p-6 bg-zinc-950"
                >

                  <h2 className="text-2xl font-bold mb-6 text-white">
                    {discipline.id
                      ? `Konkurencja ${index + 1}`
                      : `Nowa konkurencja ${index - existingDisciplineCount + 1}`}
                  </h2>

                  <div className="space-y-5">

                    <input
                      type="text"
                      placeholder="Nazwa konkurencji"
                      value={discipline.name}
                      onChange={(e) => {

                        const updated = [...disciplines];

                        updated[index].name = e.target.value;

                        setDisciplines(updated);

                      }}
                      className="w-full border border-zinc-700 bg-zinc-800 p-4 rounded-xl text-white"
                    />

                    <textarea
                      placeholder="Opis konkurencji"
                      value={discipline.description}
                      onChange={(e) => {

                        const updated = [...disciplines];

                        updated[index].description = e.target.value;

                        setDisciplines(updated);

                      }}
                      className="w-full border border-zinc-700 bg-zinc-800 p-4 rounded-xl text-white min-h-[120px]"
                    />

                    <div>

                      <p className="text-white font-semibold mb-3">
                        Typ punktacji
                      </p>

                      <div className="grid grid-cols-2 gap-4">

                        <button
                          type="button"
                          onClick={() => {

                            const updated = [...disciplines];

                            updated[index].scoring_type = "points";

                            setDisciplines(updated);

                          }}
                          className={`border rounded-xl p-4 font-bold transition ${
                            discipline.scoring_type === "points"
                              ? "bg-green-700 border-green-600 text-white"
                              : "bg-zinc-800 border-zinc-700 text-gray-300 hover:bg-zinc-700"
                          }`}
                        >
                          ⦿ Punkty
                        </button>

                        <button
                          type="button"
                          onClick={() => {

                            const updated = [...disciplines];

                            updated[index].scoring_type = "factor";

                            setDisciplines(updated);

                          }}
                          className={`border rounded-xl p-4 font-bold transition ${
                            discipline.scoring_type === "factor"
                              ? "bg-green-700 border-green-600 text-white"
                              : "bg-zinc-800 border-zinc-700 text-gray-300 hover:bg-zinc-700"
                          }`}
                        >
                          ⦿ Faktor
                        </button>

                      </div>

                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-white font-semibold mb-3">
                          Typ amunicji
                        </p>

                        <select
                          value={discipline.ammo_type}
                          onChange={(e) => {

                            const updated = [...disciplines];

                            updated[index].ammo_type = e.target.value;

                            setDisciplines(updated);

                          }}
                          className="w-full border border-zinc-700 bg-zinc-800 p-4 rounded-xl text-white"
                        >
                          <option value="" disabled>
                            Wybierz typ amunicji
                          </option>

                          {ammoTypes.map((ammoType) => (
                            <option key={ammoType} value={ammoType}>
                              {ammoType}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <p className="text-white font-semibold mb-3">
                          Cena za sztukę
                        </p>

                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Podaj cenę za sztukę"
                          value={discipline.ammo_price}
                          onChange={(e) => {

                            const updated = [...disciplines];

                            updated[index].ammo_price = e.target.value;

                            setDisciplines(updated);

                          }}
                          className="w-full border border-zinc-700 bg-zinc-800 p-4 rounded-xl text-white"
                        />
                      </div>
                    </div>

                    <div>

                      {!entryFee && (
                        <div className="mb-5">
                          <p className="text-white font-semibold mb-3">
                            Cena przystąpienia do konkurencji
                          </p>

                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="podaj cenę dołączenia do konkurencji"
                            value={discipline.entry_fee}
                            onChange={(e) => {

                              const updated = [...disciplines];

                              updated[index].entry_fee = e.target.value;

                              setDisciplines(updated);

                            }}
                            className="w-full border border-zinc-700 bg-zinc-800 p-4 rounded-xl text-white"
                          />
                        </div>
                      )}

                      <p className="text-white font-semibold mb-3">
                        Liczba ocenianych strzałów
                      </p>

                      <input
                        type="number"
                        placeholder="Podaj liczbę strzałów ocenianych"
                        value={
                          discipline.shots_count === 0
                            ? ""
                            : discipline.shots_count
                        }
                        onChange={(e) => {

                          const updated = [...disciplines];

                          updated[index].shots_count = Number(e.target.value);

                          setDisciplines(updated);

                        }}
                        className="w-full border border-zinc-700 bg-zinc-800 p-4 rounded-xl text-white"
                      />

                    </div>

                  </div>

                </div>

                ))}

              </div>
            )}

            <button
              onClick={handleSaveCompetition}
              disabled={loading}
              className="w-full mt-8 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white py-4 rounded-xl font-bold transition"
            >
              {loading
                ? "Zapisywanie..."
                : editingCompetitionId
                  ? "Zapisz zmiany"
                  : "Utwórz zawody"}
            </button>

            {message && (
              <p className="text-center text-white font-medium mt-4">
                {message}
              </p>
            )}

          </div>

        )}

        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <input
            value={competitionNameFilter}
            onChange={(event) => setCompetitionNameFilter(event.target.value)}
            placeholder="Filtruj po nazwie zawodów"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-500 focus:border-green-700 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-gray-500 md:w-80"
          />

          <button
            type="button"
            onClick={() => setCompetitionNameSortDirection((currentDirection) => nextNameSortDirection(currentDirection))}
            className="ui-button w-full rounded-lg bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-800 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700 md:w-auto"
          >
            Nazwa {competitionNameSortDirection === "asc" ? "↑" : "↓"}
          </button>
        </div>

        {visibleCompetitions.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-gray-300">
            {competitionNameFilter.trim()
              ? "Brak zawodów pasujących do filtra."
              : activeTab === "history"
                ? "Nie masz jeszcze zakończonych zawodów."
                : "Nie masz jeszcze aktualnych zawodów."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="hidden grid-cols-[1.5fr_0.7fr_1fr_1.5fr] gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-gray-400 lg:grid">
              <button
                type="button"
                onClick={() => setCompetitionNameSortDirection((currentDirection) => nextNameSortDirection(currentDirection))}
                className="text-left transition hover:text-zinc-950 dark:hover:text-white"
              >
                Nazwa zawodów {competitionNameSortDirection === "asc" ? "↑" : "↓"}
              </button>

              <p>Data</p>
              <p>Lokalizacja</p>
              <p aria-hidden="true" />
            </div>

            {visibleCompetitions.map((competition) => (
              <div
                key={competition.id}
                className="grid gap-4 border-b border-zinc-200 px-4 py-4 text-sm last:border-b-0 dark:border-zinc-800 lg:grid-cols-[1.5fr_0.7fr_1fr_1.5fr] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-800">
                      {getCompetitionStatusLabel(competition.status)}
                    </span>

                    <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700 dark:bg-zinc-800 dark:text-gray-200">
                      Dyscypliny: {competition.disciplines_count}
                    </span>
                  </div>

                  <p className="truncate text-base font-bold text-zinc-950 dark:text-white">
                    {competition.name}
                  </p>

                  <p className="mt-1 text-xs text-zinc-600 dark:text-gray-400">
                    Zawodnicy: {competition.participants.length}
                    {competition.participant_limit
                      ? `/${competition.participant_limit}`
                      : " / Bez limitu"}
                  </p>

                  {(competition.organizer_full_name || competition.sponsors) && (
                    <p className="mt-1 truncate text-xs text-zinc-500 dark:text-gray-500">
                      {[competition.organizer_full_name, competition.sponsors ? `Sponsorzy: ${competition.sponsors}` : ""].filter(Boolean).join(" • ")}
                    </p>
                  )}
                </div>

                <p className="text-zinc-700 dark:text-gray-300">
                  {competition.date}
                </p>

                <p className="text-zinc-700 dark:text-gray-300">
                  {competition.location}
                </p>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <button
                    type="button"
                    onClick={() => router.push(`/organizer/${competition.id}`)}
                    className="ui-button bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2 rounded-xl font-semibold"
                  >
                    Szczegóły
                  </button>

                  <button
                    type="button"
                    onClick={() => handleEditCompetition(competition)}
                    disabled={competition.status === "started" || competition.status === "completed"}
                    className="ui-button bg-blue-600 hover:bg-blue-500 disabled:bg-gray-500 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl font-semibold"
                  >
                    Edytuj
                  </button>

                  {competition.status !== "started" && competition.status !== "completed" && (
                    <button
                      type="button"
                      onClick={() => handleTogglePublication(competition)}
                      className={`ui-button text-white px-4 py-2 rounded-xl font-semibold ${
                        competition.status === "published"
                          ? "bg-orange-600 hover:bg-orange-500"
                          : "bg-green-700 hover:bg-green-600"
                      }`}
                    >
                      {competition.status === "published"
                        ? "Cofnij"
                        : "Publikuj"}
                    </button>
                  )}

                  {competition.status === "published" && (
                    <button
                      type="button"
                      onClick={() => handleStartCompetition(competition)}
                      disabled={!isCompetitionDateReached(competition.date)}
                      title={
                        isCompetitionDateReached(competition.date)
                          ? ""
                          : "Zawody można rozpocząć najwcześniej w dniu zawodów"
                      }
                      className="ui-button bg-green-800 hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl font-semibold"
                    >
                      Rozpocznij
                    </button>
                  )}

                  {competition.status === "started" && (
                    <button
                      type="button"
                      onClick={() => handleFinishCompetition(competition)}
                      className="ui-button bg-orange-700 hover:bg-orange-600 text-white px-4 py-2 rounded-xl font-semibold"
                    >
                      Zakończ
                    </button>
                  )}

                  {canViewCompetitionResults(competition.status) && (
                    <button
                      type="button"
                      onClick={() => router.push(`/organizer/${competition.id}/results`)}
                      className="ui-button bg-green-800 hover:bg-green-700 text-white px-4 py-2 rounded-xl font-semibold"
                    >
                      Wyniki
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDeleteCompetition(competition.id)}
                    disabled={competition.status === "started" || competition.status === "completed"}
                    className="ui-button bg-red-700 hover:bg-red-600 disabled:bg-gray-500 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl font-semibold"
                  >
                    Usuń
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

    </main>
  );
}
