"use client";

import dynamic from "next/dynamic";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { normalizeWebsiteUrl, openMapOnMac } from "@/lib/directoryLinks";
import { notifyGunShopSubmissionsChange, GUN_SHOP_SUBMISSIONS_CHANGE_EVENT, GUN_SHOP_SUBMISSIONS_CHANGE_STORAGE_KEY } from "@/lib/gunShopNotifications";

const LocationPicker = dynamic(() => import("@/app/components/LeafletLocationPicker"), {
  ssr: false,
  loading: () => <p className="p-4 text-gray-400">Ładowanie mapy...</p>,
});

type GunShop = {
  id: number;
  name: string;
  phone: string;
  website: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  license_source: string;
  is_published: boolean;
};

type ShopSubmission = Omit<GunShop, "is_published"> & {
  source_shop_id: number | null;
  status: "pending" | "rejected";
  submitted_by_email: string;
  submitted_by_name: string;
  created_at: string;
};

const emptyForm = {
  name: "", phone: "", website: "", address: "", latitude: "", longitude: "",
  license_source: "",
  is_published: false,
};
const fields = [
  ["name", "Nazwa", 180], ["phone", "Telefon", 60], ["website", "WWW lub social media", 300],
  ["address", "Adres", 500], ["license_source", "Źródło informacji (opcjonalnie)", 500],
] as const;

async function shopRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  if (!token) throw new Error("Zaloguj się ponownie, aby zarządzać sklepami.");
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(typeof data?.detail === "string" ? data.detail
      : response.status === 422 ? "Sprawdź nazwę, telefon, WWW i współrzędne."
      : "Nie udało się wykonać operacji. Spróbuj ponownie.");
  }
  return data as T;
}

