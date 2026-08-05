import type { Metadata } from "next";

import JoinCompetitionPanel from "./JoinCompetitionPanel";
import LogoPreviewLink from "./LogoPreviewLink";
import RegistrationCountdown from "./RegistrationCountdown";

import DisciplineDescription from "@/app/components/DisciplineDescription";
import { apiUrl } from "@/lib/api";
import { getClayTargetsCount } from "@/lib/disciplines";
import { getDirectionsHref, hasMapCoordinates } from "@/lib/maps";

type CompetitionPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type Discipline = {
  id: number;
  name: string;
  description: string;
  discipline_type: string;
  discipline_type_label?: string;
  scoring_type: string;
  shots_count: number;
  trap_variant?: string;
  trap_series_count?: number;
  clay_variant?: string;
  clay_series_count?: number;
  ammo_type: string;
  ammo_price: string;
  clay_price?: string;
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

type Competition = {
  id: number;
  name: string;
  date: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  entry_fee?: string;
  participant_limit?: number | null;
  registration_deadline?: string | null;
  min_participants?: number | null;
  status: string;
  organizer_full_name?: string;
  organizer_logo?: string;
  sponsors?: string;
  sponsor_logo?: string;
  club_discount_enabled?: boolean;
  club_discount_scope?: "competition" | "discipline";
  club_discount_amount?: string;
  club_discount_clubs?: string;
  participants: Participant[];
  disciplines: Discipline[];
};

function truncateDescription(value: string) {
  return value.length > 158
    ? `${value.slice(0, 155).trim()}...`
    : value;
}

function metadataImageUrl(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  return value.startsWith("/") || value.startsWith("http://") || value.startsWith("https://")
    ? value
    : undefined;
}

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

  return response.json() as Promise<Competition>;
}

