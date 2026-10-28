"use client";

import Link from "next/link";
import AutopayPaymentInfo from "@/components/AutopayPaymentInfo";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";
import { authFetch, getValidAccessToken } from "@/lib/auth";
import { buildAuthPath, storeAuthRedirectPath } from "@/lib/authRedirect";
import { PAYMENT_MAINTENANCE_MESSAGE, premiumOfferDetails, premiumPackageNames, premiumPrice, type PremiumCommerce, type PremiumPrices } from "@/lib/premiumCommerce";

type Order = {
  id: string; package: "shooter" | "organizer"; period: "monthly" | "yearly"; amount: string; status: string; environment: string;
  service_starts_at?: string; service_ends_at?: string; gateway_valid_until?: string; provider_closed_at?: string;
  confirmation_email?: { queued: boolean; sent_at: string | null; error: string | null };
  refunded_at?: string | null; refunds?: { id: string; status: string; amount: string; provider_status: string | null }[];
};
type Quote = { environment: "production"; existing_access_until: string | null; renews_existing_access: boolean; quote_token: string; amount: string; service_starts_at: string; service_ends_at: string | null; expires_at: string; terms_version: string; early_start_text: string };
type Event = { id: number; name: string; event_type: string };
const button = "min-h-11 rounded-xl bg-emerald-300 px-5 py-3 font-bold text-green-950 disabled:cursor-not-allowed disabled:opacity-50";
function date(value?: string | null) { return value ? new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Warsaw" }).format(new Date(value)) : "—"; }

export default function CheckoutClient({ packageType, period, orderId, serviceId = "", returnHash = "", initialCompetitionId = "" }: {
  packageType: "shooter" | "organizer"; period: "monthly" | "yearly"; orderId: string; serviceId?: string; returnHash?: string; initialCompetitionId?: string;
}) {
  const router = useRouter();
  const [prices, setPrices] = useState<PremiumPrices | null>(null);
  const [commerce, setCommerce] = useState<PremiumCommerce | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [early, setEarly] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [eventId, setEventId] = useState(initialCompetitionId);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteRevision, setQuoteRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const offer = premiumOfferDetails(packageType, period);
  const publication = packageType === "organizer" && period === "monthly";
  const params = new URLSearchParams(orderId ? { OrderID: orderId } : { pakiet: packageType, okres: offer.queryPeriod });
  if (serviceId) params.set("ServiceID", serviceId);
  if (returnHash) params.set("Hash", returnHash);
  if (initialCompetitionId) params.set("wydarzenie", initialCompetitionId);
  const nextPath = `/premium/zakup?${params}`;

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const token = await getValidAccessToken();
        if (!token) { storeAuthRedirectPath(nextPath); router.replace(buildAuthPath("/login", nextPath)); return; }
        const [pr, cr, me] = await Promise.all([
          fetch(apiUrl("/settings/premium"), { cache: "no-store" }), fetch(apiUrl("/premium/commerce"), { cache: "no-store" }),
          authFetch(apiUrl("/me"), { cache: "no-store" }),
        ]);
        if (!pr.ok || !cr.ok || !me.ok) throw new Error("Nie udało się pobrać podsumowania. Odśwież stronę.");
        const [priceData, commerceData, profile] = await Promise.all([pr.json(), cr.json(), me.json()]);
        if (ignore) return;
        setPrices(priceData); setCommerce(commerceData);
        const roles = Array.isArray(profile.roles) ? profile.roles : String(profile.roles || profile.role || "").split(",");
        setIsAdmin(roles.includes("admin"));
        if (orderId) {
          if (serviceId || returnHash) {
            const verified = await authFetch(apiUrl(`/premium/orders/${encodeURIComponent(orderId)}/verify-return`), {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ service_id: serviceId, hash: returnHash }),
            });
            const body = await verified.json();
            if (!verified.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Nieprawidłowy podpis powrotu z Autopay.");
          }
          const response = await authFetch(apiUrl(`/premium/orders/${encodeURIComponent(orderId)}`), { cache: "no-store" });
          if (!response.ok) throw new Error("Nie znaleziono zamówienia na Twoim koncie.");
          const body = await response.json(); if (!ignore) setOrder(body);
        } else if (publication) {
          const response = await authFetch(apiUrl("/premium/publication-events"), { cache: "no-store" });
          if (!response.ok) throw new Error("Nie udało się pobrać Twoich szkiców wydarzeń.");
          const body = await response.json(); if (!ignore) setEvents(body);
        }
      } catch (error) { if (!ignore) setMessage(error instanceof Error ? error.message : "Błąd połączenia z serwerem."); }
      finally { if (!ignore) setLoading(false); }
    }
    void load(); return () => { ignore = true; };
  }, [nextPath, orderId, serviceId, returnHash, publication, router]);

  useEffect(() => {
    if (!prices || !commerce || orderId || (publication && !eventId)) return;
    const controller = new AbortController();
    let ignore = false;
    async function prepare() {
      setQuoting(true); setQuote(null); setAccepted(false); setMessage("");
      try {
        const response = await authFetch(apiUrl("/premium/quote"), { method: "POST", signal: controller.signal,
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ package: packageType, period,
            expected_price: prices![packageType][`${period}_price`], terms_version: commerce!.terms_version, terms_accepted: false,
            early_start_requested: early, competition_id: publication ? Number(eventId) : null }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Nie udało się przygotować oferty.");
        if (!ignore) setQuote(body);
      } catch (error) { if (!ignore) setMessage(error instanceof Error ? error.message : "Błąd przygotowania oferty."); }
      finally { if (!ignore) setQuoting(false); }
    }
    void prepare(); return () => { ignore = true; controller.abort(); };
  }, [prices, commerce, orderId, publication, eventId, packageType, period, early, quoteRevision]);

  useEffect(() => {
    if (!order || order.status === "paid" || order.status === "cancelled") return;
    const id = order.id;
    const interval = window.setInterval(async () => {
      try { const r = await authFetch(apiUrl(`/premium/orders/${encodeURIComponent(id)}`), { cache: "no-store" }); if (r.ok) setOrder(await r.json()); } catch { /* Manual refresh remains available. */ }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [order]);

  async function startCheckout() {
    if (!commerce || !quote || !accepted || busy || commerce.payments_temporarily_unavailable !== false) return;
    setBusy(true); setMessage("");
    try {
      const response = await authFetch(apiUrl("/premium/checkout"), { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package: packageType, period, expected_price: quote.amount, terms_version: quote.terms_version,
          terms_accepted: accepted, early_start_requested: early, competition_id: publication ? Number(eventId) : null,
          quote_token: quote.quote_token }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 503 && body.detail === PAYMENT_MAINTENANCE_MESSAGE) setCommerce({ ...commerce, payments_temporarily_unavailable: true });
        throw new Error(typeof body.detail === "string" ? body.detail : "Nie udało się przygotować zamówienia.");
      }
      const gateway = new URL(body.gateway_url);
      const expectedGateway = "https://pay.autopay.eu/payment";
      if (body.environment !== "production" || quote.environment !== "production" || gateway.href !== expectedGateway) throw new Error("Nieprawidłowe środowisko płatności.");
      const form = document.createElement("form"); form.method = "POST"; form.action = gateway.href;
      for (const [name, value] of Object.entries(body.fields)) { const input = document.createElement("input"); input.type = "hidden"; input.name = name; input.value = String(value); form.appendChild(input); }
      document.body.appendChild(form); form.submit();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Błąd połączenia z serwerem."); setBusy(false); }
  }

  async function orderAction(action: "check" | "cancel" | "resend-confirmation" | "refresh" | "refund" | "refund-check") {
    if (!order || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await authFetch(apiUrl(`/premium/orders/${encodeURIComponent(order.id)}${action === "refresh" ? "" : `/${action}`}`), { method: action === "refresh" ? "GET" : "POST", cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Nie udało się wykonać operacji.");
      if (action === "resend-confirmation") setMessage(body.message); else setOrder(body);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Błąd połączenia z serwerem."); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen px-5 py-12 text-white"><div className="mx-auto max-w-2xl space-y-6 rounded-3xl border border-green-700 bg-green-950 p-6 sm:p-10">
    <Link href="/premium" className="text-emerald-200 underline">Wróć do pakietów Premium</Link>
    <h1 className="text-3xl font-black">{orderId ? "Status zamówienia" : "Podsumowanie zakupu"}</h1>
    {loading ? <p role="status">Ładowanie podsumowania…</p> : <>
      <p className="rounded-xl border border-amber-300/40 bg-amber-300/10 p-4 leading-7 text-amber-100" role="status">{commerce?.payments_temporarily_unavailable !== false && !order ? commerce?.payment_unavailable_message || PAYMENT_MAINTENANCE_MESSAGE : "Płatność obsługuje Autopay. Premium zostanie przyznane po potwierdzeniu wpłaty, zgodnie z wybranym okresem i datą rozpoczęcia."}</p>
      {order ? <section className="space-y-4" aria-live="polite">
        <h2 className="text-2xl font-bold">{premiumPackageNames[order.package]} — {premiumOfferDetails(order.package, order.period).summary}</h2>
        <p>Kwota zakupu: <strong>{premiumPrice(order.amount)}</strong></p>
        <p className="break-all">Numer: {order.id}</p>
        <p>Status: <strong>{order.status === "paid" ? "Płatność potwierdzona" : order.status === "cancelled" ? "Transakcja anulowana przez Autopay" : order.status === "failed" ? "Próba nieudana — możliwe późniejsze potwierdzenie" : "Oczekiwanie na potwierdzenie Autopay"}</strong></p>
        <p>Planowany początek: {date(order.service_starts_at)}<br />Planowany koniec: {order.service_ends_at ? date(order.service_ends_at) : "jednorazowa publikacja"}<br />Ważność płatności: {date(order.gateway_valid_until)}</p>
        {order.confirmation_email?.queued && <p>Potwierdzenie e-mail: {order.confirmation_email.sent_at ? `wysłane ${date(order.confirmation_email.sent_at)}` : order.confirmation_email.error || "oczekuje na wysyłkę"}</p>}
        {!!order.refunds?.length && <div className="space-y-2 rounded-xl border border-blue-300/50 p-4"><h3 className="font-bold">Zwroty</h3>{order.refunds.map((refund) => <p key={refund.id}>{premiumPrice(refund.amount)} — {refund.status === "done" ? "wykonany przez operatora" : refund.status === "failed" ? "niezrealizowany" : "oczekuje na realizację"}{refund.provider_status ? ` (${refund.provider_status})` : ""}</p>)}<p className="text-sm">Przyjęcie zlecenia zwrotu nie oznacza jeszcze jego wykonania. Potwierdza je status operatora.</p></div>}
        {isAdmin && order.status === "paid" && <div className="flex flex-wrap gap-3"><button className={button} disabled={busy || !!order.refunded_at} onClick={() => void orderAction("refund")}>Zleć lub ponów zwrot</button>{!!order.refunds?.length && <button className={button} disabled={busy} onClick={() => void orderAction("refund-check")}>Sprawdź wykonanie zwrotu</button>}</div>}
        <div className="flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={() => void orderAction("refresh")}>Odśwież status</button><button className={button} disabled={busy} onClick={() => void orderAction("check")}>Sprawdź w Autopay</button>{order.status !== "paid" && !order.provider_closed_at && <button className={button} disabled={busy} onClick={() => void orderAction("cancel")}>Anuluj nieopłaconą transakcję</button>}{order.confirmation_email?.queued && !order.confirmation_email.sent_at && <button className={button} disabled={busy} onClick={() => void orderAction("resend-confirmation")}>Ponów wysyłkę potwierdzenia</button>}</div>
      </section> : !orderId && prices && commerce && <>
        <h2 className="text-2xl font-bold">{premiumPackageNames[packageType]}</h2><p>{offer.summary}</p><p className="text-2xl font-black">Łącznie: {premiumPrice(prices[packageType][`${period}_price`])}</p>
        <p className="leading-7 text-green-100">{offer.description} Bez automatycznego odnawiania.</p>
        {publication && <label className="block space-y-2"><span className="block font-bold">Wydarzenie do dodatkowej publikacji</span><select value={eventId} onChange={(event) => { setEventId(event.target.value); setQuote(null); }} className="min-h-11 w-full rounded-xl border border-green-400 bg-green-950 p-3"><option value="">Wybierz swój szkic</option>{events.map((event) => <option key={event.id} value={event.id}>{event.name} — {event.event_type === "training" ? "szkolenie" : "zawody"}</option>)}</select>{events.length === 0 && <span className="block text-sm">Najpierw utwórz szkic wydarzenia w panelu organizatora.</span>}</label>}
        <label className="flex items-start gap-3"><input type="checkbox" checked={early} onChange={(event) => setEarly(event.target.checked)} className="mt-1 h-5 w-5 shrink-0" /><span>Żądam rozpoczęcia usługi przed upływem 14 dni na odstąpienie. W razie odstąpienia po rozpoczęciu zapłacę proporcjonalnie za wykonaną usługę. Samo rozpoczęcie nie pozbawia prawa odstąpienia.</span></label>
        <p className="text-sm text-green-100">Bez tego żądania nowa usługa rozpocznie się po upływie 14 dni od potwierdzenia płatności. Jeśli masz już Premium, zakup przedłuży obecny dostęp bez jego skracania.</p>
        {quoting ? <p role="status">Przygotowanie aktualnej oferty…</p> : quote && <div className="space-y-2 text-green-100" aria-label="Okres kupowanego dostępu">
          {quote.renews_existing_access && <p><strong>Obecne Premium zachowujesz do {date(quote.existing_access_until)}.</strong> Możesz kupić przedłużenie już teraz.</p>}
          <p>{quote.renews_existing_access ? "Kupowane przedłużenie" : publication ? "Realizacja publikacji" : "Kupowany dostęp"}: od <strong>{date(quote.service_starts_at)}</strong>{quote.service_ends_at ? <> do <strong>{date(quote.service_ends_at)}</strong></> : " — jedna dodatkowa publikacja"}.</p>
          <p className="text-sm">Daty przy opłaceniu teraz. Późniejsze potwierdzenie wpłaty może je przesunąć; otrzymasz je w potwierdzeniu. Oferta ważna do {date(quote.expires_at)}.</p>
        </div>}
        <button className="text-emerald-200 underline" disabled={quoting} onClick={() => setQuoteRevision((value) => value + 1)}>Odśwież ofertę</button>
        <Link href="/premium/regulamin" target="_blank" rel="noopener noreferrer" className="block text-emerald-200 underline">Regulamin Premium i dane sprzedawcy</Link><Link href="/polityka-prywatnosci" className="block text-emerald-200 underline">Polityka prywatności</Link>
        {commerce.sales_enabled && commerce.payments_temporarily_unavailable === false ? <section className="space-y-5 rounded-xl border border-blue-300/50 bg-blue-300/10 p-5"><h3 className="font-bold">Zakup Premium</h3>
          <label className="flex items-start gap-3"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 h-5 w-5 shrink-0" /><span>Akceptuję Regulamin Premium w wersji {quote?.terms_version || commerce.terms_version}.</span></label>
          <button className={button} disabled={!accepted || !quote || quoting || busy} onClick={() => void startCheckout()}>{busy ? "Przygotowanie płatności…" : `Kupuję i płacę — ${premiumPrice(quote?.amount || prices[packageType][`${period}_price`])}`}</button>
        </section> : <p className="rounded-xl border border-blue-300/30 p-4 text-blue-100">{commerce.payments_temporarily_unavailable !== false ? commerce.payment_unavailable_message || PAYMENT_MAINTENANCE_MESSAGE : "Płatności są chwilowo niedostępne. Spróbuj ponownie później."}</p>}
      </>}
    </>}
    {message && <p role="alert" className="rounded-xl border border-red-300 p-4 text-red-100">{message}</p>}
    <AutopayPaymentInfo />
  </div></main>;
}
