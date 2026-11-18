"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";
import { authFetch } from "@/lib/auth";

type Event = { id: number; name: string; date: string; status: string; event_type: string; selected: boolean };
type Settings = { name: string; description: string; published: boolean; public_id: number | null; events: Event[] };
export default function PublicProfileSettings() {
  const [data, setData] = useState<Settings | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    authFetch(apiUrl("/organizer/public-profile")).then(async (response) => {
      if (!response.ok) throw new Error("Zaloguj się na konto organizatora, aby zarządzać kartą.");
      const result = await response.json(); if (active) setData(result);
    }).catch((error) => { if (active) setMessage(error.message || "Nie udało się pobrać ustawień."); });
    return () => { active = false; };
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!data) return;
    setSaving(true); setMessage("");
    try {
      const response = await authFetch(apiUrl("/organizer/public-profile"), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.name, description: data.description, published: data.published, event_ids: data.events.filter((e) => e.selected).map((e) => e.id) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Nie udało się zapisać karty.");
      setData(result); setMessage("Ustawienia zapisane.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Błąd połączenia."); }
    finally { setSaving(false); }
  }
  return <main className="mx-auto min-h-screen max-w-3xl p-6">
    <Link className="underline" href="/organizer">Panel organizatora</Link>
    <h1 className="mt-5 text-3xl font-bold">Publiczna karta organizatora</h1>
    <p className="mt-3">Zdecyduj, co opublikować. Dane kontaktowe konta nie są wyświetlane. Wskaż wyłącznie wydarzenia, których jesteś organizatorem; nowe wydarzenia również wymagają zaznaczenia.</p>
    {message && <p role="status" className="mt-4">{message}</p>}
    {data && <form onSubmit={save} className="mt-6 space-y-5">
      <label className="block">Publiczna nazwa<input className="mt-2 block w-full rounded border p-2 text-black" maxLength={200} value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} /></label>
      <label className="block">Publiczny opis<textarea className="mt-2 block min-h-36 w-full rounded border p-2 text-black" maxLength={4000} value={data.description} onChange={(e) => setData({ ...data, description: e.target.value })} /></label>
      <fieldset><legend className="font-bold">Wydarzenia organizowane przez ten podmiot</legend>
        <p className="my-2 text-sm">Zaznaczone szkice i anulowane wydarzenia nie będą widoczne publicznie.</p>
        {data.events.map((e) => <label key={e.id} className="my-2 flex gap-2"><input type="checkbox" checked={e.selected} onChange={(change) => setData({ ...data, events: data.events.map((item) => item.id === e.id ? { ...item, selected: change.target.checked } : item) })} />{e.date} — {e.name} ({e.event_type === "training" ? "szkolenie" : "zawody"}, {e.status})</label>)}
      </fieldset>
      <label className="flex gap-2"><input type="checkbox" checked={data.published} onChange={(e) => setData({ ...data, published: e.target.checked })} />Publikuję tę nazwę i opis oraz potwierdzam przypisanie wybranych wydarzeń.</label>
      <button disabled={saving} className="rounded bg-green-700 px-5 py-3 font-bold text-white disabled:opacity-50">Zapisz</button>
      {data.public_id && <p><Link className="underline" href={`/organizatorzy/${data.public_id}`}>Zobacz opublikowaną kartę</Link></p>}
    </form>}
  </main>;
}
