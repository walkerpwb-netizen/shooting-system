export function hasMapCoordinates(latitude: unknown, longitude: unknown) {
  return (
    typeof latitude === "number"
    && Number.isFinite(latitude)
    && typeof longitude === "number"
    && Number.isFinite(longitude)
  );
}

export function getDirectionsHref(latitude: number, longitude: number) {
  const destination = encodeURIComponent(`${latitude},${longitude}`);

  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}
