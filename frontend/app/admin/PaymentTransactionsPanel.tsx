"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";
import { authFetch } from "@/lib/auth";

type Status = "started" | "pending" | "paid" | "failed" | "cancelled" | "refund_pending" | "refunded" | "unknown";
type Transaction = {
  id: string; status: Status; status_label: string; amount: string; currency: string; description: string;
  payer_name: string; payer_email: string; created_at: string; paid_at: string | null;
  service_starts_at: string | null; service_ends_at: string | null; entitlements_applied_at: string | null;
  provider_updated_at: string | null; refunded_at: string | null;
  attempts: { remote_id: string; provider_status: string; last_seen_at: string | null }[];
};
type Overview = {
  entries: Transaction[]; counts: Record<Status, number>; total: number; page: number; page_size: number; updated_at: string;
};
const labels: Record<Status, string> = {
  started: "Rozpoczęte", pending: "Oczekujące", paid: "Zakończone — opłacone", failed: "Nieudane",
  cancelled: "Anulowane", refund_pending: "Zwroty w toku", refunded: "Zwrócone", unknown: "Nieznany status",
};
const input = "min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white";
const button = "min-h-11 rounded-xl bg-green-700 px-4 py-3 font-bold text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50";
function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}
function badge(status: Status) {
  return status === "paid" ? "border-emerald-500/60 bg-emerald-950 text-emerald-100" :
    status === "failed" ? "border-red-500/60 bg-red-950 text-red-100" :
    ["started", "pending", "refund_pending"].includes(status) ? "border-amber-500/60 bg-amber-950 text-amber-100" : "border-zinc-600 bg-zinc-800 text-zinc-100";
}

