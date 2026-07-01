"use client";

import { useEffect, useMemo } from "react";
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

const defaultCenter: [number, number] = [52.0692, 19.4803];

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

  return (
    <MapContainer
      center={hasLocation ? [latitude, longitude] : defaultCenter}
      zoom={hasLocation ? 13 : 6}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapClickHandler onChange={onChange} />
      <SelectedLocation
        icon={icon}
        latitude={latitude}
        longitude={longitude}
      />
    </MapContainer>
  );
}
