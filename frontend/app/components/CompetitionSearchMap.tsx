"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

export type CompetitionMapItem = {
  id: number;
  name: string;
  date: string;
  location: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
};

type CompetitionSearchMapProps = {
  competitions: CompetitionMapItem[];
};

type MapLayerMode = "street" | "satellite";

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
  satellite: {
    attribution: "Tiles &copy; Esri",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  },
};

function hasCoordinates(competition: CompetitionMapItem) {
  return (
    typeof competition.latitude === "number"
    && Number.isFinite(competition.latitude)
    && typeof competition.longitude === "number"
    && Number.isFinite(competition.longitude)
  );
}

function createCompetitionIcon(status: string) {
  const statusClass = status === "started"
    ? "is-live"
    : status === "completed"
      ? "is-finished"
      : "is-upcoming";

  return L.divIcon({
    className: `competition-map-marker ${statusClass}`,
    html: "<span></span>",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -12],
  });
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
      icons.set(competition.id, createCompetitionIcon(competition.status));
    });

    return icons;
  }, [mappedCompetitions]);

  return (
    <div className="relative h-[70vh] min-h-[520px] overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
      <MapContainer
        center={defaultCenter}
        zoom={minPolandZoom}
        minZoom={minPolandZoom}
        maxBounds={polandBounds}
        maxBoundsViscosity={1}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          key={layerMode}
          attribution={activeLayer.attribution}
          url={activeLayer.url}
        />
        <div className="pointer-events-auto absolute right-3 top-3 z-[1000] overflow-hidden rounded-lg bg-white shadow-lg">
          {([
            ["street", "Mapa"],
            ["satellite", "Satelita"],
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
                <p>
                  {competition.date}
                </p>
                <p>
                  {competition.location}
                </p>
                <Link
                  href={`/competitions/${competition.id}`}
                  className="inline-flex rounded-lg bg-green-800 px-3 py-2 text-xs font-bold text-white hover:bg-green-700"
                >
                  Szczegóły zawodów
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {mappedCompetitions.length === 0 && (
        <div className="pointer-events-none absolute inset-x-4 top-4 rounded-xl border border-zinc-200 bg-white/95 p-4 text-sm font-semibold text-zinc-700 shadow-lg dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-gray-200">
          Brak zawodów z dodaną dokładną lokalizacją dla tego widoku.
        </div>
      )}
    </div>
  );
}
