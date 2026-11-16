import ShootingRangesMapClient from "./ShootingRangesMapClient";

export const metadata = {
  title: "Mapa strzelnic i sklepów",
  description: "Publiczna mapa strzelnic i sklepów w Polsce z wyszukiwarką, danymi kontaktowymi i możliwością zgłaszania aktualizacji po zalogowaniu.",
  alternates: { canonical: "/shooting-ranges/map" },
  robots: {
    index: true,
    follow: true,
  },
};

export default function ShootingRangesMapPage() {
  return <ShootingRangesMapClient />;
}
