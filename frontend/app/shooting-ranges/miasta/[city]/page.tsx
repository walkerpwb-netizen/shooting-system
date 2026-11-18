import Breadcrumbs from "@/components/Breadcrumbs";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { createPageMetadata } from "@/lib/page-metadata";
import { cityRanges, rangeCities } from "@/lib/range-cities";
import { getShootingRanges } from "@/lib/shooting-ranges";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ city: string }> };

const getCity = cache(async (slug: string) => {
  const city = rangeCities.find((item) => item.slug === slug);
  if (!city) notFound();
  return { city, ranges: cityRanges(city, await getShootingRanges()) };
});

export async function generateMetadata({ params }: Props) {
  const { city, ranges } = await getCity((await params).city);
  return createPageMetadata({
    path: `/shooting-ranges/miasta/${city.slug}`,
    title: `${city.heading} | System Strzelecki`, description: city.description,
    robots: { index: ranges.length > 0, follow: true },
  });
}

export default async function CityPage({ params }: Props) {
  const { city, ranges } = await getCity((await params).city);
  return <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
    <Breadcrumbs items={[{ label: "Strona główna", path: "/" }, { label: "Katalog strzelnic", path: "/shooting-ranges" }, { label: city.heading, path: `/shooting-ranges/miasta/${city.slug}` }]} />
    <h1 className="mt-4 text-3xl font-black">{city.heading}</h1>
    {ranges.length > 0 ? <>
      <p className="mt-4">{city.introduction}</p>
      <p className="mt-4">Poniższa lista obejmuje wybrane obiekty z katalogu Systemu Strzeleckiego, nie wszystkie strzelnice w mieście. Przed wizytą sprawdź dostępność i zasady u operatora.</p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">{ranges.map((range) => <li key={range.id} className="rounded-xl border border-zinc-700 p-4">
        <h2 className="font-bold"><Link className="underline" href={`/shooting-ranges/${range.id}`}>{range.name}</Link></h2>
        <p className="mt-2">{range.address}</p>
      </li>)}</ul>
    </> : <p className="mt-4">Obecnie nie mamy obiektów przypisanych do tego miasta. Sprawdź pełny katalog lub mapę.</p>}
    <p className="mt-8"><Link className="underline" href="/shooting-ranges/map">Mapa strzelnic i sklepów</Link></p>
  </main>;
}
