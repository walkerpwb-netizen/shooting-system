import type { Metadata } from "next";
import Link from "next/link";
import { apiUrl } from "@/lib/api";
import { createPageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = createPageMetadata({
  path: "/shooting-ranges",
  title: "Katalog strzelnic w Polsce | System Strzelecki",
  description: "Lista strzelnic w Polsce z lokalizacjami i dostępnymi danymi kontaktowymi. Zobacz również mapę strzelnic i sklepów.",
  robots: { index: true, follow: true },
});

type Range = { id: number; name: string; address: string; phone: string; website: string };

async function getRanges(): Promise<Range[]> {
  const response = await fetch(apiUrl("/shooting-ranges"), {
    cache: "no-store", signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Shooting ranges API: HTTP ${response.status}`);
  const data: unknown = await response.json();
  if (!Array.isArray(data) || data.some((range) => !range || typeof range !== "object"
    || !Number.isSafeInteger(range.id) || range.id < 1 || typeof range.name !== "string"
    || !range.name.trim() || [range.address, range.phone, range.website].some((value) => typeof value !== "string"))) {
    throw new Error("Shooting ranges API: invalid directory");
  }
  return (data as Range[]).sort((a, b) => a.name.localeCompare(b.name, "pl") || a.id - b.id);
}

function websiteUrl(value: string): string | undefined {
  if (!value.trim()) return undefined;
  try {
    const url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

export default async function ShootingRangesPage() {
  const ranges = await getRanges();
  const groups = new Map<string, Range[]>();
  for (const range of ranges) {
    const letter = Array.from(range.name.trim().toLocaleUpperCase("pl"))[0] || "#";
    groups.set(letter, [...(groups.get(letter) || []), range]);
  }
  const anchor = (letter: string) => `litera-${letter.codePointAt(0)!.toString(16)}`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black">Katalog strzelnic w Polsce</h1>
      <p className="mt-3">Lista strzelnic i dostępnych danych kontaktowych. Lokalizacja może być podana jako miejscowość lub adres.</p>
      <p className="mt-3"><Link className="font-bold underline" href="/shooting-ranges/map">Zobacz mapę strzelnic i sklepów</Link></p>
      {ranges.length === 0 ? <p className="mt-8">Obecnie w katalogu nie ma strzelnic.</p> : <>
        <p className="mt-6">Liczba strzelnic: {ranges.length}</p>
        <nav aria-label="Strzelnice według pierwszej litery" className="mt-4 flex flex-wrap gap-3">
          {[...groups.keys()].map((letter) => <a className="font-bold underline" key={letter} href={`#${anchor(letter)}`}>{letter}</a>)}
        </nav>
        {[...groups].map(([letter, items]) => <section key={letter} aria-labelledby={anchor(letter)} className="mt-8">
          <h2 id={anchor(letter)} className="text-2xl font-bold">{letter}</h2>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((range) => {
              const website = websiteUrl(range.website);
              return <li id={`strzelnica-${range.id}`} key={range.id} className="rounded-xl border border-zinc-700 p-4">
                <h3 className="font-bold">{range.name}</h3>
                {range.address && <p className="mt-2">{range.address}</p>}
                {range.phone && <p className="mt-2">Telefon: {range.phone}</p>}
                {website && <p className="mt-2"><a className="underline" href={website} rel="noopener noreferrer">Strona internetowa</a></p>}
              </li>;
            })}
          </ul>
        </section>)}
      </>}
    </main>
  );
}
