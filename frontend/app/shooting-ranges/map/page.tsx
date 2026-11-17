import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/page-metadata";
import ShootingRangesMapClient from "./ShootingRangesMapClient";

export const metadata: Metadata = createPageMetadata({
  path: "/shooting-ranges/map",
  title: "Mapa strzelnic i sklepów | System Strzelecki",
  description: "Publiczna mapa strzelnic i sklepów w Polsce z wyszukiwarką, danymi kontaktowymi i możliwością zgłaszania aktualizacji po zalogowaniu.",
  robots: { index: true, follow: true },
});

export default function ShootingRangesMapPage() {
  return <ShootingRangesMapClient />;
}
