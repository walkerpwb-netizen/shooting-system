"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

import { apiUrl } from "@/lib/api";

type PublicCompetition = {
  status: string;
};

function subscribeToAuthChange() {
  return () => {};
}

function getAuthSnapshot() {
  if (typeof window === "undefined") {
    return "";
  }

  const token = localStorage.getItem("token") || "";
  const role = localStorage.getItem("role") || "";
  const roles = localStorage.getItem("roles") || role;
  const email = localStorage.getItem("email") || "";

  return `${token}|${role}|${roles}|${email}`;
}

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hasStartedCompetition, setHasStartedCompetition] = useState(false);
  const authSnapshot = useSyncExternalStore(
    subscribeToAuthChange,
    getAuthSnapshot,
    () => ""
  );

  const [token, role, rolesText, email] = authSnapshot.split("|");
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
      }
    : null;
  const isOrganizer = Boolean(
    user?.roles.includes("organizer") || user?.roles.includes("admin")
  );
  const isJudge = Boolean(user?.roles.includes("judge"));
  const isAdmin = Boolean(user?.roles.includes("admin"));
  const liveResultsClass = hasStartedCompetition
    ? "font-bold text-red-400"
    : "font-bold text-green-100";

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

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("roles");
    localStorage.removeItem("email");

    window.location.href = "/";
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
          className={liveResultsClass}
        >
          Wyniki na Żywo
        </Link>

        <Link href="/historical-results">
          Wyniki Historyczne
        </Link>

        <Link href="/ranking">
          Ranking
        </Link>

        {user && (
          <Link href="/profile">
            Profil
          </Link>
        )}

        {isOrganizer && (
          <Link href="/organizer">
            Panel Organizatora
          </Link>
        )}

        {isJudge && (
          <Link href="/judge">
            Panel Sędziego
          </Link>
        )}

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

            <button
              onClick={logout}
              className="ui-button shrink-0 bg-red-600 px-3 py-2 rounded-lg font-semibold hover:bg-red-500 transition sm:px-4"
            >
              Wyloguj
            </button>
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

    <nav className="ui-navbar w-full bg-green-900 text-white px-4 py-3 sm:px-6 lg:hidden">
      <div className="ui-navbar-inner">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="text-lg font-bold"
            onClick={() => setMobileMenuOpen(false)}
          >
            SYSTEM ORGANIZACJI ZAWODÓW STRZELECKICH
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
                onClick={() => setMobileMenuOpen(false)}
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
                onClick={() => setMobileMenuOpen(false)}
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

              {isOrganizer && (
                <Link
                  href="/organizer"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-3"
                >
                  Panel Organizatora
                </Link>
              )}

              {isJudge && (
                <Link
                  href="/judge"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-3"
                >
                  Panel Sędziego
                </Link>
              )}

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

                  <button
                    type="button"
                    onClick={logout}
                    className="ui-button w-full bg-red-600 px-3 py-2 rounded-lg font-semibold hover:bg-red-500 transition"
                  >
                    Wyloguj
                  </button>
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
            href="/admin?tab=test-data"
            className="ui-button min-w-0 bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg text-center transition"
          >
            Test danych
          </Link>
        </div>
      </nav>
    )}
    </>
  );
}
