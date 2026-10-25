import { apiUrl } from "@/lib/api";

export type PremiumPackage = {
  monthly_price: string;
  yearly_price: string;
  features: string[];
  available_features: { id: string; label: string }[];
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