export default function ShopsPanel() {
  const [shops, setShops] = useState<GunShop[]>([]);
  const [submissions, setSubmissions] = useState<ShopSubmission[]>([]);
  const [moderatingId, setModeratingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [message, setMessage] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingShop, setEditingShop] = useState<GunShop | null>(null);
  const [editingSubmission, setEditingSubmission] = useState<ShopSubmission | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadShops() {
      try {
        const [data, pending] = await Promise.all([
          shopRequest<GunShop[]>("/admin/gun-shops", { signal: controller.signal }),
          shopRequest<ShopSubmission[]>("/admin/gun-shop-submissions", { signal: controller.signal }),
        ]);
        if (!controller.signal.aborted) {
          setShops(data);
          setSubmissions(pending);
          setLoadError(false);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(true);
          setMessage(error instanceof Error ? error.message : "Nie udało się pobrać sklepów.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadShops();
    return () => controller.abort();
  }, [loadAttempt]);

  useEffect(() => {
    const refresh = () => { if (!document.hidden) setLoadAttempt((value) => value + 1); };
    const onStorage = (event: StorageEvent) => { if (event.key === GUN_SHOP_SUBMISSIONS_CHANGE_STORAGE_KEY) refresh(); };
    window.addEventListener(GUN_SHOP_SUBMISSIONS_CHANGE_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    const interval = window.setInterval(refresh, 30000);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(GUN_SHOP_SUBMISSIONS_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  function openEditor(shop: GunShop | null = null, submission: ShopSubmission | null = null) {
    setEditingShop(shop);
    setEditingSubmission(submission);
    const entry = submission ?? shop;
    const source = submission ? shops.find((item) => item.id === submission.source_shop_id) : null;
    setForm(entry ? {
      name: entry.name, phone: entry.phone, website: entry.website, address: entry.address,
      license_source: entry.license_source || source?.license_source || "",
      latitude: entry.latitude === null ? "" : String(entry.latitude),
      longitude: entry.longitude === null ? "" : String(entry.longitude),
      is_published: "is_published" in entry ? entry.is_published : false,
    } : { ...emptyForm });
    setSaveError("");
    setEditorOpen(true);
  }

  async function saveShop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const body = JSON.stringify({ ...form,
          latitude: form.latitude.trim() === "" ? null : Number(form.latitude),
          longitude: form.longitude.trim() === "" ? null : Number(form.longitude),
          ...(editingSubmission ? { source_shop_id: editingSubmission.source_shop_id } : {}),
      });
      if (editingSubmission) {
        const submission = await shopRequest<ShopSubmission>(`/admin/gun-shop-submissions/${editingSubmission.id}`, { method: "PUT", body });
        setSubmissions((current) => current.map((entry) => entry.id === submission.id ? submission : entry));
      } else {
        const shop = await shopRequest<GunShop>(editingShop ? `/admin/gun-shops/${editingShop.id}` : "/admin/gun-shops", {
          method: editingShop ? "PUT" : "POST", body,
        });
        setShops((current) => editingShop ? current.map((entry) => entry.id === shop.id ? shop : entry) : [...current, shop]);
      }
      setEditorOpen(false);
      setMessage(editingSubmission ? "Zgłoszenie zapisane. Możesz je teraz zatwierdzić." : editingShop ? "Dane sklepu zapisane." : "Sklep dodany.");
      notifyGunShopSubmissionsChange();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Nie udało się zapisać sklepu.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteShop(shop: GunShop) {
    if (!window.confirm(`Usunąć sklep „${shop.name}” z listy?`)) return;
    setDeletingId(shop.id);
    try {
      await shopRequest(`/admin/gun-shops/${shop.id}`, { method: "DELETE" });
      setShops((current) => current.filter((entry) => entry.id !== shop.id));
      setMessage("Sklep usunięty.");
      notifyGunShopSubmissionsChange();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się usunąć sklepu.");
    } finally {
      setDeletingId(null);
    }
  }

  async function reviewSubmission(submission: ShopSubmission, action: "approve" | "reject") {
    setModeratingId(submission.id);
    setMessage("");
    try {
      if (action === "approve") {
        const shop = await shopRequest<GunShop>(`/admin/gun-shop-submissions/${submission.id}/approve`, { method: "PUT" });
        setSubmissions((current) => current.filter((entry) => entry.id !== submission.id));
        setShops((current) => current.some((entry) => entry.id === shop.id)
          ? current.map((entry) => entry.id === shop.id ? shop : entry) : [...current, shop]);
        setMessage("Zgłoszenie zatwierdzone. Sklep jest widoczny na publicznej mapie.");
      } else {
        const updated = await shopRequest<ShopSubmission>(`/admin/gun-shop-submissions/${submission.id}/reject`, { method: "PUT" });
        setSubmissions((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
        setMessage("Zgłoszenie sklepu odrzucone.");
      }
      notifyGunShopSubmissionsChange();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się zaktualizować zgłoszenia.");
    } finally {
      setModeratingId(null);
    }
  }

  const latitude = form.latitude.trim() === "" ? null : Number(form.latitude);
  const longitude = form.longitude.trim() === "" ? null : Number(form.longitude);
  const validLocation = latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= 48.5 && latitude <= 55.2 && longitude >= 13.5 && longitude <= 24.6;

  return (
    <section className="space-y-6">
      {message && <p role="status" className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-white">{message}</p>}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="flex items-center justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 className="text-3xl font-bold text-white">Zgłoszenia sklepów</h2>
            <p className="mt-2 text-sm text-gray-400">Zgłoszenia z mapy czekają na akceptację. Przed publikacją sprawdź dane sklepu.</p>
          </div>
          <div className="shrink-0 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-yellow-100">
            <p className="text-sm font-bold uppercase">Do akceptacji</p>
            <p className="text-3xl font-black">{submissions.filter((entry) => entry.status === "pending").length}</p>
          </div>
        </div>
        {loading ? <p className="px-5 py-6 text-gray-400">Ładowanie zgłoszeń...</p>
          : loadError ? <p className="px-5 py-6 text-gray-400">Nie udało się pobrać zgłoszeń.</p>
          : submissions.length === 0 ? <p className="px-5 py-6 text-gray-400">Brak zgłoszeń sklepów.</p>
          : submissions.map((submission) => {
            const source = shops.find((shop) => shop.id === submission.source_shop_id);
            return (
              <div key={submission.id} className={`grid gap-5 border-b border-zinc-800 px-5 py-4 last:border-b-0 xl:grid-cols-[1fr_230px] ${submission.status === "pending" ? "bg-yellow-950/20" : ""}`}>
                <div className="space-y-2 text-sm text-gray-300">
                  <p className="text-lg font-bold text-white">{submission.name}</p>
                  <p className="text-xs text-gray-400">ID {submission.id} • {new Date(submission.created_at).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" })}</p>
                  <p>Zgłaszający: {submission.submitted_by_name} ({submission.submitted_by_email})</p>
                  <p>{submission.address || "Brak adresu"} • {submission.phone}</p>
                  <a href={normalizeWebsiteUrl(submission.website)} target="_blank" rel="noopener noreferrer" className="block break-all text-blue-300 hover:underline">{submission.website}</a>
                  <a href={`geo:${submission.latitude},${submission.longitude}?q=${submission.latitude},${submission.longitude}`} onClick={openMapOnMac}
                    className="block text-blue-300 hover:underline">{submission.latitude?.toFixed(6)}, {submission.longitude?.toFixed(6)}</a>
                  <p className="break-words">Źródło informacji: {submission.license_source || source?.license_source || "brak"}</p>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3 text-xs leading-5">
                    <p className="font-bold">{submission.source_shop_id ? source ? `Zmiana danych sklepu: ${source.name}` : "Zmiana sklepu, którego nie ma już na liście" : "Nowy sklep"}</p>
                    {source && fields.filter(([key]) => source[key] !== submission[key]).map(([key, label]) => (
                      <p key={key}><span className="font-bold">{label}:</span> <span className="text-red-300">{source[key] || "brak"}</span> → <span className="text-green-300">{submission[key] || "brak"}</span></p>
                    ))}
                    {source && (source.latitude !== submission.latitude || source.longitude !== submission.longitude) && (
                      <p>Lokalizacja: {source.latitude}, {source.longitude} → {submission.latitude}, {submission.longitude}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-start gap-3 xl:items-stretch">
                  <p className={submission.status === "pending" ? "font-bold text-yellow-300" : "font-bold text-red-400"}>{submission.status === "pending" ? "oczekuje" : "odrzucone"}</p>
                  <button type="button" onClick={() => openEditor(null, submission)} disabled={moderatingId !== null || deletingId !== null}
                    className="rounded-lg bg-blue-700 px-3 py-2 font-semibold text-white hover:bg-blue-600 disabled:opacity-50">Edytuj</button>
                  <button type="button" onClick={() => void reviewSubmission(submission, "approve")} disabled={moderatingId !== null || deletingId !== null}
                    className="rounded-lg bg-green-700 px-3 py-2 font-semibold text-white hover:bg-green-600 disabled:opacity-50">{moderatingId === submission.id ? "Zapisuję..." : "Zatwierdź"}</button>
                  <button type="button" onClick={() => void reviewSubmission(submission, "reject")} disabled={moderatingId !== null || deletingId !== null || submission.status === "rejected"}
                    className="rounded-lg bg-zinc-700 px-3 py-2 font-semibold text-white hover:bg-zinc-600 disabled:opacity-50">Odrzuć</button>
                </div>
              </div>
            );
          })}
      </section>
      <div className="ui-block rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-white">Sklepy</h2>
            <p className="mt-2 text-gray-400">Lista sklepów z bronią w Polsce. Uzupełniaj dane kontaktowe i lokalizację.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-yellow-100">
              <p className="text-sm font-bold uppercase tracking-wide">Na liście</p>
              <p className="text-3xl font-black">{shops.length}</p>
            </div>
            <button type="button" onClick={() => openEditor()} disabled={loading || loadError || deletingId !== null}
              className="rounded-lg bg-green-700 px-4 py-3 font-bold text-white transition hover:bg-green-600 disabled:opacity-50">Dodaj sklep</button>
          </div>
        </div>
      </div>
      {loading ? <p className="text-gray-400">Ładowanie sklepów...</p> : loadError ? <p className="text-gray-400">Lista sklepów jest niedostępna. Odśwież listę, aby spróbować ponownie.</p> : (
        <section className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900">
          <div className="min-w-[1180px]">
            <div className="grid grid-cols-[70px_1.5fr_1fr_1fr_1.1fr_1.1fr] gap-4 border-b border-zinc-800 px-5 py-4 text-sm font-bold text-gray-400">
              {["Nr", "Nazwa", "Telefon", "WWW", "Współrzędne", "Akcje"].map((title) => <p key={title}>{title}</p>)}
            </div>
            {shops.length === 0 && <p className="px-5 py-6 text-gray-400">Brak sklepów na liście.</p>}
            {shops.map((shop, index) => (
              <div key={shop.id} className="grid grid-cols-[70px_1.5fr_1fr_1fr_1.1fr_1.1fr] items-center gap-4 border-b border-zinc-800 px-5 py-3 text-sm last:border-b-0">
                <p className="font-bold text-gray-300">{index + 1}</p>
                <div className="min-w-0">
                  <p className="font-semibold text-white">{shop.name}</p>
                  <p className={shop.is_published ? "text-xs text-green-300" : "text-xs text-yellow-200"}>{shop.is_published ? "Na publicznej mapie" : "Nieopublikowany"}</p>
                  {shop.address && <p className="mt-1 text-xs text-gray-400">{shop.address}</p>}
                </div>
                <p className="text-gray-300">{shop.phone || "brak"}</p>
                {shop.website ? <a href={normalizeWebsiteUrl(shop.website)} target="_blank" rel="noopener noreferrer"
                  className="truncate text-blue-300 underline-offset-4 hover:underline">{shop.website}</a> : <p className="text-gray-300">brak</p>}
                {shop.latitude !== null && shop.longitude !== null ? (
                  <a href={`geo:${shop.latitude},${shop.longitude}?q=${shop.latitude},${shop.longitude}`} onClick={openMapOnMac}
                    title="Otwórz w aplikacji map" className="text-blue-300 underline-offset-4 hover:underline">
                    {shop.latitude.toFixed(6)}, {shop.longitude.toFixed(6)}
                  </a>
                ) : <p className="text-yellow-200">brak punktu</p>}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => openEditor(shop)} disabled={deletingId !== null}
                    className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-50">Edytuj</button>
                  <button type="button" onClick={() => void deleteShop(shop)} disabled={deletingId !== null}
                    className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-50">
                    {deletingId === shop.id ? "Usuwam..." : "Usuń"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {!loading && <button type="button" onClick={() => { setMessage(""); setLoading(true); setLoadAttempt((value) => value + 1); }}
        disabled={deletingId !== null} className="text-sm text-gray-400 underline hover:text-white">Odśwież listę</button>}
      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
          <div role="dialog" aria-modal="true" aria-labelledby="shop-editor-title" className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-6 py-5">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-green-400">{editingSubmission ? "Edycja zgłoszenia" : editingShop ? "Edycja sklepu" : "Nowy sklep"}</p>
                <h2 id="shop-editor-title" className="mt-1 text-2xl font-black text-white">{editingSubmission?.name || editingShop?.name || "Dodaj sklep"}</h2>
              </div>
              <button type="button" onClick={() => setEditorOpen(false)} disabled={saving}
                className="rounded-xl bg-zinc-800 px-4 py-2 font-bold text-white transition hover:bg-zinc-700 disabled:opacity-50">Zamknij</button>
            </div>
            <form onSubmit={saveShop} className="min-h-0 overflow-y-auto px-6 py-5">
              <fieldset disabled={saving}>
                {saveError && <p role="alert" className="mb-4 text-red-300">{saveError}</p>}
                <div className="grid gap-4 md:grid-cols-2">
                  {fields.map(([key, label, maxLength]) => (
                    <label key={key} className={key === "name" ? "block md:col-span-2" : "block"}>
                      <span className="mb-2 block font-semibold text-white">{label}{key === "name" ? " *" : ""}</span>
                      <input type={key === "phone" ? "tel" : "text"} required={key === "name" || (form.is_published && ["phone", "website"].includes(key))} maxLength={maxLength}
                        value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-white" />
                    </label>
                  ))}
                </div>
                {!editingSubmission && (
                  <label className="mt-5 flex items-start gap-3 rounded-xl border border-zinc-700 p-4 text-white">
                    <input type="checkbox" checked={form.is_published} onChange={(event) => setForm((current) => ({ ...current, is_published: event.target.checked }))} className="mt-1 h-5 w-5 accent-green-600" />
                    <span>Pokaż sklep na publicznej mapie po sprawdzeniu danych. Wymagane: telefon, WWW i lokalizacja.</span>
                  </label>
                )}
                <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <p className="mb-3 font-bold text-white">Lokalizacja</p>
                  <p className="mb-3 text-sm text-gray-400">{editingSubmission || form.is_published ? "Wskaż punkt na mapie lub wpisz obie współrzędne. Lokalizacja jest wymagana do publikacji." : "Wskaż punkt na mapie lub wpisz obie współrzędne. Lokalizację możesz też uzupełnić później."}</p>
                  <div className="mb-4 grid gap-4 md:grid-cols-2">
                    {(["latitude", "longitude"] as const).map((key) => (
                      <label key={key} className="block">
                        <span className="mb-2 block font-semibold text-white">{key === "latitude" ? "Szerokość geograficzna" : "Długość geograficzna"}</span>
                        <input type="number" step="any" min={key === "latitude" ? 48.5 : 13.5} max={key === "latitude" ? 55.2 : 24.6}
                          value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                          className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-white" />
                      </label>
                    ))}
                  </div>
                  <div className="h-[420px] overflow-hidden rounded-xl border border-zinc-700">
                    <LocationPicker latitude={validLocation ? latitude : null} longitude={validLocation ? longitude : null}
                      onChange={(location) => setForm((current) => ({ ...current, latitude: String(location.latitude), longitude: String(location.longitude) }))} />
                  </div>
                </div>
                <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => setEditorOpen(false)} className="rounded-xl border border-zinc-700 px-5 py-3 font-bold text-gray-200 hover:bg-zinc-900">Anuluj</button>
                  <button type="submit" className="rounded-xl bg-green-700 px-5 py-3 font-bold text-white hover:bg-green-600 disabled:bg-zinc-700">{saving ? "Zapisuję..." : "Zapisz"}</button>
                </div>
              </fieldset>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
