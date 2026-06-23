"use client";

import Image from "next/image";
import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { apiUrl } from "@/lib/api";
import { getAccessToken, isAdmin } from "@/lib/auth";
import QrCodeScanner from "@/components/QrCodeScanner";

type AdminTab = "users" | "pzss-clubs" | "competitions" | "settings" | "premium" | "ads" | "monitoring" | "qr-scanner" | "test-data";
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
  premium_until: string;
  premium_disabled: boolean;
  status: "online" | "offline";
  last_seen: string;
};

type AdminPzssClub = {
  id: number;
  email: string;
  short_name: string;
  full_name: string;
  phone_number: string;
  license_number: string;
  status: string;
  is_active: boolean;
};

type AdminUserInfoRow = {
  label: string;
  value: string;
};

type AdminUserInfoSection = {
  title: string;
  rows: AdminUserInfoRow[];
};

type AdminUserInfo = {
  id: number;
  email: string;
  display_name: string;
  sections: AdminUserInfoSection[];
};

type AdminDiscipline = {
  id: number;
  name: string;
  description: string;
  scoring_type: string;
  discipline_type: string;
  discipline_type_label?: string;
  shots_count: number;
  trap_series_count?: number;
  clay_series_count?: number;
  ammo_type: string;
  ammo_price: string;
  clay_price?: string;
  entry_fee: string;
};

