"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

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
};

const profileRoleLabels: Record<string, string> = {
  user: "Strzelec",
  organizer: "Organizator",
  judge: "Sędzia",
  admin: "Administrator",
};

const profileLabelClassName = "text-lg font-medium text-red-400";
const profileValueClassName = "mt-3 min-h-6 text-xl font-semibold text-red-50";

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
        const response = await fetch(
          apiUrl(`/participants/${participantId}/profile`),
          {
            cache: "no-store",
            headers: token
              ? {
                  Authorization: `Bearer ${token}`,
                }
              : undefined,
          }
        );

        if (!response.ok) {
          return;
        }

        const data = await response.json();

        if (!ignore) {
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
    <main className="min-h-screen bg-black px-6 py-8 text-red-400 sm:px-10 lg:px-14">
      {loading ? (
        <p className="text-red-100">
          Ładowanie profilu...
        </p>
      ) : profile ? (
        <div className="mx-auto grid min-h-[calc(100vh-12rem)] w-full max-w-[1800px] gap-12 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="lg:pt-24">
            <dl className="space-y-8">
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
                <div className="space-y-8 pt-2">
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
            <h1 className="text-2xl font-medium text-red-400">
              Profil
            </h1>

            <div className="mt-14 w-full max-w-5xl">
              <h2 className="text-2xl font-medium text-red-400">
                Osiągnięcia
              </h2>

              <div className="min-h-[360px]" aria-label="Osiągnięcia" />
            </div>
          </section>
        </div>
      ) : (
        <p className="text-red-100">
          Nie udało się pobrać profilu.
        </p>
      )}
    </main>
  );
}
