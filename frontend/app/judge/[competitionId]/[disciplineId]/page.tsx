"use client";

import NextImage from "next/image";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import QrCodeScanner from "@/components/QrCodeScanner";
import { apiUrl } from "@/lib/api";
import { getAccessToken, isOrganizer, isPzssClubAccount } from "@/lib/auth";
import {
  HUNTING_TRAP_TARGETS_COUNT,
  PRACTICAL_SHOTGUN_DISCIPLINE_TYPE,
  isHuntingTrapDiscipline,
  isDynamicStageDisciplineType,
} from "@/lib/disciplines";

type JudgeCompetition = {
  id: number;
  name: string;
  date: string;
  location: string;
  status: string;
  is_head_judge: boolean;
  disciplines: JudgeDiscipline[];
};

type JudgeDiscipline = {
  id: number;
  name: string;
  description: string;
  scoring_type: string;
  discipline_type: string;
  trap_variant: string;
  trap_series_count: number;
  clay_variant: string;
  clay_series_count: number;
  shots_count: number;
  ammo_type: string;
  ammo_price: string;
  entry_fee: string;
  one_hand_bonus_enabled: boolean;
  shooters_count: number;
  stages?: CompetitionStage[];
};

type CustomPenalty = {
  name: string;
  value: string;
};

type CompetitionStage = {
  id: number;
  stage_number: number;
  name: string;
  stage_type: string;
  briefing: string;
  notes: string;
  min_rounds: number;
  max_points: number;
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
  paper_required_hits: number;
  steel_targets: number;
  steel_points: number;
  penalty_miss: string;
  penalty_no_shoot: string;
  penalty_procedural: string;
  penalty_ftsa: string;
  penalty_extra_shot: string;
  penalty_extra_hit: string;
  custom_penalties: CustomPenalty[];
};

type StageScorePayload = {
  stage_id: number;
  competitor_id: number;
  division: string;
  power_factor: string;
  time_seconds: string;
  hits_a: number;
  hits_c: number;
  hits_d: number;
  paper_misses: number;
  steel_hits: number;
  steel_misses: number;
  popper_hits: number;
  popper_misses: number;
  mini_popper_hits: number;
  mini_popper_misses: number;
  plate_hits: number;
  plate_misses: number;
  mini_plate_hits: number;
  mini_plate_misses: number;
  no_shoots: number;
  procedurals: number;
  ftsa: number;
  extra_shots: number;
  extra_hits: number;
  custom_penalties?: { name: string; count: number; value: string }[];
  positive_points: string;
  penalty_points: string;
  final_points: string;
  hit_factor: string;
  stage_points: string;
  stage_percent: string;
  stage_place: number;
};

type Shooter = {
  participant_id: number;
  user_email: string;
  first_name: string;
  last_name: string;
  license_number: string;
  club: string;
  points: string;
  result_data: string;
  stage_scores?: Record<string, StageScorePayload>;
  division: string;
  power_factor: string;
  ammo_source: string;
  club_ammo_quantity: number;
  club_ammo_type: string;
  squad_group_number: number;
  squad_position: number;
};

type OrganizerPreviewDisciplineAssignment = {
  id: number;
  ammo_type: string;
  division: string;
  power_factor: string;
  squad_group_number: number;
  squad_position: number;
};

type OrganizerPreviewParticipant = {
  id: number;
  user_email: string;
  first_name: string;
  last_name: string;
  license_number: string;
  club: string;
  display_name: string;
  checked_in: boolean;
  paid: boolean;
  disciplines: OrganizerPreviewDisciplineAssignment[];
};

type OrganizerPreviewCompetition = {
  id: number;
  name: string;
  date: string;
  location: string;
  status: string;
  disciplines: Array<Omit<JudgeDiscipline, "shooters_count"> & {
    discipline_type_label?: string;
    fixed_power_factor?: string;
    fixed_division?: string;
    shooters_count?: number;
  }>;
  participants: OrganizerPreviewParticipant[];
};

type SortField = "name" | "license" | "club" | "points";
type SortDirection = "asc" | "desc";
type TrapScoreValue = 1 | 0 | null;
const clayHitPoints = 5;
const oneHandBonusPoints = 5;
const organizerJudgingTestQueryValue = "organizer";
const testShooterParticipantId = -1;
type PracticalShotgunInput = {
  time: string;
  hits: string;
};
type StandardResultDraft = {
  shooter: Shooter;
  points: string;
  oneHandBonus: boolean;
};
type StageScoreInput = {
  time_seconds: string;
  hits_a: number;
  hits_c: number;
  hits_d: number;
  paper_misses: number;
  steel_hits: number;
  steel_misses: number;
  popper_hits: number;
  popper_misses: number;
  mini_popper_hits: number;
  mini_popper_misses: number;
  plate_hits: number;
  plate_misses: number;
  mini_plate_hits: number;
  mini_plate_misses: number;
  no_shoots: number;
  procedurals: number;
  ftsa: number;
  extra_shots: number;
  extra_hits: number;
  power_factor: "minor" | "major";
  division: string;
  custom_penalties: { name: string; count: number; value: string }[];
};
type StageScoreCounterField = keyof Pick<
  StageScoreInput,
  | "hits_a"
  | "hits_c"
  | "hits_d"
  | "paper_misses"
  | "popper_hits"
  | "popper_misses"
  | "mini_popper_hits"
  | "mini_popper_misses"
  | "plate_hits"
  | "plate_misses"
  | "mini_plate_hits"
  | "mini_plate_misses"
  | "steel_hits"
  | "steel_misses"
  | "no_shoots"
  | "procedurals"
  | "ftsa"
  | "extra_shots"
  | "extra_hits"
>;

type TrapHistoryEntry = {
  participantId: number;
  scoreIndex: number;
  roundIndex: number;
  shotIndex: number;
  previousValue: TrapScoreValue;
};
type TrapGroupStatus = "not-started" | "in-progress" | "completed";
type TrapPhase = {
  label: string;
  targetsPerStation: number;
};
type TrapFormat = {
  phases: TrapPhase[];
  targetsCount: number;
  hunting: boolean;
};
type SkeetHouse = "high" | "low";
type SkeetPresentation = {
  label: string;
  houses: SkeetHouse[];
  targetIndexes: number[];
};
type SkeetStage = {
  station: number;
  presentations: SkeetPresentation[];
};
type SkeetTurn = {
  roundIndex: number;
  stageIndex: number;
  shooter: Shooter;
  presentation: SkeetPresentation;
};
type SkeetHistoryEntry = {
  participantId: number;
  scoreIndexes: number[];
  previousValues: TrapScoreValue[];
  turnIndex: number;
};

const trapStationsCount = 5;
const trapSquadCycleSize = 6;
const trapTargetsPerRound = 5;
const trapScoreGridColumns = "clamp(52px, 8vw, 120px) clamp(118px, 20vw, 260px) repeat(5, minmax(0, 1fr)) clamp(54px, 8vw, 120px)";

function buildTrapFormat(hunting: boolean, seriesCount: number): TrapFormat {
  if (hunting) {
    return {
      hunting: true,
      targetsCount: HUNTING_TRAP_TARGETS_COUNT,
      phases: [
        { label: "Seria 1 — pojedyncze rzutki", targetsPerStation: 1 },
        { label: "Seria 2 — pary rzutek", targetsPerStation: 2 },
        { label: "Seria 3 — podchód", targetsPerStation: 1 },
      ],
    };
  }

  const safeSeriesCount = Math.max(seriesCount, 1);
  return {
    hunting: false,
    targetsCount: safeSeriesCount * 25,
    phases: Array.from({ length: safeSeriesCount }, (_value, index) => ({
      label: `Seria ${index + 1} z ${safeSeriesCount}`,
      targetsPerStation: trapTargetsPerRound,
    })),
  };
}

function getTrapPhaseIndex(
  groupShooters: Shooter[],
  roundIndex: number
) {
  return Math.floor(roundIndex / getTrapCycleSize(groupShooters));
}

function getTrapPhaseStartScoreIndex(format: TrapFormat, phaseIndex: number) {
  return format.phases
    .slice(0, phaseIndex)
    .reduce((sum, phase) => sum + phase.targetsPerStation * trapStationsCount, 0);
}

const skeetStages: SkeetStage[] = (() => {
  let targetIndex = 0;
  const presentation = (label: string, houses: SkeetHouse[]): SkeetPresentation => {
    const targetIndexes = houses.map(() => targetIndex++);
    return { label, houses, targetIndexes };
  };

  return [
    { station: 1, presentations: [presentation("Pojedynczy: wysoka", ["high"]), presentation("Dublet: wysoka → niska", ["high", "low"])] },
    { station: 2, presentations: [presentation("Pojedynczy: wysoka", ["high"]), presentation("Dublet: wysoka → niska", ["high", "low"])] },
    { station: 3, presentations: [presentation("Pojedynczy: wysoka", ["high"]), presentation("Dublet: wysoka → niska", ["high", "low"])] },
    { station: 4, presentations: [presentation("Pojedynczy: wysoka", ["high"]), presentation("Pojedynczy: niska", ["low"])] },
    { station: 5, presentations: [presentation("Pojedynczy: niska", ["low"]), presentation("Dublet: niska → wysoka", ["low", "high"])] },
    { station: 6, presentations: [presentation("Pojedynczy: niska", ["low"]), presentation("Dublet: niska → wysoka", ["low", "high"])] },
    { station: 7, presentations: [presentation("Dublet: niska → wysoka", ["low", "high"])] },
    { station: 4, presentations: [presentation("Dublet: wysoka → niska", ["high", "low"]), presentation("Dublet: niska → wysoka", ["low", "high"])] },
    { station: 8, presentations: [presentation("Pojedynczy: wysoka", ["high"]), presentation("Pojedynczy: niska", ["low"])] },
  ];
})();

const skeetTargetDefinitions = skeetStages.flatMap((stage) =>
  stage.presentations.flatMap((item) =>
    item.houses.map((house, index) => ({
      number: item.targetIndexes[index] + 1,
      station: stage.station,
      presentation: item.houses.length === 2 ? "double" : "single",
      house,
    }))
  )
);

function qrValueToParticipantId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  if (/^\d+$/.test(trimmedValue)) {
    return Number(trimmedValue);
  }

  const profileMatch = trimmedValue.match(/\/profile\/(\d+)/i);

  if (profileMatch) {
    return Number(profileMatch[1]);
  }

  try {
    const url = new URL(trimmedValue);
    const participantId = url.searchParams.get("participant_id")
      || url.searchParams.get("participantId")
      || url.searchParams.get("id");

    if (participantId && /^\d+$/.test(participantId)) {
      return Number(participantId);
    }

    const urlProfileMatch = url.pathname.match(/\/profile\/(\d+)/i);

    if (urlProfileMatch) {
      return Number(urlProfileMatch[1]);
    }
  } catch {
    // Plain text payloads are handled by the patterns above.
  }

  return null;
}

type ParticipantQrPayload = {
  participantId: number | null;
  licenseNumber: string;
  licenseNumberDigits: string;
};

function emptyParticipantQrPayload(): ParticipantQrPayload {
  return {
    participantId: null,
    licenseNumber: "",
    licenseNumberDigits: "",
  };
}

function licenseDigits(value: string) {
  return value.replace(/\D/g, "");
}

function parseParticipantQrPayload(value: string): ParticipantQrPayload {
  try {
    const parsed = JSON.parse(value);

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const payload = parsed as Record<string, unknown>;
      return {
        participantId: qrValueToParticipantId(
          payload.participant_id
          ?? payload.participantId
          ?? payload.id
          ?? payload.profile_url
          ?? payload.profileUrl
          ?? payload.url
        ),
        licenseNumber: typeof payload.license_number === "string" ? payload.license_number : "",
        licenseNumberDigits: typeof payload.license_number_digits === "string" ? payload.license_number_digits : "",
      };
    }

    if (Array.isArray(parsed)) {
      const licenseNumber = typeof parsed[2] === "string" ? parsed[2].trim() : "";
      const licenseNumberDigits = typeof parsed[3] === "string" || typeof parsed[3] === "number"
        ? String(parsed[3]).trim()
        : "";

      for (const item of parsed) {
        const participantId = qrValueToParticipantId(item);

        if (participantId) {
          return {
            participantId,
            licenseNumber,
            licenseNumberDigits,
          };
        }
      }

      if (licenseNumber || licenseNumberDigits) {
        return {
          participantId: null,
          licenseNumber,
          licenseNumberDigits,
        };
      }
    }
  } catch {
    // URLs and plain text are handled below.
  }

  const participantId = qrValueToParticipantId(value);

  if (participantId) {
    return {
      participantId,
      licenseNumber: "",
      licenseNumberDigits: "",
    };
  }

  return emptyParticipantQrPayload();
}

function getShooterName(shooter: Shooter) {
  return [shooter.last_name, shooter.first_name].filter(Boolean).join(" ")
    || shooter.user_email;
}

function clubAmmoText(shooter: Shooter) {
  if (shooter.ammo_source !== "club") {
    return "";
  }

  const quantity = Number(shooter.club_ammo_quantity || 0);
  const ammoType = shooter.club_ammo_type || "amunicji";

  return `Wydać ${quantity} sztuk amunicji ${ammoType}`;
}

function ClubAmmoNotice({
  shooter,
  compact = false,
  light = false,
}: {
  shooter: Shooter;
  compact?: boolean;
  light?: boolean;
}) {
  const text = clubAmmoText(shooter);

  if (!text) {
    return null;
  }

  return (
    <div
      className={`mt-2 break-words font-black ${
        compact ? "text-xs" : "text-sm"
      } ${
        light
          ? "text-amber-800"
          : "rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-100"
      }`}
    >
      {text}
    </div>
  );
}

function organizerPreviewDisciplineToJudgeDiscipline(
  discipline: OrganizerPreviewCompetition["disciplines"][number],
  shootersCount: number
): JudgeDiscipline {
  return {
    id: discipline.id,
    name: discipline.name,
    description: discipline.description || "",
    scoring_type: discipline.scoring_type || "",
    discipline_type: discipline.discipline_type || "",
    trap_variant: discipline.trap_variant || "",
    trap_series_count: Number(discipline.trap_series_count || 0),
    clay_variant: discipline.clay_variant || "",
    clay_series_count: Number(discipline.clay_series_count || 0),
    shots_count: Number(discipline.shots_count || 0),
    ammo_type: discipline.ammo_type || "",
    ammo_price: discipline.ammo_price || "",
    entry_fee: discipline.entry_fee || "",
    one_hand_bonus_enabled: Boolean(discipline.one_hand_bonus_enabled),
    shooters_count: shootersCount,
    stages: discipline.stages || [],
  };
}

function buildOrganizerPreviewCompetitions(data: OrganizerPreviewCompetition): JudgeCompetition[] {
  return [{
    id: data.id,
    name: data.name,
    date: data.date,
    location: data.location,
    status: "started",
    is_head_judge: true,
    disciplines: data.disciplines.map((discipline) => {
      const shootersCount = data.participants.filter((participant) =>
        participant.disciplines.some((assignment) => assignment.id === discipline.id)
      ).length;

      return organizerPreviewDisciplineToJudgeDiscipline(
        discipline,
        shootersCount > 0 ? shootersCount : 1
      );
    }),
  }];
}

function splitDisplayName(displayName: string) {
  const cleanName = displayName.split(" - ")[0]?.trim() || "";
  const [lastName = "", ...firstNameParts] = cleanName.split(/\s+/).filter(Boolean);

  return {
    firstName: firstNameParts.join(" "),
    lastName,
  };
}

function buildTestShooter(
  discipline: OrganizerPreviewCompetition["disciplines"][number]
): Shooter {
  return {
    participant_id: testShooterParticipantId,
    user_email: "jan.kowalski@example.test",
    first_name: "Jan",
    last_name: "Kowalski",
    license_number: "TEST-001",
    club: "Klub testowy",
    points: "",
    result_data: "",
    stage_scores: {},
    division: discipline.fixed_division || "Open",
    power_factor: discipline.fixed_power_factor || "minor",
    ammo_source: "club",
    club_ammo_quantity: Number(discipline.shots_count || 0),
    club_ammo_type: discipline.ammo_type || "",
    squad_group_number: 1,
    squad_position: 1,
  };
}

function buildOrganizerPreviewShooters(
  data: OrganizerPreviewCompetition,
  disciplineId: number
): Shooter[] {
  const discipline = data.disciplines.find((item) => item.id === disciplineId);

  if (!discipline) {
    return [];
  }

  const shooters = data.participants
    .map((participant, index): Shooter | null => {
      const assignment = participant.disciplines.find((item) => item.id === disciplineId);

      if (!assignment) {
        return null;
      }

      const displayNameParts = splitDisplayName(participant.display_name || "");

      return {
        participant_id: participant.id,
        user_email: participant.user_email || `test-${participant.id}@example.test`,
        first_name: participant.first_name || displayNameParts.firstName,
        last_name: participant.last_name || displayNameParts.lastName,
        license_number: participant.license_number || "TEST",
        club: participant.club || "Klub testowy",
        points: "",
        result_data: "",
        stage_scores: {},
        division: assignment.division || discipline.fixed_division || "Open",
        power_factor: assignment.power_factor || discipline.fixed_power_factor || "minor",
        ammo_source: assignment.ammo_type || "",
        club_ammo_quantity: assignment.ammo_type === "club" ? Number(discipline.shots_count || 0) : 0,
        club_ammo_type: assignment.ammo_type === "club" ? discipline.ammo_type || "" : "",
        squad_group_number: Number(assignment.squad_group_number || Math.floor(index / trapSquadCycleSize) + 1),
        squad_position: Number(assignment.squad_position || (index % trapSquadCycleSize) + 1),
      };
    })
    .filter((shooter): shooter is Shooter => shooter !== null);

  return shooters.length > 0
    ? shooters
    : [buildTestShooter(discipline)];
}

