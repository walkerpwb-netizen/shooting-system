"use client";

import Link from "next/link";
import AutopayPaymentInfo from "@/components/AutopayPaymentInfo";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";
import { getValidAccessToken } from "@/lib/auth";
import { buildAuthPath, storeAuthRedirectPath } from "@/lib/authRedirect";
import { PAYMENT_MAINTENANCE_MESSAGE, premiumOfferDetails, premiumPackageNames, premiumPrice, type PremiumCommerce, type PremiumPrices } from "@/lib/premiumCommerce";

type Order = { id: string; package: "shooter" | "organizer"; period: "monthly" | "yearly"; amount: string; status: string; environment: string };

export default function CheckoutClient({ packageType, period, orderId }: { packageType: "shooter" | "organizer"; period: "monthly" | "yearly"; orderId: string }) {
  const router = useRouter();
  const [prices, setPrices] = useState<PremiumPrices | null>(null);
  const [commerce, setCommerce] = useState<PremiumCommerce | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const offer = premiumOfferDetails(packageType, period);
  const nextPath = orderId ? `/premium/zakup?OrderID=${encodeURIComponent(orderId)}` : `/premium/zakup?pakiet=${packageType}&okres=${offer.queryPeriod}`;

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const token = await getValidAccessToken();
        if (!token) {
          storeAuthRedirectPath(nextPath);
          router.replace(buildAuthPath("/login", nextPath));
          return;
        }
        const headers = { Authorization: `Bearer ${token}` };
        const [priceResponse, commerceResponse, profileResponse] = await Promise.all([
          fetch(apiUrl("/settings/premium"), { cache: "no-store" }),
          fetch(apiUrl("/premium/commerce"), { cache: "no-store" }),
          fetch(apiUrl("/me"), { headers, cache: "no-store" }),
        ]);
        if (!priceResponse.ok || !commerceResponse.ok || !profileResponse.ok) throw new Error("Nie udało się pobrać podsumowania. Odśwież stronę.");
        const [priceData, commerceData, profile] = await Promise.all([priceResponse.json(), commerceResponse.json(), profileResponse.json()]);
        if (ignore) return;
        setPrices(priceData);
        setCommerce(commerceData);
        const roles = Array.isArray(profile.roles) ? profile.roles : String(profile.roles || profile.role || "").split(",");
        setIsAdmin(roles.includes("admin"));
        if (orderId) {
          const response = await fetch(apiUrl(`/premium/orders/${encodeURIComponent(orderId)}`), { headers, cache: "no-store" });
          if (!response.ok) throw new Error("Nie znaleziono zamówienia na Twoim koncie.");
          const data = await response.json();
          if (!ignore) setOrder(data);
        }
      } catch (error) {
        if (!ignore) setMessage(error instanceof Error ? error.message : "Błąd połączenia. Spróbuj ponownie.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void load();
    return () => { ignore = true; };
  }, [nextPath, orderId, router]);

  async function startSandbox() {
    if (!commerce || !prices || busy || commerce.payments_temporarily_unavailable !== false) return;
    setBusy(true);
    setMessage("");
    try {
      const token = await getValidAccessToken();
      if (!token) { router.replace(buildAuthPath("/login", nextPath)); return; }
      const response = await fetch(apiUrl("/premium/checkout"), {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ package: packageType, period, expected_price: prices[packageType][`${period}_price`], terms_version: commerce.terms_version, terms_accepted: accepted }),
      });
      const data = await response.json();
      if (response.status === 503 && data.detail === PAYMENT_MAINTENANCE_MESSAGE) {
        setCommerce({ ...commerce, payments_temporarily_unavailable: true, payment_unavailable_message: PAYMENT_MAINTENANCE_MESSAGE });
      }
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Nie udało się przygotować testu.");
      const gateway = new URL(data.gateway_url);
      if (gateway.origin !== "https://testpay.autopay.eu" || data.environment !== "sandbox") throw new Error("Nieprawidłowe środowisko testowe.");
      const form = document.createElement("form");
      form.method = "POST";
      form.action = gateway.href;
      for (const [name, value] of Object.entries(data.fields)) {
        const input = document.createElement("input");
        input.type = "hidden"; input.name = name; input.value = String(value); form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Błąd połączenia z serwerem.");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen px-5 py-12 text-white">
      <div className="mx-auto max-w-2xl rounded-3xl border border-green-700 bg-green-950 p-6 sm:p-10">
        <Link href="/premium" className="text-emerald-200 underline">Wróć do pakietów Premium</Link>
        <h1 className="mt-6 text-3xl font-black">{orderId ? "Status testowego zamówienia" : "Podsumowanie zakupu"}</h1>
        {loading ? <p className="mt-6" role="status">Ładowanie podsumowania…</p> : <>
          {commerce?.payments_temporarily_unavailable !== false && !order ? <p role="status" className="mt-6 rounded-xl border border-amber-300/40 bg-amber-300/10 p-4 leading-7 text-amber-100"><strong>{commerce?.payment_unavailable_message || PAYMENT_MAINTENANCE_MESSAGE}</strong></p> : <p className="mt-6 rounded-xl border border-amber-300/40 bg-amber-300/10 p-4 leading-7 text-amber-100"><strong>Sprzedaż oczekuje na zatwierdzenie Autopay.</strong> Rzeczywiste płatności są wyłączone. Obecnie nie można opłacić ani aktywować pakietu przez zakup.</p>}
          {order ? <div className="mt-6 space-y-3" aria-live="polite">
            <p>{premiumPackageNames[order.package]} — {premiumOfferDetails(order.package, order.period).summary}</p>
            {order.package === "organizer" && order.period === "yearly" && <p>W cenie: Premium Strzelca na ten sam okres.</p>}
            <p>Kwota testowa: <strong>{premiumPrice(order.amount)}</strong></p>
            <p>Numer: <span className="break-all">{order.id}</span></p>
            <p>Status: <strong>{order.status === "paid" ? "Płatność testowa potwierdzona" : order.status === "failed" ? "Testowa próba nieudana" : "Oczekiwanie na potwierdzenie Autopay"}</strong></p>
            <p>Test nie aktywuje rzeczywistego Premium. Status pochodzi z podpisanego powiadomienia Autopay.</p>
            <button onClick={() => window.location.reload()} className="rounded-xl bg-emerald-300 px-5 py-3 font-bold text-green-950">Odśwież status</button>
          </div> : prices && commerce && <>
            <h2 className="mt-6 text-2xl font-bold">{premiumPackageNames[packageType]}</h2>
            <p className="mt-3">{packageType === "organizer" && period === "monthly" ? "Usługa" : "Okres"}: {offer.summary}</p>
            <p className="mt-3 text-2xl font-black">Łącznie: {premiumPrice(prices[packageType][`${period}_price`])}</p>
            <p className="mt-3 leading-7 text-green-100">{offer.description} Bez automatycznego odnawiania. Aktualnie nie składamy zamówienia z obowiązkiem zapłaty.</p>
            <Link href="/premium/regulamin" className="mt-5 block text-emerald-200 underline">Przeczytaj Regulamin Premium i dane sprzedawcy</Link>
            <Link href="/polityka-prywatnosci" className="mt-3 block text-emerald-200 underline">Polityka prywatności</Link>
            {isAdmin && <section className="mt-8 rounded-xl border border-blue-300/40 bg-blue-300/10 p-5">
              <h2 className="text-lg font-bold">Test integracji Autopay — administrator</h2>
              <p className="mt-3 leading-7">Środowisko sandbox, bez pobierania rzeczywistych środków i nadawania Premium.</p>
              {commerce.payments_temporarily_unavailable !== false ? <p className="mt-3 text-blue-100">{commerce.payment_unavailable_message || PAYMENT_MAINTENANCE_MESSAGE}</p> : commerce.sandbox_ready ? <>
                <label className="mt-4 flex items-start gap-3"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 h-5 w-5" /><span>Akceptuję <Link className="underline" href="/premium/regulamin" target="_blank" rel="noopener noreferrer">Regulamin Premium</Link> na potrzeby testu integracji.</span></label>
                <button onClick={() => void startSandbox()} disabled={!accepted || busy} className="mt-5 rounded-xl bg-blue-200 px-5 py-3 font-bold text-blue-950 disabled:opacity-50">{busy ? "Przygotowanie testu…" : "Przejdź do testowego Autopay"}</button>
              </> : <p className="mt-3 text-blue-100">Sandbox oczekuje na konfigurację danych testowych przekazanych przez Autopay.</p>}
            </section>}
          </>}
        </>}
        {message && <p role="alert" className="mt-6 rounded-xl border border-red-300 p-4 text-red-100">{message}</p>}
        <AutopayPaymentInfo />
      </div>
    </main>
  );
}
