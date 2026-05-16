"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiUrl } from "@/lib/api";

type CompetitionCardProps = {
  id: number;
  name: string;
  date: string;
  location: string;
  status: string;
  organizerFullName: string;
  sponsors: string;
  participantLimit: number | null;
  shootersCount: number;
  disciplinesCount: number;
};

export default function CompetitionCard({
  id,
  name,
  date,
  location,
  status,
  organizerFullName,
  sponsors,
  participantLimit,
  shootersCount,
  disciplinesCount,
}: CompetitionCardProps) {
  const [entryType, setEntryType] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      return;
    }

    async function loadEntry() {
      try {
        const response = await fetch(
          apiUrl(`/competitions/${id}/my-entry`),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          return;
        }

        const data = await response.json();
        setEntryType(data.entry_type || "");
      } catch (error) {
        console.error(error);
      }
    }

    loadEntry();
  }, [id]);

  const joinedAsShooter = entryType === "shooter";
  const joinedAsJudge = entryType === "judge";
  const freeSlots = participantLimit === null
    ? "Bez limitu"
    : Math.max(participantLimit - shootersCount, 0);
  const statusLabel = status === "started"
    ? "Trwają"
    : status === "completed"
      ? "Zakończone"
      : "";

  return (
    <div className={`rounded-3xl shadow-xl p-6 border-2 ${
      joinedAsJudge
        ? "bg-blue-50 border-blue-600"
        : joinedAsShooter
          ? "bg-green-50 border-green-700"
          : "bg-white border-transparent"
    }`}>
      {(joinedAsShooter || joinedAsJudge) && (
        <p className={`inline-block px-3 py-1 rounded-full text-sm font-bold mb-4 ${
          joinedAsJudge
            ? "bg-blue-700 text-white"
            : "bg-green-800 text-white"
        }`}>
          {joinedAsJudge
            ? "Sędziujesz"
            : "Dołączyłeś"}
        </p>
      )}

      {statusLabel && (
        <p className={`inline-block px-3 py-1 rounded-full text-sm font-bold mb-4 ${
          status === "started"
            ? "bg-orange-600 text-white"
            : "bg-zinc-700 text-white"
        }`}>
          {statusLabel}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 mb-4 text-sm font-bold">
        <div className="rounded-xl bg-zinc-100 px-3 py-2 text-zinc-800">
          Zapisało się = {shootersCount} Strzelców
        </div>

        <div className="rounded-xl bg-green-100 px-3 py-2 text-green-900">
          Wolne miejsca = {freeSlots}
        </div>
      </div>

      <h2 className="text-2xl font-bold text-black mb-4">
        {name}
      </h2>

      <div className="space-y-2 mb-6">

        <p className="text-gray-700">
          📅 {date}
        </p>

        <p className="text-gray-700">
          📍 {location}
        </p>

        {organizerFullName && (
          <p className="text-gray-700">
            🏢 {organizerFullName}
          </p>
        )}

        {sponsors && (
          <p className="text-gray-700">
            🤝 Sponsorzy: {sponsors}
          </p>
        )}

        <p className="text-gray-700">
          🎯 Dyscypliny: {disciplinesCount}
        </p>

      </div>

      <Link
        href={`/competitions/${id}`}
        className="block w-full text-center bg-green-900 hover:bg-green-800 transition text-white py-3 rounded-xl font-semibold"
      >
        Zobacz szczegóły
      </Link>

    </div>
  );
}
