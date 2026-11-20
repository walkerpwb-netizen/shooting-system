import MetaNews, { getMetaNews } from "@/components/MetaNews";
import type { Metadata } from "next";
import { siteUrl } from "@/lib/page-metadata";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ strona?: string }> };
function pageNumber(value?: string) {
  const number = Number(value || "2");
  return Number.isInteger(number) && number >= 2 && number <= 100000 ? number : 2;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = pageNumber((await searchParams).strona);
  return { title: `Aktualności — strona ${page} | System Strzelecki`,
    description: "Archiwum aktualności Systemu Strzeleckiego.",
    alternates: { canonical: `${siteUrl}/aktualnosci?strona=${page}` } };
}

export default async function NewsArchive({ searchParams }: Props) {
  const page = pageNumber((await searchParams).strona);
  const data = await getMetaNews(page);
  return <main className="min-h-screen bg-[#031c18] px-5 text-white"><div className="mx-auto max-w-6xl"><MetaNews posts={data.posts} hasMore={data.has_more} page={page} /></div></main>;
}
