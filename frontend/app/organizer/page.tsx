"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { apiUrl } from "@/lib/api";
import { authFetch, getAuthSnapshot, isOrganizer, subscribeToAuthChange } from "@/lib/auth";

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
  pzss_license_calendar: boolean;
  requires_licensed_judge: boolean;
  status: string;
  disciplines_count: number;
  shooters_count: number;
  judges_count: number;
  missing_judge_disciplines?: string[];
  disciplines?: {
    id: number;
    name: string;
    description: string;
    discipline_type: string;
    discipline_type_label?: string;
    shots_count: number;
    trap_variant: string;
    trap_series_count: number;
    clay_variant?: string;
    clay_series_count?: number;
    ammo_type: string;
    ammo_price: string;
    clay_price: string;
    entry_fee: string;
  }[];
  participants?: {
    id: number;
    display_name: string;
  }[];
  judges?: {
    id: number;
    user_email: string;
    display_name: string;
    is_head_judge: boolean;
  }[];
  judge_assignments?: {
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
  discipline_type: string;
  shots_count: number;
  trap_variant: string;
  trap_series_count: number;
  ammo_type: string;
  ammo_price: string;
  clay_price: string;
  entry_fee: string;
};

type OrganizerTab = "current" | "history";

const disciplineTypeGroups = [
  {
    label: "Konkurencje pistoletowe i rewolwerowe",
    options: [
      { value: "pistol-air-10m", label: "Pistolet pneumatyczny 10 m (Ppn)" },
      { value: "pistol-sport-25m", label: "Pistolet sportowy 25 m (Psp)" },
      { value: "pistol-rapid-fire-25m", label: "Pistolet szybkostrzelny 25 m (Psz)" },
      { value: "pistol-free-50m", label: "Pistolet dowolny 50 m (Pdw)" },
      { value: "pistol-center-fire-25m", label: "Pistolet centralnego zapłonu 25 m (Pcz)" },
      { value: "pistol-standard-25m", label: "Pistolet standardowy 25 m (Pst)" },
      { value: "ipsc-pistol", label: "IPSC Pistolet" },
      { value: "idpa", label: "IDPA" },
      { value: "action-air", label: "Action Air" },
    ],
  },
  {
    label: "Konkurencje karabinowe",
    options: [
      { value: "rifle-air-10m", label: "Karabin pneumatyczny 10 m (Kpn)" },
      { value: "rifle-sport-50m-60-prone", label: "Karabin sportowy 50 m - 60 leżąc (Ksp 60)" },
      { value: "rifle-3-positions-50m", label: "Karabin 3 postawy 50 m (Ksp 3×20 / Kdw 3×40)" },
      { value: "rifle-free-300m-prone", label: "Karabin dowolny 300 m - leżąc" },
      { value: "rifle-free-300m-3-positions", label: "Karabin dowolny 300 m - 3 postawy" },
      { value: "rifle-standard-300m", label: "Karabin standardowy 300 m (Kst)" },
      { value: "moving-target", label: "Ruchoma tarcza (RT)" },
      { value: "long-range", label: "Strzelanie długodystansowe (Long Range)" },
      { value: "centerfire-rifle", label: "Karabin centralnego zapłonu (KCZ)" },
      { value: "practical-rifle", label: "Karabin praktyczny (KPr)" },
      { value: "pcc", label: "PCC (Pistol Caliber Carbine)" },
      { value: "2gun", label: "2GUN" },
      { value: "3gun", label: "3-Gun (Multi-Gun)" },
    ],
  },
  {
    label: "Konkurencje strzelbowe",
    options: [
      { value: "trap", label: "Trap" },
      { value: "skeet", label: "Skeet" },
      { value: "double-trap", label: "Double Trap" },
      { value: "trap-mix", label: "Trap MIX" },
      { value: "skeet-mix", label: "Skeet MIX" },
      { value: "practical-shotgun", label: "Strzelba praktyczna (SPr)" },
      { value: "ipsc-shotgun", label: "IPSC Shotgun" },
    ],
  },
  {
    label: "Dyscypliny niszowe i historyczne",
    options: [
      { value: "black-powder", label: "Strzelectwo czarnoprochowe" },
      { value: "cowboy-action-shooting", label: "Strzelectwo westernowe (Cowboy Action Shooting - CAS)" },
      { value: "sporting-clays", label: "Strzelectwo parkurowe (Sporting Clays / Parcours de Chasse)" },
      { value: "historical-shooting", label: "Strzelectwo historyczne" },
      { value: "kurkowe-shooting", label: "Strzelectwo kurkowe" },
    ],
  },
];

