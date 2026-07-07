"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

import {
  getAuthSnapshot,
  hasBetaTesterRole,
  subscribeToAuthChange,
} from "@/lib/auth";

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

export default function ShootingRangesMap({
  ranges,
}: ShootingRangesMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const [layerMode, setLayerMode] = useState<MapLayerMode>("street");
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
  const mappedRanges = useMemo(
    () => ranges.filter(hasCoordinates),
    [ranges]
  );
  const rangeIcon = useMemo(() => createRangeIcon(), []);
  const activeLayer = mapLayers[layerMode];

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
              disabled
              className="h-11 rounded-lg border border-dashed border-zinc-700 px-4 text-sm font-bold text-gray-500"
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
    </main>
  );
}
