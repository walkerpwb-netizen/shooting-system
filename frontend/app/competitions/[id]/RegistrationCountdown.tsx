"use client";

import { useEffect, useMemo, useState } from "react";

type RegistrationCountdownProps = {
  registrationDeadline: string | null | undefined;
  participantsCount: number;
  minParticipants: number | null | undefined;
};

function countdownParts(remainingMs: number) {
  const safeRemainingMs = Math.max(remainingMs, 0);
  const totalMinutes = Math.floor(safeRemainingMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  return { days, hours, minutes };
}

function unitLabel(value: number, singular: string, few: string, many: string) {
  if (value === 1) {
    return singular;
  }

  if (value % 10 >= 2 && value % 10 <= 4 && (value % 100 < 12 || value % 100 > 14)) {
    return few;
  }

  return many;
}

function formatDeadline(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

export default function RegistrationCountdown({
  registrationDeadline,
  participantsCount,
  minParticipants,
}: RegistrationCountdownProps) {
  const deadlineTime = useMemo(() => {
    if (!registrationDeadline) {
      return null;
    }

    const timestamp = new Date(registrationDeadline).getTime();

    return Number.isNaN(timestamp) ? null : timestamp;
  }, [registrationDeadline]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadlineTime) {
      return undefined;
    }

    const intervalId = window.setInterval(() => setNow(Date.now()), 30000);

    return () => window.clearInterval(intervalId);
  }, [deadlineTime]);

  if (!deadlineTime) {
    return null;
  }

  const remainingMs = deadlineTime - now;
  const registrationClosed = remainingMs <= 0;
  const { days, hours, minutes } = countdownParts(remainingMs);
  const deadlineLabel = formatDeadline(registrationDeadline || "");
  const missingParticipants = minParticipants
    ? Math.max(minParticipants - participantsCount, 0)
    : 0;

  return (
    <section className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-50 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Zapisy do zawodów
          </p>
          <h2 className="mt-2 text-3xl font-black sm:text-5xl">
            {registrationClosed ? "Zapisy zakończone" : "Do końca zapisów"}
          </h2>
          <p className="mt-2 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
            Termin: {deadlineLabel}
          </p>
        </div>

        {!registrationClosed && (
          <div
            className="grid grid-cols-3 gap-2 text-center sm:gap-3"
            aria-live="polite"
          >
            {[
              [days, unitLabel(days, "dzień", "dni", "dni")],
              [hours, unitLabel(hours, "godzina", "godziny", "godzin")],
              [minutes, unitLabel(minutes, "minuta", "minuty", "minut")],
            ].map(([value, label]) => (
              <div
                key={label}
                className="min-w-20 rounded-xl border border-emerald-200 bg-white px-3 py-4 shadow-sm dark:border-emerald-800 dark:bg-zinc-950"
              >
                <span className="block text-4xl font-black tabular-nums sm:text-5xl">
                  {value}
                </span>
                <span className="mt-1 block text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                  {label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {minParticipants ? (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-white px-4 py-3 font-bold dark:border-emerald-800 dark:bg-zinc-950">
          {missingParticipants > 0
            ? `Brakuje jeszcze ${missingParticipants} zawodników, aby zawody mogły się odbyć.`
            : "Minimalna liczba zawodników jest już spełniona."}
          <span className="ml-2 text-emerald-700 dark:text-emerald-300">
            Zapisani: {participantsCount}/{minParticipants}
          </span>
        </div>
      ) : null}
    </section>
  );
}
