"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { apiUrl } from "@/lib/api";
import {
  authFetch,
  getAccessToken,
  getAuthSnapshot,
  restoreSession,
  subscribeToAuthChange,
} from "@/lib/auth";
import { buildAuthPath, storeAuthRedirectPath } from "@/lib/authRedirect";
import {
  POWER_FACTOR_OPTIONS,
  getClayTargetsCount,
  getDynamicDisciplineDivisions,
  isDynamicStageDisciplineType,
} from "@/lib/disciplines";

const SPECIAL_PORONIN_COMPETITION_NAME = "II PUCHAR STRZELNICY PORONIN";
const SPECIAL_PORONIN_DISCOUNT_CLUB = "KŻR Warka";
const SPECIAL_PORONIN_DISCIPLINE_DISCOUNT = 10;

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
  discipline_type: string;
  shots_count: number;
  trap_variant?: string;
  trap_series_count?: number;
  clay_variant?: string;
  clay_series_count?: number;
  ammo_price: string;
  clay_price?: string;
  entry_fee: string;
  fixed_power_factor?: string;
  fixed_division?: string;
};

type SelectedDiscipline = {
  discipline_id: number;
  ammo_type: "" | "own" | "club";
  division: string;
  power_factor: "" | "minor" | "major";
};

type EntryState = {
  authSnapshot: string;
  entryType: string;
  loaded: boolean;
};

type ProfileState = {
  authSnapshot: string;
  profile: {
    email: string;
    club: string;
  };
  loaded: boolean;
};

type JoinCompetitionPanelProps = {
  competitionId: number;
  competitionEntryFee: string;
  participantLimit: number | null;
  competitionStatus: string;
  competitionName: string;
  competitionOrganizerName: string;
  clubDiscountEnabled: boolean;
  clubDiscountScope: "competition" | "discipline";
  clubDiscountAmount: string;
  clubDiscountClubs: string;
  registrationDeadline: string | null;
  initialParticipants: Participant[];
  disciplines: Discipline[];
};

