import Link from "next/link";
import { apiUrl } from "@/lib/api";
import { createPageMetadata } from "@/lib/page-metadata";

export const dynamic = "force-dynamic";
export const metadata = createPageMetadata({
  path: "/organizatorzy",
  title: "Organizatorzy wydarzeń strzeleckich | System Strzelecki",
  description: "Publiczne profile organizatorów wydarzeń strzeleckich w Systemie Strzeleckim.",
});

export default async function OrganizersPage() {
  const response = await fetch(apiUrl("/public-organizers"), { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Organizers API HTTP ${response.status}`);
  const organizers: unknown = await response.json();
  if (!Array.isArray(organizers) || organizers.some((item) => !item || !Number.isInteger(item.id) || item.id < 1 || item.id > 2_147_483_647 || typeof item.name !== "string" || !item.name.trim())) {
    throw new Error("Invalid organizers API response");
  }
  organizers.sort((a, b) => a.name.localeCompare(b.name, "pl") || a.id - b.id);
  return <main className="mx-auto min-h-screen max-w-4xl px-4 py-10 sm:px-6">
    <h1 className="text-3xl font-black">Organizatorzy wydarzeń</h1>
    <p className="mt-4">Publiczne profile organizatorów, którzy zdecydowali się je udostępnić.</p>
    {organizers.length ? <ul className="mt-6 space-y-3">{organizers.map((organizer) => <li key={organizer.id}><Link className="font-bold underline" href={`/organizatorzy/${organizer.id}`}>{organizer.name}</Link></li>)}</ul> : <p className="mt-6">Obecnie nie ma opublikowanych profili organizatorów.</p>}
  </main>;
}
