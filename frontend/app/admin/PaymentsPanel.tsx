"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";
import { authFetch } from "@/lib/auth";

type Total = { count: number; amount: string; estimated_fee: string; estimated_net: string };
type Quarter = Total & {
  quarter: number; limit: string | null; remaining: string | null; used_percent: number | null;
  status: "unknown" | "below" | "warning" | "reached" | "exceeded";
};
type Receipt = {
  id: number; paid_on: string; paid_at: string; recorded_at: string;
  payer_name: string; payer_email: string; description: string; amount: string;
  currency: string; remote_id: string; service_id: string; order_reference: string;
  estimated_fee: string; estimated_net: string; fee_tariff: string;
};
type PaymentReport = {
  year: number; environment: "production" | "sandbox"; page: number; page_size: number;
  years: number[]; annual: Total; lifetime: Total; matching: Total;
  months: (Total & { month: number; label: string })[]; entries: Receipt[];
  quarters: Quarter[]; fee_note: string; limit_note: string; limit_source_url: string;
  payment_guard: { year: number; quarter: number; percent: number; blocked: boolean;
    stop_at: string | null; received: string; reserved: string; remaining: string | null };
  report_note: string; tax_source_url: string;
};

const monthNames = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];
const inputClass = "min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white";
const buttonClass = "min-h-11 rounded-xl bg-green-700 px-4 py-3 font-bold text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50";

