import type { Metadata } from "next";

import HistoricalResultsClient from "./HistoricalResultsClient";

export const metadata: Metadata = {
  title: "Wyniki historyczne zawodów | System Strzelecki",
  description: "Przeglądaj archiwum zakończonych zawodów strzeleckich. Dostęp do starszych wyników wymaga konta z Premium.",
  alternates: { canonical: "/historical-results" },
};

export default function HistoricalResultsPage() {
  return <HistoricalResultsClient />;
}
