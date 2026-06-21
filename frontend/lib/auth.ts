import { apiUrl } from "@/lib/api";

const AUTH_CHANGE_EVENT = "shooting-system:auth-change";
const AUTH_STORAGE_KEYS = new Set(["role", "roles", "email", "account_type", "pzss_club_status"]);

type SessionAuthData = {
  access_token?: string;
  token?: string;
  email?: string;
  role?: string;
  roles?: string[] | string;
  account_type?: string;
  pzss_club_status?: string;
};

const PENDING_ACCESS_TOKEN = "__shooting_system_refreshing_access_token__";

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;
let fetchBridgeInstalled = false;

function normalizeRoles(roles: SessionAuthData["roles"], fallbackRole?: string) {
  if (Array.isArray(roles)) {
    return roles.filter(Boolean);
  }

  if (typeof roles === "string" && roles.trim()) {
    return roles
      .split(",")
      .map((role) => role.trim())
      .filter(Boolean);
  }

  return fallbackRole ? [fallbackRole] : [];
}

function storeSessionMetadata(data: SessionAuthData) {
  if (typeof window === "undefined") {
    return;
  }

  if (data.email) {
    localStorage.setItem("email", data.email);
  }

  const roles = normalizeRoles(data.roles, data.role);
  const role = data.role || roles[0] || "";

  if (role) {
    localStorage.setItem("role", role);
  }

  if (roles.length) {
    localStorage.setItem("roles", roles.join(","));
  }

  localStorage.setItem("account_type", data.account_type || "user");
  localStorage.setItem("pzss_club_status", data.pzss_club_status || "");
  localStorage.removeItem("token");
}

export function notifyAuthChange() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

export function subscribeToAuthChange(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  function handleStorageChange(event: StorageEvent) {
    if (!event.key || AUTH_STORAGE_KEYS.has(event.key)) {
      onStoreChange();
    }
  }

  window.addEventListener(AUTH_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", handleStorageChange);

  return () => {
    window.removeEventListener(AUTH_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", handleStorageChange);
  };
}

export function setSessionAuth(data: SessionAuthData) {
  if (typeof window === "undefined") {
    return;
  }

  accessToken = data.access_token || data.token || null;
  storeSessionMetadata(data);
  notifyAuthChange();
}

export function getAccessToken() {
  if (accessToken) {
    return accessToken;
  }

  if (typeof window !== "undefined" && localStorage.getItem("email")) {
    void refreshAccessToken();
    return PENDING_ACCESS_TOKEN;
  }

  return null;
}

function installFetchBridge() {
  if (typeof window === "undefined" || fetchBridgeInstalled) {
    return;
  }

  fetchBridgeInstalled = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);

    if (headers.get("Authorization") === `Bearer ${PENDING_ACCESS_TOKEN}`) {
      const token = await getValidAccessToken();

      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      } else {
        headers.delete("Authorization");
      }
    }

    return originalFetch(input, {
      ...init,
      headers,
    });
  };
}

export function getAuthSnapshot() {
  if (typeof window === "undefined") {
    return "";
  }

  const token = accessToken || (localStorage.getItem("email") ? PENDING_ACCESS_TOKEN : "");
  const role = localStorage.getItem("role") || "";
  const roles = localStorage.getItem("roles") || role;
  const email = localStorage.getItem("email") || "";
  const accountType = localStorage.getItem("account_type") || "user";
  const pzssClubStatus = localStorage.getItem("pzss_club_status") || "";

  return `${token}|${role}|${roles}|${email}|${accountType}|${pzssClubStatus}`;
}

export function clearStoredAuth() {
  if (typeof window === "undefined") {
    accessToken = null;
    return;
  }

  accessToken = null;
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("roles");
  localStorage.removeItem("email");
  localStorage.removeItem("account_type");
  localStorage.removeItem("pzss_club_status");

  notifyAuthChange();
}

export async function refreshAccessToken() {
  installFetchBridge();

  if (typeof window === "undefined") {
    return null;
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = fetch(apiUrl("/refresh"), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) {
        clearStoredAuth();
        return null;
      }

      const data: SessionAuthData = await response.json();
      setSessionAuth(data);

      return accessToken;
    })
    .catch(() => {
      clearStoredAuth();
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

export async function getValidAccessToken() {
  return accessToken || refreshAccessToken();
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = await getValidAccessToken();
  const headers = new Headers(init.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const requestInit: RequestInit = {
    ...init,
    credentials: init.credentials || "include",
    headers,
  };

  let response = await fetch(input, requestInit);

  if (response.status !== 401) {
    return response;
  }

  accessToken = null;
  const refreshedToken = await refreshAccessToken();

  if (!refreshedToken) {
    return response;
  }

  const retryHeaders = new Headers(init.headers);
  retryHeaders.set("Authorization", `Bearer ${refreshedToken}`);

  response = await fetch(input, {
    ...init,
    credentials: init.credentials || "include",
    headers: retryHeaders,
  });

  return response;
}

export async function logoutSession() {
  try {
    await fetch(apiUrl("/logout"), {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    });
  } finally {
    clearStoredAuth();
  }
}

export function getStoredRoles() {
  if (typeof window === "undefined") {
    return [];
  }

  const roles = localStorage.getItem("roles");

  if (roles) {
    return roles
      .split(",")
      .map((role) => role.trim())
      .filter(Boolean);
  }

  const role = localStorage.getItem("role");

  return role ? [role] : [];
}

export function getUser() {
  if (typeof window === "undefined" || !accessToken) {
    return null;
  }

  return {
    token: accessToken,
    role: localStorage.getItem("role"),
    roles: getStoredRoles(),
    email: localStorage.getItem("email"),
    account_type: localStorage.getItem("account_type") || "user",
    pzss_club_status: localStorage.getItem("pzss_club_status") || "",
  };
}

export function isLoggedIn() {
  return Boolean(accessToken || (typeof window !== "undefined" && localStorage.getItem("email")));
}

export function isAdmin() {
  return getStoredRoles().includes("admin");
}

export function isOrganizer() {
  const roles = getStoredRoles();

  return roles.includes("organizer") || roles.includes("admin");
}

export function isJudge() {
  return getStoredRoles().includes("judge");
}

installFetchBridge();
