export const HUNTING_TRAP_TYPE = "hunting-trap";
export const HUNTING_TRAP_VARIANT = "hunting-trap-20";
export const HUNTING_TRAP_TARGETS_COUNT = 20;
export const HUNTING_TRAP_SHOTS_COUNT = 20;

type ClayDiscipline = {
  discipline_type?: string;
  trap_series_count?: number;
  clay_series_count?: number;
};

export function isClayDisciplineType(disciplineType: string) {
  return ["trap", HUNTING_TRAP_TYPE, "skeet"].includes(disciplineType);
}

export function getClayTargetsCount(discipline: ClayDiscipline) {
  if (discipline.discipline_type === HUNTING_TRAP_TYPE) {
    return HUNTING_TRAP_TARGETS_COUNT;
  }

  return Math.max(
    Number(discipline.clay_series_count || discipline.trap_series_count || 0),
    0
  ) * 25;
}