export default function PaymentTransactionsPanel({ onPaymentUpdated }: { onPaymentUpdated: () => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [status, setStatus] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [refreshing, setRefreshing] = useState(true);
  const [checking, setChecking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [checkError, setCheckError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;
    let running = false;
    async function load() {
      if (running) return;
      running = true; setRefreshing(true);
      try {
        const query = new URLSearchParams({ search, page: String(page) });
        if (status) query.set("status", status);
        const response = await authFetch(apiUrl(`/admin/payments/transactions?${query}`), { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Nie udało się pobrać transakcji.");
        if (!ignore) { setData(body); setError(""); }
      } catch (failure) {
        if (!ignore) setError(failure instanceof Error ? failure.message : "Błąd połączenia z serwerem.");
      } finally {
        running = false;
        if (!ignore) setRefreshing(false);
      }
    }
    void load();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30000);
    return () => { ignore = true; controller.abort(); window.clearInterval(interval); };
  }, [search, status, page, revision]);

  async function checkTransaction(id: string) {
    if (checking) return;
    setChecking(id); setMessage(""); setCheckError("");
    try {
      const response = await authFetch(apiUrl(`/admin/payments/transactions/${encodeURIComponent(id)}/check`), { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Nie udało się sprawdzić statusu w Autopay.");
      setMessage("Sprawdzono status w Autopay. Lista i rozliczenie zostały odświeżone.");
      onPaymentUpdated();
    } catch (failure) {
      setCheckError(failure instanceof Error ? failure.message : "Błąd połączenia z Autopay.");
    } finally { setChecking(null); setRevision((value) => value + 1); }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  return <section className="min-w-0 space-y-5 rounded-2xl border border-green-800 bg-green-950/20 p-4 sm:p-5" aria-label="Wszystkie transakcje Autopay">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h3 className="text-2xl font-bold">Wszystkie transakcje</h3>
        <p className="mt-2 max-w-3xl leading-7 text-zinc-300">Każde rozpoczęte zamówienie, również bez wpłaty. Przy zakupie znajdziesz zapisane próby płatności Autopay.</p>
        <p className="mt-2 text-sm text-zinc-400">Lista odświeża się co 30 sekund. Status zmieniają potwierdzenia operatora; przyciskiem „Sprawdź w Autopay” pobierzesz jego odpowiedź teraz.</p>
      </div>
      <button type="button" className={button} disabled={refreshing} onClick={() => setRevision((value) => value + 1)}>{refreshing ? "Odświeżanie…" : "Odśwież listę"}</button>
    </header>
    <form className="grid gap-3 md:grid-cols-[minmax(12rem,1fr)_minmax(12rem,2fr)_auto]" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchDraft.trim()); }}>
      <label className="space-y-2"><span className="block font-semibold">Status transakcji</span><select className={input} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Wszystkie statusy</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="space-y-2"><span className="block font-semibold">Szukaj transakcji</span><input className={input} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} maxLength={100} placeholder="Nazwisko, e-mail, numer zamówienia lub Autopay" /></label>
      <button type="submit" className={`${button} self-end`}>Filtruj transakcje</button>
    </form>
    {error && <p role="alert" className="rounded-xl border border-red-500 bg-red-950/40 p-4 text-red-100">{error}{data ? " Wyświetlona lista pochodzi z ostatniego poprawnego odczytu." : ""}</p>}
    {checkError && <p role="alert" className="rounded-xl border border-red-500 bg-red-950/40 p-4 text-red-100">{checkError}</p>}
    {message && <p role="status" className="rounded-xl border border-green-700 p-3 text-emerald-100">{message}</p>}
    {data ? <>
      <div className="flex flex-wrap gap-2" aria-label="Liczba transakcji według statusów">{Object.entries(labels).filter(([key]) => key !== "unknown" || data.counts.unknown > 0).map(([key, label]) => <p key={key} className={`rounded-xl border px-3 py-2 text-sm ${badge(key as Status)}`}>{label}: <strong>{data.counts[key as Status]}</strong></p>)}</div>
      <p className="text-sm text-zinc-400">Znaleziono: {data.total} · Odczyt listy: {date(data.updated_at)} · Liczniki uwzględniają wyszukiwanie i wszystkie statusy.</p>
      {data.entries.length === 0 ? <p className="rounded-xl border border-zinc-700 p-5 text-zinc-300">Brak transakcji dla wybranych filtrów.</p> : <div className="space-y-4">{data.entries.map((entry) => <article key={entry.id} aria-label={`Transakcja ${entry.id}`} className="min-w-0 space-y-4 rounded-xl border border-zinc-700 bg-zinc-900 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><p className="text-xl font-black">{new Intl.NumberFormat("pl-PL", { style: "currency", currency: entry.currency }).format(Number(entry.amount))}</p><p className="mt-1 font-semibold">{entry.description}</p></div>
          <span className={`rounded-full border px-3 py-1 text-sm font-bold ${badge(entry.status)}`}>{entry.status_label}</span>
        </div>
        <div className="grid min-w-0 gap-4 text-sm sm:grid-cols-2 xl:grid-cols-3">
          <div className="min-w-0 space-y-1"><p className="font-bold text-zinc-400">Kupujący</p><p>{entry.payer_name || "—"}</p><p className="break-all">{entry.payer_email || "Konto usunięte"}</p></div>
          <div className="space-y-1"><p>Rozpoczęcie: {date(entry.created_at)}</p><p>Wpłata: {date(entry.paid_at)}</p><p className="text-zinc-400">Ostatnia informacja Autopay: {date(entry.provider_updated_at)}</p></div>
          <div className="min-w-0 space-y-1"><p className="font-bold text-zinc-400">Numer zamówienia</p><p className="break-all font-mono text-xs">{entry.id}</p>{entry.status === "started" && <p className="text-amber-100">Brak potwierdzonej odpowiedzi Autopay.</p>}</div>
        </div>
        {entry.attempts.length > 0 && <div className="space-y-1 text-sm"><p className="font-bold text-zinc-400">Próby płatności Autopay</p>{entry.attempts.map((attempt) => <p key={attempt.remote_id} className="break-words"><span className="break-all font-mono">{attempt.remote_id}</span> — {attempt.provider_status === "SUCCESS" ? "Opłacona" : attempt.provider_status === "FAILURE" ? "Nieudana" : attempt.provider_status === "PENDING" ? "Oczekująca" : attempt.provider_status}</p>)}</div>}
        {entry.paid_at && <p className="text-sm text-zinc-300">{entry.refunded_at ? `Zwrot zakończony: ${date(entry.refunded_at)}` : entry.entitlements_applied_at ? "Zakup zrealizowany." : `Zakup zapisany; realizacja od ${date(entry.service_starts_at)}.`}{entry.service_ends_at && !entry.refunded_at ? ` Koniec zakupionego okresu: ${date(entry.service_ends_at)}.` : ""}</p>}
        <button type="button" className={button} disabled={!!checking} onClick={() => void checkTransaction(entry.id)}>{checking === entry.id ? "Sprawdzanie w Autopay…" : "Sprawdź w Autopay"}</button>
      </article>)}</div>}
      <nav aria-label="Strony wszystkich transakcji" className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className={button} disabled={refreshing || data.page <= 1} onClick={() => setPage(data.page - 1)}>Poprzednie transakcje</button>
        <span>Strona {data.page} z {pages}</span>
        <button type="button" className={button} disabled={refreshing || data.page >= pages} onClick={() => setPage(data.page + 1)}>Następne transakcje</button>
      </nav>
    </> : <p role="status" className="py-3 text-zinc-300">{refreshing ? "Ładowanie transakcji…" : "Lista transakcji jest niedostępna."}</p>}
  </section>;
}
