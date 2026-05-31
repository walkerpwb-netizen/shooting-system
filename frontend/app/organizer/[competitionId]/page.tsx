"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { apiUrl } from "@/lib/api";
import { isOrganizer } from "@/lib/auth";

type Competition = {
  id: number;
  name: string;
  date: string;
  location: string;
  entry_fee: string;
  organizer_full_name: string;
  organizer_logo: string;
  sponsors: string;
  sponsor_logo: string;
  participant_limit: number | null;
  status: string;
  disciplines_count: number;
  disciplines: {
    id: number;
    name: string;
    description: string;
    scoring_type: string;
    shots_count: number;
    ammo_type: string;
    ammo_price: string;
    entry_fee: string;
  }[];
  participants: {
    id: number;
    display_name: string;
    total_fee: string;
    checked_in: boolean;
    paid: boolean;
  }[];
  judges: {
    id: number;
    user_email: string;
    display_name: string;
    judge_license_number: string;
    is_head_judge: boolean;
  }[];
  judge_assignments: {
    id: number;
    judge_email: string;
    discipline_id: number | null;
    discipline_name: string;
    display_name: string;
    judge_license_number: string;
    is_head_judge: boolean;
  }[];
};

type JudgeSearchResult = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  club: string;
  phone_number: string;
  judge_license_number: string;
  judge_license_valid_until: string;
};

type ManualParticipantForm = {
  first_name: string;
  last_name: string;
  birth_date: string;
  license_number: string;
  club: string;
};

type ManualDisciplineSelection = {
  discipline_id: number;
  ammo_type: "" | "own" | "club";
};

type ManualFormErrors = Partial<Record<keyof ManualParticipantForm | "disciplines" | "ammo_type", string>>;

function parseFee(value: string) {
  const fee = Number((value || "0").replace(",", "."));

  return Number.isFinite(fee)
    ? fee
    : 0;
}

function formatFee(value: number) {
  return `${value.toFixed(2)} zł`;
}

const competitionStatusLabels: Record<string, string> = {
  draft: "Szkic",
  published: "Opublikowane",
  started: "Trwające",
  completed: "Zakończone",
};

function getCompetitionStatusLabel(status: string) {
  return competitionStatusLabels[status] || status;
}

function canViewCompetitionResults(status: string) {
  return status === "started" || status === "completed";
}

function isValidManualBirthDate(value: string) {
  const rawValue = value.trim();
  const isoMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const polishMatch = rawValue.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);

  const year = isoMatch
    ? Number(isoMatch[1])
    : polishMatch
      ? Number(polishMatch[3])
      : 0;
  const month = isoMatch
    ? Number(isoMatch[2])
    : polishMatch
      ? Number(polishMatch[2])
      : 0;
  const day = isoMatch
    ? Number(isoMatch[3])
    : polishMatch
      ? Number(polishMatch[1])
      : 0;

  if (!year || !month || !day || year < 1900) {
    return false;
  }

  const parsedDate = new Date(year, month - 1, day);
  const today = new Date();

  return (
    parsedDate.getFullYear() === year &&
    parsedDate.getMonth() === month - 1 &&
    parsedDate.getDate() === day &&
    parsedDate <= today
  );
}

