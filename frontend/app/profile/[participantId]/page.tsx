"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import AchievementsSection from "../AchievementsSection";
import type { Achievement } from "../AchievementsSection";
import { apiUrl } from "@/lib/api";

type ParticipantProfile = {
  participant_id: number;
  first_name: string;
  last_name: string;
  club: string;
  is_owner: boolean;
  email: string;
  role: string;
  roles: string[];
  is_active: boolean;
  license_number: string;
  judge_license_number: string;
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
  achievement_icon_size: string;
  achievement_gap: string;
};

const profileRoleLabels: Record<string, string> = {
  user: "Strzelec",
  organizer: "Organizator",
  judge: "Sędzia",
  admin: "Administrator",
};

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

export default function ParticipantProfilePage() {
  const params = useParams<{ participantId: string }>();
  const [profile, setProfile] = useState<ParticipantProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const participantId = params.participantId;
    const token = localStorage.getItem("token");
    let ignore = false;

    async function loadProfile() {
      try {
        const [profileResponse, profileSettingsResponse] = await Promise.all([
          fetch(
            apiUrl(`/participants/${participantId}/profile`),
            {
              cache: "no-store",
              headers: token
                ? {
                    Authorization: `Bearer ${token}`,
                  }
                : undefined,
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
  }, [params.participantId]);

  const rolesText = profile?.roles
    .map((role) => profileRoleLabels[role] || role)
    .join(", ");

  return (
    <main className="min-h-screen bg-white px-6 py-8 text-zinc-950 dark:bg-black dark:text-red-400 sm:px-10 lg:px-14">
      {loading ? (
        <p className="text-zinc-700 dark:text-red-100">
          Ładowanie profilu...
        </p>
      ) : profile ? (
        <div className="mx-auto grid min-h-[calc(100vh-12rem)] w-full max-w-[1800px] gap-12 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]">
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

              {profile.is_owner && (
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
      ) : (
        <p className="text-zinc-700 dark:text-red-100">
          Nie udało się pobrać profilu.
        </p>
      )}
    </main>
  );
}
