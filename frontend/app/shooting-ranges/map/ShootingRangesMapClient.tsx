"use client";

import dynamic from "next/dynamic";

import type { ShootingRangeMapItem } from "@/app/components/ShootingRangesMap";

const ShootingRangesMap = dynamic(
  () => import("@/app/components/ShootingRangesMap"),
  {
    ssr: false,
    loading: () => (
      <main className="flex min-h-[calc(100dvh-5rem)] flex-col bg-zinc-950 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-3 sm:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-green-400">
              Panel administratora
            </p>
            <h1 className="text-xl font-black sm:text-2xl">
              Mapa strzelnic
            </h1>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center text-sm font-semibold text-gray-300">
          Ładowanie mapy...
        </div>
      </main>
    ),
  }
);

export default function ShootingRangesMapClient({
  ranges,
}: {
  ranges: ShootingRangeMapItem[];
}) {
  return <ShootingRangesMap ranges={ranges} />;
}
