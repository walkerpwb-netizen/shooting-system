import ShootingRangesMapClient from "./ShootingRangesMapClient";
import { shootingRanges } from "./shootingRangesData";

export const metadata = {
  title: "Mapa strzelnic",
};

export default function ShootingRangesMapPage() {
  return <ShootingRangesMapClient ranges={shootingRanges} />;
}
