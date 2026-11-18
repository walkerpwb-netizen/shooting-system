import { createPageMetadata, homeTitle, homeDescription } from "@/lib/page-metadata";
import type { Metadata } from "next";

import HomeClient from "./HomeClient";
import JsonLd from "@/components/JsonLd";
import { siteStructuredData } from "@/lib/structured-data";

export const metadata: Metadata = createPageMetadata({
  path: "/",
  title: homeTitle,
  description: homeDescription,
});

export default function HomePage() {
  return <><JsonLd data={siteStructuredData} /><HomeClient /></>;
}
