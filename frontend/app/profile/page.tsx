"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import AchievementsSection from "./AchievementsSection";
import type { Achievement } from "./AchievementsSection";
import { apiUrl } from "@/lib/api";

type UserProfile = {
  email: string;
  role: string;
  roles: string[];
  is_active: boolean;
  first_name: string;
  last_name: string;
  license_number: string;
  no_license: boolean;
  judge_license_number: string;
  judge_license_valid_until: string;
  club: string;
  no_club: boolean;
  voivodeship: string;
  birth_date: string;
  phone_number: string;
  organizer_name: string;
  requested_role: string;
  profile_complete: boolean;
  achievements: Achievement[];
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

type RoleDialog = "organizer" | "judge" | null;

const roleRequestLabels: Record<string, string> = {
  organizer: "organizatora",
  judge: "sędziego",
};

const profileRoleLabels: Record<string, string> = {
  user: "Użytkownik",
  shooter: "Strzelec",
  organizer: "Organizator",
  judge: "Sędzia",
  admin: "Administrator",
};

const voivodeships = [
  "dolnośląskie",
  "kujawsko-pomorskie",
  "lubelskie",
  "lubuskie",
  "łódzkie",
  "małopolskie",
  "mazowieckie",
  "opolskie",
  "podkarpackie",
  "podlaskie",
  "pomorskie",
  "śląskie",
  "świętokrzyskie",
  "warmińsko-mazurskie",
  "wielkopolskie",
  "zachodniopomorskie",
];

const fieldClassName = "w-full rounded-lg border border-red-300 bg-white px-4 py-3 text-zinc-950 placeholder:text-zinc-400 outline-none transition focus:border-red-500 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500 dark:border-red-900/60 dark:bg-black dark:text-red-50 dark:placeholder:text-red-900/70 dark:disabled:bg-zinc-950 dark:disabled:text-zinc-600";
const checkboxClassName = "h-5 w-5 rounded border-red-300 text-green-700 focus:ring-green-700";
const profileLabelClassName = "ui-profile-label font-medium text-red-400";
const profileValueClassName = "ui-profile-value mt-3 min-h-6 font-semibold text-red-50";
const defaultProfileSettings: ProfileSettings = {
  label_color: "#f87171",
  value_color: "#f9fafb",
  label_font_size: "1.125rem",
  value_font_size: "1.25rem",
  row_gap: "2rem",
  achievement_icon_size: "4rem",
  achievement_gap: "1.25rem",
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

function RequiredLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-2 block text-sm font-semibold text-red-700 dark:text-red-300">
      {children} <span className="text-red-500">*</span>
    </span>
  );
}

function ProfileField({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <dt className={profileLabelClassName}>
        {label}
      </dt>

      <dd className={profileValueClassName}>
        {value || "-"}
      </dd>
    </div>
  );
}

function displayValue(value: string, fallback = "Brak") {
  return value.trim() || fallback;
}

function applyProfileSettings(settings: ProfileSettings) {
  Object.entries(profileCssVariableNames).forEach(([key, variableName]) => {
    document.documentElement.style.setProperty(
      variableName,
      settings[key as keyof ProfileSettings]
    );
  });
}

function normalizeBirthDateInput(value: string) {
  const trimmedValue = value.trim();
  const isoMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const polishMatch = trimmedValue.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  const dateParts = isoMatch
    ? {
        year: Number(isoMatch[1]),
        month: Number(isoMatch[2]),
        day: Number(isoMatch[3]),
      }
    : polishMatch
      ? {
          year: Number(polishMatch[3]),
          month: Number(polishMatch[2]),
          day: Number(polishMatch[1]),
        }
      : null;

  if (!dateParts) {
    return "";
  }

  const date = new Date(
    Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day)
  );
  const isValidDate = date.getUTCFullYear() === dateParts.year
    && date.getUTCMonth() === dateParts.month - 1
    && date.getUTCDate() === dateParts.day;

  if (!isValidDate || dateParts.year < 1900 || date > new Date()) {
    return "";
  }

  return [
    String(dateParts.year).padStart(4, "0"),
    String(dateParts.month).padStart(2, "0"),
    String(dateParts.day).padStart(2, "0"),
  ].join("-");
}

