"use client";

import NextImage from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import QrCodeScanner from "@/components/QrCodeScanner";
import { apiUrl } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

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
  shooters_count: number;
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
  squad_group_number: number;
  squad_position: number;
};

type SortField = "name" | "license" | "club" | "points";
type SortDirection = "asc" | "desc";
type TrapScoreValue = 1 | 0 | null;
const clayHitPoints = 5;

type TrapHistoryEntry = {
  participantId: number;
  scoreIndex: number;
  roundIndex: number;
  shotIndex: number;
  previousValue: TrapScoreValue;
};
type TrapGroupStatus = "not-started" | "in-progress" | "completed";
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

function parseScore(value: string) {
  const score = Number(value || "0");

  return Number.isFinite(score)
    ? score
    : 0;
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

function getTrapScheduleRoundCount(groupShooters: Shooter[], scoreRoundCount: number) {
  if (scoreRoundCount <= 0) {
    return 0;
  }

  const seriesCount = Math.max(Math.ceil(scoreRoundCount / trapStationsCount), 1);

  return seriesCount * getTrapCycleSize(groupShooters);
}

function getTrapScoreRoundIndexForShooter(
  groupShooters: Shooter[],
  participantId: number,
  roundIndex: number
) {
  let activeRoundIndex = 0;

  for (let previousRoundIndex = 0; previousRoundIndex < roundIndex; previousRoundIndex += 1) {
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
  targetIndex: number
) {
  const scoreRoundIndex = getTrapScoreRoundIndexForShooter(
    groupShooters,
    participantId,
    roundIndex
  );

  return scoreRoundIndex >= 0
    ? scoreRoundIndex * trapTargetsPerRound + targetIndex
    : -1;
}

function getTrapActiveCells(groupShooters: Shooter[], roundIndex: number) {
  const activeCells: {
    stationIndex: number;
    targetIndex: number;
    shooter: Shooter;
    scoreIndex: number;
  }[] = [];

  for (let targetIndex = 0; targetIndex < trapTargetsPerRound; targetIndex += 1) {
    const positionShooters = getTrapPositionShooters(groupShooters, roundIndex);

    positionShooters.forEach((shooter, stationIndex) => {
      if (shooter) {
        activeCells.push({
          stationIndex,
          targetIndex,
          shooter,
          scoreIndex: getTrapScoreIndexForShooter(
            groupShooters,
            shooter.participant_id,
            roundIndex,
            targetIndex
          ),
        });
      }
    });
  }

  return activeCells;
}

function emptyTrapScores(totalRounds: number) {
  return Array.from(
    { length: totalRounds * trapTargetsPerRound },
    () => null as TrapScoreValue
  );
}

function parseTrapScores(resultData: string, totalRounds: number) {
  try {
    const parsed = JSON.parse(resultData || "[]");

    if (!Array.isArray(parsed)) {
      return emptyTrapScores(totalRounds);
    }

    return emptyTrapScores(totalRounds).map((_value, index) => {
      const score = parsed[index];
      return score === 1 || score === 0 ? score : null;
    });
  } catch {
    return emptyTrapScores(totalRounds);
  }
}

function findFirstTrapProgress(
  groupShooters: Shooter[],
  scheduleRoundCount: number,
  scoresByParticipant: Record<number, TrapScoreValue[]>
) {
  for (let roundIndex = 0; roundIndex < scheduleRoundCount; roundIndex += 1) {
    const activeCells = getTrapActiveCells(groupShooters, roundIndex);

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

function buildTrapScoresByParticipant(groupShooters: Shooter[], totalRounds: number) {
  return groupShooters.reduce<Record<number, TrapScoreValue[]>>(
    (scoresByParticipant, shooter) => ({
      ...scoresByParticipant,
      [shooter.participant_id]: parseTrapScores(shooter.result_data || "", totalRounds),
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
  progress: ReturnType<typeof findFirstTrapProgress>
) {
  const history: TrapHistoryEntry[] = [];

  for (let roundIndex = 0; roundIndex < scheduleRoundCount; roundIndex += 1) {
    const activeCells = getTrapActiveCells(groupShooters, roundIndex);

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

function getTrapGroupState(groupShooters: Shooter[], scoreRoundCount: number) {
  const scheduleRoundCount = getTrapScheduleRoundCount(groupShooters, scoreRoundCount);
  const scoresByParticipant = buildTrapScoresByParticipant(groupShooters, scoreRoundCount);
  const progress = findFirstTrapProgress(groupShooters, scheduleRoundCount, scoresByParticipant);
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
      progress
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
  const emptyScores = emptyTrapScores(totalRounds * 5);

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
  const params = useParams<{
    competitionId: string;
    disciplineId: string;
  }>();
  const competitionId = Number(params.competitionId);
  const disciplineId = Number(params.disciplineId);

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

  useEffect(() => {
    const token = getAccessToken();

    if (!token) {
      router.push("/login");
      return;
    }

    async function loadData() {
      try {
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
      } catch (error) {
        console.error(error);
        setMessage("Błąd połączenia z serwerem ❌");
      } finally {
        setLoading(false);
        setShootersLoading(false);
      }
    }

    loadData();
  }, [competitionId, disciplineId, router]);

  const competition = useMemo(
    () => competitions.find((item) => item.id === competitionId),
    [competitionId, competitions]
  );
  const discipline = competition?.disciplines.find(
    (item) => item.id === disciplineId
  );
  const isTrapDiscipline = discipline?.discipline_type === "trap";
  const isSkeetDiscipline = discipline?.discipline_type === "skeet";
  const trapRoundCount = isTrapDiscipline
    ? Math.max(Number(discipline?.clay_series_count || discipline?.trap_series_count || 1) * 5, 5)
    : 0;
  const activeTrapScheduleRoundCount = activeTrapGroup
    ? getTrapScheduleRoundCount(activeTrapGroup.shooters, trapRoundCount)
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
      ? getTrapActiveCells(activeTrapGroup.shooters, trapRoundIndex)
      : [],
    [activeTrapGroup, trapRoundIndex]
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
  const trapCurrentCycleNumber = trapRoundIndex + 1;
  const trapTotalCycleCount = activeTrapScheduleRoundCount;
  const trapRoundLabel = `Seria ${trapCurrentCycleNumber} z ${trapTotalCycleCount}`;
  const trapTargetLabel = `rzutek ${trapCurrentTargetIndex + 1}`;

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
  }, [shooterFilter, shooters, sortDirection, sortField]);

  const resultsEnabled = competition?.status === "started";

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
      window.alert("Nie rozpoznano kodu QR zawodnika.");
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
      window.alert("Brak zawodnika na liście tej dyscypliny.");
      return;
    }

    showScannedShooter(shooter);
  }

  async function saveResult(shooter: Shooter) {
    if (!resultsEnabled) {
      return;
    }

    const points = window.prompt(
      `Podaj wynik: ${getShooterName(shooter)}`,
      shooter.points || ""
    );

    if (points === null) {
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
            points,
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
              }
            : currentShooter
        )
      );
      setMessage("Wynik zapisany ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  async function saveTrapParticipantScore(
    participantId: number,
    points: number,
    scores: TrapScoreValue[]
  ) {
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
    const groupState = getTrapGroupState(groupShooters, trapRoundCount);

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

    const previousScores = trapScores[shooter.participant_id] || emptyTrapScores(trapRoundCount);
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

    const previousScores = trapScores[lastEntry.participantId] || emptyTrapScores(trapRoundCount);
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
    const previousScores = skeetScores[participantId] || emptyTrapScores(skeetRoundCount * 5);
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

    const currentScores = skeetScores[lastEntry.participantId] || emptyTrapScores(skeetRoundCount * 5);
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

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10">
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
                        <span className="font-bold">{getShooterName(shooter)}</span>
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
                {[1, 2, 3, 4, 5].map((targetNumber) => (
                  <div
                    key={targetNumber}
                    className="flex items-center justify-center border-r-2 border-black px-1"
                  >
                    rzutek {targetNumber}
                  </div>
                ))}
                <div className="flex items-center justify-center px-1">
                  wynik
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-visible">
                {trapPositionShooters.map((shooter, stationIndex) => {
                  const shooterScores = shooter
                    ? trapScores[shooter.participant_id] || emptyTrapScores(trapRoundCount)
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
                        {shooter ? getShooterName(shooter) : (
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
                              targetIndex
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

      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-6">
          <Link
            href={`/judge/${competitionId}`}
            className="mb-5 inline-flex bg-red-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-red-950/30 transition hover:bg-red-600 sm:px-5 sm:text-base"
          >
            Wróć do konkurencji
          </Link>

          <h1 className="mb-2 text-3xl font-bold text-white sm:text-5xl">
            {discipline?.name || "Lista zawodników"}
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
            Ładowanie konkurencji...
          </p>
        ) : !competition || !discipline ? (
          <p className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-gray-300">
            Nie masz dostępu do tej konkurencji albo zawody nie są już opublikowane.
          </p>
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
                          <li key={shooter.participant_id} className="flex items-center justify-between rounded-lg bg-zinc-900 px-3 py-2 text-white">
                            <span className="font-bold">{shooter.squad_position || "–"}. {getShooterName(shooter)}</span>
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
                Grupy startowe Trap
              </h2>
              <p className="mt-1 text-sm text-gray-400 sm:text-base">
                Wybierz grupę 6-osobową: stanowiska 1–5 strzelają, pozycja 6 oczekuje i wchodzi na stanowisko 1 po każdej serii.
              </p>
            </div>

            {shootersLoading ? (
              <p className="px-4 py-5 text-gray-400">
                Ładowanie grup...
              </p>
            ) : trapGroups.length === 0 ? (
              <p className="px-4 py-5 text-gray-400">
                Brak potwierdzonych zawodników przypisanych do grup Trap.
              </p>
            ) : (
              <div className="grid gap-4 p-4 md:grid-cols-2">
                {trapGroups.map((group) => {
                  const groupState = getTrapGroupState(group.shooters, trapRoundCount);
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
                            <span className="min-w-0 truncate font-bold text-white">
                              {getShooterName(shooter)}
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
