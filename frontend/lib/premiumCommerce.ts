import { apiUrl } from "@/lib/api";

export type PremiumPackage = {
  monthly_price: string;
  yearly_price: string;
  features: string[];
  available_features: { id: string; label: string }[];
  yearly_included_packages?: ("shooter" | "organizer")[];
};
export type PremiumPrices = Record<"shooter" | "organizer", PremiumPackage>;
export type PremiumCommerce = {
  sales_enabled: boolean;
  verification_status: string;
  sandbox_ready: boolean;
  terms_version: string;
  seller: { name: string; address: string; email: string; phone: string; nip: string; business_type: string; complete: boolean };
};

export async function getPremiumData<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(apiUrl(path), { cache: "no-store", signal: AbortSignal.timeout(8000) });
    return response.ok ? await response.json() as T : null;
  } catch {
    return null;
  }
}

export function premiumPrice(value: string) {
  const price = Number(value);
  return Number.isFinite(price) && price >= 0
    ? new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(price)
    : "Cena chwilowo niedostępna";
}

export const premiumPackageNames = { shooter: "Premium Strzelca", organizer: "Premium Organizatora" };

export function premiumOfferDetails(packageType: "shooter" | "organizer", period: "monthly" | "yearly") {
  // The existing organizer monthly_price field stores a one-off publication price.
  if (packageType === "organizer") {
    return period === "monthly" ? {
      title: "Dodatkowa publikacja",
      summary: "Jedne dodatkowe zawody lub szkolenie",
      priceCaption: "Jednorazowa opłata za jedną dodatkową publikację",
      description: "Opłata za publikację jednych dodatkowych zawodów lub jednego szkolenia, gdy masz już opublikowane aktywne wydarzenie. Każda kolejna dodatkowa publikacja wymaga osobnej opłaty albo rocznego pakietu bez limitu.",
      queryPeriod: "publication",
    } : {
      title: "Roczny pakiet bez limitu",
      summary: "1 rok — publikacje bez limitu",
      priceCaption: "Łączna cena za rok bez limitu publikacji",
      description: "Nielimitowana liczba jednocześnie opublikowanych zawodów i szkoleń przez rok. W cenie otrzymujesz również Premium Strzelca na ten sam okres, bez dodatkowej opłaty.",
      queryPeriod: "yearly",
    };
  }

  return {
    title: period === "monthly" ? "Dostęp na miesiąc" : "Dostęp na rok",
    summary: period === "monthly" ? "1 miesiąc" : "1 rok",
    priceCaption: "Łączna cena za cały okres",
    description: "Jednorazowa opłata za cały okres.",
    queryPeriod: period,
  };
}
