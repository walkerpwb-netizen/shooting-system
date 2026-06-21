export const PREMIUM_EXPIRED_MESSAGE = "Status premium wygasł";
export const PREMIUM_LOGIN_REQUIRED_MESSAGE = "Musisz się zalogować, aby skorzystać z tej funkcji.";

export function isPremiumActive(
  premiumUntil?: string | null,
  premiumDisabled?: boolean | null
) {
  if (premiumDisabled || !premiumUntil) {
    return false;
  }

  const expirationDate = new Date(premiumUntil);

  if (Number.isNaN(expirationDate.getTime())) {
    return false;
  }

  return Date.now() <= expirationDate.getTime();
}

export function authHeaderFromToken(token?: string | null): Record<string, string> {
  return token
    ? { Authorization: `Bearer ${token}` }
    : {};
}