function getSortValue(shooter: Shooter, field: SortField) {
  if (field === "name") {
    return getShooterName(shooter);
  }

  if (field === "license") {
    return shooter.license_number || "";
  }

  if (field === "club") {
    return shooter.club || "";
  }

  return shooter.points || "";
}

function parseStandardResult(resultData: string) {
  try {
    const parsed = JSON.parse(resultData || "{}");

    if (!parsed || parsed.discipline !== "standard") {
      return null;
    }

    return {
      basePoints: String(parsed.base_points ?? ""),
      oneHandBonus: Boolean(parsed.one_hand_bonus),
      finalPoints: String(parsed.final_points ?? ""),
    };
  } catch {
    return null;
  }
}

function parseStandardPoints(value: string) {
  const parsed = Number(String(value || "").replace(",", "."));

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function formatStandardPoints(value: number) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(2)));
}

function standardResultData(points: string, oneHandBonus: boolean) {
  const basePoints = parseStandardPoints(points);
  const safeBasePoints = basePoints ?? 0;
  const finalPoints = safeBasePoints + (oneHandBonus ? oneHandBonusPoints : 0);

  return {
    finalPoints: formatStandardPoints(finalPoints),
    resultData: JSON.stringify({
      discipline: "standard",
      base_points: formatStandardPoints(safeBasePoints),
      one_hand_bonus: oneHandBonus,
      one_hand_bonus_points: oneHandBonus ? oneHandBonusPoints : 0,
      final_points: formatStandardPoints(finalPoints),
    }),
  };
}

function parseScore(value: string) {
  const score = Number(value || "0");

  return Number.isFinite(score)
    ? score
    : 0;
}

function formatFactor(value: number) {
  if (!Number.isFinite(value)) {
    return "0.000";
  }

  return value.toFixed(3);
}

function parsePracticalShotgunResult(resultData: string) {
  try {
    const parsed = JSON.parse(resultData || "{}");

    if (!parsed || parsed.discipline !== PRACTICAL_SHOTGUN_DISCIPLINE_TYPE) {
      return null;
    }

    return {
      time: String(parsed.time_seconds || ""),
      hits: String(parsed.hits ?? ""),
      factor: parsed.factor !== undefined
        ? formatFactor(Number(parsed.factor))
        : "",
      disqualified: Boolean(parsed.disqualified),
      disqualificationReason: String(parsed.disqualification_reason || ""),
    };
  } catch {
    return null;
  }
}

function practicalShotgunInputsFromShooters(shooters: Shooter[]) {
  return shooters.reduce<Record<number, PracticalShotgunInput>>((inputs, shooter) => {
    const parsedResult = parsePracticalShotgunResult(shooter.result_data || "");
    inputs[shooter.participant_id] = {
      time: parsedResult?.time || "",
      hits: parsedResult?.hits || "",
    };
    return inputs;
  }, {});
}

function hasPracticalShotgunResult(shooter: Shooter) {
  return Boolean(parsePracticalShotgunResult(shooter.result_data || "") || shooter.points);
}

function emptyStageScoreInput(
  stage?: CompetitionStage,
  score?: StageScorePayload | null,
  shooter?: Shooter
): StageScoreInput {
  const customPenaltiesCount = Math.max(
    stage?.custom_penalties?.length || 0,
    score?.custom_penalties?.length || 0,
    3
  );

  return {
    time_seconds: score?.time_seconds || "",
    hits_a: score?.hits_a || 0,
    hits_c: score?.hits_c || 0,
    hits_d: score?.hits_d || 0,
    paper_misses: score?.paper_misses || 0,
    steel_hits: score?.steel_hits || 0,
    steel_misses: score?.steel_misses || 0,
    popper_hits: score?.popper_hits || 0,
    popper_misses: score?.popper_misses || 0,
    mini_popper_hits: score?.mini_popper_hits || 0,
    mini_popper_misses: score?.mini_popper_misses || 0,
    plate_hits: score?.plate_hits || 0,
    plate_misses: score?.plate_misses || 0,
    mini_plate_hits: score?.mini_plate_hits || 0,
    mini_plate_misses: score?.mini_plate_misses || 0,
    no_shoots: score?.no_shoots || 0,
    procedurals: score?.procedurals || 0,
    ftsa: score?.ftsa || 0,
    extra_shots: score?.extra_shots || 0,
    extra_hits: score?.extra_hits || 0,
    power_factor: score?.power_factor === "major" || shooter?.power_factor === "major" ? "major" : "minor",
    division: score?.division || shooter?.division || "",
    custom_penalties: Array.from({ length: customPenaltiesCount }, (_item, index) => ({
      name: score?.custom_penalties?.[index]?.name || stage?.custom_penalties?.[index]?.name || "",
      count: score?.custom_penalties?.[index]?.count || 0,
      value: score?.custom_penalties?.[index]?.value || stage?.custom_penalties?.[index]?.value || "-10",
    })),
  };
}

function numericPenalty(value: string) {
  const parsed = Number(String(value || "0").replace(",", "."));

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return parsed > 0 ? -parsed : parsed;
}

function clampCounterValue(value: number, maxValue: number | null = null) {
  const parsedValue = Number(value || 0);
  const normalizedValue = Number.isFinite(parsedValue) ? Math.floor(parsedValue) : 0;
  const nonNegativeValue = Math.max(normalizedValue, 0);

  if (maxValue === null) {
    return nonNegativeValue;
  }

  return Math.min(nonNegativeValue, Math.max(maxValue, 0));
}

function stageSteelMissFieldsEnabled(stage: CompetitionStage) {
  return numericPenalty(stage.penalty_miss) !== 0;
}

function stageHasPaperScoring(stage: CompetitionStage) {
  return Number(stage.paper_required_hits || 0) > 0;
}

function stageHasNoShootScoring(stage: CompetitionStage) {
  return Number(stage.paper_no_shoots || 0) + Number(stage.steel_no_shoots || 0) > 0;
}

function visibleCustomPenalties(stage: CompetitionStage, input: StageScoreInput) {
  return input.custom_penalties.filter((penalty, index) =>
    Boolean((stage.custom_penalties[index]?.name || "").trim())
  );
}

function sanitizeStageScoreInput(stage: CompetitionStage, input: StageScoreInput) {
  const hasPaper = stageHasPaperScoring(stage);
  const hasNoShoots = stageHasNoShootScoring(stage);
  const clampedInput = clampStageScoreCounters(stage, input);

  return {
    ...clampedInput,
    hits_a: hasPaper ? clampedInput.hits_a : 0,
    hits_c: hasPaper ? clampedInput.hits_c : 0,
    hits_d: hasPaper ? clampedInput.hits_d : 0,
    paper_misses: hasPaper ? clampedInput.paper_misses : 0,
    steel_hits: 0,
    steel_misses: 0,
    popper_hits: activeTargetCount(stage.poppers) ? clampedInput.popper_hits : 0,
    popper_misses: activeTargetCount(stage.poppers) ? clampedInput.popper_misses : 0,
    mini_popper_hits: activeTargetCount(stage.mini_poppers) ? clampedInput.mini_popper_hits : 0,
    mini_popper_misses: activeTargetCount(stage.mini_poppers) ? clampedInput.mini_popper_misses : 0,
    plate_hits: activeTargetCount(stage.plates) ? clampedInput.plate_hits : 0,
    plate_misses: activeTargetCount(stage.plates) ? clampedInput.plate_misses : 0,
    mini_plate_hits: activeTargetCount(stage.mini_plates) ? clampedInput.mini_plate_hits : 0,
    mini_plate_misses: activeTargetCount(stage.mini_plates) ? clampedInput.mini_plate_misses : 0,
    no_shoots: hasNoShoots ? clampedInput.no_shoots : 0,
    procedurals: 0,
    ftsa: 0,
    extra_shots: 0,
    extra_hits: 0,
    custom_penalties: visibleCustomPenalties(stage, input),
  };
}

function activeTargetCount(value: number) {
  return Number(value || 0) > 0;
}

function stageScoreCounterMax(
  stage: CompetitionStage,
  input: StageScoreInput,
  field: StageScoreCounterField
) {
  const missFieldsEnabled = stageSteelMissFieldsEnabled(stage);

  switch (field) {
    case "popper_hits":
      return Math.max(Number(stage.poppers || 0) - (missFieldsEnabled ? Number(input.popper_misses || 0) : 0), 0);
    case "popper_misses":
      return missFieldsEnabled ? Math.max(Number(stage.poppers || 0) - Number(input.popper_hits || 0), 0) : 0;
    case "mini_popper_hits":
      return Math.max(Number(stage.mini_poppers || 0) - (missFieldsEnabled ? Number(input.mini_popper_misses || 0) : 0), 0);
    case "mini_popper_misses":
      return missFieldsEnabled ? Math.max(Number(stage.mini_poppers || 0) - Number(input.mini_popper_hits || 0), 0) : 0;
    case "plate_hits":
      return Math.max(Number(stage.plates || 0) - (missFieldsEnabled ? Number(input.plate_misses || 0) : 0), 0);
    case "plate_misses":
      return missFieldsEnabled ? Math.max(Number(stage.plates || 0) - Number(input.plate_hits || 0), 0) : 0;
    case "mini_plate_hits":
      return Math.max(Number(stage.mini_plates || 0) - (missFieldsEnabled ? Number(input.mini_plate_misses || 0) : 0), 0);
    case "mini_plate_misses":
      return missFieldsEnabled ? Math.max(Number(stage.mini_plates || 0) - Number(input.mini_plate_hits || 0), 0) : 0;
    case "no_shoots":
      return Math.max(Number(stage.paper_no_shoots || 0) + Number(stage.steel_no_shoots || 0), 0);
    default:
      return null;
  }
}

function clampStageScoreCounters(stage: CompetitionStage, input: StageScoreInput) {
  const hasPaper = stageHasPaperScoring(stage);
  const hasNoShoots = stageHasNoShootScoring(stage);
  const missFieldsEnabled = stageSteelMissFieldsEnabled(stage);
  const paperLimit = Number(stage.paper_required_hits || 0);
  const popperLimit = Number(stage.poppers || 0);
  const miniPopperLimit = Number(stage.mini_poppers || 0);
  const plateLimit = Number(stage.plates || 0);
  const miniPlateLimit = Number(stage.mini_plates || 0);
  const noShootLimit = Number(stage.paper_no_shoots || 0) + Number(stage.steel_no_shoots || 0);
  const next = { ...input };

  if (hasPaper) {
    next.hits_a = clampCounterValue(next.hits_a, paperLimit);
    next.hits_c = clampCounterValue(next.hits_c, paperLimit - next.hits_a);
    next.hits_d = clampCounterValue(next.hits_d, paperLimit - next.hits_a - next.hits_c);
    next.paper_misses = clampCounterValue(next.paper_misses, paperLimit - next.hits_a - next.hits_c - next.hits_d);
  } else {
    next.hits_a = 0;
    next.hits_c = 0;
    next.hits_d = 0;
    next.paper_misses = 0;
  }

  next.popper_hits = clampCounterValue(next.popper_hits, popperLimit);
  next.popper_misses = missFieldsEnabled
    ? clampCounterValue(next.popper_misses, popperLimit - next.popper_hits)
    : 0;
  next.mini_popper_hits = clampCounterValue(next.mini_popper_hits, miniPopperLimit);
  next.mini_popper_misses = missFieldsEnabled
    ? clampCounterValue(next.mini_popper_misses, miniPopperLimit - next.mini_popper_hits)
    : 0;
  next.plate_hits = clampCounterValue(next.plate_hits, plateLimit);
  next.plate_misses = missFieldsEnabled
    ? clampCounterValue(next.plate_misses, plateLimit - next.plate_hits)
    : 0;
  next.mini_plate_hits = clampCounterValue(next.mini_plate_hits, miniPlateLimit);
  next.mini_plate_misses = missFieldsEnabled
    ? clampCounterValue(next.mini_plate_misses, miniPlateLimit - next.mini_plate_hits)
    : 0;
  next.no_shoots = hasNoShoots ? clampCounterValue(next.no_shoots, noShootLimit) : 0;
  next.procedurals = 0;
  next.ftsa = 0;
  next.extra_shots = 0;
  next.extra_hits = 0;

  return next;
}

function dynamicStageSummaryItems(stage: CompetitionStage) {
  return [
    ...(stageHasPaperScoring(stage) ? [`Papier: ${stage.paper_required_hits} trafień`] : []),
    ...(stage.steel_targets > 0 ? [`Stal: ${stage.steel_targets}`] : []),
    `Min. strzały: ${stage.min_rounds}`,
    `Max pkt: ${stage.max_points}`,
  ];
}

function dynamicStagePreview(stage: CompetitionStage, input: StageScoreInput) {
  const sanitizedInput = sanitizeStageScoreInput(stage, input);
  const time = Number(String(input.time_seconds || "").replace(",", "."));
  const cPoints = sanitizedInput.power_factor === "major" ? 4 : 3;
  const dPoints = sanitizedInput.power_factor === "major" ? 2 : 1;
  const typedSteelHits = sanitizedInput.popper_hits
    + sanitizedInput.mini_popper_hits
    + sanitizedInput.plate_hits
    + sanitizedInput.mini_plate_hits;
  const typedSteelMisses = sanitizedInput.popper_misses
    + sanitizedInput.mini_popper_misses
    + sanitizedInput.plate_misses
    + sanitizedInput.mini_plate_misses;
  const useTypedSteel = typedSteelHits + typedSteelMisses > 0;
  const steelHits = useTypedSteel ? typedSteelHits : sanitizedInput.steel_hits;
  const steelMisses = useTypedSteel ? typedSteelMisses : sanitizedInput.steel_misses;
  const steelPositivePoints = useTypedSteel
    ? sanitizedInput.popper_hits * (stage.popper_points ?? 5)
      + sanitizedInput.mini_popper_hits * (stage.mini_popper_points ?? 5)
      + sanitizedInput.plate_hits * (stage.plate_points ?? 5)
      + sanitizedInput.mini_plate_hits * (stage.mini_plate_points ?? 5)
    : sanitizedInput.steel_hits * 5;
  const positivePoints = sanitizedInput.hits_a * 5
    + sanitizedInput.hits_c * cPoints
    + sanitizedInput.hits_d * dPoints
    + steelPositivePoints;
  const penaltyPoints =
    (sanitizedInput.paper_misses + steelMisses) * numericPenalty(stage.penalty_miss)
    + sanitizedInput.no_shoots * numericPenalty(stage.penalty_no_shoot)
    + sanitizedInput.custom_penalties.reduce((sum, penalty) => sum + penalty.count * numericPenalty(penalty.value), 0);
  const finalPoints = Math.max(positivePoints + penaltyPoints, 0);
  const hitFactor = time > 0 ? finalPoints / time : 0;
  const paperEntries = sanitizedInput.hits_a + sanitizedInput.hits_c + sanitizedInput.hits_d + sanitizedInput.paper_misses;
  const steelEntries = steelHits + steelMisses;

  return {
    time,
    validTime: Number.isFinite(time) && time > 0,
    positivePoints,
    penaltyPoints,
    finalPoints,
    hitFactor,
    paperEntries,
    steelEntries,
    paperWarning: stageHasPaperScoring(stage) && paperEntries !== stage.paper_required_hits,
    steelWarning: stage.steel_targets > 0 && steelEntries !== stage.steel_targets,
    paperOverflow: paperEntries > stage.paper_required_hits,
    steelOverflow: steelEntries > stage.steel_targets,
  };
}

function buildTestStageScorePayload(
  stage: CompetitionStage,
  shooter: Shooter,
  input: StageScoreInput
): StageScorePayload {
  const sanitizedInput = sanitizeStageScoreInput(stage, input);
  const preview = dynamicStagePreview(stage, input);

  return {
    stage_id: stage.id,
    competitor_id: shooter.participant_id,
    division: sanitizedInput.division || shooter.division || "",
    power_factor: sanitizedInput.power_factor || shooter.power_factor || "minor",
    time_seconds: String(input.time_seconds || "").replace(",", "."),
    hits_a: sanitizedInput.hits_a,
    hits_c: sanitizedInput.hits_c,
    hits_d: sanitizedInput.hits_d,
    paper_misses: sanitizedInput.paper_misses,
    steel_hits: sanitizedInput.steel_hits,
    steel_misses: sanitizedInput.steel_misses,
    popper_hits: sanitizedInput.popper_hits,
    popper_misses: sanitizedInput.popper_misses,
    mini_popper_hits: sanitizedInput.mini_popper_hits,
    mini_popper_misses: sanitizedInput.mini_popper_misses,
    plate_hits: sanitizedInput.plate_hits,
    plate_misses: sanitizedInput.plate_misses,
    mini_plate_hits: sanitizedInput.mini_plate_hits,
    mini_plate_misses: sanitizedInput.mini_plate_misses,
    no_shoots: sanitizedInput.no_shoots,
    procedurals: sanitizedInput.procedurals,
    ftsa: sanitizedInput.ftsa,
    extra_shots: sanitizedInput.extra_shots,
    extra_hits: sanitizedInput.extra_hits,
    custom_penalties: sanitizedInput.custom_penalties
      .filter((penalty) => penalty.name || penalty.count > 0)
      .map((penalty) => ({
        name: penalty.name,
        count: penalty.count,
        value: penalty.value,
      })),
    positive_points: String(preview.positivePoints),
    penalty_points: String(preview.penaltyPoints),
    final_points: String(preview.finalPoints),
    hit_factor: formatFactor(preview.hitFactor),
    stage_points: formatFactor(preview.hitFactor),
    stage_percent: "100.00",
    stage_place: 1,
  };
}

