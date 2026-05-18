import JoinCompetitionPanel from "./JoinCompetitionPanel";
import LogoPreviewLink from "./LogoPreviewLink";

import { apiUrl } from "@/lib/api";

type CompetitionPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type Discipline = {
  id: number;
  name: string;
  description: string;
  scoring_type: string;
  shots_count: number;
  ammo_type: string;
  ammo_price: string;
  entry_fee: string;
};

type Participant = {
  id: number;
  user_email: string;
  first_name: string;
  last_name: string;
  club: string;
  display_name: string;
};

async function getCompetition(id: string) {
  const response = await fetch(
    apiUrl(`/competitions/${id}`),
    {
      cache: "no-store",
    }
  );

  if (!response.ok) {
    return null;
  }

  return response.json();
}

export default async function CompetitionPage({
  params,
}: CompetitionPageProps) {
  const { id } = await params;
  const competition = await getCompetition(id);

  if (!competition) {
    return (
      <main className="min-h-screen bg-black text-white p-10">
        <h1 className="text-4xl font-bold mb-6">
          Nie znaleziono zawodów
        </h1>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-10">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-4xl font-bold">
          {competition.name}
        </h1>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <section className="bg-zinc-900 p-6 rounded-2xl space-y-4">
            <p className="text-gray-300">
              Data: {competition.date}
            </p>

            <p className="text-gray-300">
              Lokalizacja: {competition.location}
            </p>

            {competition.entry_fee ? (
              <p className="text-gray-300">
                Cena startowa: {competition.entry_fee} zł za całe zawody
              </p>
            ) : (
              <p className="text-gray-300">
                Cena startowa: według wybranych konkurencji
              </p>
            )}

            {competition.participant_limit && (
              <p className="text-gray-300">
                Limit zawodników: {competition.participants.length}/{competition.participant_limit}
              </p>
            )}
          </section>

          {(competition.organizer_full_name || competition.organizer_logo || competition.sponsors || competition.sponsor_logo) && (
            <section className="bg-zinc-900 p-6 rounded-2xl space-y-4">
              <h2 className="text-2xl font-bold">
                Organizator i sponsorzy
              </h2>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="border border-zinc-700 rounded-xl p-4 space-y-3">
                  <div className="h-24 rounded-xl border border-dashed border-zinc-600 bg-zinc-950 flex items-center justify-center overflow-hidden text-gray-500 text-sm font-semibold">
                    {competition.organizer_logo ? (
                      <LogoPreviewLink
                        src={competition.organizer_logo}
                        alt="Logo organizatora"
                        title="Logo organizatora"
                      />
                    ) : (
                      "Logo organizatora"
                    )}
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">
                      Organizator
                    </p>

                    <p className="text-lg font-bold">
                      {competition.organizer_full_name || "Nie podano"}
                    </p>
                  </div>
                </div>

                <div className="border border-zinc-700 rounded-xl p-4 space-y-3">
                  <div className="h-24 rounded-xl border border-dashed border-zinc-600 bg-zinc-950 flex items-center justify-center overflow-hidden text-gray-500 text-sm font-semibold">
                    {competition.sponsor_logo ? (
                      <LogoPreviewLink
                        src={competition.sponsor_logo}
                        alt="Logo sponsora"
                        title="Logo sponsora"
                      />
                    ) : (
                      "Logo sponsora"
                    )}
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">
                      Sponsorzy
                    </p>

                    <p className="text-lg font-bold">
                      {competition.sponsors || "Brak sponsorów"}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}

          <section className="bg-zinc-900 p-6 rounded-2xl">
            <h2 className="text-2xl font-bold mb-4">
              Konkurencje
            </h2>

            <div className="space-y-3">
              {competition.disciplines.map((discipline: Discipline) => (
                <div
                  key={discipline.id}
                  className="border border-zinc-700 rounded-xl p-4"
                >
                  <h3 className="font-bold">
                    {discipline.name}
                  </h3>

                  <p className="text-gray-400">
                    {discipline.description || "Brak opisu"}
                  </p>

                  <p className="text-gray-300">
                    Punktacja: {discipline.scoring_type}, strzały: {discipline.shots_count}
                  </p>

                  <p className="text-gray-300">
                    Amunicja: {discipline.ammo_type || "Nie podano"}, cena: {discipline.ammo_price || "0"} zł/szt.
                  </p>

                  {!competition.entry_fee && (
                    <p className="text-gray-300">
                      Cena konkurencji: {discipline.entry_fee || "0"} zł
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        <JoinCompetitionPanel
          competitionId={competition.id}
          competitionEntryFee={competition.entry_fee || ""}
          participantLimit={competition.participant_limit || null}
          competitionStatus={competition.status}
          initialParticipants={competition.participants as Participant[]}
          disciplines={competition.disciplines as Discipline[]}
        />
      </div>
    </main>
  );
}
