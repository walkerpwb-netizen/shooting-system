"use client";

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
};

const medalColors: Record<string, string> = {
  gold: "#f8c84a",
  silver: "#d9e1ea",
  bronze: "#c47a3c",
};

const medalLabels: Record<string, string> = {
  gold: "Złoto",
  silver: "Srebro",
  bronze: "Brąz",
};

function BadgeIcon({
  type,
  color,
}: {
  type: string;
  color: string;
}) {
  if (type === "overall") {
    return (
      <svg viewBox="0 0 96 96" className="ui-achievement-icon" aria-hidden="true">
        <path fill={color} d="M30 16h36v14c0 18-7 30-18 34C37 60 30 48 30 30V16Z" />
        <path fill={color} d="M25 22H12v9c0 14 8 24 21 27l3-9c-9-2-14-8-14-18h8l-5-9Z" opacity="0.82" />
        <path fill={color} d="M71 22h13v9c0 14-8 24-21 27l-3-9c9-2 14-8 14-18h-8l5-9Z" opacity="0.82" />
        <path fill={color} d="M43 62h10v14h15v9H28v-9h15V62Z" />
        <path fill="#ffffff" d="M38 24h20v6H38V24Z" opacity="0.35" />
      </svg>
    );
  }

  if (type === "rifle") {
    return (
      <svg viewBox="0 0 128 64" className="ui-achievement-icon" aria-hidden="true">
        <path fill={color} d="M12 26h68l9-8h17v8h10v8H65l-8 8H39l-5 11H22l7-19H12v-8Z" />
        <path fill={color} d="M84 35h12l5 16H90l-6-16Z" opacity="0.88" />
        <path fill="#ffffff" d="M25 28h50v3H25v-3Z" opacity="0.28" />
      </svg>
    );
  }

  if (type === "shotgun") {
    return (
      <svg viewBox="0 0 128 64" className="ui-achievement-icon" aria-hidden="true">
        <path fill={color} d="M10 27h77l14-9h15v8h-10l-13 9H63l-9 9H38l-7 10H19l11-19H10v-8Z" />
        <path fill={color} d="M26 21h58v4H26v-4Z" opacity="0.72" />
        <path fill="#ffffff" d="M22 29h60v3H22v-3Z" opacity="0.28" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 96 64" className="ui-achievement-icon" aria-hidden="true">
      <path fill={color} d="M9 28h44l9-8h19v9H67l-7 8H42l-4 12H25l4-12H9v-9Z" />
      <path fill={color} d="M43 37h16l5 14H50l-7-14Z" opacity="0.88" />
      <path fill="#ffffff" d="M18 30h32v3H18v-3Z" opacity="0.3" />
    </svg>
  );
}

export default function AchievementsSection({
  achievements,
}: AchievementsSectionProps) {
  return (
    <div className="w-full max-w-5xl">
      <h2 className="text-2xl font-medium text-red-400">
        Odznaczenia
      </h2>

      {achievements.length === 0 ? (
        <div className="min-h-[260px]" aria-label="Brak odznaczeń" />
      ) : (
        <div className="ui-achievements-grid mt-8">
          {achievements.map((achievement) => {
            const color = medalColors[achievement.medal] || medalColors.bronze;
            const medalLabel = medalLabels[achievement.medal] || achievement.medal;

            return (
              <Link
                key={achievement.id}
                href={achievement.historical_path}
                className="flex items-center justify-center transition hover:scale-110"
                title={`${medalLabel}, ${achievement.category_name}, ${achievement.competition_name}`}
                aria-label={`${medalLabel}, ${achievement.place}. miejsce, ${achievement.category_name}, ${achievement.competition_name}`}
              >
                <BadgeIcon
                  type={achievement.badge_type}
                  color={color}
                />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