type AdminCompetition = {
  id: number;
  name: string;
  date: string;
  location: string;
  entry_fee: string;
  organizer_logo: string;
  sponsor_logo: string;
  participant_limit: number | null;
  participants_count: number;
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

type MonitoringService = {
  name: string;
  active: string;
  enabled: string;
  ok: boolean;
};

type MonitoringProcess = {
  name: string;
  status: string;
  pid: number | null;
  restart_count: number;
  uptime_ms: number | null;
  memory_bytes: number;
  cpu_percent: number;
};

type MonitoringLog = {
  name: string;
  path: string;
  exists: boolean;
  size_bytes: number;
  modified_at: string;
};

type AdReportSlotTotal = {
  slot: string;
  label: string;
  impressions: number;
  clicks: number;
};

type AdReportDeviceTotal = {
  device: string;
  impressions: number;
  clicks: number;
};

type AdReportRow = {
  date: string;
  slot: string;
  label: string;
  device: string;
  impressions: number;
  clicks: number;
  ctr: number;
};

type AdReportData = {
  days: number;
  start_date: string;
  generated_at: string;
  total_impressions: number;
  total_clicks: number;
  ctr: number;
  totals_by_slot: AdReportSlotTotal[];
  totals_by_device: AdReportDeviceTotal[];
  rows: AdReportRow[];
};

type MonitoringData = {
  status: "ok" | "warning";
  generated_at: string;
  hostname: string;
  database: {
    ok: boolean;
    latency_ms: number | null;
    error: string;
  };
  services: MonitoringService[];
  pm2: {
    ok: boolean;
    processes: MonitoringProcess[];
    error: string;
  };
  disk: {
    path: string;
    total_bytes: number;
    used_bytes: number;
    free_bytes: number;
    used_percent: number;
  };
  backups: {
    directory: string;
    count: number;
    latest: {
      name: string;
      path: string;
      size_bytes: number;
      modified_at: string;
    } | null;
  };
  logs: MonitoringLog[];
  recent_logs: Record<string, string[]>;
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

type ActivationEmailTemplate = {
  subject: string;
  text_body: string;
  html_body: string;
};

type PremiumFeature = {
  id: string;
  label: string;
};

type PremiumPackageSettings = {
  monthly_price: string;
  yearly_price: string;
  features: string[];
  available_features: PremiumFeature[];
};

type PremiumSettings = {
  shooter: PremiumPackageSettings;
  organizer: PremiumPackageSettings;
};

const activationLinkPlaceholder = "{{activation_link}}";

const defaultActivationEmailTemplate: ActivationEmailTemplate = {
  subject: "Aktywacja konta w Systemie Strzeleckim",
  text_body: `Cześć,\n\nDziękujemy za rejestrację w Systemie Strzeleckim. Aby aktywować konto, otwórz link:\n${activationLinkPlaceholder}\n\nJeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość.`,
  html_body: `<p>Cześć,</p>\n<p>Dziękujemy za rejestrację w Systemie Strzeleckim.</p>\n<p><a href="${activationLinkPlaceholder}">Aktywuj konto</a></p>\n<p>Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość.</p>`,
};

const defaultPremiumSettings: PremiumSettings = {
  shooter: {
    monthly_price: "19.99",
    yearly_price: "199.00",
    features: [
      "live_results",
      "historical_results",
      "ranking",
      "achievements",
      "statistics",
    ],
    available_features: [
      { id: "live_results", label: "Wyniki na Żywo" },
      { id: "historical_results", label: "Wyniki Historyczne" },
      { id: "ranking", label: "Ranking" },
      { id: "achievements", label: "Odznaczenia" },
      { id: "statistics", label: "Moje statystyki" },
    ],
  },
  organizer: {
    monthly_price: "99.00",
    yearly_price: "500.00",
    features: [
      "unlimited_active_publications",
    ],
    available_features: [
      {
        id: "unlimited_active_publications",
        label: "Nielimitowana liczba jednocześnie opublikowanych zawodów",
      },
    ],
  },
};

const roles = [
  "user",
  "shooter",
  "organizer",
  "judge",
  "admin",
];

const roleLabels: Record<string, string> = {
  user: "użytkownik",
  shooter: "strzelec",
  organizer: "organizator",
  judge: "sędzia",
  admin: "administrator",
};

const requestedRoleLabels: Record<string, string> = {
  organizer: "organizator",
  judge: "sędzia",
};

const adReportPeriodOptions = [30, 90, 180, 365];

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
  const [pzssClubs, setPzssClubs] = useState<AdminPzssClub[]>([]);
  const [clubLicenseInputs, setClubLicenseInputs] = useState<Record<number, string>>({});
  const [competitions, setCompetitions] = useState<AdminCompetition[]>([]);
  const [monitoring, setMonitoring] = useState<MonitoringData | null>(null);
  const [adReport, setAdReport] = useState<AdReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [selectedUserInfo, setSelectedUserInfo] = useState<AdminUserInfo | null>(null);
  const [userInfoLoadingId, setUserInfoLoadingId] = useState<number | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [userSortField, setUserSortField] = useState<UserSortField>("name");
  const [userSortDirection, setUserSortDirection] = useState<SortDirection>("asc");
  const [adReportDays, setAdReportDays] = useState(30);
  const [adReportPdfDownloading, setAdReportPdfDownloading] = useState(false);
  const [expandedCompetitionId, setExpandedCompetitionId] = useState<number | null>(null);
  const [currentAdminEmail] = useState(() =>
    typeof window === "undefined"
      ? ""
      : localStorage.getItem("email") || ""
  );
  const [resultsTableSettings, setResultsTableSettings] = useState<ResultsTableSettings>(defaultResultsTableSettings);
  const [uiSettings, setUiSettings] = useState<UiSettings>(defaultUiSettings);
  const [profileSettings, setProfileSettings] = useState<ProfileSettings>(defaultProfileSettings);
  const [premiumSettings, setPremiumSettings] = useState<PremiumSettings>(defaultPremiumSettings);
  const [premiumSaving, setPremiumSaving] = useState(false);
  const [activationEmailTemplate, setActivationEmailTemplate] = useState<ActivationEmailTemplate>(defaultActivationEmailTemplate);
  const [emailAssetUploading, setEmailAssetUploading] = useState(false);
  const [activationEmailTestSending, setActivationEmailTestSending] = useState(false);
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

  function selectTab(tab: AdminTab) {
    setActiveTab(tab);
    router.replace(
      tab === "users"
        ? "/admin"
        : `/admin?tab=${tab}`,
      {
        scroll: false,
      }
    );
  }

  useEffect(() => {
    if (!isAdmin()) {
      router.push("/");
      return;
    }

    const token = getAccessToken();
    let ignore = false;

    if (!token) {
      router.push("/login");
      return;
    }

    async function loadAdminData() {
      try {
        const [usersResponse, pzssClubsResponse, competitionsResponse, tableSettingsResponse, uiSettingsResponse, profileSettingsResponse, premiumSettingsResponse, activationEmailResponse, monitoringResponse, adReportResponse] = await Promise.all([
          fetch(
            apiUrl("/admin/users"),
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          ),
          fetch(
            apiUrl("/admin/pzss-clubs"),
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
          fetch(
            apiUrl("/admin/settings/premium"),
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          ),
          fetch(
            apiUrl("/admin/settings/activation-email"),
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          ),
          fetch(
            apiUrl("/admin/monitoring"),
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          ),
          fetch(
            apiUrl("/admin/ad-report?days=30"),
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          ),
        ]);

        const usersData = await usersResponse.json();
        const pzssClubsData = await pzssClubsResponse.json();
        const competitionsData = await competitionsResponse.json();
        const tableSettingsData = await tableSettingsResponse.json();
        const uiSettingsData = await uiSettingsResponse.json();
        const profileSettingsData = await profileSettingsResponse.json();
        const premiumSettingsData = await premiumSettingsResponse.json();
        const activationEmailData = await activationEmailResponse.json();
        const monitoringData = await monitoringResponse.json();
        const adReportData = await adReportResponse.json();

        if (ignore) {
          return;
        }

        if (!usersResponse.ok) {
          setMessage(usersData.detail || "Nie udało się pobrać użytkowników ❌");
          return;
        }

        if (!pzssClubsResponse.ok) {
          setMessage(pzssClubsData.detail || "Nie udało się pobrać klubów PZSS ❌");
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

        if (!premiumSettingsResponse.ok) {
          setMessage(premiumSettingsData.detail || "Nie udało się pobrać ustawień Premium ❌");
          return;
        }

        if (!activationEmailResponse.ok) {
          setMessage(activationEmailData.detail || "Nie udało się pobrać szablonu e-maila ❌");
          return;
        }

        if (!monitoringResponse.ok) {
          setMessage(monitoringData.detail || "Nie udało się pobrać monitoringu ❌");
          return;
        }

        if (!adReportResponse.ok) {
          setMessage(adReportData.detail || "Nie udało się pobrać raportu reklam ❌");
          return;
        }

        setUsers(usersData);
        setPzssClubs(pzssClubsData);
        setClubLicenseInputs(Object.fromEntries(
          pzssClubsData.map((club: AdminPzssClub) => [club.id, club.license_number || ""])
        ));
        setCompetitions(competitionsData);
        setMonitoring(monitoringData);
        setAdReport(adReportData);
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
        setPremiumSettings(normalizePremiumSettings(premiumSettingsData));
        setActivationEmailTemplate({
          subject: activationEmailData.subject || defaultActivationEmailTemplate.subject,
          text_body: activationEmailData.text_body || defaultActivationEmailTemplate.text_body,
          html_body: activationEmailData.html_body || defaultActivationEmailTemplate.html_body,
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

  async function updateUserPremiumDisabled(
    userId: number,
    premiumDisabled: boolean
  ) {
    const token = getAccessToken();

    try {
      setMessage("");

      const response = await fetch(
        apiUrl(`/admin/users/${userId}/premium-disabled`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            premium_disabled: premiumDisabled,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się zmienić statusu premium ❌");
        return;
      }

      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === userId
            ? data
            : user
        )
      );
      setMessage(premiumDisabled ? "Premium użytkownika wyłączone ✅" : "Premium użytkownika przywrócone ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  async function updateUserRoles(
    userId: number,
    roles: string[]
  ) {
    const token = getAccessToken();

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

  function normalizePremiumSettings(data: Partial<PremiumSettings>): PremiumSettings {
    return {
      shooter: {
        monthly_price: data.shooter?.monthly_price || defaultPremiumSettings.shooter.monthly_price,
        yearly_price: data.shooter?.yearly_price || defaultPremiumSettings.shooter.yearly_price,
        features: data.shooter?.features || defaultPremiumSettings.shooter.features,
        available_features: data.shooter?.available_features || defaultPremiumSettings.shooter.available_features,
      },
      organizer: {
        monthly_price: data.organizer?.monthly_price || defaultPremiumSettings.organizer.monthly_price,
        yearly_price: data.organizer?.yearly_price || defaultPremiumSettings.organizer.yearly_price,
        features: data.organizer?.features || defaultPremiumSettings.organizer.features,
        available_features: data.organizer?.available_features || defaultPremiumSettings.organizer.available_features,
      },
    };
  }

  function updatePremiumPackage(
    packageType: keyof PremiumSettings,
    update: Partial<Pick<PremiumPackageSettings, "monthly_price" | "yearly_price" | "features">>
  ) {
    setPremiumSettings((currentSettings) => ({
      ...currentSettings,
      [packageType]: {
        ...currentSettings[packageType],
        ...update,
      },
    }));
  }

  function togglePremiumFeature(
    packageType: keyof PremiumSettings,
    featureId: string,
    checked: boolean
  ) {
    const currentFeatures = premiumSettings[packageType].features;
    const nextFeatures = checked
      ? [...currentFeatures, featureId].filter((value, index, list) => list.indexOf(value) === index)
      : currentFeatures.filter((value) => value !== featureId);

    updatePremiumPackage(packageType, {
      features: nextFeatures,
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

  async function reloadAdReport(days = adReportDays) {
    const token = getAccessToken();

    try {
      setMessage("");

      const response = await fetch(
        apiUrl(`/admin/ad-report?days=${days}`),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się odświeżyć raportu reklam ❌");
        return;
      }

      setAdReport(data);
      setAdReportDays(data.days || days);
      setMessage("Raport reklam odświeżony");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  async function downloadAdReportPdf(days = adReportDays) {
    const token = getAccessToken();

    try {
      setMessage("");
      setAdReportPdfDownloading(true);

      const response = await fetch(
        apiUrl(`/admin/ad-report.pdf?days=${days}`),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setMessage(data?.detail || "Nie udało się wygenerować PDF raportu reklam ❌");
        return;
      }

      const blob = await response.blob();
      const fileUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = fileUrl;
      link.download = `raport-reklam-${days}-dni.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(fileUrl);
      setMessage("PDF raportu reklam wygenerowany");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setAdReportPdfDownloading(false);
    }
  }

  async function reloadMonitoring() {
    const token = getAccessToken();

    try {
      setMessage("");

      const response = await fetch(
        apiUrl("/admin/monitoring"),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się odświeżyć monitoringu ❌");
        return;
      }

      setMonitoring(data);
      setMessage("Monitoring odświeżony");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
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

  async function approvePzssClub(clubId: number) {
    const licenseNumber = (clubLicenseInputs[clubId] || "").trim();

    if (!licenseNumber) {
      setMessage("Podaj numer licencji klubowej PZSS ❌");
      return;
    }

    const token = getAccessToken();

    try {
      setMessage("");

      const response = await fetch(
        apiUrl(`/admin/pzss-clubs/${clubId}/approve`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            license_number: licenseNumber,
          }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się zatwierdzić klubu PZSS ❌");
        return;
      }

      setPzssClubs((currentClubs) => currentClubs.map((club) => (
        club.id === clubId ? data : club
      )));
      setClubLicenseInputs((currentInputs) => ({
        ...currentInputs,
        [clubId]: data.license_number || licenseNumber,
      }));
      setMessage("Klub PZSS zatwierdzony ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  async function rejectPzssClub(clubId: number) {
    const confirmed = window.confirm("Czy oznaczyć ten klub PZSS jako odrzucony?");

    if (!confirmed) {
      return;
    }

    const token = getAccessToken();

    try {
      setMessage("");

      const response = await fetch(
        apiUrl(`/admin/pzss-clubs/${clubId}/reject`),
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się odrzucić klubu PZSS ❌");
        return;
      }

      setPzssClubs((currentClubs) => currentClubs.map((club) => (
        club.id === clubId ? data : club
      )));
      setMessage("Klub PZSS odrzucony");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  async function deleteCompetition(competitionId: number) {
    const confirmed = window.confirm(
      "Czy na pewno chcesz usunąć te zawody jako administrator?"
    );

    if (!confirmed) {
      return;
    }

    const token = getAccessToken();

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
    const token = getAccessToken();

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
    const token = getAccessToken();

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
    const token = getAccessToken();

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
    const token = getAccessToken();

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
    const token = getAccessToken();

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

  async function savePremiumSettings() {
    const token = getAccessToken();

    try {
      setMessage("");
      setPremiumSaving(true);

      const response = await fetch(
        apiUrl("/admin/settings/premium"),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            shooter: {
              monthly_price: premiumSettings.shooter.monthly_price,
              yearly_price: premiumSettings.shooter.yearly_price,
              features: premiumSettings.shooter.features,
            },
            organizer: {
              monthly_price: premiumSettings.organizer.monthly_price,
              yearly_price: premiumSettings.organizer.yearly_price,
              features: premiumSettings.organizer.features,
            },
          }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się zapisać ustawień Premium ❌");
        return;
      }

      setPremiumSettings(normalizePremiumSettings(data));
      setMessage("Ustawienia Premium zapisane ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setPremiumSaving(false);
    }
  }

  async function saveActivationEmailTemplate() {
    const token = getAccessToken();

    if (
      !activationEmailTemplate.text_body.includes(activationLinkPlaceholder)
      || !activationEmailTemplate.html_body.includes(activationLinkPlaceholder)
    ) {
      setMessage(`W obu wersjach wiadomości musi pozostać znacznik ${activationLinkPlaceholder} ❌`);
      return;
    }

    try {
      setMessage("");
      const response = await fetch(
        apiUrl("/admin/settings/activation-email"),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(activationEmailTemplate),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się zapisać szablonu e-maila ❌");
        return;
      }

      setActivationEmailTemplate(data);
      setMessage("Szablon e-maila aktywacyjnego zapisany i od razu aktywny ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  async function uploadActivationEmailAsset(file: File) {
    const token = getAccessToken();
    const formData = new FormData();
    formData.append("file", file);

    try {
      setMessage("");
      setEmailAssetUploading(true);
      const response = await fetch(
        apiUrl("/admin/settings/activation-email/assets"),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się dodać grafiki ❌");
        return;
      }

      setActivationEmailTemplate((current) => ({
        ...current,
        html_body: `${current.html_body}\n<p><img src="${data.url}" alt="" style="display:block;max-width:100%;height:auto;"></p>`,
      }));
      setMessage("Grafika dodana do treści HTML. Zapisz szablon, aby ją opublikować ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setEmailAssetUploading(false);
    }
  }

  async function sendActivationEmailTest() {
    const token = getAccessToken();

    if (
      !activationEmailTemplate.text_body.includes(activationLinkPlaceholder)
      || !activationEmailTemplate.html_body.includes(activationLinkPlaceholder)
    ) {
      setMessage(`W obu wersjach wiadomości musi pozostać znacznik ${activationLinkPlaceholder} ❌`);
      return;
    }

    try {
      setMessage("");
      setActivationEmailTestSending(true);
      const response = await fetch(
        apiUrl("/admin/settings/activation-email/test"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(activationEmailTemplate),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się wysłać testowej wiadomości ❌");
        return;
      }

      setMessage(`${data.message} ✅`);
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setActivationEmailTestSending(false);
    }
  }

  async function createActiveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const email = newUserEmail.trim();

    if (!email || !newUserPassword) {
      setMessage("Podaj e-mail i hasło dla nowego konta ❌");
      return;
    }

    if (newUserPassword.length < 6) {
      setMessage("Hasło musi mieć minimum 6 znaków ❌");
      return;
    }

    const token = getAccessToken();

    try {
      setMessage("");
      setCreatingUser(true);

      const response = await fetch(
        apiUrl("/admin/users"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            email,
            password: newUserPassword,
          }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się utworzyć użytkownika ❌");
        return;
      }

      setUsers((currentUsers) => [...currentUsers, data.user]);
      setNewUserEmail("");
      setNewUserPassword("");
      setMessage(`${data.message}. Konto jest aktywne i gotowe do logowania ✅`);
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setCreatingUser(false);
    }
  }

  async function openUserInfo(user: AdminUser) {
    const token = getAccessToken();

    try {
      setMessage("");
      setUserInfoLoadingId(user.id);

      const response = await fetch(
        apiUrl(`/admin/users/${user.id}/info`),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się pobrać informacji o użytkowniku ❌");
        return;
      }

      setSelectedUserInfo(data);
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setUserInfoLoadingId(null);
    }
  }

  async function resetUserPassword(user: AdminUser) {
    const confirmed = window.confirm(
      `Czy wysłać link resetowania hasła do użytkownika ${getUserName(user)}?`
    );

    if (!confirmed) {
      return;
    }

    const token = getAccessToken();

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

    const token = getAccessToken();

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
    const token = getAccessToken();

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

    const token = getAccessToken();

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
      setMessage(`Dodano zawodników: ${data.participants_count}, razem w zawodach: ${data.total_participants_count ?? "?"}, wyniki: ${data.results_count} ✅`);
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

    const token = getAccessToken();

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

    const token = getAccessToken();

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

  function formatPremiumUntil(value: string) {
    if (!value) {
      return "brak daty";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
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

  function getLastSeenTime(user: AdminUser) {
    if (!user.last_seen) {
      return 0;
    }

    const time = new Date(user.last_seen).getTime();

    return Number.isNaN(time)
      ? 0
      : time;
  }

  function compareUsersByStatus(firstUser: AdminUser, secondUser: AdminUser) {
    const firstStatusRank = firstUser.status === "online" ? 1 : 0;
    const secondStatusRank = secondUser.status === "online" ? 1 : 0;

    if (firstStatusRank !== secondStatusRank) {
      return userSortDirection === "desc"
        ? secondStatusRank - firstStatusRank
        : firstStatusRank - secondStatusRank;
    }

    if (firstUser.status === "offline" && secondUser.status === "offline") {
      const lastSeenSort = getLastSeenTime(secondUser) - getLastSeenTime(firstUser);

      if (lastSeenSort !== 0) {
        return lastSeenSort;
      }
    }

    return getUserName(firstUser).localeCompare(
      getUserName(secondUser),
      "pl",
      {
        sensitivity: "base",
      }
    );
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

  function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return "0 B";
    }

    const units = ["B", "KB", "MB", "GB", "TB"];
    const unitIndex = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      units.length - 1
    );
    const value = bytes / Math.pow(1024, unitIndex);

    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  function formatDateTime(value: string) {
    if (!value) {
      return "brak";
    }

    return new Intl.DateTimeFormat(
      "pl-PL",
      {
        dateStyle: "short",
        timeStyle: "medium",
      }
    ).format(new Date(value));
  }

  function formatNumber(value: number) {
    return value.toLocaleString("pl-PL");
  }

  function formatCtr(value: number) {
    return `${value.toLocaleString("pl-PL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}%`;
  }

  function deviceLabel(device: string) {
    return device === "mobile"
      ? "Mobile"
      : "Desktop";
  }

  function formatDuration(milliseconds: number | null) {
    if (!milliseconds || milliseconds < 0) {
      return "brak";
    }

    const totalSeconds = Math.floor(milliseconds / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (days > 0) {
      return `${days} d ${hours} h`;
    }

    if (hours > 0) {
      return `${hours} h ${minutes} min`;
    }

    return `${minutes} min`;
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

      if (userSortField === "status") {
        return compareUsersByStatus(firstUser, secondUser);
      }

      return userSortDirection === "asc"
        ? sortResult
        : -sortResult;
    });

  function renderPremiumPackage(
    packageType: keyof PremiumSettings,
    title: string,
    description: string
  ) {
    const packageSettings = premiumSettings[packageType];
    const monthlyPriceLabel = packageType === "organizer"
      ? "Cena za dodatkowe opublikowane zawody"
      : "Cena za 1 miesiąc";
    const yearlyPriceLabel = packageType === "organizer"
      ? "Cena rocznego pakietu bez limitu"
      : "Cena za cały rok";

    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
        <div className="mb-5">
          <h3 className="text-2xl font-black text-white">
            {title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-gray-400">
            {description}
          </p>
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-2">
          <label className="rounded-2xl border border-green-900/70 bg-green-950/30 p-4">
            <span className="block text-sm font-bold uppercase tracking-wide text-green-200">
              {monthlyPriceLabel}
            </span>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={packageSettings.monthly_price}
                onChange={(event) => updatePremiumPackage(packageType, {
                  monthly_price: event.target.value,
                })}
                className="w-full rounded-xl border border-green-800 bg-zinc-900 px-4 py-3 text-2xl font-black text-white"
              />
              <span className="text-xl font-black text-green-100">zł</span>
            </div>
          </label>

          <label className="rounded-2xl border border-green-900/70 bg-green-950/30 p-4">
            <span className="block text-sm font-bold uppercase tracking-wide text-green-200">
              {yearlyPriceLabel}
            </span>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={packageSettings.yearly_price}
                onChange={(event) => updatePremiumPackage(packageType, {
                  yearly_price: event.target.value,
                })}
                className="w-full rounded-xl border border-green-800 bg-zinc-900 px-4 py-3 text-2xl font-black text-white"
              />
              <span className="text-xl font-black text-green-100">zł</span>
            </div>
          </label>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-bold uppercase tracking-wide text-gray-300">
            Funkcje w pakiecie
          </p>

          {packageSettings.available_features.map((feature) => (
            <label
              key={feature.id}
              className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-white transition hover:border-green-700"
            >
              <input
                type="checkbox"
                checked={packageSettings.features.includes(feature.id)}
                onChange={(event) => togglePremiumFeature(
                  packageType,
                  feature.id,
                  event.target.checked
                )}
                className="h-5 w-5 accent-green-600"
              />
              <span className="font-semibold">
                {feature.label}
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-5xl font-bold text-zinc-950 dark:text-white mb-2">
            Panel Administratora
          </h1>

          <p className="text-zinc-600 dark:text-gray-400">
            Zarządzaj użytkownikami, rolami i wszystkimi zawodami w systemie.
          </p>
        </div>

        <div className="mb-8 flex flex-wrap gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => selectTab("users")}
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
            onClick={() => selectTab("pzss-clubs")}
            className={`ui-button min-w-0 px-5 py-3 rounded-xl font-bold transition ${
              activeTab === "pzss-clubs"
                ? "bg-green-700 text-white"
                : "bg-zinc-800 text-gray-300 hover:bg-zinc-700"
            }`}
          >
            Kluby PZSS
          </button>

          <button
            type="button"
            onClick={() => selectTab("competitions")}
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
            onClick={() => selectTab("settings")}
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
            onClick={() => selectTab("premium")}
            className={`ui-button min-w-0 px-5 py-3 rounded-xl font-bold transition ${
              activeTab === "premium"
                ? "bg-green-700 text-white"
                : "bg-zinc-800 text-gray-300 hover:bg-zinc-700"
            }`}
          >
            Premium
          </button>

          <button
            type="button"
            onClick={() => selectTab("ads")}
            className={`ui-button min-w-0 px-5 py-3 rounded-xl font-bold transition ${
              activeTab === "ads"
                ? "bg-green-700 text-white"
                : "bg-zinc-800 text-gray-300 hover:bg-zinc-700"
            }`}
          >
            Reklamy
          </button>

          <button
            type="button"
            onClick={() => selectTab("monitoring")}
            className={`ui-button min-w-0 px-5 py-3 rounded-xl font-bold transition ${
              activeTab === "monitoring"
                ? "bg-green-700 text-white"
                : "bg-zinc-800 text-gray-300 hover:bg-zinc-700"
            }`}
          >
            Monitoring
          </button>

          <button
            type="button"
            onClick={() => selectTab("qr-scanner")}
            className={`ui-button min-w-0 px-5 py-3 rounded-xl font-bold transition ${
              activeTab === "qr-scanner"
                ? "bg-green-700 text-white"
                : "bg-zinc-800 text-gray-300 hover:bg-zinc-700"
            }`}
          >
            QR skaner
          </button>

          <button
            type="button"
            onClick={() => selectTab("test-data")}
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
            <form
              onSubmit={createActiveUser}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">
                    Dodaj konto testowe
                  </h2>

                  <p className="mt-1 text-sm text-gray-400">
                    Konto zostanie utworzone jako aktywne i będzie gotowe do logowania bez maila aktywacyjnego.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-[minmax(0,18rem)_minmax(0,14rem)_auto]">
                  <input
                    type="email"
                    value={newUserEmail}
                    onChange={(event) => setNewUserEmail(event.target.value)}
                    placeholder="e-mail użytkownika"
                    autoComplete="off"
                    className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500"
                  />

                  <input
                    type="password"
                    value={newUserPassword}
                    onChange={(event) => setNewUserPassword(event.target.value)}
                    placeholder="hasło"
                    autoComplete="new-password"
                    className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500"
                  />

                  <button
                    type="submit"
                    disabled={creatingUser}
                    className="ui-button bg-green-700 hover:bg-green-600 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl font-semibold transition"
                  >
                    {creatingUser ? "Tworzę..." : "Dodaj konto"}
                  </button>
                </div>
              </div>
            </form>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="grid lg:grid-cols-[2fr_1fr_1fr_1fr] gap-3">
                <input
                  type="search"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="Filtruj po nazwisku, imieniu, e-mailu, klubie lub telefonie"
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

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-x-auto">
              <div className="grid min-w-[1280px] grid-cols-[1.4fr_0.7fr_1fr_0.8fr_1fr_0.9fr_1.1fr_1.1fr] gap-4 px-5 py-4 text-sm font-bold text-gray-400 border-b border-zinc-800">
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

                <p>Premium</p>

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
                className={`grid min-w-[1280px] grid-cols-[1.4fr_0.7fr_1fr_0.8fr_1fr_0.9fr_1.1fr_1.1fr] gap-4 px-5 py-4 items-center border-b border-zinc-800 last:border-b-0 ${
                  user.requested_role
                    ? "bg-yellow-950/20"
                    : ""
                }`}
              >
                <div>
                  <Link
                    href={`/profile/user-${user.id}`}
                    className="inline-block text-white font-bold underline-offset-4 transition hover:text-red-300 hover:underline"
                  >
                    {getUserName(user)}
                  </Link>

                  <p className="text-gray-400 text-sm">
                    {user.email}
                  </p>

                  {user.club && (
                    <p className="text-gray-500 text-sm">
                      {user.club}
                    </p>
                  )}
                </div>

                <div>
                  <p className={`font-bold ${
                    user.status === "online"
                      ? "text-green-400"
                      : "text-gray-500"
                  }`}>
                    {user.status === "online"
                      ? "online"
                      : "offline"}
                  </p>

                  {user.status === "offline" && (
                    <p className="mt-1 text-xs text-gray-500">
                      Ostatnio online: {formatDateTime(user.last_seen)}
                    </p>
                  )}
                </div>

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

                <div className="space-y-1 text-sm">
                  <label className="flex items-center gap-2 text-gray-200">
                    <input
                      type="checkbox"
                      checked={Boolean(user.premium_disabled)}
                      onChange={(event) => updateUserPremiumDisabled(
                        user.id,
                        event.target.checked
                      )}
                      className="accent-red-700"
                    />

                    <span>
                      Wyłącz
                    </span>
                  </label>

                  <p className={Boolean(user.premium_disabled) ? "text-red-300" : "text-gray-400"}>
                    do {formatPremiumUntil(user.premium_until)}
                  </p>
                </div>

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
                    onClick={() => openUserInfo(user)}
                    disabled={userInfoLoadingId === user.id}
                    className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg text-sm font-semibold transition"
                  >
                    {userInfoLoadingId === user.id ? "Ładuję..." : "Info"}
                  </button>

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
        ) : activeTab === "pzss-clubs" ? (
          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-x-auto">
            <div className="min-w-[1100px]">
              <div className="grid grid-cols-[1fr_1.4fr_1fr_0.9fr_1fr_1.2fr] gap-4 px-5 py-4 text-sm font-bold text-gray-400 border-b border-zinc-800">
                <p>Nazwa skrócona</p>
                <p>Nazwa pełna</p>
                <p>Kontakt</p>
                <p>Status</p>
                <p>Licencja klubowa</p>
                <p>Akcje</p>
              </div>

              {pzssClubs.length === 0 ? (
                <p className="px-5 py-6 text-gray-400">
                  Brak zarejestrowanych klubów PZSS.
                </p>
              ) : pzssClubs.map((club) => (
                <div
                  key={club.id}
                  className={`grid grid-cols-[1fr_1.4fr_1fr_0.9fr_1fr_1.2fr] gap-4 px-5 py-4 items-center border-b border-zinc-800 last:border-b-0 ${
                    club.status === "pending" ? "bg-yellow-950/20" : ""
                  }`}
                >
                  <div>
                    <p className="text-white font-bold">
                      {club.short_name || "brak"}
                    </p>
                    <p className="text-sm text-gray-500">
                      ID {club.id}
                    </p>
                  </div>

                  <p className="text-gray-300">
                    {club.full_name || "brak"}
                  </p>

                  <div className="text-sm">
                    <p className="text-gray-300">
                      {club.email}
                    </p>
                    <p className="text-gray-500">
                      {club.phone_number || "brak telefonu"}
                    </p>
                  </div>

                  <p className={club.status === "approved" ? "font-bold text-green-400" : club.status === "rejected" ? "font-bold text-red-400" : "font-bold text-yellow-300"}>
                    {club.status === "approved" ? "zweryfikowany" : club.status === "rejected" ? "odrzucony" : "oczekuje"}
                  </p>

                  <input
                    value={clubLicenseInputs[club.id] || ""}
                    onChange={(event) => setClubLicenseInputs((currentInputs) => ({
                      ...currentInputs,
                      [club.id]: event.target.value,
                    }))}
                    placeholder="nr licencji PZSS"
                    className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500"
                  />

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => approvePzssClub(club.id)}
                      className="bg-green-700 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition"
                    >
                      Zatwierdź
                    </button>

                    <button
                      type="button"
                      onClick={() => rejectPzssClub(club.id)}
                      className="bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition"
                    >
                      Odrzuć
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
                    className="relative overflow-hidden border-b border-zinc-800 last:border-b-0"
                  >
                    {competition.organizer_logo && (
                      <Image
                        src={competition.organizer_logo}
                        alt=""
                        fill
                        sizes="100vw"
                        className="pointer-events-none object-contain object-center p-3 opacity-10"
                        unoptimized
                      />
                    )}

                    <div className="relative z-10 grid grid-cols-[1.5fr_1fr_1.2fr_0.8fr_1.3fr_1.4fr_0.8fr_0.8fr_1.2fr] gap-4 px-5 py-4 items-center">
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
                          E-mail
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
        ) : activeTab === "premium" ? (
          <section className="ui-block bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-3xl font-bold text-white mb-2">
                  Premium
                </h2>

                <p className="max-w-3xl text-gray-400">
                  Zarządzaj funkcjami i cenami pakietów Premium. Zmiana ceny w polu od razu aktualizuje pakiet w tym widoku, a przycisk zapisu publikuje ustawienia w systemie.
                </p>
              </div>

              <button
                type="button"
                onClick={savePremiumSettings}
                disabled={premiumSaving}
                className="ui-button bg-green-700 hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50 text-white px-5 py-3 rounded-xl font-bold transition"
              >
                {premiumSaving ? "Zapisuję..." : "Zapisz Premium"}
              </button>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              {renderPremiumPackage(
                "shooter",
                "Pakiet Premium dla Strzelców",
                "Funkcje widoczne dla zwykłych użytkowników i strzelców."
              )}

              {renderPremiumPackage(
                "organizer",
                "Pakiet Premium dla Organizatorów",
                "Panel organizatora, tworzenie zawodów, sędziowie, publikacja wyników, PDF, raporty i statystyki są darmowe. Premium dotyczy tylko publikowania więcej niż jednych aktywnych zawodów jednocześnie. Szkice są bez limitu."
              )}
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
              <div className="rounded-2xl border border-green-800/70 bg-zinc-950/50 p-5 space-y-5">
                <div>
                  <h3 className="text-2xl font-bold text-white">
                    E-mail aktywacyjny
                  </h3>
                  <p className="mt-2 text-sm text-gray-400">
                    Zapis zacznie obowiązywać od następnej rejestracji. Nie usuwaj znacznika {activationLinkPlaceholder}.
                  </p>
                </div>

                <label className="block">
                  <span className="block text-white font-semibold mb-2">Temat wiadomości</span>
                  <input
                    value={activationEmailTemplate.subject}
                    onChange={(event) => setActivationEmailTemplate((current) => ({
                      ...current,
                      subject: event.target.value,
                    }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
                  />
                </label>

                <label className="block">
                  <span className="block text-white font-semibold mb-2">Treść tekstowa</span>
                  <textarea
                    value={activationEmailTemplate.text_body}
                    onChange={(event) => setActivationEmailTemplate((current) => ({
                      ...current,
                      text_body: event.target.value,
                    }))}
                    rows={8}
                    className="w-full resize-y bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 font-mono text-sm text-white"
                  />
                </label>

                <label className="block">
                  <span className="block text-white font-semibold mb-2">Treść HTML</span>
                  <textarea
                    value={activationEmailTemplate.html_body}
                    onChange={(event) => setActivationEmailTemplate((current) => ({
                      ...current,
                      html_body: event.target.value,
                    }))}
                    rows={14}
                    className="w-full resize-y bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 font-mono text-sm text-white"
                  />
                  <span className="mt-2 block text-xs text-gray-500">
                    Możesz używać HTML i stylów osadzonych bezpośrednio w elementach.
                  </span>
                </label>

                <div className="flex flex-wrap gap-3">
                  <label className="ui-button cursor-pointer bg-blue-700 hover:bg-blue-600 text-white px-5 py-3 rounded-xl font-bold transition">
                    {emailAssetUploading ? "Dodawanie grafiki..." : "Dodaj zdjęcie lub grafikę"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      disabled={emailAssetUploading}
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void uploadActivationEmailAsset(file);
                        }
                        event.target.value = "";
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setActivationEmailTemplate(defaultActivationEmailTemplate)}
                    className="ui-button bg-zinc-700 hover:bg-zinc-600 text-white px-5 py-3 rounded-xl font-bold transition"
                  >
                    Przywróć treść domyślną
                  </button>

                  <button
                    type="button"
                    onClick={saveActivationEmailTemplate}
                    className="ui-button bg-green-700 hover:bg-green-600 text-white px-5 py-3 rounded-xl font-bold transition"
                  >
                    Zapisz i opublikuj
                  </button>

                  <button
                    type="button"
                    onClick={sendActivationEmailTest}
                    disabled={activationEmailTestSending}
                    title={`Wyślij obecną, niezapisaną wersję na ${currentAdminEmail}`}
                    className="ui-button ml-auto bg-amber-600 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50 text-white px-5 py-3 rounded-xl font-bold transition"
                  >
                    {activationEmailTestSending
                      ? "Wysyłanie testu..."
                      : "Wyślij test do administratora"}
                  </button>
                </div>

                <div>
                  <p className="text-white font-semibold mb-2">Podgląd wiadomości HTML</p>
                  <iframe
                    title="Podgląd e-maila aktywacyjnego"
                    sandbox="allow-same-origin"
                    srcDoc={activationEmailTemplate.html_body.replaceAll(
                      activationLinkPlaceholder,
                      "https://system-strzelecki.pl/activate?token=PRZYKLADOWY_TOKEN"
                    )}
                    className="h-96 w-full rounded-xl border border-zinc-700 bg-white"
                  />
                </div>
              </div>

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
        ) : activeTab === "ads" ? (
          <section className="space-y-6">
            <div className="ui-block bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-white mb-2">
                    Raport reklam
                  </h2>

                  <p className="text-gray-400">
                    Zliczanie odsłon i kliknięć slotów reklamowych na stronie głównej.
                  </p>
                </div>

                <div className="flex flex-col gap-3 lg:items-end">
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="block">
                      <span className="block text-sm font-semibold text-gray-300 mb-2">
                        Zakres dni
                      </span>

                      <select
                        value={adReportDays}
                        onChange={(event) => {
                          const days = Number(event.target.value);
                          setAdReportDays(days);
                          reloadAdReport(days);
                        }}
                        className="w-36 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
                      >
                        {adReportPeriodOptions.map((days) => (
                          <option key={days} value={days}>
                            {days} dni
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      type="button"
                      onClick={() => reloadAdReport(adReportDays)}
                      className="ui-button bg-green-700 hover:bg-green-600 text-white px-5 py-3 rounded-xl font-semibold transition"
                    >
                      Odśwież
                    </button>

                    <button
                      type="button"
                      onClick={() => downloadAdReportPdf(adReportDays)}
                      disabled={adReportPdfDownloading}
                      className="ui-button bg-blue-700 hover:bg-blue-600 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl font-semibold transition"
                    >
                      {adReportPdfDownloading ? "Generuję PDF..." : "Pobierz PDF"}
                    </button>
                  </div>

                  <p className="text-sm text-gray-500">
                    PDF zawiera identyfikację strony, okres, metodologię pomiaru, podsumowania i dane dzienne.
                  </p>
                </div>
              </div>
            </div>

            {!adReport ? (
              <p className="text-gray-400">
                Brak danych raportu reklam.
              </p>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="ui-block bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <p className="text-sm font-bold uppercase text-gray-400">
                      Odsłony
                    </p>
                    <p className="mt-2 text-3xl font-black text-white">
                      {formatNumber(adReport.total_impressions)}
                    </p>
                  </div>

                  <div className="ui-block bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <p className="text-sm font-bold uppercase text-gray-400">
                      Kliknięcia
                    </p>
                    <p className="mt-2 text-3xl font-black text-white">
                      {formatNumber(adReport.total_clicks)}
                    </p>
                  </div>

                  <div className="ui-block bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <p className="text-sm font-bold uppercase text-gray-400">
                      CTR
                    </p>
                    <p className="mt-2 text-3xl font-black text-white">
                      {formatCtr(adReport.ctr)}
                    </p>
                  </div>
                </div>

                <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                  <div className="grid grid-cols-[minmax(0,1fr)_8rem_8rem] gap-4 px-5 py-4 text-sm font-bold uppercase text-gray-400 border-b border-zinc-800">
                    <p>Slot</p>
                    <p className="text-right">Odsłony</p>
                    <p className="text-right">Kliknięcia</p>
                  </div>

                  {adReport.totals_by_slot.map((slot) => (
                    <div
                      key={slot.slot}
                      className="grid grid-cols-[minmax(0,1fr)_8rem_8rem] gap-4 px-5 py-4 border-b border-zinc-800 last:border-b-0"
                    >
                      <p className="font-semibold text-white">
                        {slot.label}
                      </p>
                      <p className="text-right text-gray-200">
                        {formatNumber(slot.impressions)}
                      </p>
                      <p className="text-right text-gray-200">
                        {formatNumber(slot.clicks)}
                      </p>
                    </div>
                  ))}
                </section>

                <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-x-auto">
                  <div className="grid min-w-[900px] grid-cols-[8rem_1.4fr_8rem_8rem_8rem_7rem] gap-4 px-5 py-4 text-sm font-bold uppercase text-gray-400 border-b border-zinc-800">
                    <p>Data</p>
                    <p>Slot</p>
                    <p>Urządzenie</p>
                    <p className="text-right">Odsłony</p>
                    <p className="text-right">Kliknięcia</p>
                    <p className="text-right">CTR</p>
                  </div>

                  {adReport.rows.length === 0 ? (
                    <p className="min-w-[900px] px-5 py-6 text-gray-400">
                      Brak zdarzeń reklamowych w wybranym zakresie.
                    </p>
                  ) : adReport.rows.map((row) => (
                    <div
                      key={`${row.date}-${row.slot}-${row.device}`}
                      className="grid min-w-[900px] grid-cols-[8rem_1.4fr_8rem_8rem_8rem_7rem] gap-4 px-5 py-4 border-b border-zinc-800 last:border-b-0"
                    >
                      <p className="text-gray-300">
                        {row.date}
                      </p>
                      <p className="font-semibold text-white">
                        {row.label}
                      </p>
                      <p className="text-gray-300">
                        {deviceLabel(row.device)}
                      </p>
                      <p className="text-right text-gray-200">
                        {formatNumber(row.impressions)}
                      </p>
                      <p className="text-right text-gray-200">
                        {formatNumber(row.clicks)}
                      </p>
                      <p className="text-right text-gray-200">
                        {formatCtr(row.ctr)}
                      </p>
                    </div>
                  ))}
                </section>
              </>
            )}
          </section>
        ) : activeTab === "monitoring" ? (
          <section className="space-y-6">
            <div className="ui-block bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-white mb-2">
                    Monitoring
                  </h2>

                  <p className="text-gray-400">
                    Stan usług, bazy danych, backupów i najważniejszych logów produkcyjnych.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={reloadMonitoring}
                  className="ui-button w-fit bg-green-700 hover:bg-green-600 text-white px-5 py-3 rounded-xl font-bold transition"
                >
                  Odśwież
                </button>
              </div>
            </div>

            {!monitoring ? (
              <p className="text-gray-400">
                Brak danych monitoringu.
              </p>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <p className="text-sm font-bold text-gray-500 uppercase">
                      Status
                    </p>

                    <p className={`mt-2 text-3xl font-bold ${
                      monitoring.status === "ok"
                        ? "text-green-400"
                        : "text-yellow-300"
                    }`}>
                      {monitoring.status === "ok"
                        ? "OK"
                        : "Uwaga"}
                    </p>

                    <p className="mt-2 text-sm text-gray-400">
                      {formatDateTime(monitoring.generated_at)}
                    </p>
                  </div>

                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <p className="text-sm font-bold text-gray-500 uppercase">
                      Baza danych
                    </p>

                    <p className={`mt-2 text-3xl font-bold ${
                      monitoring.database.ok
                        ? "text-green-400"
                        : "text-red-400"
                    }`}>
                      {monitoring.database.ok
                        ? "online"
                        : "problem"}
                    </p>

                    <p className="mt-2 text-sm text-gray-400">
                      Latencja: {monitoring.database.latency_ms ?? "brak"} ms
                    </p>
                  </div>

                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <p className="text-sm font-bold text-gray-500 uppercase">
                      Dysk
                    </p>

                    <p className={`mt-2 text-3xl font-bold ${
                      monitoring.disk.used_percent < 80
                        ? "text-green-400"
                        : monitoring.disk.used_percent < 90
                          ? "text-yellow-300"
                          : "text-red-400"
                    }`}>
                      {monitoring.disk.used_percent}%
                    </p>

                    <p className="mt-2 text-sm text-gray-400">
                      Wolne: {formatBytes(monitoring.disk.free_bytes)}
                    </p>
                  </div>

                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <p className="text-sm font-bold text-gray-500 uppercase">
                      Backupy PostgreSQL
                    </p>

                    <p className={`mt-2 text-3xl font-bold ${
                      monitoring.backups.latest
                        ? "text-green-400"
                        : "text-red-400"
                    }`}>
                      {monitoring.backups.count}
                    </p>

                    <p className="mt-2 text-sm text-gray-400">
                      Ostatni: {monitoring.backups.latest
                        ? formatDateTime(monitoring.backups.latest.modified_at)
                        : "brak"}
                    </p>
                  </div>
                </div>

                <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                  <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.7fr] gap-4 px-5 py-4 text-sm font-bold text-gray-400 border-b border-zinc-800">
                    <p>Usługa</p>
                    <p>Aktywna</p>
                    <p>Autostart</p>
                    <p>Status</p>
                  </div>

                  {monitoring.services.map((service) => (
                    <div
                      key={service.name}
                      className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.7fr] gap-4 px-5 py-4 border-b border-zinc-800 last:border-b-0"
                    >
                      <p className="text-white font-semibold">
                        {service.name}
                      </p>

                      <p className="text-gray-300">
                        {service.active}
                      </p>

                      <p className="text-gray-300">
                        {service.enabled}
                      </p>

                      <p className={service.ok ? "text-green-400" : "text-red-400"}>
                        {service.ok ? "OK" : "problem"}
                      </p>
                    </div>
                  ))}
                </section>

                <div className="grid gap-6 lg:grid-cols-2">
                  <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <h3 className="text-2xl font-bold text-white mb-4">
                      PM2
                    </h3>

                    {monitoring.pm2.processes.length === 0 ? (
                      <p className="text-gray-400">
                        Brak procesów PM2.
                      </p>
                    ) : monitoring.pm2.processes.map((process) => (
                      <div
                        key={process.name}
                        className="border-b border-zinc-800 py-4 first:pt-0 last:border-b-0 last:pb-0"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-white font-bold">
                            {process.name}
                          </p>

                          <span className={process.status === "online" ? "text-green-400" : "text-red-400"}>
                            {process.status}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-gray-400">
                          <p>PID: {process.pid ?? "brak"}</p>
                          <p>Restartów: {process.restart_count}</p>
                          <p>Uptime: {formatDuration(process.uptime_ms)}</p>
                          <p>RAM: {formatBytes(process.memory_bytes)}</p>
                        </div>
                      </div>
                    ))}
                  </section>

                  <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <h3 className="text-2xl font-bold text-white mb-4">
                      Logi
                    </h3>

                    <div className="space-y-3">
                      {monitoring.logs.map((log) => (
                        <div
                          key={log.path}
                          className="flex items-start justify-between gap-4 rounded-xl bg-zinc-950/60 px-4 py-3"
                        >
                          <div>
                            <p className="text-white font-semibold">
                              {log.name}
                            </p>

                            <p className="text-xs text-gray-500 break-all">
                              {log.path}
                            </p>
                          </div>

                          <div className="text-right text-sm">
                            <p className={log.exists ? "text-gray-300" : "text-red-400"}>
                              {log.exists ? formatBytes(log.size_bytes) : "brak"}
                            </p>

                            <p className="text-gray-500">
                              {formatDateTime(log.modified_at)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                  <h3 className="text-2xl font-bold text-white mb-4">
                    Ostatnie błędy
                  </h3>

                  <div className="grid gap-4 lg:grid-cols-2">
                    {Object.entries(monitoring.recent_logs).map(([name, lines]) => (
                      <div
                        key={name}
                        className="rounded-xl bg-zinc-950/80 border border-zinc-800 p-4"
                      >
                        <p className="text-white font-bold mb-3">
                          {name}
                        </p>

                        {lines.length === 0 ? (
                          <p className="text-gray-500">
                            Brak wpisów.
                          </p>
                        ) : (
                          <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-5 text-gray-300">
                            {lines.join("\n")}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </section>
        ) : activeTab === "qr-scanner" ? (
          <QrCodeScanner />
        ) : (
          <section className="space-y-6">
            <div className="ui-block bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <h2 className="text-3xl font-bold text-white mb-2">
                Test danych
              </h2>

              <p className="text-gray-400">
                Generuj kontrolowane dane do sprawdzania list zawodników, opłat i tabel wyników.
              </p>

              {message && (
                <p className="mt-4 rounded-xl border border-green-700/40 bg-green-700/10 px-4 py-3 font-semibold text-green-100">
                  {message}
                </p>
              )}
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
                          #{competition.id} {competition.name} ({competition.status}) - zawodnicy: {competition.participants_count}{competition.participant_limit ? `/${competition.participant_limit}` : ""}
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

      {selectedUserInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-6 py-5">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-green-400">
                  Informacje o użytkowniku
                </p>

                <h2 className="mt-1 text-2xl font-black text-white">
                  {selectedUserInfo.display_name}
                </h2>

                <p className="mt-1 text-sm text-gray-400">
                  {selectedUserInfo.email}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedUserInfo(null)}
                className="ui-button bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-xl font-bold transition"
              >
                Zamknij
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
              <div className="grid gap-5 lg:grid-cols-2">
                {selectedUserInfo.sections.map((section) => (
                  <section
                    key={section.title}
                    className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4"
                  >
                    <h3 className="mb-4 text-lg font-bold text-white">
                      {section.title}
                    </h3>

                    <dl className="space-y-3">
                      {section.rows.map((row) => (
                        <div
                          key={`${section.title}-${row.label}`}
                          className="grid gap-1 border-b border-zinc-800 pb-3 last:border-b-0 last:pb-0 sm:grid-cols-[11rem_minmax(0,1fr)]"
                        >
                          <dt className="text-sm font-semibold text-gray-500">
                            {row.label}
                          </dt>

                          <dd className="min-w-0 break-words text-sm font-medium text-gray-100">
                            {row.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
