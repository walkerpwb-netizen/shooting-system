"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

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

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("roles");
    localStorage.removeItem("email");

    window.location.href = "/";
  }

  return (
    <>
    <nav className="w-full bg-green-900 text-white px-6 py-4 flex items-center justify-between">

      <div className="flex items-center gap-6">

        <Link href="/">
          Home
        </Link>

        <Link href="/competitions">
          Zawody
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

      <div className="flex items-center gap-4">

        {user ? (
          <>
            <span className="text-sm text-gray-300">
              {user.email}
            </span>

            <button
              onClick={logout}
              className="bg-red-600 px-4 py-2 rounded-lg"
            >
              Wyloguj
            </button>
          </>
        ) : (
          <>
            <Link href="/login">
              Logowanie
            </Link>

            <Link href="/register">
              Rejestracja
            </Link>
          </>
        )}

      </div>

    </nav>

    {isAdmin && (
      <nav className="w-full bg-zinc-950 border-b border-zinc-800 text-white px-6 py-3">
        <div className="flex items-center gap-4 text-sm font-semibold">
          <span className="text-gray-400">
            Admin
          </span>

          <Link
            href="/admin?tab=users"
            className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg transition"
          >
            Użytkownicy
          </Link>

          <Link
            href="/admin?tab=competitions"
            className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg transition"
          >
            Zawody
          </Link>
        </div>
      </nav>
    )}
    </>
  );
}
