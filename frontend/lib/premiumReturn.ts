const STORAGE_KEY = "shooting-system:premium-return";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type PendingCheckout = { orderId: string; email: string; createdAt: number };

export function premiumOrderPath(orderId: string) {
  return `/premium/zakup?${new URLSearchParams({ OrderID: orderId })}`;
}

export function rememberPremiumCheckout(orderId: string, email: string) {
  try {
    // This is only a return-navigation hint. The server checks order ownership
    // and the verified payment status before showing any purchase result.
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ orderId, email, createdAt: Date.now() }));
  } catch { /* A signed operator return or the history entry still identifies the order. */ }
}

export function pendingPremiumCheckout(email: string): string | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "null") as PendingCheckout | null;
    if (!value || typeof value.orderId !== "string" || !/^[a-f0-9]{32}$/.test(value.orderId)
        || typeof value.email !== "string" || value.email.toLowerCase() !== email.toLowerCase()
        || typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt)
        || Date.now() - value.createdAt < 0 || Date.now() - value.createdAt > MAX_AGE_MS) return null;
    return value.orderId;
  } catch { return null; }
}

export function forgetPremiumCheckout(orderId: string, email: string) {
  try {
    if (pendingPremiumCheckout(email) === orderId) window.sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* Storage may be unavailable. */ }
}
