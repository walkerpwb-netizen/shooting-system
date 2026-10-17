"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { apiUrl } from "@/lib/api";
import { authFetch, getAuthSnapshot, subscribeToAuthChange } from "@/lib/auth";

type Entry = {
  entry_type: string;
  discipline_ids: number[];
};

type Participation = {
  entry: Entry | null;
  status: "guest" | "loading" | "ready" | "error";
  setEntry: (entry: Entry) => void;
};

const ParticipationContext = createContext<Participation | null>(null);

export function CompetitionParticipationProvider({
  competitionId,
  children,
}: {
  competitionId: number;
  children: ReactNode;
}) {
  const authSnapshot = useSyncExternalStore(subscribeToAuthChange, getAuthSnapshot, () => "");
  const [token, , , email] = authSnapshot.split("|");
  const signedIn = Boolean(token && email);
  const requestId = useRef(0);
  const [state, setState] = useState<{
    authSnapshot: string;
    competitionId: number;
    entry: Entry | null;
  } | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let active = true;

    async function loadEntry() {
      const currentRequestId = ++requestId.current;
      let entry: Entry | null = null;
      try {
        const response = await authFetch(apiUrl(`/competitions/${competitionId}/my-entry`), {
          cache: "no-store",
        });
        if (response.ok) entry = await response.json();
      } catch (error) {
        console.error(error);
      }
      if (active && currentRequestId === requestId.current) {
        setState({ authSnapshot, competitionId, entry });
      }
    }

    void loadEntry();
    window.addEventListener("focus", loadEntry);
    return () => {
      active = false;
      window.removeEventListener("focus", loadEntry);
    };
  }, [authSnapshot, competitionId, signedIn]);

  const currentState = signedIn && state?.authSnapshot === authSnapshot
    && state.competitionId === competitionId ? state : null;
  const status = !signedIn ? "guest" : !currentState ? "loading"
    : currentState.entry ? "ready" : "error";

  return (
    <ParticipationContext.Provider value={{
      entry: currentState?.entry ?? null,
      status,
      setEntry: (entry) => {
        requestId.current += 1;
        setState({ authSnapshot, competitionId, entry });
      },
    }}>
      {children}
    </ParticipationContext.Provider>
  );
}

export function useCompetitionParticipation() {
  return useContext(ParticipationContext);
}

export function ParticipationBadge({ joined }: { joined: boolean }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${joined
      ? "bg-green-800 text-white dark:bg-green-700"
      : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-gray-300"}`}>
      {joined ? "Bierzesz udział" : "Nie bierzesz udziału"}
    </span>
  );
}

export function DisciplineParticipationCard({
  disciplineIds,
  children,
  className = "rounded-xl p-4",
}: {
  disciplineIds: number[];
  children: ReactNode;
  className?: string;
}) {
  const participation = useCompetitionParticipation();
  const entry = participation?.entry;
  const joined = entry?.entry_type === "shooter"
    && disciplineIds.length > 0
    && disciplineIds.every((id) => entry.discipline_ids.includes(id));

  return (
    <div className={`${className} ${joined
      ? "border-2 border-green-600 bg-green-50/60 dark:border-green-500 dark:bg-green-950/20"
      : "border border-zinc-200 dark:border-zinc-700"}`}>
      {disciplineIds.length > 0 && participation && participation.status !== "guest" && (
        <div className="mb-2" role="status">
          {participation.status === "ready" ? <ParticipationBadge joined={Boolean(joined)} /> : (
            <span className="text-xs text-zinc-600 dark:text-gray-400">
              {participation.status === "loading"
                ? "Sprawdzanie udziału…"
                : "Nie udało się sprawdzić Twojego udziału. Odśwież stronę."}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
