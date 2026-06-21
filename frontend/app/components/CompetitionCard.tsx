"use client";

import Image from "next/image";
import Link from "next/link";

import ShareCompetitionButton from "./ShareCompetitionButton";

type CompetitionCardProps = {
  id: number;
  name: string;
  date: string;
  location: string;
  status: string;
  organizerFullName: string;
  sponsors: string;
  organizerLogo: string;
  participantLimit: number | null;
  pzssLicenseCalendar: boolean;
  shootersCount: number;
  disciplinesCount: number;
  entryType?: string;
};

export default function CompetitionCard({
  id,
  name,
  date,
  location,
  status,
  organizerFullName,
  sponsors,
  organizerLogo,
  participantLimit,
  pzssLicenseCalendar,
  shootersCount,
  disciplinesCount,
  entryType = "",
}: CompetitionCardProps) {
  const joinedAsShooter = entryType === "shooter";
  const joinedAsJudge = entryType === "judge";
  const freeSlots = participantLimit === null
    ? "Bez limitu"
    : Math.max(participantLimit - shootersCount, 0);
  const statusLabel = status === "published"
    ? "Nadchodzące"
    : status === "started"
    ? "Trwają"
    : status === "completed"
      ? "Zakończone"
      : "";

  return (
    <div className={`relative isolate grid gap-4 overflow-hidden border-b border-zinc-200 px-4 py-4 text-sm last:border-b-0 dark:border-zinc-800 lg:grid-cols-[1.5fr_0.7fr_1fr_1.1fr] lg:items-center ${
      joinedAsJudge
        ? "bg-blue-50 dark:bg-blue-950/30"
        : joinedAsShooter
          ? "bg-green-50 dark:bg-green-950/30"
          : "bg-white dark:bg-zinc-900"
    }`}>
      {organizerLogo && (
        <Image
          src={organizerLogo}
          alt=""
          fill
          sizes="100vw"
          className="pointer-events-none z-0 object-cover object-center opacity-[0.07] saturate-75 dark:opacity-[0.12] lg:object-contain"
          unoptimized
        />
      )}

      <div className="relative z-10 min-w-0">
        <div className="mb-2 flex flex-wrap gap-2">
          {(joinedAsShooter || joinedAsJudge) && (
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${
              joinedAsJudge
                ? "bg-blue-700 text-white"
                : "bg-green-800 text-white"
            }`}>
              {joinedAsJudge
                ? "Sędziujesz"
                : "Dołączyłeś"}
            </span>
          )}

          {statusLabel && (
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${
              status === "started"
                ? "bg-orange-600 text-white"
                : status === "completed"
                  ? "bg-zinc-700 text-white"
                  : "bg-green-900 text-green-100"
            }`}>
              {statusLabel}
            </span>
          )}

          {pzssLicenseCalendar && (
            <span className="rounded-full bg-red-700 px-3 py-1 text-xs font-bold text-white">
              Zawody z kalendarza PZSS do przedłużenia licencji
            </span>
          )}
        </div>

        <p className="truncate text-base font-bold text-zinc-950 dark:text-white">
          {name}
        </p>

        <p className="mt-1 text-xs text-zinc-600 dark:text-gray-400">
          Strzelcy: {shootersCount} • Wolne miejsca: {freeSlots} • Dyscypliny: {disciplinesCount}
        </p>

        {(organizerFullName || sponsors) && (
          <p className="mt-1 truncate text-xs text-zinc-500 dark:text-gray-500">
            {[organizerFullName, sponsors ? `Sponsorzy: ${sponsors}` : ""].filter(Boolean).join(" • ")}
          </p>
        )}
      </div>

      <p className="relative z-10 text-zinc-700 dark:text-gray-300">
        {date}
      </p>

      <p className="relative z-10 text-zinc-700 dark:text-gray-300">
        {location}
      </p>

      <div className="relative z-10 flex flex-wrap gap-2 lg:justify-end">
        {status === "published" && (
          <ShareCompetitionButton competitionId={id} />
        )}

        <Link
          href={`/competitions/${id}`}
          className="ui-button bg-green-800 hover:bg-green-700 transition text-white px-4 py-2 rounded-xl font-semibold"
        >
          Szczegóły
        </Link>
      </div>
    </div>
  );
}
