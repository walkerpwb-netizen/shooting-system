import { createPageMetadata, homeTitle, homeDescription } from "@/lib/page-metadata";
import type { Metadata } from "next";

import HomeClient from "./HomeClient";

export const metadata: Metadata = createPageMetadata({
  path: "/",
  title: homeTitle,
  description: homeDescription,
});

export default function HomePage() {
  return <HomeClient />;
}
