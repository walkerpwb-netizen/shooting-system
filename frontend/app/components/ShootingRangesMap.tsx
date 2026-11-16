"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

import { apiUrl } from "@/lib/api";
import {
  getAuthSnapshot,
  subscribeToAuthChange,
} from "@/lib/auth";
import { notifyShootingRangeSubmissionsChange, SHOOTING_RANGE_SUBMISSIONS_CHANGE_EVENT, SHOOTING_RANGE_SUBMISSIONS_CHANGE_STORAGE_KEY } from "@/lib/shootingRangeNotifications";
import { notifyGunShopSubmissionsChange, GUN_SHOP_SUBMISSIONS_CHANGE_EVENT, GUN_SHOP_SUBMISSIONS_CHANGE_STORAGE_KEY } from "@/lib/gunShopNotifications";
import LeafletLocationPicker from "./LeafletLocationPicker";

export type ShootingRangeMapItem = {
  id: string;
  kind?: "range" | "shop";
  shopId?: number;
  name: string;
  address?: string;
  phone?: string;
  website?: string;
  latitude: number;
  longitude: number;
};

type ShootingRangesMapProps = {
  ranges?: ShootingRangeMapItem[];
};

type MapLayerMode = "street" | "hybrid";

type ShootingRangeResponse = {
  id: number;
  range_id: string;
  name: string;
  address: string;
  phone: string;
  website: string;
  latitude: number;
  longitude: number;
};

type GunShopResponse = Omit<ShootingRangeResponse, "range_id">;

type SubmissionFormState = {
  source_range_id: string;
  name: string;
  phone: string;
  website: string;
  address: string;
  license_source: string;
  latitude: number | null;
  longitude: number | null;
};

type SubmissionDialogMode = "new" | "change";

const defaultCenter: [number, number] = [52.0692, 19.4803];
const polandBounds: L.LatLngBoundsExpression = [
  [48.5, 13.5],
  [55.2, 24.6],
];
const minPolandZoom = 6;
const mapLayers: Record<MapLayerMode, {
  attribution: string;
  url: string;
}> = {
  street: {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  },
  hybrid: {
    attribution: "Tiles &copy; Esri",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  },
};
const hybridReferenceLayers = [
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
];

const emptySubmissionForm: SubmissionFormState = {
  source_range_id: "",
  name: "",
  phone: "",
  website: "",
  address: "",
  license_source: "",
  latitude: null,
  longitude: null,
};

function normalizeWebsiteUrl(website: string) {
  const trimmedWebsite = website.trim();

  if (!trimmedWebsite) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmedWebsite)) {
    return trimmedWebsite;
  }

  return `https://${trimmedWebsite}`;
}

function hasCoordinates(range: ShootingRangeMapItem) {
  return (
    Number.isFinite(range.latitude)
    && Number.isFinite(range.longitude)
  );
}

function createRangeIcon() {
  return L.divIcon({
    className: "shooting-range-map-marker",
    html: '<svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#fff" stroke="#18181b" stroke-width="2"/><circle cx="20" cy="20" r="14" fill="#18181b"/><circle cx="20" cy="20" r="10" fill="#fff"/><circle cx="20" cy="20" r="6" fill="#18181b"/><circle cx="20" cy="20" r="2.5" fill="#dc2626"/></svg>',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -14],
  });
}

function createShopIcon() {
  return L.divIcon({
    className: "gun-shop-map-marker",
    html: '<svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="9" fill="#1d4ed8" stroke="#fff" stroke-width="2"/><path d="M10 17h20v14H10z" fill="#fff"/><path d="M8 17l4-8h16l4 8z" fill="#93c5fd"/><path d="M16 9v8m8-8v8" stroke="#1d4ed8" stroke-width="2"/><path d="M17 23h6v8h-6z" fill="#1d4ed8"/></svg>',
    iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -14],
  });
}

