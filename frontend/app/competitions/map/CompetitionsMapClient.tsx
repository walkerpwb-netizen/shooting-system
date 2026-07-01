"use client";

import dynamic from "next/dynamic";

import type { CompetitionMapItem } from "@/app/components/CompetitionSearchMap";

const CompetitionSearchMap = dynamic(
  () => import("@/app/components/CompetitionSearchMap"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[70vh] min-h-[520px] items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100 text-sm font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-gray-300">
        Ładowanie mapy...
      </div>
    ),
  }
);

export default function CompetitionsMapClient({
  competitions,
}: {
  competitions: CompetitionMapItem[];
}) {
  return <CompetitionSearchMap competitions={competitions} />;
}