const ammoTypes = [
  ".22 LR (5,6 mm)",
  "9×19 mm Parabellum",
  ".38 Special",
  ".357 Magnum",
  ".40 S&W",
  ".45 ACP",
  ".223 Rem / 5.56 NATO",
  ".308 Winchester",
  "6.5 Creedmoor",
  "6 mm BR Norma",
  "12/70 (12 Gauge)",
  "12/76 Magnum",
  "20 Gauge",
  ".17 HMR",
  "7.62×39",
  "7.62×54R",
  ".300 Winchester Magnum",
  ".338 Lapua Magnum",
  ".44 Magnum",
  ".32 S&W Long",
  "9×18 Makarov",
  "7.65 Browning",
  ".380 ACP",
];

const trapTargetsPerSeries = 25;
const trapShotsPerTarget = 2;
const trapVariantOptions = [
  { value: "trap-25", label: "Trap 25", seriesCount: 1 },
  { value: "trap-50", label: "Trap 50", seriesCount: 2 },
  { value: "trap-75", label: "Trap 75", seriesCount: 3 },
  { value: "trap-125", label: "Trap 125", seriesCount: 5 },
  { value: "manual", label: "ustaw liczbę serii ręcznie", seriesCount: null },
];
const skeetVariantOptions = [
  { value: "skeet-25", label: "Skeet 25", seriesCount: 1 },
  { value: "skeet-50", label: "Skeet 50", seriesCount: 2 },
  { value: "skeet-75", label: "Skeet 75", seriesCount: 3 },
  { value: "skeet-125", label: "Skeet 125", seriesCount: 5 },
  { value: "manual", label: "ustaw liczbę serii ręcznie", seriesCount: null },
];

function isClayDiscipline(discipline: Discipline) {
  return ["trap", "skeet"].includes(discipline.discipline_type);
}

function getClayVariantOptions(discipline: Discipline) {
  return discipline.discipline_type === "skeet" ? skeetVariantOptions : trapVariantOptions;
}

function getTrapPresetSeriesCount(discipline: Discipline, trapVariant: string) {
  return getClayVariantOptions(discipline).find((option) => option.value === trapVariant)?.seriesCount ?? null;
}

function getTrapSeriesCount(discipline: Discipline) {
  const presetSeriesCount = getTrapPresetSeriesCount(discipline, discipline.trap_variant);

  if (presetSeriesCount !== null) {
    return presetSeriesCount;
  }

  return Math.max(Number(discipline.trap_series_count || 0), 0);
}

function getTrapTargetsCount(discipline: Discipline) {
  return getTrapSeriesCount(discipline) * trapTargetsPerSeries;
}

