import { createPageMetadata } from "@/lib/page-metadata";
import type { Metadata } from "next";

import HistoricalResultsClient from "./HistoricalResultsClient";
import { apiUrl } from "@/lib/api";
import type { ResultCompetitionListItem } from "@/app/components/ResultCompetitionList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createPageMetadata({
  path: "/historical-results",
  title: "Wyniki historyczne zawodów | System Strzelecki",
  description: "Przeglądaj archiwum zakończonych zawodów strzeleckich. Dostęp do starszych wyników wymaga konta z Premium.",
});

export default async function HistoricalResultsPage() {
  const response = await fetch(apiUrl("/historical-results/competitions"), {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Historical results API HTTP ${response.status}`);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error("Invalid historical results response");

  // Only send the fields already displayed publicly. In particular, do not
  // serialize descriptions or participant details into the page payload.
  const competitions: ResultCompetitionListItem[] = data.map((item) => {
    if (!item || typeof item !== "object" || !Number.isInteger(item.id) || item.id <= 0
      || typeof item.name !== "string" || typeof item.date !== "string"
      || typeof item.location !== "string" || !Number.isInteger(item.shooters_count)
      || item.shooters_count < 0 || item.status !== "completed"
      || typeof item.premium_locked !== "boolean") {
      throw new Error("Invalid historical competition summary");
    }
    return {
      id: item.id, name: item.name, date: item.date, location: item.location,
      organizer_full_name: typeof item.organizer_full_name === "string" ? item.organizer_full_name : "",
      organizer_logo: "", sponsor_logo: "", shooters_count: item.shooters_count,
      status: item.status, completed_at: typeof item.completed_at === "string" ? item.completed_at : "",
      premium_locked: item.premium_locked,
    };
  });
  return <HistoricalResultsClient initialCompetitions={competitions} />;
}
