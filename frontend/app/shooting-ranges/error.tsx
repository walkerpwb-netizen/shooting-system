"use client";

import Link from "next/link";

export default function ShootingRangesError() {
  return <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
    <h1 className="text-3xl font-black">Katalog strzelnic jest chwilowo niedostępny</h1>
    <p className="mt-3">Nie udało się pobrać danych. Spróbuj ponownie za chwilę.</p>
    <p className="mt-3"><button className="font-bold underline" onClick={() => window.location.assign("/shooting-ranges")}>Odśwież katalog</button></p>
    <p className="mt-3"><Link className="font-bold underline" href="/shooting-ranges/map">Przejdź do mapy strzelnic i sklepów</Link></p>
  </main>;
}
