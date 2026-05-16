"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { apiUrl } from "@/lib/api";
import { isAdmin } from "@/lib/auth";

type AdminTab = "users" | "competitions";
type UserSortField = "name" | "status" | "role" | "account" | "phone";
type SortDirection = "asc" | "desc";

type AdminUser = {
  id: number;
  email: string;
  role: string;
  roles: string[];
  is_active: boolean;
  first_name: string;
  last_name: string;
  club: string;
  phone_number: string;
  requested_role: string;
  password_reset_required: boolean;
  status: "online" | "offline";
};

type AdminDiscipline = {
  id: number;
  name: string;
  description: string;
  scoring_type: string;
  shots_count: number;
  ammo_type: string;
  ammo_price: string;
  entry_fee: string;
};

type AdminCompetition = {
  id: number;
  name: string;
  date: string;
  location: string;
  entry_fee: string;
  status: string;
  created_by: string;
  organizer: {
    email: string;
    first_name: string;
    last_name: string;
    phone_number: string;
  };
  disciplines: AdminDiscipline[];
};

const roles = [
  "user",
  "organizer",
  "judge",
  "admin",
];

const roleLabels: Record<string, string> = {
  user: "Strzelec",
  organizer: "organizator",
  judge: "sędzia",
  admin: "administrator",
};

const requestedRoleLabels: Record<string, string> = {
  organizer: "organizator",
  judge: "sędzia",
};

type AdminClientProps = {
  initialTab: AdminTab;
};