function toMapRange(range: ShootingRangeResponse): ShootingRangeMapItem {
  return {
    id: range.range_id,
    name: range.name,
    address: range.address,
    phone: range.phone,
    website: range.website,
    latitude: range.latitude,
    longitude: range.longitude,
  };
}

function ShootingRangeSubmissionDialog({
  initialRange,
  onClose,
  kind = "range",
}: {
  initialRange?: ShootingRangeMapItem | null;
  onClose: () => void;
  kind?: "range" | "shop";
}) {
  const [form, setForm] = useState<SubmissionFormState>(() => (
    initialRange
      ? {
          source_range_id: initialRange.id,
          name: initialRange.name,
          phone: initialRange.phone || "",
          website: initialRange.website || "",
          address: initialRange.address || "",
          license_source: "",
          latitude: initialRange.latitude,
          longitude: initialRange.longitude,
        }
      : emptySubmissionForm
  ));
  const [mapPickerOpen, setMapPickerOpen] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("");
  const hasLocation = form.latitude !== null && form.longitude !== null;
  const mode: SubmissionDialogMode = initialRange ? "change" : "new";

  function updateForm(values: Partial<SubmissionFormState>) {
    setForm((currentForm) => ({
      ...currentForm,
      ...values,
    }));
  }

  async function submitSubmission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!hasLocation) {
      setMessage(kind === "shop" ? "Zaznacz lokalizację sklepu na mapie." : "Zaznacz lokalizację strzelnicy na mapie.");
      return;
    }

    try {
      setSubmitting(true);
      const token = getAuthSnapshot().split("|")[0];
      const response = await fetch(apiUrl(kind === "shop" ? "/gun-shop-submissions" : "/shooting-range-submissions"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(kind === "shop" ? {
          ...form, source_shop_id: initialRange?.shopId ?? null,
        } : form),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage(typeof data?.detail === "string" ? data.detail
          : "Nie udało się wysłać zgłoszenia. Sprawdź nazwę, telefon, adres WWW i lokalizację.");
        return;
      }

      if (kind === "shop") notifyGunShopSubmissionsChange();
      else notifyShootingRangeSubmissionsChange();
      setSubmitted(true);
      setMessage(mode === "change"
        ? "Zgłoszenie zmiany danych wysłane do akceptacji administratora."
        : "Zgłoszenie wysłane. Trafiło do panelu administratora do akceptacji."
      );
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 px-4 py-6">
      <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-green-400">
              Mapa strzelnic i sklepów
            </p>
            <h2 className="mt-1 text-2xl font-black">
              {mode === "change" ? "Zgłoś zmianę danych" : kind === "shop" ? "Dodaj sklep" : "Dodaj strzelnicę"}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-10 w-10 rounded-lg border border-zinc-700 text-xl font-black text-gray-300 transition hover:bg-zinc-800 hover:text-white"
            aria-label="Zamknij formularz"
          >
            ×
          </button>
        </div>

        <form
          onSubmit={submitSubmission}
          className="min-h-0 overflow-y-auto px-5 py-5"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-bold text-gray-200">
                Nazwa
              </span>
              <input
                required
                value={form.name}
                onChange={(event) => updateForm({ name: event.target.value })}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder:text-gray-500"
                placeholder={kind === "shop" ? "Nazwa sklepu" : "Nazwa strzelnicy"}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-gray-200">
                Telefon
              </span>
              <input
                required
                value={form.phone}
                onChange={(event) => updateForm({ phone: event.target.value })}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder:text-gray-500"
                placeholder="+48..."
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-gray-200">
                WWW lub social media
              </span>
              <input
                required
                value={form.website}
                onChange={(event) => updateForm({ website: event.target.value })}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder:text-gray-500"
                placeholder="https://..."
              />
            </label>

            {kind === "shop" && (
              <>
                <label className="block md:col-span-2">
                  <span className="mb-2 block text-sm font-bold text-gray-200">Adres sklepu</span>
                  <input maxLength={500} value={form.address} onChange={(event) => updateForm({ address: event.target.value })}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-gray-200">Źródło informacji o sklepie (opcjonalnie)</span>
                  <input maxLength={500} value={form.license_source} onChange={(event) => updateForm({ license_source: event.target.value })}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white" />
                </label>
                <p className="text-sm text-gray-400 md:col-span-2">Zgłoszenie sprawdzi administrator. Sklep pojawi się na mapie po zatwierdzeniu danych.</p>
              </>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold text-white">
                  Lokalizacja na mapie
                </p>
                <p className="mt-1 text-sm text-gray-400">
                  {hasLocation
                    ? `${form.latitude?.toFixed(6)}, ${form.longitude?.toFixed(6)}`
                    : kind === "shop" ? "Kliknij dokładne miejsce sklepu na mapie" : "Kliknij dokładne miejsce strzelnicy na mapie"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setMapPickerOpen((isOpen) => !isOpen)}
                className="rounded-lg bg-zinc-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-zinc-600"
              >
                {mapPickerOpen ? "Ukryj mapę" : "Pokaż mapę"}
              </button>
            </div>

            {mapPickerOpen && (
              <div className="mt-4 h-[360px] overflow-hidden rounded-lg border border-zinc-700">
                <LeafletLocationPicker
                  latitude={form.latitude}
                  longitude={form.longitude}
                  onChange={(location) => updateForm(location)}
                />
              </div>
            )}
          </div>

          {message && (
            <p className="mt-4 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-semibold text-gray-100">
              {message}
            </p>
          )}

          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-700 px-5 py-3 font-bold text-gray-200 transition hover:bg-zinc-900"
            >
              Zamknij
            </button>

            <button
              type="submit"
              disabled={submitting || submitted}
              className="rounded-lg bg-green-700 px-5 py-3 font-bold text-white transition hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-zinc-700"
            >
              {submitting ? "Wysyłam..." : submitted ? "Zgłoszenie wysłane" : "Wyślij zgłoszenie"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ShootingRangesMap({
  ranges = [],
}: ShootingRangesMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const [layerMode, setLayerMode] = useState<MapLayerMode>("street");
  const [searchQuery, setSearchQuery] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [submissionDialogOpen, setSubmissionDialogOpen] = useState(false);
  const [submissionKind, setSubmissionKind] = useState<"range" | "shop">("range");
  const [submissionInitialRange, setSubmissionInitialRange] = useState<ShootingRangeMapItem | null>(null);
  const [backendRanges, setBackendRanges] = useState<ShootingRangeMapItem[] | null>(null);
  const [backendShops, setBackendShops] = useState<ShootingRangeMapItem[]>([]);
  const authSnapshot = useSyncExternalStore(
    subscribeToAuthChange,
    getAuthSnapshot,
    () => ""
  );
  const [token] = authSnapshot.split("|");
  const isLoggedIn = Boolean(token);
  const currentRanges = useMemo(() => [...(backendRanges ?? ranges), ...backendShops], [backendRanges, backendShops, ranges]);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const mappedRanges = useMemo(
    () => currentRanges
      .filter(hasCoordinates)
      .filter((range) => {
        if (!normalizedSearchQuery) {
          return true;
        }

        return [
          range.name,
          range.address || "",
          range.phone || "",
          range.website || "",
        ].some((value) => value.toLowerCase().includes(normalizedSearchQuery));
      }),
    [currentRanges, normalizedSearchQuery]
  );
  const rangeIcon = useMemo(() => createRangeIcon(), []);
  const shopIcon = useMemo(() => createShopIcon(), []);
  const activeLayer = mapLayers[layerMode];

  useEffect(() => {
    let ignore = false;
    let generation = 0;

    async function readDirectory<T>(path: string): Promise<T[]> {
      const response = await fetch(apiUrl(path), { cache: "no-store" });
      if (!response.ok) throw new Error("Nie udało się pobrać punktów mapy");
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("Niepoprawna lista punktów mapy");
      return data;
    }

    async function loadDirectory() {
      const requestGeneration = ++generation;
      const [rangeResult, shopResult] = await Promise.allSettled([
        readDirectory<ShootingRangeResponse>("/shooting-ranges"), readDirectory<GunShopResponse>("/gun-shops"),
      ]);
      if (ignore || requestGeneration !== generation) return;
      if (rangeResult.status === "fulfilled") setBackendRanges(rangeResult.value.map(toMapRange));
      if (shopResult.status === "fulfilled") setBackendShops(shopResult.value.map((shop) => ({
        ...shop, id: `shop-${shop.id}`, shopId: shop.id, kind: "shop",
      })));
    }

    const refresh = () => { if (!document.hidden) void loadDirectory(); };
    const onStorage = (event: StorageEvent) => {
      if ([SHOOTING_RANGE_SUBMISSIONS_CHANGE_STORAGE_KEY, GUN_SHOP_SUBMISSIONS_CHANGE_STORAGE_KEY].includes(event.key || "")) refresh();
    };
    void loadDirectory();
    window.addEventListener(SHOOTING_RANGE_SUBMISSIONS_CHANGE_EVENT, refresh);
    window.addEventListener(GUN_SHOP_SUBMISSIONS_CHANGE_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = window.setInterval(refresh, 30000);

    return () => {
      ignore = true;
      window.clearInterval(interval);
      window.removeEventListener(SHOOTING_RANGE_SUBMISSIONS_CHANGE_EVENT, refresh);
      window.removeEventListener(GUN_SHOP_SUBMISSIONS_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  function zoomIn() {
    mapRef.current?.zoomIn();
  }

  function zoomOut() {
    mapRef.current?.zoomOut();
  }

  function openSubmissionDialog(range: ShootingRangeMapItem | null = null, kind: "range" | "shop" = "range") {
    if (!isLoggedIn) {
      setLoginMessage("Musisz się zalogować, żeby dodać strzelnicę, sklep lub zgłosić zmianę danych.");
      return;
    }

    setLoginMessage("");
    setSubmissionKind(range?.kind ?? kind);
    setSubmissionInitialRange(range);
    setSubmissionDialogOpen(true);
  }

  function closeSubmissionDialog() {
    setSubmissionDialogOpen(false);
    setSubmissionInitialRange(null);
  }

  return (
    <main className="flex h-[calc(100dvh-5rem)] min-h-[620px] flex-col overflow-hidden bg-zinc-950 text-white">
      <section className="border-b border-zinc-800 bg-zinc-950 px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-green-400">
              Publiczna mapa
            </p>
            <h1 className="text-xl font-black leading-tight sm:text-2xl">
              Mapa strzelnic i sklepów
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-11 min-w-0 rounded-lg border border-zinc-700 bg-zinc-900 px-4 text-sm font-semibold text-white outline-none placeholder:text-gray-500 focus:border-green-600 sm:w-72"
              placeholder="Szukaj strzelnicy lub sklepu"
              type="search"
            />

            <div className="flex overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900">
              <button
                type="button"
                onClick={zoomOut}
                className="h-11 min-w-12 border-r border-zinc-700 px-4 text-xl font-black transition hover:bg-zinc-800"
                aria-label="Oddal mapę"
              >
                -
              </button>
              <button
                type="button"
                onClick={zoomIn}
                className="h-11 min-w-12 px-4 text-xl font-black transition hover:bg-zinc-800"
                aria-label="Przybliż mapę"
              >
                +
              </button>
            </div>

            <div className="flex overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900">
              {([
                ["street", "Mapa"],
                ["hybrid", "Hybryda"],
              ] as [MapLayerMode, string][]).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setLayerMode(mode)}
                  className={`h-11 px-4 text-sm font-bold transition ${
                    layerMode === mode
                      ? "bg-green-700 text-white"
                      : "text-gray-200 hover:bg-zinc-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => openSubmissionDialog()}
              className="h-11 rounded-lg border border-green-700 bg-green-800 px-4 text-sm font-bold text-white transition hover:bg-green-700"
            >
              Dodaj strzelnicę
            </button>
            <button type="button" onClick={() => openSubmissionDialog(null, "shop")}
              className="h-11 rounded-lg border border-blue-700 bg-blue-800 px-4 text-sm font-bold text-white transition hover:bg-blue-700">
              Dodaj sklep
            </button>
          </div>
        </div>
      </section>

      <section className="relative min-h-0 flex-1">
        {loginMessage && (
          <div className="absolute inset-x-4 top-4 z-[700] mx-auto flex max-w-xl items-start justify-between gap-4 rounded-xl border border-yellow-500/50 bg-yellow-500/95 p-4 text-sm font-bold leading-6 text-zinc-950 shadow-2xl">
            <span>{loginMessage}</span>
            <button
              type="button"
              onClick={() => setLoginMessage("")}
              className="shrink-0 rounded-md px-2 text-lg leading-none hover:bg-yellow-300"
              aria-label="Zamknij komunikat"
            >
              ×
            </button>
          </div>
        )}

        <MapContainer
          ref={mapRef}
          center={defaultCenter}
          zoom={minPolandZoom}
          minZoom={minPolandZoom}
          maxBounds={polandBounds}
          maxBoundsViscosity={1}
          zoomControl={false}
          scrollWheelZoom
          className="absolute inset-0 h-full w-full"
        >
          <TileLayer
            key={layerMode}
            attribution={activeLayer.attribution}
            url={activeLayer.url}
          />
          {layerMode === "hybrid" && hybridReferenceLayers.map((url, index) => (
            <TileLayer
              key={url}
              url={url}
              zIndex={401 + index}
            />
          ))}

          {mappedRanges.map((range) => {
            const websiteUrl = range.website ? normalizeWebsiteUrl(range.website) : "";

            return (
              <Marker
                key={range.id}
                title={`${range.kind === "shop" ? "Sklep" : "Strzelnica"}: ${range.name}`}
                icon={range.kind === "shop" ? shopIcon : rangeIcon}
                position={[range.latitude, range.longitude]}
              >
                <Popup>
                  <div className="min-w-56 space-y-2 text-sm text-zinc-900">
                    <p className="text-xs font-bold uppercase text-zinc-600">{range.kind === "shop" ? "Sklep z bronią" : "Strzelnica"}</p>
                    <p className="text-base font-black">
                      {range.name}
                    </p>
                    {range.address && (
                      <p>
                        {range.address}
                      </p>
                    )}
                    {range.phone && (
                      <p>
                        Tel. {range.phone}
                      </p>
                    )}
                    {websiteUrl && (
                      <a
                        href={websiteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex rounded-lg bg-green-800 px-3 py-2 text-xs font-bold text-white hover:bg-green-700"
                      >
                        Strona www
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => openSubmissionDialog(range)}
                      className="block rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-bold text-zinc-900 transition hover:bg-zinc-100"
                    >
                      Zgłoś zmianę danych
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {mappedRanges.length === 0 && (
          <div className="pointer-events-none absolute inset-x-4 top-4 z-[500] mx-auto max-w-xl rounded-xl border border-zinc-700 bg-zinc-950/90 p-4 text-sm font-semibold leading-6 text-gray-200 shadow-2xl backdrop-blur">
            {normalizedSearchQuery
              ? "Brak strzelnic i sklepów pasujących do filtra."
              : "Brak punktów do wyświetlenia na mapie."}
          </div>
        )}
      </section>

      {submissionDialogOpen && (
        <ShootingRangeSubmissionDialog
          initialRange={submissionInitialRange}
          kind={submissionKind}
          onClose={closeSubmissionDialog}
        />
      )}
    </main>
  );
}
