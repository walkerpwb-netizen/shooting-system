"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SocialMediaIcons from "@/components/SocialMediaIcons";
import { apiUrl } from "@/lib/api";
import { authFetch, getAuthSnapshot, isOrganizer, subscribeToAuthChange } from "@/lib/auth";
import {
  HUNTING_TRAP_SHOTS_COUNT,
  HUNTING_TRAP_TARGETS_COUNT,
  HUNTING_TRAP_VARIANT,
  POWER_FACTOR_OPTIONS,
  getDynamicDisciplineDivisions,
  isHuntingTrapDiscipline,
  isClayDisciplineType,
  isPracticalShotgunDisciplineType,
  isDynamicStageDisciplineType,
} from "@/lib/disciplines";

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
  pzss_license_calendar: boolean;
  requires_licensed_judge: boolean;
  club_discount_enabled: boolean;
  club_discount_scope: "competition" | "discipline";
  club_discount_amount: string;
  club_discount_clubs: string;
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
    fixed_power_factor: string;
    fixed_division: string;
    one_hand_bonus_enabled?: boolean;
    display_order?: number;
    stages?: DynamicStage[];
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
  fixed_power_factor: string;
  fixed_division: string;
  one_hand_bonus_enabled: boolean;
  display_order?: number;
  stages: DynamicStage[];
};

type CustomPenalty = {
  name: string;
  value: string;
};

type DynamicStage = {
  id?: number;
  stage_number: number;
  name: string;
  stage_type: string;
  briefing: string;
  notes: string;
  min_rounds: number;
  paper_targets: number;
  mini_paper_targets: number;
  classic_targets: number;
  paper_no_shoots: number;
  moving_targets: number;
  swingers: number;
  drop_turners: number;
  poppers: number;
  mini_poppers: number;
  plates: number;
  mini_plates: number;
  steel_no_shoots: number;
  popper_points: number;
  mini_popper_points: number;
  plate_points: number;
  mini_plate_points: number;
  penalty_miss: string;
  penalty_no_shoot: string;
  penalty_procedural: string;
  penalty_ftsa: string;
  penalty_extra_shot: string;
  penalty_extra_hit: string;
  custom_penalties: CustomPenalty[];
};

type OrganizerTab = "current" | "history";

const LeafletLocationPicker = dynamic(
  () => import("../components/LeafletLocationPicker"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-zinc-800 text-sm font-semibold text-gray-300">
        Ładowanie mapy...
      </div>
    ),
  }
);

