export const SHOOTING_RANGE_SUBMISSIONS_CHANGE_EVENT = "shooting-system:shooting-range-submissions-change";
export const SHOOTING_RANGE_SUBMISSIONS_CHANGE_STORAGE_KEY = "shooting-system:shooting-range-submissions-updated-at";

export function notifyShootingRangeSubmissionsChange() {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(
    SHOOTING_RANGE_SUBMISSIONS_CHANGE_STORAGE_KEY,
    String(Date.now())
  );
  window.dispatchEvent(new Event(SHOOTING_RANGE_SUBMISSIONS_CHANGE_EVENT));
}
