import ShootingRangesMapClient from "./ShootingRangesMapClient";

import type { ShootingRangeMapItem } from "@/app/components/ShootingRangesMap";

export const metadata = {
  title: "Mapa strzelnic",
};

const shootingRanges: ShootingRangeMapItem[] = [];

export default function ShootingRangesMapPage() {
  return <ShootingRangesMapClient ranges={shootingRanges} />;
}
