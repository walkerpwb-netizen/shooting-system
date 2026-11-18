"use client";

export default function ShootingRangesError() {
  return <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
    <h1 className="text-3xl font-black">Katalog strzelnic jest chwilowo niedostępny</h1>
    <p className="mt-3">Nie udało się pobrać danych. Spróbuj ponownie za chwilę.</p>
    <p className="mt-3"><a className="font-bold underline" href="/shooting-ranges">Odśwież katalog</a></p>
    <p className="mt-3"><a className="font-bold underline" href="/shooting-ranges/map">Przejdź do mapy strzelnic i sklepów</a></p>
  </main>;
}
