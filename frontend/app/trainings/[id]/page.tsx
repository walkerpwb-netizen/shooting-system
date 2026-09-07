import type { Metadata } from "next";

import JoinCompetitionPanel from "@/app/competitions/[id]/JoinCompetitionPanel";
import LogoPreviewLink from "@/app/competitions/[id]/LogoPreviewLink";
import RegistrationCountdown from "@/app/competitions/[id]/RegistrationCountdown";
import DisciplineDescription from "@/app/components/DisciplineDescription";
import { apiUrl } from "@/lib/api";
import { getClayTargetsCount } from "@/lib/disciplines";
import { getDirectionsHref, hasMapCoordinates } from "@/lib/maps";

type TrainingPageProps = {
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

type Training = {
  id: number;
  name: string;
  event_type?: "competition" | "training";
  description?: string;
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

async function getTraining(id: string) {
  const response = await fetch(
    apiUrl(`/trainings/${id}`),
    {
      cache: "no-store",
    }
  );

  if (!response.ok) {
    return null;
  }

  return response.json() as Promise<Training>;
}

export async function generateMetadata({
  params,
}: TrainingPageProps): Promise<Metadata> {
  const { id } = await params;
  const training = await getTraining(id);

  if (!training) {
    return {
      title: "Nie znaleziono szkolenia | System Strzelecki",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const organizer = training.organizer_full_name
    ? ` Organizator: ${training.organizer_full_name}.`
    : "";
  const blocksCount = training.disciplines.length
    ? ` Liczba bloków: ${training.disciplines.length}.`
    : "";
  const description = truncateDescription(
    training.description
      ? training.description
      : `Szkolenie strzeleckie ${training.name}. Data: ${training.date}. Miejsce: ${training.location}.${organizer}${blocksCount}`
  );
  const title = `${training.name} | Szkolenie strzeleckie`;
  const imageUrl = metadataImageUrl(training.organizer_logo);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `/trainings/${training.id}`,
      siteName: "System Strzelecki",
      type: "article",
      images: imageUrl
        ? [
            {
              url: imageUrl,
              alt: `Logo organizatora szkolenia ${training.name}`,
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
      canonical: `/trainings/${training.id}`,
    },
  };
}

export default async function TrainingPage({
  params,
}: TrainingPageProps) {
  const { id } = await params;
  const training = await getTraining(id);

  if (!training) {
    return (
      <main className="min-h-screen bg-white p-10 text-zinc-950 dark:bg-black dark:text-white">
        <h1 className="text-4xl font-bold mb-6">
          Nie znaleziono szkolenia
        </h1>
      </main>
    );
  }

  const hasDirections = hasMapCoordinates(training.latitude, training.longitude);
  const directionsLatitude = hasDirections ? training.latitude as number : null;
  const directionsLongitude = hasDirections ? training.longitude as number : null;
  const directionsHref = hasDirections
    ? getDirectionsHref(directionsLatitude as number, directionsLongitude as number)
    : "";

  return (
    <main className="min-h-screen bg-white p-6 text-zinc-950 dark:bg-black dark:text-white sm:p-10">
      <RegistrationCountdown
        registrationDeadline={training.registration_deadline}
        participantsCount={training.participants.length}
        minParticipants={training.min_participants || null}
      />

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-4xl font-bold">
          {training.name}
        </h1>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
            <p className="text-zinc-700 dark:text-gray-300">
              Data: {training.date}
            </p>

            {hasDirections ? (
              <a
                href={directionsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex text-left text-zinc-700 underline decoration-green-700/60 underline-offset-4 transition hover:text-green-700 dark:text-gray-300 dark:hover:text-green-400"
                title="Nawiguj do miejsca szkolenia"
              >
                Lokalizacja: {training.location}
              </a>
            ) : (
              <p className="text-zinc-700 dark:text-gray-300">
                Lokalizacja: {training.location}
              </p>
            )}

            <p className="text-zinc-700 dark:text-gray-300">
              Cena udziału: {training.entry_fee ? `${training.entry_fee} zł` : "nie podano"}
            </p>

            {training.participant_limit && (
              <p className="text-zinc-700 dark:text-gray-300">
                Limit uczestników: {training.participants.length}/{training.participant_limit}
              </p>
            )}

            {training.min_participants && (
              <p className="text-zinc-700 dark:text-gray-300">
                Minimum uczestników: {training.participants.length}/{training.min_participants}
              </p>
            )}
          </section>

          {training.description && (
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-2xl font-bold mb-4">
                Opis i przebieg szkolenia
              </h2>

              <p className="whitespace-pre-wrap text-zinc-700 dark:text-gray-300">
                {training.description}
              </p>
            </section>
          )}

          {(training.organizer_full_name || training.organizer_logo || training.sponsors || training.sponsor_logo) && (
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
              <h2 className="text-2xl font-bold">
                Organizator i sponsorzy
              </h2>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-zinc-200 p-4 space-y-3 dark:border-zinc-700">
                  <div className="h-24 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 flex items-center justify-center overflow-hidden text-zinc-500 text-sm font-semibold dark:border-zinc-600 dark:bg-zinc-950 dark:text-gray-500">
                    {training.organizer_logo ? (
                      <LogoPreviewLink
                        src={training.organizer_logo}
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
                      {training.organizer_full_name || "Nie podano"}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 p-4 space-y-3 dark:border-zinc-700">
                  <div className="h-24 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 flex items-center justify-center overflow-hidden text-zinc-500 text-sm font-semibold dark:border-zinc-600 dark:bg-zinc-950 dark:text-gray-500">
                    {training.sponsor_logo ? (
                      <LogoPreviewLink
                        src={training.sponsor_logo}
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
                      {training.sponsors || "Brak sponsorów"}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {training.disciplines.length > 0 && (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-2xl font-bold mb-4">
              Bloki szkolenia
            </h2>

            <div className="space-y-3">
              {training.disciplines.map((discipline: Discipline) => (
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

                  {!training.entry_fee && (
                    <p className="text-zinc-700 dark:text-gray-300">
                      Cena bloku: {discipline.entry_fee || "0"} zł
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
          )}
        </div>

        <JoinCompetitionPanel
          competitionId={training.id}
          eventType="training"
          detailsHrefBase="/trainings"
          competitionName={training.name}
          competitionOrganizerName={training.organizer_full_name || ""}
          clubDiscountEnabled={Boolean(training.club_discount_enabled)}
          clubDiscountScope={training.club_discount_scope === "discipline" ? "discipline" : "competition"}
          clubDiscountAmount={training.club_discount_amount || ""}
          clubDiscountClubs={training.club_discount_clubs || training.organizer_full_name || ""}
          competitionEntryFee={training.entry_fee || ""}
          participantLimit={training.participant_limit || null}
          registrationDeadline={training.registration_deadline || null}
          competitionStatus={training.status}
          initialParticipants={training.participants as Participant[]}
          disciplines={training.disciplines as Discipline[]}
        />
      </div>
    </main>
  );
}
