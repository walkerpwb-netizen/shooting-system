export const GUN_SHOP_SUBMISSIONS_CHANGE_EVENT = "shooting-system:gun-shop-submissions-change";
export const GUN_SHOP_SUBMISSIONS_CHANGE_STORAGE_KEY = "shooting-system:gun-shop-submissions-updated-at";

export function notifyGunShopSubmissionsChange() {
  if (typeof window === "undefined") return;
  localStorage.setItem(GUN_SHOP_SUBMISSIONS_CHANGE_STORAGE_KEY, String(Date.now()));
  window.dispatchEvent(new Event(GUN_SHOP_SUBMISSIONS_CHANGE_EVENT));
}
