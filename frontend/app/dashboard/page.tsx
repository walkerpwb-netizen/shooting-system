"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { apiUrl } from "@/lib/api";

interface Competition {
  id: number;
  name: string;
  date: string;
  location: string;
}

export default function DashboardPage() {
  const router = useRouter();

  const [email] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return localStorage.getItem("email") || "";
  });
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    let ignore = false;

    if (!token) {
      router.push("/login");
      return;
    }

    async function loadCompetitions() {
      try {
        const response = await fetch(
          apiUrl("/competitions")
        );

        const data = await response.json();

        if (!ignore) {
          setCompetitions(data);
        }

      } catch (error) {
        console.error(error);
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadCompetitions();

    return () => {
      ignore = true;
    };
  }, [router]);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("email");

    router.push("/login");
  }

  return (
    <main className="min-h-screen">

      <div className="max-w-6xl mx-auto px-6 py-10">

        <div className="flex items-center justify-between mb-10">

          <div>
            <h2 className="text-4xl font-bold text-black mb-2">
              Dostępne zawody
            </h2>

            <p className="text-gray-600">
              Zalogowano jako {email || "użytkownik"}
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="bg-red-700 text-white px-5 py-3 rounded-xl font-semibold hover:bg-red-600 transition"
          >
            Wyloguj
          </button>

        </div>

        {loading ? (
          <p className="text-black">
            Ładowanie zawodów...
          </p>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">

            {competitions.map((competition) => (
              <div
                key={competition.id}
                className="bg-white rounded-3xl shadow-xl p-6"
              >

                <h3 className="text-2xl font-bold text-black mb-4">
                  {competition.name}
                </h3>

                <div className="space-y-2 mb-6">

                  <p className="text-gray-700">
                    📅 {competition.date}
                  </p>

                  <p className="text-gray-700">
                    📍 {competition.location}
                  </p>

                </div>

                <Link
                  href={`/competitions/${competition.id}`}
                  className="block w-full text-center bg-green-900 text-white py-3 rounded-xl font-semibold hover:bg-green-800 transition"
                >
                  Zapisz się
                </Link>

              </div>
            ))}

          </div>
        )}

      </div>

    </main>
  );
}
