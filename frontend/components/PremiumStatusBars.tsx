"use client";

import { useEffect, useState } from "react";

export type PremiumStatusProfile = {
  premium_until?: string;
  premium_coverage_until?: string;
  premium_disabled?: boolean;
  premium_organizer_until?: string;
  premium_organizer_coverage_until?: string;
  premium_organizer_disabled?: boolean;
  account_type?: string;
};

function countdown(until: string | undefined, currentTime: number) {
  const expiration = until ? new Date(until).getTime() : 0;
  const minutes = Number.isFinite(expiration) ? Math.max(0, Math.floor((expiration - currentTime) / 60000)) : 0;
  return `${Math.floor(minutes / 1440)} dni ${Math.floor((minutes % 1440) / 60)} godz ${minutes % 60} min`;
}

function PremiumStatusBar({ label, until, currentTime }: { label: string; until?: string; currentTime: number }) {
  return <div aria-label={label} className="border-y border-yellow-500/40 bg-yellow-400/15 px-2 py-1 text-yellow-950 shadow-[0_0_12px_rgba(250,204,21,0.14)] dark:border-yellow-300/40 dark:bg-yellow-400/10 dark:text-yellow-100">
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[0.6875rem] font-bold uppercase leading-none tracking-wide sm:text-xs">
      <span className="text-yellow-700 dark:text-yellow-300">{label}</span>
      <span className="whitespace-nowrap tabular-nums text-yellow-900 dark:text-yellow-100 sm:text-sm">{countdown(until, currentTime)}</span>
    </div>
  </div>;
}

export default function PremiumStatusBars({ profile, pathname }: { profile: PremiumStatusProfile; pathname: string }) {
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    const refresh = () => setCurrentTime(Date.now());
    const interval = window.setInterval(refresh, 1000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, []);

  if (profile.account_type === "pzss_club") return null;
  const organizerPanel = pathname === "/organizer" || pathname.startsWith("/organizer/");

  return <>
    {!profile.premium_disabled && <PremiumStatusBar label="PREMIUM STRZELCA" until={profile.premium_coverage_until ?? profile.premium_until} currentTime={currentTime} />}
    {organizerPanel && !profile.premium_organizer_disabled && <PremiumStatusBar label="PREMIUM ORGANIZATORA" until={profile.premium_organizer_coverage_until ?? profile.premium_organizer_until ?? profile.premium_until} currentTime={currentTime} />}
  </>;
}
