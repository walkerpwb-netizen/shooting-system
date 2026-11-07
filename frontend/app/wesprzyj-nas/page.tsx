import type { Metadata } from "next";

import SupportClient from "./SupportClient";
import { getPremiumData, type DailyPremiumOffer, type PremiumCommerce } from "@/lib/premiumCommerce";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Wesprzyj nas | System Strzelecki",
  description: "Wesprzyj rozwój Systemu Strzeleckiego, kupując dodatkowe dni Premium Strzelca. Każda złotówka to jeden dzień dostępu.",
  alternates: { canonical: "/wesprzyj-nas" },
};

export default async function SupportPage() {
  const [offer, commerce] = await Promise.all([
    getPremiumData<DailyPremiumOffer>("/premium/support-offer"),
    getPremiumData<PremiumCommerce>("/premium/commerce"),
  ]);
  return <SupportClient offer={offer} commerce={commerce} />;
}
