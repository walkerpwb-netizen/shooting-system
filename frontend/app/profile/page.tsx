"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
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
  judge_license_number: string;
  club: string;
  birth_date: string;
  phone_number: string;
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
};

const roleRequestLabels: Record<string, string> = {
  organizer: "organizatora",
  judge: "sędziego",
};

const profileRoleLabels: Record<string, string> = {
  user: "Strzelec",
  organizer: "Organizator",
  judge: "Sędzia",
  admin: "Administrator",
};

const fieldClassName = "w-full rounded-lg border border-red-900/60 bg-black px-4 py-3 text-red-50 placeholder:text-red-900/70 outline-none transition focus:border-red-500";
const profileLabelClassName = "ui-profile-label font-medium text-red-400";
const profileValueClassName = "ui-profile-value mt-3 min-h-6 font-semibold text-red-50";
const defaultProfileSettings: ProfileSettings = {
  label_color: "#f87171",
  value_color: "#f9fafb",
  label_font_size: "1.125rem",
  value_font_size: "1.25rem",
  row_gap: "2rem",
};
const profileCssVariableNames: Record<keyof ProfileSettings, string> = {
  label_color: "--ss-profile-label-color",
  value_color: "--ss-profile-value-color",
  label_font_size: "--ss-profile-label-font-size",
  value_font_size: "--ss-profile-value-font-size",
  row_gap: "--ss-profile-row-gap",
};

function RequiredLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-2 block text-sm font-semibold text-red-300">
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

function normalizePhoneInput(value: string) {
  const trimmedValue = value.trim();
  const hasPlusPrefix = trimmedValue.startsWith("+");
  const digits = trimmedValue.replace(/\D/g, "");

  if (digits.length < 7 || digits.length > 15) {
    return "";
  }

  return hasPlusPrefix ? `+${digits}` : digits;
}

