import type { Metadata } from "next";
import CheckoutClient from "./CheckoutClient";

export const metadata: Metadata = { title: "Zakup Premium | System Strzelecki", robots: { index: false, follow: false } };

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ pakiet?: string; okres?: string; OrderID?: string; ServiceID?: string; Hash?: string; wydarzenie?: string }> }) {
  const query = await searchParams;
  return <CheckoutClient packageType={query.pakiet === "organizer" ? "organizer" : "shooter"} period={query.okres === "yearly" ? "yearly" : "monthly"} orderId={query.OrderID || ""} serviceId={query.ServiceID || ""} returnHash={query.Hash || ""} initialCompetitionId={query.wydarzenie || ""} />;
}
