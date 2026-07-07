import ShootingRangesMapClient from "./ShootingRangesMapClient";

export const metadata = {
  title: "Mapa strzelnic",
  description: "Publiczna mapa strzelnic w Polsce z wyszukiwarką, danymi kontaktowymi i możliwością zgłaszania aktualizacji po zalogowaniu.",
  robots: {
    index: true,
    follow: true,
  },
};

export default function ShootingRangesMapPage() {
  return <ShootingRangesMapClient />;
}