function normalizeFutureDateInput(value: string) {
  const trimmedValue = value.trim();
  const isoMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const polishMatch = trimmedValue.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  const dateParts = isoMatch
    ? {
        year: Number(isoMatch[1]),
        month: Number(isoMatch[2]),
        day: Number(isoMatch[3]),
      }
    : polishMatch
      ? {
          year: Number(polishMatch[3]),
          month: Number(polishMatch[2]),
          day: Number(polishMatch[1]),
        }
      : null;

  if (!dateParts) {
    return "";
  }

  const date = new Date(
    Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day)
  );
  const isValidDate = date.getUTCFullYear() === dateParts.year
    && date.getUTCMonth() === dateParts.month - 1
    && date.getUTCDate() === dateParts.day;

  if (!isValidDate || dateParts.year < 1900) {
    return "";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (new Date(`${date.toISOString().slice(0, 10)}T00:00:00`) < today) {
    return "";
  }

  return [
    String(dateParts.year).padStart(4, "0"),
    String(dateParts.month).padStart(2, "0"),
    String(dateParts.day).padStart(2, "0"),
  ].join("-");
}

function normalizePhoneInput(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  const hasPlusPrefix = trimmedValue.startsWith("+");
  const digits = trimmedValue.replace(/\D/g, "");

  if (digits.length < 7 || digits.length > 15) {
    return "";
  }

  return hasPlusPrefix ? `+${digits}` : digits;
}

function syncStoredRoles(profile: UserProfile) {
  localStorage.setItem("role", profile.role);
  localStorage.setItem("roles", profile.roles.join(","));
}

