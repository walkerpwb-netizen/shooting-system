"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import AchievementsSection from "./AchievementsSection";
import type { Achievement } from "./AchievementsSection";
import { apiUrl } from "@/lib/api";
import { getAccessToken, isPzssClubAccount } from "@/lib/auth";
import { isPremiumActive, PREMIUM_EXPIRED_MESSAGE } from "@/lib/premium";

type AchievementsResponse = {
  achievements?: Achievement[];
  premium_until?: string;
  premium_disabled?: boolean;
};

type ProfileSettings = {
  achievement_icon_size?: string;
  achievement_gap?: string;
};

export default function AchievementsPage() {
  const router = useRouter();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = getAccessToken();
    let active = true;

    if (!token) {
      router.push("/login");
      return;
    }

    if (isPzssClubAccount()) {
      router.replace("/profile");
      return;
    }

    async function loadAchievements() {
      try {
        const [profileResponse, settingsResponse] = await Promise.all([
          fetch(apiUrl("/me"), {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          }),
          fetch(apiUrl("/settings/profile"), {
            cache: "no-store",
          }),
        ]);

        if (!profileResponse.ok) {
          router.push("/login");
          return;
        }

        const profile: AchievementsResponse = await profileResponse.json();
        const settings: ProfileSettings = settingsResponse.ok
          ? await settingsResponse.json()
          : {};

        if (!active) {
          return;
        }

        if (settings.achievement_icon_size) {
          document.documentElement.style.setProperty(
            "--ss-profile-achievement-icon-size",
            settings.achievement_icon_size
          );
        }

        if (settings.achievement_gap) {
          document.documentElement.style.setProperty(
            "--ss-profile-achievement-gap",
            settings.achievement_gap
          );
        }

        if (!isPremiumActive(profile.premium_until, profile.premium_disabled)) {
          setAchievements([]);
          setMessage(PREMIUM_EXPIRED_MESSAGE);
          return;
        }

        setAchievements(profile.achievements || []);
        setMessage("");
      } catch (error) {
        console.error(error);

        if (active) {
          setMessage("Nie udało się pobrać odznaczeń.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadAchievements();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="min-h-screen bg-white px-6 py-8 text-zinc-950 dark:bg-black dark:text-red-400 sm:px-10 lg:px-14">
      <div className="w-full">
        <h1 className="text-4xl font-bold text-red-400 sm:text-5xl">
          Odznaczenia
        </h1>

        <p className="mt-3 text-zinc-600 dark:text-red-100">
          Odznaczenia zdobyte za miejsca w zakończonych zawodach.
        </p>

        {message && (
          <p className="mt-8 border border-red-300 bg-red-50 px-4 py-3 font-medium text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
            {message}
          </p>
        )}

        {loading ? (
          <p className="mt-8 text-zinc-700 dark:text-red-100">
            Ładowanie odznaczeń...
          </p>
        ) : !message ? (
          <AchievementsSection achievements={achievements} />
        ) : null}
      </div>
    </main>
  );
}