const disciplineTypeGroups = [
  {
    label: "Konkurencje pistoletowe i rewolwerowe",
    options: [
      { value: "pistol-air-10m", label: "Pistolet pneumatyczny 10 m (Ppn)" },
      { value: "pistol-sport-25m", label: "Pistolet sportowy 25 m (Psp)" },
      { value: "pistol-rapid-fire-25m", label: "Pistolet szybkostrzelny 25 m (Psz)" },
      { value: "pistol-free-50m", label: "Pistolet dowolny 50 m (Pdw)" },
      { value: "pistol-center-fire-25m", label: "Pistolet centralnego zapłonu 25 m (Pcz)" },
      { value: "pistol-rimfire-25m", label: "Pistolet bocznego zapłonu 25 m" },
      { value: "pistol-rimfire-10m", label: "Pistolet bocznego zapłonu 10 m" },
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
      { value: "ipsc-rifle", label: "IPSC Rifle" },
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

const temporarilyUnsupportedDisciplineTypes = new Set([
  "double-trap",
  "trap-mix",
  "skeet-mix",
  "sporting-clays",
  "cowboy-action-shooting",
]);

function hasText(value: string) {
  return Boolean(value.trim());
}

function isPositiveNumber(value: string | number) {
  return hasText(String(value)) && Number(value) > 0;
}

function isNonNegativeNumber(value: string) {
  return hasText(value) && Number(value) >= 0;
}

function isNonNegativeWholeNumber(value: string | number) {
  const normalizedValue = String(value);
  return hasText(normalizedValue)
    && Number(normalizedValue) >= 0
    && Number.isInteger(Number(normalizedValue));
}

function requiredFieldClass(isValid: boolean) {
  return `w-full border bg-zinc-800 p-4 rounded-xl text-white outline-none transition focus:ring-2 ${
    isValid
      ? "border-emerald-500 focus:border-emerald-400 focus:ring-emerald-500/30"
      : "border-red-500 focus:border-red-400 focus:ring-red-500/30"
  }`;
}

function optionalNumberFieldClass(value: string) {
  if (!hasText(value)) {
    return "w-full border border-zinc-700 bg-zinc-800 p-4 rounded-xl text-white outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/20";
  }

  return requiredFieldClass(isNonNegativeNumber(value));
}

function requiredContainerClass(isValid: boolean) {
  return `border p-4 rounded-xl text-white transition ${
    isValid
      ? "border-emerald-500 bg-emerald-950/20"
      : "border-red-500 bg-red-950/20"
  }`;
}

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
  { value: HUNTING_TRAP_VARIANT, label: "Trap Myśliwski 20", seriesCount: 1 },
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
  return isClayDisciplineType(discipline.discipline_type);
}

function isPracticalShotgunDiscipline(discipline: Discipline) {
  return isPracticalShotgunDisciplineType(discipline.discipline_type);
}

function isDynamicStageDiscipline(discipline: Discipline) {
  return isDynamicStageDisciplineType(discipline.discipline_type);
}

function createBlankStage(stageNumber: number, source?: DynamicStage): DynamicStage {
  return {
    id: undefined,
    stage_number: stageNumber,
    name: source?.name || `Stage ${stageNumber}`,
    stage_type: source?.stage_type || "short",
    briefing: source?.briefing || "",
    notes: source?.notes || "",
    min_rounds: source?.min_rounds || 0,
    paper_targets: source?.paper_targets || 0,
    mini_paper_targets: source?.mini_paper_targets || 0,
    classic_targets: source?.classic_targets || 0,
    paper_no_shoots: source?.paper_no_shoots || 0,
    moving_targets: source?.moving_targets || 0,
    swingers: source?.swingers || 0,
    drop_turners: source?.drop_turners || 0,
    poppers: source?.poppers || 0,
    mini_poppers: source?.mini_poppers || 0,
    plates: source?.plates || 0,
    mini_plates: source?.mini_plates || 0,
    steel_no_shoots: source?.steel_no_shoots || 0,
    popper_points: source?.popper_points ?? 5,
    mini_popper_points: source?.mini_popper_points ?? 5,
    plate_points: source?.plate_points ?? 5,
    mini_plate_points: source?.mini_plate_points ?? 5,
    penalty_miss: source?.penalty_miss || "-10",
    penalty_no_shoot: source?.penalty_no_shoot || "-10",
    penalty_procedural: source?.penalty_procedural || "-10",
    penalty_ftsa: source?.penalty_ftsa || "-10",
    penalty_extra_shot: source?.penalty_extra_shot || "-10",
    penalty_extra_hit: source?.penalty_extra_hit || "-10",
    custom_penalties: source?.custom_penalties?.length
      ? source.custom_penalties.map((penalty) => ({ ...penalty }))
      : [{ name: "", value: "-10" }],
  };
}

function stagePaperTargets(stage: DynamicStage) {
  return (
    Number(stage.paper_targets || 0)
    + Number(stage.mini_paper_targets || 0)
    + Number(stage.classic_targets || 0)
    + Number(stage.moving_targets || 0)
    + Number(stage.swingers || 0)
    + Number(stage.drop_turners || 0)
  );
}

export default function OrganizerPage() {
  return (
    <Suspense fallback={null}>
      <OrganizerContent />
    </Suspense>
  );
}

function stageSteelTargets(stage: DynamicStage) {
  return (
    Number(stage.poppers || 0)
    + Number(stage.mini_poppers || 0)
    + Number(stage.plates || 0)
    + Number(stage.mini_plates || 0)
  );
}

function stageRequiredPaperHits(stage: DynamicStage) {
  return stagePaperTargets(stage) * 2;
}

function stageComputedMinRounds(stage: DynamicStage) {
  return stageRequiredPaperHits(stage) + stageSteelTargets(stage);
}

function stageMaxPoints(stage: DynamicStage) {
  return (
    stageRequiredPaperHits(stage) * 5
    + Number(stage.poppers || 0) * Number(stage.popper_points ?? 5)
    + Number(stage.mini_poppers || 0) * Number(stage.mini_popper_points ?? 5)
    + Number(stage.plates || 0) * Number(stage.plate_points ?? 5)
    + Number(stage.mini_plates || 0) * Number(stage.mini_plate_points ?? 5)
  );
}

function stageTargetsCount(stage: DynamicStage) {
  return stagePaperTargets(stage) + stageSteelTargets(stage);
}

function stageHasScoredTarget(stage: DynamicStage) {
  return stageTargetsCount(stage) > 0;
}

const stageTypeOptions = [
  { value: "short", label: "Short Course", title: "Krótki tor, zwykle niższa liczba strzałów i prostszy plan." },
  { value: "medium", label: "Medium Course", title: "Średni tor z większą liczbą celów i wariantów rozwiązania." },
  { value: "long", label: "Long Course", title: "Długi tor, zwykle najbardziej rozbudowany przebieg Stage." },
  { value: "classifier", label: "Classifier", title: "Tor klasyfikacyjny używany do porównywania umiejętności." },
  { value: "other", label: "Inny", title: "Niestandardowy tor opisany przez organizatora." },
];

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
  if (isHuntingTrapDiscipline(discipline)) {
    return HUNTING_TRAP_TARGETS_COUNT;
  }

  return getTrapSeriesCount(discipline) * trapTargetsPerSeries;
}

function getTrapShotsCount(discipline: Discipline) {
  if (isHuntingTrapDiscipline(discipline)) {
    return HUNTING_TRAP_SHOTS_COUNT;
  }

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

function OrganizerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const adminClubId = searchParams.get("admin_club_id") || "";
  const adminClubQuery = adminClubId
    ? `?admin_club_id=${encodeURIComponent(adminClubId)}`
    : "";

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [activeTab, setActiveTab] = useState<OrganizerTab>("current");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locatingMapPosition, setLocatingMapPosition] = useState(false);
  const [mapLocationMessage, setMapLocationMessage] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [organizerLogo, setOrganizerLogo] = useState("");
  const [sponsors, setSponsors] = useState("");
  const [sponsorLogo, setSponsorLogo] = useState("");
  const [useParticipantLimit, setUseParticipantLimit] = useState(false);
  const [participantLimit, setParticipantLimit] = useState("");
  const [pzssLicenseCalendar, setPzssLicenseCalendar] = useState(false);
  const [requiresLicensedJudge, setRequiresLicensedJudge] = useState<boolean | null>(null);
  const [clubDiscountEnabled, setClubDiscountEnabled] = useState(false);
  const [clubDiscountScope, setClubDiscountScope] = useState<"competition" | "discipline">("competition");
  const [clubDiscountAmount, setClubDiscountAmount] = useState("");
  const [clubDiscountClubs, setClubDiscountClubs] = useState("");
  const [message, setMessage] = useState("");
  const [premiumPublicationDialog, setPremiumPublicationDialog] = useState("");
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [loading, setLoading] = useState(false);
  const [resultsPdfDownloadingId, setResultsPdfDownloadingId] = useState<number | null>(null);
  const [pzssPdfDownloadingId, setPzssPdfDownloadingId] = useState<number | null>(null);
  const [copyDialogCompetition, setCopyDialogCompetition] = useState<Competition | null>(null);
  const [copyingCompetitionId, setCopyingCompetitionId] = useState<number | null>(null);
  const [editingCompetitionId, setEditingCompetitionId] = useState<number | null>(null);
  const [editingCompetitionStatus, setEditingCompetitionStatus] = useState("");
  const [deletingDisciplineId, setDeletingDisciplineId] = useState<number | null>(null);
  const [competitionNameFilter, setCompetitionNameFilter] = useState("");
  const [showDisciplineContact, setShowDisciplineContact] = useState(false);
  const canManageDisciplines = !editingCompetitionId || editingCompetitionStatus === "draft";
  const authSnapshot = useSyncExternalStore(
    subscribeToAuthChange,
    getAuthSnapshot,
    () => ""
  );
  const [, , , , accountType, pzssClubStatus] = authSnapshot.split("|");
  const canMarkPzssLicenseCalendar = Boolean(adminClubId)
    || (accountType === "pzss_club" && pzssClubStatus === "approved");
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

  const organizerApiUrl = useCallback((path: string) => {
    if (!adminClubId) {
      return apiUrl(path);
    }

    const url = new URL(apiUrl(path));
    url.searchParams.set("admin_club_id", adminClubId);

    return url.toString();
  }, [adminClubId]);

  function resetForm() {
    setName("");
    setDate("");
    setLocation("");
    setLatitude(null);
    setLongitude(null);
    setLocatingMapPosition(false);
    setMapLocationMessage("");
    setEntryFee("");
    setOrganizerLogo("");
    setSponsors("");
    setSponsorLogo("");
    setUseParticipantLimit(false);
    setParticipantLimit("");
    setPzssLicenseCalendar(false);
    setRequiresLicensedJudge(null);
    setClubDiscountEnabled(false);
    setClubDiscountScope("competition");
    setClubDiscountAmount("");
    setClubDiscountClubs("");
    setDisciplines([]);
    setEditingCompetitionId(null);
    setEditingCompetitionStatus("");
    setDeletingDisciplineId(null);
    setShowDisciplineContact(false);
    setMessage("");
  }

  function handleLocateMapPosition() {
    if (!navigator.geolocation) {
      setMapLocationMessage("Lokalizacja nie jest dostępna w tej przeglądarce.");
      return;
    }

    setLocatingMapPosition(true);
    setMapLocationMessage("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(Number(position.coords.latitude.toFixed(6)));
        setLongitude(Number(position.coords.longitude.toFixed(6)));
        setMapLocationMessage("Ustawiono lokalizację z przeglądarki.");
        setLocatingMapPosition(false);
      },
      () => {
        setMapLocationMessage("Nie udało się pobrać lokalizacji.");
        setLocatingMapPosition(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60000,
        timeout: 10000,
      }
    );
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
      fixed_power_factor: "",
      fixed_division: "",
      one_hand_bonus_enabled: false,
      display_order: 0,
      stages: [],
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

  function moveDiscipline(index: number, direction: -1 | 1) {
    if (!canManageDisciplines) {
      setMessage("Kolejność konkurencji można zmieniać tylko przed publikacją zawodów ❌");
      return;
    }

    setDisciplines((currentDisciplines) => {
      const nextIndex = index + direction;

      if (nextIndex < 0 || nextIndex >= currentDisciplines.length) {
        return currentDisciplines;
      }

      const updatedDisciplines = [...currentDisciplines];
      const [movedDiscipline] = updatedDisciplines.splice(index, 1);
      updatedDisciplines.splice(nextIndex, 0, movedDiscipline);

      return updatedDisciplines.map((discipline, displayIndex) => ({
        ...discipline,
        display_order: displayIndex,
      }));
    });
  }

  async function fetchOrganizerCompetitions() {
    try {
      const response = await authFetch(organizerApiUrl("/my-competitions"));

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

  useEffect(() => {
    if (!isOrganizer()) {
      router.push("/");
      return;
    }

    let ignore = false;

    async function loadCompetitions() {
      try {
        const response = await authFetch(organizerApiUrl("/my-competitions"));
        const data = await response.json();

        if (ignore) {
          return;
        }

        if (!response.ok) {
          setMessage(data.detail || "Nie udało się pobrać zawodów ❌");
          return;
        }

        setCompetitions(data);
      } catch (error) {
        console.error(error);
      }
    }

    void loadCompetitions();

    return () => {
      ignore = true;
    };
  }, [organizerApiUrl, router]);

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

  async function handleDownloadPzssCommuniquesPdf(competition: Competition) {
    try {
      setMessage("");
      setPzssPdfDownloadingId(competition.id);

      const response = await authFetch(apiUrl(`/organizer/competitions/${competition.id}/pzss-communiques.pdf`));

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setMessage(data?.detail || "Nie udało się wygenerować komunikatów dla PZSS ❌");
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
      link.download = `komunikaty-dla-pzss-${competition.id}-${safeName}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(fileUrl);
      setMessage("Komunikaty dla PZSS wygenerowane ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setPzssPdfDownloadingId(null);
    }
  }

  async function handleCopyCompetition() {
    if (!copyDialogCompetition) {
      return;
    }

    try {
      setMessage("");
      setCopyingCompetitionId(copyDialogCompetition.id);

      const response = await authFetch(
        organizerApiUrl(`/organizer/competitions/${copyDialogCompetition.id}/copy`),
        {
          method: "POST",
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się skopiować zawodów ❌");
        return;
      }

      setCopyDialogCompetition(null);
      setActiveTab("current");
      setMessage("Zawody skopiowane jako szkic ✅");
      fetchOrganizerCompetitions();
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setCopyingCompetitionId(null);
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
        organizerApiUrl(`/competitions/${competitionId}`),
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
        organizerApiUrl(`/competitions/${competitionId}/publish`),
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
        organizerApiUrl(`/competitions/${competitionId}/unpublish`),
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
        organizerApiUrl(`/competitions/${competition.id}/start`),
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
        organizerApiUrl(`/competitions/${competition.id}/finish`),
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
      setLatitude(competitionDetails.latitude ?? null);
      setLongitude(competitionDetails.longitude ?? null);
      setEntryFee(competitionDetails.entry_fee || "");
      setOrganizerLogo(competitionDetails.organizer_logo || "");
      setSponsors(competitionDetails.sponsors || "");
      setSponsorLogo(competitionDetails.sponsor_logo || "");
      setUseParticipantLimit(Boolean(competitionDetails.participant_limit));
      setPzssLicenseCalendar(Boolean(competitionDetails.pzss_license_calendar));
      setRequiresLicensedJudge(Boolean(competitionDetails.requires_licensed_judge));
      setClubDiscountEnabled(Boolean(competitionDetails.club_discount_enabled));
      setClubDiscountScope(
        competitionDetails.club_discount_scope === "discipline"
          ? "discipline"
          : "competition"
      );
      setClubDiscountAmount(competitionDetails.club_discount_amount || "");
      setClubDiscountClubs(competitionDetails.club_discount_clubs || "");
      setParticipantLimit(
        competitionDetails.participant_limit
          ? String(competitionDetails.participant_limit)
          : ""
      );
      setEditingCompetitionStatus(competitionDetails.status);
      setDisciplines(
        (competitionDetails.disciplines || [])
        .slice()
        .sort((firstDiscipline, secondDiscipline) =>
          (firstDiscipline.display_order ?? firstDiscipline.id ?? 0)
          - (secondDiscipline.display_order ?? secondDiscipline.id ?? 0)
        )
        .map((discipline, disciplineIndex) => ({
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
          fixed_power_factor: discipline.fixed_power_factor || "",
          fixed_division: discipline.fixed_division || "",
          one_hand_bonus_enabled: Boolean(discipline.one_hand_bonus_enabled),
          display_order: discipline.display_order ?? disciplineIndex,
          stages: (discipline.stages || []).map((stage, stageIndex) => createBlankStage(stage.stage_number || stageIndex + 1, stage)),
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
        organizerApiUrl(`/competitions/${editingCompetitionId}/disciplines/${discipline.id}`),
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

  function updateStageField<Field extends keyof DynamicStage>(
    disciplineIndex: number,
    stageIndex: number,
    field: Field,
    value: DynamicStage[Field]
  ) {
    setDisciplines((currentDisciplines) =>
      currentDisciplines.map((discipline, currentDisciplineIndex) => {
        if (currentDisciplineIndex !== disciplineIndex) {
          return discipline;
        }

        return {
          ...discipline,
          stages: discipline.stages.map((stage, currentStageIndex) =>
            currentStageIndex === stageIndex
              ? { ...stage, [field]: value }
              : stage
          ),
        };
      })
    );
  }

  function updateStageCount(disciplineIndex: number, value: string) {
    const nextCount = Math.max(Number(value || 0), 0);

    setDisciplines((currentDisciplines) =>
      currentDisciplines.map((discipline, currentDisciplineIndex) => {
        if (currentDisciplineIndex !== disciplineIndex) {
          return discipline;
        }

        if (nextCount < discipline.stages.length) {
          const confirmed = window.confirm(
            "Zmniejszenie liczby Stage usunie końcowe tory z formularza. Kontynuować?"
          );

          if (!confirmed) {
            return discipline;
          }
        }

        const stages = discipline.stages.slice(0, nextCount);

        while (stages.length < nextCount) {
          stages.push(createBlankStage(stages.length + 1, stages[stages.length - 1]));
        }

        return {
          ...discipline,
          stages: stages.map((stage, stageIndex) => ({
            ...stage,
            stage_number: stageIndex + 1,
            name: stage.name || `Stage ${stageIndex + 1}`,
          })),
        };
      })
    );
  }

  function copyPreviousStage(disciplineIndex: number, stageIndex: number) {
    if (stageIndex <= 0) {
      return;
    }

    setDisciplines((currentDisciplines) =>
      currentDisciplines.map((discipline, currentDisciplineIndex) => {
        if (currentDisciplineIndex !== disciplineIndex) {
          return discipline;
        }

        return {
          ...discipline,
          stages: discipline.stages.map((stage, currentStageIndex) =>
            currentStageIndex === stageIndex
              ? createBlankStage(stageIndex + 1, discipline.stages[stageIndex - 1])
              : stage
          ),
        };
      })
    );
  }

  function duplicateStage(disciplineIndex: number, stageIndex: number) {
    setDisciplines((currentDisciplines) =>
      currentDisciplines.map((discipline, currentDisciplineIndex) => {
        if (currentDisciplineIndex !== disciplineIndex) {
          return discipline;
        }

        const stages = [...discipline.stages];
        stages.splice(stageIndex + 1, 0, createBlankStage(stageIndex + 2, discipline.stages[stageIndex]));

        return {
          ...discipline,
          stages: stages.map((stage, currentStageIndex) => ({
            ...stage,
            id: currentStageIndex === stageIndex + 1 ? undefined : stage.id,
            stage_number: currentStageIndex + 1,
            name: currentStageIndex === stageIndex + 1
              ? `${stage.name} kopia`
              : stage.name,
          })),
        };
      })
    );
  }

  function removeStage(disciplineIndex: number, stageIndex: number) {
    const confirmed = window.confirm("Usunąć ten Stage z konfiguracji?");

    if (!confirmed) {
      return;
    }

    setDisciplines((currentDisciplines) =>
      currentDisciplines.map((discipline, currentDisciplineIndex) => {
        if (currentDisciplineIndex !== disciplineIndex) {
          return discipline;
        }

        return {
          ...discipline,
          stages: discipline.stages
            .filter((_stage, currentStageIndex) => currentStageIndex !== stageIndex)
            .map((stage, currentStageIndex) => ({
              ...stage,
              stage_number: currentStageIndex + 1,
            })),
        };
      })
    );
  }

  function getFirstInvalidFieldId() {
    if (!hasText(name)) {
      return "competition-name";
    }

    if (!hasText(date)) {
      return "competition-date";
    }

    if (!hasText(location)) {
      return "competition-location";
    }

    if (!canMarkPzssLicenseCalendar && requiresLicensedJudge === null) {
      return "competition-requires-licensed-judge-yes";
    }

    if (useParticipantLimit && !isPositiveNumber(participantLimit)) {
      return "competition-participant-limit";
    }

    if (hasText(entryFee) && !isNonNegativeNumber(entryFee)) {
      return "competition-entry-fee";
    }

    if (clubDiscountEnabled && !isPositiveNumber(clubDiscountAmount)) {
      return "competition-club-discount-amount";
    }

    if (clubDiscountEnabled && !hasText(clubDiscountClubs)) {
      return "competition-club-discount-clubs";
    }

    for (let index = 0; index < disciplines.length; index += 1) {
      const discipline = disciplines[index];
      const clayDiscipline = isClayDiscipline(discipline);
      const dynamicStageDiscipline = isDynamicStageDiscipline(discipline);
      const practicalShotgunDiscipline = isPracticalShotgunDiscipline(discipline);

      if (!hasText(discipline.name)) {
        return `discipline-${index}-name`;
      }

      if (!hasText(discipline.discipline_type)) {
        return `discipline-${index}-type`;
      }

      if (clayDiscipline && !hasText(discipline.trap_variant)) {
        return `discipline-${index}-variant`;
      }

      if (
        clayDiscipline
        && discipline.trap_variant === "manual"
        && !isPositiveNumber(discipline.trap_series_count)
      ) {
        return `discipline-${index}-series`;
      }

      if (!hasText(discipline.ammo_type)) {
        return `discipline-${index}-ammo-type`;
      }

      if (!isNonNegativeNumber(discipline.ammo_price)) {
        return `discipline-${index}-ammo-price`;
      }

      if (clayDiscipline && !isNonNegativeNumber(discipline.clay_price)) {
        return `discipline-${index}-clay-price`;
      }

      if (dynamicStageDiscipline && discipline.stages.length <= 0) {
        return `discipline-${index}-stage-count`;
      }

      for (let stageIndex = 0; stageIndex < discipline.stages.length; stageIndex += 1) {
        const stage = discipline.stages[stageIndex];

        if (!hasText(stage.name)) {
          return `discipline-${index}-stage-${stageIndex}-name`;
        }

        if (!stageHasScoredTarget(stage)) {
          return `discipline-${index}-stage-${stageIndex}-paper-targets`;
        }
      }

      if (!dynamicStageDiscipline && practicalShotgunDiscipline && !isPositiveNumber(discipline.shots_count)) {
        return `discipline-${index}-targets`;
      }

      if (
        !dynamicStageDiscipline
        && practicalShotgunDiscipline
        && !isNonNegativeWholeNumber(discipline.trap_series_count)
      ) {
        return `discipline-${index}-time-limit`;
      }

      if (!hasText(entryFee) && !isNonNegativeNumber(discipline.entry_fee)) {
        return `discipline-${index}-entry-fee`;
      }

      if (!clayDiscipline && !dynamicStageDiscipline && !practicalShotgunDiscipline && !isPositiveNumber(discipline.shots_count)) {
        return `discipline-${index}-shots`;
      }
    }

    return "";
  }

  function focusInvalidField(fieldId: string) {
    window.requestAnimationFrame(() => {
      const field = document.getElementById(fieldId);

      if (!field) {
        return;
      }

      field.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      window.setTimeout(() => {
        field.focus({ preventScroll: true });
      }, 350);
    });
  }

  async function handleSaveCompetition() {
    setMessage("");

    const firstInvalidFieldId = getFirstInvalidFieldId();

    if (firstInvalidFieldId) {
      setMessage("Uzupełnij pole podświetlone na czerwono ❌");
      focusInvalidField(firstInvalidFieldId);
      return;
    }

    try {
      setLoading(true);

      const endpoint = editingCompetitionId
        ? organizerApiUrl(`/competitions/${editingCompetitionId}`)
        : organizerApiUrl("/competitions");

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
            latitude,
            longitude,
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
            club_discount_enabled: clubDiscountEnabled,
            club_discount_scope: clubDiscountScope,
            club_discount_amount: clubDiscountEnabled
              ? clubDiscountAmount
              : "",
            club_discount_clubs: clubDiscountEnabled
              ? clubDiscountClubs
              : "",
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
        for (const [disciplineIndex, discipline] of disciplines.entries()) {
          const disciplineEndpoint = discipline.id
            ? organizerApiUrl(`/competitions/${competitionId}/disciplines/${discipline.id}`)
            : organizerApiUrl(`/competitions/${competitionId}/disciplines`);
          const disciplineMethod = discipline.id
            ? "PUT"
            : "POST";
          const trapDiscipline = isClayDiscipline(discipline);
          const dynamicStageDiscipline = isDynamicStageDiscipline(discipline);
          const practicalShotgunDiscipline = isPracticalShotgunDiscipline(discipline);
          const trapShotsCount = getTrapShotsCount(discipline);
          const dynamicShotsCount = dynamicStageDiscipline
            ? discipline.stages.reduce((sum, stage) => sum + (stage.min_rounds || stageComputedMinRounds(stage)), 0)
            : 0;

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
                  : dynamicStageDiscipline
                  ? dynamicShotsCount
                  : discipline.shots_count,
                trap_variant: trapDiscipline
                  && discipline.discipline_type === "trap"
                  ? discipline.trap_variant
                  : "",
                trap_series_count: practicalShotgunDiscipline
                  && !dynamicStageDiscipline
                  ? Math.max(Number(discipline.trap_series_count || 0), 0)
                  : trapDiscipline
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
                fixed_power_factor: dynamicStageDiscipline
                  ? discipline.fixed_power_factor
                  : "",
                fixed_division: dynamicStageDiscipline
                  ? discipline.fixed_division
                  : "",
                one_hand_bonus_enabled: (
                  !trapDiscipline
                  && !dynamicStageDiscipline
                  && !practicalShotgunDiscipline
                  && discipline.one_hand_bonus_enabled
                ),
                display_order: disciplineIndex,
                stages: dynamicStageDiscipline
                  ? discipline.stages.map((stage, stageIndex) => ({
                      ...stage,
                      stage_number: stageIndex + 1,
                      min_rounds: stage.min_rounds || stageComputedMinRounds(stage),
                      custom_penalties: stage.custom_penalties.filter((penalty) =>
                        hasText(penalty.name)
                      ),
                    }))
                  : [],
              }),
            }
          );

          if (!disciplineResponse.ok) {
            const disciplineData = await disciplineResponse.json().catch(() => null);
            setMessage(
              disciplineData?.detail
                ? `Zawody zapisane, ale nie udało się zapisać konkurencji: ${disciplineData.detail} ❌`
                : "Zawody zapisane, ale nie udało się zapisać konkurencji ❌"
            );
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

          <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
            {adminClubId && (
              <button
                type="button"
                onClick={() => router.push("/admin?tab=pzss-clubs")}
                className="ui-button w-full md:w-auto bg-zinc-700 hover:bg-zinc-600 text-white px-6 py-4 rounded-2xl font-bold transition"
              >
                Wróć do klubów PZSS
              </button>
            )}

            <button
              type="button"
              onClick={handleToggleForm}
              className="ui-button w-full md:w-auto bg-green-700 hover:bg-green-600 text-white px-6 py-4 rounded-2xl font-bold transition"
            >
              {showCreateForm
                ? "Zamknij"
                : "Nowe zawody"}
            </button>
          </div>

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
                id="competition-name"
                type="text"
                placeholder="Nazwa zawodów *"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={!hasText(name)}
                required
                className={requiredFieldClass(hasText(name))}
              />

              <input
                id="competition-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Data zawodów"
                aria-invalid={!hasText(date)}
                required
                className={requiredFieldClass(hasText(date))}
              />

              <input
                id="competition-location"
                type="text"
                placeholder="Podaj nazwę Strzelnicy gdzie odbywają się zawody *"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                aria-invalid={!hasText(location)}
                required
                className={requiredFieldClass(hasText(location))}
              />

              <section className="rounded-xl border border-zinc-700 bg-zinc-950/40 p-4 text-white">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-lg font-bold">
                      Dokładna lokalizacja wydarzenia
                    </h3>
                    <p className="mt-1 text-sm text-gray-400">
                      Podanie dokładnej lokalizacji wydarzenia może zwiększyć liczbę zainteresowanych strzelców.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 md:ml-auto md:justify-end">
                    <button
                      type="button"
                      onClick={handleLocateMapPosition}
                      disabled={locatingMapPosition}
                      className="ui-button rounded-lg bg-white px-4 py-2 text-sm font-bold text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-wait disabled:opacity-70"
                    >
                      {locatingMapPosition ? "Lokalizuję..." : "Zlokalizuj mnie"}
                    </button>

                    {latitude !== null && longitude !== null && (
                      <button
                        type="button"
                        onClick={() => {
                          setLatitude(null);
                          setLongitude(null);
                          setMapLocationMessage("");
                        }}
                        className="ui-button rounded-lg border border-zinc-600 px-4 py-2 text-sm font-bold text-gray-200 transition hover:border-red-500 hover:text-red-200"
                      >
                        Usuń lokalizację
                      </button>
                    )}
                  </div>
                </div>

                <div className="h-80 overflow-hidden rounded-xl border border-zinc-700">
                  <LeafletLocationPicker
                    latitude={latitude}
                    longitude={longitude}
                    onChange={(nextLocation) => {
                      setLatitude(nextLocation.latitude);
                      setLongitude(nextLocation.longitude);
                    }}
                  />
                </div>

                <div className="mt-3 flex flex-col gap-1 text-sm text-gray-400 md:flex-row md:items-center md:justify-between">
                  <span>
                    {latitude !== null && longitude !== null
                      ? mapLocationMessage || "Lokalizacja mapowa ustawiona."
                      : mapLocationMessage || "Brak zaznaczonej lokalizacji mapowej."}
                  </span>
                  {latitude !== null && longitude !== null && (
                    <span className="font-semibold text-gray-300">
                      {latitude.toFixed(6)}, {longitude.toFixed(6)}
                    </span>
                  )}
                </div>
              </section>

              {!canMarkPzssLicenseCalendar && (
                <fieldset className={requiredContainerClass(requiresLicensedJudge !== null)}>
                  <legend className="px-2 font-semibold">
                    Czy te zawody wymagają licencjonowanego sędziego PZSS? *
                  </legend>
                  <div className="mt-2 flex flex-wrap gap-6">
                    <label className="flex items-center gap-2 font-semibold">
                      <input
                        id="competition-requires-licensed-judge-yes"
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
                        id="competition-requires-licensed-judge-no"
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
                  id="competition-participant-limit"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Maksymalna liczba zawodników *"
                  value={participantLimit}
                  onChange={(e) => setParticipantLimit(e.target.value)}
                  aria-invalid={!isPositiveNumber(participantLimit)}
                  required
                  className={requiredFieldClass(isPositiveNumber(participantLimit))}
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
                id="competition-entry-fee"
                type="number"
                step="0.01"
                min="0"
                placeholder="Podaj koszt udziału w całych zawodach lub pozostaw puste, jeśli pobierasz opłatę za poszczególne konkurencje"
                value={entryFee}
                onChange={(e) => setEntryFee(e.target.value)}
                className={optionalNumberFieldClass(entryFee)}
              />

              <section className="rounded-xl border border-zinc-700 bg-zinc-950 p-4 text-white">
                <label className="flex items-start gap-3 font-semibold">
                  <input
                    type="checkbox"
                    checked={clubDiscountEnabled}
                    onChange={(event) => {
                      setClubDiscountEnabled(event.target.checked);

                      if (!event.target.checked) {
                        setClubDiscountScope("competition");
                        setClubDiscountAmount("");
                        setClubDiscountClubs("");
                      }
                    }}
                    className="mt-1 h-5 w-5"
                  />
                  <span>
                    <span className="block">Zniżka klubowa dla wybranych klubów</span>
                    <span className="mt-1 block text-sm font-normal text-gray-400">
                      Wpisz nazwę klubu lub kilka klubów po przecinku, dla których system naliczy zniżkę.
                    </span>
                  </span>
                </label>

                {clubDiscountEnabled && (
                  <div className="mt-4 space-y-4">
                    <label className="block">
                      <span className="mb-2 block text-sm font-bold text-gray-200">
                        Kluby objęte zniżką *
                      </span>
                      <input
                        id="competition-club-discount-clubs"
                        type="text"
                        placeholder="np. KŻR Warka, Klub Strzelecki Alfa"
                        value={clubDiscountClubs}
                        onChange={(event) => setClubDiscountClubs(event.target.value)}
                        aria-invalid={!hasText(clubDiscountClubs)}
                        className={requiredFieldClass(hasText(clubDiscountClubs))}
                      />
                    </label>

                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                      <fieldset className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4">
                        <legend className="px-2 text-sm font-bold text-gray-200">
                          Sposób naliczania
                        </legend>
                        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                          <label className="flex items-center gap-2 font-semibold text-gray-200">
                            <input
                              type="radio"
                              name="club-discount-scope"
                              checked={clubDiscountScope === "competition"}
                              onChange={() => setClubDiscountScope("competition")}
                              className="h-5 w-5"
                            />
                            Za całe zawody
                          </label>
                          <label className="flex items-center gap-2 font-semibold text-gray-200">
                            <input
                              type="radio"
                              name="club-discount-scope"
                              checked={clubDiscountScope === "discipline"}
                              onChange={() => setClubDiscountScope("discipline")}
                              className="h-5 w-5"
                            />
                            Za każdą konkurencję
                          </label>
                        </div>
                      </fieldset>

                      <label className="block">
                        <span className="mb-2 block text-sm font-bold text-gray-200">
                          Kwota zniżki *
                        </span>
                        <input
                          id="competition-club-discount-amount"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="np. 10"
                          value={clubDiscountAmount}
                          onChange={(event) => setClubDiscountAmount(event.target.value)}
                          aria-invalid={!isPositiveNumber(clubDiscountAmount)}
                          className={requiredFieldClass(isPositiveNumber(clubDiscountAmount))}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </section>

            </div>

            {canManageDisciplines && (
              <div className="space-y-6">

                {disciplines.map((discipline, index) => {
                  const trapDiscipline = isClayDiscipline(discipline);
                  const dynamicStageDiscipline = isDynamicStageDiscipline(discipline);
                  const practicalShotgunDiscipline = isPracticalShotgunDiscipline(discipline);
                  const dynamicDivisionOptions = getDynamicDisciplineDivisions(discipline.discipline_type);
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

                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <button
                        type="button"
                        onClick={() => moveDiscipline(index, -1)}
                        disabled={index === 0}
                        className="rounded-xl border border-zinc-600 px-4 py-2 font-bold text-gray-100 transition hover:border-emerald-500 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        W górę
                      </button>
                      <button
                        type="button"
                        onClick={() => moveDiscipline(index, 1)}
                        disabled={index === disciplines.length - 1}
                        className="rounded-xl border border-zinc-600 px-4 py-2 font-bold text-gray-100 transition hover:border-emerald-500 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        W dół
                      </button>
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
                  </div>

                  <div className="space-y-5">

                    <input
                      id={`discipline-${index}-name`}
                      type="text"
                      placeholder="Nazwa konkurencji *"
                      value={discipline.name}
                      onChange={(e) => {

                        const updated = [...disciplines];

                        updated[index].name = e.target.value;

                        setDisciplines(updated);

                      }}
                      aria-invalid={!hasText(discipline.name)}
                      required
                      className={requiredFieldClass(hasText(discipline.name))}
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
                        id={`discipline-${index}-type`}
                        value={discipline.discipline_type}
                        onChange={(e) => {

                          const updated = [...disciplines];
                          const selectedDisciplineType = e.target.value;

                          updated[index].discipline_type = selectedDisciplineType;

                          if (!isClayDisciplineType(selectedDisciplineType)) {
                            updated[index].trap_variant = "";
                            updated[index].trap_series_count = 0;
                            updated[index].clay_price = "";
                          } else {
                            updated[index].shots_count = 0;
                          }
                          if (!isDynamicStageDisciplineType(selectedDisciplineType)) {
                            updated[index].fixed_power_factor = "";
                            updated[index].fixed_division = "";
                          }
                          if (
                            isClayDisciplineType(selectedDisciplineType)
                            || isDynamicStageDisciplineType(selectedDisciplineType)
                            || isPracticalShotgunDisciplineType(selectedDisciplineType)
                          ) {
                            updated[index].one_hand_bonus_enabled = false;
                          }
                          updated[index].stages = isDynamicStageDisciplineType(selectedDisciplineType)
                            ? updated[index].stages.length
                              ? updated[index].stages
                              : [createBlankStage(1)]
                            : [];

                          setDisciplines(updated);

                        }}
                        aria-invalid={!hasText(discipline.discipline_type)}
                        required
                        className={requiredFieldClass(hasText(discipline.discipline_type))}
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

                      <button
                        type="button"
                        onClick={() => setShowDisciplineContact(true)}
                        className="mt-3 text-left text-sm font-bold text-emerald-300 underline decoration-emerald-400/50 underline-offset-4 transition hover:text-emerald-200"
                      >
                        Nie znalazłem mojej konkurencji / dodaj konkurencję
                      </button>
                    </div>

                    {temporarilyUnsupportedDisciplineTypes.has(discipline.discipline_type) && (
                      <div className="rounded-xl border border-amber-500/70 bg-amber-950/35 p-4 text-amber-100">
                        <p className="font-black">Ta konkurencja jest jeszcze rozwijana</p>
                        <p className="mt-1 text-sm leading-6">
                          Dedykowany system punktowania nie został jeszcze odpowiednio zaimplementowany.
                          Obecnie możliwe jest wyłącznie wpisanie końcowego wyniku zawodnika. Osobny
                          system sędziowania, podobny do przygotowanego dla Trap i Skeet, pojawi się
                          w kolejnych etapach rozwoju.
                        </p>
                      </div>
                    )}

                    {trapDiscipline && (
                      <div className="grid md:grid-cols-2 gap-4">
                        {isHuntingTrapDiscipline(discipline) && (
                          <div className="md:col-span-2 rounded-xl border border-emerald-700/60 bg-emerald-950/30 p-4 text-sm text-emerald-100">
                            <p className="font-black">Trap Myśliwski — 20 rzutek</p>
                            <p className="mt-1">
                              5 pojedynczych, 10 w parach i 5 z podchodu. Każde trafienie jest warte 5 punktów.
                            </p>
                          </div>
                        )}
                        <div>
                          <p className="text-white font-semibold mb-3">
                            wybierz wariant {discipline.discipline_type === "skeet" ? "Skeet" : "Trapa"}
                          </p>

                          <select
                            id={`discipline-${index}-variant`}
                            value={discipline.trap_variant}
                            onChange={(e) => {

                              const updated = [...disciplines];
                              const selectedTrapVariant = e.target.value;
                              const presetSeriesCount = getTrapPresetSeriesCount(discipline, selectedTrapVariant);

                              updated[index].trap_variant = selectedTrapVariant;
                              updated[index].trap_series_count = presetSeriesCount ?? 0;
                              updated[index].shots_count = selectedTrapVariant === HUNTING_TRAP_VARIANT
                                ? HUNTING_TRAP_SHOTS_COUNT
                                : presetSeriesCount
                                ? presetSeriesCount * trapTargetsPerSeries * (discipline.discipline_type === "skeet" ? 1 : trapShotsPerTarget)
                                : 0;

                              setDisciplines(updated);

                            }}
                            aria-invalid={!hasText(discipline.trap_variant)}
                            required
                            className={requiredFieldClass(hasText(discipline.trap_variant))}
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
                              id={`discipline-${index}-series`}
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
                              aria-invalid={!isPositiveNumber(discipline.trap_series_count)}
                              required
                              className={requiredFieldClass(isPositiveNumber(discipline.trap_series_count))}
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

                    {practicalShotgunDiscipline && !dynamicStageDiscipline && (
                      <div className="grid gap-4 rounded-xl border border-emerald-700/60 bg-emerald-950/25 p-4 md:grid-cols-2">
                        <div className="md:col-span-2 text-sm text-emerald-100">
                          <p className="font-black">Strzelba praktyczna</p>
                          <p className="mt-1">
                            Sędzia wpisuje czas przejazdu i liczbę trafionych celów. System liczy factor: trafienia × 10 / czas.
                          </p>
                        </div>

                        <div>
                          <p className="text-white font-semibold mb-3">
                            Liczba celów
                          </p>

                          <input
                            id={`discipline-${index}-targets`}
                            type="number"
                            min="1"
                            step="1"
                            placeholder="Podaj liczbę celów *"
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
                            aria-invalid={!isPositiveNumber(discipline.shots_count)}
                            required
                            className={requiredFieldClass(isPositiveNumber(discipline.shots_count))}
                          />
                        </div>

                        <div>
                          <p className="text-white font-semibold mb-3">
                            Limit czasu w sekundach
                          </p>

                          <input
                            id={`discipline-${index}-time-limit`}
                            type="number"
                            min="0"
                            step="1"
                            placeholder="Opcjonalnie, np. 60"
                            value={
                              discipline.trap_series_count === 0
                                ? ""
                                : discipline.trap_series_count
                            }
                            onChange={(e) => {
                              const updated = [...disciplines];
                              updated[index].trap_series_count = Number(e.target.value);
                              setDisciplines(updated);
                            }}
                            aria-invalid={!isNonNegativeWholeNumber(discipline.trap_series_count)}
                            className={requiredFieldClass(isNonNegativeWholeNumber(discipline.trap_series_count))}
                          />
                        </div>
                      </div>
                    )}

                    {dynamicStageDiscipline && (
                      <section className="space-y-4 rounded-xl border border-emerald-700/60 bg-emerald-950/20 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                          <div>
                            <h3 className="text-xl font-black text-white">
                              Konfiguracja torów / Stage
                            </h3>
                            <p className="mt-1 text-sm text-emerald-100">
                              Punktacja: Hit Factor. Maksymalne punkty i minimalne strzały liczą się automatycznie.
                            </p>
                          </div>

                          <label className="block md:w-52">
                            <span className="mb-2 block font-semibold text-white">
                              Liczba Stage
                            </span>
                            <input
                              id={`discipline-${index}-stage-count`}
                              type="number"
                              min="1"
                              step="1"
                              value={discipline.stages.length || ""}
                              onChange={(event) => updateStageCount(index, event.target.value)}
                              className={requiredFieldClass(discipline.stages.length > 0)}
                            />
                          </label>
                        </div>

                        <div className="grid gap-3 md:grid-cols-4">
                          <label className={requiredContainerClass(true)}>
                            <span className="text-sm font-bold text-emerald-100">Dywizja</span>
                            <select
                              value={discipline.fixed_division}
                              onChange={(event) => {
                                const updated = [...disciplines];
                                updated[index].fixed_division = event.target.value;
                                setDisciplines(updated);
                              }}
                              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-black text-white"
                            >
                              <option value="">Według zawodnika</option>
                              {dynamicDivisionOptions.map((division) => (
                                <option key={division} value={division}>
                                  Stała {division}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className={requiredContainerClass(true)}>
                            <span className="text-sm font-bold text-emerald-100">Power Factor</span>
                            <select
                              value={discipline.fixed_power_factor}
                              onChange={(event) => {
                                const updated = [...disciplines];
                                updated[index].fixed_power_factor = event.target.value;
                                setDisciplines(updated);
                              }}
                              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-black text-white"
                            >
                              <option value="">Według zawodnika</option>
                              {POWER_FACTOR_OPTIONS.map((powerFactor) => (
                                <option key={powerFactor} value={powerFactor}>
                                  Stały {powerFactor === "major" ? "Major" : "Minor"}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className={requiredContainerClass(true)}>
                            <p className="text-sm font-bold text-emerald-100">Metoda punktacji</p>
                            <p className="mt-1 font-black">Hit Factor</p>
                          </div>
                          <div className={requiredContainerClass(true)}>
                            <p className="text-sm font-bold text-emerald-100">Domyślne kary</p>
                            <p className="mt-1 font-black">Miss/NS/Procedural: -10</p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {discipline.stages.map((stage, stageIndex) => {
                            const minRounds = stage.min_rounds || stageComputedMinRounds(stage);
                            const maxPoints = stageMaxPoints(stage);
                            const targetCount = stageTargetsCount(stage);
                            const stageValid = hasText(stage.name) && stageHasScoredTarget(stage);

                            return (
                              <details
                                key={`${stage.id || "new"}-${stageIndex}`}
                                open={stageIndex === 0 || !stageValid}
                                className={`rounded-xl border bg-zinc-950 ${
                                  stageValid ? "border-emerald-600" : "border-red-500"
                                }`}
                              >
                                <summary className="cursor-pointer list-none p-4">
                                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div>
                                      <p className="text-lg font-black text-white">
                                        Stage {stageIndex + 1}: {stage.name || "bez nazwy"}
                                      </p>
                                      <p className="mt-1 text-sm text-gray-300">
                                        Cele: {targetCount} • Min. strzały: {minRounds} • Max pkt: {maxPoints}
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.preventDefault();
                                          copyPreviousStage(index, stageIndex);
                                        }}
                                        disabled={stageIndex === 0}
                                        className="rounded-lg bg-zinc-800 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
                                      >
                                        Kopiuj z poprzedniego
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.preventDefault();
                                          duplicateStage(index, stageIndex);
                                        }}
                                        className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-bold text-white"
                                      >
                                        Duplikuj Stage
                                      </button>
                                      {discipline.stages.length > 1 && (
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.preventDefault();
                                            removeStage(index, stageIndex);
                                          }}
                                          className="rounded-lg bg-red-700 px-3 py-2 text-sm font-bold text-white"
                                        >
                                          Usuń Stage
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </summary>

                                <div className="space-y-5 border-t border-zinc-800 p-4">
                                  <div className="grid gap-4 md:grid-cols-2">
                                    <label>
                                      <span className="mb-2 block font-semibold text-white">Nazwa Stage</span>
                                      <input
                                        id={`discipline-${index}-stage-${stageIndex}-name`}
                                        value={stage.name}
                                        onChange={(event) => updateStageField(index, stageIndex, "name", event.target.value)}
                                        className={requiredFieldClass(hasText(stage.name))}
                                      />
                                    </label>

                                    <label>
                                      <span className="mb-2 block font-semibold text-white">Numer Stage</span>
                                      <input
                                        type="number"
                                        min="1"
                                        value={stage.stage_number}
                                        onChange={(event) => updateStageField(index, stageIndex, "stage_number", Number(event.target.value))}
                                        className={requiredFieldClass(Number(stage.stage_number) > 0)}
                                      />
                                    </label>
                                  </div>

                                  <div>
                                    <p className="mb-2 font-semibold text-white">Typ Stage</p>
                                    <div className="grid gap-2 md:grid-cols-5">
                                      {stageTypeOptions.map((option) => (
                                        <label
                                          key={option.value}
                                          title={option.title}
                                          className={`rounded-lg border px-3 py-3 text-sm font-bold ${
                                            stage.stage_type === option.value
                                              ? "border-emerald-500 bg-emerald-900/50 text-white"
                                              : "border-zinc-700 bg-zinc-900 text-gray-300"
                                          }`}
                                        >
                                          <input
                                            type="radio"
                                            className="sr-only"
                                            checked={stage.stage_type === option.value}
                                            onChange={() => updateStageField(index, stageIndex, "stage_type", option.value)}
                                          />
                                          {option.label}
                                        </label>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="grid gap-4 md:grid-cols-2">
                                    <textarea
                                      value={stage.briefing}
                                      onChange={(event) => updateStageField(index, stageIndex, "briefing", event.target.value)}
                                      placeholder="Opis przebiegu toru / briefing"
                                      className="min-h-28 rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-white"
                                    />
                                    <textarea
                                      value={stage.notes}
                                      onChange={(event) => updateStageField(index, stageIndex, "notes", event.target.value)}
                                      placeholder="Uwagi dla zawodników"
                                      className="min-h-28 rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-white"
                                    />
                                  </div>

                                  <div className="grid gap-4 md:grid-cols-2">
                                    {[
                                      ["paper_targets", "Pełne tarcze IPSC"],
                                      ["mini_paper_targets", "Mini tarcze IPSC"],
                                      ["classic_targets", "Tarcze klasyczne / inne"],
                                      ["paper_no_shoots", "No Shoot papierowe"],
                                      ["moving_targets", "Cele ruchome"],
                                      ["swingers", "Swingery"],
                                      ["drop_turners", "Drop turnery"],
                                    ].map(([field, label]) => (
                                      <label key={field}>
                                        <span className="mb-2 block text-sm font-semibold text-white">{label}</span>
                                        <input
                                          id={field === "paper_targets" ? `discipline-${index}-stage-${stageIndex}-paper-targets` : undefined}
                                          type="number"
                                          min="0"
                                          value={String(stage[field as keyof DynamicStage] || "")}
                                          onChange={(event) => updateStageField(
                                            index,
                                            stageIndex,
                                            field as keyof DynamicStage,
                                            Number(event.target.value) as never
                                          )}
                                          className={requiredFieldClass(stageHasScoredTarget(stage))}
                                        />
                                      </label>
                                    ))}
                                  </div>

                                  <div className="grid gap-4 md:grid-cols-2">
                                    {[
                                      ["poppers", "Poppery"],
                                      ["mini_poppers", "Mini poppery"],
                                      ["plates", "Plate"],
                                      ["mini_plates", "Mini plate"],
                                      ["steel_no_shoots", "No Shoot metalowe"],
                                    ].map(([field, label]) => (
                                      <label key={field}>
                                        <span className="mb-2 block text-sm font-semibold text-white">{label}</span>
                                        <input
                                          type="number"
                                          min="0"
                                          value={String(stage[field as keyof DynamicStage] || "")}
                                          onChange={(event) => updateStageField(
                                            index,
                                            stageIndex,
                                            field as keyof DynamicStage,
                                            Number(event.target.value) as never
                                          )}
                                          className={requiredFieldClass(stageHasScoredTarget(stage))}
                                        />
                                      </label>
                                    ))}
                                  </div>

                                  <div className="grid gap-4 md:grid-cols-4">
                                    {[
                                      ["popper_points", "Pkt popper"],
                                      ["mini_popper_points", "Pkt mini popper"],
                                      ["plate_points", "Pkt plate"],
                                      ["mini_plate_points", "Pkt mini plate"],
                                    ].map(([field, label]) => (
                                      <label key={field}>
                                        <span className="mb-2 block text-sm font-semibold text-white">{label}</span>
                                        <input
                                          type="number"
                                          min="0"
                                          value={String(stage[field as keyof DynamicStage] ?? 5)}
                                          onChange={(event) => updateStageField(
                                            index,
                                            stageIndex,
                                            field as keyof DynamicStage,
                                            Number(event.target.value) as never
                                          )}
                                          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-white"
                                        />
                                      </label>
                                    ))}
                                  </div>

                                  <div className="grid gap-4 md:grid-cols-3">
                                    <label>
                                      <span className="mb-2 block text-sm font-semibold text-white">Minimalna liczba strzałów</span>
                                      <input
                                        type="number"
                                        min="0"
                                        value={stage.min_rounds || ""}
                                        placeholder={String(stageComputedMinRounds(stage))}
                                        onChange={(event) => updateStageField(index, stageIndex, "min_rounds", Number(event.target.value))}
                                        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-white"
                                      />
                                    </label>
                                    <div className={requiredContainerClass(true)}>
                                      <p className="text-sm font-bold text-emerald-100">Trafienia papierowe</p>
                                      <p className="mt-1 text-2xl font-black">{stageRequiredPaperHits(stage)}</p>
                                    </div>
                                    <div className={requiredContainerClass(true)}>
                                      <p className="text-sm font-bold text-emerald-100">Maks. punkty Stage</p>
                                      <p className="mt-1 text-2xl font-black">{maxPoints}</p>
                                    </div>
                                  </div>

                                  <div className="grid gap-4 md:grid-cols-3">
                                    {[
                                      ["penalty_miss", "Miss"],
                                      ["penalty_no_shoot", "No Shoot"],
                                      ["penalty_procedural", "Procedural"],
                                      ["penalty_ftsa", "FTSA"],
                                      ["penalty_extra_shot", "Extra Shot"],
                                      ["penalty_extra_hit", "Extra Hit"],
                                    ].map(([field, label]) => (
                                      <label key={field}>
                                        <span className="mb-2 block text-sm font-semibold text-white">{label}</span>
                                        <input
                                          type="number"
                                          step="0.01"
                                          value={String(stage[field as keyof DynamicStage] || "")}
                                          onChange={(event) => updateStageField(
                                            index,
                                            stageIndex,
                                            field as keyof DynamicStage,
                                            event.target.value as never
                                          )}
                                          className={requiredFieldClass(hasText(String(stage[field as keyof DynamicStage] || "")))}
                                        />
                                      </label>
                                    ))}
                                  </div>

                                  <div className="grid gap-4 md:grid-cols-2">
                                    <label>
                                      <span className="mb-2 block text-sm font-semibold text-white">Kara własna - nazwa</span>
                                      <input
                                        value={stage.custom_penalties[0]?.name || ""}
                                        onChange={(event) => {
                                          const customPenalties = [...stage.custom_penalties];
                                          customPenalties[0] = {
                                            name: event.target.value,
                                            value: customPenalties[0]?.value || "-10",
                                          };
                                          updateStageField(index, stageIndex, "custom_penalties", customPenalties);
                                        }}
                                        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-white"
                                      />
                                    </label>
                                    <label>
                                      <span className="mb-2 block text-sm font-semibold text-white">Kara własna - wartość</span>
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={stage.custom_penalties[0]?.value || "-10"}
                                        onChange={(event) => {
                                          const customPenalties = [...stage.custom_penalties];
                                          customPenalties[0] = {
                                            name: customPenalties[0]?.name || "",
                                            value: event.target.value,
                                          };
                                          updateStageField(index, stageIndex, "custom_penalties", customPenalties);
                                        }}
                                        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-white"
                                      />
                                    </label>
                                  </div>
                                </div>
                              </details>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    <div className={`grid gap-4 ${trapDiscipline ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
                      <div>
                        <p className="text-white font-semibold mb-3">
                          Typ amunicji
                        </p>

                        <select
                          id={`discipline-${index}-ammo-type`}
                          value={discipline.ammo_type}
                          onChange={(e) => {

                            const updated = [...disciplines];

                            updated[index].ammo_type = e.target.value;

                            setDisciplines(updated);

                          }}
                          aria-invalid={!hasText(discipline.ammo_type)}
                          required
                          className={requiredFieldClass(hasText(discipline.ammo_type))}
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
                          id={`discipline-${index}-ammo-price`}
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Podaj cenę za sztukę *"
                          value={discipline.ammo_price}
                          onChange={(e) => {

                            const updated = [...disciplines];

                            updated[index].ammo_price = e.target.value;

                            setDisciplines(updated);

                          }}
                          aria-invalid={!isNonNegativeNumber(discipline.ammo_price)}
                          required
                          className={requiredFieldClass(isNonNegativeNumber(discipline.ammo_price))}
                        />
                      </div>

                      {trapDiscipline && (
                        <div>
                          <p className="text-white font-semibold mb-3">
                            Cena za 1 rzutek
                          </p>

                          <input
                            id={`discipline-${index}-clay-price`}
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Podaj cenę za 1 rzutek *"
                            value={discipline.clay_price}
                            onChange={(e) => {

                              const updated = [...disciplines];

                              updated[index].clay_price = e.target.value;

                              setDisciplines(updated);

                            }}
                            aria-invalid={!isNonNegativeNumber(discipline.clay_price)}
                            required
                            className={requiredFieldClass(isNonNegativeNumber(discipline.clay_price))}
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
                            id={`discipline-${index}-entry-fee`}
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="podaj cenę dołączenia do konkurencji *"
                            value={discipline.entry_fee}
                            onChange={(e) => {

                              const updated = [...disciplines];

                              updated[index].entry_fee = e.target.value;

                              setDisciplines(updated);

                            }}
                            aria-invalid={!isNonNegativeNumber(discipline.entry_fee)}
                            required
                            className={requiredFieldClass(isNonNegativeNumber(discipline.entry_fee))}
                          />
                        </div>
                      )}

                      {!trapDiscipline && !dynamicStageDiscipline && !practicalShotgunDiscipline && (
                        <>
                          <p className="text-white font-semibold mb-3">
                            Liczba wszystkich strzałów: ocenianych i próbnych
                          </p>

                          <input
                            id={`discipline-${index}-shots`}
                            type="number"
                            min="1"
                            step="1"
                            placeholder="Podaj liczbę wszystkich strzałów *"
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
                            aria-invalid={!isPositiveNumber(discipline.shots_count)}
                            required
                            className={requiredFieldClass(isPositiveNumber(discipline.shots_count))}
                          />

                          <label className="mt-4 flex items-start gap-3 rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-white">
                            <input
                              type="checkbox"
                              checked={discipline.one_hand_bonus_enabled}
                              onChange={(event) => {
                                const updated = [...disciplines];
                                updated[index].one_hand_bonus_enabled = event.target.checked;
                                setDisciplines(updated);
                              }}
                              className="mt-1 h-5 w-5"
                            />
                            <span>
                              <span className="block font-black">
                                Bonus za strzelanie z jednej ręki +5 pkt
                              </span>
                              <span className="mt-1 block text-sm leading-6 text-gray-300">
                                Na karcie sędziowania pojawi się opcja zaznaczenia próby jedną ręką.
                                System doliczy 5 punktów do wpisanego wyniku.
                              </span>
                            </span>
                          </label>
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
                        onClick={() => router.push(`/organizer/${competition.id}${adminClubQuery}`)}
                        className="ui-button bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2 rounded-xl font-semibold"
                      >
                        Szczegóły
                      </button>

                      <button
                        type="button"
                        onClick={() => router.push(`/organizer/${competition.id}${adminClubQuery}#judges`)}
                        className="ui-button bg-emerald-800 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-semibold"
                      >
                        Sędziowie
                      </button>

                      <button
                        type="button"
                        onClick={() => setCopyDialogCompetition(competition)}
                        disabled={copyingCompetitionId === competition.id}
                        className="ui-button bg-violet-700 hover:bg-violet-600 disabled:bg-gray-500 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl font-semibold"
                      >
                        {copyingCompetitionId === competition.id ? "Kopiuję..." : "Kopiuj"}
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
                          onClick={() => router.push(`/organizer/${competition.id}/results${adminClubQuery}`)}
                          className="ui-button bg-green-800 hover:bg-green-700 text-white px-4 py-2 rounded-xl font-semibold"
                        >
                          Wyniki
                        </button>
                      )}

                      {competition.status === "completed" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleDownloadResultsPdf(competition)}
                            disabled={resultsPdfDownloadingId === competition.id}
                            className="ui-button bg-blue-700 hover:bg-blue-600 disabled:bg-gray-500 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl font-semibold"
                          >
                            {resultsPdfDownloadingId === competition.id ? "Generuję..." : "PDF wyników"}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDownloadPzssCommuniquesPdf(competition)}
                            disabled={pzssPdfDownloadingId === competition.id}
                            className="ui-button bg-sky-700 hover:bg-sky-600 disabled:bg-gray-500 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl font-semibold"
                          >
                            {pzssPdfDownloadingId === competition.id ? "Generuję..." : "Komunikaty dla PZSS"}
                          </button>
                        </>
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

      {copyDialogCompetition && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="copy-competition-title"
        >
          <div className="w-full max-w-xl rounded-2xl border border-violet-500/70 bg-zinc-950 p-6 text-white shadow-2xl">
            <h2 id="copy-competition-title" className="text-2xl font-black text-violet-200">
              Skopiować zawody?
            </h2>

            <p className="mt-4 text-base leading-7 text-gray-100">
              Zawody zostaną skopiowane jako szkic bez zawodników i wyników.
              Skopiowane zostaną konkurencje, opisy, logotypy i ustawienia zawodów.
            </p>

            <p className="mt-3 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 font-bold text-white">
              {copyDialogCompetition.name}
            </p>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setCopyDialogCompetition(null)}
                disabled={copyingCompetitionId === copyDialogCompetition.id}
                className="ui-button rounded-xl bg-zinc-700 px-6 py-3 font-bold text-white transition hover:bg-zinc-600 disabled:cursor-not-allowed disabled:bg-gray-600"
              >
                NIE
              </button>

              <button
                type="button"
                onClick={handleCopyCompetition}
                disabled={copyingCompetitionId === copyDialogCompetition.id}
                className="ui-button rounded-xl bg-green-700 px-6 py-3 font-bold text-white transition hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-gray-600"
              >
                {copyingCompetitionId === copyDialogCompetition.id ? "Kopiuję..." : "TAK"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDisciplineContact && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="discipline-contact-title"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-emerald-500/60 bg-zinc-950 p-6 text-white shadow-2xl sm:p-8">
            <h2 id="discipline-contact-title" className="text-2xl font-black text-emerald-200 sm:text-3xl">
              Dodajmy Twoją konkurencję
            </h2>
            <p className="mt-4 leading-7 text-zinc-200">
              Nie znalazłeś tutaj swojej konkurencji albo uważasz, że jest źle skonfigurowana?
              To nie problem 🙂 Skontaktuj się z nami, a przygotujemy ją specjalnie dla Ciebie.
              Opisz dokładnie, czego potrzebujesz oraz w jaki sposób konkurencja powinna być
              sędziowana. Brakująca konkurencja pojawi się na tej liście, a o przebiegu prac
              będziesz informowany na bieżąco.
            </p>

            <a
              href="mailto:info@system-strzelecki.pl?subject=Nowa%20konkurencja%20w%20Systemie%20Strzeleckim"
              className="mt-6 inline-flex items-center rounded-xl bg-emerald-400 px-5 py-3 font-black text-emerald-950 transition hover:bg-emerald-300"
            >
              Napisz: info@system-strzelecki.pl
            </a>

            <div className="mt-6">
              <p className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-400">
                Lub skontaktuj się przez media społecznościowe
              </p>
              <SocialMediaIcons />
            </div>

            <div className="mt-7 flex justify-end">
              <button
                type="button"
                onClick={() => setShowDisciplineContact(false)}
                className="rounded-xl bg-zinc-800 px-6 py-3 font-bold text-white transition hover:bg-zinc-700"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}

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
