import { createPageMetadata, homeTitle, homeDescription } from "@/lib/page-metadata";
import type { Metadata } from "next";

import HomeClient from "./HomeClient";
import JsonLd from "@/components/JsonLd";
import MetaNews, { getMetaNews } from "@/components/MetaNews";
import { siteStructuredData } from "@/lib/structured-data";

export const metadata: Metadata = createPageMetadata({
  path: "/",
  title: homeTitle,
  description: homeDescription,
});

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await getMetaNews();
  return <><JsonLd data={siteStructuredData} /><HomeClient news={<MetaNews posts={data.posts} hasMore={data.has_more} />} /></>;
}
