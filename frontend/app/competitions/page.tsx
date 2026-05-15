import CompetitionCard from "../components/CompetitionCard";

type Competition = {
  id: number;
  name: string;
  date: string;
  location: string;
  organizer_full_name: string;
  sponsors: string;
  participant_limit: number | null;
  shooters_count: number;
  disciplines_count: number;
};

async function getCompetitions() {
  const response = await fetch(
    "http://127.0.0.1:8000/competitions",
    {
      cache: "no-store",
    }
  );

  if (!response.ok) {
    return [];
  }

  return response.json();
}

export default async function CompetitionsPage() {
  const competitions: Competition[] = await getCompetitions();

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <div className="mb-10">
          <h1 className="text-5xl font-bold text-white mb-2">
            Nadchodzące Zawody
          </h1>

          <p className="text-gray-400">
            Opublikowane zawody strzeleckie
          </p>
        </div>

        {competitions.length === 0 ? (
          <p className="text-gray-400">
            Brak nadchodzących zawodów.
          </p>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {competitions.map((competition) => (
              <CompetitionCard
                key={competition.id}
                id={competition.id}
                name={competition.name}
                date={competition.date}
                location={competition.location}
                organizerFullName={competition.organizer_full_name}
                sponsors={competition.sponsors}
                participantLimit={competition.participant_limit}
                shootersCount={competition.shooters_count}
                disciplinesCount={competition.disciplines_count}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
