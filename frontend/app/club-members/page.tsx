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

type ClubInviteProfile = {
  id: number;
  email: string;
  account_type: string;
  pzss_club_short_name: string;
  pzss_club_full_name: string;
  pzss_club_status: string;
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
  const [clubProfile, setClubProfile] = useState<ClubInviteProfile | null>(null);
  const [siteOrigin] = useState(() => (
    typeof window === "undefined" ? "" : window.location.origin
  ));
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
        const [profileResponse, membersResponse] = await Promise.all([
          authFetch(apiUrl("/me"), {
            cache: "no-store",
          }),
          authFetch(apiUrl("/me/club-members"), {
            cache: "no-store",
          }),
        ]);
        const profileData = await profileResponse.json().catch(() => ({}));
        const membersData = await membersResponse.json().catch(() => ([]));

        if (ignore) {
          return;
        }

        if (profileResponse.ok) {
          setClubProfile(profileData);
        }

        if (!membersResponse.ok) {
          setMessage(membersData.detail || "Nie udało się pobrać listy klubowiczów");
          return;
        }

        setMembers(membersData);
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

  async function copyInviteLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setMessage("Link zaproszeniowy skopiowany do schowka");
    } catch (error) {
      console.error(error);
      setMessage("Nie udało się skopiować linku. Zaznacz go i skopiuj ręcznie.");
    }
  }

  const canSeePage = getStoredRoles().includes("organizer") || getStoredRoles().includes("admin");
  const canInviteMembers = Boolean(
    clubProfile
    && clubProfile.account_type === "pzss_club"
    && clubProfile.pzss_club_status === "approved"
  );
  const clubName = clubProfile
    ? clubProfile.pzss_club_short_name || clubProfile.pzss_club_full_name || clubProfile.email
    : "";
  const invitePath = clubProfile
    ? `/register?club_invite=${clubProfile.id}&next=${encodeURIComponent(`/profile?club_invite=${clubProfile.id}`)}`
    : "";
  const inviteLink = siteOrigin && invitePath ? `${siteOrigin}${invitePath}` : invitePath;

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
          <div className="space-y-6">
            {canInviteMembers && (
              <section className="rounded-2xl border border-green-500/50 bg-green-950/40 p-5 text-white shadow-[0_18px_60px_rgba(22,163,74,0.16)] sm:p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="max-w-3xl">
                    <p className="mb-2 text-sm font-black uppercase tracking-[0.2em] text-green-300">
                      Zaproś klubowiczów
                    </p>
                    <h2 className="text-2xl font-black sm:text-3xl">
                      Wyślij link swoim zawodnikom
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-green-50/85 sm:text-base">
                      Osoba, która założy konto z tego linku, po aktywacji e-maila trafi do profilu z automatycznie wybranym klubem {clubName}. Po zapisaniu profilu pojawi się na tej liście ze statusem „oczekuje”.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => copyInviteLink(inviteLink)}
                      className="rounded-xl bg-green-600 px-5 py-3 font-bold text-white transition hover:bg-green-500"
                    >
                      Kopiuj link
                    </button>
                    <a
                      href={`mailto:?subject=${encodeURIComponent(`Zaproszenie do klubu ${clubName}`)}&body=${encodeURIComponent(`Załóż konto w Systemie Strzeleckim i dołącz do klubu ${clubName}:\n\n${inviteLink}`)}`}
                      className="rounded-xl border border-green-400/50 px-5 py-3 font-bold text-green-50 transition hover:bg-green-500/15"
                    >
                      Wyślij e-mail
                    </a>
                  </div>
                </div>

                <div className="mt-5">
                  <input
                    value={inviteLink}
                    readOnly
                    onFocus={(event) => event.currentTarget.select()}
                    className="w-full rounded-xl border border-green-500/50 bg-black/35 px-4 py-3 font-mono text-sm text-green-50 outline-none"
                    aria-label="Link zaproszeniowy dla klubowiczów"
                  />
                </div>
              </section>
            )}

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
          </div>
        )}
      </div>
    </main>
  );
}