export default function JoinCompetitionPanel({
  competitionId,
  competitionEntryFee,
  participantLimit,
  competitionStatus,
  competitionName,
  competitionOrganizerName,
  clubDiscountEnabled,
  clubDiscountScope,
  clubDiscountAmount,
  clubDiscountClubs,
  registrationDeadline,
  initialParticipants,
  disciplines,
}: JoinCompetitionPanelProps) {
  const router = useRouter();

  const [participants, setParticipants] = useState(initialParticipants);
  const [loading, setLoading] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [entryState, setEntryState] = useState<EntryState>({
    authSnapshot: "",
    entryType: "",
    loaded: false,
  });
  const [profileState, setProfileState] = useState<ProfileState>({
    authSnapshot: "",
    profile: {
      email: "",
      club: "",
    },
    loaded: false,
  });
  const [sessionChecked, setSessionChecked] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [selectedDisciplines, setSelectedDisciplines] = useState<SelectedDiscipline[]>([]);
  const authSnapshot = useSyncExternalStore(
    subscribeToAuthChange,
    getAuthSnapshot,
    () => ""
  );
  const [authToken, , , storedUserEmail] = authSnapshot.split("|");
  const hasStoredSession = Boolean(authToken && storedUserEmail);
  const competitionPath = `/competitions/${competitionId}`;
  const currentEntryType = entryState.authSnapshot === authSnapshot
    ? entryState.entryType
    : "";
  const entryLoaded = !hasStoredSession
    || (entryState.authSnapshot === authSnapshot && entryState.loaded);
  const currentUserProfile = profileState.authSnapshot === authSnapshot
    ? profileState.profile
    : {
        email: "",
        club: "",
      };
  const profileLoaded = !hasStoredSession
    || (profileState.authSnapshot === authSnapshot && profileState.loaded);

  useEffect(() => {
    let active = true;

    async function verifySession() {
      try {
        await restoreSession();
      } finally {
        if (active) {
          setSessionChecked(true);
        }
      }
    }

    void verifySession();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hasStoredSession || !sessionChecked) {
      return;
    }

    let active = true;

    async function loadMyEntry() {
      let entryType = "";

      try {
        const response = await authFetch(apiUrl(`/competitions/${competitionId}/my-entry`));

        if (!response.ok) {
          return;
        }

        const data = await response.json();
        entryType = data.entry_type || "";
      } catch (error) {
        console.error(error);
      } finally {
        if (active) {
          setEntryState({
            authSnapshot,
            entryType,
            loaded: true,
          });
        }
      }
    }

    void loadMyEntry();

    return () => {
      active = false;
    };
  }, [authSnapshot, competitionId, hasStoredSession, sessionChecked]);

  useEffect(() => {
    if (!hasStoredSession || !sessionChecked) {
      return;
    }

    let active = true;

    async function loadMyProfile() {
      const profile = {
        email: "",
        club: "",
      };

      try {
        const response = await authFetch(apiUrl("/me"));

        if (!response.ok) {
          return;
        }

        const data = await response.json();
        profile.email = data.email || storedUserEmail;
        profile.club = data.club || "";
      } catch (error) {
        console.error(error);
      } finally {
        if (active) {
          setProfileState({
            authSnapshot,
            profile,
            loaded: true,
          });
        }
      }
    }

    void loadMyProfile();

    return () => {
      active = false;
    };
  }, [authSnapshot, hasStoredSession, sessionChecked, storedUserEmail]);

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
          division: "",
          power_factor: "",
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

  function updateDynamicField(
    disciplineId: number,
    field: "division" | "power_factor",
    value: string
  ) {
    setSelectedDisciplines(
      selectedDisciplines.map((discipline) =>
        discipline.discipline_id === disciplineId
          ? {
              ...discipline,
              [field]: value,
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

  function getSelectedDiscipline(disciplineId: number) {
    return selectedDisciplines.find(
      (discipline) => discipline.discipline_id === disciplineId
    );
  }

  function parsePrice(value: string) {
    const price = Number(value.replace(",", "."));

    return Number.isFinite(price)
      ? price
      : 0;
  }

  function normalizeDiscountText(value: string) {
    return value.trim().toLowerCase();
  }

  function currentProfileClub() {
    return currentUserProfile.email
      ? currentUserProfile.club
      : "";
  }

  function poroninClubDiscountApplies() {
    return normalizeDiscountText(competitionName) === normalizeDiscountText(SPECIAL_PORONIN_COMPETITION_NAME)
      && normalizeDiscountText(currentProfileClub()) === normalizeDiscountText(SPECIAL_PORONIN_DISCOUNT_CLUB);
  }

  function configuredClubDiscountClubNames() {
    const clubNames = clubDiscountClubs
      .split(",")
      .map((clubName) => clubName.trim())
      .filter(Boolean);

    return clubNames.length > 0
      ? clubNames
      : competitionOrganizerName.trim()
        ? [competitionOrganizerName.trim()]
        : [];
  }

  function configuredClubDiscountMatch() {
    if (!clubDiscountEnabled) {
      return "";
    }

    const profileClub = normalizeDiscountText(currentProfileClub());

    if (!profileClub) {
      return "";
    }

    return configuredClubDiscountClubNames().find(
      (clubName) => normalizeDiscountText(clubName) === profileClub
    ) || "";
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
  const authStatePending = Boolean(
    hasStoredSession
    && (!sessionChecked || !entryLoaded || !profileLoaded)
  );
  const currentUserParticipant = participants.find(
    (participant) => participant.user_email === currentUserProfile.email
  );
  const userIsJoined = Boolean(
    !authStatePending
    && currentUserProfile.email
    && (currentUserParticipant || currentEntryType === "shooter")
  );
  const assignedAsJudge = currentEntryType === "judge" && !userIsJoined;
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
  const registrationDeadlineTime = registrationDeadline
    ? new Date(registrationDeadline).getTime()
    : null;
  const registrationClosedByDeadline = Boolean(
    registrationDeadlineTime
    && Number.isFinite(registrationDeadlineTime)
    && registrationDeadlineTime <= currentTime
  );
  const competitionFee = selectedDisciplines.length > 0
    ? parsePrice(competitionEntryFee)
    : 0;
  const disciplinesFee = competitionEntryFee
    ? 0
    : selectedDisciplineDetails.reduce(
        (sum, discipline) => sum + parsePrice(discipline.entry_fee),
        0
      );
  const baseEntryFee = competitionFee + disciplinesFee;
  const configuredClubDiscountClubName = configuredClubDiscountMatch();
  const configuredClubDiscount = configuredClubDiscountClubName
    ? Math.min(
        baseEntryFee,
        parsePrice(clubDiscountAmount) * (
          clubDiscountScope === "discipline"
            ? selectedDisciplineDetails.length
            : selectedDisciplineDetails.length > 0 ? 1 : 0
        )
      )
    : 0;
  const poroninClubDiscount = poroninClubDiscountApplies()
    ? Math.min(
        baseEntryFee,
        selectedDisciplineDetails.length * SPECIAL_PORONIN_DISCIPLINE_DISCOUNT
      )
    : 0;
  const clubDiscount = configuredClubDiscount > 0
    ? configuredClubDiscount
    : poroninClubDiscount;
  const ammoFee = selectedDisciplineDetails.reduce(
    (sum, discipline) => {
      if (discipline.selectedAmmoType !== "club") {
        return sum;
      }

      const clayTargetsCount = getClayTargetsCount(discipline);

      return sum
        + parsePrice(discipline.ammo_price) * discipline.shots_count
        + parsePrice(discipline.clay_price || "") * clayTargetsCount;
    },
    0
  );
  const totalFee = baseEntryFee - clubDiscount + ammoFee;
  const registrationOpen = ["published", "started"].includes(competitionStatus)
    && !registrationClosedByDeadline;

  useEffect(() => {
    if (!registrationDeadlineTime || !Number.isFinite(registrationDeadlineTime)) {
      return undefined;
    }

    const intervalId = window.setInterval(() => setCurrentTime(Date.now()), 30000);

    return () => window.clearInterval(intervalId);
  }, [registrationDeadlineTime]);

  function showNotice(message: string) {
    setNoticeMessage(message);
  }

  function closeNotice() {
    setNoticeMessage("");
  }

  async function joinCompetition() {
    const token = getAccessToken();

    if (!token) {
      storeAuthRedirectPath(competitionPath);
      router.push(buildAuthPath("/login", competitionPath));
      return;
    }

    if (selectedDisciplines.length === 0) {
      showNotice("Wybierz minimum jedną konkurencję");
      return;
    }

    if (registrationClosedByDeadline) {
      showNotice("Zapisy na te zawody zostały zakończone");
      return;
    }

    if (
      selectedDisciplines.some((discipline) => !discipline.ammo_type)
    ) {
      showNotice("Wybierz typ amunicji przy każdej konkurencji");
      return;
    }

    const missingDynamicFields = selectedDisciplines.some((selectedDiscipline) => {
      const discipline = disciplines.find((item) => item.id === selectedDiscipline.discipline_id);

      return Boolean(
        discipline
        && isDynamicStageDisciplineType(discipline.discipline_type)
        && (
          !selectedDiscipline.division
          && !discipline.fixed_division
          || (!discipline.fixed_power_factor && !selectedDiscipline.power_factor)
        )
      );
    });

    if (missingDynamicFields) {
      showNotice("Wybierz dywizję i Power Factor przy każdej konkurencji IPSC/dynamicznej, która tego wymaga");
      return;
    }

    if (participantLimitReached) {
      showNotice("Limit zawodników został osiągnięty");
      return;
    }

    try {
      setLoading(true);
      closeNotice();

      const response = await fetch(
        apiUrl(`/competitions/${competitionId}/join`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            entry_type: "shooter",
            disciplines: selectedDisciplines,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        showNotice(data.detail || "Nie udało się zapisać na zawody");
        return;
      }

      setParticipants(data.participants);
      setShowForm(false);
      setEntryState({
        authSnapshot,
        entryType: "shooter",
        loaded: true,
      });
      showNotice(
        competitionStatus === "started"
          ? "Zgłoszenie przyjęte. Pojawisz się na liście po potwierdzeniu udziału i opłaty przez organizatora."
          : "Jesteś zapisany na zawody."
      );
    } catch (error) {
      console.error(error);
      showNotice("Błąd połączenia z serwerem");
    } finally {
      setLoading(false);
    }
  }

  async function leaveCompetition() {
    const token = getAccessToken();

    if (!token) {
      storeAuthRedirectPath(competitionPath);
      router.push(buildAuthPath("/login", competitionPath));
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
      closeNotice();

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
        showNotice(data.detail || "Nie udało się wypisać z zawodów");
        return;
      }

      setParticipants(data.participants);
      setSelectedDisciplines([]);
      setEntryState({
        authSnapshot,
        entryType: "",
        loaded: true,
      });
      setShowForm(false);
      showNotice("Wypisano z zawodów.");
    } catch (error) {
      console.error(error);
      showNotice("Błąd połączenia z serwerem");
    } finally {
      setLoading(false);
    }
  }

  function openJoinForm() {
    closeNotice();

    if (!hasStoredSession) {
      storeAuthRedirectPath(competitionPath);
      router.push(buildAuthPath("/login", competitionPath));
      return;
    }

    if (registrationClosedByDeadline) {
      showNotice("Zapisy na te zawody zostały zakończone");
      return;
    }

    setShowForm(true);
  }

  return (
    <aside className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">
          Zawodnicy
        </h2>

        <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-gray-300">
          {participantLimit
            ? `${participants.length}/${participantLimit}`
            : participants.length}
        </span>
      </div>

      {participantLimit && (
        <p className="text-sm text-zinc-600 dark:text-gray-400">
          Limit zawodników: {participants.length}/{participantLimit}
        </p>
      )}

      {!registrationOpen ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-2 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950/50 dark:text-gray-300">
          <p>
            {competitionStatus === "started"
              ? "Zapisy są zamknięte, ponieważ zawody aktualnie trwają."
              : competitionStatus === "completed"
                ? "Zapisy są zamknięte, ponieważ zawody zostały zakończone."
                : registrationClosedByDeadline
                  ? "Zapisy są zamknięte, ponieważ termin zapisów minął."
                : "Zapisy są aktualnie zamknięte."}
          </p>

          {userIsJoined && (
            <p className="font-semibold">
              Jesteś zapisany jako zawodnik.
            </p>
          )}
        </div>
      ) : showForm ? (
        <div className="rounded-xl border border-zinc-200 p-4 space-y-4 dark:border-zinc-700">
          <h3 className="font-bold">
            Dołącz do zawodów
          </h3>

          <div className="space-y-4">
            {disciplines.map((discipline) => {
              const selected = isDisciplineSelected(discipline.id);
              const selectedDiscipline = getSelectedDiscipline(discipline.id);
              const dynamicDiscipline = isDynamicStageDisciplineType(discipline.discipline_type);
              const divisionOptions = getDynamicDisciplineDivisions(discipline.discipline_type);

              return (
                <div
                  key={discipline.id}
                  className="rounded-xl border border-zinc-200 p-4 space-y-3 dark:border-zinc-700"
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
                        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-gray-300">
                          <input
                            type="radio"
                            name={`ammo-${discipline.id}`}
                            checked={getAmmoType(discipline.id) === "own"}
                            onChange={() => updateAmmoType(discipline.id, "own")}
                          />
                          Własna amunicja
                        </label>

                        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-gray-300">
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
                        <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-200">
                          Wybierz z czyjej amunicji strzelasz.
                        </p>
                      )}

                      {dynamicDiscipline && selectedDiscipline && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {discipline.fixed_division ? (
                            <div className="rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-3 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-gray-300">
                              <span className="mb-2 block">Dywizja</span>
                              <span className="text-base font-bold text-zinc-950 dark:text-white">
                                Stała {discipline.fixed_division}
                              </span>
                            </div>
                          ) : (
                            <label className="block text-sm font-semibold text-zinc-700 dark:text-gray-300">
                              <span className="mb-2 block">Dywizja</span>
                              <select
                                value={selectedDiscipline.division}
                                onChange={(event) => updateDynamicField(discipline.id, "division", event.target.value)}
                                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                              >
                                <option value="">Wybierz dywizję</option>
                                {divisionOptions.map((division) => (
                                  <option key={division} value={division}>
                                    {division}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}

                          {discipline.fixed_power_factor ? (
                            <div className="rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-3 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-gray-300">
                              <span className="mb-2 block">Power Factor</span>
                              <span className="text-base font-bold text-zinc-950 dark:text-white">
                                Stały {discipline.fixed_power_factor === "major" ? "Major" : "Minor"}
                              </span>
                            </div>
                          ) : (
                            <label className="block text-sm font-semibold text-zinc-700 dark:text-gray-300">
                              <span className="mb-2 block">Power Factor</span>
                              <select
                                value={selectedDiscipline.power_factor}
                                onChange={(event) => updateDynamicField(discipline.id, "power_factor", event.target.value)}
                                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                              >
                                <option value="">Wybierz PF</option>
                                {POWER_FACTOR_OPTIONS.map((powerFactor) => (
                                  <option key={powerFactor} value={powerFactor}>
                                    {powerFactor === "major" ? "Major" : "Minor"}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                        </div>
                      )}

                      <p className="text-sm text-zinc-600 dark:text-gray-400">
                        Opłata startowa: {competitionEntryFee || discipline.entry_fee || "0"} zł
                        {getAmmoType(discipline.id) === "club" && (() => {
                          const clayTargetsCount = getClayTargetsCount(discipline);
                          const ammoAndClayFee = parsePrice(discipline.ammo_price) * discipline.shots_count
                            + parsePrice(discipline.clay_price || "") * clayTargetsCount;

                          return (
                            <>
                              {" "}+ {clayTargetsCount > 0 ? "amunicja i rzutki" : "amunicja"}: {ammoAndClayFee} zł
                            </>
                          );
                        })()}
                      </p>

                      {configuredClubDiscountClubName && clubDiscountScope === "discipline" && (
                        <p className="text-sm font-semibold text-green-700 dark:text-green-300">
                          Rabat klubowy {configuredClubDiscountClubName}: -{parsePrice(clubDiscountAmount).toFixed(2)} zł za tę konkurencję.
                        </p>
                      )}

                      {!configuredClubDiscountClubName && poroninClubDiscountApplies() && (
                        <p className="text-sm font-semibold text-green-700 dark:text-green-300">
                          Rabat klubowy KŻR Warka: -{SPECIAL_PORONIN_DISCIPLINE_DISCOUNT} zł za tę konkurencję.
                        </p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-center dark:border-red-700 dark:bg-red-950/30">
            <p className="mb-1 text-sm font-semibold text-red-700 dark:text-red-400">
              Suma do zapłaty
            </p>

            <p className="text-5xl font-black text-red-800 dark:text-red-500">
              {totalFee.toFixed(2)} zł
            </p>

            {clubDiscount > 0 && (
              <p className="mt-2 font-semibold text-green-700 dark:text-green-300">
                Uwzględniono rabat klubowy: -{clubDiscount.toFixed(2)} zł.
              </p>
            )}

            <p className="mt-3 text-red-700 dark:text-red-300">
              Opłatę uiszczasz w dniu zawodów organizatorowi.
            </p>
          </div>

          <p className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-center text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-200">
            Wypisanie się z zawodów jest możliwe najpóźniej 48 godzin przed zawodami.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={joinCompetition}
              disabled={loading || participantLimitReached || registrationClosedByDeadline}
              className="bg-green-800 hover:bg-green-700 disabled:opacity-50 transition text-white py-3 rounded-xl font-semibold"
            >
              {registrationClosedByDeadline
                ? "Zapisy zakończone"
                : participantLimitReached
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
          {assignedAsJudge && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-800 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-100">
              Organizator przypisał Cię do tych zawodów jako sędziego.
            </div>
          )}

          {waitingForOrganizerApproval ? (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-100">
              Zgłoszenie przyjęte. Pojawisz się na liście zawodników po potwierdzeniu udziału i opłaty przez organizatora.
            </div>
          ) : authStatePending ? (
            <button
              type="button"
              disabled
              className="w-full cursor-wait rounded-xl bg-zinc-600 py-4 font-semibold text-white opacity-80"
            >
              Sprawdzanie zapisu...
            </button>
          ) : userIsJoined ? (
            <button
              type="button"
              onClick={leaveCompetition}
              disabled={loading}
              className="w-full bg-red-800 hover:bg-red-700 disabled:opacity-50 transition text-white py-4 rounded-xl font-semibold"
            >
              {loading
                ? "Wypisywanie..."
                : "Wypisz się"}
            </button>
          ) : (
            <button
              type="button"
              onClick={openJoinForm}
              disabled={participantLimitReached || registrationClosedByDeadline}
              className="w-full bg-green-800 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition text-white py-4 rounded-xl font-semibold"
            >
              {registrationClosedByDeadline
                ? "Zapisy zakończone"
                : participantLimitReached
                ? "Limit miejsc osiągnięty"
                : "Zapisz się"}
            </button>
          )}

          <p className="text-center text-sm text-yellow-700 dark:text-yellow-200">
            Wypisanie się z zawodów jest możliwe najpóźniej 48 godzin przed zawodami.
          </p>
        </div>
      )}

      {participants.length === 0 ? (
        <p className="text-zinc-600 dark:text-gray-400">
          Nikt jeszcze nie dołączył do tych zawodów.
        </p>
      ) : (
        <div className="space-y-3">
          {participants.map((participant, index) => (
            <div
              key={participant.id}
              className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700"
            >
              <Link
                href={`/profile/${participant.id}`}
                className="font-bold transition hover:text-green-700 dark:hover:text-green-300"
              >
                {index + 1}. {participant.display_name}
              </Link>
            </div>
          ))}
        </div>
      )}

      {noticeMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 text-center text-zinc-950 shadow-2xl dark:border-zinc-700 dark:bg-zinc-950 dark:text-white">
            <h3 className="text-2xl font-bold">
              Komunikat
            </h3>

            <p className="mt-4 text-lg text-zinc-700 dark:text-gray-200">
              {noticeMessage}
            </p>

            <button
              type="button"
              onClick={closeNotice}
              className="mt-6 w-full rounded-xl bg-green-800 px-5 py-3 font-semibold text-white transition hover:bg-green-700"
            >
              Potwierdź
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
