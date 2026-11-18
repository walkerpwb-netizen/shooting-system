import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { createPageMetadata } from "@/lib/page-metadata";
import { getShootingRanges, websiteUrl } from "@/lib/shooting-ranges";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const getRange = cache(async (id: string) => {
  if (!/^[1-9]\d*$/.test(id) || Number(id) > 2_147_483_647) notFound();
  const range = (await getShootingRanges()).find((item) => item.id === Number(id));
  if (!range) notFound();
  return range;
});

export async function generateMetadata({ params }: Props) {
  const range = await getRange((await params).id);
  return createPageMetadata({
    path: `/shooting-ranges/${range.id}`,
    title: `${range.name} | System Strzelecki`,
    description: `${range.name}${range.address ? ` — ${range.address}` : ""}. Lokalizacja i dostępne dane kontaktowe w katalogu strzelnic.`,
    robots: { index: true, follow: true },
  });
}

export default async function ShootingRangePage({ params }: Props) {
  const range = await getRange((await params).id);
  const website = websiteUrl(range.website);
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${range.latitude}%2C${range.longitude}`;
  return <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
    <p><Link className="underline" href="/shooting-ranges">Katalog strzelnic</Link></p>
    <h1 className="mt-4 text-3xl font-black">{range.name}</h1>
    <section className="mt-8 space-y-3" aria-label="Lokalizacja i kontakt">
      {range.address && <p><strong>Lokalizacja:</strong> {range.address}</p>}
      <p><a className="font-bold underline" href={directions} rel="noopener noreferrer">Wyznacz dojazd do punktu na mapie</a></p>
      {range.phone && <p><strong>Telefon:</strong> {range.phone}</p>}
      {website && <p><a className="font-bold underline" href={website} rel="noopener noreferrer">Strona internetowa strzelnicy</a></p>}
    </section>
    <p className="mt-8 text-sm text-gray-400">Źródło danych: katalog Systemu Strzeleckiego. Data weryfikacji nie jest dostępna.</p>
    <p className="mt-4"><Link className="underline" href="/shooting-ranges/map">Mapa strzelnic i sklepów</Link></p>
  </main>;
}
