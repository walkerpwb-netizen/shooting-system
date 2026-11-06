import Link from "next/link";
import { premiumPackageNames, premiumPrice } from "@/lib/premiumCommerce";

export type PremiumOrder = {
  id: string; package: "shooter" | "organizer"; period: "monthly" | "yearly"; amount: string; status: string; environment: string;
  service_starts_at?: string; service_ends_at?: string; gateway_valid_until?: string; provider_closed_at?: string;
  entitlements_applied_at?: string | null; renews_existing_access?: boolean; existing_access_until?: string | null;
  included_packages?: string[]; competition_id?: number | null;
  confirmation_email?: { queued: boolean; sent_at: string | null; error: string | null };
  refunded_at?: string | null; refunds?: { id: string; status: string; amount: string; provider_status: string | null }[];
};

function date(value?: string | null) {
  return value ? new Intl.DateTimeFormat("pl-PL", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Warsaw" }).format(new Date(value)) : "—";
}

export function paymentResultTitle(order: PremiumOrder) {
  if (order.refunded_at) return "Płatność została zwrócona";
  if (order.status === "paid") return order.package === "organizer" && order.period === "monthly" ? "Dziękujemy za zakup publikacji!" : "Dziękujemy za zakup Premium!";
  if (order.status === "cancelled") return "Płatność została anulowana";
  if (order.status === "failed") return "Płatność nie została potwierdzona";
  return "Czekamy na potwierdzenie wpłaty";
}

export default function PaymentResult({ order }: { order: PremiumOrder }) {
  const paid = order.status === "paid" && !order.refunded_at;
  const publication = order.package === "organizer" && order.period === "monthly";
  const pending = !order.refunded_at && !["paid", "cancelled", "failed"].includes(order.status);
  const panel = paid ? "border-emerald-400/60 bg-emerald-400/10" : order.refunded_at || order.status === "cancelled" ? "border-zinc-400/50 bg-zinc-400/10" : "border-amber-300/50 bg-amber-300/10";
  return <section aria-label="Wynik płatności" aria-live="polite" className={`space-y-5 rounded-2xl border p-5 sm:p-7 ${panel}`}>
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl font-bold ${paid ? "bg-emerald-300 text-green-950" : "bg-white/10 text-white"}`}>{paid ? "✓" : pending ? "…" : "!"}</span>
      <p className="text-lg font-bold">{paid ? "Płatność potwierdzona" : order.refunded_at ? "Zwrot zakończony" : order.status === "cancelled" ? "Transakcja zamknięta" : pending ? "Sprawdzamy status Twojego zamówienia" : "Próba płatności nieudana"}</p>
    </div>
    <p className="text-green-50"><strong>{publication ? "Dodatkowa publikacja" : premiumPackageNames[order.package]}</strong><span className="mx-2" aria-hidden="true">·</span>{premiumPrice(order.amount)}</p>
    {paid ? <>
      <p className="leading-7">{publication
        ? order.entitlements_applied_at ? "Zakupiona dodatkowa publikacja jest już dostępna przy wybranym wydarzeniu." : "Twoja dodatkowa publikacja została opłacona. Udostępnimy ją zgodnie z datą rozpoczęcia usługi."
        : order.entitlements_applied_at ? "Zakupiony okres Premium został przyznany na Twoim koncie."
        : order.renews_existing_access ? "Twoje przedłużenie Premium zostało opłacone i zapisane. Rozpocznie się po zakończeniu obecnego dostępu."
        : "Twój zakup Premium został opłacony i zapisany. Dostęp rozpocznie się w terminie podanym poniżej."}</p>
      <div className="space-y-3 rounded-xl bg-black/20 p-4">
        {order.renews_existing_access && order.existing_access_until && <p className="text-sm text-green-100">Obecne Premium zachowujesz do {date(order.existing_access_until)}.</p>}
        <p>{publication ? "Realizacja publikacji od" : "Zakupiony okres od"}:<br /><strong>{date(order.service_starts_at)}</strong></p>
        {!publication && order.service_ends_at && <p>Premium opłacone do:<br /><strong className="text-xl text-emerald-200">{date(order.service_ends_at)}</strong></p>}
      </div>
      {order.package === "organizer" && order.period === "yearly" && order.included_packages?.includes("shooter") && <p className="font-semibold text-emerald-100">W cenie otrzymujesz również Premium Strzelca na ten sam okres.</p>}
      <p className="text-sm leading-6 text-green-100">{order.confirmation_email?.sent_at ? "Potwierdzenie zakupu wysłaliśmy na adres e-mail przypisany do Twojego konta." : "Potwierdzenie zakupu otrzymasz również na adres e-mail przypisany do Twojego konta."}</p>
    </> : order.refunded_at ? <p className="leading-7">Zwrot tej płatności został potwierdzony. Inne zakupione lub przyznane okresy Premium pozostają rozliczane osobno.</p>
      : order.status === "cancelled" ? <p className="leading-7">Autopay potwierdził anulowanie tej transakcji. Możesz wrócić do pakietów Premium i złożyć nowe zamówienie.</p>
      : order.status === "failed" ? <p className="leading-7">Operator zgłosił nieudaną próbę płatności. Jeżeli środki zostały pobrane, sprawdź status w Autopay przyciskiem poniżej lub skontaktuj się z nami, podając numer zamówienia.</p>
      : <><p className="leading-7">Czekamy na potwierdzenie z Autopay. Ta strona odświeża status automatycznie — gdy wpłata zostanie potwierdzona, zobaczysz tutaj wynik zakupu.</p><p className="text-sm leading-6 text-green-100">Przelew tradycyjny może wymagać więcej czasu na potwierdzenie. Jeżeli płatność została już wykonana, zaczekaj na jej status zamiast płacić ponownie.</p></>}
    {paid && <div className="flex flex-wrap gap-3">
      <Link href={order.package === "organizer" ? order.competition_id ? `/organizer/${order.competition_id}` : "/organizer" : "/profile"} className="inline-flex min-h-11 items-center rounded-xl bg-emerald-300 px-5 py-3 font-bold text-green-950">{order.package === "organizer" ? "Przejdź do panelu organizatora" : "Przejdź do mojego profilu"}</Link>
      <Link href="/" className="inline-flex min-h-11 items-center rounded-xl border border-emerald-200/40 px-5 py-3 font-semibold text-emerald-100">Wróć na stronę główną</Link>
    </div>}
  </section>;
}
