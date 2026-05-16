"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { apiUrl } from "@/lib/api";

type UserProfile = {
  email: string;
  role: string;
  roles: string[];
  is_active: boolean;
  first_name: string;
  last_name: string;
  license_number: string;
  judge_license_number: string;
  club: string;
  birth_date: string;
  phone_number: string;
  requested_role: string;
  profile_complete: boolean;
};

const roleRequestLabels: Record<string, string> = {
  organizer: "organizatora",
  judge: "sędziego",
};

const profileRoleLabels: Record<string, string> = {
  user: "Strzelec",
  organizer: "Organizator",
  judge: "Sędzia",
  admin: "Administrator",
};

export default function ProfilePage() {
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingRoleRequest, setSendingRoleRequest] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [judgeLicenseNumber, setJudgeLicenseNumber] = useState("");
  const [club, setClub] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    let ignore = false;

    if (!token) {
      router.push("/login");
      return;
    }

    async function loadProfile() {
      try {
        const response = await fetch(
          apiUrl("/me"),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          router.push("/login");
          return;
        }

        const data = await response.json();

        if (!ignore) {
          setProfile(data);
          setFirstName(data.first_name);
          setLastName(data.last_name);
          setLicenseNumber(data.license_number);
          setJudgeLicenseNumber(data.judge_license_number);
          setClub(data.club);
          setBirthDate(data.birth_date);
          setPhoneNumber(data.phone_number);
          setEditing(!data.profile_complete);
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      ignore = true;
    };
  }, [router]);

  async function saveProfile() {
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/login");
      return;
    }

    if (!firstName || !lastName || !birthDate || !phoneNumber) {
      setMessage("Wypełnij wszystkie wymagane pola ❌");
      return;
    }

    try {
      setSaving(true);
      setMessage("");

      const response = await fetch(
        apiUrl("/me"),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            first_name: firstName,
            last_name: lastName,
            license_number: licenseNumber,
            judge_license_number: judgeLicenseNumber,
            club,
            birth_date: birthDate,
            phone_number: phoneNumber,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się zapisać profilu ❌");
        return;
      }

      setProfile(data);
      setEditing(false);
      setMessage("Profil zapisany ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setSaving(false);
    }
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("roles");
    localStorage.removeItem("email");

    router.push("/");
  }

  async function sendRoleRequest(role: "organizer" | "judge") {
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/login");
      return;
    }

    try {
      setSendingRoleRequest(true);
      setMessage("");

      const response = await fetch(
        apiUrl("/me/role-request"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            role,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się wysłać prośby ❌");
        return;
      }

      setProfile((currentProfile) =>
        currentProfile
          ? {
              ...currentProfile,
              requested_role: data.requested_role,
            }
          : currentProfile
      );
      setMessage("Prośba została wysłana do administratora ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setSendingRoleRequest(false);
    }
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-5xl font-bold text-white mb-8">
          Profil
        </h1>

        <div className="bg-white rounded-3xl shadow-xl p-8">
          {loading ? (
            <p className="text-black">
              Ładowanie profilu...
            </p>
          ) : profile ? (
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">
                    Email
                  </p>

                  <p className="text-xl font-bold text-black">
                    {profile.email}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-500 mb-1">
                    Status konta
                  </p>

                  <p className="text-xl font-bold text-black">
                    {profile.is_active
                      ? "Aktywne"
                      : "Nieaktywne"}
                  </p>
                </div>

              </div>

              {!profile.profile_complete && (
                <p className="bg-yellow-50 border border-yellow-200 text-yellow-900 rounded-xl p-4">
                  Uzupełnij profil, aby móc dołączyć do zawodów.
                </p>
              )}

              {editing ? (
                <>
                  <div className="grid md:grid-cols-2 gap-4">
                    <input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Imię"
                      className="border border-gray-300 rounded-xl px-4 py-3 text-black"
                    />

                    <input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Nazwisko"
                      className="border border-gray-300 rounded-xl px-4 py-3 text-black"
                    />

                    <input
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      placeholder="Nr. Licencji Zawodniczej"
                      className="border border-gray-300 rounded-xl px-4 py-3 text-black"
                    />

                    <input
                      value={judgeLicenseNumber}
                      onChange={(e) => setJudgeLicenseNumber(e.target.value)}
                      placeholder="Nr. Licencji Sędziowskiej"
                      className="border border-gray-300 rounded-xl px-4 py-3 text-black"
                    />

                    <input
                      value={club}
                      onChange={(e) => setClub(e.target.value)}
                      placeholder="Klub"
                      className="border border-gray-300 rounded-xl px-4 py-3 text-black"
                    />

                    <input
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      className="border border-gray-300 rounded-xl px-4 py-3 text-black"
                    />

                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="Nr telefonu"
                      className="border border-gray-300 rounded-xl px-4 py-3 text-black"
                    />
                  </div>

                  <div className="flex gap-4">
                    <button
                      onClick={saveProfile}
                      disabled={saving}
                      className="bg-green-900 text-white px-5 py-3 rounded-xl font-semibold hover:bg-green-800 disabled:opacity-50 transition"
                    >
                      {saving
                        ? "Zapisywanie..."
                        : "Zapisz profil"}
                    </button>

                    {profile.profile_complete && (
                      <button
                        onClick={() => setEditing(false)}
                        className="bg-gray-700 text-white px-5 py-3 rounded-xl font-semibold hover:bg-gray-600 transition"
                      >
                        Anuluj
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500 mb-1">
                        Imię
                      </p>

                      <p className="text-xl font-bold text-black">
                        {profile.first_name}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-gray-500 mb-1">
                        Nazwisko
                      </p>

                      <p className="text-xl font-bold text-black">
                        {profile.last_name}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-gray-500 mb-1">
                        Nr. Licencji Zawodniczej
                      </p>

                      <p className="text-xl font-bold text-black">
                        {profile.license_number || "Brak"}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-gray-500 mb-1">
                        Nr. Licencji Sędziowskiej
                      </p>

                      <p className="text-xl font-bold text-black">
                        {profile.judge_license_number || "Brak"}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-gray-500 mb-1">
                        Klub
                      </p>

                      <p className="text-xl font-bold text-black">
                        {profile.club || "Brak"}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-gray-500 mb-1">
                        Data urodzenia
                      </p>

                      <p className="text-xl font-bold text-black">
                        {profile.birth_date}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-gray-500 mb-1">
                        Telefon
                      </p>

                      <p className="text-xl font-bold text-black">
                        {profile.phone_number || "Brak numeru"}
                      </p>
                    </div>

                    <div className="md:col-span-2">
                      <p className="text-sm text-gray-500 mb-1">
                        Rola
                      </p>

                      <p className="text-xl font-bold text-black">
                        {profile.roles
                          .map((role) => profileRoleLabels[role] || role)
                          .join(", ")}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button
                      onClick={() => setEditing(true)}
                      className="bg-green-900 text-white px-5 py-3 rounded-xl font-semibold hover:bg-green-800 transition"
                    >
                      Edytuj profil
                    </button>

                    <button
                      onClick={logout}
                      className="bg-red-700 text-white px-5 py-3 rounded-xl font-semibold hover:bg-red-600 transition"
                    >
                      Wyloguj
                    </button>
                  </div>

                  {!profile.roles.includes("admin") && (
                    <div className="border border-gray-200 rounded-2xl p-5">
                      <h2 className="text-xl font-bold text-black mb-2">
                        Uprawnienia
                      </h2>

                      {profile.requested_role ? (
                        <p className="text-gray-700">
                          Twoja prośba o rolę {roleRequestLabels[profile.requested_role] || profile.requested_role} oczekuje na decyzję administratora.
                        </p>
                      ) : profile.roles.includes("organizer") && profile.roles.includes("judge") ? (
                        <p className="text-gray-700">
                          Masz już komplet uprawnień organizatora i sędziego.
                        </p>
                      ) : (
                        <>
                          <p className="text-gray-600 mb-4">
                            Możesz poprosić administratora o nadanie dodatkowej roli w systemie.
                          </p>

                          <div className="flex flex-wrap gap-3">
                            {!profile.roles.includes("organizer") && (
                              <button
                                type="button"
                                onClick={() => sendRoleRequest("organizer")}
                                disabled={sendingRoleRequest}
                                className="bg-blue-700 text-white px-5 py-3 rounded-xl font-semibold hover:bg-blue-600 disabled:opacity-50 transition"
                              >
                                Poproś o rolę organizatora
                              </button>
                            )}

                            {!profile.roles.includes("judge") && (
                              <button
                                type="button"
                                onClick={() => sendRoleRequest("judge")}
                                disabled={sendingRoleRequest}
                                className="bg-zinc-800 text-white px-5 py-3 rounded-xl font-semibold hover:bg-zinc-700 disabled:opacity-50 transition"
                              >
                                Poproś o rolę sędziego
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}

              {message && (
                <p className="text-black font-medium">
                  {message}
                </p>
              )}
            </div>
          ) : (
            <p className="text-black">
              Nie udało się pobrać profilu.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
