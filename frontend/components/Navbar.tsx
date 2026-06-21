"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { apiUrl } from "@/lib/api";
import {
  isPremiumActive,
  PREMIUM_EXPIRED_MESSAGE,
  PREMIUM_LOGIN_REQUIRED_MESSAGE,
} from "@/lib/premium";
import {
  authFetch,
  getAuthSnapshot,
  logoutSession,
  notifyAuthChange,
  refreshAccessToken,
  SESSION_DEADLINE_STORAGE_KEY,
  SESSION_TIMEOUT_MS,
  subscribeToAuthChange,
} from "@/lib/auth";

type PublicCompetition = {
  status: string;
};

type MeResponse = {
  email?: string;
  role?: string;
  roles?: string[];
  premium_until?: string;
  premium_disabled?: boolean;
  account_type?: string;
  pzss_club_status?: string;
  profile_complete?: boolean;
  phone_number?: string;
  organizer_name?: string;
  judge_license_number?: string;
  judge_license_valid_until?: string;
};

type RoleDialog = "organizer" | "judge" | null;

type ClubMemberNotification = {
  membership_status?: string;
};

function formatSessionTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function normalizeRolePhone(value: string) {
  const trimmedValue = value.trim();
  const hasPlusPrefix = trimmedValue.startsWith("+");
  const digits = trimmedValue.replace(/\D/g, "");

  if (digits.length < 7 || digits.length > 15) {
    return "";
  }

  return hasPlusPrefix ? `+${digits}` : digits;
}

function isFutureRoleDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return !Number.isNaN(date.getTime()) && date >= today;
}

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hasStartedCompetition, setHasStartedCompetition] = useState(false);
  const [premiumActive, setPremiumActive] = useState(false);
  const [pendingClubMembersCount, setPendingClubMembersCount] = useState(0);
  const [sessionRemainingMs, setSessionRemainingMs] = useState(SESSION_TIMEOUT_MS);
  const [roleDialog, setRoleDialog] = useState<RoleDialog>(null);
  const [roleConfirmationOpen, setRoleConfirmationOpen] = useState(false);
  const [rolePhoneNumber, setRolePhoneNumber] = useState("");
  const [roleOrganizerName, setRoleOrganizerName] = useState("");
  const [roleJudgeLicenseNumber, setRoleJudgeLicenseNumber] = useState("");
  const [roleJudgeLicenseValidUntil, setRoleJudgeLicenseValidUntil] = useState("");
  const [roleMessage, setRoleMessage] = useState("");
  const [roleSubmitting, setRoleSubmitting] = useState(false);
  const authSnapshot = useSyncExternalStore(
    subscribeToAuthChange,
    getAuthSnapshot,
    () => ""
  );

  const [token, role, rolesText, email, accountType, pzssClubStatus] = authSnapshot.split("|");
  const roles = rolesText
    ? rolesText.split(",").filter(Boolean)
    : role
      ? [role]
      : [];
  const user = token
    ? {
        token,
        role,
        roles,
        email,
        accountType: accountType || "user",
        pzssClubStatus: pzssClubStatus || "",
      }
    : null;
  const isShooter = Boolean(user?.roles.includes("shooter"));
  const isAdmin = Boolean(user?.roles.includes("admin"));
  const isVerifiedPzssClub = Boolean(
    user?.accountType === "pzss_club" && user?.pzssClubStatus === "approved"
  );
  const liveResultsClass = hasStartedCompetition
    ? "font-bold text-red-400"
    : "font-bold text-green-100";
  const sessionTimeLabel = formatSessionTime(sessionRemainingMs);
  const hasPendingClubMembers = pendingClubMembersCount > 0;


  useEffect(() => {
    void refreshAccessToken();
  }, []);

  useEffect(() => {
    let active = true;

    if (!token) {
      const timeoutId = window.setTimeout(() => {
        if (active) {
          setPremiumActive(false);
        }
      }, 0);

      return () => {
        active = false;
        window.clearTimeout(timeoutId);
      };
    }

    async function loadPremiumStatus() {
      try {
        const response = await authFetch(
          apiUrl("/me"),
          {
            cache: "no-store",
          }
        );
        const data: MeResponse = await response.json().catch(() => ({}));

        if (active) {
          setPremiumActive(response.ok && isPremiumActive(
            data.premium_until,
            data.premium_disabled
          ));
        }
      } catch (error) {
        console.error(error);

        if (active) {
          setPremiumActive(false);
        }
      }
    }

    loadPremiumStatus();

    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    let active = true;

    if (!isVerifiedPzssClub) {
      return;
    }

    async function loadPendingClubMembers() {
      try {
        const response = await authFetch(
          apiUrl("/me/club-members"),
          {
            cache: "no-store",
          }
        );
        const members: ClubMemberNotification[] = await response.json().catch(() => []);

        if (!active) {
          return;
        }

        if (!response.ok || !Array.isArray(members)) {
          setPendingClubMembersCount(0);
          return;
        }

        setPendingClubMembersCount(
          members.filter((member) => member.membership_status !== "confirmed").length
        );
      } catch (error) {
        console.error(error);

        if (active) {
          setPendingClubMembersCount(0);
        }
      }
    }

    void loadPendingClubMembers();
    const intervalId = window.setInterval(loadPendingClubMembers, 60000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [isVerifiedPzssClub, token]);

  useEffect(() => {
    let active = true;

    async function loadStartedCompetitions() {
      try {
        const response = await fetch(
          apiUrl("/competitions"),
          {
            cache: "no-store",
          }
        );

        if (!response.ok) {
          return;
        }

        const competitions: PublicCompetition[] = await response.json();

        if (active) {
          setHasStartedCompetition(
            competitions.some((competition) => competition.status === "started")
          );
        }
      } catch (error) {
        console.error(error);
      }
    }

    loadStartedCompetitions();
    const intervalId = window.setInterval(loadStartedCompetitions, 30000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);


  useEffect(() => {
    if (!token) {
      localStorage.removeItem(SESSION_DEADLINE_STORAGE_KEY);
      return;
    }

    let active = true;
    let lastActivityRefresh = 0;

    function readDeadline() {
      const storedValue = Number(localStorage.getItem(SESSION_DEADLINE_STORAGE_KEY));

      return Number.isFinite(storedValue) && storedValue > 0
        ? storedValue
        : 0;
    }

    function writeDeadline(deadline: number) {
      localStorage.setItem(SESSION_DEADLINE_STORAGE_KEY, String(deadline));
      setSessionRemainingMs(Math.max(0, deadline - Date.now()));
    }

    function refreshSessionDeadline(force = false) {
      const now = Date.now();

      if (!force && now - lastActivityRefresh < 1000) {
        return;
      }

      lastActivityRefresh = now;
      writeDeadline(now + SESSION_TIMEOUT_MS);
    }

    function logoutAfterInactivity() {
      if (!active) {
        return;
      }

      void logoutSession().finally(() => {
        window.location.href = "/";
      });
    }

    function updateRemainingTime() {
      const deadline = readDeadline();

      if (!deadline) {
        refreshSessionDeadline(true);
        return;
      }

      const remaining = deadline - Date.now();
      setSessionRemainingMs(Math.max(0, remaining));

      if (remaining <= 0) {
        logoutAfterInactivity();
      }
    }

    function isSessionExpired() {
      const deadline = readDeadline();

      return Boolean(deadline && deadline <= Date.now());
    }

    function handleActivity() {
      if (isSessionExpired()) {
        logoutAfterInactivity();
        return;
      }

      refreshSessionDeadline();
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        return;
      }

      if (isSessionExpired()) {
        logoutAfterInactivity();
        return;
      }

      refreshSessionDeadline(true);
    }

    function handleStorageChange(event: StorageEvent) {
      if (event.key === SESSION_DEADLINE_STORAGE_KEY) {
        updateRemainingTime();
      }
    }

    if (!readDeadline()) {
      refreshSessionDeadline(true);
    } else {
      updateRemainingTime();
    }

    const activityEvents: Array<keyof WindowEventMap> = [
      "click",
      "keydown",
      "mousedown",
      "mousemove",
      "scroll",
      "touchstart",
    ];

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("storage", handleStorageChange);

    const intervalId = window.setInterval(updateRemainingTime, 1000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [token]);

  function guardPremiumLink(event: MouseEvent<HTMLAnchorElement>) {
    if (premiumActive) {
      return;
    }

    event.preventDefault();
    setMobileMenuOpen(false);
    window.alert(user ? PREMIUM_EXPIRED_MESSAGE : PREMIUM_LOGIN_REQUIRED_MESSAGE);
  }

  async function openRolePanel(
    event: MouseEvent<HTMLAnchorElement>,
    requestedRole: Exclude<RoleDialog, null>,
  ) {
    if (isAdmin) {
      setMobileMenuOpen(false);
      return;
    }

    event.preventDefault();
    setMobileMenuOpen(false);

    if (!user) {
      window.location.href = "/login";
      return;
    }

    try {
      const response = await authFetch(apiUrl("/me"), {
        cache: "no-store",
      });
      const profile: MeResponse = await response.json().catch(() => ({}));

      if (!response.ok) {
        window.location.href = "/login";
        return;
      }

      const profileRoles = profile.roles || [];
      const roleIsReady = profileRoles.includes(requestedRole);

      if (roleIsReady) {
        window.location.href = requestedRole === "organizer" ? "/organizer" : "/judge";
        return;
      }

      if (!profile.profile_complete) {
        window.alert("Najpierw uzupełnij wymagane dane profilu, aby otrzymać status Strzelca i przyjąć kolejną rolę.");
        window.location.href = "/profile";
        return;
      }

      setRoleDialog(requestedRole);
      setRoleConfirmationOpen(false);
      setRoleMessage("");
      setRolePhoneNumber(profile.phone_number || "");
      setRoleOrganizerName(profile.organizer_name || "");
      setRoleJudgeLicenseNumber(profile.judge_license_number || "");
      setRoleJudgeLicenseValidUntil(profile.judge_license_valid_until || "");

      const requiredRoleDataIsComplete = requestedRole === "organizer"
        ? Boolean(profile.organizer_name?.trim() && normalizeRolePhone(profile.phone_number || ""))
        : Boolean(
            profile.judge_license_number?.trim()
            && isFutureRoleDate(profile.judge_license_valid_until || "")
          );

      setRoleConfirmationOpen(requiredRoleDataIsComplete);
    } catch (error) {
      console.error(error);
      window.alert("Nie udało się pobrać danych profilu. Spróbuj ponownie.");
    }
  }

  function prepareRoleConfirmation() {
    if (roleDialog === "organizer") {
      if (!roleOrganizerName.trim()) {
        setRoleMessage("Podaj nazwę organizatora.");
        return;
      }

      if (!normalizeRolePhone(rolePhoneNumber)) {
        setRoleMessage("Podaj poprawny numer telefonu organizatora.");
        return;
      }
    }

    if (roleDialog === "judge") {
      if (!roleJudgeLicenseNumber.trim()) {
        setRoleMessage("Podaj numer licencji sędziowskiej.");
        return;
      }

      if (!isFutureRoleDate(roleJudgeLicenseValidUntil)) {
        setRoleMessage("Podaj poprawną przyszłą datę ważności licencji sędziowskiej.");
        return;
      }
    }

    setRoleMessage("");
    setRoleConfirmationOpen(true);
  }

  async function acceptRole() {
    if (!roleDialog) {
      return;
    }

    const body = roleDialog === "organizer"
      ? {
          role: roleDialog,
          confirmed: true,
          organizer_name: roleOrganizerName.trim(),
          phone_number: normalizeRolePhone(rolePhoneNumber),
        }
      : {
          role: roleDialog,
          confirmed: true,
          judge_license_number: roleJudgeLicenseNumber.trim(),
          judge_license_valid_until: roleJudgeLicenseValidUntil,
        };

    try {
      setRoleSubmitting(true);
      setRoleMessage("");

      const response = await authFetch(apiUrl("/me/role-request"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data: MeResponse & { detail?: string; message?: string } = await response.json().catch(() => ({}));

      if (!response.ok) {
        setRoleConfirmationOpen(false);
        setRoleMessage(data.detail || "Nie udało się przyznać roli.");
        return;
      }

      if (data.role) {
        localStorage.setItem("role", data.role);
      }

      if (data.roles?.length) {
        localStorage.setItem("roles", data.roles.join(","));
      }

      notifyAuthChange();
      const destination = roleDialog === "organizer" ? "/organizer" : "/judge";
      setRoleDialog(null);
      setRoleConfirmationOpen(false);
      window.alert(data.message || "Rola została przyznana.");
      window.location.href = destination;
    } catch (error) {
      console.error(error);
      setRoleConfirmationOpen(false);
      setRoleMessage("Błąd połączenia z serwerem.");
    } finally {
      setRoleSubmitting(false);
    }
  }

  function closeRoleDialog() {
    if (roleSubmitting) {
      return;
    }

    setRoleDialog(null);
    setRoleConfirmationOpen(false);
    setRoleMessage("");
  }

  function logout() {
    void logoutSession().finally(() => {
      window.location.href = "/";
    });
  }

  function pendingClubMembersText(count: number) {
    if (count === 1) {
      return "1 strzelec oczekuje na akceptację na liście klubowiczów.";
    }

    if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
      return `${count} strzelców oczekuje na akceptację na liście klubowiczów.`;
    }

    return `${count} strzelców oczekuje na akceptację na liście klubowiczów.`;
  }

  return (
    <>
    <nav className="ui-navbar hidden w-full bg-green-900 text-white px-4 py-3 sm:px-6 lg:block">
      <div className="ui-navbar-inner flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-base">

        <Link href="/">
          Home
        </Link>

        <Link href="/competitions">
          Zawody
        </Link>

        <Link
          href="/live-results"
          onClick={guardPremiumLink}
          className={liveResultsClass}
        >
          Wyniki na Żywo
        </Link>

        <Link href="/historical-results">
          Wyniki Historyczne
        </Link>

        <Link href="/ranking" onClick={guardPremiumLink}>
          Ranking
        </Link>

        {user && (
          <Link href="/profile">
            Profil
          </Link>
        )}

        {user && (
          <Link href="/achievements" onClick={guardPremiumLink}>
            Odznaczenia
          </Link>
        )}

        {isShooter && (
          <Link href="/profile/statistics" onClick={guardPremiumLink}>
            Statystyki
          </Link>
        )}

        <Link
          href="/organizer"
          onClick={(event) => void openRolePanel(event, "organizer")}
        >
          Panel Organizatora
        </Link>

        {isVerifiedPzssClub && (
          <Link
            href="/club-members"
            className="inline-flex items-center gap-2"
          >
            <span>Lista klubowiczów</span>
            {hasPendingClubMembers && (
              <span className="rounded-full bg-yellow-300 px-2 py-0.5 text-xs font-black text-zinc-950">
                {pendingClubMembersCount}
              </span>
            )}
          </Link>
        )}

        <Link
          href="/judge"
          onClick={(event) => void openRolePanel(event, "judge")}
        >
          Panel Sędziego
        </Link>

        {isAdmin && (
          <Link href="/admin">
            Panel Administratora
          </Link>
        )}

      </div>

      <div className="flex w-full min-w-0 items-center justify-between gap-3 border-t border-green-800 pt-3 lg:w-auto lg:border-t-0 lg:pt-0">

        {user ? (
          <>
            <span className="min-w-0 flex-1 truncate text-sm text-gray-300 lg:max-w-[260px]">
              {user.email}
            </span>

            <div className="flex shrink-0 flex-col items-end gap-1">
              <button
                onClick={logout}
                className="ui-button bg-red-600 px-3 py-2 rounded-lg font-semibold hover:bg-red-500 transition sm:px-4"
              >
                Wyloguj
              </button>
              <span className="text-xs font-semibold text-green-100">
                Sesja: {sessionTimeLabel}
              </span>
            </div>
          </>
        ) : (
          <div className="flex w-full flex-wrap items-center justify-end gap-4">
            <Link href="/login">
              Logowanie
            </Link>

            <Link href="/register">
              Rejestracja
            </Link>
          </div>
        )}

      </div>
      </div>

    </nav>

    {isVerifiedPzssClub && hasPendingClubMembers && (
      <Link
        href="/club-members"
        className="block border-y border-yellow-500/60 bg-yellow-400 px-4 py-3 text-center font-bold text-zinc-950 shadow-[0_4px_16px_rgba(250,204,21,0.25)] transition hover:bg-yellow-300 sm:px-6"
      >
        {pendingClubMembersText(pendingClubMembersCount)} Przejdź do listy klubowiczów.
      </Link>
    )}

    <nav className="ui-navbar w-full bg-green-900 text-white px-4 py-3 sm:px-6 lg:hidden">
      <div className="ui-navbar-inner">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="text-lg font-bold"
            onClick={() => setMobileMenuOpen(false)}
          >
            Panel Główny
          </Link>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((currentValue) => !currentValue)}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-green-800 text-2xl font-bold transition hover:bg-green-800"
            aria-label={mobileMenuOpen ? "Zamknij menu" : "Otwórz menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? "×" : "≡"}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="mt-4 border-t border-green-800 pt-4">
            <div className="flex flex-col text-lg font-semibold">
              <Link
                href="/"
                onClick={() => setMobileMenuOpen(false)}
                className="py-3"
              >
                Home
              </Link>

              <Link
                href="/competitions"
                onClick={() => setMobileMenuOpen(false)}
                className="py-3"
              >
                Zawody
              </Link>

              <Link
                href="/live-results"
                onClick={(event) => {
                  if (premiumActive) {
                    setMobileMenuOpen(false);
                  } else {
                    guardPremiumLink(event);
                  }
                }}
                className={`py-3 ${liveResultsClass}`}
              >
                Wyniki na Żywo
              </Link>

              <Link
                href="/historical-results"
                onClick={() => setMobileMenuOpen(false)}
                className="py-3"
              >
                Wyniki Historyczne
              </Link>

              <Link
                href="/ranking"
                onClick={(event) => {
                  if (premiumActive) {
                    setMobileMenuOpen(false);
                  } else {
                    guardPremiumLink(event);
                  }
                }}
                className="py-3"
              >
                Ranking
              </Link>

              {user && (
                <Link
                  href="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-3"
                >
                  Profil
                </Link>
              )}

              {user && (
                <Link
                  href="/achievements"
                  onClick={(event) => {
                    if (premiumActive) {
                      setMobileMenuOpen(false);
                    } else {
                      guardPremiumLink(event);
                    }
                  }}
                  className="py-3"
                >
                  Odznaczenia
                </Link>
              )}

              {isShooter && (
                <Link
                  href="/profile/statistics"
                  onClick={(event) => {
                    if (premiumActive) {
                      setMobileMenuOpen(false);
                    } else {
                      guardPremiumLink(event);
                    }
                  }}
                  className="py-3"
                >
                  Statystyki
                </Link>
              )}

              <Link
                href="/organizer"
                onClick={(event) => void openRolePanel(event, "organizer")}
                className="py-3"
              >
                Panel Organizatora
              </Link>

              {isVerifiedPzssClub && (
                <Link
                  href="/club-members"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <span>Lista klubowiczów</span>
                  {hasPendingClubMembers && (
                    <span className="rounded-full bg-yellow-300 px-2 py-0.5 text-xs font-black text-zinc-950">
                      {pendingClubMembersCount}
                    </span>
                  )}
                </Link>
              )}

              <Link
                href="/judge"
                onClick={(event) => void openRolePanel(event, "judge")}
                className="py-3"
              >
                Panel Sędziego
              </Link>

              {isAdmin && (
                <>
                  <Link
                    href="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className="py-3"
                  >
                    Panel Administratora
                  </Link>

                  <div className="my-2 border-t border-green-800 pt-2 text-base text-green-100">
                    <p className="py-2 text-sm font-bold uppercase tracking-wide text-gray-300">
                      Admin
                    </p>

                    <Link
                      href="/admin?tab=users"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block py-2"
                    >
                      Użytkownicy
                    </Link>

                    <Link
                      href="/admin?tab=pzss-clubs"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block py-2"
                    >
                      Kluby PZSS
                    </Link>

                    <Link
                      href="/admin?tab=competitions"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block py-2"
                    >
                      Zawody
                    </Link>

                    <Link
                      href="/admin?tab=settings"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block py-2"
                    >
                      Settings
                    </Link>

                    <Link
                      href="/admin?tab=ads"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block py-2"
                    >
                      Reklamy
                    </Link>

                    <Link
                      href="/admin?tab=monitoring"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block py-2"
                    >
                      Monitoring
                    </Link>

                    <Link
                      href="/admin?tab=qr-scanner"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block py-2"
                    >
                      QR skaner
                    </Link>

                    <Link
                      href="/admin?tab=test-data"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block py-2"
                    >
                      Test danych
                    </Link>
                  </div>
                </>
              )}
            </div>

            <div className="mt-4 border-t border-green-800 pt-4">
              {user ? (
                <div className="flex flex-col gap-3">
                  <span className="truncate text-sm text-gray-300">
                    {user.email}
                  </span>

                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={logout}
                      className="ui-button w-full bg-red-600 px-3 py-2 rounded-lg font-semibold hover:bg-red-500 transition"
                    >
                      Wyloguj
                    </button>
                    <span className="text-center text-sm font-semibold text-green-100">
                      Sesja: {sessionTimeLabel}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3 text-lg font-semibold">
                  <Link
                    href="/login"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Logowanie
                  </Link>

                  <Link
                    href="/register"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Rejestracja
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>

    {isAdmin && (
      <nav className="ui-navbar hidden w-full overflow-hidden bg-zinc-950 border-b border-zinc-800 text-white px-4 py-3 sm:px-6 lg:block">
        <div className="ui-navbar-inner flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold sm:gap-3">
          <span className="mr-1 shrink-0 text-gray-400">
            Admin
          </span>

          <Link
            href="/admin?tab=users"
            className="ui-button min-w-0 bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg text-center transition"
          >
            Użytkownicy
          </Link>

          <Link
            href="/admin?tab=pzss-clubs"
            className="ui-button min-w-0 bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg text-center transition"
          >
            Kluby PZSS
          </Link>

          <Link
            href="/admin?tab=competitions"
            className="ui-button min-w-0 bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg text-center transition"
          >
            Zawody
          </Link>

          <Link
            href="/admin?tab=settings"
            className="ui-button min-w-0 bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg text-center transition"
          >
            Settings
          </Link>

          <Link
            href="/admin?tab=ads"
            className="ui-button min-w-0 bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg text-center transition"
          >
            Reklamy
          </Link>

          <Link
            href="/admin?tab=monitoring"
            className="ui-button min-w-0 bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg text-center transition"
          >
            Monitoring
          </Link>

          <Link
            href="/admin?tab=qr-scanner"
            className="ui-button min-w-0 bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg text-center transition"
          >
            QR skaner
          </Link>

          <Link
            href="/admin?tab=test-data"
            className="ui-button min-w-0 bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg text-center transition"
          >
            Test danych
          </Link>
        </div>
      </nav>
    )}

    {roleDialog && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 py-6">
        <div className="w-full max-w-lg rounded-xl border border-green-800 bg-white p-6 text-zinc-950 shadow-2xl dark:bg-zinc-950 dark:text-white">
          {roleConfirmationOpen ? (
            <>
              <h2 className="text-2xl font-bold text-red-600 dark:text-red-400">
                Potwierdzenie przyjęcia roli
              </h2>

              <p className="mt-4 text-base leading-7">
                Czy na pewno świadomie chcesz przyjąć rolę {roleDialog === "organizer" ? "Organizatora" : "Sędziego"} w systemie?
              </p>

              <p className="mt-3 font-semibold text-red-700 dark:text-red-300">
                Wybranie „Tak” natychmiast doda rolę do Twojego konta.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void acceptRole()}
                  disabled={roleSubmitting}
                  className="rounded-lg bg-green-800 px-5 py-3 font-bold text-white transition hover:bg-green-700 disabled:opacity-50"
                >
                  {roleSubmitting ? "Przyjmowanie roli..." : "Tak, przyjmuję rolę"}
                </button>

                <button
                  type="button"
                  onClick={() => setRoleConfirmationOpen(false)}
                  disabled={roleSubmitting}
                  className="rounded-lg bg-red-800 px-5 py-3 font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  Nie
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-green-800 dark:text-green-300">
                {roleDialog === "organizer"
                  ? "Dane Organizatora"
                  : "Dane Sędziego"}
              </h2>

              <p className="mt-2 text-sm text-zinc-600 dark:text-gray-300">
                Uzupełnij wymagane pola przed przyjęciem roli.
              </p>

              {roleDialog === "organizer" ? (
                <div className="mt-5 space-y-4">
                  <label className="block">
                    <span className="mb-2 block font-semibold">Telefon *</span>
                    <input
                      type="tel"
                      inputMode="tel"
                      value={rolePhoneNumber}
                      onChange={(event) => setRolePhoneNumber(event.target.value)}
                      placeholder="Numer telefonu organizatora"
                      className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-950 outline-none focus:border-green-700 dark:border-zinc-700 dark:bg-black dark:text-white"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block font-semibold">Nazwa Organizatora *</span>
                    <input
                      value={roleOrganizerName}
                      onChange={(event) => setRoleOrganizerName(event.target.value)}
                      placeholder="Oficjalna nazwa organizatora"
                      className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-950 outline-none focus:border-green-700 dark:border-zinc-700 dark:bg-black dark:text-white"
                    />
                  </label>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  <label className="block">
                    <span className="mb-2 block font-semibold">Nr licencji sędziowskiej *</span>
                    <input
                      value={roleJudgeLicenseNumber}
                      onChange={(event) => setRoleJudgeLicenseNumber(event.target.value)}
                      placeholder="Numer licencji sędziowskiej"
                      className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-950 outline-none focus:border-green-700 dark:border-zinc-700 dark:bg-black dark:text-white"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block font-semibold">Data ważności *</span>
                    <input
                      type="date"
                      value={roleJudgeLicenseValidUntil}
                      onChange={(event) => setRoleJudgeLicenseValidUntil(event.target.value)}
                      className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-950 outline-none focus:border-green-700 dark:border-zinc-700 dark:bg-black dark:text-white"
                    />
                  </label>
                </div>
              )}

              {roleMessage && (
                <p className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 font-semibold text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
                  {roleMessage}
                </p>
              )}

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={prepareRoleConfirmation}
                  className="rounded-lg bg-green-800 px-5 py-3 font-bold text-white transition hover:bg-green-700"
                >
                  Dalej
                </button>

                <button
                  type="button"
                  onClick={closeRoleDialog}
                  className="rounded-lg bg-zinc-800 px-5 py-3 font-bold text-white transition hover:bg-zinc-700"
                >
                  Anuluj
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )}
    </>
  );
}