export async function generateMetadata({
  params,
}: CompetitionPageProps): Promise<Metadata> {
  const { id } = await params;
  const competition = await getCompetition(id);

  if (!competition) {
    return {
      title: "Nie znaleziono zawodów | System Strzelecki",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const organizer = competition.organizer_full_name
    ? ` Organizator: ${competition.organizer_full_name}.`
    : "";
  const disciplinesCount = competition.disciplines.length
    ? ` Liczba konkurencji: ${competition.disciplines.length}.`
    : "";
  const description = truncateDescription(
    `Zawody strzeleckie ${competition.name}. Data: ${competition.date}. Miejsce: ${competition.location}.${organizer}${disciplinesCount}`
  );
  const title = `${competition.name} | Zawody strzeleckie`;
  const imageUrl = metadataImageUrl(competition.organizer_logo);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `/competitions/${competition.id}`,
      siteName: "System Strzelecki",
      type: "article",
      images: imageUrl
        ? [
            {
              url: imageUrl,
              alt: `Logo organizatora zawodów ${competition.name}`,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: imageUrl
        ? [imageUrl]
        : undefined,
    },
    alternates: {
      canonical: `/competitions/${competition.id}`,
    },
  };
}

export default async function CompetitionPage({
  params,
}: CompetitionPageProps) {
  const { id } = await params;
  const competition = await getCompetition(id);

  if (!competition) {
    return (
      <main className="min-h-screen bg-white p-10 text-zinc-950 dark:bg-black dark:text-white">
        <h1 className="text-4xl font-bold mb-6">
          Nie znaleziono zawodów
        </h1>
      </main>
    );
  }

  const hasDirections = hasMapCoordinates(competition.latitude, competition.longitude);
  const directionsLatitude = hasDirections ? competition.latitude as number : null;
  const directionsLongitude = hasDirections ? competition.longitude as number : null;
  const directionsHref = hasDirections
    ? getDirectionsHref(directionsLatitude as number, directionsLongitude as number)
    : "";

  return (
    <main className="min-h-screen bg-white p-6 text-zinc-950 dark:bg-black dark:text-white sm:p-10">
      <RegistrationCountdown
        registrationDeadline={competition.registration_deadline}
        participantsCount={competition.participants.length}
        minParticipants={competition.min_participants || null}
      />

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-4xl font-bold">
          {competition.name}
        </h1>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
            <p className="text-zinc-700 dark:text-gray-300">
              Data: {competition.date}
            </p>

            {hasDirections ? (
              <a
                href={directionsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex text-left text-zinc-700 underline decoration-green-700/60 underline-offset-4 transition hover:text-green-700 dark:text-gray-300 dark:hover:text-green-400"
                title="Nawiguj do miejsca zawodów"
              >
                Lokalizacja: {competition.location}
              </a>
            ) : (
              <p className="text-zinc-700 dark:text-gray-300">
                Lokalizacja: {competition.location}
              </p>
            )}

            {competition.entry_fee ? (
              <p className="text-zinc-700 dark:text-gray-300">
                Cena startowa: {competition.entry_fee} zł za całe zawody
              </p>
            ) : (
              <p className="text-zinc-700 dark:text-gray-300">
                Cena startowa: według wybranych konkurencji
              </p>
            )}

            {competition.participant_limit && (
              <p className="text-zinc-700 dark:text-gray-300">
                Limit zawodników: {competition.participants.length}/{competition.participant_limit}
              </p>
            )}

            {competition.min_participants && (
              <p className="text-zinc-700 dark:text-gray-300">
                Minimum zawodników: {competition.participants.length}/{competition.min_participants}
              </p>
            )}
          </section>

          {(competition.organizer_full_name || competition.organizer_logo || competition.sponsors || competition.sponsor_logo) && (
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
              <h2 className="text-2xl font-bold">
                Organizator i sponsorzy
              </h2>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-zinc-200 p-4 space-y-3 dark:border-zinc-700">
                  <div className="h-24 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 flex items-center justify-center overflow-hidden text-zinc-500 text-sm font-semibold dark:border-zinc-600 dark:bg-zinc-950 dark:text-gray-500">
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
                    <p className="text-sm text-zinc-500 dark:text-gray-500">
                      Organizator
                    </p>

                    <p className="text-lg font-bold">
                      {competition.organizer_full_name || "Nie podano"}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 p-4 space-y-3 dark:border-zinc-700">
                  <div className="h-24 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 flex items-center justify-center overflow-hidden text-zinc-500 text-sm font-semibold dark:border-zinc-600 dark:bg-zinc-950 dark:text-gray-500">
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
                    <p className="text-sm text-zinc-500 dark:text-gray-500">
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

          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-2xl font-bold mb-4">
              Konkurencje
            </h2>

            <div className="space-y-3">
              {competition.disciplines.map((discipline: Discipline) => (
                <div
                  key={discipline.id}
                  className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700"
                >
                  <h3 className="font-bold">
                    {discipline.name}
                  </h3>

                  <DisciplineDescription description={discipline.description} />

                  {discipline.discipline_type_label && (
                    <p className="text-zinc-700 dark:text-gray-300">
                      Rodzaj: {discipline.discipline_type_label}
                    </p>
                  )}

                  <p className="text-zinc-700 dark:text-gray-300">
                    Strzały: {discipline.shots_count}
                  </p>

                  <p className="text-zinc-700 dark:text-gray-300">
                    Amunicja: {discipline.ammo_type || "Nie podano"}, cena: {discipline.ammo_price || "0"} zł/szt.
                  </p>

                  {getClayTargetsCount(discipline) > 0 ? (
                    <p className="text-zinc-700 dark:text-gray-300">
                      Rzutki: {getClayTargetsCount(discipline)}, cena: {discipline.clay_price || "0"} zł/szt.
                    </p>
                  ) : null}

                  {!competition.entry_fee && (
                    <p className="text-zinc-700 dark:text-gray-300">
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
          competitionName={competition.name}
          competitionOrganizerName={competition.organizer_full_name || ""}
          clubDiscountEnabled={Boolean(competition.club_discount_enabled)}
          clubDiscountScope={competition.club_discount_scope === "discipline" ? "discipline" : "competition"}
          clubDiscountAmount={competition.club_discount_amount || ""}
          clubDiscountClubs={competition.club_discount_clubs || competition.organizer_full_name || ""}
          competitionEntryFee={competition.entry_fee || ""}
          participantLimit={competition.participant_limit || null}
          registrationDeadline={competition.registration_deadline || null}
          competitionStatus={competition.status}
          initialParticipants={competition.participants as Participant[]}
          disciplines={competition.disciplines as Discipline[]}
        />
      </div>
    </main>
  );
}
