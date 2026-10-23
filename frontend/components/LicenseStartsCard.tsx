export type LicenseStarts = {
  year: number;
  complete: boolean;
  categories: Record<"pistol" | "rifle" | "shotgun", {
    required: number;
    completed: number;
    missing: number;
  }>;
};

const categories = [
  { key: "pistol", label: "Pistolet", competition: "pistoletowych" },
  { key: "rifle", label: "Karabin", competition: "karabinowych" },
  { key: "shotgun", label: "Strzelba gładkolufowa", competition: "strzelby gładkolufowej" },
] as const;

function missingStarts(count: number) {
  if (count === 1) return "Brakuje 1 startu";
  return `Brakuje ${count} startów`;
}

export default function LicenseStartsCard({ status }: { status?: LicenseStarts | null }) {
  if (!status) return null;

  return (
    <section
      aria-label={`Starty do przedłużenia licencji — ${status.year}`}
      className={`mb-8 rounded-2xl border p-5 sm:p-6 ${status.complete
        ? "border-green-600/40 bg-green-500/10 text-green-800 dark:text-green-300"
        : "border-red-600/40 bg-red-500/10 text-red-800 dark:text-red-300"}`}
    >
      <h2 className="text-xl font-bold">
        Starty do przedłużenia licencji — {status.year}
      </h2>
      {status.complete ? (
        <p className="mt-3 font-semibold">
          Wszystkie starty wymagane do przedłużenia Twojej licencji sportowej zostały w tym roku zaliczone.
        </p>
      ) : (
        <ul className="mt-3 list-inside list-disc space-y-2 font-semibold">
          {categories.filter(({ key }) => status.categories[key].missing > 0).map(({ key, competition }) => (
            <li key={key}>
              {missingStarts(status.categories[key].missing)} w konkurencjach {competition} do przedłużenia licencji.
            </li>
          ))}
        </ul>
      )}
      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        {categories.map(({ key, label }) => (
          <div key={key}>
            <dt className="text-sm">{label}</dt>
            <dd className="mt-1 text-lg font-bold">
              {status.categories[key].completed} / {status.categories[key].required}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">
        Uwzględniamy zapisane wyniki z zakończonych zawodów rozegranych w {status.year} roku
        w Systemie Strzeleckim. Wariant: 4 starty pistoletowe, 2 karabinowe i 2 strzelby gładkolufowej.
      </p>
      <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
        Jeżeli odbyłeś brakujące starty poza Systemem Strzeleckim, zignoruj tę wiadomość.
      </p>
    </section>
  );
}