export default function OrganizerCompetitionPage() {
  const router = useRouter();
  const params = useParams<{ competitionId: string }>();
  const competitionId = Number(params.competitionId);

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [judgeLicenseSearch, setJudgeLicenseSearch] = useState("");
  const [judgeSearchLoading, setJudgeSearchLoading] = useState(false);
  const [selectedJudge, setSelectedJudge] = useState<JudgeSearchResult | null>(null);
  const [judgeDiscipline, setJudgeDiscipline] = useState("");
  const [headJudge, setHeadJudge] = useState(false);
  const [showManualParticipantForm, setShowManualParticipantForm] = useState(false);
  const [manualParticipant, setManualParticipant] = useState<ManualParticipantForm>({
    first_name: "",
    last_name: "",
    birth_date: "",
    license_number: "",
    club: "",
  });
  const [manualDisciplines, setManualDisciplines] = useState<ManualDisciplineSelection[]>([]);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualFormMessage, setManualFormMessage] = useState("");
  const [manualFormErrors, setManualFormErrors] = useState<ManualFormErrors>({});

  useEffect(() => {
    if (!isOrganizer()) {
      router.push("/");
      return;
    }

    fetchOrganizerCompetitions();
  }, [router]);

  async function fetchOrganizerCompetitions() {
    const token = localStorage.getItem("token");

    try {
      const response = await fetch(
        apiUrl("/my-competitions"),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się pobrać zawodów ❌");
        return;
      }

      setCompetitions(data);
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setLoading(false);
    }
  }

  const competition = useMemo(
    () => competitions.find((item) => item.id === competitionId),
    [competitionId, competitions]
  );

  const assignedJudgeEmails = useMemo(() => {
    if (!competition) {
      return new Set<string>();
    }

    return new Set([
      ...competition.judge_assignments.map(
        (assignment) => assignment.judge_email
      ),
      ...competition.judges
        .filter((judge) => judge.is_head_judge)
        .map((judge) => judge.user_email),
    ]);
  }, [competition]);

  const headJudgeAssigned = useMemo(() => {
    if (!competition) {
      return false;
    }

    return competition.judge_assignments.some(
      (assignment) => assignment.is_head_judge
    );
  }, [competition]);


  const participantsTotalFee = useMemo(() => {
    if (!competition) {
      return 0;
    }

    return competition.participants.reduce(
      (sum, participant) => sum + parseFee(participant.total_fee),
      0
    );
  }, [competition]);

  const unpaidParticipantsTotalFee = useMemo(() => {
    if (!competition) {
      return 0;
    }

    return competition.participants.reduce(
      (sum, participant) =>
        participant.checked_in && participant.paid
          ? sum
          : sum + parseFee(participant.total_fee),
      0
    );
  }, [competition]);

  const manualTotalFee = useMemo(() => {
    if (!competition || manualDisciplines.length === 0) {
      return 0;
    }

    const competitionFee = parseFee(competition.entry_fee);
    let total = competitionFee;

    if (competitionFee === 0) {
      total += manualDisciplines.reduce((sum, selectedDiscipline) => {
        const discipline = competition.disciplines.find(
          (item) => item.id === selectedDiscipline.discipline_id
        );

        return sum + parseFee(discipline?.entry_fee || "");
      }, 0);
    }

    total += manualDisciplines.reduce((sum, selectedDiscipline) => {
      if (selectedDiscipline.ammo_type !== "club") {
        return sum;
      }

      const discipline = competition.disciplines.find(
        (item) => item.id === selectedDiscipline.discipline_id
      );

      if (!discipline) {
        return sum;
      }

      return sum + parseFee(discipline.ammo_price) * (discipline.shots_count || 0);
    }, 0);

    return total;
  }, [competition, manualDisciplines]);

  function manualInputClass(field: keyof ManualParticipantForm) {
    const hasError = Boolean(manualFormErrors[field]);

    return `w-full border rounded-xl px-3 py-3 ${
      hasError
        ? "border-red-300 bg-red-50 text-red-950 ring-1 ring-red-200"
        : "border-gray-300"
    }`;
  }

  function manualErrorText(field: keyof ManualParticipantForm) {
    if (!manualFormErrors[field]) {
      return null;
    }

    return (
      <p className="text-sm font-semibold text-red-700">
        {manualFormErrors[field]}
      </p>
    );
  }

  function updateManualParticipantField(
    field: keyof ManualParticipantForm,
    value: string
  ) {
    setManualParticipant((current) => ({
      ...current,
      [field]: value,
    }));
    setManualFormErrors((current) => {
      const updatedErrors = {
        ...current,
      };

      delete updatedErrors[field];

      return updatedErrors;
    });
  }

  function toggleManualDiscipline(disciplineId: number, checked: boolean) {
    setManualFormErrors((current) => {
      const updatedErrors = {
        ...current,
      };

      delete updatedErrors.disciplines;
      delete updatedErrors.ammo_type;

      return updatedErrors;
    });
    setManualDisciplines((current) => {
      if (!checked) {
        return current.filter((item) => item.discipline_id !== disciplineId);
      }

      if (current.some((item) => item.discipline_id === disciplineId)) {
        return current;
      }

      return [
        ...current,
        {
          discipline_id: disciplineId,
          ammo_type: "",
        },
      ];
    });
  }

  function updateManualAmmoType(
    disciplineId: number,
    ammoType: "own" | "club"
  ) {
    setManualFormErrors((current) => {
      const updatedErrors = {
        ...current,
      };

      delete updatedErrors.ammo_type;

      return updatedErrors;
    });
    setManualDisciplines((current) =>
      current.map((item) =>
        item.discipline_id === disciplineId
          ? {
              ...item,
              ammo_type: ammoType,
            }
          : item
      )
    );
  }

  function resetManualParticipantForm() {
    setManualParticipant({
      first_name: "",
      last_name: "",
      birth_date: "",
      license_number: "",
      club: "",
    });
    setManualDisciplines([]);
    setManualFormMessage("");
    setManualFormErrors({});
    setShowManualParticipantForm(false);
  }

  async function addManualParticipant() {
    if (!competition) {
      return;
    }

    const errors: ManualFormErrors = {};

    if (!manualParticipant.last_name.trim()) {
      errors.last_name = "Uzupełnij nazwisko.";
    }

    if (!manualParticipant.first_name.trim()) {
      errors.first_name = "Uzupełnij imię.";
    }

    if (!manualParticipant.birth_date.trim()) {
      errors.birth_date = "Uzupełnij datę urodzenia.";
    } else if (!isValidManualBirthDate(manualParticipant.birth_date)) {
      errors.birth_date = "Wpisz datę w formacie RRRR-MM-DD, np. 1987-03-18, albo DD.MM.RRRR.";
    }

    if (!manualParticipant.license_number.trim()) {
      errors.license_number = "Wpisz numer licencji albo Brak.";
    }

    if (!manualParticipant.club.trim()) {
      errors.club = "Wpisz klub albo Brak.";
    }

    if (manualDisciplines.length === 0) {
      errors.disciplines = "Wybierz minimum jedną konkurencję.";
    }

    if (manualDisciplines.some((discipline) => !discipline.ammo_type)) {
      errors.ammo_type = "Wybierz typ amunicji przy każdej wybranej konkurencji.";
    }

    if (Object.keys(errors).length > 0) {
      setMessage("");
      setManualFormErrors(errors);
      setManualFormMessage("Popraw podświetlone pola formularza.");
      return;
    }

    setManualFormErrors({});
    setManualFormMessage("");

    const token = localStorage.getItem("token");

    try {
      setManualSaving(true);
      setMessage("");

      const response = await fetch(
        apiUrl(`/organizer/competitions/${competition.id}/manual-participants`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...manualParticipant,
            disciplines: manualDisciplines,
          }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setManualFormMessage(data.detail || "Nie udało się dodać zawodnika.");
        return;
      }

      setMessage("Zawodnik dodany, obecność i opłata potwierdzone ✅");
      resetManualParticipantForm();
      fetchOrganizerCompetitions();
    } catch (error) {
      console.error(error);
      setManualFormMessage("Błąd połączenia z serwerem.");
    } finally {
      setManualSaving(false);
    }
  }

  function judgeDisplayName(judge: JudgeSearchResult) {
    return [judge.last_name, judge.first_name].filter(Boolean).join(" ")
      || judge.email;
  }

  async function searchJudgeByLicense() {
    const licenseNumber = judgeLicenseSearch.trim();

    if (!licenseNumber) {
      setMessage("Wpisz numer licencji sędziego ❌");
      return;
    }

    const token = localStorage.getItem("token");

    try {
      setJudgeSearchLoading(true);
      setSelectedJudge(null);
      setMessage("");

      const response = await fetch(
        apiUrl(`/organizer/judges/search?license_number=${encodeURIComponent(licenseNumber)}`),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie znaleziono sędziego ❌");
        return;
      }

      setSelectedJudge(data);
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setJudgeSearchLoading(false);
    }
  }

  async function inviteJudge() {
    if (!competition) {
      return;
    }

    if (!selectedJudge) {
      setMessage("Najpierw wyszukaj sędziego po numerze licencji ❌");
      return;
    }

    if (headJudge && headJudgeAssigned) {
      setMessage("Sędzia główny jest już przypisany do tych zawodów ❌");
      return;
    }

    if (!headJudge && !judgeDiscipline) {
      setMessage("Wybierz konkurencję albo zaznacz sędziego głównego ❌");
      return;
    }

    const token = localStorage.getItem("token");

    try {
      setMessage("");

      const response = await fetch(
        apiUrl(`/competitions/${competition.id}/judge-invitations`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            judge_license_number: selectedJudge.judge_license_number,
            discipline_ids: headJudge ? [] : [Number(judgeDiscipline)],
            is_head_judge: headJudge,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się przypisać sędziego ❌");
        return;
      }

      setMessage("Sędzia przypisany do zawodów ✅");
      setJudgeLicenseSearch("");
      setSelectedJudge(null);
      setJudgeDiscipline("");
      setHeadJudge(false);
      fetchOrganizerCompetitions();
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }


  async function removeJudgeAssignment(
    assignment: Competition["judge_assignments"][number]
  ) {
    if (!competition) {
      return;
    }

    const confirmed = window.confirm(
      "Czy usunąć to przypisanie sędziego?"
    );

    if (!confirmed) {
      return;
    }

    const token = localStorage.getItem("token");

    try {
      setMessage("");

      const response = await fetch(
        apiUrl(`/competitions/${competition.id}/judge-invitations/remove`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            judge_email: assignment.judge_email,
            discipline_id: assignment.discipline_id,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się usunąć przypisania sędziego ❌");
        return;
      }

      setMessage("Przypisanie sędziego usunięte ✅");
      fetchOrganizerCompetitions();
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  async function removeParticipant(
    participant: Competition["participants"][number]
  ) {
    if (!competition) {
      return;
    }

    const confirmed = window.confirm(
      `Czy usunąć zawodnika "${participant.display_name}" z listy tych zawodów?`
    );

    if (!confirmed) {
      return;
    }

    const token = localStorage.getItem("token");

    try {
      setMessage("");

      const response = await fetch(
        apiUrl(`/organizer/competitions/${competition.id}/participants/${participant.id}`),
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się usunąć zawodnika ❌");
        return;
      }

      setMessage("Zawodnik usunięty z listy zawodów ✅");
      fetchOrganizerCompetitions();
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    }
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <Link
            href="/organizer"
            className="inline-flex mb-5 bg-red-700 hover:bg-red-600 text-white px-5 py-3 rounded-xl font-bold shadow-lg shadow-red-950/30 transition"
          >
            Wróć do panelu organizatora
          </Link>

          <h1 className="text-5xl font-bold text-white mb-2">
            {competition?.name || "Szczegóły zawodów"}
          </h1>

          {competition && (
            <p className="text-gray-400">
              {competition.date} • {competition.location} • {getCompetitionStatusLabel(competition.status)}
            </p>
          )}
        </div>

        {message && (
          <p className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-white mb-6">
            {message}
          </p>
        )}

        {loading ? (
          <p className="text-gray-400">
            Ładowanie zawodów...
          </p>
        ) : !competition ? (
          <p className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-gray-300">
            Nie znaleziono tych zawodów w Twoim panelu.
          </p>
        ) : (
          <div className="grid xl:grid-cols-[1fr_1fr] gap-6">
            <section className="bg-white rounded-3xl p-6 text-black shadow-xl">
              <div className="flex items-center justify-between gap-4 mb-5">
                <h2 className="text-3xl font-bold">
                  {competition.name}
                </h2>

                <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-semibold">
                  {getCompetitionStatusLabel(competition.status)}
                </span>
              </div>

              {(competition.organizer_logo || competition.sponsor_logo) && (
                <div className="grid grid-cols-2 gap-3 mb-5">
                  {competition.organizer_logo && (
                    <div className="relative h-20 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden">
                      <Image
                        src={competition.organizer_logo}
                        alt="Logo organizatora"
                        fill
                        sizes="160px"
                        className="object-contain p-2"
                        unoptimized
                      />
                    </div>
                  )}

                  {competition.sponsor_logo && (
                    <div className="relative h-20 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden">
                      <Image
                        src={competition.sponsor_logo}
                        alt="Logo sponsora"
                        fill
                        sizes="160px"
                        className="object-contain p-2"
                        unoptimized
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2 text-gray-700 text-lg">
                <p>📅 {competition.date}</p>
                <p>📍 {competition.location}</p>
                {competition.organizer_full_name && (
                  <p>🏢 {competition.organizer_full_name}</p>
                )}
                {competition.sponsors && (
                  <p>🤝 Sponsorzy: {competition.sponsors}</p>
                )}
                <p>🎯 Dyscypliny: {competition.disciplines_count}</p>
                {competition.participant_limit && (
                  <p>
                    👥 Limit zawodników: {competition.participants.length}/{competition.participant_limit}
                  </p>
                )}
              </div>

              <div className="mt-6 border-t border-gray-200 pt-5">
                <h3 className="text-xl font-bold mb-3">
                  Konkurencje
                </h3>

                <div className="space-y-3">
                  {competition.disciplines.map((discipline) => (
                    <div
                      key={discipline.id}
                      className="border border-gray-200 rounded-2xl p-4"
                    >
                      <p className="font-bold">
                        {discipline.name}
                      </p>
                      <p className="text-gray-600">
                        {discipline.description || "Brak opisu"}
                      </p>
                      <p className="text-gray-700 text-sm mt-2">
                        Punktacja: {discipline.scoring_type}, strzały: {discipline.shots_count}
                      </p>
                      <p className="text-gray-700 text-sm">
                        Amunicja: {discipline.ammo_type || "brak"}, cena: {discipline.ammo_price || "0"} zł/szt.
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <div className="bg-white rounded-3xl p-6 text-black shadow-xl">
                <h2 className="text-2xl font-bold mb-4">
                  Sędziowie
                </h2>

                {competition.judges.length === 0 ? (
                  <p className="text-gray-500">
                    Brak sędziów dodanych do tych zawodów.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {competition.judges.map((judge) => (
                      <div
                        key={judge.id}
                        className="bg-green-50 rounded-xl px-3 py-2"
                      >
                        <p className="font-semibold">
                          {judge.display_name}
                          {assignedJudgeEmails.has(judge.user_email) && (
                            <span className="ml-2 text-green-800 font-bold">
                              przypisany
                            </span>
                          )}
                        </p>
                        {judge.judge_license_number && (
                          <p className="text-sm text-gray-600">
                            Licencja: {judge.judge_license_number}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-3xl p-6 text-black shadow-xl">
                <h2 className="text-2xl font-bold mb-4">
                  Przypisane funkcje
                </h2>

                {competition.judge_assignments.length === 0 ? (
                  <p className="text-gray-500">
                    Brak przypisanych funkcji sędziowskich.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {competition.judge_assignments.map((assignment) => (
                      <div
                        key={assignment.id}
                        className="bg-green-50 rounded-xl px-3 py-2 flex items-center justify-between gap-3"
                      >
                        <div>
                          <p>{assignment.display_name}</p>
                          <p className="text-sm text-gray-600">
                            {assignment.judge_license_number && (
                              <>Licencja: {assignment.judge_license_number} • </>
                            )}
                            {assignment.discipline_name}
                            {assignment.is_head_judge && (
                              <span className="ml-2 text-green-800 font-bold">
                                sędzia główny
                              </span>
                            )}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeJudgeAssignment(assignment)}
                          className="bg-red-700 hover:bg-red-600 text-white w-8 h-8 rounded-full font-black leading-none transition"
                          aria-label="Usuń przypisanie sędziego"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-3xl p-6 text-black shadow-xl space-y-4">
                <h2 className="text-2xl font-bold">
                  Przypisz sędziego do funkcji
                </h2>

                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <input
                    type="text"
                    value={judgeLicenseSearch}
                    onChange={(event) => {
                      setJudgeLicenseSearch(event.target.value);
                      setSelectedJudge(null);
                    }}
                    placeholder="Wpisz numer licencji sędziego"
                    className="w-full border border-gray-300 rounded-xl px-3 py-3"
                  />

                  <button
                    type="button"
                    onClick={searchJudgeByLicense}
                    disabled={judgeSearchLoading || !judgeLicenseSearch.trim()}
                    className="bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl font-semibold transition"
                  >
                    {judgeSearchLoading ? "Szukam..." : "Szukaj"}
                  </button>
                </div>

                {selectedJudge && (
                  <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
                    <p className="font-bold text-green-950">
                      {judgeDisplayName(selectedJudge)}
                    </p>
                    <p className="text-sm text-green-900">
                      Licencja: {selectedJudge.judge_license_number}
                    </p>
                    {selectedJudge.judge_license_valid_until && (
                      <p className="text-sm text-green-900">
                        Ważna do: {selectedJudge.judge_license_valid_until}
                      </p>
                    )}
                    {selectedJudge.club && (
                      <p className="text-sm text-green-900">
                        Klub: {selectedJudge.club}
                      </p>
                    )}
                  </div>
                )}

                <select
                  value={judgeDiscipline}
                  onChange={(event) => setJudgeDiscipline(event.target.value)}
                  disabled={headJudge}
                  className="w-full border border-gray-300 rounded-xl px-3 py-3 disabled:bg-gray-100 disabled:text-gray-500"
                >
                  <option value="">Wybierz konkurencję</option>

                  {competition.disciplines.map((discipline) => (
                    <option
                      key={discipline.id}
                      value={discipline.id}
                    >
                      {discipline.name}
                    </option>
                  ))}
                </select>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={headJudge}
                    onChange={(event) => {
                      setHeadJudge(event.target.checked);

                      if (event.target.checked) {
                        setJudgeDiscipline("");
                      }
                    }}
                    disabled={headJudgeAssigned}
                  />
                  Sędzia główny zawodów
                </label>

                {headJudgeAssigned && (
                  <p className="text-sm font-semibold text-yellow-700">
                    Sędzia główny jest już przypisany do tych zawodów.
                  </p>
                )}

                <button
                  type="button"
                  onClick={inviteJudge}
                  disabled={!selectedJudge || (!headJudge && !judgeDiscipline)}
                  className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold transition"
                >
                  Przypisz sędziego
                </button>
              </div>

              <div className="bg-white rounded-3xl p-6 text-black shadow-xl">
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-2xl font-bold">
                      Zawodnicy
                    </h2>
                    <p className="text-gray-500">
                      Suma opłat: {formatFee(participantsTotalFee)}
                    </p>
                  </div>

                  <span className={`px-4 py-2 rounded-xl font-bold ${
                    unpaidParticipantsTotalFee > 0
                      ? "bg-red-100 text-red-800"
                      : "bg-green-100 text-green-800"
                  }`}>
                    {unpaidParticipantsTotalFee > 0
                      ? "Do zapłaty"
                      : "Potwierdzone"}
                  </span>
                </div>

                <Link
                  href={`/organizer/${competition.id}/payments`}
                  className="block w-full bg-green-700 hover:bg-green-600 text-white text-center py-3 rounded-xl font-bold mb-4 transition"
                >
                  Otwórz listę obecności i opłat
                </Link>

                {canViewCompetitionResults(competition.status) && (
                  <Link
                    href={`/organizer/${competition.id}/results`}
                    className="block w-full bg-zinc-900 hover:bg-zinc-800 text-white text-center py-3 rounded-xl font-bold mb-4 transition"
                  >
                    Otwórz wyniki zawodów
                  </Link>
                )}

                {competition.status === "started" && (
                  <div className="mb-4">
                    <button
                      type="button"
                      onClick={() => setShowManualParticipantForm((current) => !current)}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-bold transition"
                    >
                      {showManualParticipantForm
                        ? "Zamknij formularz dodania zawodnika"
                        : "Dodaj zawodnika ręcznie"}
                    </button>

                    {showManualParticipantForm && (
                      <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-4">
                        {manualFormMessage && (
                          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 font-semibold">
                            {manualFormMessage}
                          </div>
                        )}

                        <div className="grid md:grid-cols-2 gap-3">
                          <label className="space-y-1">
                            <span className="text-sm font-semibold text-gray-700">
                              Nazwisko
                            </span>
                            <input
                              value={manualParticipant.last_name}
                              onChange={(event) => updateManualParticipantField("last_name", event.target.value)}
                              placeholder="Nazwisko"
                              className={manualInputClass("last_name")}
                            />
                            {manualErrorText("last_name")}
                          </label>

                          <label className="space-y-1">
                            <span className="text-sm font-semibold text-gray-700">
                              Imię
                            </span>
                            <input
                              value={manualParticipant.first_name}
                              onChange={(event) => updateManualParticipantField("first_name", event.target.value)}
                              placeholder="Imię"
                              className={manualInputClass("first_name")}
                            />
                            {manualErrorText("first_name")}
                          </label>

                          <label className="space-y-1">
                            <span className="text-sm font-semibold text-gray-700">
                              Data urodzenia
                            </span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={manualParticipant.birth_date}
                              onChange={(event) => updateManualParticipantField("birth_date", event.target.value)}
                              placeholder="Podaj datę urodzenia"
                              className={manualInputClass("birth_date")}
                            />
                            <p className={`text-sm ${
                              manualFormErrors.birth_date
                                ? "font-semibold text-red-700"
                                : "text-gray-500"
                            }`}>
                              Format: RRRR-MM-DD, np. 1987-03-18, albo DD.MM.RRRR.
                            </p>
                          </label>

                          <label className="space-y-1">
                            <span className="text-sm font-semibold text-gray-700">
                              Licencja
                            </span>
                            <input
                              value={manualParticipant.license_number}
                              onChange={(event) => updateManualParticipantField("license_number", event.target.value)}
                              placeholder="Nr licencji albo Brak"
                              className={manualInputClass("license_number")}
                            />
                            {manualErrorText("license_number")}
                          </label>

                          <label className="space-y-1 md:col-span-2">
                            <span className="text-sm font-semibold text-gray-700">
                              Klub
                            </span>
                            <input
                              value={manualParticipant.club}
                              onChange={(event) => updateManualParticipantField("club", event.target.value)}
                              placeholder="Klub albo Brak"
                              className={manualInputClass("club")}
                            />
                            {manualErrorText("club")}
                          </label>
                        </div>

                        <div className="space-y-3">
                          <p className="font-bold">
                            Konkurencje i amunicja
                          </p>
                          {(manualFormErrors.disciplines || manualFormErrors.ammo_type) && (
                            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                              {manualFormErrors.disciplines || manualFormErrors.ammo_type}
                            </div>
                          )}

                          {competition.disciplines.map((discipline) => {
                            const selectedDiscipline = manualDisciplines.find(
                              (item) => item.discipline_id === discipline.id
                            );
                            const disciplineHasError =
                              Boolean(manualFormErrors.disciplines) ||
                              Boolean(manualFormErrors.ammo_type && selectedDiscipline && !selectedDiscipline.ammo_type);

                            return (
                              <div
                                key={discipline.id}
                                className={`rounded-xl border p-3 ${
                                  disciplineHasError
                                    ? "border-red-300 bg-red-50 ring-1 ring-red-100"
                                    : "border-gray-200 bg-white"
                                }`}
                              >
                                <label className="flex items-center gap-2 font-bold">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(selectedDiscipline)}
                                    onChange={(event) => toggleManualDiscipline(discipline.id, event.target.checked)}
                                  />
                                  {discipline.name}
                                </label>

                                {selectedDiscipline && (
                                  <div className="grid sm:grid-cols-2 gap-2 mt-3 text-sm">
                                    <label className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                                      manualFormErrors.ammo_type && !selectedDiscipline.ammo_type
                                        ? "border-red-300 bg-white"
                                        : "border-gray-200"
                                    }`}>
                                      <input
                                        type="radio"
                                        name={`manual-ammo-${discipline.id}`}
                                        checked={selectedDiscipline.ammo_type === "own"}
                                        onChange={() => updateManualAmmoType(discipline.id, "own")}
                                      />
                                      Własna amunicja
                                    </label>

                                    <label className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                                      manualFormErrors.ammo_type && !selectedDiscipline.ammo_type
                                        ? "border-red-300 bg-white"
                                        : "border-gray-200"
                                    }`}>
                                      <input
                                        type="radio"
                                        name={`manual-ammo-${discipline.id}`}
                                        checked={selectedDiscipline.ammo_type === "club"}
                                        onChange={() => updateManualAmmoType(discipline.id, "club")}
                                      />
                                      Klubowa amunicja
                                    </label>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center">
                          <p className="text-red-700 font-bold">
                            Suma do zapłaty
                          </p>
                          <p className="text-3xl font-black text-red-700">
                            {formatFee(manualTotalFee)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={addManualParticipant}
                          disabled={manualSaving}
                          className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-60 text-white py-3 rounded-xl font-bold transition"
                        >
                          {manualSaving
                            ? "Dodawanie..."
                            : "Dodaj jako przybył i opłacone"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {competition.participants.length === 0 ? (
                  <p className="text-gray-500">
                    Brak zapisanych zawodników.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {competition.participants.map((participant) => {
                      const isConfirmed = participant.checked_in && participant.paid;

                      return (
                        <div
                          key={participant.id}
                          className="bg-gray-100 rounded-xl px-3 py-2 grid grid-cols-[1fr_auto_auto] gap-3 items-center"
                        >
                          <Link
                            href={`/profile/${participant.id}`}
                            className="font-semibold text-gray-900 transition hover:text-green-700"
                          >
                            {participant.display_name}
                          </Link>

                          <p className={isConfirmed
                            ? "font-black text-green-700"
                            : "font-black text-red-700"}
                          >
                            {isConfirmed
                              ? "Potwierdzony"
                              : formatFee(parseFee(participant.total_fee))}
                          </p>

                          <button
                            type="button"
                            onClick={() => removeParticipant(participant)}
                            className="bg-red-700 hover:bg-red-600 text-white w-8 h-8 rounded-full font-black leading-none transition"
                            aria-label="Usuń zawodnika z listy zawodów"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
