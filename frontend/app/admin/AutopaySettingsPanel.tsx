"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";
import { authFetch } from "@/lib/auth";

type EnvironmentName = "sandbox" | "production";
type EnvironmentSettings = { service_id: string; gateway_url: string; algorithm: "sha256" | "sha512"; key_configured: boolean; complete: boolean };
type Settings = {
  revision: number; mode: "disabled" | "sandbox"; sandbox: EnvironmentSettings; production: EnvironmentSettings;
  sandbox_ready: boolean; updated_at: string; updated_by: string; notification_url: string; return_url: string;
  provider_timezone: "CET" | "Europe/Warsaw"; validity_minutes: number; callbacks_configured: boolean;
  merchant_model_confirmed: boolean; shared_credentials_confirmed: boolean; credentials_shared: boolean;
  smtp_ready: boolean; notification_urls: Record<EnvironmentName, string>;
};
type Options = Pick<Settings, "provider_timezone" | "validity_minutes" | "callbacks_configured" | "merchant_model_confirmed" | "shared_credentials_confirmed">;
type Diagnostics = { notifications: { environment: string; order_reference: string; remote_id: string; payment_status: string; confirmation: string; last_seen_at: string; deliveries: number }[]; pending_confirmation_emails: number };
type Draft = { service_id: string; gateway_url: string; algorithm: "sha256" | "sha512"; shared_key: string; remove_key: boolean };
const inputClass = "min-h-11 w-full rounded-xl border border-zinc-600 bg-zinc-950 px-3 py-2 text-white disabled:opacity-60";
const buttonClass = "min-h-11 rounded-xl bg-green-700 px-5 py-3 font-bold text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50";
const names = { sandbox: "Środowisko testowe — sandbox", production: "Środowisko produkcyjne — przygotowanie" };

function draftFrom(section: EnvironmentSettings): Draft {
  return { service_id: section.service_id, gateway_url: section.gateway_url, algorithm: section.algorithm, shared_key: "", remove_key: false };
}

