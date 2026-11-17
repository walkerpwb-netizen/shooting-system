import Link from "next/link";

export default function CompetitionNotFound() {
  return (
    <main className="min-h-screen bg-white p-10 text-zinc-950 dark:bg-black dark:text-white">
      <h1 className="mb-6 text-4xl font-bold">Nie znaleziono zawodów</h1>
      <Link href="/competitions" className="underline">Przejdź do listy zawodów</Link>
    </main>
  );
}
