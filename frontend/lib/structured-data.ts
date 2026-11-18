import { siteUrl } from "@/lib/page-metadata";

const root = `${siteUrl}/`;
const publisher = `${siteUrl}/o-projekcie#wydawca`;

export const siteStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Person", "@id": publisher, name: "Piotr Bronny", url: `${siteUrl}/o-projekcie` },
    { "@type": "WebSite", "@id": `${root}#website`, url: root, name: "System Strzelecki", inLanguage: "pl", publisher: { "@id": publisher } },
    { "@type": "WebApplication", "@id": `${root}#aplikacja`, url: root, name: "System Strzelecki", applicationCategory: "SportsApplication", publisher: { "@id": publisher } },
  ],
};

// The API stores dates as text; only emit an unambiguous, valid calendar date.
function eventDate(value: string): string | undefined {
  const raw = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const polish = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw);
  const normalized = iso ? raw : polish ? `${polish[3]}-${polish[2]}-${polish[1]}` : undefined;
  if (!normalized) return undefined;
  const date = new Date(`${normalized}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === normalized ? normalized : undefined;
}

type EventData = { id: number; name: string; date: string; location: string; description?: string };
export function eventStructuredData(event: EventData, collection: "competitions" | "trainings") {
  const url = `${siteUrl}/${collection}/${event.id}`;
  const startDate = eventDate(event.date);
  return {
    "@context": "https://schema.org", "@type": "Event", "@id": `${url}#wydarzenie`, url,
    name: event.name,
    ...(startDate ? { startDate } : {}),
    ...(event.location.trim() ? { location: event.location } : {}),
    ...(event.description?.trim() ? { description: event.description } : {}),
  };
}