export default function ProfilePage() {
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingRoleRequest, setSendingRoleRequest] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [judgeLicenseNumber, setJudgeLicenseNumber] = useState("");
  const [club, setClub] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

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
          });
          setProfile(data);
          setFirstName(data.first_name || "");
          setLastName(data.last_name || "");
          setLicenseNumber(data.license_number || "");
          setJudgeLicenseNumber(data.judge_license_number || "");
          setClub(data.club || "");
          setBirthDate(data.birth_date || "");
          setPhoneNumber(data.phone_number || "");
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

    if (
      !firstName.trim()
      || !lastName.trim()
      || !birthDate.trim()
      || !phoneNumber.trim()
    ) {
      setMessage("Wypełnij wszystkie wymagane pola ❌");
      return;
    }

    const normalizedBirthDate = normalizeBirthDateInput(birthDate);
    const normalizedPhoneNumber = normalizePhoneInput(phoneNumber);

    if (!normalizedBirthDate) {
      setMessage("Podaj poprawną datę urodzenia, np. 1987-03-18 albo 18.03.1987 ❌");
      return;
    }

    if (!normalizedPhoneNumber) {
      setMessage("Podaj poprawny numer telefonu, minimum 7 cyfr ❌");
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
            license_number: licenseNumber.trim(),
            judge_license_number: judgeLicenseNumber.trim(),
            club: club.trim(),
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
      setEditing(false);
      setMessage("Profil zapisany ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setSaving(false);
    }
  }

  async function sendRoleRequest(role: "organizer" | "judge") {
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/login");
      return;
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
          body: JSON.stringify({
            role,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się wysłać prośby ❌");
        return;
      }

      setProfile((currentProfile) =>
        currentProfile
          ? {
              ...currentProfile,
              requested_role: data.requested_role,
            }
          : currentProfile
      );
      setMessage("Prośba została wysłana do administratora ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setSendingRoleRequest(false);
    }
  }

  const isOwnerProfile = true;
  const rolesText = profile?.roles
    .map((role) => profileRoleLabels[role] || role)
    .join(", ");

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-red-400 sm:px-10 lg:px-14">
      {loading ? (
        <p className="text-red-100">
          Ładowanie profilu...
        </p>
      ) : profile ? (
        <div className="mx-auto w-full max-w-[1800px]">
          {!profile.profile_complete && (
            <p className="mb-8 max-w-2xl rounded-lg border border-yellow-500/50 bg-yellow-400/10 px-4 py-3 text-yellow-100">
              Uzupełnij profil, aby móc dołączyć do zawodów.
            </p>
          )}

          {editing ? (
            <section className="max-w-5xl">
              <h1 className="mb-10 text-4xl font-bold text-red-400 sm:text-5xl">
                Profil
              </h1>

              <p className="mb-6 text-sm text-red-200">
                Pola oznaczone <span className="font-bold text-red-500">*</span> są wymagane do zapisania się na zawody.
              </p>

              <div className="grid gap-5 md:grid-cols-2">
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
                  <span className="mb-2 block text-sm font-semibold text-red-300">
                    Klub
                  </span>
                  <input
                    value={club}
                    onChange={(e) => setClub(e.target.value)}
                    placeholder="Podaj klub"
                    className={fieldClassName}
                  />
                </label>

                <label>
                  <span className="mb-2 block text-sm font-semibold text-red-300">
                    Nr. Licencji Zawodniczej
                  </span>
                  <input
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    placeholder="Nr. Licencji Zawodniczej"
                    className={fieldClassName}
                  />
                </label>

                <label>
                  <span className="mb-2 block text-sm font-semibold text-red-300">
                    Nr. Licencji Sędziowskiej
                  </span>
                  <input
                    value={judgeLicenseNumber}
                    onChange={(e) => setJudgeLicenseNumber(e.target.value)}
                    placeholder="Nr. Licencji Sędziowskiej"
                    className={fieldClassName}
                  />
                </label>

                <label>
                  <RequiredLabel>Data urodzenia</RequiredLabel>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    placeholder="Podaj datę urodzenia"
                    className={fieldClassName}
                  />
                </label>

                <label>
                  <RequiredLabel>Nr telefonu</RequiredLabel>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="Podaj nr telefonu"
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
                      label="Klub"
                      value={displayValue(profile.club)}
                    />

                    {isOwnerProfile && (
                      <div className="ui-profile-fields pt-2">
                        <ProfileField
                          label="email"
                          value={profile.email}
                        />

                        <ProfileField
                          label="Nr. Licencji Zawodniczej"
                          value={displayValue(profile.license_number)}
                        />

                        <ProfileField
                          label="Nr. licencji sędziowskiej"
                          value={displayValue(profile.judge_license_number)}
                        />

                        <ProfileField
                          label="Data Urodzenia"
                          value={displayValue(profile.birth_date)}
                        />

                        <ProfileField
                          label="Telefon"
                          value={displayValue(profile.phone_number, "Brak numeru")}
                        />

                        <ProfileField
                          label="Rola w systemie"
                          value={rolesText || "Brak"}
                        />
                      </div>
                    )}
                  </dl>
                </aside>

                <section className="flex min-w-0 flex-col items-center text-center">
                  <AchievementsSection achievements={profile.achievements || []} />
                </section>
              </div>

              {isOwnerProfile && (
                <section className="mt-8 flex flex-col gap-5 border-t border-red-950 pt-8">
                  <div className="flex flex-wrap gap-4">
                    <button
                      onClick={() => setEditing(true)}
                      className="bg-green-900 px-5 py-3 font-semibold text-white transition hover:bg-green-800"
                    >
                      Edytuj profil
                    </button>

                    {!profile.roles.includes("admin") && !profile.requested_role && !profile.roles.includes("organizer") && (
                      <button
                        type="button"
                        onClick={() => sendRoleRequest("organizer")}
                        disabled={sendingRoleRequest}
                        className="bg-blue-700 px-5 py-3 font-semibold text-white transition hover:bg-blue-600 disabled:opacity-50"
                      >
                        Poproś o rolę organizatora
                      </button>
                    )}

                    {!profile.roles.includes("admin") && !profile.requested_role && !profile.roles.includes("judge") && (
                      <button
                        type="button"
                        onClick={() => sendRoleRequest("judge")}
                        disabled={sendingRoleRequest}
                        className="bg-zinc-800 px-5 py-3 font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
                      >
                        Poproś o rolę sędziego
                      </button>
                    )}
                  </div>

                  {!profile.roles.includes("admin") && profile.requested_role && (
                    <p className="text-red-100">
                      Twoja prośba o rolę {roleRequestLabels[profile.requested_role] || profile.requested_role} oczekuje na decyzję administratora.
                    </p>
                  )}

                  {!profile.roles.includes("admin") && !profile.requested_role && profile.roles.includes("organizer") && profile.roles.includes("judge") && (
                    <p className="text-red-100">
                      Masz już komplet uprawnień organizatora i sędziego.
                    </p>
                  )}
                </section>
              )}
            </>
          )}

          {message && (
            <p className="mt-6 font-medium text-red-100">
              {message}
            </p>
          )}
        </div>
      ) : (
        <p className="text-red-100">
          Nie udało się pobrać profilu.
        </p>
      )}
    </main>
  );
}
