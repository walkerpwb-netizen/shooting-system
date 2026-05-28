"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { apiUrl } from "@/lib/api";
import { isAdmin } from "@/lib/auth";

type AdminTab = "users" | "competitions" | "settings" | "test-data";
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

type ResultsTableSettings = {
  grid_template_columns: string;
  min_width: string;
  row_padding_y: string;
};

type UiSettings = {
  block_padding: string;
  block_min_height: string;
  block_radius: string;
  button_padding_x: string;
  button_padding_y: string;
  button_min_height: string;
  button_radius: string;
  navbar_padding_x: string;
  navbar_padding_y: string;
  navbar_content_max_width: string;
};

type ProfileSettings = {
  label_color: string;
  value_color: string;
  label_font_size: string;
  value_font_size: string;
  row_gap: string;
  achievement_icon_size: string;
  achievement_gap: string;
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

const competitionStatusLabels: Record<string, string> = {
  draft: "szkic",
  published: "opublikowane",
  started: "rozpoczęte / live",
  completed: "zakończone / historyczne",
};

const defaultResultsTableSettings: ResultsTableSettings = {
  grid_template_columns: "80px 1.6fr 1fr 1.1fr 120px",
  min_width: "820px",
  row_padding_y: "0.75rem",
};

const defaultUiSettings: UiSettings = {
  block_padding: "1.5rem",
  block_min_height: "0px",
  block_radius: "1.5rem",
  button_padding_x: "1.25rem",
  button_padding_y: "0.75rem",
  button_min_height: "0px",
  button_radius: "0.75rem",
  navbar_padding_x: "1.5rem",
  navbar_padding_y: "0.75rem",
  navbar_content_max_width: "100%",
};

const defaultProfileSettings: ProfileSettings = {
  label_color: "#f87171",
  value_color: "#f9fafb",
  label_font_size: "1.125rem",
  value_font_size: "1.25rem",
  row_gap: "2rem",
  achievement_icon_size: "4rem",
  achievement_gap: "1.25rem",
};

const uiCssVariableNames: Record<keyof UiSettings, string> = {
  block_padding: "--ss-block-padding",
  block_min_height: "--ss-block-min-height",
  block_radius: "--ss-block-radius",
  button_padding_x: "--ss-button-padding-x",
  button_padding_y: "--ss-button-padding-y",
  button_min_height: "--ss-button-min-height",
  button_radius: "--ss-button-radius",
  navbar_padding_x: "--ss-navbar-padding-x",
  navbar_padding_y: "--ss-navbar-padding-y",
  navbar_content_max_width: "--ss-navbar-content-max-width",
};

const profileCssVariableNames: Record<keyof ProfileSettings, string> = {
  label_color: "--ss-profile-label-color",
  value_color: "--ss-profile-value-color",
  label_font_size: "--ss-profile-label-font-size",
  value_font_size: "--ss-profile-value-font-size",
  row_gap: "--ss-profile-row-gap",
  achievement_icon_size: "--ss-profile-achievement-icon-size",
  achievement_gap: "--ss-profile-achievement-gap",
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
  const [currentAdminEmail] = useState(() =>
    typeof window === "undefined"
      ? ""
      : localStorage.getItem("email") || ""
  );
  const [resultsTableSettings, setResultsTableSettings] = useState<ResultsTableSettings>(defaultResultsTableSettings);
  const [uiSettings, setUiSettings] = useState<UiSettings>(defaultUiSettings);
  const [profileSettings, setProfileSettings] = useState<ProfileSettings>(defaultProfileSettings);
  const [testCompetitionStatus, setTestCompetitionStatus] = useState("started");
  const [testCompetitionParticipants, setTestCompetitionParticipants] = useState(12);
  const [testCompetitionDisciplines, setTestCompetitionDisciplines] = useState(3);
  const [testCompetitionResults, setTestCompetitionResults] = useState(true);
  const [testTargetCompetitionId, setTestTargetCompetitionId] = useState("");
  const [testParticipantCount, setTestParticipantCount] = useState(10);
  const [testParticipantsCheckedIn, setTestParticipantsCheckedIn] = useState(true);
  const [testParticipantsPaid, setTestParticipantsPaid] = useState(true);
  const [testParticipantResults, setTestParticipantResults] = useState(false);
  const [testOverwriteResults, setTestOverwriteResults] = useState(true);
  const [testWorking, setTestWorking] = useState(false);

  useEffect(() => {
    if (!isAdmin()) {
      router.push("/");
      return;
    }

    const token = localStorage.getItem("token");
    let ignore = false;

    if (!token) {
      router.push("/login");
      return;
    }

    async function loadAdminData() {
      try {
        const [usersResponse, competitionsResponse, tableSettingsResponse, uiSettingsResponse, profileSettingsResponse] = await Promise.all([
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
          fetch(
            apiUrl("/admin/settings/results-table"),
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          ),
          fetch(
            apiUrl("/admin/settings/ui"),
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          ),
          fetch(
            apiUrl("/admin/settings/profile"),
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          ),
        ]);

        const usersData = await usersResponse.json();
        const competitionsData = await competitionsResponse.json();
        const tableSettingsData = await tableSettingsResponse.json();
        const uiSettingsData = await uiSettingsResponse.json();
        const profileSettingsData = await profileSettingsResponse.json();

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

        if (!tableSettingsResponse.ok) {
          setMessage(tableSettingsData.detail || "Nie udało się pobrać ustawień tabeli ❌");
          return;
        }

        if (!uiSettingsResponse.ok) {
          setMessage(uiSettingsData.detail || "Nie udało się pobrać ustawień UI ❌");
          return;
        }

        if (!profileSettingsResponse.ok) {
          setMessage(profileSettingsData.detail || "Nie udało się pobrać ustawień profilu ❌");
          return;
        }

        setUsers(usersData);
        setCompetitions(competitionsData);
        setResultsTableSettings({
          grid_template_columns: tableSettingsData.grid_template_columns || defaultResultsTableSettings.grid_template_columns,
          min_width: tableSettingsData.min_width || defaultResultsTableSettings.min_width,
          row_padding_y: tableSettingsData.row_padding_y || defaultResultsTableSettings.row_padding_y,
        });
        setUiSettings({
          block_padding: uiSettingsData.block_padding || defaultUiSettings.block_padding,
          block_min_height: uiSettingsData.block_min_height || defaultUiSettings.block_min_height,
          block_radius: uiSettingsData.block_radius || defaultUiSettings.block_radius,
          button_padding_x: uiSettingsData.button_padding_x || defaultUiSettings.button_padding_x,
          button_padding_y: uiSettingsData.button_padding_y || defaultUiSettings.button_padding_y,
          button_min_height: uiSettingsData.button_min_height || defaultUiSettings.button_min_height,
          button_radius: uiSettingsData.button_radius || defaultUiSettings.button_radius,
          navbar_padding_x: uiSettingsData.navbar_padding_x || defaultUiSettings.navbar_padding_x,
          navbar_padding_y: uiSettingsData.navbar_padding_y || defaultUiSettings.navbar_padding_y,
          navbar_content_max_width: uiSettingsData.navbar_content_max_width || defaultUiSettings.navbar_content_max_width,
        });
        setProfileSettings({
          label_color: profileSettingsData.label_color || defaultProfileSettings.label_color,
          value_color: profileSettingsData.value_color || defaultProfileSettings.value_color,
          label_font_size: profileSettingsData.label_font_size || defaultProfileSettings.label_font_size,
          value_font_size: profileSettingsData.value_font_size || defaultProfileSettings.value_font_size,
          row_gap: profileSettingsData.row_gap || defaultProfileSettings.row_gap,
          achievement_icon_size: profileSettingsData.achievement_icon_size || defaultProfileSettings.achievement_icon_size,
          achievement_gap: profileSettingsData.achievement_gap || defaultProfileSettings.achievement_gap,
        });
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

  function applyUiSettings(settings: UiSettings) {
    Object.entries(uiCssVariableNames).forEach(([key, variableName]) => {
      document.documentElement.style.setProperty(
        variableName,
        settings[key as keyof UiSettings]
      );
    });
  }

  function applyProfileSettings(settings: ProfileSettings) {
    Object.entries(profileCssVariableNames).forEach(([key, variableName]) => {
      document.documentElement.style.setProperty(
        variableName,
        settings[key as keyof ProfileSettings]
      );
    });
  }

  async function reloadCompetitions(token: string | null) {
    const response = await fetch(
      apiUrl("/admin/competitions"),
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Nie udało się odświeżyć zawodów");
    }

    setCompetitions(data);
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

  async function saveResultsTableSettings() {
    const token = localStorage.getItem("token");

    try {
      setMessage("");

      const response = await fetch(
        apiUrl("/admin/settings/results-table"),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(resultsTableSettings),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się zapisać ustawień ❌");
        return;
      }

      setResultsTableSettings({
        grid_template_columns: data.grid_template_columns || defaultResultsTableSettings.grid_template_columns,
        min_width: data.min_width || defaultResultsTableSettings.min_width,
        row_padding_y: data.row_padding_y || defaultResultsTableSettings.row_padding_y,
      });
      setMessage("Ustawienia tabeli wyników zapisane ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  async function saveUiSettings() {
    const token = localStorage.getItem("token");

    try {
      setMessage("");

      const response = await fetch(
        apiUrl("/admin/settings/ui"),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(uiSettings),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się zapisać ustawień UI ❌");
        return;
      }

      const nextUiSettings = {
        block_padding: data.block_padding || defaultUiSettings.block_padding,
        block_min_height: data.block_min_height || defaultUiSettings.block_min_height,
        block_radius: data.block_radius || defaultUiSettings.block_radius,
        button_padding_x: data.button_padding_x || defaultUiSettings.button_padding_x,
        button_padding_y: data.button_padding_y || defaultUiSettings.button_padding_y,
        button_min_height: data.button_min_height || defaultUiSettings.button_min_height,
        button_radius: data.button_radius || defaultUiSettings.button_radius,
        navbar_padding_x: data.navbar_padding_x || defaultUiSettings.navbar_padding_x,
        navbar_padding_y: data.navbar_padding_y || defaultUiSettings.navbar_padding_y,
        navbar_content_max_width: data.navbar_content_max_width || defaultUiSettings.navbar_content_max_width,
      };

      setUiSettings(nextUiSettings);
      applyUiSettings(nextUiSettings);
      setMessage("Ustawienia UI zapisane ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  async function saveProfileSettings() {
    const token = localStorage.getItem("token");

    try {
      setMessage("");

      const response = await fetch(
        apiUrl("/admin/settings/profile"),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(profileSettings),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się zapisać ustawień profilu ❌");
        return;
      }

      const nextProfileSettings = {
        label_color: data.label_color || defaultProfileSettings.label_color,
        value_color: data.value_color || defaultProfileSettings.value_color,
        label_font_size: data.label_font_size || defaultProfileSettings.label_font_size,
        value_font_size: data.value_font_size || defaultProfileSettings.value_font_size,
        row_gap: data.row_gap || defaultProfileSettings.row_gap,
        achievement_icon_size: data.achievement_icon_size || defaultProfileSettings.achievement_icon_size,
        achievement_gap: data.achievement_gap || defaultProfileSettings.achievement_gap,
      };

      setProfileSettings(nextProfileSettings);
      applyProfileSettings(nextProfileSettings);
      setMessage("Ustawienia profilu zapisane ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  async function resetUserPassword(user: AdminUser) {
    const confirmed = window.confirm(
      `Czy wysłać link resetowania hasła do użytkownika ${getUserName(user)}?`
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

      setMessage(data.message + " ✅");
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

  async function generateTestCompetition() {
    const token = localStorage.getItem("token");

    try {
      setTestWorking(true);
      setMessage("");

      const response = await fetch(
        apiUrl("/admin/test-data/competition"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            status: testCompetitionStatus,
            participants_count: testCompetitionParticipants,
            disciplines_count: testCompetitionDisciplines,
            include_results: testCompetitionResults,
          }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się wygenerować zawodów testowych ❌");
        return;
      }

      setTestTargetCompetitionId(String(data.competition_id));
      await reloadCompetitions(token);
      setMessage(`Wygenerowano zawody #${data.competition_id}, dyscypliny: ${data.disciplines_count}, zawodnicy: ${data.participants_count}, wyniki: ${data.results_count} ✅`);
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setTestWorking(false);
    }
  }

  async function generateTestParticipants() {
    if (!testTargetCompetitionId) {
      setMessage("Wybierz zawody do uzupełnienia ❌");
      return;
    }

    const token = localStorage.getItem("token");

    try {
      setTestWorking(true);
      setMessage("");

      const response = await fetch(
        apiUrl("/admin/test-data/participants"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            competition_id: Number(testTargetCompetitionId),
            count: testParticipantCount,
            checked_in: testParticipantsCheckedIn,
            paid: testParticipantsPaid,
            include_results: testParticipantResults,
          }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się wygenerować zawodników ❌");
        return;
      }

      await reloadCompetitions(token);
      setMessage(`Dodano zawodników: ${data.participants_count}, wyniki: ${data.results_count} ✅`);
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setTestWorking(false);
    }
  }

  async function generateTestResults() {
    if (!testTargetCompetitionId) {
      setMessage("Wybierz zawody do wygenerowania wyników ❌");
      return;
    }

    const token = localStorage.getItem("token");

    try {
      setTestWorking(true);
      setMessage("");

      const response = await fetch(
        apiUrl("/admin/test-data/results"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            competition_id: Number(testTargetCompetitionId),
            overwrite: testOverwriteResults,
          }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się wygenerować wyników ❌");
        return;
      }

      setMessage(`Wygenerowano lub zaktualizowano wyników: ${data.results_count} ✅`);
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setTestWorking(false);
    }
  }

  async function resetTestResults() {
    if (!testTargetCompetitionId) {
      setMessage("Wybierz zawody do wyczyszczenia wyników ❌");
      return;
    }

    const confirmed = window.confirm(
      "Czy na pewno wyczyścić wyniki w wybranych zawodach?"
    );

    if (!confirmed) {
      return;
    }

    const token = localStorage.getItem("token");

    try {
      setTestWorking(true);
      setMessage("");

      const response = await fetch(
        apiUrl(`/admin/test-data/competitions/${testTargetCompetitionId}/results`),
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się wyczyścić wyników ❌");
        return;
      }

      setMessage(`Wyczyszczono wyników: ${data.results_count} ✅`);
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setTestWorking(false);
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

        <div className="mb-8 flex flex-wrap gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setActiveTab("users")}
            className={`ui-button min-w-0 px-5 py-3 rounded-xl font-bold transition ${
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
            className={`ui-button min-w-0 px-5 py-3 rounded-xl font-bold transition ${
              activeTab === "competitions"
                ? "bg-green-700 text-white"
                : "bg-zinc-800 text-gray-300 hover:bg-zinc-700"
            }`}
          >
            Zawody
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className={`ui-button min-w-0 px-5 py-3 rounded-xl font-bold transition ${
              activeTab === "settings"
                ? "bg-green-700 text-white"
                : "bg-zinc-800 text-gray-300 hover:bg-zinc-700"
            }`}
          >
            Settings
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("test-data")}
            className={`ui-button min-w-0 px-5 py-3 rounded-xl font-bold transition ${
              activeTab === "test-data"
                ? "bg-green-700 text-white"
                : "bg-zinc-800 text-gray-300 hover:bg-zinc-700"
            }`}
          >
            Test danych
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
        ) : activeTab === "competitions" ? (
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
        ) : activeTab === "settings" ? (
          <section className="ui-block bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="mb-6">
              <h2 className="text-3xl font-bold text-white mb-2">
                Settings
              </h2>

              <p className="text-gray-400">
                Globalne ustawienia wyglądu systemu.
              </p>
            </div>

            <div className="space-y-8">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-5">
                <h3 className="text-2xl font-bold text-white mb-4">
                  Bloki
                </h3>

                <div className="grid md:grid-cols-3 gap-4">
                  <label className="block">
                    <span className="block text-white font-semibold mb-2">
                      Wewnętrzny odstęp bloku
                    </span>

                    <input
                      value={uiSettings.block_padding}
                      onChange={(event) => setUiSettings((currentSettings) => ({
                        ...currentSettings,
                        block_padding: event.target.value,
                      }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500"
                      placeholder="1.5rem"
                    />
                  </label>

                  <label className="block">
                    <span className="block text-white font-semibold mb-2">
                      Minimalna wysokość bloku
                    </span>

                    <input
                      value={uiSettings.block_min_height}
                      onChange={(event) => setUiSettings((currentSettings) => ({
                        ...currentSettings,
                        block_min_height: event.target.value,
                      }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500"
                      placeholder="0px"
                    />
                  </label>

                  <label className="block">
                    <span className="block text-white font-semibold mb-2">
                      Zaokrąglenie bloków
                    </span>

                    <input
                      value={uiSettings.block_radius}
                      onChange={(event) => setUiSettings((currentSettings) => ({
                        ...currentSettings,
                        block_radius: event.target.value,
                      }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500"
                      placeholder="1.5rem"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-5">
                <h3 className="text-2xl font-bold text-white mb-4">
                  Przyciski
                </h3>

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <label className="block">
                    <span className="block text-white font-semibold mb-2">
                      Szerokość przycisków
                    </span>

                    <input
                      value={uiSettings.button_padding_x}
                      onChange={(event) => setUiSettings((currentSettings) => ({
                        ...currentSettings,
                        button_padding_x: event.target.value,
                      }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500"
                      placeholder="1.25rem"
                    />
                  </label>

                  <label className="block">
                    <span className="block text-white font-semibold mb-2">
                      Wysokość przycisków
                    </span>

                    <input
                      value={uiSettings.button_padding_y}
                      onChange={(event) => setUiSettings((currentSettings) => ({
                        ...currentSettings,
                        button_padding_y: event.target.value,
                      }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500"
                      placeholder="0.75rem"
                    />
                  </label>

                  <label className="block">
                    <span className="block text-white font-semibold mb-2">
                      Minimalna wysokość
                    </span>

                    <input
                      value={uiSettings.button_min_height}
                      onChange={(event) => setUiSettings((currentSettings) => ({
                        ...currentSettings,
                        button_min_height: event.target.value,
                      }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500"
                      placeholder="0px"
                    />
                  </label>

                  <label className="block">
                    <span className="block text-white font-semibold mb-2">
                      Zaokrąglenie
                    </span>

                    <input
                      value={uiSettings.button_radius}
                      onChange={(event) => setUiSettings((currentSettings) => ({
                        ...currentSettings,
                        button_radius: event.target.value,
                      }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500"
                      placeholder="0.75rem"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-5">
                <h3 className="text-2xl font-bold text-white mb-4">
                  Navbar
                </h3>

                <div className="grid md:grid-cols-3 gap-4">
                  <label className="block">
                    <span className="block text-white font-semibold mb-2">
                      Szerokość odstępów
                    </span>

                    <input
                      value={uiSettings.navbar_padding_x}
                      onChange={(event) => setUiSettings((currentSettings) => ({
                        ...currentSettings,
                        navbar_padding_x: event.target.value,
                      }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500"
                      placeholder="1.5rem"
                    />
                  </label>

                  <label className="block">
                    <span className="block text-white font-semibold mb-2">
                      Wysokość navbaru
                    </span>

                    <input
                      value={uiSettings.navbar_padding_y}
                      onChange={(event) => setUiSettings((currentSettings) => ({
                        ...currentSettings,
                        navbar_padding_y: event.target.value,
                      }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500"
                      placeholder="0.75rem"
                    />
                  </label>

                  <label className="block">
                    <span className="block text-white font-semibold mb-2">
                      Maksymalna szerokość treści
                    </span>

                    <input
                      value={uiSettings.navbar_content_max_width}
                      onChange={(event) => setUiSettings((currentSettings) => ({
                        ...currentSettings,
                        navbar_content_max_width: event.target.value,
                      }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500"
                      placeholder="100%"
                    />
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={saveUiSettings}
                className="ui-button bg-green-700 hover:bg-green-600 text-white px-5 py-3 rounded-xl font-bold transition"
              >
                Zapisz ustawienia UI
              </button>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-5 space-y-5">
                <div>
                  <h3 className="text-2xl font-bold text-white">
                    Profil
                  </h3>

                  <p className="mt-1 text-sm text-gray-500">
                    Ustawienia wyglądu danych zawodnika oraz odznaczeń na stronie profilu.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <label className="block">
                    <span className="block text-white font-semibold mb-2">
                      Kolor etykiet
                    </span>

                    <input
                      type="color"
                      value={profileSettings.label_color}
                      onChange={(event) => setProfileSettings((currentSettings) => ({
                        ...currentSettings,
                        label_color: event.target.value,
                      }))}
                      className="h-12 w-full bg-zinc-800 border border-zinc-700 rounded-xl px-2 py-2"
                    />
                  </label>

                  <label className="block">
                    <span className="block text-white font-semibold mb-2">
                      Kolor wartości
                    </span>

                    <input
                      type="color"
                      value={profileSettings.value_color}
                      onChange={(event) => setProfileSettings((currentSettings) => ({
                        ...currentSettings,
                        value_color: event.target.value,
                      }))}
                      className="h-12 w-full bg-zinc-800 border border-zinc-700 rounded-xl px-2 py-2"
                    />
                  </label>

                  <label className="block">
                    <span className="block text-white font-semibold mb-2">
                      Wielkość etykiet
                    </span>

                    <input
                      value={profileSettings.label_font_size}
                      onChange={(event) => setProfileSettings((currentSettings) => ({
                        ...currentSettings,
                        label_font_size: event.target.value,
                      }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500"
                      placeholder="1.125rem"
                    />
                  </label>

                  <label className="block">
                    <span className="block text-white font-semibold mb-2">
                      Wielkość wartości
                    </span>

                    <input
                      value={profileSettings.value_font_size}
                      onChange={(event) => setProfileSettings((currentSettings) => ({
                        ...currentSettings,
                        value_font_size: event.target.value,
                      }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500"
                      placeholder="1.25rem"
                    />
                  </label>

                  <label className="block">
                    <span className="block text-white font-semibold mb-2">
                      Odstęp między wierszami
                    </span>

                    <input
                      value={profileSettings.row_gap}
                      onChange={(event) => setProfileSettings((currentSettings) => ({
                        ...currentSettings,
                        row_gap: event.target.value,
                      }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500"
                      placeholder="2rem"
                    />
                  </label>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="block text-white font-semibold mb-2">
                      Rozmiar ikon odznaczeń
                    </span>

                    <input
                      value={profileSettings.achievement_icon_size}
                      onChange={(event) => setProfileSettings((currentSettings) => ({
                        ...currentSettings,
                        achievement_icon_size: event.target.value,
                      }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500"
                      placeholder="4rem"
                    />

                    <p className="mt-2 text-sm text-gray-500">
                      Steruje rozmiarem pistoletu, karabinu, strzelby i pucharu w profilu.
                    </p>
                  </label>

                  <label className="block">
                    <span className="block text-white font-semibold mb-2">
                      Odstęp między odznaczeniami
                    </span>

                    <input
                      value={profileSettings.achievement_gap}
                      onChange={(event) => setProfileSettings((currentSettings) => ({
                        ...currentSettings,
                        achievement_gap: event.target.value,
                      }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500"
                      placeholder="1.25rem"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={saveProfileSettings}
                  className="ui-button bg-green-700 hover:bg-green-600 text-white px-5 py-3 rounded-xl font-bold transition"
                >
                  Zapisz ustawienia profilu
                </button>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-5 space-y-5">
                <h3 className="text-2xl font-bold text-white">
                  Tabela wyników
                </h3>

                <label className="block">
                  <span className="block text-white font-semibold mb-2">
                    Układ kolumn tabeli wyników
                  </span>

                  <input
                    value={resultsTableSettings.grid_template_columns}
                    onChange={(event) => setResultsTableSettings((currentSettings) => ({
                      ...currentSettings,
                      grid_template_columns: event.target.value,
                    }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500"
                    placeholder="80px 1.6fr 1fr 1.1fr 120px"
                  />

                  <p className="text-gray-500 text-sm mt-2">
                    Kolejność: Miejsce, Zawodnik, Licencja, Klub, Punkty.
                  </p>
                </label>

                <div className="grid md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-white font-semibold mb-2">
                    Minimalna szerokość tabeli
                  </span>

                  <input
                    value={resultsTableSettings.min_width}
                    onChange={(event) => setResultsTableSettings((currentSettings) => ({
                      ...currentSettings,
                      min_width: event.target.value,
                    }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500"
                    placeholder="820px"
                  />
                </label>

                <label className="block">
                  <span className="block text-white font-semibold mb-2">
                    Wysokość wierszy
                  </span>

                  <input
                    value={resultsTableSettings.row_padding_y}
                    onChange={(event) => setResultsTableSettings((currentSettings) => ({
                      ...currentSettings,
                      row_padding_y: event.target.value,
                    }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500"
                    placeholder="0.75rem"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={saveResultsTableSettings}
                className="ui-button bg-green-700 hover:bg-green-600 text-white px-5 py-3 rounded-xl font-bold transition"
              >
                Zapisz ustawienia tabeli
              </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="space-y-6">
            <div className="ui-block bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <h2 className="text-3xl font-bold text-white mb-2">
                Test danych
              </h2>

              <p className="text-gray-400">
                Generuj kontrolowane dane do sprawdzania list zawodników, opłat i tabel wyników.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <section className="ui-block bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <h3 className="text-2xl font-bold text-white mb-4">
                  Generuj zawody
                </h3>

                <div className="space-y-4">
                  <label className="block">
                    <span className="block text-white font-semibold mb-2">
                      Status zawodów
                    </span>

                    <select
                      value={testCompetitionStatus}
                      onChange={(event) => setTestCompetitionStatus(event.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
                    >
                      {Object.entries(competitionStatusLabels).map(([status, label]) => (
                        <option
                          key={status}
                          value={status}
                        >
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="block text-white font-semibold mb-2">
                      Liczba zawodników
                    </span>

                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={testCompetitionParticipants}
                      onChange={(event) => setTestCompetitionParticipants(Number(event.target.value))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
                    />
                  </label>

                  <label className="block">
                    <span className="block text-white font-semibold mb-2">
                      Liczba dyscyplin
                    </span>

                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={testCompetitionDisciplines}
                      onChange={(event) => setTestCompetitionDisciplines(Number(event.target.value))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
                    />
                  </label>

                  <label className="flex items-center gap-3 text-gray-200">
                    <input
                      type="checkbox"
                      checked={testCompetitionResults}
                      onChange={(event) => setTestCompetitionResults(event.target.checked)}
                      className="accent-green-700"
                    />

                    <span>
                      Od razu wygeneruj wyniki
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={generateTestCompetition}
                    disabled={testWorking}
                    className="ui-button w-full bg-green-700 hover:bg-green-600 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl font-bold transition"
                  >
                    Generuj zawody
                  </button>
                </div>
              </section>

              <section className="ui-block bg-zinc-900 border border-zinc-800 rounded-2xl p-6 lg:col-span-2">
                <h3 className="text-2xl font-bold text-white mb-4">
                  Generuj do istniejących zawodów
                </h3>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block md:col-span-2">
                    <span className="block text-white font-semibold mb-2">
                      Zawody
                    </span>

                    <select
                      value={testTargetCompetitionId}
                      onChange={(event) => setTestTargetCompetitionId(event.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
                    >
                      <option value="">
                        Wybierz zawody
                      </option>

                      {competitions.map((competition) => (
                        <option
                          key={competition.id}
                          value={competition.id}
                        >
                          #{competition.id} {competition.name} ({competition.status})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="block text-white font-semibold mb-2">
                      Ilu zawodników dodać
                    </span>

                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={testParticipantCount}
                      onChange={(event) => setTestParticipantCount(Number(event.target.value))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
                    />
                  </label>

                  <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
                    <label className="flex items-center gap-3 text-gray-200">
                      <input
                        type="checkbox"
                        checked={testParticipantsCheckedIn}
                        onChange={(event) => setTestParticipantsCheckedIn(event.target.checked)}
                        className="accent-green-700"
                      />

                      <span>
                        Oznacz obecność
                      </span>
                    </label>

                    <label className="flex items-center gap-3 text-gray-200">
                      <input
                        type="checkbox"
                        checked={testParticipantsPaid}
                        onChange={(event) => setTestParticipantsPaid(event.target.checked)}
                        className="accent-green-700"
                      />

                      <span>
                        Oznacz opłacenie
                      </span>
                    </label>

                    <label className="flex items-center gap-3 text-gray-200">
                      <input
                        type="checkbox"
                        checked={testParticipantResults}
                        onChange={(event) => setTestParticipantResults(event.target.checked)}
                        className="accent-green-700"
                      />

                      <span>
                        Dodaj wyniki po wygenerowaniu
                      </span>
                    </label>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={generateTestParticipants}
                    disabled={testWorking}
                    className="ui-button bg-green-700 hover:bg-green-600 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl font-bold transition"
                  >
                    Generuj zawodników
                  </button>

                  <label className="flex items-center gap-3 text-gray-200">
                    <input
                      type="checkbox"
                      checked={testOverwriteResults}
                      onChange={(event) => setTestOverwriteResults(event.target.checked)}
                      className="accent-green-700"
                    />

                    <span>
                      Nadpisuj istniejące wyniki
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={generateTestResults}
                    disabled={testWorking}
                    className="ui-button bg-blue-700 hover:bg-blue-600 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl font-bold transition"
                  >
                    Generuj wyniki
                  </button>

                  <button
                    type="button"
                    onClick={resetTestResults}
                    disabled={testWorking}
                    className="ui-button bg-red-700 hover:bg-red-600 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl font-bold transition"
                  >
                    Reset wyników
                  </button>
                </div>
              </section>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
