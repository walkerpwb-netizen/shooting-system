export const HUNTING_TRAP_VARIANT = "hunting-trap-20";
export const HUNTING_TRAP_TARGETS_COUNT = 20;
export const HUNTING_TRAP_SHOTS_COUNT = 20;
export const PRACTICAL_SHOTGUN_DISCIPLINE_TYPE = "practical-shotgun";
export const DYNAMIC_STAGE_DISCIPLINE_TYPES = [
  "ipsc-pistol",
  "ipsc-rifle",
  "ipsc-shotgun",
  "pcc",
  "action-air",
  "idpa",
  "practical-rifle",
  PRACTICAL_SHOTGUN_DISCIPLINE_TYPE,
  "2gun",
  "3gun",
];

type ClayDiscipline = {
  discipline_type?: string;
  trap_variant?: string;
  clay_variant?: string;
  trap_series_count?: number;
  clay_series_count?: number;
};

export function isClayDisciplineType(disciplineType: string) {
  return ["trap", "skeet"].includes(disciplineType);
}

export function isHuntingTrapDiscipline(discipline: ClayDiscipline) {
  return discipline.discipline_type === "trap"
    && (discipline.clay_variant || discipline.trap_variant) === HUNTING_TRAP_VARIANT;
}

export function getClayTargetsCount(discipline: ClayDiscipline) {
  if (isHuntingTrapDiscipline(discipline)) {
    return HUNTING_TRAP_TARGETS_COUNT;
  }

  return Math.max(
    Number(discipline.clay_series_count || discipline.trap_series_count || 0),
    0
  ) * 25;
}

export function isPracticalShotgunDisciplineType(disciplineType: string) {
  return disciplineType === PRACTICAL_SHOTGUN_DISCIPLINE_TYPE;
}

export function isDynamicStageDisciplineType(disciplineType: string) {
  return DYNAMIC_STAGE_DISCIPLINE_TYPES.includes(disciplineType);
}