export default function AdminClient({
  initialTab,
}: AdminClientProps) {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [competitions, setCompetitions] = useState<AdminCompetition[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [userSortField, setUserSortField] = useState<UserSortField>("name");
  const [userSortDirection, setUserSortDirection] = useState<SortDirection>("asc");
  const [expandedCompetitionId, setExpandedCompetitionId] = useState<number | null>(null);
  const [currentAdminEmail, setCurrentAdminEmail] = useState("");

  useEffect(() => {
    if (!isAdmin()) {
      router.push("/");
      return;
    }

    const token = localStorage.getItem("token");
    setCurrentAdminEmail(localStorage.getItem("email") || "");
    let ignore = false;

    if (!token) {
      router.push("/login");
      return;
    }

    async function loadAdminData() {
      try {
        const [usersResponse, competitionsResponse] = await Promise.all([
          fetch(
            apiUrl("/admin/users"),
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          ),
          fetch(
            apiUrl("/admin/competitions"),
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          ),
        ]);

        const usersData = await usersResponse.json();
        const competitionsData = await competitionsResponse.json();

        if (ignore) {
          return;
        }

        if (!usersResponse.ok) {
          setMessage(usersData.detail || "Nie udało się pobrać użytkowników ❌");
          return;
        }

        if (!competitionsResponse.ok) {
          setMessage(competitionsData.detail || "Nie udało się pobrać zawodów ❌");
          return;
        }

        setUsers(usersData);
        setCompetitions(competitionsData);
      } catch (error) {
        console.error(error);

        if (!ignore) {
          setMessage("Błąd połączenia z serwerem ❌");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadAdminData();

    return () => {
      ignore = true;
    };
  }, [router]);

  async function updateUserRoles(
    userId: number,
    roles: string[]
  ) {
    const token = localStorage.getItem("token");

    try {
      setMessage("");

      const response = await fetch(
        apiUrl(`/admin/users/${userId}/role`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            roles,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się zmienić roli ❌");
        return;
      }

      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === userId
            ? data
            : user
        )
      );
      setMessage("Rola użytkownika zaktualizowana ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  function getUserRoles(user: AdminUser) {
    return user.roles?.length
      ? user.roles
      : [user.role];
  }

  function getRoleNames(user: AdminUser) {
    return getUserRoles(user)
      .map((role) => roleLabels[role] || role)
      .join(", ");
  }

  function toggleUserRole(
    user: AdminUser,
    role: string,
    checked: boolean
  ) {
    const currentRoles = getUserRoles(user);
    const nextRoles = checked
      ? Array.from(new Set([...currentRoles, role]))
      : currentRoles.filter((currentRole) => currentRole !== role);

    updateUserRoles(user.id, nextRoles);
  }

  async function deleteCompetition(competitionId: number) {
    const confirmed = window.confirm(
      "Czy na pewno chcesz usunąć te zawody jako administrator?"
    );

    if (!confirmed) {
      return;
    }

    const token = localStorage.getItem("token");

    try {
      setMessage("");

      const response = await fetch(
        apiUrl(`/admin/competitions/${competitionId}`),
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się usunąć zawodów ❌");
        return;
      }

      setCompetitions((currentCompetitions) =>
        currentCompetitions.filter(
          (competition) => competition.id !== competitionId
        )
      );
      setMessage("Zawody usunięte ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  async function approveRoleRequest(userId: number) {
    const token = localStorage.getItem("token");

    try {
      setMessage("");

      const response = await fetch(
        apiUrl(`/admin/users/${userId}/role-request/approve`),
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się zatwierdzić prośby ❌");
        return;
      }

      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === userId
            ? data
            : user
        )
      );
      setMessage("Prośba zatwierdzona ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  async function rejectRoleRequest(userId: number) {
    const token = localStorage.getItem("token");

    try {
      setMessage("");

      const response = await fetch(
        apiUrl(`/admin/users/${userId}/role-request`),
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się odrzucić prośby ❌");
        return;
      }

      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === userId
            ? data
            : user
        )
      );
      setMessage("Prośba odrzucona ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  async function resetUserPassword(user: AdminUser) {
    const confirmed = window.confirm(
      `Czy wygenerować link resetowania hasła dla użytkownika ${getUserName(user)}?`
    );

    if (!confirmed) {
      return;
    }

    const token = localStorage.getItem("token");

    try {
      setMessage("");

      const response = await fetch(
        apiUrl(`/admin/users/${user.id}/password-reset`),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się wygenerować resetu hasła ❌");
        return;
      }

      setUsers((currentUsers) =>
        currentUsers.map((currentUser) =>
          currentUser.id === user.id
            ? data.user
            : currentUser
        )
      );

      const resetLink = `${window.location.origin}${data.reset_path}`;

      if (navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(resetLink);
          setMessage(`Link resetowania hasła skopiowany do schowka: ${resetLink} ✅`);
          return;
        } catch (clipboardError) {
          console.error(clipboardError);
        }
      }

      setMessage(`Link resetowania hasła: ${resetLink}`);
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  async function deleteUser(user: AdminUser) {
    if (user.email === currentAdminEmail) {
      setMessage("Nie możesz usunąć własnego konta administratora ❌");
      return;
    }

    const confirmed = window.confirm(
      `Czy na pewno chcesz usunąć użytkownika ${getUserName(user)}? Ta operacja usunie też jego zapisy do zawodów.`
    );

    if (!confirmed) {
      return;
    }

    const token = localStorage.getItem("token");

    try {
      setMessage("");

      const response = await fetch(
        apiUrl(`/admin/users/${user.id}`),
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się usunąć użytkownika ❌");
        return;
      }

      setUsers((currentUsers) =>
        currentUsers.filter((currentUser) => currentUser.id !== user.id)
      );
      setMessage("Użytkownik usunięty ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  function getUserName(user: AdminUser) {
    return user.last_name || user.first_name
      ? `${user.last_name} ${user.first_name}`.trim()
      : user.email;
  }

  function getSortValue(user: AdminUser, field: UserSortField) {
    if (field === "name") {
      return getUserName(user);
    }

    if (field === "status") {
      return user.status;
    }

    if (field === "role") {
      return getRoleNames(user);
    }

    if (field === "account") {
      return user.is_active
        ? "aktywne"
        : "nieaktywne";
    }

    return user.phone_number || "";
  }

  function sortUsers(field: UserSortField) {
    if (userSortField === field) {
      setUserSortDirection(
        userSortDirection === "asc"
          ? "desc"
          : "asc"
      );
      return;
    }

    setUserSortField(field);
    setUserSortDirection("asc");
  }

  function getSortMark(field: UserSortField) {
    if (userSortField !== field) {
      return "↕";
    }

    return userSortDirection === "asc"
      ? "↑"
      : "↓";
  }

  const filteredUsers = users
    .filter((user) => {
      const searchValue = [
        getUserName(user),
        user.email,
        user.club,
        user.phone_number,
        getRoleNames(user),
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = searchValue.includes(userSearch.toLowerCase());
      const matchesRole = roleFilter === "all" || getUserRoles(user).includes(roleFilter);
      const matchesStatus = statusFilter === "all" || user.status === statusFilter;
      const matchesAccount = accountFilter === "all"
        || (accountFilter === "active" && user.is_active)
        || (accountFilter === "inactive" && !user.is_active);

      return matchesSearch && matchesRole && matchesStatus && matchesAccount;
    })
    .sort((firstUser, secondUser) => {
      const firstValue = getSortValue(firstUser, userSortField);
      const secondValue = getSortValue(secondUser, userSortField);
      const sortResult = firstValue.localeCompare(
        secondValue,
        "pl",
        {
          sensitivity: "base",
        }
      );

      if (firstUser.requested_role && !secondUser.requested_role) {
        return -1;
      }

      if (!firstUser.requested_role && secondUser.requested_role) {
        return 1;
      }

      return userSortDirection === "asc"
        ? sortResult
        : -sortResult;
    });

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-5xl font-bold text-white mb-2">
            Panel Administratora
          </h1>

          <p className="text-gray-400">
            Zarządzaj użytkownikami, rolami i wszystkimi zawodami w systemie.
          </p>
        </div>

        <div className="flex gap-3 mb-8">
          <button
            type="button"
            onClick={() => setActiveTab("users")}
            className={`px-5 py-3 rounded-xl font-bold transition ${
              activeTab === "users"
                ? "bg-green-700 text-white"
                : "bg-zinc-800 text-gray-300 hover:bg-zinc-700"
            }`}
          >
            Użytkownicy
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("competitions")}
            className={`px-5 py-3 rounded-xl font-bold transition ${
              activeTab === "competitions"
                ? "bg-green-700 text-white"
                : "bg-zinc-800 text-gray-300 hover:bg-zinc-700"
            }`}
          >
            Zawody
          </button>
        </div>

        {message && (
          <p className="bg-zinc-900 border border-zinc-800 text-white rounded-xl p-4 mb-6">
            {message}
          </p>
        )}

        {loading ? (
          <p className="text-gray-400">
            Ładowanie panelu administratora...
          </p>
        ) : activeTab === "users" ? (
          <section className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="grid lg:grid-cols-[2fr_1fr_1fr_1fr] gap-3">
                <input
                  type="search"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="Filtruj po nazwisku, imieniu, emailu, klubie lub telefonie"
                  className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500"
                />

                <select
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
                >
                  <option value="all">
                    Wszystkie role
                  </option>

                  {roles.map((role) => (
                    <option
                      key={role}
                      value={role}
                    >
                      {roleLabels[role]}
                    </option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
                >
                  <option value="all">
                    Każdy status
                  </option>
                  <option value="online">
                    Online
                  </option>
                  <option value="offline">
                    Offline
                  </option>
                </select>

                <select
                  value={accountFilter}
                  onChange={(event) => setAccountFilter(event.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
                >
                  <option value="all">
                    Wszystkie konta
                  </option>
                  <option value="active">
                    Aktywne
                  </option>
                  <option value="inactive">
                    Nieaktywne
                  </option>
                </select>
              </div>

              <p className="text-gray-400 text-sm mt-3">
                Widoczne: {filteredUsers.length} z {users.length}
              </p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-[1.4fr_0.8fr_1fr_0.8fr_0.9fr_1.2fr_1.2fr] gap-4 px-5 py-4 text-sm font-bold text-gray-400 border-b border-zinc-800">
                <button
                  type="button"
                  onClick={() => sortUsers("name")}
                  className="text-left hover:text-white transition"
                >
                  Użytkownik {getSortMark("name")}
                </button>

                <button
                  type="button"
                  onClick={() => sortUsers("status")}
                  className="text-left hover:text-white transition"
                >
                  Status {getSortMark("status")}
                </button>

                <button
                  type="button"
                  onClick={() => sortUsers("role")}
                  className="text-left hover:text-white transition"
                >
                  Rola {getSortMark("role")}
                </button>

                <button
                  type="button"
                  onClick={() => sortUsers("account")}
                  className="text-left hover:text-white transition"
                >
                  Konto {getSortMark("account")}
                </button>

                <button
                  type="button"
                  onClick={() => sortUsers("phone")}
                  className="text-left hover:text-white transition"
                >
                  Telefon {getSortMark("phone")}
                </button>

                <p>Prośba</p>

                <p>Akcje</p>
              </div>

            {filteredUsers.length === 0 ? (
              <p className="px-5 py-6 text-gray-400">
                Brak użytkowników pasujących do wybranych filtrów.
              </p>
            ) : filteredUsers.map((user) => (
              <div
                key={user.id}
                className={`grid grid-cols-[1.4fr_0.8fr_1fr_0.8fr_0.9fr_1.2fr_1.2fr] gap-4 px-5 py-4 items-center border-b border-zinc-800 last:border-b-0 ${
                  user.requested_role
                    ? "bg-yellow-950/20"
                    : ""
                }`}
              >
                <div>
                  <p className="text-white font-bold">
                    {getUserName(user)}
                  </p>

                  <p className="text-gray-400 text-sm">
                    {user.email}
                  </p>

                  {user.club && (
                    <p className="text-gray-500 text-sm">
                      {user.club}
                    </p>
                  )}
                </div>

                <p className={`font-bold ${
                  user.status === "online"
                    ? "text-green-400"
                    : "text-gray-500"
                }`}>
                  {user.status === "online"
                    ? "online"
                    : "offline"}
                </p>

                <div className="space-y-2">
                  {roles.map((role) => {
                    const userRoles = getUserRoles(user);
                    const checked = userRoles.includes(role);
                    const isOnlyRole = checked && userRoles.length === 1;

                    return (
                      <label
                        key={role}
                        className="flex items-center gap-2 text-sm text-gray-200"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isOnlyRole}
                          onChange={(event) => toggleUserRole(
                            user,
                            role,
                            event.target.checked
                          )}
                          className="accent-green-700"
                        />

                        <span>
                          {roleLabels[role]}
                        </span>
                      </label>
                    );
                  })}
                </div>

                <p className={user.is_active ? "text-green-400" : "text-red-400"}>
                  {user.password_reset_required
                    ? "reset hasła"
                    : user.is_active
                      ? "aktywne"
                      : "nieaktywne"}
                </p>

                <p className="text-gray-300">
                  {user.phone_number || "brak"}
                </p>

                {user.requested_role ? (
                  <div>
                    <p className="text-yellow-200 text-sm font-bold mb-2">
                      Prośba: {requestedRoleLabels[user.requested_role] || user.requested_role}
                    </p>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => approveRoleRequest(user.id)}
                        className="bg-green-700 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition"
                      >
                        Zatwierdź
                      </button>

                      <button
                        type="button"
                        onClick={() => rejectRoleRequest(user.id)}
                        className="bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition"
                      >
                        Odrzuć
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500">
                    brak
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => resetUserPassword(user)}
                    className="bg-blue-700 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition"
                  >
                    Reset hasła
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteUser(user)}
                    disabled={user.email === currentAdminEmail}
                    className="bg-red-700 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Usuń
                  </button>
                </div>
              </div>
            ))}
            </div>
          </section>
        ) : (
          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-x-auto">
            <div className="min-w-[1200px]">
              <div className="grid grid-cols-[1.5fr_1fr_1.2fr_0.8fr_1.3fr_1.4fr_0.8fr_0.8fr_1.2fr] gap-4 px-5 py-4 text-sm font-bold text-gray-400 border-b border-zinc-800">
                <p>Nazwa zawodów</p>
                <p>Data</p>
                <p>Lokalizacja</p>
                <p>Status</p>
                <p>Organizator</p>
                <p>Kontakt</p>
                <p>Dyscypliny</p>
                <p>Opłata</p>
                <p>Akcje</p>
              </div>

              {competitions.length === 0 ? (
                <p className="px-5 py-6 text-gray-400">
                  Brak zawodów w systemie.
                </p>
              ) : competitions.map((competition) => {
                const organizerName = [
                  competition.organizer.last_name,
                  competition.organizer.first_name,
                ]
                  .filter(Boolean)
                  .join(" ");
                const expanded = expandedCompetitionId === competition.id;

                return (
                  <div
                    key={competition.id}
                    className="border-b border-zinc-800 last:border-b-0"
                  >
                    <div className="grid grid-cols-[1.5fr_1fr_1.2fr_0.8fr_1.3fr_1.4fr_0.8fr_0.8fr_1.2fr] gap-4 px-5 py-4 items-center">
                      <p className="text-white font-bold">
                        {competition.name}
                      </p>

                      <p className="text-gray-300">
                        {competition.date}
                      </p>

                      <p className="text-gray-300">
                        {competition.location}
                      </p>

                      <span className="w-fit bg-yellow-100 text-yellow-900 px-3 py-1 rounded-full text-xs font-bold">
                        {competition.status}
                      </span>

                      <div>
                        <p className="text-white font-semibold">
                          {organizerName || competition.created_by}
                        </p>

                        <p className="text-gray-500 text-sm">
                          {competition.created_by}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <a
                          href={`mailto:${competition.organizer.email}`}
                          className="bg-blue-700 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition"
                        >
                          Email
                        </a>

                        {competition.organizer.phone_number ? (
                          <a
                            href={`tel:${competition.organizer.phone_number}`}
                            className="bg-green-700 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition"
                          >
                            Telefon
                          </a>
                        ) : (
                          <span className="text-gray-500 text-sm py-2">
                            Brak telefonu
                          </span>
                        )}
                      </div>

                      <p className="text-gray-300">
                        {competition.disciplines.length}
                      </p>

                      <p className="text-gray-300">
                        {competition.entry_fee
                          ? `${competition.entry_fee} zł`
                          : "wg konkurencji"}
                      </p>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedCompetitionId(
                              expanded
                                ? null
                                : competition.id
                            )
                          }
                          className="bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition"
                        >
                          {expanded
                            ? "Ukryj"
                            : "Szczegóły"}
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteCompetition(competition.id)}
                          className="bg-red-700 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition"
                        >
                          Usuń
                        </button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="bg-zinc-950 border-t border-zinc-800 px-5 py-4">
                        <p className="text-white font-bold mb-3">
                          Konkurencje
                        </p>

                        <div className="grid grid-cols-[1.4fr_2fr_1fr_0.8fr_1.2fr_1fr] gap-4 text-sm font-bold text-gray-500 border-b border-zinc-800 pb-2 mb-2">
                          <p>Nazwa</p>
                          <p>Opis</p>
                          <p>Punktacja</p>
                          <p>Strzały</p>
                          <p>Amunicja</p>
                          <p>Opłata</p>
                        </div>

                        {competition.disciplines.map((discipline) => (
                          <div
                            key={discipline.id}
                            className="grid grid-cols-[1.4fr_2fr_1fr_0.8fr_1.2fr_1fr] gap-4 py-3 border-b border-zinc-900 last:border-b-0 text-sm"
                          >
                            <p className="text-white font-semibold">
                              {discipline.name}
                            </p>

                            <p className="text-gray-400">
                              {discipline.description || "Bez opisu"}
                            </p>

                            <p className="text-gray-300">
                              {discipline.scoring_type}
                            </p>

                            <p className="text-gray-300">
                              {discipline.shots_count}
                            </p>

                            <p className="text-gray-300">
                              {discipline.ammo_type || "brak"} / {discipline.ammo_price || "0"} zł
                            </p>

                            <p className="text-gray-300">
                              {discipline.entry_fee
                                ? `${discipline.entry_fee} zł`
                                : "-"}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
