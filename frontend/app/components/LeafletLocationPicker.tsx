"use client";

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

type LocationValue = {
  latitude: number;
  longitude: number;
};

type LeafletLocationPickerProps = {
  latitude: number | null;
  longitude: number | null;
  onChange: (location: LocationValue) => void;
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

function createPinIcon() {
  return L.divIcon({
    className: "competition-map-location-pin",
    html: "<span></span>",
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

function MapClickHandler({
  onChange,
}: {
  onChange: (location: LocationValue) => void;
}) {
  useMapEvents({
    click(event) {
      onChange({
        latitude: Number(event.latlng.lat.toFixed(6)),
        longitude: Number(event.latlng.lng.toFixed(6)),
      });
    },
  });

  return null;
}

function SelectedLocation({
  icon,
  latitude,
  longitude,
}: {
  icon: L.DivIcon;
  latitude: number | null;
  longitude: number | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (latitude === null || longitude === null) {
      return;
    }

    map.setView([latitude, longitude], Math.max(map.getZoom(), 13));
  }, [latitude, longitude, map]);

  if (latitude === null || longitude === null) {
    return null;
  }

  return (
    <Marker
      icon={icon}
      position={[latitude, longitude]}
    />
  );
}

export default function LeafletLocationPicker({
  latitude,
  longitude,
  onChange,
}: LeafletLocationPickerProps) {
  const icon = useMemo(() => createPinIcon(), []);
  const hasLocation = latitude !== null && longitude !== null;
  const [layerMode, setLayerMode] = useState<MapLayerMode>("street");
  const activeLayer = mapLayers[layerMode];

  return (
    <MapContainer
      center={hasLocation ? [latitude, longitude] : defaultCenter}
      zoom={hasLocation ? 13 : minPolandZoom}
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
      {layerMode === "hybrid" && hybridReferenceLayers.map((url, index) => (
        <TileLayer
          key={url}
          url={url}
          zIndex={401 + index}
        />
      ))}
      <div className="pointer-events-auto absolute right-3 top-3 z-[1000] overflow-hidden rounded-lg bg-white shadow-lg">
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
      <MapClickHandler onChange={onChange} />
      <SelectedLocation
        icon={icon}
        latitude={latitude}
        longitude={longitude}
      />
    </MapContainer>
  );
}
