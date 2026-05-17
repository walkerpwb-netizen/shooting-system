"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { apiUrl } from "@/lib/api";

const subscribeToUserEmail = () => () => {};
const getUserEmailSnapshot = () => localStorage.getItem("email") || "";
const getServerUserEmailSnapshot = () => "";
const getUserRolesSnapshot = () => {
  const roles = localStorage.getItem("roles");

  if (roles) {
    return roles;
  }

  return localStorage.getItem("role") || "";
};

type Participant = {
  id: number;
  user_email: string;
  first_name: string;
  last_name: string;
  club: string;
  display_name: string;
};

type Discipline = {
  id: number;
  name: string;
  shots_count: number;
  ammo_price: string;
  entry_fee: string;
};

type SelectedDiscipline = {
  discipline_id: number;
  ammo_type: "" | "own" | "club";
};

type JoinCompetitionPanelProps = {
  competitionId: number;
  competitionEntryFee: string;
  participantLimit: number | null;
  competitionStatus: string;
  initialParticipants: Participant[];
  disciplines: Discipline[];
};

export default function JoinCompetitionPanel({
  competitionId,
  competitionEntryFee,
  participantLimit,
  competitionStatus,
  initialParticipants,
  disciplines,
}: JoinCompetitionPanelProps) {
  const router = useRouter();

  const [participants, setParticipants] = useState(initialParticipants);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [entryType, setEntryType] = useState<"shooter" | "judge">("shooter");
  const [currentEntryType, setCurrentEntryType] = useState("");
  const [selectedDisciplines, setSelectedDisciplines] = useState<SelectedDiscipline[]>([]);
  const currentUserEmail = useSyncExternalStore(
    subscribeToUserEmail,
    getUserEmailSnapshot,
    getServerUserEmailSnapshot
  );
  const userRolesSnapshot = useSyncExternalStore(
    subscribeToUserEmail,
    getUserRolesSnapshot,
    () => ""
  );

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      return;
    }

    async function loadMyEntry() {
      try {
        const response = await fetch(
          apiUrl(`/competitions/${competitionId}/my-entry`),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          return;
        }

        const data = await response.json();
        setCurrentEntryType(data.entry_type || "");
      } catch (error) {
        console.error(error);
      }
    }

    loadMyEntry();
  }, [competitionId]);

  function updateDisciplineSelection(
    disciplineId: number,
    checked: boolean
  ) {
    if (checked) {
      setSelectedDisciplines([
        ...selectedDisciplines,
        {
          discipline_id: disciplineId,
          ammo_type: "",
        },
      ]);
      return;
    }

    setSelectedDisciplines(
      selectedDisciplines.filter(
        (discipline) => discipline.discipline_id !== disciplineId
      )
    );
  }

  function updateAmmoType(
    disciplineId: number,
    ammoType: "own" | "club"
  ) {
    setSelectedDisciplines(
      selectedDisciplines.map((discipline) =>
        discipline.discipline_id === disciplineId
          ? {
              ...discipline,
              ammo_type: ammoType,
            }
          : discipline
      )
    );
  }

  function isDisciplineSelected(disciplineId: number) {
    return selectedDisciplines.some(
      (discipline) => discipline.discipline_id === disciplineId
    );
  }

  function getAmmoType(disciplineId: number) {
    return selectedDisciplines.find(
      (discipline) => discipline.discipline_id === disciplineId
    )?.ammo_type || "";
  }

  function parsePrice(value: string) {
    const price = Number(value.replace(",", "."));

    return Number.isFinite(price)
      ? price
      : 0;
  }

  function getSelectedDisciplineDetails() {
    return selectedDisciplines
      .map((selectedDiscipline) => {
        const discipline = disciplines.find(
          (item) => item.id === selectedDiscipline.discipline_id
        );

        if (!discipline) {
          return null;
        }

        return {
          ...discipline,
          selectedAmmoType: selectedDiscipline.ammo_type,
        };
      })
      .filter((discipline) => discipline !== null);
  }

  const selectedDisciplineDetails = getSelectedDisciplineDetails();
  const currentUserParticipant = participants.find(
    (participant) => participant.user_email === currentUserEmail
  );
  const userIsJoined = Boolean(currentUserParticipant || currentEntryType);
  const waitingForOrganizerApproval = Boolean(
    competitionStatus === "started"
    && currentEntryType === "shooter"
    && !currentUserParticipant
  );
  const participantLimitReached = Boolean(
    participantLimit
    && participants.length >= participantLimit
    && !userIsJoined
  );
  const userRoles = userRolesSnapshot
    .split(",")
    .filter(Boolean);
  const canJoinAsJudge = userRoles.includes("judge");
  const competitionFee = selectedDisciplines.length > 0
    ? parsePrice(competitionEntryFee)
    : 0;
  const disciplinesFee = competitionEntryFee
    ? 0
    : selectedDisciplineDetails.reduce(
        (sum, discipline) => sum + parsePrice(discipline.entry_fee),
        0
      );
  const ammoFee = selectedDisciplineDetails.reduce(
    (sum, discipline) => {
      if (discipline.selectedAmmoType !== "club") {
        return sum;
      }

      return sum + parsePrice(discipline.ammo_price) * discipline.shots_count;
    },
    0
  );
  const totalFee = competitionFee + disciplinesFee + ammoFee;
  const registrationOpen = ["published", "started"].includes(competitionStatus);

  async function joinCompetition() {
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/login");
      return;
    }

    if (entryType === "shooter" && selectedDisciplines.length === 0) {
      setMessage("Wybierz minimum jedną konkurencję ❌");
      return;
    }

    if (
      entryType === "shooter"
      && selectedDisciplines.some((discipline) => !discipline.ammo_type)
    ) {
      setMessage("Wybierz typ amunicji przy każdej konkurencji ❌");
      return;
    }

    if (entryType === "shooter" && participantLimitReached) {
      setMessage("Limit zawodników został osiągnięty ❌");
      return;
    }

    try {
      setLoading(true);
      setMessage("");

      const response = await fetch(
        apiUrl(`/competitions/${competitionId}/join`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            entry_type: entryType,
            disciplines: entryType === "judge"
              ? []
              : selectedDisciplines,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się zapisać na zawody ❌");
        return;
      }

      setParticipants(data.participants);
      setShowForm(false);
      setCurrentEntryType(entryType);
      setMessage(
        entryType === "judge"
          ? "Dołączono do zawodów jako sędzia ✅"
          : competitionStatus === "started"
            ? "Zgłoszenie przyjęte. Pojawisz się na liście po potwierdzeniu udziału i opłaty przez organizatora ✅"
            : "Jesteś zapisany na zawody ✅"
      );
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setLoading(false);
    }
  }

  async function leaveCompetition() {
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/login");
      return;
    }

    const confirmed = window.confirm(
      "Czy na pewno chcesz wypisać się z tych zawodów?"
    );

    if (!confirmed) {
      return;
    }

    try {
      setLoading(true);
      setMessage("");

      const response = await fetch(
        apiUrl(`/competitions/${competitionId}/leave`),
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się wypisać z zawodów ❌");
        return;
      }

      setParticipants(data.participants);
      setSelectedDisciplines([]);
      setCurrentEntryType("");
      setShowForm(false);
      setMessage("Wypisano z zawodów ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="bg-zinc-900 p-6 rounded-2xl space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">
          Zawodnicy
        </h2>

        <span className="bg-zinc-800 text-gray-300 px-3 py-1 rounded-full text-sm font-semibold">
          {participantLimit
            ? `${participants.length}/${participantLimit}`
            : participants.length}
        </span>
      </div>

      {participantLimit && (
        <p className="text-gray-400 text-sm">
          Limit zawodników: {participants.length}/{participantLimit}
        </p>
      )}

      {!registrationOpen ? (
        <div className="border border-zinc-700 bg-zinc-950/50 rounded-xl p-4 space-y-2 text-gray-300">
          <p>
            {competitionStatus === "started"
              ? "Zapisy są zamknięte, ponieważ zawody aktualnie trwają."
              : competitionStatus === "completed"
                ? "Zapisy są zamknięte, ponieważ zawody zostały zakończone."
                : "Zapisy są aktualnie zamknięte."}
          </p>

          {userIsJoined && (
            <p className="font-semibold">
              {currentEntryType === "judge"
                ? "Jesteś zapisany jako sędzia."
                : "Jesteś zapisany jako zawodnik."}
            </p>
          )}
        </div>
      ) : showForm ? (
        <div className="border border-zinc-700 rounded-xl p-4 space-y-4">
          <h3 className="font-bold">
            Dołącz do zawodów
          </h3>

          {canJoinAsJudge && (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setEntryType("shooter")}
                className={`py-3 rounded-xl font-semibold transition ${
                  entryType === "shooter"
                    ? "bg-green-800 text-white"
                    : "bg-zinc-800 text-gray-300 hover:bg-zinc-700"
                }`}
              >
                Jako strzelec
              </button>

              <button
                type="button"
                onClick={() => setEntryType("judge")}
                className={`py-3 rounded-xl font-semibold transition ${
                  entryType === "judge"
                    ? "bg-green-800 text-white"
                    : "bg-zinc-800 text-gray-300 hover:bg-zinc-700"
                }`}
              >
                Jako sędzia
              </button>
            </div>
          )}

          {entryType === "judge" ? (
            <p className="border border-blue-800 bg-blue-950/30 rounded-xl p-4 text-blue-100">
              Dołączasz jako sędzia. Opłata startowa nie jest naliczana i nie będziesz widoczny na publicznej liście zawodników.
            </p>
          ) : (
          <div className="space-y-4">
            {disciplines.map((discipline) => {
              const selected = isDisciplineSelected(discipline.id);

              return (
                <div
                  key={discipline.id}
                  className="border border-zinc-700 rounded-xl p-4 space-y-3"
                >
                  <label className="flex items-center gap-3 font-semibold">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) =>
                        updateDisciplineSelection(
                          discipline.id,
                          event.target.checked
                        )
                      }
                    />
                    {discipline.name}
                  </label>

                  {selected && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="flex items-center gap-2 text-sm text-gray-300">
                          <input
                            type="radio"
                            name={`ammo-${discipline.id}`}
                            checked={getAmmoType(discipline.id) === "own"}
                            onChange={() => updateAmmoType(discipline.id, "own")}
                          />
                          Własna amunicja
                        </label>

                        <label className="flex items-center gap-2 text-sm text-gray-300">
                          <input
                            type="radio"
                            name={`ammo-${discipline.id}`}
                            checked={getAmmoType(discipline.id) === "club"}
                            onChange={() => updateAmmoType(discipline.id, "club")}
                          />
                          Klubowa amunicja
                        </label>
                      </div>

                      {!getAmmoType(discipline.id) && (
                        <p className="text-sm font-semibold text-yellow-200">
                          Wybierz z czyjej amunicji strzelasz.
                        </p>
                      )}

                      <p className="text-sm text-gray-400">
                        Opłata startowa: {competitionEntryFee || discipline.entry_fee || "0"} zł
                        {getAmmoType(discipline.id) === "club" && (
                          <>
                            {" "}+ amunicja: {parsePrice(discipline.ammo_price) * discipline.shots_count} zł
                          </>
                        )}
                      </p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          )}

          {entryType === "shooter" && (
          <div className="border border-red-700 bg-red-950/30 rounded-xl p-5 text-center">
            <p className="text-red-400 text-sm font-semibold mb-1">
              Suma do zapłaty
            </p>

            <p className="text-red-500 text-5xl font-black">
              {totalFee.toFixed(2)} zł
            </p>

            <p className="text-red-300 mt-3">
              Opłatę uiszczasz w dniu zawodów organizatorowi.
            </p>
          </div>
          )}

          <p className="border border-yellow-700 bg-yellow-950/30 rounded-xl p-4 text-yellow-200 text-center">
            Wypisanie się z zawodów jest możliwe najpóźniej 48 godzin przed zawodami.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={joinCompetition}
              disabled={loading || (entryType === "shooter" && participantLimitReached)}
              className="bg-green-800 hover:bg-green-700 disabled:opacity-50 transition text-white py-3 rounded-xl font-semibold"
            >
              {participantLimitReached && entryType === "shooter"
                ? "Limit miejsc osiągnięty"
                : loading
                  ? "Zapisywanie..."
                  : "Potwierdź zapis"}
            </button>

            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="bg-zinc-700 hover:bg-zinc-600 transition text-white py-3 rounded-xl font-semibold"
            >
              Anuluj
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {waitingForOrganizerApproval ? (
            <div className="border border-yellow-700 bg-yellow-950/30 rounded-xl p-4 text-yellow-100">
              Zgłoszenie przyjęte. Pojawisz się na liście zawodników po potwierdzeniu udziału i opłaty przez organizatora.
            </div>
          ) : userIsJoined ? (
            <button
              type="button"
              onClick={leaveCompetition}
              disabled={loading}
              className="w-full bg-red-800 hover:bg-red-700 disabled:opacity-50 transition text-white py-4 rounded-xl font-semibold"
            >
              {loading
                ? "Wypisywanie..."
                : currentEntryType === "judge"
                  ? "Wypisz się jako sędzia"
                  : "Wypisz się"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMessage("");
                setShowForm(true);
              }}
              disabled={participantLimitReached && !canJoinAsJudge}
              className="w-full bg-green-800 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition text-white py-4 rounded-xl font-semibold"
            >
              {participantLimitReached && !canJoinAsJudge
                ? "Limit miejsc osiągnięty"
                : "Zapisz się"}
            </button>
          )}

          <p className="text-yellow-200 text-center text-sm">
            Wypisanie się z zawodów jest możliwe najpóźniej 48 godzin przed zawodami.
          </p>
        </div>
      )}

      {participants.length === 0 ? (
        <p className="text-gray-400">
          Nikt jeszcze nie dołączył do tych zawodów.
        </p>
      ) : (
        <div className="space-y-3">
          {participants.map((participant, index) => (
            <div
              key={participant.id}
              className="border border-zinc-700 rounded-xl p-4"
            >
              <Link
                href={`/profile/${participant.id}`}
                className="font-bold transition hover:text-green-300"
              >
                {index + 1}. {participant.display_name}
              </Link>
            </div>
          ))}
        </div>
      )}

      {message && (
        <p className="text-center text-gray-300 font-medium">
          {message}
        </p>
      )}
    </aside>
  );
}