function stageScoreInputsFromShooters(shooters: Shooter[], stages: CompetitionStage[]) {
  return shooters.reduce<Record<number, Record<number, StageScoreInput>>>((inputs, shooter) => {
    inputs[shooter.participant_id] = {};
    stages.forEach((stage) => {
      inputs[shooter.participant_id][stage.id] = emptyStageScoreInput(
        stage,
        shooter.stage_scores?.[String(stage.id)] || null,
        shooter
      );
    });
    return inputs;
  }, {});
}

function sortTrapShooters(groupShooters: Shooter[]) {
  return [...groupShooters].sort((first, second) =>
    (first.squad_position || 99) - (second.squad_position || 99)
  );
}

function getTrapCycleSize(groupShooters: Shooter[]) {
  const hasWaitingPosition = groupShooters.some((shooter) =>
    Number(shooter.squad_position || 0) >= trapSquadCycleSize
  );

  return groupShooters.length > trapStationsCount || hasWaitingPosition
    ? trapSquadCycleSize
    : trapStationsCount;
}

function getTrapInitialSlots(groupShooters: Shooter[]) {
  const cycleSize = getTrapCycleSize(groupShooters);
  const slots = Array.from({ length: cycleSize }, () => null as Shooter | null);
  const sortedShooters = sortTrapShooters(groupShooters).slice(0, cycleSize);

  sortedShooters.forEach((shooter) => {
    const position = Number(shooter.squad_position || 0);
    const targetIndex = position >= 1 && position <= cycleSize
      ? position - 1
      : slots.findIndex((slot) => slot === null);

    if (targetIndex >= 0) {
      slots[targetIndex] = shooter;
    }
  });

  return slots;
}

function getTrapRotatedSlots(groupShooters: Shooter[], roundIndex: number) {
  const initialSlots = getTrapInitialSlots(groupShooters);
  const cycleSize = initialSlots.length || trapStationsCount;

  return initialSlots.map((_shooter, stationIndex) => {
    const sourceIndex = (
      stationIndex
      - (roundIndex % cycleSize)
      + cycleSize
    ) % cycleSize;

    return initialSlots[sourceIndex];
  });
}

function getTrapPositionShooters(groupShooters: Shooter[], roundIndex: number) {
  return getTrapRotatedSlots(groupShooters, roundIndex).slice(0, trapStationsCount);
}

function getTrapWaitingShooter(groupShooters: Shooter[], roundIndex: number) {
  if (getTrapCycleSize(groupShooters) <= trapStationsCount) {
    return null;
  }

  return getTrapRotatedSlots(groupShooters, roundIndex)[trapStationsCount] ?? null;
}

function getTrapScheduleRoundCount(groupShooters: Shooter[], format: TrapFormat) {
  if (format.phases.length <= 0) {
    return 0;
  }

  return format.phases.length * getTrapCycleSize(groupShooters);
}

function getTrapStationVisitIndexForShooter(
  groupShooters: Shooter[],
  participantId: number,
  roundIndex: number
) {
  const cycleSize = getTrapCycleSize(groupShooters);
  const phaseStartRound = Math.floor(roundIndex / cycleSize) * cycleSize;
  let activeRoundIndex = 0;

  for (
    let previousRoundIndex = phaseStartRound;
    previousRoundIndex < roundIndex;
    previousRoundIndex += 1
  ) {
    const wasActive = getTrapPositionShooters(groupShooters, previousRoundIndex).some(
      (shooter) => shooter?.participant_id === participantId
    );

    if (wasActive) {
      activeRoundIndex += 1;
    }
  }

  const isActiveNow = getTrapPositionShooters(groupShooters, roundIndex).some(
    (shooter) => shooter?.participant_id === participantId
  );

  return isActiveNow ? activeRoundIndex : -1;
}

function getTrapScoreIndexForShooter(
  groupShooters: Shooter[],
  participantId: number,
  roundIndex: number,
  targetIndex: number,
  format: TrapFormat
) {
  const phaseIndex = getTrapPhaseIndex(groupShooters, roundIndex);
  const phase = format.phases[phaseIndex];
  const stationVisitIndex = getTrapStationVisitIndexForShooter(
    groupShooters,
    participantId,
    roundIndex
  );

  if (!phase || targetIndex >= phase.targetsPerStation) {
    return -1;
  }

  return stationVisitIndex >= 0
    ? getTrapPhaseStartScoreIndex(format, phaseIndex)
      + stationVisitIndex * phase.targetsPerStation
      + targetIndex
    : -1;
}

function getTrapActiveCells(
  groupShooters: Shooter[],
  roundIndex: number,
  format: TrapFormat
) {
  const activeCells: {
    stationIndex: number;
    targetIndex: number;
    shooter: Shooter;
    scoreIndex: number;
  }[] = [];

  const phase = format.phases[getTrapPhaseIndex(groupShooters, roundIndex)];
  const targetsPerStation = phase?.targetsPerStation || 0;
  const positionShooters = getTrapPositionShooters(groupShooters, roundIndex);

  const addActiveCell = (
    shooter: Shooter | null,
    stationIndex: number,
    targetIndex: number
  ) => {
    if (!shooter) {
      return;
    }

    activeCells.push({
      stationIndex,
      targetIndex,
      shooter,
      scoreIndex: getTrapScoreIndexForShooter(
        groupShooters,
        shooter.participant_id,
        roundIndex,
        targetIndex,
        format
      ),
    });
  };

  if (format.hunting && targetsPerStation === 2) {
    positionShooters.forEach((shooter, stationIndex) => {
      for (let targetIndex = 0; targetIndex < targetsPerStation; targetIndex += 1) {
        addActiveCell(shooter, stationIndex, targetIndex);
      }
    });

    return activeCells;
  }

  for (let targetIndex = 0; targetIndex < targetsPerStation; targetIndex += 1) {
    positionShooters.forEach((shooter, stationIndex) => {
      addActiveCell(shooter, stationIndex, targetIndex);
    });
  }

  return activeCells;
}

function emptyScoreValues(count: number) {
  return Array.from(
    { length: count },
    () => null as TrapScoreValue
  );
}

function emptyTrapScores(format: TrapFormat) {
  return emptyScoreValues(format.targetsCount);
}

function parseTrapScores(resultData: string, format: TrapFormat) {
  try {
    const parsed = JSON.parse(resultData || "[]");

    if (!Array.isArray(parsed)) {
      return emptyTrapScores(format);
    }

    return emptyTrapScores(format).map((_value, index) => {
      const score = parsed[index];
      return score === 1 || score === 0 ? score : null;
    });
  } catch {
    return emptyTrapScores(format);
  }
}

function findFirstTrapProgress(
  groupShooters: Shooter[],
  scheduleRoundCount: number,
  scoresByParticipant: Record<number, TrapScoreValue[]>,
  format: TrapFormat
) {
  for (let roundIndex = 0; roundIndex < scheduleRoundCount; roundIndex += 1) {
    const activeCells = getTrapActiveCells(groupShooters, roundIndex, format);

    for (let shotIndex = 0; shotIndex < activeCells.length; shotIndex += 1) {
      const activeCell = activeCells[shotIndex];
      const shooterScores = scoresByParticipant[activeCell.shooter.participant_id] || [];

      if ((shooterScores[activeCell.scoreIndex] ?? null) === null) {
        return {
          completed: false,
          roundIndex,
          shotIndex,
        };
      }
    }
  }

  return {
    completed: true,
    roundIndex: Math.max(scheduleRoundCount - 1, 0),
    shotIndex: -1,
  };
}

function buildTrapScoresByParticipant(groupShooters: Shooter[], format: TrapFormat) {
  return groupShooters.reduce<Record<number, TrapScoreValue[]>>(
    (scoresByParticipant, shooter) => ({
      ...scoresByParticipant,
      [shooter.participant_id]: parseTrapScores(shooter.result_data || "", format),
    }),
    {}
  );
}

function trapScoresHaveAnyValue(scoresByParticipant: Record<number, TrapScoreValue[]>) {
  return Object.values(scoresByParticipant).some((scores) =>
    scores.some((score) => score === 1 || score === 0)
  );
}

function buildTrapResumeHistory(
  groupShooters: Shooter[],
  scheduleRoundCount: number,
  scoresByParticipant: Record<number, TrapScoreValue[]>,
  progress: ReturnType<typeof findFirstTrapProgress>,
  format: TrapFormat
) {
  const history: TrapHistoryEntry[] = [];

  for (let roundIndex = 0; roundIndex < scheduleRoundCount; roundIndex += 1) {
    const activeCells = getTrapActiveCells(groupShooters, roundIndex, format);

    for (let shotIndex = 0; shotIndex < activeCells.length; shotIndex += 1) {
      if (
        !progress.completed
        && progress.roundIndex === roundIndex
        && progress.shotIndex === shotIndex
      ) {
        return history;
      }

      const activeCell = activeCells[shotIndex];
      const shooterScores = scoresByParticipant[activeCell.shooter.participant_id] || [];
      const score = shooterScores[activeCell.scoreIndex] ?? null;

      if (score === 1 || score === 0) {
        history.push({
          participantId: activeCell.shooter.participant_id,
          scoreIndex: activeCell.scoreIndex,
          roundIndex,
          shotIndex,
          previousValue: null,
        });
      }
    }
  }

  return history;
}

function getTrapGroupState(groupShooters: Shooter[], format: TrapFormat) {
  const scheduleRoundCount = getTrapScheduleRoundCount(groupShooters, format);
  const scoresByParticipant = buildTrapScoresByParticipant(groupShooters, format);
  const progress = findFirstTrapProgress(
    groupShooters,
    scheduleRoundCount,
    scoresByParticipant,
    format
  );
  const hasAnyScore = trapScoresHaveAnyValue(scoresByParticipant);
  const status: TrapGroupStatus = progress.completed
    ? "completed"
    : hasAnyScore
    ? "in-progress"
    : "not-started";

  return {
    progress,
    scoresByParticipant,
    status,
    resumeHistory: buildTrapResumeHistory(
      groupShooters,
      scheduleRoundCount,
      scoresByParticipant,
      progress,
      format
    ),
  };
}

function trapScoreTotal(scores: TrapScoreValue[] | undefined, fallbackPoints = "") {
  if (!scores || scores.every((score) => score === null)) {
    return parseScore(fallbackPoints);
  }

  return scores.reduce<number>(
    (sum, score) => sum + (score === 1 ? clayHitPoints : 0),
    0
  );
}

function buildSkeetTurns(groupShooters: Shooter[], totalRounds: number) {
  const orderedShooters = [...groupShooters].sort((first, second) =>
    (first.squad_position || 99) - (second.squad_position || 99)
  );
  const turns: SkeetTurn[] = [];

  for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
    skeetStages.forEach((stage, stageIndex) => {
      orderedShooters.forEach((shooter) => {
        stage.presentations.forEach((presentation) => {
          turns.push({ roundIndex, stageIndex, shooter, presentation });
        });
      });
    });
  }

  return turns;
}

function parseSkeetScores(resultData: string, totalRounds: number) {
  const emptyScores = emptyScoreValues(totalRounds * 25);

  try {
    const parsed = JSON.parse(resultData || "{}");
    const rounds = parsed?.discipline === "skeet" && Array.isArray(parsed.rounds)
      ? parsed.rounds
      : [];

    rounds.forEach((round: { targets?: { score?: unknown }[] }, roundIndex: number) => {
      if (roundIndex >= totalRounds || !Array.isArray(round.targets)) {
        return;
      }

      round.targets.forEach((target, targetIndex) => {
        const score = target?.score;
        if (targetIndex < 25 && (score === 0 || score === 1)) {
          emptyScores[roundIndex * 25 + targetIndex] = score;
        }
      });
    });
  } catch {
    return emptyScores;
  }

  return emptyScores;
}

function buildSkeetResultData(scores: TrapScoreValue[], totalRounds: number) {
  return JSON.stringify({
    version: 1,
    discipline: "skeet",
    rounds: Array.from({ length: totalRounds }, (_round, roundIndex) => ({
      round_number: roundIndex + 1,
      targets: skeetTargetDefinitions.map((target, targetIndex) => ({
        ...target,
        score: scores[roundIndex * 25 + targetIndex] ?? null,
      })),
      penalties: [],
    })),
  });
}

function getSkeetGroupState(groupShooters: Shooter[], totalRounds: number) {
  const scoresByParticipant = groupShooters.reduce<Record<number, TrapScoreValue[]>>(
    (result, shooter) => ({
      ...result,
      [shooter.participant_id]: parseSkeetScores(shooter.result_data || "", totalRounds),
    }),
    {}
  );
  const turns = buildSkeetTurns(groupShooters, totalRounds);
  const firstIncompleteTurn = turns.findIndex((turn) =>
    turn.presentation.targetIndexes.some((targetIndex) =>
      (scoresByParticipant[turn.shooter.participant_id]?.[turn.roundIndex * 25 + targetIndex] ?? null) === null
    )
  );
  const completed = firstIncompleteTurn === -1;
  const hasAnyScore = Object.values(scoresByParticipant).some((scores) =>
    scores.some((score) => score === 0 || score === 1)
  );

  return {
    scoresByParticipant,
    turns,
    turnIndex: completed ? Math.max(turns.length - 1, 0) : firstIncompleteTurn,
    status: (completed ? "completed" : hasAnyScore ? "in-progress" : "not-started") as TrapGroupStatus,
  };
}

function lockLandscapeOrientation() {
  const orientation = typeof screen !== "undefined"
    ? screen.orientation as ScreenOrientation & {
    lock?: (orientation: "landscape") => Promise<void>;
  }
    : undefined;
  const lockPromise = orientation?.lock?.("landscape");

  lockPromise?.catch(() => undefined);
}

function unlockScreenOrientation() {
  const orientation = typeof screen !== "undefined"
    ? screen.orientation as ScreenOrientation & {
    unlock?: () => void;
  }
    : undefined;

  try {
    orientation?.unlock?.();
  } catch {
    // Some mobile browsers expose partial orientation APIs.
  }
}

