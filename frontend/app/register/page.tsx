"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { apiUrl } from "@/lib/api";

type RegisterType = "user" | "pzss-club";

const requiredConsents = [
  {
    id: "termsAccepted",
    label: "Akceptuję Regulamin",
    linkHref: "/regulamin",
    linkLabel: "Przeczytaj Regulamin",
  },
  {
    id: "privacyAccepted",
    label: "Zapoznałem się z polityką prywatności",
    linkHref: "/polityka-prywatnosci",
    linkLabel: "Przeczytaj Politykę prywatności",
  },
  {
    id: "resultsPublicationAccepted",
    label: "Rozumiem zasady publikacji wyników i rankingów",
    linkHref: "/publikacja-wynikow",
    linkLabel: "Przeczytaj zasady publikacji wyników",
  },
] as const;

type ConsentId = typeof requiredConsents[number]["id"];

const CONSENT_REQUIRED_MESSAGE = "Zgody są wymagane!";

function validatePassword(password: string) {
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasMinLength = password.length >= 8;

  return hasUppercase && hasNumber && hasMinLength;
}

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialType: RegisterType = searchParams.get("type") === "pzss-club"
    ? "pzss-club"
    : "user";
  const [registerType, setRegisterType] = useState<RegisterType>(initialType);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [clubShortName, setClubShortName] = useState("");
  const [clubFullName, setClubFullName] = useState("");
  const [clubPhoneNumber, setClubPhoneNumber] = useState("");
  const [consents, setConsents] = useState<Record<ConsentId, boolean>>({
    termsAccepted: false,
    privacyAccepted: false,
    resultsPublicationAccepted: false,
  });
  const [showConsentErrors, setShowConsentErrors] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  function updateConsent(consentId: ConsentId, checked: boolean) {
    const nextConsents = {
      ...consents,
      [consentId]: checked,
    };

    setConsents(nextConsents);

    if (requiredConsents.every((consent) => nextConsents[consent.id])) {
      setShowConsentErrors(false);
      setMessage((currentMessage) => (
        currentMessage === CONSENT_REQUIRED_MESSAGE ? "" : currentMessage
      ));
    }
  }

  async function handleRegister() {
    setMessage("");

    if (!validateEmail(email)) {
      setMessage("Podaj poprawny adres e-mail");
      return;
    }

    if (registerType === "pzss-club" && !clubShortName.trim()) {
      setMessage("Podaj nazwę skróconą klubu zgodną z PZSS");
      return;
    }

    if (registerType === "pzss-club" && !clubFullName.trim()) {
      setMessage("Podaj pełną nazwę klubu zgodną z PZSS");
      return;
    }

    if (registerType === "pzss-club" && !clubPhoneNumber.trim()) {
      setMessage("Podaj numer telefonu do szybkiej weryfikacji klubu");
      return;
    }

    if (password !== repeatPassword) {
      setMessage("Hasła nie są identyczne");
      return;
    }

    if (!validatePassword(password)) {
      setMessage("Hasło musi mieć minimum 8 znaków, 1 dużą literę i 1 cyfrę");
      return;
    }

    if (!requiredConsents.every((consent) => consents[consent.id])) {
      setShowConsentErrors(true);
      setMessage(CONSENT_REQUIRED_MESSAGE);
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        apiUrl(registerType === "pzss-club" ? "/register/pzss-club" : "/register"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(registerType === "pzss-club"
            ? {
                short_name: clubShortName.trim(),
                full_name: clubFullName.trim(),
                email,
                phone_number: clubPhoneNumber.trim(),
                password,
                terms_accepted: consents.termsAccepted,
                privacy_policy_accepted: consents.privacyAccepted,
                results_publication_accepted: consents.resultsPublicationAccepted,
              }
            : {
                email,
                password,
                terms_accepted: consents.termsAccepted,
                privacy_policy_accepted: consents.privacyAccepted,
                results_publication_accepted: consents.resultsPublicationAccepted,
              }
          ),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się utworzyć konta");
        return;
      }

      if (data.message === "E-mail już istnieje") {
        setMessage("Ten e-mail jest już zajęty");
        return;
      }

      const successMessage = registerType === "pzss-club"
        ? "Konto klubu zostało utworzone. Aktywuj je linkiem z e-maila, a potem poczekaj na weryfikację administratora"
        : "Konto zostało utworzone. Aktywuj je linkiem z e-maila";

      setEmail("");
      setPassword("");
      setRepeatPassword("");
      setClubShortName("");
      setClubFullName("");
      setClubPhoneNumber("");
      setConsents({
        termsAccepted: false,
        privacyAccepted: false,
        resultsPublicationAccepted: false,
      });
      setShowConsentErrors(false);
      window.alert(successMessage);
      router.push("/login");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem");
    } finally {
      setLoading(false);
    }
  }

  const isClubRegistration = registerType === "pzss-club";

  return (
    <main className="min-h-screen w-full flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl p-8">
        <div className="mb-6 grid grid-cols-2 rounded-xl bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setRegisterType("user")}
            className={`rounded-lg px-4 py-3 font-bold transition ${!isClubRegistration ? "bg-green-900 text-white" : "text-gray-700"}`}
          >
            Użytkownik
          </button>

          <button
            type="button"
            onClick={() => setRegisterType("pzss-club")}
            className={`rounded-lg px-4 py-3 font-bold transition ${isClubRegistration ? "bg-green-900 text-white" : "text-gray-700"}`}
          >
            Klub PZSS
          </button>
        </div>

        <h1 className="text-4xl font-bold text-black mb-2 text-center">
          {isClubRegistration ? "Rejestracja klubu PZSS" : "Rejestracja"}
        </h1>

        <p className="text-gray-500 text-center mb-8">
          {isClubRegistration
            ? "Konto zostanie aktywowane mailem, a potem ręcznie zweryfikowane przez administratora"
            : "Utwórz nowe konto"}
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleRegister();
          }}
          className="flex flex-col gap-4"
        >
          {isClubRegistration && (
            <>
              <input
                required
                value={clubShortName}
                onChange={(event) => setClubShortName(event.target.value)}
                placeholder="Nazwa skrócona tak jak w PZSS"
                className="border border-gray-300 rounded-xl px-4 py-3 text-black"
              />

              <input
                required
                value={clubFullName}
                onChange={(event) => setClubFullName(event.target.value)}
                placeholder="Nazwa pełna tak jak w PZSS"
                className="border border-gray-300 rounded-xl px-4 py-3 text-black"
              />
            </>
          )}

          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={isClubRegistration ? "E-mail tak jak w PZSS" : "Adres e-mail"}
            className="border border-gray-300 rounded-xl px-4 py-3 text-black"
          />

          {isClubRegistration && (
            <input
              type="tel"
              required
              value={clubPhoneNumber}
              onChange={(event) => setClubPhoneNumber(event.target.value)}
              placeholder="Nr telefonu do szybkiej weryfikacji klubu"
              className="border border-gray-300 rounded-xl px-4 py-3 text-black"
            />
          )}

          <input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Hasło"
            className="border border-gray-300 rounded-xl px-4 py-3 text-black"
          />

          <input
            type="password"
            required
            value={repeatPassword}
            onChange={(event) => setRepeatPassword(event.target.value)}
            placeholder="Powtórz hasło"
            className="border border-gray-300 rounded-xl px-4 py-3 text-black"
          />

          <div className="text-sm text-gray-500">
            Hasło musi zawierać: minimum 8 znaków, 1 dużą literę i 1 cyfrę.
          </div>

          <fieldset className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <legend className="px-1 text-sm font-bold text-gray-700">
              Wymagane zgody
            </legend>

            {requiredConsents.map((consent) => (
              <div
                key={consent.id}
                className={`rounded-xl border p-3 shadow-sm transition ${
                  showConsentErrors && !consents[consent.id]
                    ? "border-red-500 bg-red-50"
                    : "border-white bg-white"
                }`}
              >
                <label className="flex items-start gap-3 text-sm font-semibold text-black">
                  <input
                    type="checkbox"
                    aria-required="true"
                    aria-invalid={showConsentErrors && !consents[consent.id]}
                    checked={consents[consent.id]}
                    onChange={(event) => updateConsent(consent.id, event.target.checked)}
                    className={`mt-1 h-5 w-5 rounded accent-green-900 ${
                      showConsentErrors && !consents[consent.id]
                        ? "outline outline-2 outline-red-500"
                        : "border-gray-300"
                    }`}
                  />
                  <span>
                    {consent.label}
                  </span>
                </label>

                {showConsentErrors && !consents[consent.id] && (
                  <p className="ml-8 mt-1 text-sm font-semibold text-red-600">
                    Ta zgoda jest wymagana
                  </p>
                )}

                <Link
                  href={consent.linkHref}
                  className="ml-8 mt-1 block text-sm font-semibold text-green-900 underline-offset-4 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {consent.linkLabel}
                </Link>
              </div>
            ))}
          </fieldset>

          <button
            type="submit"
            disabled={loading}
            className="bg-green-900 text-white py-3 rounded-xl font-semibold hover:bg-green-800 transition disabled:opacity-50"
          >
            {loading ? "Tworzenie konta..." : isClubRegistration ? "Utwórz konto klubu" : "Utwórz konto"}
          </button>

          {message && (
            <p className="text-center text-black font-medium">
              {message}
            </p>
          )}
        </form>

        <div className="mt-6 text-center">
          <p className="text-black">Masz już konto?</p>
          <Link href="/login" className="text-green-900 font-semibold">
            Logowanie
          </Link>
        </div>
      </div>
    </main>
  );
}


export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
