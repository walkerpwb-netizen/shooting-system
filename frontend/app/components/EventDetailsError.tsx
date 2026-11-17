"use client";

export default function EventDetailsError() {
  return (
    <main className="min-h-screen bg-white p-10 text-zinc-950 dark:bg-black dark:text-white">
      <h1 className="mb-6 text-4xl font-bold">Nie udało się wczytać wydarzenia</h1>
      <p className="mb-6">Wystąpił błąd podczas pobierania danych. Spróbuj ponownie za chwilę.</p>
      <button type="button" className="rounded-lg bg-green-700 px-4 py-2 font-semibold text-white" onClick={() => window.location.reload()}>
        Spróbuj ponownie
      </button>
    </main>
  );
}