export default function JudgeDisciplinePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{
    competitionId: string;
    disciplineId: string;
  }>();
  const competitionId = Number(params.competitionId);
  const disciplineId = Number(params.disciplineId);
  const organizerTestMode = searchParams.get("test") === organizerJudgingTestQueryValue;

  const [competitions, setCompetitions] = useState<JudgeCompetition[]>([]);
  const [shooters, setShooters] = useState<Shooter[]>([]);
  const [loading, setLoading] = useState(true);
  const [shootersLoading, setShootersLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [shooterFilter, setShooterFilter] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [highlightedParticipantId, setHighlightedParticipantId] = useState<number | null>(null);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [standardResultDraft, setStandardResultDraft] = useState<StandardResultDraft | null>(null);
  const [activeTrapGroup, setActiveTrapGroup] = useState<{
    groupNumber: number;
    shooters: Shooter[];
  } | null>(null);
  const [trapRoundIndex, setTrapRoundIndex] = useState(0);
  const [trapShotIndex, setTrapShotIndex] = useState(0);
  const [trapScores, setTrapScores] = useState<Record<number, TrapScoreValue[]>>({});
  const [trapHistory, setTrapHistory] = useState<TrapHistoryEntry[]>([]);
  const [trapSaving, setTrapSaving] = useState(false);
  const trapScreenRef = useRef<HTMLDivElement | null>(null);
  const [activeSkeetGroup, setActiveSkeetGroup] = useState<{
    groupNumber: number;
    shooters: Shooter[];
  } | null>(null);
  const [skeetTurnIndex, setSkeetTurnIndex] = useState(0);
  const [skeetScores, setSkeetScores] = useState<Record<number, TrapScoreValue[]>>({});
  const [skeetHistory, setSkeetHistory] = useState<SkeetHistoryEntry[]>([]);
  const [skeetSaving, setSkeetSaving] = useState(false);
  const [skeetReadOnly, setSkeetReadOnly] = useState(false);
  const skeetScreenRef = useRef<HTMLDivElement | null>(null);
  const keyboardActionPendingRef = useRef(false);
  const [practicalShotgunInputs, setPracticalShotgunInputs] = useState<Record<number, PracticalShotgunInput>>({});
  const [practicalShotgunSavingId, setPracticalShotgunSavingId] = useState<number | null>(null);
  const [activeStageId, setActiveStageId] = useState<number | null>(null);
  const [expandedDynamicShooterId, setExpandedDynamicShooterId] = useState<number | null>(null);
  const [stageScoreInputs, setStageScoreInputs] = useState<Record<number, Record<number, StageScoreInput>>>({});
  const [stageScoreSavingId, setStageScoreSavingId] = useState<number | null>(null);

  useEffect(() => {
    const token = getAccessToken();

    if (!token) {
      router.push("/login");
      return;
    }

    if (organizerTestMode && !isOrganizer()) {
      router.push("/");
      return;
    }

    if (isPzssClubAccount()) {
      router.replace("/profile");
      return;
    }

    async function loadData() {
      try {
        if (organizerTestMode) {
          const competitionResponse = await fetch(
            apiUrl(`/organizer/competitions/${competitionId}`),
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );
          const competitionData = await competitionResponse.json();

          if (!competitionResponse.ok) {
            setMessage(competitionData.detail || "Nie udało się pobrać zawodów do testu ❌");
            return;
          }

          const loadedDiscipline = competitionData.disciplines?.find(
            (item: JudgeDiscipline) => item.id === disciplineId
          );

          if (!loadedDiscipline) {
            setCompetitions(buildOrganizerPreviewCompetitions(competitionData));
            setShooters([]);
            setMessage("Ta konkurencja nie istnieje w wybranych zawodach ❌");
            return;
          }

          const previewShooters = buildOrganizerPreviewShooters(competitionData, disciplineId);
          const previewCompetitions = buildOrganizerPreviewCompetitions(competitionData);
          const loadedStages = loadedDiscipline.stages || [];

          setCompetitions(previewCompetitions);
          setShooters(previewShooters);
          setPracticalShotgunInputs(practicalShotgunInputsFromShooters(previewShooters));

          if (loadedStages.length > 0) {
            setActiveStageId((currentStageId) => currentStageId || loadedStages[0].id);
            setStageScoreInputs(stageScoreInputsFromShooters(previewShooters, loadedStages));
          }

          return;
        }

        const competitionsResponse = await fetch(
          apiUrl("/judge/competitions"),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        const competitionsData = await competitionsResponse.json();

        if (!competitionsResponse.ok) {
          setMessage(competitionsData.detail || "Nie udało się pobrać konkurencji ❌");
          return;
        }

        setCompetitions(competitionsData);
        setLoading(false);

        const shootersResponse = await fetch(
          apiUrl(`/judge/competitions/${competitionId}/disciplines/${disciplineId}/shooters`),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        const shootersData = await shootersResponse.json();

        if (!shootersResponse.ok) {
          setMessage(shootersData.detail || "Nie udało się pobrać zawodników ❌");
          return;
        }

        setShooters(shootersData.shooters);
        setPracticalShotgunInputs(practicalShotgunInputsFromShooters(shootersData.shooters));
        const loadedCompetition = competitionsData.find((item: JudgeCompetition) => item.id === competitionId);
        const loadedDiscipline = loadedCompetition?.disciplines.find((item: JudgeDiscipline) => item.id === disciplineId);
        const loadedStages = loadedDiscipline?.stages || [];

        if (loadedStages.length > 0) {
          setActiveStageId((currentStageId) => currentStageId || loadedStages[0].id);
          setStageScoreInputs(stageScoreInputsFromShooters(shootersData.shooters, loadedStages));
        }
      } catch (error) {
        console.error(error);
        setMessage("Błąd połączenia z serwerem ❌");
      } finally {
        setLoading(false);
        setShootersLoading(false);
      }
    }

    loadData();
  }, [competitionId, disciplineId, organizerTestMode, router]);

  const competition = useMemo(
    () => competitions.find((item) => item.id === competitionId),
    [competitionId, competitions]
  );
  const discipline = competition?.disciplines.find(
    (item) => item.id === disciplineId
  );
  const isHuntingTrap = Boolean(discipline && isHuntingTrapDiscipline(discipline));
  const isTrapDiscipline = discipline?.discipline_type === "trap";
  const isSkeetDiscipline = discipline?.discipline_type === "skeet";
  const isDynamicStageDiscipline = Boolean(discipline && isDynamicStageDisciplineType(discipline.discipline_type));
  const dynamicStages = discipline?.stages || [];
  const activeStage = dynamicStages.find((stage) => stage.id === activeStageId) || dynamicStages[0] || null;
  const activeStageScoreKey = activeStage ? String(activeStage.id) : "";
  const isPracticalShotgunDiscipline = discipline?.discipline_type === PRACTICAL_SHOTGUN_DISCIPLINE_TYPE && !isDynamicStageDiscipline;
  const practicalShotgunTargetsCount = Math.max(Number(discipline?.shots_count || 0), 0);
  const practicalShotgunTimeLimit = Math.max(Number(discipline?.trap_series_count || 0), 0);
  const trapSeriesCount = isTrapDiscipline
    ? Math.max(Number(discipline?.clay_series_count || discipline?.trap_series_count || 1), 1)
    : 0;
  const trapFormat = useMemo(
    () => buildTrapFormat(isHuntingTrap, trapSeriesCount),
    [isHuntingTrap, trapSeriesCount]
  );
  const activeTrapScheduleRoundCount = activeTrapGroup
    ? getTrapScheduleRoundCount(activeTrapGroup.shooters, trapFormat)
    : 0;
  const skeetRoundCount = isSkeetDiscipline
    ? Math.max(Number(discipline?.clay_series_count || 1), 1)
    : 0;
  const trapGroups = useMemo(() => {
    if (!isTrapDiscipline) {
      return [];
    }

    const groups = new Map<number, Shooter[]>();

    shooters.forEach((shooter) => {
      const groupNumber = Number(shooter.squad_group_number || 0);

      if (groupNumber <= 0) {
        return;
      }

      groups.set(groupNumber, [
        ...(groups.get(groupNumber) || []),
        shooter,
      ]);
    });

    return Array.from(groups.entries())
      .sort(([firstGroup], [secondGroup]) => firstGroup - secondGroup)
      .map(([groupNumber, groupShooters]) => ({
        groupNumber,
        shooters: sortTrapShooters(groupShooters).slice(0, trapSquadCycleSize),
      }));
  }, [isTrapDiscipline, shooters]);
  const skeetGroups = useMemo(() => {
    if (!isSkeetDiscipline) {
      return [];
    }

    const groups = new Map<number, Shooter[]>();
    shooters.forEach((shooter) => {
      const groupNumber = Number(shooter.squad_group_number || 0);
      if (groupNumber > 0) {
        groups.set(groupNumber, [...(groups.get(groupNumber) || []), shooter]);
      }
    });

    return Array.from(groups.entries())
      .sort(([firstGroup], [secondGroup]) => firstGroup - secondGroup)
      .map(([groupNumber, groupShooters]) => ({
        groupNumber,
        shooters: groupShooters
          .sort((first, second) => (first.squad_position || 99) - (second.squad_position || 99))
          .slice(0, 6),
      }));
  }, [isSkeetDiscipline, shooters]);
  const skeetTurns = useMemo(
    () => activeSkeetGroup ? buildSkeetTurns(activeSkeetGroup.shooters, skeetRoundCount) : [],
    [activeSkeetGroup, skeetRoundCount]
  );
  const activeSkeetTurn = skeetTurns[skeetTurnIndex];
  const trapActiveCells = useMemo(
    () => activeTrapGroup
      ? getTrapActiveCells(activeTrapGroup.shooters, trapRoundIndex, trapFormat)
      : [],
    [activeTrapGroup, trapFormat, trapRoundIndex]
  );
  const trapPositionShooters = useMemo(() => {
    if (!activeTrapGroup) {
      return [];
    }

    return getTrapPositionShooters(activeTrapGroup.shooters, trapRoundIndex);
  }, [activeTrapGroup, trapRoundIndex]);
  const trapWaitingShooter = activeTrapGroup
    ? getTrapWaitingShooter(activeTrapGroup.shooters, trapRoundIndex)
    : null;

  const trapCurrentTargetIndex = trapActiveCells[trapShotIndex]?.targetIndex ?? 0;
  const trapPhaseIndex = activeTrapGroup
    ? getTrapPhaseIndex(activeTrapGroup.shooters, trapRoundIndex)
    : 0;
  const trapPhase = trapFormat.phases[trapPhaseIndex];
  const trapRoundLabel = trapPhase?.label || "Trap";
  const trapCurrentScoreIndex = trapActiveCells[trapShotIndex]?.scoreIndex ?? 0;
  const trapTargetLabel = isHuntingTrap
    ? `rzutek ${trapCurrentScoreIndex + 1} z ${trapFormat.targetsCount}`
    : `rzutek ${trapCurrentTargetIndex + 1}`;
  const trapColumnLabels = isHuntingTrap
    ? ["rzutek 1", "rzutek 2", "—", "—", "—"]
    : ["rzutek 1", "rzutek 2", "rzutek 3", "rzutek 4", "rzutek 5"];

  const sortedShooters = useMemo(() => {
    const normalizedFilter = shooterFilter.trim().toLowerCase();
    const visibleShooters = shooters.filter((shooter) => {
      if (!normalizedFilter) {
        return true;
      }

      return [
        getShooterName(shooter),
        shooter.license_number,
        shooter.club,
        shooter.user_email,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedFilter);
    });

    return visibleShooters.sort((firstShooter, secondShooter) => {
      if (isDynamicStageDiscipline && activeStageScoreKey) {
        const firstHasStageScore = Boolean(firstShooter.stage_scores?.[activeStageScoreKey]);
        const secondHasStageScore = Boolean(secondShooter.stage_scores?.[activeStageScoreKey]);

        if (firstHasStageScore !== secondHasStageScore) {
          return firstHasStageScore ? 1 : -1;
        }
      }

      if (isPracticalShotgunDiscipline) {
        const firstHasResult = hasPracticalShotgunResult(firstShooter);
        const secondHasResult = hasPracticalShotgunResult(secondShooter);

        if (firstHasResult !== secondHasResult) {
          return firstHasResult ? 1 : -1;
        }
      }

      const firstValue = getSortValue(firstShooter, sortField);
      const secondValue = getSortValue(secondShooter, sortField);
      const sortResult = firstValue.localeCompare(
        secondValue,
        "pl",
        {
          sensitivity: "base",
          numeric: true,
        }
      );

      return sortDirection === "asc"
        ? sortResult
        : -sortResult;
    });
  }, [activeStageScoreKey, isDynamicStageDiscipline, isPracticalShotgunDiscipline, shooterFilter, shooters, sortDirection, sortField]);

  const resultsEnabled = organizerTestMode || competition?.status === "started";
  const backHref = organizerTestMode
    ? `/organizer/${competitionId}`
    : `/judge/${competitionId}`;

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

  function showScannedShooter(shooter: Shooter) {
    setHighlightedParticipantId(shooter.participant_id);
    setShooterFilter(getShooterName(shooter));
    if (isDynamicStageDiscipline) {
      setExpandedDynamicShooterId(shooter.participant_id);
    }
    setMessage(`Znaleziono zawodnika: ${getShooterName(shooter)} ✅`);

    window.setTimeout(() => {
      document
        .getElementById(`shooter-${shooter.participant_id}`)
        ?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
    }, 100);
  }

  function handleParticipantQrScan(value: string) {
    const qrPayload = parseParticipantQrPayload(value);

    setScannerOpen(false);

    if (!qrPayload.participantId && !qrPayload.licenseNumber && !qrPayload.licenseNumberDigits) {
      setMessage("Nie rozpoznano kodu QR zawodnika ❌");
      return;
    }

    const shooter = shooters.find((currentShooter) => {
      if (qrPayload.participantId && currentShooter.participant_id === qrPayload.participantId) {
        return true;
      }

      const currentLicense = currentShooter.license_number || "";
      const currentLicenseDigits = licenseDigits(currentLicense);

      return Boolean(
        qrPayload.licenseNumber
          && currentLicense.toLowerCase() === qrPayload.licenseNumber.toLowerCase()
      ) || Boolean(
        qrPayload.licenseNumberDigits
          && currentLicenseDigits
          && currentLicenseDigits === qrPayload.licenseNumberDigits
      );
    });

    if (!shooter) {
      setHighlightedParticipantId(null);
      setMessage("Brak zawodnika na liście tej dyscypliny ❌");
      return;
    }

    showScannedShooter(shooter);
  }

  async function saveResult(shooter: Shooter) {
    if (!resultsEnabled) {
      return;
    }

    if (discipline?.one_hand_bonus_enabled) {
      const parsedResult = parseStandardResult(shooter.result_data || "");
      setStandardResultDraft({
        shooter,
        points: parsedResult?.basePoints || shooter.points || "",
        oneHandBonus: parsedResult?.oneHandBonus || false,
      });
      return;
    }

    const points = window.prompt(
      `Podaj wynik: ${getShooterName(shooter)}`,
      shooter.points || ""
    );

    if (points === null) {
      return;
    }

    await saveStandardResult(shooter, points, false);
  }

  async function saveStandardResult(
    shooter: Shooter,
    points: string,
    oneHandBonus: boolean
  ) {
    const bonusEnabled = Boolean(discipline?.one_hand_bonus_enabled);
    const normalizedPoints = points.trim();
    const bonusResult = bonusEnabled
      ? standardResultData(normalizedPoints, oneHandBonus)
      : null;

    if (bonusEnabled && parseStandardPoints(normalizedPoints) === null) {
      setMessage("Wynik musi być liczbą, żeby doliczyć bonus jednej ręki ❌");
      return;
    }

    if (organizerTestMode) {
      setShooters((currentShooters) =>
        currentShooters.map((currentShooter) =>
          currentShooter.participant_id === shooter.participant_id
            ? {
                ...currentShooter,
                points: bonusResult?.finalPoints || normalizedPoints,
                result_data: bonusResult?.resultData || currentShooter.result_data,
              }
            : currentShooter
        )
      );
      setStandardResultDraft(null);
      setMessage("Wynik wpisany tylko w trybie testowym ✅");
      return;
    }

    const token = getAccessToken();

    try {
      setMessage("");

      const response = await fetch(
        apiUrl(`/judge/competitions/${competitionId}/disciplines/${disciplineId}/results`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            participant_id: shooter.participant_id,
            points: bonusResult?.finalPoints || normalizedPoints,
            result_data: bonusResult?.resultData,
          }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się zapisać wyniku ❌");
        return;
      }

      setShooters((currentShooters) =>
        currentShooters.map((currentShooter) =>
          currentShooter.participant_id === shooter.participant_id
            ? {
                ...currentShooter,
                points: data.points,
                result_data: data.result_data || bonusResult?.resultData || currentShooter.result_data,
              }
            : currentShooter
        )
      );
      setStandardResultDraft(null);
      setMessage("Wynik zapisany ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  function updatePracticalShotgunInput(
    participantId: number,
    field: keyof PracticalShotgunInput,
    value: string
  ) {
    setPracticalShotgunInputs((currentInputs) => ({
      ...currentInputs,
      [participantId]: {
        time: currentInputs[participantId]?.time || "",
        hits: currentInputs[participantId]?.hits || "",
        [field]: value,
      },
    }));
  }

  function practicalShotgunPreview(input: PracticalShotgunInput | undefined) {
    const time = Number((input?.time || "").replace(",", "."));
    const hits = Number(input?.hits || "");
    const hasHits = Boolean((input?.hits || "").trim());
    const validTime = Number.isFinite(time) && time > 0;
    const validHits = hasHits && Number.isInteger(hits) && hits >= 0 && hits <= practicalShotgunTargetsCount;
    const disqualified = validTime && practicalShotgunTimeLimit > 0 && time > practicalShotgunTimeLimit;

    return {
      time,
      hits,
      validTime,
      validHits,
      disqualified,
      factor: validTime && validHits && !disqualified
        ? formatFactor((hits * 10) / time)
        : "0.000",
    };
  }

  async function savePracticalShotgunResult(shooter: Shooter) {
    if (!resultsEnabled || practicalShotgunSavingId !== null) {
      return;
    }

    const input = practicalShotgunInputs[shooter.participant_id];
    const preview = practicalShotgunPreview(input);

    if (!preview.validTime) {
      setMessage("Czas musi być większy od 0 ❌");
      return;
    }

    if (!preview.validHits) {
      setMessage("Liczba trafień nie może być większa niż liczba celów ❌");
      return;
    }

    const safeInput = input || { time: "", hits: "" };
    const token = getAccessToken();
    const resultData = JSON.stringify({
      discipline: PRACTICAL_SHOTGUN_DISCIPLINE_TYPE,
      time_seconds: safeInput.time.replace(",", "."),
      hits: preview.hits,
      factor: preview.disqualified ? "0.000" : preview.factor,
      disqualified: preview.disqualified,
      disqualification_reason: preview.disqualified
        ? "Przekroczono limit czasu"
        : "",
    });

    if (organizerTestMode) {
      setShooters((currentShooters) =>
        currentShooters.map((currentShooter) =>
          currentShooter.participant_id === shooter.participant_id
            ? {
                ...currentShooter,
                points: preview.disqualified ? "0.000" : preview.factor,
                result_data: resultData,
              }
            : currentShooter
        )
      );
      setMessage(preview.disqualified
        ? "Wynik testowy oznaczony jako DQ za przekroczenie limitu czasu ✅"
        : "Wynik wpisany tylko w trybie testowym ✅"
      );
      return;
    }

    try {
      setMessage("");
      setPracticalShotgunSavingId(shooter.participant_id);

      const response = await fetch(
        apiUrl(`/judge/competitions/${competitionId}/disciplines/${disciplineId}/results`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            participant_id: shooter.participant_id,
            points: preview.factor,
            result_data: resultData,
          }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się zapisać wyniku ❌");
        return;
      }

      setShooters((currentShooters) =>
        currentShooters.map((currentShooter) =>
          currentShooter.participant_id === shooter.participant_id
            ? {
                ...currentShooter,
                points: data.points,
                result_data: data.result_data || resultData,
              }
            : currentShooter
        )
      );
      setMessage(Number(data.points) === 0 && preview.disqualified
        ? "Wynik zapisany jako DQ za przekroczenie limitu czasu ✅"
        : "Wynik zapisany ✅"
      );
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setPracticalShotgunSavingId(null);
    }
  }

  function updateStageScoreInput(
    participantId: number,
    stageId: number,
    updater: (input: StageScoreInput) => StageScoreInput
  ) {
    setStageScoreInputs((currentInputs) => {
      const currentStageInput = currentInputs[participantId]?.[stageId]
        || emptyStageScoreInput(
          activeStage || undefined,
          null,
          shooters.find((shooter) => shooter.participant_id === participantId)
        );

      return {
        ...currentInputs,
        [participantId]: {
          ...(currentInputs[participantId] || {}),
          [stageId]: updater(currentStageInput),
        },
      };
    });
  }

  function setStageScoreField<Field extends keyof StageScoreInput>(
    participantId: number,
    stageId: number,
    field: Field,
    value: StageScoreInput[Field]
  ) {
    updateStageScoreInput(participantId, stageId, (input) => ({
      ...input,
      [field]: value,
    }));
  }

  function setStageScoreCounter(
    participantId: number,
    stage: CompetitionStage,
    field: StageScoreCounterField,
    value: number
  ) {
    updateStageScoreInput(participantId, stage.id, (input) => ({
      ...input,
      [field]: clampCounterValue(value, stageScoreCounterMax(stage, input, field)),
    }));
  }

  function adjustStageScoreCounter(
    participantId: number,
    stage: CompetitionStage,
    field: StageScoreCounterField,
    delta: number
  ) {
    updateStageScoreInput(participantId, stage.id, (input) => ({
      ...input,
      [field]: clampCounterValue(
        Number(input[field] || 0) + delta,
        stageScoreCounterMax(stage, input, field)
      ),
    }));
  }

  function clearStageScoreInput(shooter: Shooter, stage: CompetitionStage) {
    updateStageScoreInput(shooter.participant_id, stage.id, () => emptyStageScoreInput(stage, null, shooter));
  }

  async function saveDynamicStageScore(shooter: Shooter, stage: CompetitionStage) {
    if (!resultsEnabled || stageScoreSavingId !== null) {
      return;
    }

    const input = stageScoreInputs[shooter.participant_id]?.[stage.id] || emptyStageScoreInput(stage, null, shooter);
    const sanitizedInput = sanitizeStageScoreInput(stage, input);
    const preview = dynamicStagePreview(stage, input);

    if (!preview.validTime) {
      setMessage("Czas musi być większy od 0 ❌");
      return;
    }

    const token = getAccessToken();

    if (organizerTestMode) {
      const score = buildTestStageScorePayload(stage, shooter, input);

      setShooters((currentShooters) =>
        currentShooters.map((currentShooter) =>
          currentShooter.participant_id === shooter.participant_id
            ? {
                ...currentShooter,
                points: score.stage_points || currentShooter.points,
                stage_scores: {
                  ...(currentShooter.stage_scores || {}),
                  [String(stage.id)]: score,
                },
              }
            : currentShooter
        )
      );
      setStageScoreInputs((currentInputs) => ({
        ...currentInputs,
        [shooter.participant_id]: {
          ...(currentInputs[shooter.participant_id] || {}),
          [stage.id]: emptyStageScoreInput(stage, score, shooter),
        },
      }));
      setExpandedDynamicShooterId(null);
      setMessage("Wynik Stage wpisany tylko w trybie testowym ✅");
      return;
    }

    try {
      setMessage("");
      setStageScoreSavingId(shooter.participant_id);

      const response = await fetch(
        apiUrl(`/judge/competitions/${competitionId}/disciplines/${disciplineId}/stages/${stage.id}/scores`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            competitor_id: shooter.participant_id,
            ...sanitizedInput,
            custom_penalties: sanitizedInput.custom_penalties.filter((penalty) => penalty.name || penalty.count > 0),
          }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się zapisać wyniku Stage ❌");
        return;
      }

      setShooters((currentShooters) =>
        currentShooters.map((currentShooter) =>
          currentShooter.participant_id === shooter.participant_id
            ? {
                ...currentShooter,
                points: data.final_classification?.find(
                  (row: { competitor_id: number }) => row.competitor_id === shooter.participant_id
                )?.stage_points || currentShooter.points,
                stage_scores: {
                  ...(currentShooter.stage_scores || {}),
                  [String(stage.id)]: data.score,
                },
              }
            : currentShooter
        )
      );
      setStageScoreInputs((currentInputs) => ({
        ...currentInputs,
        [shooter.participant_id]: {
          ...(currentInputs[shooter.participant_id] || {}),
          [stage.id]: emptyStageScoreInput(stage, data.score, shooter),
        },
      }));
      setExpandedDynamicShooterId(null);
      setMessage("Wynik Stage zapisany ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setStageScoreSavingId(null);
    }
  }

  async function saveTrapParticipantScore(
    participantId: number,
    points: number,
    scores: TrapScoreValue[]
  ) {
    if (organizerTestMode) {
      const resultData = JSON.stringify(scores);

      setShooters((currentShooters) =>
        currentShooters.map((currentShooter) =>
          currentShooter.participant_id === participantId
            ? {
                ...currentShooter,
                points: String(points),
                result_data: resultData,
              }
            : currentShooter
        )
      );
      return;
    }

    const token = getAccessToken();
    const resultData = JSON.stringify(scores);

    const response = await fetch(
      apiUrl(`/judge/competitions/${competitionId}/disciplines/${disciplineId}/results`),
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          participant_id: participantId,
          points: String(points),
          result_data: resultData,
        }),
      }
    );
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Nie udało się zapisać wyniku");
    }

    setShooters((currentShooters) =>
      currentShooters.map((currentShooter) =>
        currentShooter.participant_id === participantId
          ? {
              ...currentShooter,
              points: data.points,
              result_data: data.result_data || resultData,
            }
          : currentShooter
      )
    );
  }

  function requestTrapFullscreen() {
    window.setTimeout(() => {
      const fullscreenPromise = trapScreenRef.current?.requestFullscreen?.();
      fullscreenPromise?.catch(() => undefined);
      lockLandscapeOrientation();
    }, 50);
  }

  function startTrapGroup(groupNumber: number, groupShooters: Shooter[]) {
    const groupState = getTrapGroupState(groupShooters, trapFormat);

    setActiveTrapGroup({
      groupNumber,
      shooters: groupShooters,
    });
    setTrapRoundIndex(groupState.progress.roundIndex);
    setTrapShotIndex(groupState.progress.shotIndex);
    setTrapHistory(groupState.resumeHistory);
    setTrapScores((currentScores) => ({
      ...currentScores,
      ...groupState.scoresByParticipant,
    }));
    setMessage(groupState.progress.completed
      ? "Grupa ma już komplet wyników. Możesz ją otworzyć do podglądu."
      : ""
    );
    requestTrapFullscreen();
  }

  function closeTrapGroup() {
    const fullscreenPromise = document.fullscreenElement
      ? document.exitFullscreen?.()
      : undefined;
    fullscreenPromise?.catch(() => undefined);
    unlockScreenOrientation();
    setActiveTrapGroup(null);
    setTrapRoundIndex(0);
    setTrapShotIndex(0);
    setTrapHistory([]);
    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: "instant",
      });
    });
  }

  async function markTrapCell(value: 1 | 0) {
    if (!activeTrapGroup || trapSaving || !resultsEnabled) {
      return;
    }

    const activeCell = trapActiveCells[trapShotIndex];

    if (!activeCell) {
      return;
    }

    const { shooter, scoreIndex } = activeCell;

    if (scoreIndex < 0) {
      return;
    }

    const previousScores = trapScores[shooter.participant_id] || emptyTrapScores(trapFormat);
    const previousValue = previousScores[scoreIndex] ?? null;
    const nextScoresForShooter = [...previousScores];
    nextScoresForShooter[scoreIndex] = value;
    const nextScores = {
      ...trapScores,
      [shooter.participant_id]: nextScoresForShooter,
    };
    const nextTotal = trapScoreTotal(nextScoresForShooter, shooter.points);
    const groupCompleted = trapShotIndex + 1 >= trapActiveCells.length
      && trapRoundIndex + 1 >= activeTrapScheduleRoundCount;

    setTrapScores(nextScores);
    setTrapHistory((currentHistory) => [
      ...currentHistory,
      {
        participantId: shooter.participant_id,
        scoreIndex,
        roundIndex: trapRoundIndex,
        shotIndex: trapShotIndex,
        previousValue,
      },
    ]);

    if (trapShotIndex + 1 < trapActiveCells.length) {
      setTrapShotIndex((currentIndex) => currentIndex + 1);
    } else if (trapRoundIndex + 1 < activeTrapScheduleRoundCount) {
      setTrapRoundIndex((currentRound) => currentRound + 1);
      setTrapShotIndex(0);
    }

    try {
      setTrapSaving(true);
      await saveTrapParticipantScore(shooter.participant_id, nextTotal, nextScoresForShooter);
      if (groupCompleted) {
        setMessage(`Grupa ${activeTrapGroup.groupNumber} zakończyła strzelanie ✅`);
        closeTrapGroup();
      }
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? `${error.message} ❌` : "Nie udało się zapisać wyniku ❌");
    } finally {
      setTrapSaving(false);
    }
  }

  async function undoTrapCell() {
    if (trapSaving || trapHistory.length === 0) {
      return;
    }

    const lastEntry = trapHistory[trapHistory.length - 1];
    const shooter = shooters.find((currentShooter) =>
      currentShooter.participant_id === lastEntry.participantId
    );

    if (!shooter) {
      return;
    }

    const previousScores = trapScores[lastEntry.participantId] || emptyTrapScores(trapFormat);
    const nextScoresForShooter = [...previousScores];
    nextScoresForShooter[lastEntry.scoreIndex] = lastEntry.previousValue;
    const nextTotal = trapScoreTotal(nextScoresForShooter, shooter.points);

    setTrapScores((currentScores) => ({
      ...currentScores,
      [lastEntry.participantId]: nextScoresForShooter,
    }));
    setTrapHistory((currentHistory) => currentHistory.slice(0, -1));
    setTrapRoundIndex(lastEntry.roundIndex);
    setTrapShotIndex(lastEntry.shotIndex);

    try {
      setTrapSaving(true);
      await saveTrapParticipantScore(lastEntry.participantId, nextTotal, nextScoresForShooter);
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? `${error.message} ❌` : "Nie udało się zapisać cofnięcia ❌");
    } finally {
      setTrapSaving(false);
    }
  }

  async function saveSkeetParticipantScore(participantId: number, scores: TrapScoreValue[]) {
    if (organizerTestMode) {
      const points = trapScoreTotal(scores);
      const resultData = buildSkeetResultData(scores, skeetRoundCount);

      setShooters((currentShooters) => currentShooters.map((shooter) =>
        shooter.participant_id === participantId
          ? { ...shooter, points: String(points), result_data: resultData }
          : shooter
      ));
      return;
    }

    const token = getAccessToken();
    const points = trapScoreTotal(scores);
    const resultData = buildSkeetResultData(scores, skeetRoundCount);
    const response = await fetch(
      apiUrl(`/judge/competitions/${competitionId}/disciplines/${disciplineId}/results`),
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          participant_id: participantId,
          points: String(points),
          result_data: resultData,
        }),
      }
    );
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Nie udało się zapisać wyniku Skeet");
    }

    setShooters((currentShooters) => currentShooters.map((shooter) =>
      shooter.participant_id === participantId
        ? { ...shooter, points: data.points, result_data: data.result_data || resultData }
        : shooter
    ));
  }

  function startSkeetGroup(groupNumber: number, groupShooters: Shooter[]) {
    const groupState = getSkeetGroupState(groupShooters, skeetRoundCount);
    setActiveSkeetGroup({ groupNumber, shooters: groupShooters });
    setSkeetTurnIndex(groupState.turnIndex);
    setSkeetScores(groupState.scoresByParticipant);
    setSkeetHistory([]);
    setSkeetReadOnly(groupState.status === "completed");
    setMessage(groupState.status === "completed"
      ? "Grupa ma już komplet wyników. Otwierasz ją w trybie podglądu."
      : ""
    );
    window.setTimeout(() => {
      const fullscreenPromise = skeetScreenRef.current?.requestFullscreen?.();
      fullscreenPromise?.catch(() => undefined);
      lockLandscapeOrientation();
    }, 50);
  }

  function closeSkeetGroup() {
    const fullscreenPromise = document.fullscreenElement ? document.exitFullscreen?.() : undefined;
    fullscreenPromise?.catch(() => undefined);
    unlockScreenOrientation();
    setActiveSkeetGroup(null);
    setSkeetTurnIndex(0);
    setSkeetHistory([]);
    setSkeetReadOnly(false);
  }

  async function markSkeetPresentation(values: (0 | 1)[]) {
    if (!activeSkeetGroup || !activeSkeetTurn || skeetSaving || !resultsEnabled) {
      return;
    }

    if (values.length !== activeSkeetTurn.presentation.targetIndexes.length) {
      return;
    }

    const participantId = activeSkeetTurn.shooter.participant_id;
    const previousScores = skeetScores[participantId] || emptyScoreValues(skeetRoundCount * 25);
    const scoreIndexes = activeSkeetTurn.presentation.targetIndexes.map(
      (targetIndex) => activeSkeetTurn.roundIndex * 25 + targetIndex
    );
    const previousValues = scoreIndexes.map((scoreIndex) => previousScores[scoreIndex] ?? null);
    const nextScores = [...previousScores];
    scoreIndexes.forEach((scoreIndex, index) => {
      nextScores[scoreIndex] = values[index];
    });

    try {
      setSkeetSaving(true);
      await saveSkeetParticipantScore(participantId, nextScores);
      setSkeetScores((current) => ({ ...current, [participantId]: nextScores }));
      setSkeetHistory((current) => [...current, {
        participantId,
        scoreIndexes,
        previousValues,
        turnIndex: skeetTurnIndex,
      }]);

      if (skeetTurnIndex + 1 >= skeetTurns.length) {
        setMessage(`Grupa ${activeSkeetGroup.groupNumber} zakończyła strzelanie Skeet ✅`);
        closeSkeetGroup();
      } else {
        setSkeetTurnIndex((current) => current + 1);
      }
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? `${error.message} ❌` : "Nie udało się zapisać wyniku Skeet ❌");
    } finally {
      setSkeetSaving(false);
    }
  }

  async function undoSkeetPresentation() {
    const lastEntry = skeetHistory[skeetHistory.length - 1];
    if (!lastEntry || skeetSaving) {
      return;
    }

    const currentScores = skeetScores[lastEntry.participantId] || emptyScoreValues(skeetRoundCount * 25);
    const nextScores = [...currentScores];
    lastEntry.scoreIndexes.forEach((scoreIndex, index) => {
      nextScores[scoreIndex] = lastEntry.previousValues[index];
    });

    try {
      setSkeetSaving(true);
      await saveSkeetParticipantScore(lastEntry.participantId, nextScores);
      setSkeetScores((current) => ({ ...current, [lastEntry.participantId]: nextScores }));
      setSkeetTurnIndex(lastEntry.turnIndex);
      setSkeetHistory((current) => current.slice(0, -1));
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? `${error.message} ❌` : "Nie udało się cofnąć wyniku Skeet ❌");
    } finally {
      setSkeetSaving(false);
    }
  }

  useEffect(() => {
    if (!activeTrapGroup && !activeSkeetGroup) {
      return;
    }

    function runKeyboardAction(action: () => Promise<void>) {
      if (keyboardActionPendingRef.current) {
        return;
      }

      keyboardActionPendingRef.current = true;
      action().finally(() => {
        keyboardActionPendingRef.current = false;
      });
    }

    function handleClayKeyboard(event: KeyboardEvent) {
      if (
        event.repeat
        || event.altKey
        || event.ctrlKey
        || event.metaKey
        || event.shiftKey
        || event.target instanceof HTMLInputElement
        || event.target instanceof HTMLTextAreaElement
        || event.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (activeTrapGroup) {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          runKeyboardAction(() => markTrapCell(1));
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          runKeyboardAction(() => markTrapCell(0));
        } else if (event.key === "Backspace") {
          event.preventDefault();
          runKeyboardAction(undoTrapCell);
        }

        return;
      }

      if (!activeSkeetGroup || !activeSkeetTurn) {
        return;
      }

      const isDouble = activeSkeetTurn.presentation.houses.length === 2;
      const handledSkeetKeys = isDouble
        ? ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Backspace"]
        : ["ArrowUp", "ArrowDown", "Backspace"];

      if (!handledSkeetKeys.includes(event.key)) {
        return;
      }

      event.preventDefault();

      if (skeetReadOnly || !resultsEnabled) {
        return;
      }

      let values: (0 | 1)[] | null = null;

      if (isDouble) {
        if (event.key === "ArrowUp") {
          values = [1, 1];
        } else if (event.key === "ArrowLeft") {
          values = [1, 0];
        } else if (event.key === "ArrowRight") {
          values = [0, 1];
        } else if (event.key === "ArrowDown") {
          values = [0, 0];
        }
      } else if (event.key === "ArrowUp") {
        values = [1];
      } else if (event.key === "ArrowDown") {
        values = [0];
      }

      if (values) {
        runKeyboardAction(() => markSkeetPresentation(values));
      } else if (event.key === "Backspace") {
        runKeyboardAction(undoSkeetPresentation);
      }
    }

    window.addEventListener("keydown", handleClayKeyboard);

    return () => {
      window.removeEventListener("keydown", handleClayKeyboard);
    };
  });

  const messageStyle = message.includes("❌")
    ? "border-red-600 bg-red-950 text-red-50 shadow-red-950/40"
    : message.includes("✅")
    ? "border-green-600 bg-green-950 text-green-50 shadow-green-950/40"
    : message.includes("⚠")
    ? "border-yellow-500 bg-yellow-950 text-yellow-50 shadow-yellow-950/40"
    : "border-zinc-700 bg-zinc-950 text-white shadow-black/40";

  return (
    <main className="min-h-screen overflow-x-hidden px-2 py-6 sm:px-6 lg:px-10">
      {message && (
        <div className="fixed inset-x-3 top-4 z-[70] flex justify-center sm:inset-x-auto sm:right-5 sm:top-5 sm:block">
          <div
            role="alert"
            className={`w-full max-w-md rounded-2xl border px-4 py-3 shadow-2xl ${messageStyle}`}
          >
            <div className="flex items-start gap-3">
              <p className="min-w-0 flex-1 break-words text-sm font-bold leading-6 sm:text-base">
                {message}
              </p>
              <button
                type="button"
                onClick={() => setMessage("")}
                className="shrink-0 rounded-lg border border-white/15 px-2 py-1 text-xs font-black text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}

      {activeSkeetGroup && activeSkeetTurn && (
        <div
          ref={skeetScreenRef}
          className="fixed inset-0 z-50 overflow-auto bg-slate-950 text-white"
        >
          <div className="mx-auto flex min-h-[100dvh] max-w-7xl flex-col p-3 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold uppercase tracking-widest text-sky-300">
                  Skeet • Grupa {activeSkeetGroup.groupNumber} • Seria {activeSkeetTurn.roundIndex + 1}/{skeetRoundCount}
                </p>
                <h2 className="text-3xl font-black sm:text-5xl">
                  Stanowisko {skeetStages[activeSkeetTurn.stageIndex].station}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeSkeetGroup}
                className="rounded-xl bg-white px-4 py-3 font-black text-slate-950"
              >
                Zamknij
              </button>
            </div>

            <div className="grid flex-1 gap-4 lg:grid-cols-[1fr_340px]">
              <section className="flex min-h-[440px] flex-col justify-between rounded-2xl border-2 border-sky-500 bg-slate-900 p-5 text-center">
                <div>
                  <p className="mb-2 text-lg font-bold text-slate-300">
                    Zawodnik {activeSkeetTurn.shooter.squad_position || "–"}
                  </p>
                  <h3 className="text-4xl font-black sm:text-6xl">
                    {getShooterName(activeSkeetTurn.shooter)}
                  </h3>
                  <div className="mx-auto max-w-md">
                    <ClubAmmoNotice shooter={activeSkeetTurn.shooter} />
                  </div>
                  <p className="mt-5 text-2xl font-black text-sky-300 sm:text-4xl">
                    {activeSkeetTurn.presentation.label}
                  </p>
                  <p className="mt-2 text-sm font-bold uppercase tracking-wider text-slate-400">
                    Rzutki {activeSkeetTurn.presentation.targetIndexes.map((index) => index + 1).join(" i ")} z 25
                  </p>
                </div>

                <div className="mt-8 grid gap-3">
                  {activeSkeetTurn.presentation.houses.length === 1 ? (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => markSkeetPresentation([1])}
                        disabled={skeetSaving || skeetReadOnly || !resultsEnabled}
                        className="rounded-2xl bg-green-600 px-4 py-8 text-3xl font-black disabled:bg-slate-600"
                      >
                        <span className="block">HIT</span>
                        <kbd className="mt-2 inline-flex min-w-10 items-center justify-center rounded-lg border border-white/40 bg-black/20 px-3 py-1 text-xl font-black shadow-inner">
                          ↑
                        </kbd>
                      </button>
                      <button
                        type="button"
                        onClick={() => markSkeetPresentation([0])}
                        disabled={skeetSaving || skeetReadOnly || !resultsEnabled}
                        className="rounded-2xl bg-red-600 px-4 py-8 text-3xl font-black disabled:bg-slate-600"
                      >
                        <span className="block">MISS</span>
                        <kbd className="mt-2 inline-flex min-w-10 items-center justify-center rounded-lg border border-white/40 bg-black/20 px-3 py-1 text-xl font-black shadow-inner">
                          ↓
                        </kbd>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        { values: [1, 1] as (0 | 1)[], label: "HIT / HIT", keyLabel: "↑", color: "bg-green-600" },
                        { values: [1, 0] as (0 | 1)[], label: "HIT / MISS", keyLabel: "←", color: "bg-lime-700" },
                        { values: [0, 1] as (0 | 1)[], label: "MISS / HIT", keyLabel: "→", color: "bg-orange-600" },
                        { values: [0, 0] as (0 | 1)[], label: "MISS / MISS", keyLabel: "↓", color: "bg-red-700" },
                      ].map((option) => (
                        <button
                          key={option.label}
                          type="button"
                          onClick={() => markSkeetPresentation(option.values)}
                          disabled={skeetSaving || skeetReadOnly || !resultsEnabled}
                          className={`rounded-2xl px-3 py-7 text-lg font-black disabled:bg-slate-600 ${option.color}`}
                        >
                          <span className="block">{option.label}</span>
                          <kbd className="mt-2 inline-flex min-w-10 items-center justify-center rounded-lg border border-white/40 bg-black/20 px-3 py-1 text-xl font-black shadow-inner">
                            {option.keyLabel}
                          </kbd>
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={undoSkeetPresentation}
                    disabled={skeetSaving || skeetHistory.length === 0}
                    className="rounded-xl bg-yellow-400 px-4 py-4 text-xl font-black text-black disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    <span>COFNIJ</span>
                    <kbd className="ml-3 inline-flex items-center justify-center rounded-lg border border-black/30 bg-black/10 px-3 py-1 text-base font-black shadow-inner">
                      ⌫
                    </kbd>
                  </button>
                </div>
              </section>

              <aside className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
                <h3 className="mb-3 text-xl font-black">Kolejność grupy</h3>
                <div className="space-y-2">
                  {activeSkeetGroup.shooters.map((shooter) => {
                    const scores = skeetScores[shooter.participant_id] || [];
                    const roundScores = scores.slice(activeSkeetTurn.roundIndex * 25, (activeSkeetTurn.roundIndex + 1) * 25);
                    const active = shooter.participant_id === activeSkeetTurn.shooter.participant_id;
                    return (
                      <div
                        key={shooter.participant_id}
                        className={`grid grid-cols-[32px_1fr_auto] items-center gap-2 rounded-xl px-3 py-3 ${active ? "bg-sky-700" : "bg-slate-800"}`}
                      >
                        <span className="text-lg font-black">{shooter.squad_position || "–"}</span>
                        <span className="min-w-0">
                          <span className="block truncate font-bold">{getShooterName(shooter)}</span>
                          <ClubAmmoNotice shooter={shooter} compact />
                        </span>
                        <span className="text-lg font-black">
                          {trapScoreTotal(roundScores)}/{roundScores.filter((score) => score !== null).length * clayHitPoints}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-4 text-center text-sm font-bold text-slate-400">
                  Prezentacja {skeetTurnIndex + 1} z {skeetTurns.length}
                </p>
              </aside>
            </div>
          </div>
        </div>
      )}
      {activeTrapGroup && (
        <div
          ref={trapScreenRef}
          className="trap-score-screen fixed inset-0 z-50 overflow-hidden bg-white text-black"
        >
          <div className="trap-landscape-stage flex h-[100dvh] w-[100dvw] flex-col overflow-hidden bg-white p-2 text-black">
            <div className="mb-1 flex shrink-0 items-center justify-between gap-2 sm:mb-2">
              <div>
                <h2 className="text-[clamp(1.35rem,4.2vw,3rem)] font-black leading-none">
                  Grupa {activeTrapGroup.groupNumber}
                </h2>
                <p className="mt-1 text-[clamp(0.72rem,1.6vw,1.05rem)] font-bold text-gray-600">
                  Oczekujący: {trapWaitingShooter ? getShooterName(trapWaitingShooter) : "brak"}
                </p>
              </div>

              <button
                type="button"
                onClick={closeTrapGroup}
                className="rounded-lg bg-gray-900 px-3 py-2 text-[clamp(0.72rem,1.4vw,0.95rem)] font-black text-white sm:px-4 sm:py-3"
              >
                Zamknij
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-visible border-[3px] border-black">
              <div className="flex h-[clamp(34px,10dvh,72px)] shrink-0 items-center justify-center border-b-2 border-black text-center text-[clamp(1.35rem,5vw,3.25rem)] font-black leading-none">
                {trapRoundLabel} • {trapTargetLabel}
              </div>

              <div
                className="grid h-[clamp(32px,9dvh,68px)] shrink-0 border-b-2 border-black text-center text-[clamp(0.7rem,2vw,1.55rem)] font-black"
                style={{ gridTemplateColumns: trapScoreGridColumns }}
              >
                <div className="flex items-center justify-center border-r-2 border-black px-1">
                  Stanowisko
                </div>
                <div className="flex items-center justify-center border-r-2 border-black px-1">
                  Nazwisko Imię
                </div>
                {trapColumnLabels.map((label, targetIndex) => (
                  <div
                    key={`${label}-${targetIndex}`}
                    className="flex items-center justify-center border-r-2 border-black px-1"
                  >
                    {label}
                  </div>
                ))}
                <div className="flex items-center justify-center px-1">
                  wynik
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-visible">
                {trapPositionShooters.map((shooter, stationIndex) => {
                  const shooterScores = shooter
                    ? trapScores[shooter.participant_id] || emptyTrapScores(trapFormat)
                    : [];
                  const activeCell = trapActiveCells[trapShotIndex];

                  return (
                    <div
                      key={`${shooter?.participant_id || "empty"}-${stationIndex}`}
                      className="grid min-h-0 flex-1 border-b-2 border-black text-center last:border-b-0"
                      style={{ gridTemplateColumns: trapScoreGridColumns }}
                    >
                      <div className="flex items-center justify-center border-r-2 border-black text-[clamp(1rem,3vw,2rem)] font-black">
                        {stationIndex + 1}
                      </div>

                      <div className="flex items-center justify-center border-r-2 border-black px-2 text-left text-[clamp(0.82rem,2.2vw,1.65rem)] font-black leading-tight">
                        {shooter ? (
                          <span className="min-w-0">
                            <span className="block truncate">{getShooterName(shooter)}</span>
                            <ClubAmmoNotice shooter={shooter} compact light />
                          </span>
                        ) : (
                          <span className="text-[clamp(0.65rem,1.5vw,1rem)] text-gray-400">
                            Wolne stanowisko
                          </span>
                        )}
                      </div>

                      {[0, 1, 2, 3, 4].map((targetIndex) => {
                        const scoreIndex = shooter
                          ? getTrapScoreIndexForShooter(
                              activeTrapGroup.shooters,
                              shooter.participant_id,
                              trapRoundIndex,
                              targetIndex,
                              trapFormat
                            )
                          : -1;
                        const score = shooterScores[scoreIndex] ?? null;
                        const active = Boolean(shooter)
                          && activeCell?.stationIndex === stationIndex
                          && activeCell.targetIndex === targetIndex;

                        return (
                          <div
                            key={targetIndex}
                            className={`relative flex items-center justify-center overflow-visible border-r-2 border-black text-[clamp(1.8rem,6vw,4.2rem)] font-black leading-none ${
                              active ? "outline outline-4 -outline-offset-4 outline-green-700" : ""
                            } ${
                              shooter ? "" : "bg-gray-100"
                            }`}
                          >
                            {score === 1 && (
                              <span className="text-green-600">
                                5
                              </span>
                            )}

                            {score === 0 && (
                              <span className="text-red-600">
                                X
                              </span>
                            )}

                            {active && (
                              <div className="absolute left-1/2 top-1/2 z-30 grid w-[clamp(176px,34vw,310px)] -translate-x-1/2 -translate-y-1/2 grid-cols-3 gap-1 rounded-lg bg-white/95 p-1.5 shadow-2xl ring-2 ring-green-700 sm:gap-2 sm:p-2">
                                <button
                                  type="button"
                                  onClick={() => markTrapCell(1)}
                                  disabled={trapSaving || !resultsEnabled}
                                  className="rounded-lg bg-green-700 px-1 py-3 text-[clamp(0.76rem,1.8vw,1rem)] font-black text-white disabled:bg-gray-400"
                                >
                                  <span className="block">Hit</span>
                                  <kbd className="mt-1 inline-flex min-w-7 items-center justify-center rounded border border-white/40 bg-black/20 px-2 py-0.5 text-sm font-black shadow-inner">
                                    ↑
                                  </kbd>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => markTrapCell(0)}
                                  disabled={trapSaving || !resultsEnabled}
                                  className="rounded-lg bg-red-700 px-1 py-3 text-[clamp(0.76rem,1.8vw,1rem)] font-black text-white disabled:bg-gray-400"
                                >
                                  <span className="block">Miss</span>
                                  <kbd className="mt-1 inline-flex min-w-7 items-center justify-center rounded border border-white/40 bg-black/20 px-2 py-0.5 text-sm font-black shadow-inner">
                                    ↓
                                  </kbd>
                                </button>
                                <button
                                  type="button"
                                  onClick={undoTrapCell}
                                  disabled={trapSaving || trapHistory.length === 0}
                                  className="rounded-lg bg-yellow-400 px-1 py-3 text-[clamp(0.72rem,1.65vw,1rem)] font-black text-black disabled:bg-gray-300"
                                >
                                  <span className="block">Cofnij</span>
                                  <kbd className="mt-1 inline-flex min-w-7 items-center justify-center rounded border border-black/30 bg-black/10 px-2 py-0.5 text-sm font-black shadow-inner">
                                    ⌫
                                  </kbd>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <div className="flex items-center justify-center bg-gray-200 text-[clamp(1.6rem,5vw,3.5rem)] font-black leading-none">
                        {shooter ? trapScoreTotal(shooterScores, shooter.points) : "-"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-5xl min-w-0">
        <div className="mb-6 min-w-0">
          <Link
            href={backHref}
            className="mb-5 inline-flex bg-red-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-red-950/30 transition hover:bg-red-600 sm:px-5 sm:text-base"
          >
            {organizerTestMode ? "Wróć do szczegółów zawodów" : "Wróć do konkurencji"}
          </Link>

          <h1 className="mb-2 break-words text-3xl font-bold text-white sm:text-5xl">
            {discipline?.name || "Lista zawodników"}
          </h1>

          {competition && (
            <p className="break-words text-gray-400">
              {competition.name} • {competition.date} • {competition.location}
            </p>
          )}

          {organizerTestMode && (
            <div className="mt-4 rounded-xl border border-yellow-500 bg-yellow-950/50 px-4 py-3 text-sm font-bold text-yellow-100">
              Tryb testowy organizatora. Możesz wpisywać próbne wyniki, ale nic nie zostanie zapisane w zawodach.
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-gray-400">
            Ładowanie konkurencji...
          </p>
        ) : !competition || !discipline ? (
          <p className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-gray-300">
            Nie masz dostępu do tej konkurencji albo zawody nie są już opublikowane.
          </p>
        ) : isDynamicStageDiscipline ? (
          <section className="min-w-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
            <div className="border-b border-zinc-800 px-3 py-4 sm:px-5">
              <div className="flex flex-col gap-4">
                <div className="min-w-0">
                  <h2 className="break-words text-2xl font-bold text-white">
                    {discipline.name}
                  </h2>
                  <p className="break-words text-sm text-gray-400 sm:text-base">
                    Karta IPSC / dynamiczna: czas, trafienia, kary i Hit Factor liczą się na bieżąco.
                  </p>
                </div>

                {dynamicStages.length > 0 ? (
                  <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
                    {dynamicStages.map((stage) => (
                      <button
                        key={stage.id}
                        type="button"
                        onClick={() => {
                          setActiveStageId(stage.id);
                          setExpandedDynamicShooterId(null);
                        }}
                        className={`shrink-0 rounded-xl px-3 py-3 text-sm font-black transition sm:px-4 ${
                          activeStage?.id === stage.id
                            ? "bg-green-600 text-white"
                            : "bg-zinc-800 text-gray-300 hover:bg-zinc-700"
                        }`}
                      >
                        Stage {stage.stage_number}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-red-700 bg-red-950/40 p-4 font-bold text-red-100">
                    Brak konfiguracji Stage. Organizator musi uzupełnić tory przed sędziowaniem.
                  </p>
                )}

                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setMessage("");
                      setScannerOpen(true);
                    }}
                    className="group flex w-full min-w-0 items-center gap-4 text-left sm:w-fit sm:gap-5"
                  >
                    <NextImage
                      src="/icons/skaner.jpeg"
                      alt=""
                      width={1254}
                      height={1254}
                      sizes="(min-width: 640px) 144px, 112px"
                      className="h-24 w-24 shrink-0 rounded-2xl object-cover shadow-[0_12px_35px_rgba(34,197,94,0.22)] transition group-hover:scale-[1.03] group-hover:shadow-[0_14px_40px_rgba(34,197,94,0.34)] sm:h-36 sm:w-36"
                    />

                    <span className="min-w-0 max-w-xs">
                      <span className="block break-words text-lg font-black text-white transition group-hover:text-green-300 sm:text-2xl">
                        Skanuj QR zawodnika
                      </span>
                      <span className="mt-2 block break-words text-sm leading-5 text-gray-400 sm:text-base sm:leading-6">
                        Zeskanuj kod, aby szybko odnaleźć i rozwinąć kartę zawodnika.
                      </span>
                    </span>
                  </button>

                  <input
                    value={shooterFilter}
                    onChange={(event) => {
                      setShooterFilter(event.target.value);
                      setHighlightedParticipantId(null);
                      setExpandedDynamicShooterId(null);
                    }}
                    placeholder="Filtruj strzelca"
                    className="w-full min-w-0 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-base text-white placeholder:text-gray-500 focus:border-green-700 focus:outline-none sm:py-4 sm:text-lg"
                  />

                  <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    {[
                      { field: "name" as const, label: "Nazwisko" },
                      { field: "license" as const, label: "Licencja" },
                      { field: "club" as const, label: "Klub" },
                      { field: "points" as const, label: "Punkty" },
                    ].map((item) => (
                      <button
                        key={item.field}
                        type="button"
                        onClick={() => toggleSort(item.field)}
                        className={`min-w-0 rounded-xl px-3 py-2 text-sm font-bold transition ${
                          sortField === item.field
                            ? "bg-green-700 text-white"
                            : "bg-zinc-800 text-gray-300 hover:bg-zinc-700"
                        }`}
                      >
                        {item.label} {sortMark(item.field)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {!activeStage ? (
              <p className="px-4 py-5 text-gray-400">Brak Stage do punktowania.</p>
            ) : shootersLoading ? (
              <p className="px-4 py-5 text-gray-400">Ładowanie zawodników...</p>
            ) : sortedShooters.length === 0 ? (
              <p className="px-4 py-5 text-gray-400">Brak zawodników pasujących do filtra.</p>
            ) : (
              <div className="grid min-w-0 gap-3 p-2 sm:gap-4 sm:p-4">
                <div className="min-w-0 rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-white sm:p-4">
                  <p className="text-sm font-bold uppercase text-green-300">
                    Stage {activeStage.stage_number}
                  </p>
                  <h3 className="mt-1 break-words text-2xl font-black">{activeStage.name}</h3>
                  <p className="mt-2 break-words text-sm leading-6 text-gray-300">
                    {dynamicStageSummaryItems(activeStage).join(" • ")}
                  </p>
                </div>

                {sortedShooters.map((shooter) => {
                  const input = stageScoreInputs[shooter.participant_id]?.[activeStage.id]
                    || emptyStageScoreInput(activeStage, shooter.stage_scores?.[String(activeStage.id)] || null, shooter);
                  const displayInput = sanitizeStageScoreInput(activeStage, input);
                  const preview = dynamicStagePreview(activeStage, displayInput);
                  const savedScore = shooter.stage_scores?.[String(activeStage.id)];
                  const hasSavedScore = Boolean(savedScore);
                  const expanded = expandedDynamicShooterId === shooter.participant_id;
                  const steelMissFieldsEnabled = stageSteelMissFieldsEnabled(activeStage);
                  const counterFields: {
                    field: StageScoreCounterField;
                    label: string;
                  }[] = [
                    ...(stageHasPaperScoring(activeStage)
                      ? [
                          { field: "hits_a" as StageScoreCounterField, label: "A" },
                          { field: "hits_c" as StageScoreCounterField, label: "C" },
                          { field: "hits_d" as StageScoreCounterField, label: "D" },
                          { field: "paper_misses" as StageScoreCounterField, label: "Miss papier" },
                        ]
                      : []),
                    ...(activeStage.poppers > 0
                      ? [
                          { field: "popper_hits" as StageScoreCounterField, label: "Popper hit" },
                          ...(steelMissFieldsEnabled
                            ? [{ field: "popper_misses" as StageScoreCounterField, label: "Popper miss" }]
                            : []),
                        ]
                      : []),
                    ...(activeStage.mini_poppers > 0
                      ? [
                          { field: "mini_popper_hits" as StageScoreCounterField, label: "Mini popper hit" },
                          ...(steelMissFieldsEnabled
                            ? [{ field: "mini_popper_misses" as StageScoreCounterField, label: "Mini popper miss" }]
                            : []),
                        ]
                      : []),
                    ...(activeStage.plates > 0
                      ? [
                          { field: "plate_hits" as StageScoreCounterField, label: "Plate hit" },
                          ...(steelMissFieldsEnabled
                            ? [{ field: "plate_misses" as StageScoreCounterField, label: "Plate miss" }]
                            : []),
                        ]
                      : []),
                    ...(activeStage.mini_plates > 0
                      ? [
                          { field: "mini_plate_hits" as StageScoreCounterField, label: "Mini plate hit" },
                          ...(steelMissFieldsEnabled
                            ? [{ field: "mini_plate_misses" as StageScoreCounterField, label: "Mini plate miss" }]
                            : []),
                        ]
                      : []),
                    ...(stageHasNoShootScoring(activeStage)
                      ? [{ field: "no_shoots" as StageScoreCounterField, label: "No Shoot" }]
                      : []),
                  ];

                  if (!expanded) {
                    return (
                      <article
                        id={`shooter-${shooter.participant_id}`}
                        key={shooter.participant_id}
                        className={`min-w-0 overflow-hidden rounded-2xl border p-2 sm:p-3 ${
                          hasSavedScore
                            ? "border-emerald-800 bg-emerald-950/20"
                            : "border-zinc-800 bg-zinc-950"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedDynamicShooterId(shooter.participant_id)}
                          className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-left"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-base font-black text-white sm:text-lg">
                              {getShooterName(shooter)}
                            </span>
                            <span className="block truncate text-xs font-semibold text-gray-400 sm:text-sm">
                              Nr {shooter.participant_id} • Squad {shooter.squad_group_number || "brak"} • {input.division || "bez dywizji"} • {input.power_factor === "major" ? "Major" : "Minor"}
                            </span>
                            <ClubAmmoNotice shooter={shooter} compact />
                          </span>

                          <span className="flex shrink-0 items-center gap-2">
                            {hasSavedScore && (
                              <span className="hidden rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-xs font-black text-emerald-200 min-[390px]:inline-flex">
                                HF {savedScore?.hit_factor || "0"}
                              </span>
                            )}
                            <span className={`rounded-xl px-3 py-2 text-sm font-black text-white ${
                              hasSavedScore
                                ? "bg-blue-700"
                                : "bg-green-700"
                            }`}>
                              {hasSavedScore ? "Popraw wynik" : "Oceń"}
                            </span>
                          </span>
                        </button>
                      </article>
                    );
                  }

                  return (
                    <article
                      id={`shooter-${shooter.participant_id}`}
                      key={shooter.participant_id}
                      className="min-w-0 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-3 sm:p-5"
                    >
                      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => setExpandedDynamicShooterId(null)}
                            className="block break-words text-left text-[clamp(1.45rem,7vw,1.75rem)] font-black leading-tight text-white transition hover:text-green-300 sm:text-2xl"
                          >
                            {getShooterName(shooter)}
                          </button>
                          <p className="mt-1 break-words text-sm leading-6 text-gray-400">
                            Nr startowy: {shooter.participant_id} • Squad: {shooter.squad_group_number || "brak"} • {shooter.club || "brak klubu"}
                          </p>
                          <ClubAmmoNotice shooter={shooter} />
                        </div>
                        <div className="grid min-w-0 grid-cols-1 gap-2 text-center min-[380px]:grid-cols-2 sm:w-72">
                          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-3">
                            <p className="text-xs font-bold uppercase text-gray-500">HF</p>
                            <p className="break-words text-2xl font-black text-green-300">{preview.hitFactor.toFixed(4)}</p>
                          </div>
                          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-3">
                            <p className="text-xs font-bold uppercase text-gray-500">Stage pkt</p>
                            <p className="break-words text-2xl font-black text-white">{savedScore?.stage_points || "-"}</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid min-w-0 gap-3 md:grid-cols-3">
                        <label className="block min-w-0">
                          <span className="mb-2 block font-black text-white">Czas [s]</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={input.time_seconds}
                            onChange={(event) => setStageScoreField(
                              shooter.participant_id,
                              activeStage.id,
                              "time_seconds",
                              event.target.value
                            )}
                            className={`w-full min-w-0 rounded-2xl border bg-zinc-900 px-4 py-5 text-2xl font-black text-white outline-none sm:px-5 sm:text-3xl ${
                              preview.validTime ? "border-green-600" : "border-red-600"
                            }`}
                          />
                        </label>

                        <div className="min-w-0 rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-5 sm:px-5">
                          <p className="mb-2 font-black text-white">Power Factor</p>
                          <p className="break-words text-2xl font-black text-green-300">
                            {input.power_factor === "major" ? "Major" : "Minor"}
                          </p>
                        </div>

                        <div className="min-w-0 rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-5 sm:px-5">
                          <p className="mb-2 font-black text-white">Dywizja</p>
                          <p className="break-words text-xl font-black text-white">
                            {input.division || "Brak w zgłoszeniu"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {counterFields.map((counter) => {
                          const counterMax = stageScoreCounterMax(activeStage, displayInput, counter.field);
                          const counterValue = displayInput[counter.field];

                          return (
                            <div
                              key={counter.field}
                              className="grid min-w-0 grid-cols-[48px_minmax(0,1fr)_48px] overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 sm:grid-cols-[58px_minmax(0,1fr)_58px]"
                            >
                              <button
                                type="button"
                                onClick={() => adjustStageScoreCounter(shooter.participant_id, activeStage, counter.field, -1)}
                                disabled={counterValue <= 0}
                                className="bg-zinc-800 text-3xl font-black text-white disabled:text-zinc-600"
                              >
                                -
                              </button>
                              <label className="block min-w-0">
                                <span className="block px-2 pt-2 text-center text-xs font-black uppercase text-gray-500">
                                  {counter.label}
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  max={counterMax ?? undefined}
                                  inputMode="numeric"
                                  value={counterValue}
                                  onChange={(event) => setStageScoreCounter(
                                    shooter.participant_id,
                                    activeStage,
                                    counter.field,
                                    Number(event.target.value || 0)
                                  )}
                                  className="w-full min-w-0 bg-transparent px-2 pb-3 text-center text-2xl font-black text-white outline-none sm:text-3xl"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => adjustStageScoreCounter(shooter.participant_id, activeStage, counter.field, 1)}
                                disabled={counterMax !== null && counterValue >= counterMax}
                                className="bg-green-700 text-3xl font-black text-white disabled:bg-zinc-700 disabled:text-zinc-500"
                              >
                                +
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {activeStage.custom_penalties.some((penalty) => penalty.name.trim()) && (
                        <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-3">
                          {input.custom_penalties.map((penalty, penaltyIndex) => {
                            const configuredPenaltyName = activeStage.custom_penalties[penaltyIndex]?.name || "";

                            if (!configuredPenaltyName.trim()) {
                              return null;
                            }

                            return (
                              <div key={penaltyIndex} className="min-w-0 rounded-2xl border border-zinc-700 bg-zinc-900 p-3">
                                <p className="mb-2 min-h-10 break-words rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 font-bold text-white">
                                  {configuredPenaltyName}
                                </p>
                                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_78px] gap-2 sm:grid-cols-[minmax(0,1fr)_92px]">
                                  <input
                                    type="number"
                                    min="0"
                                    value={penalty.count}
                                    onChange={(event) => {
                                      const customPenalties = [...input.custom_penalties];
                                      customPenalties[penaltyIndex] = {
                                        ...penalty,
                                        count: Math.max(Number(event.target.value || 0), 0),
                                        name: configuredPenaltyName,
                                      };
                                      setStageScoreField(shooter.participant_id, activeStage.id, "custom_penalties", customPenalties);
                                    }}
                                    className="min-w-0 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xl font-black text-white"
                                  />
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={penalty.value}
                                    onChange={(event) => {
                                      const customPenalties = [...input.custom_penalties];
                                      customPenalties[penaltyIndex] = {
                                        ...penalty,
                                        name: configuredPenaltyName,
                                        value: event.target.value,
                                      };
                                      setStageScoreField(shooter.participant_id, activeStage.id, "custom_penalties", customPenalties);
                                    }}
                                    className="min-w-0 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xl font-black text-white"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                        <div className="grid min-w-0 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-4">
                          <div className="rounded-xl bg-zinc-900 p-3">
                            <p className="text-xs font-bold uppercase text-gray-500">Plus</p>
                            <p className="break-words text-xl font-black text-white">{preview.positivePoints.toFixed(2)}</p>
                          </div>
                          <div className="rounded-xl bg-zinc-900 p-3">
                            <p className="text-xs font-bold uppercase text-gray-500">Kary</p>
                            <p className="break-words text-xl font-black text-red-300">{preview.penaltyPoints.toFixed(2)}</p>
                          </div>
                          <div className="rounded-xl bg-zinc-900 p-3">
                            <p className="text-xs font-bold uppercase text-gray-500">Punkty</p>
                            <p className="break-words text-xl font-black text-white">{preview.finalPoints.toFixed(2)}</p>
                          </div>
                          <div className="rounded-xl bg-zinc-900 p-3">
                            <p className="text-xs font-bold uppercase text-gray-500">HF</p>
                            <p className="break-words text-xl font-black text-green-300">{preview.hitFactor.toFixed(4)}</p>
                          </div>
                        </div>

                        <div className="flex min-w-0 flex-col gap-2 sm:flex-row lg:flex-col">
                          <button
                            type="button"
                            onClick={() => saveDynamicStageScore(shooter, activeStage)}
                            disabled={!resultsEnabled || stageScoreSavingId === shooter.participant_id}
                            className="rounded-2xl bg-green-700 px-4 py-4 text-base font-black text-white disabled:bg-zinc-700 sm:px-5 sm:text-lg"
                          >
                            {stageScoreSavingId === shooter.participant_id ? "Zapisuję..." : "Zapisz wynik"}
                          </button>
                          <button
                            type="button"
                            onClick={() => clearStageScoreInput(shooter, activeStage)}
                            className="rounded-2xl bg-zinc-800 px-4 py-4 text-base font-black text-white sm:px-5 sm:text-lg"
                          >
                            Wyczyść
                          </button>
                        </div>
                      </div>

                      {(preview.paperWarning || preview.steelWarning || !preview.validTime) && (
                        <p className={`mt-4 break-words rounded-xl border px-4 py-3 font-bold ${
                          preview.paperOverflow || preview.steelOverflow || !preview.validTime
                            ? "border-red-700 bg-red-950/50 text-red-100"
                            : "border-yellow-700 bg-yellow-950/50 text-yellow-100"
                        }`}>
                          {!preview.validTime
                            ? "Czas jest wymagany i musi być większy od 0."
                            : preview.paperWarning
                            ? `Suma papieru: ${preview.paperEntries}/${activeStage.paper_required_hits}. Sprawdź, czy zgadza się z konfiguracją Stage.`
                            : `Suma stali: ${preview.steelEntries}/${activeStage.steel_targets}. Sprawdź, czy zgadza się z konfiguracją Stage.`}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : isPracticalShotgunDiscipline ? (
          <section className="rounded-xl border border-zinc-800 bg-zinc-900">
            <div className="border-b border-zinc-800 px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    {discipline.name}
                  </h2>
                  <p className="text-sm text-gray-400 sm:text-base">
                    Strzelba praktyczna: wpisz czas i trafienia. System wyliczy factor przed zapisem.
                  </p>
                  <p className="mt-2 text-sm font-bold text-emerald-300">
                    Cele: {practicalShotgunTargetsCount}
                    {practicalShotgunTimeLimit > 0
                      ? ` • Limit czasu: ${practicalShotgunTimeLimit} s`
                      : " • Bez limitu czasu"}
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setMessage("");
                      setScannerOpen(true);
                    }}
                    className="group flex w-full items-center gap-4 text-left sm:w-fit sm:gap-5"
                  >
                    <NextImage
                      src="/icons/skaner.jpeg"
                      alt=""
                      width={1254}
                      height={1254}
                      sizes="(min-width: 640px) 144px, 112px"
                      className="h-28 w-28 shrink-0 rounded-2xl object-cover shadow-[0_12px_35px_rgba(34,197,94,0.22)] transition group-hover:scale-[1.03] group-hover:shadow-[0_14px_40px_rgba(34,197,94,0.34)] sm:h-36 sm:w-36"
                    />

                    <span className="max-w-xs">
                      <span className="block text-lg font-black text-white transition group-hover:text-green-300 sm:text-2xl">
                        Skanuj QR zawodnika
                      </span>
                      <span className="mt-2 block text-sm leading-5 text-gray-400 sm:text-base sm:leading-6">
                        Zeskanuj kod, aby szybko odnaleźć zawodnika.
                      </span>
                    </span>
                  </button>

                  <input
                    value={shooterFilter}
                    onChange={(event) => {
                      setShooterFilter(event.target.value);
                      setHighlightedParticipantId(null);
                    }}
                    placeholder="Filtruj strzelca"
                    className="w-full border border-zinc-700 bg-zinc-800 px-4 py-4 text-lg text-white placeholder:text-gray-500 focus:border-green-700 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {shootersLoading ? (
              <p className="px-4 py-5 text-gray-400">
                Ładowanie zawodników...
              </p>
            ) : sortedShooters.length === 0 ? (
              <p className="px-4 py-5 text-gray-400">
                Brak zawodników pasujących do filtra.
              </p>
            ) : (
              <div className="grid gap-4 p-4">
                {sortedShooters.map((shooter) => {
                  const highlighted = highlightedParticipantId === shooter.participant_id;
                  const input = practicalShotgunInputs[shooter.participant_id] || { time: "", hits: "" };
                  const preview = practicalShotgunPreview(input);
                  const existingResult = parsePracticalShotgunResult(shooter.result_data || "");
                  const finalResult = preview.disqualified
                    ? "DQ"
                    : preview.validTime && preview.validHits
                    ? preview.factor
                    : existingResult?.disqualified
                    ? "DQ"
                    : existingResult?.factor || shooter.points || "0";

                  return (
                    <article
                      id={`shooter-${shooter.participant_id}`}
                      key={shooter.participant_id}
                      className={`rounded-2xl border p-4 transition sm:p-5 ${
                        highlighted
                          ? "border-green-500 bg-green-950/40"
                          : "border-zinc-800 bg-zinc-950"
                      }`}
                    >
                      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <Link
                            href={`/profile/${shooter.participant_id}`}
                            className="text-2xl font-black text-white transition hover:text-green-300"
                          >
                            {getShooterName(shooter)}
                          </Link>
                          <p className="mt-1 text-sm text-gray-400">
                            {shooter.club || "brak klubu"} • licencja: {shooter.license_number || "brak"}
                          </p>
                          <ClubAmmoNotice shooter={shooter} />
                        </div>
                        <div className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-center">
                          <p className="text-xs font-bold uppercase text-gray-500">Hit Factor</p>
                          <p className={`text-3xl font-black ${preview.disqualified ? "text-red-400" : "text-green-300"}`}>
                            {finalResult}
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-2 block text-base font-black text-white">
                            Czas przejazdu [s]
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            placeholder="0"
                            value={input.time}
                            onChange={(event) =>
                              updatePracticalShotgunInput(shooter.participant_id, "time", event.target.value)
                            }
                            className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-5 py-5 text-3xl font-black text-white outline-none focus:border-green-500"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-2 block text-base font-black text-white">
                            Trafione cele
                          </span>
                          <div className="grid grid-cols-[1fr_auto] overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 focus-within:border-green-500">
                            <input
                              type="number"
                              min="0"
                              max={practicalShotgunTargetsCount}
                              step="1"
                              inputMode="numeric"
                              placeholder="0"
                              value={input.hits}
                              onChange={(event) =>
                                updatePracticalShotgunInput(shooter.participant_id, "hits", event.target.value)
                              }
                              className="min-w-0 bg-transparent px-5 py-5 text-3xl font-black text-white outline-none"
                            />
                            <span className="flex items-center bg-zinc-800 px-5 text-3xl font-black text-gray-300">
                              /{practicalShotgunTargetsCount}
                            </span>
                          </div>
                        </label>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                        <p className={`rounded-xl px-4 py-3 text-base font-bold ${
                          !preview.validTime && input.time
                            ? "bg-red-950/50 text-red-100"
                            : !preview.validHits && input.hits
                            ? "bg-red-950/50 text-red-100"
                            : preview.disqualified
                            ? "bg-red-950/50 text-red-100"
                            : "bg-zinc-900 text-gray-300"
                        }`}>
                          {!preview.validTime && input.time
                            ? "Czas musi być większy od 0."
                            : !preview.validHits && input.hits
                            ? `Trafienia muszą być w zakresie 0-${practicalShotgunTargetsCount}.`
                            : preview.disqualified
                            ? `Przekroczono limit ${practicalShotgunTimeLimit} s - wynik będzie zapisany jako DQ.`
                            : `Wyliczony factor: ${preview.factor}`}
                        </p>

                        <button
                          type="button"
                          onClick={() => savePracticalShotgunResult(shooter)}
                          disabled={!resultsEnabled || practicalShotgunSavingId === shooter.participant_id}
                          className={`w-full rounded-2xl px-5 py-5 text-xl font-black text-white transition sm:w-56 ${
                            !resultsEnabled
                              ? "cursor-not-allowed bg-zinc-700 text-gray-300"
                              : practicalShotgunSavingId === shooter.participant_id
                              ? "bg-zinc-700"
                              : shooter.points
                              ? "bg-red-700 hover:bg-red-600"
                              : "bg-green-700 hover:bg-green-600"
                          }`}
                        >
                          {!resultsEnabled
                            ? "Zawody nierozpoczęte"
                            : practicalShotgunSavingId === shooter.participant_id
                            ? "Zapisuję..."
                            : shooter.points
                            ? "Zapisz zmianę"
                            : "Zapisz wynik"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : isSkeetDiscipline ? (
          <section className="rounded-xl border border-zinc-800 bg-zinc-900">
            <div className="border-b border-zinc-800 px-4 py-4 sm:px-5">
              <h2 className="text-2xl font-bold text-white">Grupy startowe Skeet</h2>
              <p className="mt-1 text-sm text-gray-400 sm:text-base">
                Kolejność zawodników wynika z wylosowanych pozycji 1–6.
              </p>
            </div>
            {shootersLoading ? (
              <p className="px-4 py-5 text-gray-400">Ładowanie grup...</p>
            ) : skeetGroups.length === 0 ? (
              <p className="px-4 py-5 text-gray-400">
                Brak potwierdzonych zawodników przypisanych do grup Skeet.
              </p>
            ) : (
              <div className="grid gap-4 p-4 md:grid-cols-2">
                {skeetGroups.map((group) => {
                  const groupState = getSkeetGroupState(group.shooters, skeetRoundCount);
                  const buttonLabel = groupState.status === "in-progress"
                    ? "Kontynuuj"
                    : groupState.status === "completed"
                    ? "Podgląd"
                    : "Start grupy";
                  const buttonClass = groupState.status === "in-progress"
                    ? "bg-yellow-500 text-black"
                    : groupState.status === "completed"
                    ? "bg-blue-700 text-white"
                    : "bg-green-700 text-white";

                  return (
                    <article key={group.groupNumber} className="rounded-xl border border-zinc-700 bg-zinc-950 p-4">
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-2xl font-black text-white">Grupa {group.groupNumber}</h3>
                          <p className="text-sm text-gray-400">{group.shooters.length}/6 zawodników</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => startSkeetGroup(group.groupNumber, group.shooters)}
                          disabled={!resultsEnabled || group.shooters.length === 0}
                          className={`rounded-xl px-4 py-3 font-black disabled:bg-gray-600 ${buttonClass}`}
                        >
                          {buttonLabel}
                        </button>
                      </div>
                      <ol className="space-y-2">
                        {group.shooters.map((shooter) => (
                          <li key={shooter.participant_id} className="flex items-center justify-between gap-3 rounded-lg bg-zinc-900 px-3 py-2 text-white">
                            <span className="min-w-0">
                              <span className="block truncate font-bold">{shooter.squad_position || "–"}. {getShooterName(shooter)}</span>
                              <ClubAmmoNotice shooter={shooter} compact />
                            </span>
                            <span className="font-black">{trapScoreTotal(groupState.scoresByParticipant[shooter.participant_id], shooter.points)}</span>
                          </li>
                        ))}
                      </ol>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : isTrapDiscipline ? (
          <section className="rounded-xl border border-zinc-800 bg-zinc-900">
            <div className="border-b border-zinc-800 px-4 py-4 sm:px-5">
              <h2 className="text-2xl font-bold text-white">
                Grupy startowe {isHuntingTrap ? "Trap Myśliwski" : "Trap"}
              </h2>
              <p className="mt-1 text-sm text-gray-400 sm:text-base">
                Wybierz grupę 6-osobową: stanowiska 1–5 strzelają, pozycja 6 oczekuje i wchodzi na stanowisko 1 po każdej zmianie.
                {isHuntingTrap && " Format: 5 pojedynczych, 10 w parach i 5 z podchodu."}
              </p>
            </div>

            {shootersLoading ? (
              <p className="px-4 py-5 text-gray-400">
                Ładowanie grup...
              </p>
            ) : trapGroups.length === 0 ? (
              <p className="px-4 py-5 text-gray-400">
                Brak potwierdzonych zawodników przypisanych do grup {isHuntingTrap ? "Trap Myśliwski" : "Trap"}.
              </p>
            ) : (
              <div className="grid gap-4 p-4 md:grid-cols-2">
                {trapGroups.map((group) => {
                  const groupState = getTrapGroupState(group.shooters, trapFormat);
                  const buttonLabel = groupState.status === "in-progress"
                    ? "Kontynuuj"
                    : groupState.status === "completed"
                    ? "Podgląd"
                    : "Start grupy";
                  const buttonClass = groupState.status === "in-progress"
                    ? "bg-yellow-500 text-black hover:bg-yellow-400 disabled:bg-gray-500 disabled:text-white"
                    : groupState.status === "completed"
                    ? "bg-blue-700 text-white hover:bg-blue-600 disabled:bg-gray-500"
                    : "bg-green-700 text-white hover:bg-green-600 disabled:bg-gray-500";

                  return (
                    <article
                      key={group.groupNumber}
                      className="rounded-xl border border-zinc-700 bg-zinc-950 p-4"
                    >
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-2xl font-black text-white">
                            Grupa {group.groupNumber}
                          </h3>
                          <p className="text-sm text-gray-400">
                            {group.shooters.length}/6 zawodników
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => startTrapGroup(group.groupNumber, group.shooters)}
                          disabled={!resultsEnabled || group.shooters.length === 0}
                          className={`rounded-xl px-4 py-3 font-black transition disabled:cursor-not-allowed ${buttonClass}`}
                        >
                          {buttonLabel}
                        </button>
                      </div>

                      {!resultsEnabled && (
                        <p className="mb-3 rounded-lg border border-yellow-700 bg-yellow-950/40 px-3 py-2 text-sm font-semibold text-yellow-100">
                          Wyniki można wpisywać po rozpoczęciu zawodów.
                        </p>
                      )}

                      {groupState.status === "in-progress" && (
                        <p className="mb-3 rounded-lg border border-yellow-600 bg-yellow-950/40 px-3 py-2 text-sm font-semibold text-yellow-100">
                          Grupa rozpoczęta, ale nieukończona.
                        </p>
                      )}

                      {groupState.status === "completed" && (
                        <p className="mb-3 rounded-lg border border-blue-700 bg-blue-950/40 px-3 py-2 text-sm font-semibold text-blue-100">
                          Grupa zakończyła strzelanie.
                        </p>
                      )}

                      <div className="space-y-2">
                        {group.shooters.map((shooter) => (
                          <div
                            key={shooter.participant_id}
                            className="grid grid-cols-[104px_1fr_70px] items-center gap-3 rounded-lg bg-zinc-900 px-3 py-2"
                          >
                            <span className="text-center text-lg font-black text-green-400">
                              {shooter.squad_position === 6
                                ? "oczek."
                                : shooter.squad_position || "–"}
                            </span>
                            <span className="min-w-0 font-bold text-white">
                              <span className="block truncate">
                                {getShooterName(shooter)}
                              </span>
                              <ClubAmmoNotice shooter={shooter} compact />
                            </span>
                            <span className="text-right font-black text-white">
                              {shooter.points || "0"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : (
          <section className="rounded-xl border border-zinc-800 bg-zinc-900">
            <div className="border-b border-zinc-800 px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    {discipline.name}
                  </h2>
                  <p className="text-sm text-gray-400 sm:text-base">
                    Lista zawodników startujących w konkurencji.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setMessage("");
                      setScannerOpen(true);
                    }}
                    className="group flex w-full items-center gap-4 text-left sm:w-fit sm:gap-5"
                  >
                    <NextImage
                      src="/icons/skaner.jpeg"
                      alt=""
                      width={1254}
                      height={1254}
                      sizes="(min-width: 640px) 144px, 112px"
                      className="h-28 w-28 shrink-0 rounded-2xl object-cover shadow-[0_12px_35px_rgba(34,197,94,0.22)] transition group-hover:scale-[1.03] group-hover:shadow-[0_14px_40px_rgba(34,197,94,0.34)] sm:h-36 sm:w-36"
                    />

                    <span className="max-w-xs">
                      <span className="block text-lg font-black text-white transition group-hover:text-green-300 sm:text-2xl">
                        Skanuj QR zawodnika
                      </span>
                      <span className="mt-2 block text-sm leading-5 text-gray-400 sm:text-base sm:leading-6">
                        Zeskanuj kod, aby szybko odnaleźć zawodnika na liście.
                      </span>
                    </span>
                  </button>

                  <input
                    value={shooterFilter}
                    onChange={(event) => {
                      setShooterFilter(event.target.value);
                      setHighlightedParticipantId(null);
                    }}
                    placeholder="Filtruj strzelca"
                    className="w-full border border-zinc-700 bg-zinc-800 px-4 py-3 text-base text-white placeholder:text-gray-500 focus:border-green-700 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  {[
                    { field: "name" as const, label: "Nazwisko" },
                    { field: "license" as const, label: "Licencja" },
                    { field: "club" as const, label: "Klub" },
                    { field: "points" as const, label: "Punkty" },
                  ].map((item) => (
                    <button
                      key={item.field}
                      type="button"
                      onClick={() => toggleSort(item.field)}
                      className={`px-3 py-2 text-sm font-bold transition ${
                        sortField === item.field
                          ? "bg-green-700 text-white"
                          : "bg-zinc-800 text-gray-300 hover:bg-zinc-700"
                      }`}
                    >
                      {item.label} {sortMark(item.field)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {shootersLoading ? (
              <p className="px-4 py-5 text-gray-400">
                Ładowanie zawodników...
              </p>
            ) : sortedShooters.length === 0 ? (
              <p className="px-4 py-5 text-gray-400">
                Brak zawodników pasujących do filtra.
              </p>
            ) : (
              <div className="divide-y divide-zinc-800">
                {sortedShooters.map((shooter) => {
                  const highlighted = highlightedParticipantId === shooter.participant_id;

                  return (
                    <article
                      id={`shooter-${shooter.participant_id}`}
                      key={shooter.participant_id}
                      className={`px-4 py-4 transition sm:px-5 ${
                        highlighted
                          ? "bg-green-950/50 ring-2 ring-inset ring-green-500"
                          : "hover:bg-zinc-800/40"
                      }`}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <Link
                            href={`/profile/${shooter.participant_id}`}
                            className="block text-xl font-bold text-white transition hover:text-green-300"
                          >
                            {getShooterName(shooter)}
                          </Link>

                          <div className="mt-3 grid gap-2 text-sm text-gray-300 sm:grid-cols-3">
                            <p className="min-w-0">
                              <span className="block text-xs font-bold uppercase text-gray-500">
                                Licencja
                              </span>
                              <span className="break-words">
                                {shooter.license_number || "brak"}
                              </span>
                            </p>

                            <p className="min-w-0">
                              <span className="block text-xs font-bold uppercase text-gray-500">
                                Klub
                              </span>
                              <span className="break-words">
                                {shooter.club || "brak"}
                              </span>
                            </p>

                            <p>
                              <span className="block text-xs font-bold uppercase text-gray-500">
                                Punkty
                              </span>
                              <span className="text-lg font-bold text-white">
                                {shooter.points || "brak"}
                              </span>
                            </p>
                          </div>
                          <ClubAmmoNotice shooter={shooter} />
                        </div>

                        <button
                          type="button"
                          onClick={() => saveResult(shooter)}
                          disabled={!resultsEnabled}
                          title={!resultsEnabled ? "Zawody jeszcze się nie rozpoczęły" : ""}
                          className={`w-full px-4 py-3 text-center text-sm font-bold text-white transition sm:w-44 ${
                            !resultsEnabled
                              ? "cursor-not-allowed bg-zinc-700 text-gray-300"
                              : shooter.points
                              ? "bg-red-700 hover:bg-red-600"
                              : "bg-green-700 hover:bg-green-600"
                          }`}
                        >
                          {!resultsEnabled
                            ? "Zawody nierozpoczęte"
                            : shooter.points
                            ? "Edytuj wynik"
                            : "Dodaj wynik"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {standardResultDraft && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-3 py-4 sm:px-6">
            <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl">
              <h2 className="text-2xl font-black text-white">
                Wynik: {getShooterName(standardResultDraft.shooter)}
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-300">
                Wpisz wynik bazowy. Po zaznaczeniu próby jedną ręką system automatycznie doliczy {oneHandBonusPoints} punktów.
              </p>

              <label className="mt-5 block">
                <span className="mb-2 block font-bold text-white">
                  Wynik bazowy
                </span>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={standardResultDraft.points}
                  onChange={(event) => setStandardResultDraft((currentDraft) =>
                    currentDraft
                      ? {
                          ...currentDraft,
                          points: event.target.value,
                        }
                      : currentDraft
                  )}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-4 text-2xl font-black text-white outline-none focus:border-green-500"
                  autoFocus
                />
              </label>

              <label className="mt-4 flex items-start gap-3 rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-white">
                <input
                  type="checkbox"
                  checked={standardResultDraft.oneHandBonus}
                  onChange={(event) => setStandardResultDraft((currentDraft) =>
                    currentDraft
                      ? {
                          ...currentDraft,
                          oneHandBonus: event.target.checked,
                        }
                      : currentDraft
                  )}
                  className="mt-1 h-5 w-5"
                />
                <span>
                  <span className="block font-black">
                    Strzela z jednej ręki +{oneHandBonusPoints} pkt
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-gray-400">
                    Finalny wynik: {
                      parseStandardPoints(standardResultDraft.points) === null
                        ? "podaj wynik bazowy"
                        : standardResultData(
                            standardResultDraft.points,
                            standardResultDraft.oneHandBonus
                          ).finalPoints
                    }
                  </span>
                </span>
              </label>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setStandardResultDraft(null)}
                  className="rounded-xl border border-zinc-700 px-4 py-3 font-bold text-gray-200 transition hover:bg-zinc-900"
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  onClick={() => void saveStandardResult(
                    standardResultDraft.shooter,
                    standardResultDraft.points,
                    standardResultDraft.oneHandBonus
                  )}
                  className="rounded-xl bg-green-700 px-4 py-3 font-black text-white transition hover:bg-green-600"
                >
                  Zapisz wynik
                </button>
              </div>
            </div>
          </div>
        )}

        {scannerOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 px-3 py-4 sm:px-6">
            <div className="mx-auto w-full max-w-5xl border border-zinc-800 bg-black p-3 shadow-2xl sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-xl font-bold text-white sm:text-2xl">
                  Skan QR zawodnika
                </h2>

                <button
                  type="button"
                  onClick={() => setScannerOpen(false)}
                  className="bg-zinc-800 px-4 py-2 font-semibold text-white transition hover:bg-zinc-700"
                >
                  Zamknij
                </button>
              </div>

              <QrCodeScanner onScan={handleParticipantQrScan} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
