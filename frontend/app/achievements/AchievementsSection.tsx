"use client";

import Image from "next/image";
import Link from "next/link";

export type Achievement = {
  id: number;
  competition_id: number;
  competition_name: string;
  competition_date: string;
  competition_location: string;
  category_id: string;
  category_name: string;
  badge_type: "pistol" | "rifle" | "shotgun" | "overall" | string;
  medal: "gold" | "silver" | "bronze" | string;
  place: number;
  points: string;
  historical_path: string;
  awarded_at: string;
};

type AchievementsSectionProps = {
  achievements: Achievement[];
  emptyMessage?: string;
};

const medalLabels: Record<string, string> = {
  gold: "Złoto",
  silver: "Srebro",
  bronze: "Brąz",
};

const iconTypeNames: Record<string, string> = {
  overall: "trophy",
  pistol: "pistol",
  rifle: "rifle",
  shotgun: "shotgun",
};

function achievementIconSrc({
  type,
  medal,
}: {
  type: string;
  medal: string;
}) {
  const iconType = iconTypeNames[type] || "pistol";
  const medalName = medalLabels[medal] ? medal : "bronze";

  return `/achievement-icons/${iconType}-${medalName}.svg`;
}

export default function AchievementsSection({
  achievements,
  emptyMessage = "Nie masz jeszcze odznaczeń.",
}: AchievementsSectionProps) {
  if (achievements.length === 0) {
    return (
      <p className="mt-8 text-zinc-600 dark:text-red-100">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="ui-achievements-grid mt-8">
      {achievements.map((achievement) => {
        const medalLabel = medalLabels[achievement.medal] || achievement.medal;
        const iconSrc = achievementIconSrc({
          type: achievement.badge_type,
          medal: achievement.medal,
        });

        return (
          <Link
            key={achievement.id}
            href={achievement.historical_path}
            className="flex items-center justify-center transition hover:scale-110"
            title={`${medalLabel}, ${achievement.category_name}, ${achievement.competition_name}`}
            aria-label={`${medalLabel}, ${achievement.place}. miejsce, ${achievement.category_name}, ${achievement.competition_name}`}
          >
            <Image
              src={iconSrc}
              alt=""
              width={64}
              height={64}
              className="ui-achievement-icon"
              aria-hidden="true"
            />
          </Link>
        );
      })}
    </div>
  );
}
