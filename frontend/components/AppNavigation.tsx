"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";

const standaloneQuery = "(display-mode: standalone)";

function subscribeToDisplayMode(onChange: () => void) {
  const media = window.matchMedia(standaloneQuery);
  media.addEventListener("change", onChange);
  window.addEventListener("pageshow", onChange);

  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener("pageshow", onChange);
  };
}

function isStandalone() {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };

  return window.matchMedia(standaloneQuery).matches || iosNavigator.standalone === true;
}

function getServerSnapshot() {
  return false;
}

export default function AppNavigation() {
  const router = useRouter();
  const installed = useSyncExternalStore(
    subscribeToDisplayMode,
    isStandalone,
    getServerSnapshot,
  );

  if (!installed) {
    return null;
  }

  function goBack() {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.replace("/");
    }
  }

  const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition hover:bg-white/10 active:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300";

  return (
    <nav
      aria-label="Nawigacja aplikacji"
      className="app-navigation sticky top-0 z-40 border-b border-emerald-300/20 bg-emerald-950 text-white shadow-md"
    >
      <div className="ui-navbar-inner flex items-center justify-between gap-3">
        <button type="button" onClick={goBack} className={buttonClass}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 19-7-7 7-7M5 12h14" />
          </svg>
          Wstecz
        </button>
        <button type="button" onClick={() => window.location.reload()} className={buttonClass}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 7v5h-5M4 17v-5h5" />
            <path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17" />
          </svg>
          Odśwież
        </button>
      </div>
    </nav>
  );
}