export default function ProfilePage() {
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingRoleRequest, setSendingRoleRequest] = useState(false);
  const [requestingPasswordReset, setRequestingPasswordReset] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [roleDialog, setRoleDialog] = useState<RoleDialog>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [noLicense, setNoLicense] = useState(false);
  const [club, setClub] = useState("");
  const [noClub, setNoClub] = useState(false);
  const [voivodeship, setVoivodeship] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [rolePhoneNumber, setRolePhoneNumber] = useState("");
  const [organizerName, setOrganizerName] = useState("");
  const [roleJudgeLicenseNumber, setRoleJudgeLicenseNumber] = useState("");
  const [judgeLicenseValidUntil, setJudgeLicenseValidUntil] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    let ignore = false;

    if (!token) {
      router.push("/login");
      return;
    }

    async function loadProfile() {
      try {
        const [profileResponse, profileSettingsResponse] = await Promise.all([
          fetch(
            apiUrl("/me"),
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          ),
          fetch(
            apiUrl("/settings/profile"),
            {
              cache: "no-store",
            }
          ),
        ]);

        if (!profileResponse.ok) {
          router.push("/login");
          return;
        }

        const data = await profileResponse.json();
        const settingsData = profileSettingsResponse.ok
          ? await profileSettingsResponse.json()
          : defaultProfileSettings;

        if (!ignore) {
          applyProfileSettings({
            label_color: settingsData.label_color || defaultProfileSettings.label_color,
            value_color: settingsData.value_color || defaultProfileSettings.value_color,
            label_font_size: settingsData.label_font_size || defaultProfileSettings.label_font_size,
            value_font_size: settingsData.value_font_size || defaultProfileSettings.value_font_size,
            row_gap: settingsData.row_gap || defaultProfileSettings.row_gap,
            achievement_icon_size: settingsData.achievement_icon_size || defaultProfileSettings.achievement_icon_size,
            achievement_gap: settingsData.achievement_gap || defaultProfileSettings.achievement_gap,
          });
          setProfile(data);
          setFirstName(data.first_name || "");
          setLastName(data.last_name || "");
          setLicenseNumber(data.license_number || "");
          setNoLicense(Boolean(data.no_license));
          setClub(data.club || "");
          setNoClub(Boolean(data.no_club));
          setVoivodeship(data.voivodeship || "");
          setBirthDate(data.birth_date || "");
          setPhoneNumber(data.phone_number || "");
          setOrganizerName(data.organizer_name || "");
          setRolePhoneNumber(data.phone_number || "");
          setRoleJudgeLicenseNumber(data.judge_license_number || "");
          setJudgeLicenseValidUntil(data.judge_license_valid_until || "");
          setEditing(!data.profile_complete);
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      ignore = true;
    };
  }, [router]);

  async function saveProfile() {
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/login");
      return;
    }

    if (!firstName.trim() || !lastName.trim() || !voivodeship || !birthDate.trim()) {
      setMessage("Wypełnij wszystkie wymagane pola ❌");
      return;
    }

    if (!noClub && !club.trim()) {
      setMessage("Podaj klub albo zaznacz, że jeszcze go nie posiadasz ❌");
      return;
    }

    if (!noLicense && !licenseNumber.trim()) {
      setMessage("Podaj numer licencji zawodniczej albo zaznacz, że jeszcze jej nie posiadasz ❌");
      return;
    }

    const normalizedBirthDate = normalizeBirthDateInput(birthDate);
    const normalizedPhoneNumber = normalizePhoneInput(phoneNumber);

    if (!normalizedBirthDate) {
      setMessage("Podaj poprawną datę urodzenia, np. 1987-03-18 albo 18.03.1987 ❌");
      return;
    }

    if (phoneNumber.trim() && !normalizedPhoneNumber) {
      setMessage("Podaj poprawny numer telefonu, minimum 7 cyfr, albo zostaw pole puste ❌");
      return;
    }

    try {
      setSaving(true);
      setMessage("");

      const response = await fetch(
        apiUrl("/me"),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            license_number: noLicense ? "" : licenseNumber.trim(),
            no_license: noLicense,
            club: noClub ? "" : club.trim(),
            no_club: noClub,
            voivodeship,
            birth_date: normalizedBirthDate,
            phone_number: normalizedPhoneNumber,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się zapisać profilu ❌");
        return;
      }

      setProfile(data);
      syncStoredRoles(data);
      setEditing(false);
      setMessage("Profil zapisany. Otrzymujesz status Strzelca ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setSaving(false);
    }
  }

  function openRoleDialog(role: "organizer" | "judge") {
    if (!profile?.profile_complete) {
      setMessage("Najpierw uzupełnij dane konta, aby otrzymać status Strzelca.");
      setEditing(true);
      return;
    }

    setRoleDialog(role);
    setMessage("");
    setRolePhoneNumber(profile.phone_number || phoneNumber);
    setOrganizerName(profile.organizer_name || organizerName);
    setRoleJudgeLicenseNumber(profile.judge_license_number || "");
    setJudgeLicenseValidUntil(profile.judge_license_valid_until || "");
  }

  async function submitRoleRequest() {
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/login");
      return;
    }

    if (!roleDialog) {
      return;
    }

    const body: Record<string, string> = {
      role: roleDialog,
    };

    if (roleDialog === "organizer") {
      const normalizedPhoneNumber = normalizePhoneInput(rolePhoneNumber);

      if (!organizerName.trim()) {
        setMessage("Podaj nazwę organizatora ❌");
        return;
      }

      if (!normalizedPhoneNumber) {
        setMessage("Podaj poprawny numer telefonu organizatora ❌");
        return;
      }

      body.organizer_name = organizerName.trim();
      body.phone_number = normalizedPhoneNumber;
    }

    if (roleDialog === "judge") {
      const normalizedValidUntil = normalizeFutureDateInput(judgeLicenseValidUntil);

      if (!roleJudgeLicenseNumber.trim()) {
        setMessage("Podaj numer licencji sędziowskiej ❌");
        return;
      }

      if (!normalizedValidUntil) {
        setMessage("Podaj poprawną przyszłą datę ważności licencji sędziowskiej ❌");
        return;
      }

      body.judge_license_number = roleJudgeLicenseNumber.trim();
      body.judge_license_valid_until = normalizedValidUntil;
    }

    try {
      setSendingRoleRequest(true);
      setMessage("");

      const response = await fetch(
        apiUrl("/me/role-request"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się przyznać roli ❌");
        return;
      }

      setProfile(data);
      syncStoredRoles(data);
      setPhoneNumber(data.phone_number || "");
      setOrganizerName(data.organizer_name || "");
      setRoleJudgeLicenseNumber(data.judge_license_number || "");
      setJudgeLicenseValidUntil(data.judge_license_valid_until || "");
      setRoleDialog(null);
      setMessage(`${data.message || "Rola została przyznana"} ✅`);
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setSendingRoleRequest(false);
    }
  }

  async function requestPasswordReset() {
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/login");
      return;
    }

    const confirmed = window.confirm(
      "Czy wysłać link resetowania hasła na Twój adres email?"
    );

    if (!confirmed) {
      return;
    }

    try {
      setRequestingPasswordReset(true);
      setMessage("");

      const response = await fetch(
        apiUrl("/me/password-reset"),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się wysłać linku resetującego ❌");
        return;
      }

      setMessage(data.message + " ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setRequestingPasswordReset(false);
    }
  }

  async function deleteAccount() {
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/login");
      return;
    }

    const confirmed = window.confirm(
      "Czy na pewno chcesz trwale usunąć swoje konto? Ta operacja usunie też Twoje zapisy do zawodów i nie da się jej cofnąć."
    );

    if (!confirmed) {
      return;
    }

    const confirmationText = window.prompt(
      "Aby potwierdzić trwałe usunięcie konta, wpisz USUN KONTO"
    );

    if (confirmationText !== "USUN KONTO") {
      setMessage("Usuwanie konta anulowane.");
      return;
    }

    try {
      setDeletingAccount(true);
      setMessage("");

      const response = await fetch(
        apiUrl("/me"),
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się usunąć konta ❌");
        return;
      }

      localStorage.removeItem("token");
      localStorage.removeItem("email");
      localStorage.removeItem("role");
      localStorage.removeItem("roles");
      setMessage(data.message + " ✅");

      setTimeout(() => {
        router.push("/");
      }, 800);
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setDeletingAccount(false);
    }
  }

  const isOwnerProfile = true;
  const rolesText = profile?.roles
    .map((role) => profileRoleLabels[role] || role)
    .join(", ");
  const hasShooterRole = Boolean(
    profile
    && (profile.profile_complete || profile.roles.includes("shooter"))
  );
  const canRequestExtraRoles = Boolean(
    profile
    && hasShooterRole
    && !profile.roles.includes("admin")
  );
  const showOrganizerData = Boolean(
    profile
    && (profile.roles.includes("organizer") || profile.roles.includes("admin"))
  );
  const showJudgeData = Boolean(
    profile
    && (profile.roles.includes("judge") || profile.roles.includes("admin"))
  );
  const showOrganizerButton = Boolean(
    profile
    && canRequestExtraRoles
    && (!profile.roles.includes("organizer") || !profile.organizer_name)
  );
  const showJudgeButton = Boolean(
    profile
    && canRequestExtraRoles
    && (!profile.roles.includes("judge") || !profile.judge_license_number)
  );

  return (
    <main className="min-h-screen bg-white px-6 py-8 text-zinc-950 dark:bg-black dark:text-red-400 sm:px-10 lg:px-14">
      {loading ? (
        <p className="text-zinc-700 dark:text-red-100">
          Ładowanie profilu...
        </p>
      ) : profile ? (
        <div className="mx-auto w-full max-w-[1800px]">
          {!profile.profile_complete && (
            <p className="mb-8 max-w-2xl rounded-lg border border-yellow-500/50 bg-yellow-400/10 px-4 py-3 text-yellow-900 dark:text-yellow-100">
              Uzupełnij profil, aby otrzymać status Strzelca i móc dołączyć do zawodów.
            </p>
          )}

          {editing ? (
            <section className="max-w-5xl">
              <h1 className="mb-10 text-4xl font-bold text-red-400 sm:text-5xl">
                Profil
              </h1>

              <p className="mb-6 text-sm text-red-700 dark:text-red-200">
                Pola oznaczone <span className="font-bold text-red-500">*</span> są wymagane do zapisania się na zawody. Telefon jest opcjonalny, chyba że prosisz o rolę organizatora.
              </p>

              <div className="grid gap-5 md:grid-cols-2">
                <label>
                  <span className="mb-2 block text-sm font-semibold text-red-700 dark:text-red-300">
                    email
                  </span>
                  <input
                    value={profile.email}
                    readOnly
                    className={fieldClassName}
                  />
                </label>

                <label>
                  <RequiredLabel>Imię</RequiredLabel>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Podaj imię"
                    className={fieldClassName}
                  />
                </label>

                <label>
                  <RequiredLabel>Nazwisko</RequiredLabel>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Podaj nazwisko"
                    className={fieldClassName}
                  />
                </label>

                <label>
                  <RequiredLabel>Województwo</RequiredLabel>
                  <select
                    value={voivodeship}
                    onChange={(e) => setVoivodeship(e.target.value)}
                    className={fieldClassName}
                  >
                    <option value="">Wybierz województwo</option>
                    {voivodeships.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <RequiredLabel>Data urodzenia</RequiredLabel>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className={fieldClassName}
                  />
                </label>

                <div>
                  <RequiredLabel>Klub</RequiredLabel>
                  <input
                    value={club}
                    onChange={(e) => setClub(e.target.value)}
                    placeholder="Podaj klub"
                    disabled={noClub}
                    className={fieldClassName}
                  />
                  <label className="mt-3 flex items-center gap-3 text-sm font-semibold text-red-700 dark:text-red-200">
                    <input
                      type="checkbox"
                      checked={noClub}
                      onChange={(event) => {
                        setNoClub(event.target.checked);

                        if (event.target.checked) {
                          setClub("");
                        }
                      }}
                      className={checkboxClassName}
                    />
                    Jeszcze nie posiadam klubu
                  </label>
                </div>

                <div>
                  <RequiredLabel>Nr. Licencji Zawodniczej</RequiredLabel>
                  <input
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    placeholder="Nr. Licencji Zawodniczej"
                    disabled={noLicense}
                    className={fieldClassName}
                  />
                  <label className="mt-3 flex items-center gap-3 text-sm font-semibold text-red-700 dark:text-red-200">
                    <input
                      type="checkbox"
                      checked={noLicense}
                      onChange={(event) => {
                        setNoLicense(event.target.checked);

                        if (event.target.checked) {
                          setLicenseNumber("");
                        }
                      }}
                      className={checkboxClassName}
                    />
                    Jeszcze nie posiadam licencji zawodniczej
                  </label>
                </div>

                <label>
                  <span className="mb-2 block text-sm font-semibold text-red-700 dark:text-red-300">
                    Telefon
                  </span>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="Opcjonalnie"
                    className={fieldClassName}
                  />
                </label>
              </div>

              <div className="mt-8 flex flex-wrap gap-4">
                <button
                  onClick={saveProfile}
                  disabled={saving}
                  className="bg-green-900 px-5 py-3 font-semibold text-white transition hover:bg-green-800 disabled:opacity-50"
                >
                  {saving
                    ? "Zapisywanie..."
                    : "Zapisz profil"}
                </button>

                {profile.profile_complete && (
                  <button
                    onClick={() => setEditing(false)}
                    className="bg-zinc-800 px-5 py-3 font-semibold text-white transition hover:bg-zinc-700"
                  >
                    Anuluj
                  </button>
                )}
              </div>
            </section>
          ) : (
            <>
              <div className="grid min-h-[calc(100vh-12rem)] gap-12 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]">
                <aside>
                  <dl className="ui-profile-fields">
                    <ProfileField
                      label="Nazwisko"
                      value={displayValue(profile.last_name)}
                    />

                    <ProfileField
                      label="Imię"
                      value={displayValue(profile.first_name)}
                    />

                    <ProfileField
                      label="Województwo"
                      value={displayValue(profile.voivodeship)}
                    />

                    <ProfileField
                      label="Klub"
                      value={profile.no_club ? "Nie posiada" : displayValue(profile.club)}
                    />

                    {isOwnerProfile && (
                      <div className="ui-profile-fields pt-2">
                        <ProfileField
                          label="email"
                          value={profile.email}
                        />

                        <ProfileField
                          label="Nr. Licencji Zawodniczej"
                          value={profile.no_license ? "Nie posiada" : displayValue(profile.license_number)}
                        />

                        {showOrganizerData && (
                          <ProfileField
                            label="Nazwa organizatora"
                            value={displayValue(profile.organizer_name)}
                          />
                        )}

                        {showJudgeData && (
                          <>
                            <ProfileField
                              label="Nr. licencji sędziowskiej"
                              value={displayValue(profile.judge_license_number)}
                            />

                            <ProfileField
                              label="Ważność licencji sędziowskiej"
                              value={displayValue(profile.judge_license_valid_until)}
                            />
                          </>
                        )}

                        <ProfileField
                          label="Data Urodzenia"
                          value={displayValue(profile.birth_date)}
                        />

                        <ProfileField
                          label="Telefon"
                          value={displayValue(profile.phone_number, "Brak numeru")}
                        />

                        {hasShooterRole && (
                          <ProfileField
                            label="Rola w systemie"
                            value={rolesText || "Brak"}
                          />
                        )}
                      </div>
                    )}
                  </dl>
                </aside>

                <section className="flex min-w-0 flex-col items-center text-center">
                  <AchievementsSection achievements={profile.achievements || []} />
                </section>
              </div>

              {isOwnerProfile && (
                <section className="mt-8 flex flex-col gap-5 border-t border-red-200 pt-8 dark:border-red-950">
                  <div className="flex flex-wrap gap-4">
                    <button
                      onClick={() => setEditing(true)}
                      className="bg-green-900 px-5 py-3 font-semibold text-white transition hover:bg-green-800"
                    >
                      Edytuj profil
                    </button>

                    {hasShooterRole && (
                      <Link
                        href="/profile/statistics"
                        className="bg-red-700 px-5 py-3 font-semibold text-white transition hover:bg-red-600"
                      >
                        Moje Statystyki
                      </Link>
                    )}

                    <button
                      type="button"
                      onClick={requestPasswordReset}
                      disabled={requestingPasswordReset}
                      className="bg-zinc-800 px-5 py-3 font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
                    >
                      {requestingPasswordReset
                        ? "Wysyłanie..."
                        : "Zresetuj hasło"}
                    </button>

                    {showOrganizerButton && (
                      <button
                        type="button"
                        onClick={() => openRoleDialog("organizer")}
                        disabled={sendingRoleRequest}
                        className="bg-blue-700 px-5 py-3 font-semibold text-white transition hover:bg-blue-600 disabled:opacity-50"
                      >
                        {profile.roles.includes("organizer")
                          ? "Uzupełnij dane organizatora"
                          : "Poproś o rolę organizatora"}
                      </button>
                    )}

                    {showJudgeButton && (
                      <button
                        type="button"
                        onClick={() => openRoleDialog("judge")}
                        disabled={sendingRoleRequest}
                        className="bg-zinc-800 px-5 py-3 font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
                      >
                        {profile.roles.includes("judge")
                          ? "Uzupełnij dane sędziego"
                          : "Poproś o rolę sędziego"}
                      </button>
                    )}
                  </div>

                  {!profile.roles.includes("admin") && profile.requested_role && (
                    <p className="text-zinc-700 dark:text-red-100">
                      Wcześniejsza prośba o rolę {roleRequestLabels[profile.requested_role] || profile.requested_role} zostanie zastąpiona automatycznym nadaniem roli po uzupełnieniu wymaganych danych.
                    </p>
                  )}

                  {canRequestExtraRoles && !showOrganizerButton && !showJudgeButton && (
                    <p className="text-zinc-700 dark:text-red-100">
                      Masz już komplet uprawnień organizatora i sędziego.
                    </p>
                  )}

                  <div className="border-t border-red-200 pt-5 dark:border-red-950">
                    <button
                      type="button"
                      onClick={deleteAccount}
                      disabled={deletingAccount}
                      className="bg-red-900 px-5 py-3 font-semibold text-white transition hover:bg-red-800 disabled:opacity-50"
                    >
                      {deletingAccount
                        ? "Usuwanie konta..."
                        : "Usuń konto"}
                    </button>
                  </div>
                </section>
              )}
            </>
          )}

          {message && (
            <p className="mt-6 font-medium text-zinc-700 dark:text-red-100">
              {message}
            </p>
          )}

          {roleDialog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6">
              <div className="w-full max-w-lg rounded-xl border border-red-900/60 bg-white p-6 text-zinc-950 shadow-2xl dark:bg-zinc-950 dark:text-red-50">
                <h2 className="mb-5 text-2xl font-bold text-red-500">
                  {roleDialog === "organizer"
                    ? "Rola organizatora"
                    : "Rola sędziego"}
                </h2>

                {roleDialog === "organizer" ? (
                  <div className="space-y-4">
                    <label>
                      <RequiredLabel>Telefon</RequiredLabel>
                      <input
                        type="tel"
                        inputMode="tel"
                        value={rolePhoneNumber}
                        onChange={(e) => setRolePhoneNumber(e.target.value)}
                        placeholder="Numer telefonu organizatora"
                        className={fieldClassName}
                      />
                    </label>

                    <label>
                      <RequiredLabel>Nazwa Organizatora</RequiredLabel>
                      <input
                        value={organizerName}
                        onChange={(e) => setOrganizerName(e.target.value)}
                        placeholder="Oficjalna nazwa organizatora"
                        className={fieldClassName}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <label>
                      <RequiredLabel>Nr. Licencji sędziowskiej</RequiredLabel>
                      <input
                        value={roleJudgeLicenseNumber}
                        onChange={(e) => setRoleJudgeLicenseNumber(e.target.value)}
                        placeholder="Numer licencji sędziowskiej"
                        className={fieldClassName}
                      />
                    </label>

                    <label>
                      <RequiredLabel>Data ważności</RequiredLabel>
                      <input
                        type="date"
                        value={judgeLicenseValidUntil}
                        onChange={(e) => setJudgeLicenseValidUntil(e.target.value)}
                        className={fieldClassName}
                      />
                    </label>
                  </div>
                )}

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={submitRoleRequest}
                    disabled={sendingRoleRequest}
                    className="bg-green-800 px-5 py-3 font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
                  >
                    {sendingRoleRequest ? "Zapisywanie..." : "OK"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setRoleDialog(null)}
                    disabled={sendingRoleRequest}
                    className="bg-zinc-800 px-5 py-3 font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
                  >
                    Anuluj
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-zinc-700 dark:text-red-100">
          Nie udało się pobrać profilu.
        </p>
      )}
    </main>
  );
}
