const AUTH_REDIRECT_STORAGE_KEY = "shooting-system:auth-redirect";

function isSafeInternalPath(value: string) {
  return value.startsWith("/")
    && !value.startsWith("//")
    && !value.includes("\\");
}

export function safeAuthRedirectPath(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  try {
    const decodedValue = decodeURIComponent(value);

    return isSafeInternalPath(decodedValue)
      ? decodedValue
      : "";
  } catch {
    return isSafeInternalPath(value)
      ? value
      : "";
  }
}

export function buildAuthPath(pathname: string, redirectPath: string) {
  const safeRedirectPath = safeAuthRedirectPath(redirectPath);

  if (!safeRedirectPath) {
    return pathname;
  }

  const separator = pathname.includes("?") ? "&" : "?";

  return `${pathname}${separator}next=${encodeURIComponent(safeRedirectPath)}`;
}

export function storeAuthRedirectPath(redirectPath: string) {
  if (typeof window === "undefined") {
    return;
  }

  const safeRedirectPath = safeAuthRedirectPath(redirectPath);

  if (!safeRedirectPath) {
    return;
  }

  localStorage.setItem(AUTH_REDIRECT_STORAGE_KEY, safeRedirectPath);
}

export function getStoredAuthRedirectPath() {
  if (typeof window === "undefined") {
    return "";
  }

  return safeAuthRedirectPath(localStorage.getItem(AUTH_REDIRECT_STORAGE_KEY));
}

export function consumeAuthRedirectPath() {
  const redirectPath = getStoredAuthRedirectPath();

  if (typeof window !== "undefined") {
    localStorage.removeItem(AUTH_REDIRECT_STORAGE_KEY);
  }

  return redirectPath;
}