export default function AutopaySettingsPanel() {
  const [data, setData] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Record<EnvironmentName, Draft> | null>(null);
  const [mode, setMode] = useState<Settings["mode"]>("disabled");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [options, setOptions] = useState<Options>({ provider_timezone: "CET", validity_minutes: 15, callbacks_configured: false, merchant_model_confirmed: true, shared_credentials_confirmed: false });
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);

  function apply(value: Settings) {
    setData(value);
    setDraft({ sandbox: draftFrom(value.sandbox), production: draftFrom(value.production) });
    setMode(value.mode);
    setOptions({ provider_timezone: value.provider_timezone, validity_minutes: value.validity_minutes, callbacks_configured: value.callbacks_configured,
      merchant_model_confirmed: value.merchant_model_confirmed, shared_credentials_confirmed: value.shared_credentials_confirmed });
  }

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;
    async function load() {
      setLoading(true); setError(""); setMessage("");
      try {
        const response = await authFetch(apiUrl("/admin/settings/autopay"), { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Nie udało się odczytać konfiguracji.");
        if (!ignore) apply(body);
        const diagnosticResponse = await authFetch(apiUrl("/admin/settings/autopay/diagnostics"), { cache: "no-store", signal: controller.signal });
        if (diagnosticResponse.ok && !ignore) setDiagnostics(await diagnosticResponse.json());
      } catch (failure) {
        if (!ignore) { setData(null); setDraft(null); setError(failure instanceof Error ? failure.message : "Błąd połączenia z serwerem."); }
      } finally { if (!ignore) setLoading(false); }
    }
    void load();
    return () => { ignore = true; controller.abort(); };
  }, [revision]);

  function change(name: EnvironmentName, values: Partial<Draft>) {
    setMessage("");
    setDraft((current) => current ? { ...current, [name]: { ...current[name], ...values } } : current);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !draft || saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await authFetch(apiUrl("/admin/settings/autopay"), {
        method: "PUT", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: data.revision, mode, ...draft, ...options }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Nie udało się zapisać konfiguracji.");
      apply(body);
      setMessage("Konfiguracja Autopay została zapisana. Rzeczywiste płatności pozostają wyłączone.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Błąd połączenia z serwerem.");
    } finally { setSaving(false); }
  }

  async function runTest(kind: "test-email" | "test-connection") {
    setError(""); setMessage(""); setSaving(true);
    try {
      const response = await authFetch(apiUrl(`/admin/settings/autopay/${kind}`), { method: "POST", cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Nie udało się wysłać testu poczty.");
      setMessage(body.message + (typeof body.available_channels === "number" ? ` Dostępne kanały: ${body.available_channels}.` : ""));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Błąd połączenia."); }
    finally { setSaving(false); }
  }

  return <section aria-label="Konfiguracja Autopay" className="min-w-0 space-y-6 rounded-2xl bg-zinc-950 p-4 text-white sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-3xl font-black">Konfiguracja Autopay</h2><p className="mt-3 max-w-3xl leading-7 text-zinc-300">Wpisz dane otrzymane od Autopay i kliknij Zapisz. Klucze trafiają do prywatnej konfiguracji backendu i nie są ponownie wyświetlane w formularzu.</p></div>
      <button type="button" className={buttonClass} disabled={loading || saving} onClick={() => setRevision((value) => value + 1)}>Wczytaj ponownie</button>
    </header>
    <p className="rounded-xl border border-amber-400/60 bg-amber-950/40 p-4 leading-7 text-amber-100"><strong>Oczekujemy na pozytywną weryfikację Autopay.</strong> Zapis danych produkcyjnych nie uruchamia rzeczywistych płatności. Testy sandbox są dostępne wyłącznie dla aktywnego administratora, bez pobierania pieniędzy i nadawania Premium.</p>
    {error && <p role="alert" className="rounded-xl border border-red-400 p-4 text-red-100">{error}</p>}
    {message && <p role="status" className="rounded-xl border border-green-500 p-4 text-green-100">{message}</p>}
    {loading ? <p role="status">Ładowanie konfiguracji…</p> : data && draft && <form onSubmit={(event) => void save(event)} className="space-y-6" autoComplete="off">
      <fieldset disabled={saving} className="space-y-6">
        <label className="block max-w-xl space-y-2"><span className="block font-bold">Tryb integracji</span><select className={inputClass} value={mode} onChange={(event) => { setMode(event.target.value as Settings["mode"]); setMessage(""); }}><option value="disabled">Wyłączone — tylko zapis konfiguracji</option><option value="sandbox">Testy — sandbox</option></select></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2"><span className="block font-semibold">Czas w komunikatach Autopay</span><select className={inputClass} value={options.provider_timezone} onChange={(event) => setOptions({ ...options, provider_timezone: event.target.value as Options["provider_timezone"] })}><option value="CET">CET (UTC+1) — według dokumentacji</option><option value="Europe/Warsaw">Czas polski CET/CEST — po uzgodnieniu z Autopay</option></select></label>
          <label className="space-y-2"><span className="block font-semibold">Ważność linku i płatności (minuty)</span><input className={inputClass} type="number" min={5} max={60} required value={options.validity_minutes} onChange={(event) => setOptions({ ...options, validity_minutes: Number(event.target.value) })} /></label>
        </div>
        <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={options.merchant_model_confirmed} onChange={(event) => setOptions({ ...options, merchant_model_confirmed: event.target.checked })} /><span>Autopay potwierdził model Merchanta: prowizję opłaca sprzedawca, a klient płaci cenę pakietu bez dodatkowej prowizji.</span></label>
        {data.credentials_shared && <label className="flex items-start gap-3 rounded-xl border border-amber-400 p-4"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={options.shared_credentials_confirmed} onChange={(event) => setOptions({ ...options, shared_credentials_confirmed: event.target.checked })} /><span>Autopay potwierdził używanie tych samych danych w sandboxie i produkcji. Sam identyczny klucz nie oznacza, że można używać go do testów.</span></label>}
        <div className="grid min-w-0 gap-5 xl:grid-cols-2">{(["sandbox", "production"] as const).map((name) => <fieldset key={name} className="min-w-0 space-y-5 rounded-2xl border border-zinc-700 bg-zinc-900 p-4 sm:p-6">
          <legend className="px-2 text-xl font-bold">{names[name]}</legend>
          <p className="text-sm leading-6 text-zinc-300">{name === "sandbox" ? "Wpisz dane przeznaczone przez Autopay do testów na testpay.autopay.eu. Wspólne dane dla obu środowisk wymagają potwierdzenia operatora." : "Tutaj zapisz dane z panelu produkcyjnego Autopay. Pozostaną przygotowane do osobnego uruchomienia sprzedaży po zatwierdzeniu."}</p>
          <p className="text-sm font-semibold text-emerald-200">{data[name].complete ? "Komplet danych zapisany" : "Dane niekompletne"}</p>
          <label className="block space-y-2"><span className="block font-semibold">ID serwisu — {name}</span><input className={inputClass} inputMode="numeric" pattern="[0-9]{1,10}" maxLength={10} value={draft[name].service_id} onChange={(event) => change(name, { service_id: event.target.value })} /></label>
          <label className="block space-y-2"><span className="block font-semibold">Adres do startu transakcji — {name}</span><input className={`${inputClass} text-sm`} type="url" required value={draft[name].gateway_url} onChange={(event) => change(name, { gateway_url: event.target.value })} /><span className="block break-all text-xs text-zinc-400">{name === "sandbox" ? "https://testpay.autopay.eu/payment" : "https://pay.autopay.eu/payment"}</span></label>
          <label className="block space-y-2"><span className="block font-semibold">Metoda szyfrowania (hash) — {name}</span><select className={inputClass} value={draft[name].algorithm} onChange={(event) => change(name, { algorithm: event.target.value as Draft["algorithm"] })}><option value="sha256">SHA256</option><option value="sha512">SHA512</option></select></label>
          <label className="block space-y-2"><span className="block font-semibold">Klucz konfiguracji (hash) — {name}</span><input type="password" autoComplete="new-password" spellCheck={false} maxLength={512} className={inputClass} value={draft[name].shared_key} disabled={draft[name].remove_key} onChange={(event) => change(name, { shared_key: event.target.value })} aria-describedby={`autopay-key-hint-${name}`} /><span id={`autopay-key-hint-${name}`} className="block text-sm text-zinc-300">{data[name].key_configured ? "Klucz jest zapisany. Pozostaw puste, aby go zachować, lub wpisz nowy, aby go zastąpić." : "Brak zapisanego klucza. Wklej klucz otrzymany od Autopay dla tego środowiska."}</span></label>
          {data[name].key_configured && <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={draft[name].remove_key} onChange={(event) => change(name, { remove_key: event.target.checked, shared_key: "" })} /><span>Usuń zapisany klucz — {name}</span></label>}
        </fieldset>)}</div>
      </fieldset>
      <section aria-label="Adresy do wpisania w panelu Autopay" className="space-y-4 rounded-2xl border border-zinc-700 bg-zinc-900 p-4 sm:p-6">
        <h3 className="text-xl font-bold">Adresy do wpisania w panelu Autopay</h3>
        <p className="text-sm leading-6 text-zinc-300">W portalu testowym ustaw ITN sandbox, a w portalu głównym ITN production. Adres powrotu jest wspólny. Samo zapisanie adresów u operatora nie uruchamia rzeczywistych płatności.</p>
        <p className="text-sm leading-6 text-zinc-300">W portalu operatora: Ustawienia serwisu → Konfiguracja techniczna → Edytuj → platforma Inny/dedykowany. Jeśli tych pól nie ma, poproś Autopay o ustawienie adresów.</p>
        <a className="inline-block text-emerald-200 underline" href="https://testportal.autopay.eu/panel" target="_blank" rel="noopener noreferrer">Otwórz portal testowy Autopay</a>
        {(["sandbox", "production"] as const).map((name) => <label key={name} className="block space-y-2"><span className="block font-semibold">Adres ITN — {name}</span><input className={`${inputClass} text-sm`} readOnly value={data.notification_urls[name]} onFocus={(event) => event.target.select()} /></label>)}
        <p className="break-all text-sm text-zinc-400">Starszy adres {data.notification_url} jest aliasem wyłącznie sandboxa. Nie wpisuj go w portalu produkcyjnym.</p>
        <label className="block space-y-2"><span className="block font-semibold">Adres powrotu po płatności</span><input className={`${inputClass} text-sm`} readOnly value={data.return_url} onFocus={(event) => event.target.select()} /></label>
        <label className="flex items-start gap-3"><input type="checkbox" checked={options.callbacks_configured} onChange={(event) => setOptions({ ...options, callbacks_configured: event.target.checked })} className="mt-1 h-5 w-5 shrink-0" /><span>Wpisałem adres powrotu oraz ITN sandbox w konfiguracji serwisu w portalu testowym Autopay. Zapis w portalu głównym nie zastępuje tego kroku.</span></label>
      </section>
      <div className="flex flex-wrap items-center gap-4"><button className={buttonClass} type="submit" disabled={saving}>{saving ? "Zapisywanie…" : "Zapisz"}</button><p className="text-sm text-zinc-300">{data.sandbox_ready ? "Sandbox jest gotowy do testów administratora." : "Testy sandbox są wyłączone lub czekają na komplet danych."}</p></div>
      {data.updated_at && <p className="break-words text-sm text-zinc-400">Ostatni zapis: {new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Warsaw" }).format(new Date(data.updated_at))}{data.updated_by ? ` · ${data.updated_by}` : ""}</p>}
    </form>}
    {data && <section className="space-y-4 rounded-2xl border border-zinc-700 bg-zinc-900 p-4 sm:p-6" aria-label="Gotowość testów Autopay">
      <h3 className="text-xl font-bold">Gotowość pełnego testu</h3>
      <p>Konfiguracja sandbox: <strong>{data.sandbox_ready ? "gotowa" : "wymaga uzupełnienia lub włączenia"}</strong></p>
      <p>Poczta systemowa: <strong>{data.smtp_ready ? "skonfigurowana" : "nieskonfigurowana"}</strong></p>
      <div className="flex flex-wrap gap-3"><button type="button" className={buttonClass} disabled={saving || !data.sandbox.complete} onClick={() => void runTest("test-connection")}>Sprawdź połączenie z sandboxem</button><button type="button" className={buttonClass} disabled={saving || !data.smtp_ready} onClick={() => void runTest("test-email")}>Wyślij test poczty na mój adres</button></div>
      <a href="/premium/zakup?pakiet=shooter&okres=monthly" className="block text-emerald-200 underline">Przejdź do testowego zakupu Premium</a>
      <p className="text-sm leading-6 text-zinc-300">Test obejmuje wybór oferty i zgód, przekierowanie do bramki, podpisany powrót oraz ITN. Sukces sandboxa pokazuje podgląd realizacji, bez nadawania rzeczywistych uprawnień. Status można też odpytać w Autopay lub anulować nieopłaconą transakcję. Rezerwację limitu zwalniamy po potwierdzonym anulowaniu przez operatora.</p>
      {diagnostics && <><p>Niewysłane potwierdzenia e-mail: {diagnostics.pending_confirmation_emails}</p><h4 className="font-bold">Ostatnie zweryfikowane komunikaty operatora</h4>{diagnostics.notifications.length === 0 ? <p className="text-zinc-300">Nie odebrano jeszcze zweryfikowanego powiadomienia. Sam zapis klucza nie potwierdza pełnego testu.</p> : <ul className="space-y-3">{diagnostics.notifications.map((item, index) => <li key={index} className="break-all rounded-xl border border-zinc-700 p-3 text-sm">{item.environment}: {item.payment_status} / {item.confirmation}<br />Zamówienie {item.order_reference}<br />Transakcja {item.remote_id} · doręczenia: {item.deliveries}<br />{item.last_seen_at}</li>)}</ul>}</>}
    </section>}
  </section>;
}
