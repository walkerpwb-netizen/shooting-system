import { createPageMetadata } from "@/lib/page-metadata";
import type { Metadata } from "next";

import HistoricalResultsClient from "./HistoricalResultsClient";

export const metadata: Metadata = createPageMetadata({
  path: "/historical-results",
  title: "Wyniki historyczne zawodów | System Strzelecki",
  description: "Przeglądaj archiwum zakończonych zawodów strzeleckich. Dostęp do starszych wyników wymaga konta z Premium.",
});

export default function HistoricalResultsPage() {
  return <HistoricalResultsClient />;
}
