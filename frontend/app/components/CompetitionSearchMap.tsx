"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

export type CompetitionMapItem = {
  id: number;
  name: string;
  event_type?: "competition" | "training";
  date: string;
  location: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
};

type CompetitionSearchMapProps = {
  competitions: CompetitionMapItem[];
  detailsHrefBase?: string;
  detailsLabel?: string;
  emptyMessage?: string;
};

type MapLayerMode = "street" | "hybrid";
type EventType = "competition" | "training";

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

function hasCoordinates(competition: CompetitionMapItem) {
  return (
    typeof competition.latitude === "number"
    && Number.isFinite(competition.latitude)
    && typeof competition.longitude === "number"
    && Number.isFinite(competition.longitude)
  );
}

function eventType(competition: CompetitionMapItem): EventType {
  return competition.event_type === "training" ? "training" : "competition";
}

function createCompetitionIcon(competition: CompetitionMapItem) {
  const statusClass = competition.status === "started"
    ? "is-live"
    : competition.status === "completed"
      ? "is-finished"
      : "is-upcoming";
  const typeClass = eventType(competition) === "training"
    ? "is-training"
    : "is-competition";

  return L.divIcon({
    className: `competition-map-marker ${statusClass} ${typeClass}`,
    html: "<span></span>",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -12],
  });
}

function detailsHref(competition: CompetitionMapItem, fallbackHrefBase: string) {
  const hrefBase = eventType(competition) === "competition"
    ? "/competitions"
    : eventType(competition) === "training"
    ? "/trainings"
    : fallbackHrefBase;

  return `${hrefBase}/${competition.id}`;
}

function detailsText(competition: CompetitionMapItem, fallbackLabel: string) {
  return eventType(competition) === "competition"
    ? "Szczegóły zawodów"
    : eventType(competition) === "training"
    ? "Szczegóły szkolenia"
    : fallbackLabel;
}

function FitCompetitionBounds({
  competitions,
}: {
  competitions: CompetitionMapItem[];
}) {
  const map = useMap();

  useEffect(() => {
    if (competitions.length === 0) {
      map.setView(defaultCenter, minPolandZoom);
      return;
    }

    if (competitions.length === 1) {
      const competition = competitions[0];
      map.setView([competition.latitude as number, competition.longitude as number], 11);
      return;
    }

    const bounds = L.latLngBounds(
      competitions.map((competition) => [
        competition.latitude as number,
        competition.longitude as number,
      ])
    );

    map.fitBounds(bounds, {
      maxZoom: 12,
      padding: [40, 40],
    });
  }, [competitions, map]);

  return null;
}

export default function CompetitionSearchMap({
  competitions,
  detailsHrefBase = "/competitions",
  detailsLabel = "Szczegóły zawodów",
  emptyMessage = "Brak zawodów z dodaną dokładną lokalizacją dla tego widoku.",
}: CompetitionSearchMapProps) {
  const [layerMode, setLayerMode] = useState<MapLayerMode>("street");
  const mappedCompetitions = useMemo(
    () => competitions.filter(hasCoordinates),
    [competitions]
  );
  const activeLayer = mapLayers[layerMode];
  const iconByCompetitionId = useMemo(() => {
    const icons = new Map<number, L.DivIcon>();

    mappedCompetitions.forEach((competition) => {
      icons.set(competition.id, createCompetitionIcon(competition));
    });

    return icons;
  }, [mappedCompetitions]);

  return (
    <div className="relative flex h-[70vh] min-h-[520px] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-3 border-b border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-3 text-xs font-bold text-zinc-700 dark:text-gray-200">
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-green-700 ring-2 ring-white dark:ring-zinc-950" />
            Zawody
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-blue-600 ring-2 ring-white dark:ring-zinc-950" />
            Szkolenia
          </span>
        </div>

        <div className="overflow-hidden rounded-lg bg-white shadow-lg">
          {([
            ["street", "Mapa"],
            ["hybrid", "Hybryda"],
          ] as [MapLayerMode, string][]).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setLayerMode(mode)}
              className={`px-3 py-2 text-sm font-bold transition ${
                layerMode === mode
                  ? "bg-green-800 text-white"
                  : "bg-white text-zinc-900 hover:bg-zinc-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <MapContainer
        center={defaultCenter}
        zoom={minPolandZoom}
        minZoom={minPolandZoom}
        maxBounds={polandBounds}
        maxBoundsViscosity={1}
        scrollWheelZoom
        className="min-h-0 w-full flex-1"
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
        <FitCompetitionBounds competitions={mappedCompetitions} />

        {mappedCompetitions.map((competition) => (
          <Marker
            key={competition.id}
            icon={iconByCompetitionId.get(competition.id)}
            position={[competition.latitude as number, competition.longitude as number]}
          >
            <Popup>
              <div className="min-w-48 space-y-2 text-sm text-zinc-900">
                <p className="font-bold">
                  {competition.name}
                </p>
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                  {eventType(competition) === "training" ? "Szkolenie" : "Zawody"}
                </p>
                <p>
                  {competition.date}
                </p>
                <p>
                  {competition.location}
                </p>
                <Link
                  href={detailsHref(competition, detailsHrefBase)}
                  className="inline-flex rounded-lg bg-green-800 px-3 py-2 text-xs font-bold text-white hover:bg-green-700"
                >
                  {detailsText(competition, detailsLabel)}
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {mappedCompetitions.length === 0 && (
        <div className="pointer-events-none absolute inset-x-4 top-4 rounded-xl border border-zinc-200 bg-white/95 p-4 text-sm font-semibold text-zinc-700 shadow-lg dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-gray-200">
          {emptyMessage}
        </div>
      )}
    </div>
  );
}