function formatMoney(value: string) {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(Number(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default function PaymentsPanel() {
  const currentYear = Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Europe/Warsaw" }).format(new Date()));
  const currentQuarter = Math.ceil(Number(new Intl.DateTimeFormat("en", { month: "numeric", timeZone: "Europe/Warsaw" }).format(new Date())) / 3);
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState("");
  const [environment, setEnvironment] = useState<"production" | "sandbox">("production");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<PaymentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState<"xlsx" | "csv" | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({ year: String(year), environment, page: String(page), search });
        if (month) query.set("month", month);
        const response = await authFetch(apiUrl(`/admin/payments?${query}`), { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Nie udało się pobrać wpłat.");
        if (!ignore) setData(body);
      } catch (failure) {
        if (!ignore) { setData(null); setError(failure instanceof Error ? failure.message : "Błąd połączenia z serwerem."); }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void load();
    return () => { ignore = true; controller.abort(); };
  }, [year, month, environment, search, page, revision]);

  async function exportReport(format: "xlsx" | "csv") {
    if (exporting || environment !== "production") return;
    setExporting(format);
    setError("");
    try {
      const response = await authFetch(apiUrl(`/admin/payments/report?year=${year}&format=${format}`), { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(typeof body.detail === "string" ? body.detail : "Nie udało się wygenerować raportu.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `autopay-wplaty-${year}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Nie udało się pobrać raportu.");
    } finally { setExporting(null); }
  }

  const years = Array.from(new Set([currentYear, currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4, year, ...(data?.years || [])])).sort((a, b) => b - a);
  const pages = data ? Math.max(1, Math.ceil(data.matching.count / data.page_size)) : 1;

  return (
    <section className="min-w-0 space-y-6 rounded-2xl bg-zinc-950 p-4 text-white sm:p-6" aria-label="Kontrola wpłat Autopay">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="text-3xl font-black">Wpłaty Autopay</h2><p className="mt-2 max-w-3xl leading-7 text-zinc-300">Potwierdzone wpłaty klientów za Premium oraz szacunek prowizji operatora. Do kontroli limitu liczymy pełne kwoty wpłat, przed prowizjami.</p></div>
        <button type="button" onClick={() => setRevision((value) => value + 1)} disabled={loading} className={buttonClass}>Odśwież wpłaty</button>
      </header>

      <form className="grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 md:grid-cols-2 xl:grid-cols-[auto_auto_auto_minmax(12rem,1fr)_auto]" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchDraft.trim()); }}>
        <label className="space-y-2"><span className="block font-semibold">Rok</span><select className={inputClass} value={year} onChange={(event) => { setYear(Number(event.target.value)); setPage(1); }}>{years.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="space-y-2"><span className="block font-semibold">Miesiąc</span><select className={inputClass} value={month} onChange={(event) => { setMonth(event.target.value); setPage(1); }}><option value="">Cały rok</option>{monthNames.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label>
        <label className="space-y-2"><span className="block font-semibold">Rodzaj wpłat</span><select className={inputClass} value={environment} onChange={(event) => { setEnvironment(event.target.value as "production" | "sandbox"); setPage(1); }}><option value="production">Rzeczywiste</option><option value="sandbox">Testowe — sandbox</option></select></label>
        <label className="space-y-2"><span className="block font-semibold">Szukaj płatnika lub transakcji</span><input className={inputClass} value={searchDraft} maxLength={100} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Nazwisko, e-mail, ID lub zamówienie" /></label>
        <button type="submit" className={`${buttonClass} self-end`}>Szukaj</button>
      </form>

      {environment === "sandbox" && <p role="status" className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 font-bold text-amber-100">Widok TESTOWY. Te transakcje nie są rzeczywistymi wpłatami i nie trafiają do raportu rocznego do PIT-36.</p>}
      {error && <p role="alert" className="rounded-xl border border-red-500 p-4 text-red-100">{error}</p>}
      {loading ? <p role="status" className="py-6 text-zinc-300">Ładowanie wpłat…</p> : data && <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [`Wpłaty w roku ${data.year}`, formatMoney(data.annual.amount)],
            ["Prowizje w roku — szacunek", formatMoney(data.annual.estimated_fee)],
            ["Po prowizjach w roku — szacunek", formatMoney(data.annual.estimated_net)],
            ["Liczba wpłat w roku", String(data.annual.count)],
            ["Suma po zastosowaniu filtrów", formatMoney(data.matching.amount)],
            ["Prowizje po filtrach — szacunek", formatMoney(data.matching.estimated_fee)],
            ["Po prowizjach po filtrach — szacunek", formatMoney(data.matching.estimated_net)],
            ["Suma wpłat — wszystkie lata", formatMoney(data.lifetime.amount)],
          ].map(([label, value]) => <div key={label} className="rounded-2xl border border-green-900 bg-green-950/40 p-5"><p className="text-sm text-green-100">{label}{environment === "sandbox" ? " (testowe)" : ""}</p><p className="mt-3 break-words text-2xl font-black">{value}</p></div>)}
        </div>

        <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5" aria-label="Kwartalna kontrola limitu">
          <h3 className="text-xl font-bold">Kwartały {data.year} — wpłaty a limit działalności nierejestrowanej</h3>
          <p className="font-semibold text-amber-100">Prowizje nie pomniejszają przychodu liczonego do limitu.</p>
          <p className="leading-7 text-zinc-300">{data.limit_note}</p>
          {environment === "production" && <div className="space-y-2 rounded-xl border border-amber-500/60 bg-amber-950/30 p-4" aria-label="Automatyczna blokada nowych wpłat">
            <h4 className="font-bold">Blokada nowych wpłat przy {data.payment_guard.percent}% limitu — {data.payment_guard.quarter}. kwartał {data.payment_guard.year}</h4>
            <p className="font-bold text-amber-100">{data.payment_guard.blocked ? "Nowe wpłaty zablokowane — komunikat o pracach serwisowych." : "Próg blokady nie został osiągnięty."}</p>
            <p>Próg: {data.payment_guard.stop_at === null ? "Nie ustalono — nowe wpłaty zablokowane" : formatMoney(data.payment_guard.stop_at)} · Wpłaty: {formatMoney(data.payment_guard.received)} · Zarezerwowane w rozpoczętych zamówieniach: {formatMoney(data.payment_guard.reserved)}</p>
            {data.payment_guard.remaining !== null && <p>Maksymalna kwota kolejnego zamówienia: <strong>{formatMoney(data.payment_guard.remaining)}</strong></p>}
            <p className="text-sm text-zinc-300">Odrzucamy też zakup, który dopiero osiągnąłby próg. Kwoty rozpoczętych rzeczywistych zamówień są zarezerwowane do potwierdzenia wpłaty. Blokada dotyczy nowych prób; potwierdzenia już wykonanych płatności są nadal zapisywane.</p>
          </div>}
          <div className="grid gap-4 md:grid-cols-2">{data.quarters.map((item) => {
            const warning = ["warning", "reached", "exceeded"].includes(item.status);
            return <article key={item.quarter} aria-label={`Kwartał ${item.quarter}`} className={`min-w-0 space-y-3 rounded-xl border p-4 ${warning ? "border-amber-500 bg-amber-950/30" : "border-zinc-700"}`}>
              <h4 className="text-lg font-bold">{item.quarter}. kwartał {data.year}{data.year === currentYear && item.quarter === currentQuarter ? " — bieżący" : ""}{environment === "sandbox" ? " (testowy)" : ""}</h4>
              <p>Pełne wpłaty: <strong className="text-emerald-200">{formatMoney(item.amount)}</strong></p>
              <p className="text-sm text-zinc-300">Prowizje: ~{formatMoney(item.estimated_fee)} · Po prowizjach: ~{formatMoney(item.estimated_net)}</p>
              {item.limit !== null && item.remaining !== null && item.used_percent !== null ? <>
                <p>Limit przychodu należnego: <strong>{formatMoney(item.limit)}</strong></p>
                <progress aria-label={`Wykorzystanie limitu we wpłatach — kwartał ${item.quarter}`} className="h-3 w-full accent-emerald-400" max={100} value={Math.min(100, item.used_percent)} />
                <p className="text-sm">Wpłaty stanowią {new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(item.used_percent)}% limitu.</p>
                <p className="font-bold">{item.status === "exceeded" ? `Wpłaty ponad limit: ${formatMoney(String(-Number(item.remaining)))}` : `Margines według zapisanych wpłat: ${formatMoney(item.remaining)}`}</p>
                {warning && <p role="status" className="font-bold text-amber-100">{item.status === "exceeded" ? "Zapisane wpłaty przekroczyły limit." : item.status === "reached" ? "Zapisane wpłaty osiągnęły limit. Każdy dalszy przychód należny może go przekroczyć." : "Zapisane wpłaty osiągnęły co najmniej 80% limitu."} Sprawdź pełną ewidencję przychodu należnego.</p>}
              </> : <p className="text-amber-100">Nie ustalono limitu kwartalnego dla tego roku. Zweryfikuj przepisy obowiązujące w wybranym roku; przed 2026 r. limit był miesięczny.</p>}
            </article>;
          })}</div>
          <a className="inline-block text-emerald-200 underline" href={data.limit_source_url} target="_blank" rel="noopener noreferrer">Zasady limitu przychodu należnego — Ministerstwo Finansów</a>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5" aria-label="Raport roczny do PIT-36">
          <h3 className="text-xl font-bold">Podsumowanie wpłat do PIT-36 za {data.year} rok</h3>
          <p className="mt-3 leading-7 text-zinc-300">{data.report_note}</p>
          <p className="mt-3 leading-7 text-amber-100">{data.fee_note}</p>
          <p className="mt-2 text-sm text-zinc-400">Eksport zawiera cały wybrany rok, niezależnie od wyszukiwania i filtra miesiąca. Daty rozliczane są w czasie polskim. Excel zawiera podsumowanie, miesiące, kwartały i pełną listę wpłat.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className={buttonClass} disabled={!!exporting || environment !== "production"} onClick={() => void exportReport("xlsx")}>{exporting === "xlsx" ? "Generowanie…" : "Pobierz raport roczny Excel"}</button>
            <button type="button" className={buttonClass} disabled={!!exporting || environment !== "production"} onClick={() => void exportReport("csv")}>{exporting === "csv" ? "Generowanie…" : "Pobierz listę roczną CSV"}</button>
          </div>
          <a className="mt-4 inline-block text-emerald-200 underline" href={data.tax_source_url} target="_blank" rel="noopener noreferrer">Zasady rozliczenia działalności nierejestrowanej — Ministerstwo Finansów</a>
        </section>

        <section aria-label="Lista potwierdzonych wpłat" className="min-w-0 space-y-4">
          <h3 className="text-xl font-bold">Wpłaty spełniające filtry: {data.matching.count}</h3>
          {data.entries.length === 0 ? <p className="rounded-xl border border-zinc-800 p-6 text-zinc-300">Brak potwierdzonych wpłat Autopay dla wybranych filtrów.</p> : <>
            <div className="hidden overflow-x-auto rounded-2xl border border-zinc-800 md:block">
              <table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-zinc-900"><tr>{["Data wpłaty (Polska)", "Płatnik", "Usługa", "Wpłata i prowizja", "Transakcja Autopay", "Zamówienie"].map((label) => <th key={label} scope="col" className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{data.entries.map((entry) => <tr key={entry.id} className="border-t border-zinc-800 align-top"><td className="whitespace-nowrap px-4 py-4">{formatDate(entry.paid_at)}</td><td className="px-4 py-4"><p>{entry.payer_name || "—"}</p><p className="break-all text-zinc-400">{entry.payer_email || "Konto usunięte"}</p></td><td className="px-4 py-4">{entry.description}</td><td className="whitespace-nowrap px-4 py-4"><p className="font-bold text-emerald-200">{formatMoney(entry.amount)}</p><p className="mt-2 text-xs text-zinc-300">Prowizja: ~{formatMoney(entry.estimated_fee)}</p><p className="text-xs text-zinc-300">Po prowizji: ~{formatMoney(entry.estimated_net)}</p><p className="mt-1 text-xs text-zinc-400">{entry.fee_tariff}</p></td><td className="px-4 py-4"><p className="break-all">{entry.remote_id}</p><p className="text-zinc-400">Serwis: {entry.service_id}</p></td><td className="break-all px-4 py-4 font-mono text-xs">{entry.order_reference}</td></tr>)}</tbody></table>
            </div>
            <div className="space-y-3 md:hidden">{data.entries.map((entry) => <article key={entry.id} className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900 p-4"><p className="text-lg font-bold text-emerald-200">{formatMoney(entry.amount)}</p><p className="text-sm text-zinc-300">Prowizja: ~{formatMoney(entry.estimated_fee)} · Po prowizji: ~{formatMoney(entry.estimated_net)}</p><p className="text-xs text-zinc-400">{entry.fee_tariff}</p><p>{formatDate(entry.paid_at)}</p><p>{entry.description}</p><p>{entry.payer_name || "—"}</p><p className="break-all text-zinc-300">{entry.payer_email || "Konto usunięte"}</p><p className="break-all text-sm">Autopay: {entry.remote_id} / serwis {entry.service_id}</p><p className="break-all text-sm text-zinc-400">Zamówienie: {entry.order_reference}</p></article>)}</div>
          </>}
          <nav aria-label="Strony listy wpłat" className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" className={buttonClass} disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Poprzednia strona</button><span>Strona {page} z {pages}</span><button type="button" className={buttonClass} disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Następna strona</button>
          </nav>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5" aria-label="Wpłaty według miesięcy">
          <h3 className="mb-4 text-xl font-bold">Podział miesięczny — cały {data.year} rok</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.months.map((item) => <div key={item.month} className="rounded-xl border border-zinc-700 p-4"><p className="font-bold">{item.label}</p><p className="mt-2 text-lg text-emerald-200">{formatMoney(item.amount)}</p><p className="mt-1 text-sm text-zinc-400">Liczba wpłat: {item.count}</p><p className="mt-2 text-sm text-zinc-300">Prowizje: ~{formatMoney(item.estimated_fee)}</p><p className="text-sm text-zinc-300">Po prowizjach: ~{formatMoney(item.estimated_net)}</p></div>)}</div>
        </section>
      </>}
    </section>
  );
}