function getTrapShotsCount(discipline: Discipline) {
  const shotsPerTarget = discipline.discipline_type === "skeet" ? 1 : trapShotsPerTarget;
  return getTrapTargetsCount(discipline) * shotsPerTarget;
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

function parseCompetitionTime(dateValue: string) {
  const normalizedDate = dateValue.includes(".")
    ? dateValue.split(".").reverse().join("-")
    : dateValue;
  const time = new Date(`${normalizedDate}T00:00:00`).getTime();

  return Number.isNaN(time)
    ? Number.MAX_SAFE_INTEGER
    : time;
}

function hasJoinedCompetition(competition: Competition) {
  return (
    (competition.shooters_count || competition.participants?.length || 0) > 0
    || (competition.judges_count || competition.judges?.length || 0) > 0
  );
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

export default function OrganizerPage() {
  const router = useRouter();

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [activeTab, setActiveTab] = useState<OrganizerTab>("current");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [organizerLogo, setOrganizerLogo] = useState("");
  const [sponsors, setSponsors] = useState("");
  const [sponsorLogo, setSponsorLogo] = useState("");
  const [useParticipantLimit, setUseParticipantLimit] = useState(false);
  const [participantLimit, setParticipantLimit] = useState("");
  const [pzssLicenseCalendar, setPzssLicenseCalendar] = useState(false);
  const [requiresLicensedJudge, setRequiresLicensedJudge] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  const [premiumPublicationDialog, setPremiumPublicationDialog] = useState("");
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [loading, setLoading] = useState(false);
  const [resultsPdfDownloadingId, setResultsPdfDownloadingId] = useState<number | null>(null);
  const [editingCompetitionId, setEditingCompetitionId] = useState<number | null>(null);
  const [editingCompetitionStatus, setEditingCompetitionStatus] = useState("");
  const [deletingDisciplineId, setDeletingDisciplineId] = useState<number | null>(null);
  const [competitionNameFilter, setCompetitionNameFilter] = useState("");
  const canManageDisciplines = !editingCompetitionId || editingCompetitionStatus === "draft";
  const authSnapshot = useSyncExternalStore(
    subscribeToAuthChange,
    getAuthSnapshot,
    () => ""
  );
  const [, , , , accountType, pzssClubStatus] = authSnapshot.split("|");
  const canMarkPzssLicenseCalendar = accountType === "pzss_club" && pzssClubStatus === "approved";
  const existingDisciplineCount = disciplines.filter((discipline) => discipline.id).length;
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
        const firstTime = parseCompetitionTime(firstCompetition.date);
        const secondTime = parseCompetitionTime(secondCompetition.date);
        const dateResult = firstTime - secondTime;

        if (dateResult !== 0) {
          return activeTab === "history" ? -dateResult : dateResult;
        }

        return firstCompetition.name.localeCompare(secondCompetition.name, "pl", {
          sensitivity: "base",
        });
      });
  }, [
    activeTab,
    competitionNameFilter,
    competitions,
  ]);

  function showPremiumPublicationLimitDialog(detail: string) {
    if (!detail.includes("Możesz mieć tylko jedne zawody opublikowane jednocześnie")) {
      return false;
    }

    setPremiumPublicationDialog(detail);
    return true;
  }

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
    setOrganizerLogo("");
    setSponsors("");
    setSponsorLogo("");
    setUseParticipantLimit(false);
    setParticipantLimit("");
    setPzssLicenseCalendar(false);
    setRequiresLicensedJudge(null);
    setDisciplines([]);
    setEditingCompetitionId(null);
    setEditingCompetitionStatus("");
    setDeletingDisciplineId(null);
    setMessage("");
  }

  function createBlankDiscipline(): Discipline {
    return {
      name: "",
      description: "",
      discipline_type: "",
      shots_count: 0,
      trap_variant: "",
      trap_series_count: 0,
      ammo_type: "",
      ammo_price: "",
      clay_price: "",
      entry_fee: "",
    };
  }

  function handleAddDiscipline() {
    if (!canManageDisciplines) {
      setMessage("Dodawanie konkurencji jest dostępne tylko przed publikacją zawodów ❌");
      return;
    }

    setDisciplines((currentDisciplines) => [
      ...currentDisciplines,
      createBlankDiscipline(),
    ]);
  }

  async function fetchOrganizerCompetitions() {
    try {
      const response = await authFetch(apiUrl("/my-competitions"));

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

  async function fetchOrganizerCompetitionDetails(competitionId: number) {
    const response = await authFetch(apiUrl(`/organizer/competitions/${competitionId}`));
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Nie udało się pobrać szczegółów zawodów");
    }

    return data as Competition;
  }

  async function handleDownloadResultsPdf(competition: Competition) {
    try {
      setMessage("");
      setResultsPdfDownloadingId(competition.id);

      const response = await authFetch(apiUrl(`/organizer/competitions/${competition.id}/results.pdf`));

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setMessage(data?.detail || "Nie udało się wygenerować PDF wyników ❌");
        return;
      }

      const blob = await response.blob();
      const fileUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeName = competition.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || `zawody-${competition.id}`;

      link.href = fileUrl;
      link.download = `komunikat-wynikow-${competition.id}-${safeName}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(fileUrl);
      setMessage("PDF z wynikami wygenerowany ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setResultsPdfDownloadingId(null);
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

    try {
      const response = await authFetch(
        apiUrl(`/competitions/${competitionId}`),
        {
          method: "DELETE",
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
    try {
      const response = await authFetch(
        apiUrl(`/competitions/${competitionId}/publish`),
        {
          method: "PUT",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        const detail = data.detail || "Nie udało się opublikować zawodów ❌";

        if (showPremiumPublicationLimitDialog(detail)) {
          setMessage("");
          return;
        }

        setMessage(detail);
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

    try {
      const response = await authFetch(
        apiUrl(`/competitions/${competitionId}/unpublish`),
        {
          method: "PUT",
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
    if ((competition.missing_judge_disciplines?.length || 0) > 0) {
      setMessage(
        `Nie można rozpocząć zawodów: brak przypisanego sędziego dla konkurencji: ${competition.missing_judge_disciplines?.join(", ")}. Przypisz sędziego w szczegółach zawodów. ❌`
      );
      return;
    }

    const confirmed = window.confirm(
      "Czy na pewno chcesz rozpocząć zawody? Po rozpoczęciu edycja i usunięcie będą zablokowane dla organizatora."
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await authFetch(
        apiUrl(`/competitions/${competition.id}/start`),
        {
          method: "PUT",
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

    try {
      const response = await authFetch(
        apiUrl(`/competitions/${competition.id}/finish`),
        {
          method: "PUT",
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
      if (hasJoinedCompetition(competition)) {
        setMessage("Nie można cofnąć publikacji zawodów, do których ktoś już dołączył ❌");
        return;
      }

      handleUnpublishCompetition(competition.id);
      return;
    }

    if ((competition.disciplines_count || 0) <= 0) {
      setMessage("Nie dodano żadnej konkurencji.");
      return;
    }

    handlePublishCompetition(competition.id);
  }

  async function handleEditCompetition(
    competition: Competition
  ) {
    if (competition.status !== "draft") {
      setMessage("Opublikowanych, rozpoczętych lub zakończonych zawodów nie można edytować ❌");
      return;
    }

    try {
      setMessage("Ładuję szczegóły zawodów...");
      const competitionDetails = await fetchOrganizerCompetitionDetails(competition.id);

      setEditingCompetitionId(competitionDetails.id);
      setName(competitionDetails.name);
      setDate(competitionDetails.date);
      setLocation(competitionDetails.location);
      setEntryFee(competitionDetails.entry_fee || "");
      setOrganizerLogo(competitionDetails.organizer_logo || "");
      setSponsors(competitionDetails.sponsors || "");
      setSponsorLogo(competitionDetails.sponsor_logo || "");
      setUseParticipantLimit(Boolean(competitionDetails.participant_limit));
      setPzssLicenseCalendar(Boolean(competitionDetails.pzss_license_calendar));
      setRequiresLicensedJudge(Boolean(competitionDetails.requires_licensed_judge));
      setParticipantLimit(
        competitionDetails.participant_limit
          ? String(competitionDetails.participant_limit)
          : ""
      );
      setEditingCompetitionStatus(competitionDetails.status);
      setDisciplines(
        (competitionDetails.disciplines || []).map((discipline) => ({
          id: discipline.id,
          name: discipline.name,
          description: discipline.description || "",
          discipline_type: discipline.discipline_type || "",
          shots_count: discipline.shots_count || 0,
          trap_variant: discipline.clay_variant || discipline.trap_variant || "",
          trap_series_count: discipline.clay_series_count || discipline.trap_series_count || 0,
          ammo_type: discipline.ammo_type || "",
          ammo_price: discipline.ammo_price || "",
          clay_price: discipline.clay_price || "",
          entry_fee: discipline.entry_fee || "",
        }))
      );
      setMessage("");
      setShowCreateForm(true);
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? `${error.message} ❌` : "Nie udało się pobrać szczegółów zawodów ❌");
    }
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

  async function handleDeleteDiscipline(
    discipline: Discipline,
    index: number
  ) {
    if (!canManageDisciplines) {
      setMessage("Konkurencje można usuwać tylko przed publikacją zawodów ❌");
      return;
    }

    if (!discipline.id) {
      setDisciplines((currentDisciplines) =>
        currentDisciplines.filter((_item, itemIndex) => itemIndex !== index)
      );
      return;
    }

    if (!editingCompetitionId) {
      return;
    }

    const confirmed = window.confirm(
      `Czy na pewno usunąć konkurencję "${discipline.name || `Konkurencja ${index + 1}`}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingDisciplineId(discipline.id);
      setMessage("");

      const response = await authFetch(
        apiUrl(`/competitions/${editingCompetitionId}/disciplines/${discipline.id}`),
        {
          method: "DELETE",
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się usunąć konkurencji ❌");
        return;
      }

      setDisciplines((currentDisciplines) =>
        currentDisciplines.filter((item) => item.id !== discipline.id)
      );
      setMessage("Konkurencja usunięta ✅");
      fetchOrganizerCompetitions();
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setDeletingDisciplineId(null);
    }
  }

  async function handleSaveCompetition() {
    setMessage("");

    if (!name || !date || !location) {
      setMessage("Wypełnij wszystkie pola ❌");
      return;
    }

    if (!canMarkPzssLicenseCalendar && requiresLicensedJudge === null) {
      setMessage("Wybierz, czy zawody wymagają licencjonowanego sędziego PZSS ❌");
      return;
    }

    if (
      useParticipantLimit
      && (!participantLimit || Number(participantLimit) <= 0)
    ) {
      setMessage("Podaj prawidłowy limit zawodników ❌");
      return;
    }

    const invalidDiscipline = disciplines.some((discipline) => {
      const trapDiscipline = isClayDiscipline(discipline);
      const trapSeriesCount = getTrapSeriesCount(discipline);
      const shotsCount = trapDiscipline
        ? getTrapShotsCount(discipline)
        : discipline.shots_count;

      return !discipline.name
        || !discipline.discipline_type
        || !shotsCount
        || (trapDiscipline && (!discipline.trap_variant || trapSeriesCount <= 0 || !discipline.clay_price))
        || !discipline.ammo_type
        || !discipline.ammo_price
        || (!entryFee && !discipline.entry_fee);
    });

    if (invalidDiscipline) {
      setMessage("Uzupełnij wszystkie dane konkurencji ❌");
      return;
    }

    try {
      setLoading(true);

      const endpoint = editingCompetitionId
        ? apiUrl(`/competitions/${editingCompetitionId}`)
        : apiUrl("/competitions");

      const method = editingCompetitionId
        ? "PUT"
        : "POST";

      const response = await authFetch(
        endpoint,
        {
          method,

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            name,
            date,
            location,
            entry_fee: entryFee,
            organizer_logo: organizerLogo,
            sponsors,
            sponsor_logo: sponsorLogo,
            participant_limit: useParticipantLimit
              ? Number(participantLimit)
              : null,
            pzss_license_calendar: canMarkPzssLicenseCalendar && pzssLicenseCalendar,
            requires_licensed_judge: canMarkPzssLicenseCalendar
              ? true
              : requiresLicensedJudge,
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
          const trapDiscipline = isClayDiscipline(discipline);
          const trapShotsCount = getTrapShotsCount(discipline);

          const disciplineResponse = await authFetch(
            disciplineEndpoint,
            {
              method: disciplineMethod,

              headers: {
                "Content-Type": "application/json",
              },

              body: JSON.stringify({
                name: discipline.name,
                description: discipline.description,
                discipline_type: discipline.discipline_type,
                shots_count: trapDiscipline
                  ? trapShotsCount
                  : discipline.shots_count,
                trap_variant: trapDiscipline
                  && discipline.discipline_type === "trap"
                  ? discipline.trap_variant
                  : "",
                trap_series_count: trapDiscipline
                  && discipline.discipline_type === "trap"
                  ? getTrapSeriesCount(discipline)
                  : 0,
                clay_variant: trapDiscipline ? discipline.trap_variant : "",
                clay_series_count: trapDiscipline ? getTrapSeriesCount(discipline) : 0,
                ammo_type: discipline.ammo_type,
                ammo_price: discipline.ammo_price,
                clay_price: trapDiscipline
                  ? discipline.clay_price
                  : "",
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

        {!showCreateForm && (
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
        )}

        {showCreateForm && (

          <div className="ui-block bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-10 shadow-2xl">

            <h2 className="text-3xl font-bold text-white mb-6">
              {editingCompetitionId
                ? "Edytuj zawody"
                : "Utwórz nowe zawody"}
            </h2>

            {!canManageDisciplines && (
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

              {!canMarkPzssLicenseCalendar && (
                <fieldset className="border border-zinc-700 bg-zinc-950 p-4 rounded-xl text-white">
                  <legend className="px-2 font-semibold">
                    Czy te zawody wymagają licencjonowanego sędziego PZSS? *
                  </legend>
                  <div className="mt-2 flex flex-wrap gap-6">
                    <label className="flex items-center gap-2 font-semibold">
                      <input
                        type="radio"
                        name="requires-licensed-judge"
                        checked={requiresLicensedJudge === true}
                        onChange={() => setRequiresLicensedJudge(true)}
                        className="h-5 w-5"
                      />
                      Tak
                    </label>
                    <label className="flex items-center gap-2 font-semibold">
                      <input
                        type="radio"
                        name="requires-licensed-judge"
                        checked={requiresLicensedJudge === false}
                        onChange={() => setRequiresLicensedJudge(false)}
                        className="h-5 w-5"
                      />
                      Nie
                    </label>
                  </div>
                </fieldset>
              )}

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

              {canMarkPzssLicenseCalendar && (
                <label className="flex items-center gap-3 border border-red-700 bg-red-950/30 p-4 rounded-xl text-white font-semibold">
                  <input
                    type="checkbox"
                    checked={pzssLicenseCalendar}
                    onChange={(event) => setPzssLicenseCalendar(event.target.checked)}
                    className="h-5 w-5"
                  />
                  Zawody z kalendarza PZSS do przedłużenia licencji
                </label>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <div className="border border-zinc-700 bg-zinc-950 rounded-2xl p-4">
                  <p className="text-white font-semibold mb-3">
                    Logo organizatora
                  </p>

                  <div className="relative h-28 rounded-xl border border-dashed border-zinc-600 bg-zinc-900 flex items-center justify-center overflow-hidden mb-3">
                    {organizerLogo ? (
                      <Image
                        src={organizerLogo}
                        alt="Logo organizatora"
                        fill
                        sizes="(min-width: 768px) 240px, 100vw"
                        className="object-contain p-2"
                        unoptimized
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

                  <div className="relative h-28 rounded-xl border border-dashed border-zinc-600 bg-zinc-900 flex items-center justify-center overflow-hidden mb-3">
                    {sponsorLogo ? (
                      <Image
                        src={sponsorLogo}
                        alt="Logo sponsora"
                        fill
                        sizes="(min-width: 768px) 240px, 100vw"
                        className="object-contain p-2"
                        unoptimized
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
                placeholder="Podaj koszt udziału w całych zawodach lub pozostaw puste, jeśli pobierasz opłatę za poszczególne konkurencje"
                value={entryFee}
                onChange={(e) => setEntryFee(e.target.value)}
                className="w-full border border-zinc-700 bg-zinc-800 p-4 rounded-xl text-white"
              />

            </div>

            {canManageDisciplines && (
              <div className="space-y-6">

                {disciplines.map((discipline, index) => {
                  const trapDiscipline = isClayDiscipline(discipline);
                  const trapTargetsCount = getTrapTargetsCount(discipline);
                  const trapShotsCount = getTrapShotsCount(discipline);

                  return (

                <div
                  key={index}
                  className="border border-zinc-700 rounded-2xl p-6 bg-zinc-950"
                >

                  <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-2xl font-bold text-white">
                      {discipline.id
                        ? `Konkurencja ${index + 1}`
                        : `Nowa konkurencja ${index - existingDisciplineCount + 1}`}
                    </h2>

                    <button
                      type="button"
                      onClick={() => handleDeleteDiscipline(discipline, index)}
                      disabled={deletingDisciplineId === discipline.id}
                      className="bg-red-700 hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl font-bold transition"
                    >
                      {deletingDisciplineId === discipline.id
                        ? "Usuwanie..."
                        : "Usuń konkurencję"}
                    </button>
                  </div>

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
                        Rodzaj konkurencji
                      </p>

                      <select
                        value={discipline.discipline_type}
                        onChange={(e) => {

                          const updated = [...disciplines];
                          const selectedDisciplineType = e.target.value;

                          updated[index].discipline_type = selectedDisciplineType;

                          if (!["trap", "skeet"].includes(selectedDisciplineType)) {
                            updated[index].trap_variant = "";
                            updated[index].trap_series_count = 0;
                            updated[index].clay_price = "";
                          } else {
                            updated[index].shots_count = 0;
                          }

                          setDisciplines(updated);

                        }}
                        className="w-full border border-zinc-700 bg-zinc-800 p-4 rounded-xl text-white"
                      >
                        <option value="" disabled>
                          Wybierz rodzaj konkurencji
                        </option>

                        {disciplineTypeGroups.map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.options.map((disciplineType) => (
                              <option key={disciplineType.value} value={disciplineType.value}>
                                {disciplineType.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    {trapDiscipline && (
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-white font-semibold mb-3">
                            wybierz wariant {discipline.discipline_type === "skeet" ? "Skeet" : "Trapa"}
                          </p>

                          <select
                            value={discipline.trap_variant}
                            onChange={(e) => {

                              const updated = [...disciplines];
                              const selectedTrapVariant = e.target.value;
                              const presetSeriesCount = getTrapPresetSeriesCount(discipline, selectedTrapVariant);

                              updated[index].trap_variant = selectedTrapVariant;
                              updated[index].trap_series_count = presetSeriesCount ?? 0;
                              updated[index].shots_count = presetSeriesCount
                                ? presetSeriesCount * trapTargetsPerSeries * (discipline.discipline_type === "skeet" ? 1 : trapShotsPerTarget)
                                : 0;

                              setDisciplines(updated);

                            }}
                            className="w-full border border-zinc-700 bg-zinc-800 p-4 rounded-xl text-white"
                          >
                            <option value="" disabled>
                              Wybierz wariant {discipline.discipline_type === "skeet" ? "Skeet" : "Trapa"}
                            </option>

                            {getClayVariantOptions(discipline).map((trapVariant) => (
                              <option key={trapVariant.value} value={trapVariant.value}>
                                {trapVariant.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {discipline.trap_variant === "manual" && (
                          <div>
                            <p className="text-white font-semibold mb-3">
                              Liczba serii
                            </p>

                            <input
                              type="number"
                              min="1"
                              step="1"
                              placeholder="Podaj liczbę serii"
                              value={
                                discipline.trap_series_count === 0
                                  ? ""
                                  : discipline.trap_series_count
                              }
                              onChange={(e) => {

                                const updated = [...disciplines];
                                const seriesCount = Number(e.target.value);

                                updated[index].trap_series_count = seriesCount;
                                updated[index].shots_count = seriesCount > 0
                                  ? seriesCount * trapTargetsPerSeries * (discipline.discipline_type === "skeet" ? 1 : trapShotsPerTarget)
                                  : 0;

                                setDisciplines(updated);

                              }}
                              className="w-full border border-zinc-700 bg-zinc-800 p-4 rounded-xl text-white"
                            />
                          </div>
                        )}

                        {trapShotsCount > 0 && (
                          <p className="md:col-span-2 text-sm text-gray-300">
                            Rzutki: {trapTargetsCount}, amunicja klubowa: {trapShotsCount} szt.
                          </p>
                        )}
                      </div>
                    )}

                    <div className={`grid gap-4 ${trapDiscipline ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
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

                      {trapDiscipline && (
                        <div>
                          <p className="text-white font-semibold mb-3">
                            Cena za 1 rzutek
                          </p>

                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Podaj cenę za 1 rzutek"
                            value={discipline.clay_price}
                            onChange={(e) => {

                              const updated = [...disciplines];

                              updated[index].clay_price = e.target.value;

                              setDisciplines(updated);

                            }}
                            className="w-full border border-zinc-700 bg-zinc-800 p-4 rounded-xl text-white"
                          />
                        </div>
                      )}
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

                      {!trapDiscipline && (
                        <>
                          <p className="text-white font-semibold mb-3">
                            Liczba wszystkich strzałów: ocenianych i próbnych
                          </p>

                          <input
                            type="number"
                            placeholder="Podaj liczbę wszystkich strzałów"
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
                        </>
                      )}

                    </div>

                  </div>

                </div>

                  );
                })}

              </div>
            )}

            {canManageDisciplines && (
              <button
                type="button"
                onClick={handleAddDiscipline}
                className="w-full mt-8 bg-blue-700 hover:bg-blue-600 text-white py-4 rounded-xl font-bold transition"
              >
                Dodaj Konkurencję
              </button>
            )}

            <button
              onClick={handleSaveCompetition}
              disabled={loading}
              className="w-full mt-4 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white py-4 rounded-xl font-bold transition"
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

        {!showCreateForm && (
          <>
            {message && (
              <div className="mb-4 rounded-xl border border-yellow-300 bg-yellow-50 px-4 py-3 font-semibold text-yellow-900 dark:border-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-100">
                {message}
              </div>
            )}

            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <input
                value={competitionNameFilter}
                onChange={(event) => setCompetitionNameFilter(event.target.value)}
                placeholder="Filtruj po nazwie zawodów"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-500 focus:border-green-700 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-gray-500 md:w-80"
              />

              <span className="ui-button w-full rounded-lg bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-800 dark:bg-zinc-800 dark:text-gray-200 md:w-auto">
                Data {activeTab === "history" ? "↓" : "↑"}
              </span>
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
                  <p>Nazwa zawodów</p>
                  <p>Data {activeTab === "history" ? "↓" : "↑"}</p>
                  <p>Lokalizacja</p>
                  <p aria-hidden="true" />
                </div>

                {visibleCompetitions.map((competition) => (
                  <div
                    key={competition.id}
                    className="relative isolate grid gap-4 overflow-hidden border-b border-zinc-200 px-4 py-4 text-sm last:border-b-0 dark:border-zinc-800 lg:grid-cols-[1.5fr_0.7fr_1fr_1.5fr] lg:items-center"
                  >
                    <div className="relative z-10 min-w-0">
                      <div className="mb-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-800">
                          {getCompetitionStatusLabel(competition.status)}
                        </span>

                        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700 dark:bg-zinc-800 dark:text-gray-200">
                          Dyscypliny: {competition.disciplines_count}
                        </span>

                        {competition.pzss_license_calendar && (
                          <span className="rounded-full bg-red-700 px-3 py-1 text-xs font-bold text-white">
                            Zawody z kalendarza PZSS do przedłużenia licencji
                          </span>
                        )}
                      </div>

                      <p className="truncate text-base font-bold text-zinc-950 dark:text-white">
                        {competition.name}
                      </p>

                      <p className="mt-1 text-xs text-zinc-600 dark:text-gray-400">
                        Zawodnicy: {competition.shooters_count || competition.participants?.length || 0}
                        {competition.participant_limit
                          ? `/${competition.participant_limit}`
                          : " / Bez limitu"}
                      </p>

                      {(competition.missing_judge_disciplines?.length || 0) > 0 && competition.status === "published" && (
                        <p className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                          Nie można rozpocząć zawodów: brak przypisanego sędziego dla konkurencji: {competition.missing_judge_disciplines?.join(", ")}. Przypisz sędziego w szczegółach zawodów.
                        </p>
                      )}

                      {(competition.organizer_full_name || competition.sponsors) && (
                        <p className="mt-1 truncate text-xs text-zinc-500 dark:text-gray-500">
                          {[competition.organizer_full_name, competition.sponsors ? `Sponsorzy: ${competition.sponsors}` : ""].filter(Boolean).join(" • ")}
                        </p>
                      )}
                    </div>

                    <p className="relative z-10 text-zinc-700 dark:text-gray-300">
                      {competition.date}
                    </p>

                    <p className="relative z-10 text-zinc-700 dark:text-gray-300">
                      {competition.location}
                    </p>

                    <div className="relative z-10 flex flex-wrap gap-2 lg:justify-end">
                      <button
                        type="button"
                        onClick={() => router.push(`/organizer/${competition.id}`)}
                        className="ui-button bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2 rounded-xl font-semibold"
                      >
                        Szczegóły
                      </button>

                      <button
                        type="button"
                        onClick={() => router.push(`/organizer/${competition.id}#judges`)}
                        className="ui-button bg-emerald-800 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-semibold"
                      >
                        Sędziowie
                      </button>

                      {competition.status === "draft" && (
                        <button
                          type="button"
                          onClick={() => handleEditCompetition(competition)}
                          className="ui-button bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-semibold"
                        >
                          Edytuj
                        </button>
                      )}

                      {competition.status === "draft" && (
                        <button
                          type="button"
                          onClick={() => handleTogglePublication(competition)}
                          className="ui-button bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-xl font-semibold"
                        >
                          Publikuj
                        </button>
                      )}

                      {competition.status === "published" && !hasJoinedCompetition(competition) && (
                        <button
                          type="button"
                          onClick={() => handleTogglePublication(competition)}
                          className="ui-button bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-xl font-semibold"
                        >
                          Cofnij Publikację
                        </button>
                      )}

                      {competition.status === "published" && (
                        <button
                          type="button"
                          onClick={() => handleStartCompetition(competition)}
                          disabled={
                            !isCompetitionDateReached(competition.date)
                            || (competition.missing_judge_disciplines?.length || 0) > 0
                          }
                          title={
                            (competition.missing_judge_disciplines?.length || 0) > 0
                              ? `Przypisz sędziego do: ${competition.missing_judge_disciplines?.join(", ")}`
                              : isCompetitionDateReached(competition.date)
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

                      {competition.status === "completed" ? (
                        <button
                          type="button"
                          onClick={() => handleDownloadResultsPdf(competition)}
                          disabled={resultsPdfDownloadingId === competition.id}
                          className="ui-button bg-blue-700 hover:bg-blue-600 disabled:bg-gray-500 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl font-semibold"
                        >
                          {resultsPdfDownloadingId === competition.id ? "Generuję..." : "PDF wyników"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDeleteCompetition(competition.id)}
                          disabled={competition.status === "started"}
                          className="ui-button bg-red-700 hover:bg-red-600 disabled:bg-gray-500 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl font-semibold"
                        >
                          Usuń
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

      </div>

      {premiumPublicationDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 py-6">
          <div className="w-full max-w-xl rounded-2xl border border-amber-500/70 bg-zinc-950 p-6 text-white shadow-2xl">
            <h2 className="text-2xl font-black text-amber-200">
              Limit opublikowanych zawodów
            </h2>

            <p className="mt-4 whitespace-pre-line text-base leading-7 text-gray-100">
              {premiumPublicationDialog}
            </p>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setPremiumPublicationDialog("")}
                className="ui-button rounded-xl bg-green-700 px-6 py-3 font-bold text-white transition hover:bg-green-600"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
