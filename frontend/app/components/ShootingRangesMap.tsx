"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

import { apiUrl } from "@/lib/api";
import {
  getAuthSnapshot,
  hasBetaTesterRole,
  subscribeToAuthChange,
} from "@/lib/auth";
import LeafletLocationPicker from "./LeafletLocationPicker";

export type ShootingRangeMapItem = {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  website?: string;
  latitude: number;
  longitude: number;
};

type ShootingRangesMapProps = {
  ranges: ShootingRangeMapItem[];
};

type MapLayerMode = "street" | "hybrid";

type ShootingRangeSubmissionResponse = {
  id: number;
  name: string;
  address: string;
  phone: string;
  website: string;
  latitude: number | null;
  longitude: number | null;
};

type SubmissionFormState = {
  name: string;
  phone: string;
  website: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
};

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
  name: "",
  phone: "",
  website: "",
  address: "",
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
    html: "<span></span>",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -14],
  });
}

function toApprovedRange(submission: ShootingRangeSubmissionResponse): ShootingRangeMapItem | null {
  if (
    typeof submission.latitude !== "number"
    || typeof submission.longitude !== "number"
    || !Number.isFinite(submission.latitude)
    || !Number.isFinite(submission.longitude)
  ) {
    return null;
  }

  return {
    id: `submission-${submission.id}`,
    name: submission.name,
    address: submission.address,
    phone: submission.phone,
    website: submission.website,
    latitude: submission.latitude,
    longitude: submission.longitude,
  };
}

function ShootingRangeSubmissionDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const [form, setForm] = useState<SubmissionFormState>(emptySubmissionForm);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const hasLocation = form.latitude !== null && form.longitude !== null;

  function updateForm(values: Partial<SubmissionFormState>) {
    setForm((currentForm) => ({
      ...currentForm,
      ...values,
    }));
  }

  async function submitSubmission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!form.address.trim() && !hasLocation) {
      setMessage("Podaj dokładny adres albo zaznacz lokalizację na mapie.");
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(apiUrl("/shooting-range-submissions"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage(data?.detail || "Nie udało się wysłać zgłoszenia.");
        return;
      }

      setForm(emptySubmissionForm);
      setMapPickerOpen(false);
      setMessage("Zgłoszenie wysłane. Trafiło do panelu administratora do akceptacji.");
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
              Mapa strzelnic
            </p>
            <h2 className="mt-1 text-2xl font-black">
              Dodaj strzelnicę
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
                placeholder="Nazwa strzelnicy"
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

            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-bold text-gray-200">
                Dokładny adres
              </span>
              <textarea
                value={form.address}
                onChange={(event) => updateForm({ address: event.target.value })}
                className="min-h-24 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder:text-gray-500"
                placeholder="Ulica, numer, miejscowość"
              />
            </label>
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
                    : "Brak zaznaczonego punktu"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setMapPickerOpen((isOpen) => !isOpen)}
                className="rounded-lg bg-zinc-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-zinc-600"
              >
                {mapPickerOpen ? "Ukryj mapę" : "Zaznacz lokalizację"}
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
              disabled={submitting}
              className="rounded-lg bg-green-700 px-5 py-3 font-bold text-white transition hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-zinc-700"
            >
              {submitting ? "Wysyłam..." : "Wyślij zgłoszenie"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ShootingRangesMap({
  ranges,
}: ShootingRangesMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const [layerMode, setLayerMode] = useState<MapLayerMode>("street");
  const [submissionDialogOpen, setSubmissionDialogOpen] = useState(false);
  const [approvedSubmissions, setApprovedSubmissions] = useState<ShootingRangeSubmissionResponse[]>([]);
  const authSnapshot = useSyncExternalStore(
    subscribeToAuthChange,
    getAuthSnapshot,
    () => ""
  );
  const [, role, rolesText] = authSnapshot.split("|");
  const roles = rolesText
    ? rolesText.split(",").filter(Boolean)
    : role
      ? [role]
      : [];
  const isBetaTester = hasBetaTesterRole(roles);
  const rangesWithApprovedSubmissions = useMemo(
    () => [
      ...ranges,
      ...approvedSubmissions
        .map(toApprovedRange)
        .filter((range): range is ShootingRangeMapItem => range !== null),
    ],
    [approvedSubmissions, ranges]
  );
  const mappedRanges = useMemo(
    () => rangesWithApprovedSubmissions.filter(hasCoordinates),
    [rangesWithApprovedSubmissions]
  );
  const rangeIcon = useMemo(() => createRangeIcon(), []);
  const activeLayer = mapLayers[layerMode];

  useEffect(() => {
    let ignore = false;

    async function loadApprovedSubmissions() {
      try {
        const response = await fetch(apiUrl("/shooting-range-submissions/approved"), {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const data: ShootingRangeSubmissionResponse[] = await response.json();

        if (!ignore && Array.isArray(data)) {
          setApprovedSubmissions(data);
        }
      } catch (error) {
        console.error(error);
      }
    }

    void loadApprovedSubmissions();

    return () => {
      ignore = true;
    };
  }, []);

  function zoomIn() {
    mapRef.current?.zoomIn();
  }

  function zoomOut() {
    mapRef.current?.zoomOut();
  }

  if (!isBetaTester) {
    return (
      <main className="flex min-h-[calc(100dvh-5rem)] items-center justify-center bg-zinc-950 px-6 py-12 text-white">
        <section className="w-full max-w-xl rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-center shadow-2xl">
          <p className="mb-2 text-sm font-bold uppercase tracking-[0.24em] text-green-400">
            Mapa strzelnic
          </p>
          <h1 className="mb-3 text-2xl font-black">
            Brak dostępu
          </h1>
          <p className="text-sm leading-6 text-gray-300">
            Ta mapa jest teraz dostępna tylko dla administratora albo moderatora.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="flex h-[calc(100dvh-5rem)] min-h-[620px] flex-col overflow-hidden bg-zinc-950 text-white">
      <section className="border-b border-zinc-800 bg-zinc-950 px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-green-400">
              Beta test
            </p>
            <h1 className="truncate text-xl font-black sm:text-2xl">
              Mapa strzelnic
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
              onClick={() => setSubmissionDialogOpen(true)}
              className="h-11 rounded-lg border border-green-700 bg-green-800 px-4 text-sm font-bold text-white transition hover:bg-green-700"
            >
              Dodaj strzelnicę
            </button>
          </div>
        </div>
      </section>

      <section className="relative min-h-0 flex-1">
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
                icon={rangeIcon}
                position={[range.latitude, range.longitude]}
              >
                <Popup>
                  <div className="min-w-56 space-y-2 text-sm text-zinc-900">
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
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {mappedRanges.length === 0 && (
          <div className="pointer-events-none absolute inset-x-4 top-4 z-[500] mx-auto max-w-xl rounded-xl border border-zinc-700 bg-zinc-950/90 p-4 text-sm font-semibold leading-6 text-gray-200 shadow-2xl backdrop-blur">
            Brak zaimportowanej oficjalnej listy zarejestrowanych strzelnic.
            Punkty dodamy po potwierdzeniu źródła danych.
          </div>
        )}
      </section>

      {submissionDialogOpen && (
        <ShootingRangeSubmissionDialog
          onClose={() => setSubmissionDialogOpen(false)}
        />
      )}
    </main>
  );
}
