import type { ShootingRange } from "@/lib/shooting-ranges";

// An assignment is valid only for the address and coordinates reviewed for that record.
// New or changed locations need a fresh administrative review before inclusion.
export const rangeCities = [
  {
    slug: "warszawa", name: "Warszawa", heading: "Strzelnice w Warszawie",
    description: "Strzelnice w Warszawie: adresy i karty obiektów z katalogu Systemu Strzeleckiego.",
    introduction: "Warszawa leży w województwie mazowieckim. Poniżej znajdziesz adresy obiektów przypisanych do miasta; na kartach sprawdzisz kontakt i wyznaczysz dojazd.",
    addresses: { 75: ["ul. Krakowiaków 80A, 02-255 Warszawa", 52.1915002, 20.9357887], 76: ["ul. Puławska 561, 02-844 Warszawa", 52.1206487, 21.0192943], 77: ["ul. Marymoncka 34, 01-813 Warszawa", 52.2830127, 20.9604105], 78: ["ul. Józefa Bema 60, 01-225 Warszawa", 52.2254929, 20.9597987], 79: ["ul. Jagiellońska 88, hala 10B, 00-992 Warszawa (wjazd od ul. Kotsisa)", 52.281673, 21.0141954], 80: ["ul. Dominika Merliniego 4, 02-511 Warszawa", 52.1955742, 21.0265637], 81: ["ul. Łazienkowska 3, 00-449 Warszawa", 52.2202718, 21.0442503], 82: ["al. gen. Antoniego Chruściela „Montera”, Warszawa-Rembertów", 52.2707155, 21.1807896] },
  },
  {
    slug: "krakow", name: "Kraków", heading: "Strzelnice w Krakowie",
    description: "Strzelnice w Krakowie: adresy i karty obiektów z katalogu Systemu Strzeleckiego.",
    introduction: "Kraków leży w województwie małopolskim. Porównaj poniższe adresy obiektów przypisanych do miasta; szczegóły kontaktu i wskazówki dojazdu znajdziesz na ich kartach.",
    addresses: { 62: ["ul. Winnicka 52, 30-394 Kraków", 50.026001, 19.8642494], 63: ["ul. Jana Surzyckiego 16, 30-721 Kraków", 50.03756809999999, 20.0098595], 68: ["ul. Podchorążych 3, 30-084 Kraków", 50.0774244, 19.908064], 71: ["ul. Fabryczna 17, 31-553 Kraków", 50.064032, 19.974917], 72: ["ul. Pasternik 128, 31-354 Kraków", 50.1041669, 19.8644196], 182: ["ul. Jeżynowa, 31-983 Kraków", 50.0656312, 20.0984022] },
  },
  {
    slug: "wroclaw", name: "Wrocław", heading: "Strzelnice we Wrocławiu",
    description: "Strzelnice we Wrocławiu: adresy i karty obiektów z katalogu Systemu Strzeleckiego.",
    introduction: "Wrocław leży w województwie dolnośląskim. Lista pokazuje adresy obiektów przypisanych do miasta; na karcie wybranego obiektu sprawdzisz kontakt i dojazd.",
    addresses: { 1: ["ul. Sztabowa 32, Wrocław", 51.08951016666667, 17.011930638888888], 2: ["ul. Kwidzyńska 4, budynek 21, 51-416 Wrocław", 51.1296399, 17.0879571], 188: ["ul. Świątnicka 36, 52-018 Wrocław", 51.0798546, 17.0918283] },
  },
] as const;

export type RangeCity = (typeof rangeCities)[number];
export function cityRanges(city: RangeCity, ranges: ShootingRange[]) {
  const addresses: Readonly<Record<number, readonly [string, number, number]>> = city.addresses;
  return ranges.filter((range) => {
    const reviewed = addresses[range.id];
    return reviewed && reviewed[0] === range.address && reviewed[1] === range.latitude && reviewed[2] === range.longitude;
  })
    .sort((a, b) => a.name.localeCompare(b.name, "pl") || a.id - b.id);
}
