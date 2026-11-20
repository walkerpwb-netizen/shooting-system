"use client";

import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";
import { authFetch } from "@/lib/auth";

type Status = { token_configured: boolean; app_secret_configured: boolean; token_status: { error: string | null; last_success_at: string | null; data_access_expires_at: string | null; token_expires_at: string | null } | null; sources: { source: string; last_attempt_at: string | null; last_success_at: string | null; error: string | null }[] };

export default function MetaNewsPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await authFetch(apiUrl("/admin/meta-news"), { cache: "no-store" });
      if (!response.ok) throw new Error();
      setStatus(await response.json());
    } catch { setMessage("Nie udało się pobrać stanu integracji."); }
  }, []);
  useEffect(() => { const id = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(id); }, [load]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setMessage("");
    try {
      const response = await authFetch(apiUrl("/admin/meta-news/token"), { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      if (!response.ok) throw new Error();
      setToken(""); setMessage("Token zapisany. Rozpoczęto synchronizację w tle.");
      await load();
    } catch { setMessage("Nie udało się zapisać tokenu."); }
    finally { setSaving(false); }
  }

  async function syncNow() {
    setMessage("");
    try {
      const response = await authFetch(apiUrl("/admin/meta-news/sync"), { method: "POST", cache: "no-store" });
      if (!response.ok) throw new Error();
      setMessage("Rozpoczęto synchronizację. Odśwież stan za chwilę.");
    } catch { setMessage("Nie udało się uruchomić synchronizacji."); }
  }

  async function saveSecret(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    try {
      const response = await authFetch(apiUrl("/admin/meta-news/app-secret"), { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret }) });
      if (!response.ok) throw new Error();
      setSecret(""); setMessage("App Secret zapisany. Kontrola dostępu odbędzie się podczas synchronizacji.");
      await load();
    } catch { setMessage("Nie udało się zapisać App Secret."); }
    finally { setSaving(false); }
  }

  return <section className="space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
    <h2 className="text-3xl font-bold">Aktualności Meta</h2>
    <p className="text-zinc-300">Synchronizacja Facebooka i Instagrama odbywa się co 30 minut. Alerty są wysyłane na adres administratora.</p>
    <p>Token strony: {status?.token_configured ? "zapisany" : "niezapisany"}</p>
    <form onSubmit={save} className="space-y-3">
      <label htmlFor="meta-token" className="block font-bold">Nowy Page Access Token</label>
      <input id="meta-token" type="password" autoComplete="new-password" spellCheck={false} value={token} onChange={(event) => setToken(event.target.value)} required maxLength={8192} className="w-full rounded-xl border border-zinc-600 bg-zinc-950 px-4 py-3" />
      <p className="text-sm text-zinc-400">Po zapisaniu token nie będzie wyświetlany. Wklejenie nowego zastępuje poprzedni.</p>
      <button disabled={saving} className="rounded-xl bg-green-700 px-5 py-3 font-bold disabled:opacity-50">{saving ? "Zapisywanie..." : "Zapisz token"}</button>
    </form>
    <form onSubmit={saveSecret} className="space-y-3 border-t border-zinc-700 pt-5">
      <label htmlFor="meta-secret" className="block font-bold">App Secret {status?.app_secret_configured ? "(zapisany)" : "(niezapisany)"}</label>
      <input id="meta-secret" type="password" autoComplete="new-password" spellCheck={false} value={secret} onChange={(event) => setSecret(event.target.value)} required maxLength={8192} className="w-full rounded-xl border border-zinc-600 bg-zinc-950 px-4 py-3" />
      <p className="text-sm text-zinc-400">Potrzebny do sprawdzania daty wygaśnięcia dostępu w Meta. Po zapisaniu nie będzie wyświetlany.</p>
      <button disabled={saving} className="rounded-xl bg-green-700 px-5 py-3 font-bold disabled:opacity-50">Zapisz App Secret</button>
    </form>
    <div className="rounded-xl border border-zinc-700 p-4"><h3 className="font-bold">Ważność dostępu</h3>
      <p className={status?.token_status?.error ? "text-amber-300" : "text-zinc-300"}>{status?.token_status?.error || (status?.token_status?.last_success_at ? "Sprawdzono w Meta" : "Oczekiwanie na kontrolę")}</p>
      <p className="text-sm text-zinc-400">Dostęp do danych wygasa: {status?.token_status?.data_access_expires_at ? new Date(status.token_status.data_access_expires_at).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }) : "brak danych"}</p>
    </div>
    {message && <p role="status" className="text-emerald-200">{message}</p>}
    <div className="grid gap-3 md:grid-cols-2">{status?.sources.map((item) => <article key={item.source} className="rounded-xl border border-zinc-700 p-4">
      <h3 className="font-bold">{item.source === "facebook" ? "Facebook" : "Instagram"}</h3>
      <p className={item.error ? "text-amber-300" : "text-emerald-300"}>{item.error || (item.last_success_at ? "Synchronizacja działa" : "Oczekiwanie na synchronizację")}</p>
      <p className="mt-2 text-sm text-zinc-400">Ostatni sukces: {item.last_success_at ? new Date(item.last_success_at).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }) : "brak"}</p>
      <p className="text-sm text-zinc-400">Ostatnia próba: {item.last_attempt_at ? new Date(item.last_attempt_at).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }) : "brak"}</p>
    </article>)}</div>
    <button type="button" onClick={() => void load()} className="rounded-xl border border-zinc-600 px-4 py-2">Odśwież stan</button>
    <button type="button" onClick={() => void syncNow()} className="ml-3 rounded-xl border border-emerald-600 px-4 py-2">Synchronizuj teraz</button>
  </section>;
}
