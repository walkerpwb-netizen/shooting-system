"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { apiUrl } from "@/lib/api";
import { authFetch, getStoredRoles, isLoggedIn } from "@/lib/auth";

type ClubMember = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  license_number: string;
  phone_number: string;
  club: string;
  membership_status: string;
};

function memberName(member: ClubMember) {
  return [member.last_name, member.first_name].filter(Boolean).join(" ") || member.email;
}

function membershipLabel(status: string) {
  if (status === "confirmed") {
    return "potwierdzony";
  }

  return "oczekuje";
}

export default function ClubMembersPage() {
  const router = useRouter();
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }

    let ignore = false;

    async function loadMembers() {
      try {
        const response = await authFetch(apiUrl("/me/club-members"), {
          cache: "no-store",
        });
        const data = await response.json().catch(() => ([]));

        if (ignore) {
          return;
        }

        if (!response.ok) {
          setMessage(data.detail || "Nie udało się pobrać listy klubowiczów");
          return;
        }

        setMembers(data);
      } catch (error) {
        console.error(error);
        if (!ignore) {
          setMessage("Błąd połączenia z serwerem");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadMembers();

    return () => {
      ignore = true;
    };
  }, [router]);

  async function confirmMember(memberId: number) {
    try {
      setMessage("");
      const response = await authFetch(apiUrl(`/me/club-members/${memberId}/confirm`), {
        method: "PUT",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się potwierdzić członkostwa");
        return;
      }

      setMembers((currentMembers) => currentMembers.map((member) => (
        member.id === memberId ? data : member
      )));
      setMessage("Członkostwo potwierdzone");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem");
    }
  }

  async function removeMember(member: ClubMember) {
    const confirmed = window.confirm(`Czy usunąć ${memberName(member)} z listy klubowiczów?`);

    if (!confirmed) {
      return;
    }

    try {
      setMessage("");
      const response = await authFetch(apiUrl(`/me/club-members/${member.id}`), {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się usunąć klubowicza");
        return;
      }

      setMembers((currentMembers) => currentMembers.filter((currentMember) => currentMember.id !== member.id));
      setMessage(data.message || "Klubowicz usunięty z listy");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem");
    }
  }

  const canSeePage = getStoredRoles().includes("organizer") || getStoredRoles().includes("admin");

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="w-full">
        <div className="mb-8">
          <h1 className="text-5xl font-bold text-zinc-950 dark:text-white mb-2">
            Lista klubowiczów
          </h1>
        </div>

        {message && (
          <p className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-white">
            {message}
          </p>
        )}

        {loading ? (
          <p className="text-gray-400">Ładowanie listy klubowiczów...</p>
        ) : !canSeePage ? (
          <p className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-gray-300">
            Brak uprawnień do listy klubowiczów.
          </p>
        ) : (
          <section className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900">
            <div className="min-w-[980px]">
              <div className="grid grid-cols-[1.3fr_1.2fr_0.8fr_0.8fr_1fr] gap-4 border-b border-zinc-800 px-5 py-4 text-sm font-bold text-gray-400">
                <p>Klubowicz</p>
                <p>Kontakt</p>
                <p>Licencja</p>
                <p>Status</p>
                <p>Akcje</p>
              </div>

              {members.length === 0 ? (
                <p className="px-5 py-6 text-gray-400">
                  Brak klubowiczów oczekujących na obsługę.
                </p>
              ) : members.map((member) => (
                <div
                  key={member.id}
                  className="grid grid-cols-[1.3fr_1.2fr_0.8fr_0.8fr_1fr] items-center gap-4 border-b border-zinc-800 px-5 py-4 last:border-b-0"
                >
                  <div>
                    <Link
                      href={`/profile/user-${member.id}`}
                      className="font-bold text-white underline-offset-4 transition hover:text-green-300 hover:underline"
                    >
                      {memberName(member)}
                    </Link>
                    <p className="text-sm text-gray-500">ID {member.id}</p>
                  </div>

                  <div className="text-sm">
                    <p className="text-gray-300">{member.email}</p>
                    <p className="text-gray-500">{member.phone_number || "brak telefonu"}</p>
                  </div>

                  <p className="text-gray-300">{member.license_number || "brak"}</p>

                  <p className={member.membership_status === "confirmed" ? "font-bold text-green-400" : "font-bold text-yellow-300"}>
                    {membershipLabel(member.membership_status)}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => confirmMember(member.id)}
                      disabled={member.membership_status === "confirmed"}
                      className="rounded-lg bg-green-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Potwierdź członkostwo
                    </button>

                    <button
                      type="button"
                      onClick={() => removeMember(member)}
                      className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-600"
                    >
                      Usuń
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
