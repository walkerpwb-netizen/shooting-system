"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import AchievementsSection, { type Achievement } from "@/app/achievements/AchievementsSection";
import { apiUrl } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

type ParticipantProfile = {
  participant_id: number;
  user_id?: number;
  first_name: string;
  last_name: string;
  club: string;
  is_owner: boolean;
  can_view_private?: boolean;
  email: string;
  role: string;
  roles: string[];
  is_active: boolean;
  license_number: string;
  no_license: boolean;
  judge_license_number: string;
  judge_license_valid_until: string;
  voivodeship: string;
  no_club: boolean;
  birth_date: string;
  phone_number: string;
  requested_role: string;
  profile_photo_url: string;
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
  user: "Użytkownik",
  shooter: "Strzelec",
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

function ProfileSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 dark:border-red-950 dark:bg-zinc-950/70">
      <h2 className="mb-5 text-xl font-black text-zinc-950 dark:text-red-300">
        {title}
      </h2>
      <dl className="ui-profile-fields grid gap-5 sm:grid-cols-2">
        {children}
      </dl>
    </section>
  );
}

function displayValue(value: string, fallback = "Brak") {
  return value.trim() || fallback;
}

function profilePhotoSrc(photoUrl: string) {
  return photoUrl ? apiUrl(photoUrl) : "";
}

function profileApiPath(profileId: string) {
  const userIdMatch = profileId.match(/^user-(\d+)$/);

  if (userIdMatch) {
    return `/users/${userIdMatch[1]}/profile`;
  }

  return `/participants/${profileId}/profile`;
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
    const token = getAccessToken();
    let ignore = false;

    async function loadProfile() {
      try {
        const [profileResponse, profileSettingsResponse] = await Promise.all([
          fetch(
            apiUrl(profileApiPath(participantId)),
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
  const showPrivateData = Boolean(profile && (profile.is_owner || profile.can_view_private));
  const hasShooterRole = Boolean(
    profile
    && (profile.profile_complete || profile.roles.includes("shooter"))
  );
  const showJudgeData = Boolean(
    profile
    && (profile.roles.includes("judge") || profile.roles.includes("admin"))
  );
  const fullName = profile
    ? `${displayValue(profile.first_name, "")} ${displayValue(profile.last_name, "")}`.trim()
    : "";

  return (
    <main className="min-h-screen bg-white px-6 py-8 text-zinc-950 dark:bg-black dark:text-red-400 sm:px-10 lg:px-14">
      {loading ? (
        <p className="text-zinc-700 dark:text-red-100">
          Ładowanie profilu...
        </p>
      ) : profile ? (
        <div className="w-full">
          <section className="mb-8 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 dark:border-red-950 dark:bg-zinc-950/70 sm:p-6">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                {profile.profile_photo_url ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={profilePhotoSrc(profile.profile_photo_url)}
                      alt="Zdjęcie profilowe"
                      className="h-32 w-32 border border-zinc-300 object-cover dark:border-red-950"
                    />
                  </>
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center border border-dashed border-zinc-300 bg-white text-xs font-bold uppercase tracking-wide text-zinc-500 dark:border-red-950 dark:bg-black dark:text-red-300/70">
                    Brak zdjęcia
                  </div>
                )}

                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-red-700 dark:text-red-300">
                    Profil zawodnika
                  </p>
                  <h1 className="mt-2 text-4xl font-bold text-zinc-950 dark:text-red-50 sm:text-5xl">
                    {fullName || "Zawodnik"}
                  </h1>
                  <p className="mt-3 text-lg font-semibold text-zinc-700 dark:text-red-100">
                    {profile.no_club ? "Nie posiada klubu" : displayValue(profile.club)}
                  </p>
                </div>
              </div>

              {profile.voivodeship && (
                <div className="rounded-xl border border-red-200 bg-white px-5 py-4 text-left dark:border-red-950 dark:bg-black md:text-right">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                    Województwo
                  </p>
                  <p className="mt-1 text-lg font-black text-zinc-950 dark:text-red-50">
                    {profile.voivodeship}
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="mb-8 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 text-center dark:border-red-950 dark:bg-zinc-950/70 sm:p-6">
            <p className="text-sm font-bold uppercase tracking-wide text-red-700 dark:text-red-300">
              Odznaczenia
            </p>
            <h2 className="mt-2 text-2xl font-black text-zinc-950 dark:text-red-50">
              Zdobyte trofea
            </h2>
            <AchievementsSection
              achievements={profile.achievements || []}
              emptyMessage="Ten zawodnik nie ma jeszcze zdobytych odznaczeń."
            />
          </section>

          <div className="grid min-h-[calc(100vh-20rem)] gap-12 lg:grid-cols-[minmax(0,720px)_minmax(280px,1fr)]">
            <aside className="space-y-5">
              <ProfileSection title="Dane podstawowe">
                <ProfileField
                  label="Imię"
                  value={displayValue(profile.first_name)}
                />
                <ProfileField
                  label="Nazwisko"
                  value={displayValue(profile.last_name)}
                />
                <ProfileField
                  label="Województwo"
                  value={displayValue(profile.voivodeship)}
                />
                {showPrivateData && (
                  <ProfileField
                    label="Data urodzenia"
                    value={displayValue(profile.birth_date)}
                  />
                )}
              </ProfileSection>

              <ProfileSection title="Dane sportowe">
                <ProfileField
                  label="Klub"
                  value={profile.no_club ? "Nie posiada" : displayValue(profile.club)}
                />

                {showPrivateData && (
                  <>
                    <ProfileField
                      label="Licencja zawodnicza"
                      value={profile.no_license ? "Nie posiada" : displayValue(profile.license_number)}
                    />

                    <ProfileField
                      label="Licencja sędziowska"
                      value={showJudgeData ? displayValue(profile.judge_license_number) : "Nie posiada"}
                    />

                    {showJudgeData && (
                      <ProfileField
                        label="Ważność licencji sędziowskiej"
                        value={displayValue(profile.judge_license_valid_until)}
                      />
                    )}
                  </>
                )}
              </ProfileSection>

              {showPrivateData && (
                <>
                  <ProfileSection title="Dane kontaktowe">
                    <ProfileField
                      label="Email"
                      value={profile.email}
                    />

                    <ProfileField
                      label="Telefon"
                      value={displayValue(profile.phone_number, "Brak numeru")}
                    />
                  </ProfileSection>

                  {hasShooterRole && (
                    <ProfileSection title="Pozostałe dane">
                      <ProfileField
                        label="Rola w systemie"
                        value={rolesText || "Brak"}
                      />
                    </ProfileSection>
                  )}
                </>
              )}
            </aside>

            <section className="flex min-w-0 flex-col gap-5">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 dark:border-red-950 dark:bg-zinc-950/70">
                <h2 className="text-xl font-black text-zinc-950 dark:text-red-300">
                  Widoczność danych
                </h2>
                <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-red-100/80">
                  Publiczny profil pokazuje dane sportowe i trofea zawodnika. Dane kontaktowe oraz numery licencji są widoczne tylko dla właściciela profilu, administratora albo uprawnionych osób obsługujących zawody.
                </p>
              </div>
            </section>
          </div>
        </div>
      ) : (
        <p className="text-zinc-700 dark:text-red-100">
          Nie udało się pobrać profilu.
        </p>
      )}
    </main>
  );
}
