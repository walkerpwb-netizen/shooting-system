"use client";

import type { ChangeEvent, PointerEvent, ReactNode } from "react";
import NextImage from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import QrCode from "@/components/QrCode";
import QrCodeScanner from "@/components/QrCodeScanner";
import { apiUrl } from "@/lib/api";
import { getAccessToken, clearStoredAuth, notifyAuthChange } from "@/lib/auth";

type VerifiedPzssClub = {
  id: number;
  short_name: string;
  full_name: string;
  license_number: string;
};

type UserProfile = {
  email: string;
  role: string;
  roles: string[];
  is_active: boolean;
  first_name: string;
  last_name: string;
  license_number: string;
  license_uuid: string;
  license_club_code: string;
  no_license: boolean;
  judge_license_number: string;
  judge_license_valid_until: string;
  club: string;
  no_club: boolean;
  voivodeship: string;
  birth_date: string;
  phone_number: string;
  organizer_name: string;
  requested_role: string;
  premium_until: string;
  premium_disabled: boolean;
  premium_organizer_disabled: boolean;
  profile_photo_url: string;
  account_type: string;
  pzss_club_short_name: string;
  pzss_club_full_name: string;
  pzss_club_license_number: string;
  pzss_club_status: string;
  verified_club_id: number | null;
  club_membership_status: string;
  profile_complete: boolean;
};

type ProfileSettings = {
  label_color: string;
  value_color: string;
  label_font_size: string;
  value_font_size: string;
  row_gap: string;
};

type LicenseQrProfileData = {
  firstName: string;
  lastName: string;
  licenseNumber: string;
  licenseUuid: string;
  club: string;
  licenseClubCode: string;
};

type ProfilePhotoCropSize = {
  width: number;
  height: number;
};

type ProfilePhotoCropRect = {
  sx: number;
  sy: number;
  side: number;
};

type ProfilePhotoCropDrag = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startCropX: number;
  startCropY: number;
};

const profileRoleLabels: Record<string, string> = {
  user: "Użytkownik",
  shooter: "Strzelec",
  organizer: "Organizator",
  judge: "Sędzia",
  admin: "Administrator",
};

const voivodeships = [
  "dolnośląskie",
  "kujawsko-pomorskie",
  "lubelskie",
  "lubuskie",
  "łódzkie",
  "małopolskie",
  "mazowieckie",
  "opolskie",
  "podkarpackie",
  "podlaskie",
  "pomorskie",
  "śląskie",
  "świętokrzyskie",
  "warmińsko-mazurskie",
  "wielkopolskie",
  "zachodniopomorskie",
];

function qrFieldToString(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function licenseNumberDigits(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeClubSearch(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("pl-PL")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ł/g, "l");
}

function licenseQrPayloadFromProfile(profile: UserProfile) {
  const licenseNumber = profile.no_license ? "" : profile.license_number;
  const club = profile.no_club ? "" : profile.club;

  return JSON.stringify([
    profile.first_name || "",
    profile.last_name || "",
    licenseNumber || "",
    licenseNumberDigits(licenseNumber || ""),
    profile.license_uuid || "",
    club || "",
    profile.no_club ? "" : profile.license_club_code || "",
  ]);
}

function premiumTimeLeft(premiumUntil: string) {
  const targetTime = new Date(premiumUntil).getTime();

  if (!premiumUntil || Number.isNaN(targetTime)) {
    return null;
  }

  const diff = Math.max(targetTime - Date.now(), 0);
  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  return {
    days,
    hours,
    minutes,
    expired: diff <= 0,
  };
}

function PremiumStatusBar({
  premiumUntil,
  premiumDisabled,
  label = "PREMIUM",
}: {
  premiumUntil: string;
  premiumDisabled: boolean;
  label?: string;
}) {
  const [timeLeft, setTimeLeft] = useState(() => premiumTimeLeft(premiumUntil));

  useEffect(() => {
    if (premiumDisabled) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setTimeLeft(premiumTimeLeft(premiumUntil));
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, [premiumDisabled, premiumUntil]);

  if (premiumDisabled || !timeLeft) {
    return null;
  }

  return (
    <div className="border-y border-yellow-500/40 bg-yellow-400/15 px-4 py-0 text-yellow-950 shadow-[0_0_12px_rgba(250,204,21,0.14)] dark:border-yellow-300/40 dark:bg-yellow-400/10 dark:text-yellow-100">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0 text-center text-xs font-bold uppercase leading-none tracking-wide">
        <span className="text-yellow-700 dark:text-yellow-300">
          {label}
        </span>

        <span className="text-xs text-yellow-900 dark:text-yellow-100 sm:text-sm">
          {timeLeft.expired
            ? "Status wygasł"
            : `${timeLeft.days} dni ${timeLeft.hours} godz ${timeLeft.minutes} min`}
        </span>
      </div>
    </div>
  );
}

function parseLicenseQrPayload(value: string): LicenseQrProfileData | null {
  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return null;
    }

    const firstName = qrFieldToString(parsed[0]);
    const lastName = qrFieldToString(parsed[1]);
    const licenseNumber = qrFieldToString(parsed[2]);
    const licenseUuid = qrFieldToString(parsed[4]);
    const club = qrFieldToString(parsed[5]);
    const licenseClubCode = qrFieldToString(parsed[6]);

    if (!firstName || !lastName || !licenseNumber || !club) {
      return null;
    }

    return {
      firstName,
      lastName,
      licenseNumber,
      licenseUuid,
      club,
      licenseClubCode,
    };
  } catch {
    return null;
  }
}

type FieldTone = "neutral" | "valid" | "invalid";

const fieldBaseClassName = "w-full rounded-lg border bg-white px-4 py-3 text-zinc-950 placeholder:text-zinc-400 outline-none transition disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500 dark:bg-black dark:text-red-50 dark:placeholder:text-red-900/70 dark:disabled:bg-zinc-950 dark:disabled:text-zinc-600";
const fieldToneClassNames: Record<FieldTone, string> = {
  neutral: "border-zinc-300 focus:border-zinc-500 dark:border-zinc-700 dark:focus:border-red-500",
  valid: "border-green-500 ring-2 ring-green-500/30 shadow-[0_0_18px_rgba(34,197,94,0.18)] focus:border-green-600 focus:ring-green-500/50 dark:border-green-400 dark:ring-green-400/35 dark:focus:border-green-300",
  invalid: "border-red-500 ring-2 ring-red-500/35 shadow-[0_0_18px_rgba(239,68,68,0.22)] focus:border-red-600 focus:ring-red-500/55 dark:border-red-400 dark:ring-red-400/40 dark:focus:border-red-300",
};
const checkboxClassName = "h-5 w-5 rounded border-red-300 text-green-700 focus:ring-green-700";

function fieldClassNameFor(tone: FieldTone = "neutral") {
  return `${fieldBaseClassName} ${fieldToneClassNames[tone]}`;
}
const profileLabelClassName = "ui-profile-label font-medium text-red-400";
const profileValueClassName = "ui-profile-value mt-3 min-h-6 font-semibold text-red-50";
const defaultProfileSettings: ProfileSettings = {
  label_color: "#f87171",
  value_color: "#f9fafb",
  label_font_size: "1.125rem",
  value_font_size: "1.25rem",
  row_gap: "2rem",
};
const profileCssVariableNames: Record<keyof ProfileSettings, string> = {
  label_color: "--ss-profile-label-color",
  value_color: "--ss-profile-value-color",
  label_font_size: "--ss-profile-label-font-size",
  value_font_size: "--ss-profile-value-font-size",
  row_gap: "--ss-profile-row-gap",
};

function RequiredLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-2 block text-sm font-semibold text-red-700 dark:text-red-300">
      {children} <span className="text-red-500">*</span>
    </span>
  );
}

function OptionalLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-2 block text-sm font-semibold text-red-700 dark:text-red-300">
      {children}
    </span>
  );
}

function ProfileField({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <dt className={profileLabelClassName}>
        {label}
      </dt>

      <dd className={profileValueClassName}>
        {value || "-"}
      </dd>
    </div>
  );
}

function ProfileSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 dark:border-red-950 dark:bg-zinc-950/70">
      <h2 className="mb-5 text-xl font-black text-zinc-950 dark:text-red-300">
        {title}
      </h2>
      <dl className="ui-profile-fields grid gap-5 sm:grid-cols-2">
        {children}
      </dl>
    </section>
  );
}

function displayValue(value: string, fallback = "Brak") {
  return value.trim() || fallback;
}

function ClubProfileCard({ profile }: { profile: UserProfile }) {
  return (
    <section className="max-w-4xl">
      <div className="rounded-2xl border border-green-700/40 bg-white p-6 shadow-2xl dark:bg-zinc-950 sm:p-8">
        <div className="mb-8 border-b border-green-900/20 pb-6 dark:border-green-500/20">
          <p className="text-sm font-bold uppercase tracking-wide text-green-700 dark:text-green-400">
            Konto klubowe PZSS
          </p>

          <h1 className="mt-2 text-3xl font-bold text-zinc-950 dark:text-red-50 sm:text-4xl">
            {displayValue(profile.pzss_club_short_name)}
          </h1>
        </div>

        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-black">
            <dt className="text-sm font-semibold text-zinc-500 dark:text-red-300">
              Nazwa skrócona
            </dt>
            <dd className="mt-2 text-lg font-bold text-zinc-950 dark:text-red-50">
              {displayValue(profile.pzss_club_short_name)}
            </dd>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-black">
            <dt className="text-sm font-semibold text-zinc-500 dark:text-red-300">
              E-mail
            </dt>
            <dd className="mt-2 break-words text-lg font-bold text-zinc-950 dark:text-red-50">
              {displayValue(profile.email)}
            </dd>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-black sm:col-span-2">
            <dt className="text-sm font-semibold text-zinc-500 dark:text-red-300">
              Nazwa pełna
            </dt>
            <dd className="mt-2 text-lg font-bold text-zinc-950 dark:text-red-50">
              {displayValue(profile.pzss_club_full_name)}
            </dd>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-black">
            <dt className="text-sm font-semibold text-zinc-500 dark:text-red-300">
              Telefon do weryfikacji
            </dt>
            <dd className="mt-2 text-lg font-bold text-zinc-950 dark:text-red-50">
              {displayValue(profile.phone_number, "Brak numeru")}
            </dd>
          </div>

          <div className="rounded-lg border border-green-700/40 bg-green-900/10 p-4 dark:border-green-500/40 dark:bg-green-500/10">
            <dt className="text-sm font-semibold text-green-700 dark:text-green-300">
              Numer licencji klubu PZSS
            </dt>
            <dd className="mt-2 text-lg font-bold text-zinc-950 dark:text-green-50">
              {displayValue(profile.pzss_club_license_number, "Oczekuje na nadanie przez administratora")}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function applyProfileSettings(settings: ProfileSettings) {
  Object.entries(profileCssVariableNames).forEach(([key, variableName]) => {
    document.documentElement.style.setProperty(
      variableName,
      settings[key as keyof ProfileSettings]
    );
  });
}

function normalizeBirthDateInput(value: string) {
  const trimmedValue = value.trim();
  const isoMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const polishMatch = trimmedValue.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  const dateParts = isoMatch
    ? {
        year: Number(isoMatch[1]),
        month: Number(isoMatch[2]),
        day: Number(isoMatch[3]),
      }
    : polishMatch
      ? {
          year: Number(polishMatch[3]),
          month: Number(polishMatch[2]),
          day: Number(polishMatch[1]),
        }
      : null;

  if (!dateParts) {
    return "";
  }

  const date = new Date(
    Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day)
  );
  const isValidDate = date.getUTCFullYear() === dateParts.year
    && date.getUTCMonth() === dateParts.month - 1
    && date.getUTCDate() === dateParts.day;

  if (!isValidDate || dateParts.year < 1900 || date > new Date()) {
    return "";
  }

  return [
    String(dateParts.year).padStart(4, "0"),
    String(dateParts.month).padStart(2, "0"),
    String(dateParts.day).padStart(2, "0"),
  ].join("-");
}

function normalizeFutureDateInput(value: string) {
  const trimmedValue = value.trim();
  const isoMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const polishMatch = trimmedValue.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  const dateParts = isoMatch
    ? {
        year: Number(isoMatch[1]),
        month: Number(isoMatch[2]),
        day: Number(isoMatch[3]),
      }
    : polishMatch
      ? {
          year: Number(polishMatch[3]),
          month: Number(polishMatch[2]),
          day: Number(polishMatch[1]),
        }
      : null;

  if (!dateParts) {
    return "";
  }

  const date = new Date(
    Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day)
  );
  const isValidDate = date.getUTCFullYear() === dateParts.year
    && date.getUTCMonth() === dateParts.month - 1
    && date.getUTCDate() === dateParts.day;

  if (!isValidDate || dateParts.year < 1900) {
    return "";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (new Date(`${date.toISOString().slice(0, 10)}T00:00:00`) < today) {
    return "";
  }

  return [
    String(dateParts.year).padStart(4, "0"),
    String(dateParts.month).padStart(2, "0"),
    String(dateParts.day).padStart(2, "0"),
  ].join("-");
}

function normalizePhoneInput(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  const hasPlusPrefix = trimmedValue.startsWith("+");
  const digits = trimmedValue.replace(/\D/g, "");

  if (digits.length < 7 || digits.length > 15) {
    return "";
  }

  return hasPlusPrefix ? `+${digits}` : digits;
}

function syncStoredRoles(profile: UserProfile) {
  localStorage.setItem("role", profile.role);
  localStorage.setItem("roles", profile.roles.join(","));
  notifyAuthChange();
}

function profilePhotoSrc(photoUrl: string) {
  return photoUrl ? apiUrl(photoUrl) : "";
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function profilePhotoCropRect(
  size: ProfilePhotoCropSize,
  zoom: number,
  cropX: number,
  cropY: number
): ProfilePhotoCropRect | null {
  if (!size.width || !size.height) {
    return null;
  }

  const safeZoom = clampNumber(zoom, 1, 3);
  const side = Math.max(1, Math.min(size.width, size.height) / safeZoom);
  const centerX = (clampNumber(cropX, 0, 100) / 100) * size.width;
  const centerY = (clampNumber(cropY, 0, 100) / 100) * size.height;

  return {
    sx: clampNumber(centerX - side / 2, 0, size.width - side),
    sy: clampNumber(centerY - side / 2, 0, size.height - side),
    side,
  };
}

export default function ProfilePage() {
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requestingPasswordReset, setRequestingPasswordReset] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [licenseScannerOpen, setLicenseScannerOpen] = useState(false);
  const [photoCropUrl, setPhotoCropUrl] = useState("");
  const [photoCropFileName, setPhotoCropFileName] = useState("profile-photo");
  const [photoCropSize, setPhotoCropSize] = useState<ProfilePhotoCropSize>({
    width: 0,
    height: 0,
  });
  const [photoCropX, setPhotoCropX] = useState(50);
  const [photoCropY, setPhotoCropY] = useState(50);
  const [photoCropZoom, setPhotoCropZoom] = useState(1);
  const photoCropDragRef = useRef<ProfilePhotoCropDrag | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseUuid, setLicenseUuid] = useState("");
  const [licenseClubCode, setLicenseClubCode] = useState("");
  const [noLicense, setNoLicense] = useState(false);
  const [club, setClub] = useState("");
  const [noClub, setNoClub] = useState(false);
  const [verifiedClubId, setVerifiedClubId] = useState("");
  const [verifiedClubs, setVerifiedClubs] = useState<VerifiedPzssClub[]>([]);
  const [clubSuggestionsOpen, setClubSuggestionsOpen] = useState(false);
  const [voivodeship, setVoivodeship] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [organizerName, setOrganizerName] = useState("");
  const [roleJudgeLicenseNumber, setRoleJudgeLicenseNumber] = useState("");
  const [judgeLicenseValidUntil, setJudgeLicenseValidUntil] = useState("");

  useEffect(() => {
    const token = getAccessToken();
    let ignore = false;

    if (!token) {
      router.push("/login");
      return;
    }

    async function loadProfile() {
      try {
        const [profileResponse, profileSettingsResponse, verifiedClubsResponse] = await Promise.all([
          fetch(
            apiUrl("/me"),
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          ),
          fetch(
            apiUrl("/settings/profile"),
            {
              cache: "no-store",
            }
          ),
          fetch(
            apiUrl("/pzss-clubs/verified"),
            {
              cache: "no-store",
            }
          ),
        ]);

        if (!profileResponse.ok) {
          router.push("/login");
          return;
        }

        const data = await profileResponse.json();
        const settingsData = profileSettingsResponse.ok
          ? await profileSettingsResponse.json()
          : defaultProfileSettings;
        const verifiedClubsData = verifiedClubsResponse.ok
          ? await verifiedClubsResponse.json()
          : [];

        if (!ignore) {
          applyProfileSettings({
            label_color: settingsData.label_color || defaultProfileSettings.label_color,
            value_color: settingsData.value_color || defaultProfileSettings.value_color,
            label_font_size: settingsData.label_font_size || defaultProfileSettings.label_font_size,
            value_font_size: settingsData.value_font_size || defaultProfileSettings.value_font_size,
            row_gap: settingsData.row_gap || defaultProfileSettings.row_gap,
          });
          setVerifiedClubs(verifiedClubsData);
          setProfile(data);
          setFirstName(data.first_name || "");
          setLastName(data.last_name || "");
          setLicenseNumber(data.license_number || "");
          setLicenseUuid(data.license_uuid || "");
          setLicenseClubCode(data.license_club_code || "");
          setNoLicense(Boolean(data.no_license));
          setClub(data.club || "");
          setNoClub(Boolean(data.no_club));
          setVerifiedClubId(data.verified_club_id ? String(data.verified_club_id) : "");
          setVoivodeship(data.voivodeship || "");
          setBirthDate(data.birth_date || "");
          setPhoneNumber(data.phone_number || "");
          setOrganizerName(data.organizer_name || "");
          setRoleJudgeLicenseNumber(data.judge_license_number || "");
          setJudgeLicenseValidUntil(data.judge_license_valid_until || "");
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

  useEffect(() => {
    return () => {
      if (photoCropUrl) {
        URL.revokeObjectURL(photoCropUrl);
      }
    };
  }, [photoCropUrl]);

  function closePhotoCropDialog() {
    if (photoCropUrl) {
      URL.revokeObjectURL(photoCropUrl);
    }

    setPhotoCropUrl("");
    setPhotoCropFileName("profile-photo");
    setPhotoCropSize({ width: 0, height: 0 });
    setPhotoCropX(50);
    setPhotoCropY(50);
    setPhotoCropZoom(1);
  }

  async function uploadProfilePhotoFile(file: File) {
    const token = getAccessToken();

    if (!token) {
      router.push("/login");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      setUploadingPhoto(true);
      setMessage("");

      const response = await fetch(
        apiUrl("/me/profile-photo"),
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
          },
          body: formData,
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się zapisać zdjęcia ❌");
        return;
      }

      setProfile(data);
      setMessage("Zdjęcie profilowe zaktualizowane ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function uploadProfilePhoto(event: ChangeEvent<HTMLInputElement>) {
    const token = getAccessToken();
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!token) {
      router.push("/login");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setMessage("Dodaj plik graficzny JPG, PNG albo WebP ❌");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      if (photoCropUrl) {
        URL.revokeObjectURL(photoCropUrl);
      }

      setPhotoCropUrl(objectUrl);
      setPhotoCropFileName(file.name || "profile-photo");
      setPhotoCropSize({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
      setPhotoCropX(50);
      setPhotoCropY(50);
      setPhotoCropZoom(1);
      setMessage("");
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setMessage("Nie udało się odczytać zdjęcia ❌");
    };

    image.src = objectUrl;
  }

  async function confirmProfilePhotoCrop() {
    if (!photoCropUrl) {
      return;
    }

    const rect = profilePhotoCropRect(
      photoCropSize,
      photoCropZoom,
      photoCropX,
      photoCropY
    );

    if (!rect) {
      setMessage("Nie udało się przygotować kadru zdjęcia ❌");
      return;
    }

    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext("2d");

      if (!context) {
        setMessage("Nie udało się przygotować kadru zdjęcia ❌");
        return;
      }

      context.drawImage(
        image,
        rect.sx,
        rect.sy,
        rect.side,
        rect.side,
        0,
        0,
        canvas.width,
        canvas.height
      );

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            setMessage("Nie udało się przygotować kadru zdjęcia ❌");
            return;
          }

          const baseName = photoCropFileName.replace(/\.[^.]+$/, "") || "profile-photo";
          const croppedFile = new File(
            [blob],
            baseName + "-kadr.jpg",
            { type: "image/jpeg" }
          );

          closePhotoCropDialog();
          void uploadProfilePhotoFile(croppedFile);
        },
        "image/jpeg",
        0.92
      );
    };

    image.onerror = () => {
      setMessage("Nie udało się odczytać zdjęcia ❌");
    };

    image.src = photoCropUrl;
  }

  async function deleteProfilePhoto() {
    const token = getAccessToken();

    if (!token) {
      router.push("/login");
      return;
    }

    try {
      setUploadingPhoto(true);
      setMessage("");

      const response = await fetch(
        apiUrl("/me/profile-photo"),
        {
          method: "DELETE",
          headers: {
            Authorization: "Bearer " + token,
          },
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się usunąć zdjęcia ❌");
        return;
      }

      setProfile(data);
      setMessage("Zdjęcie profilowe usunięte ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function saveProfile() {
    const token = getAccessToken();

    if (!token) {
      router.push("/login");
      return;
    }

    if (!profile) {
      setMessage("Nie udało się pobrać profilu użytkownika ❌");
      return;
    }

    if (!firstName.trim()) {
      setMessage("Podaj imię ❌");
      return;
    }

    if (!lastName.trim()) {
      setMessage("Podaj nazwisko ❌");
      return;
    }

    if (!voivodeship) {
      setMessage("Wybierz województwo z listy ❌");
      return;
    }

    if (!birthDate.trim()) {
      setMessage("Podaj datę urodzenia ❌");
      return;
    }

    if (!noClub && !club.trim()) {
      setMessage("Podaj klub albo zaznacz, że jeszcze go nie posiadasz ❌");
      return;
    }

    if (!noLicense && !licenseNumber.trim()) {
      setMessage("Podaj numer licencji zawodniczej albo zaznacz, że jeszcze jej nie posiadasz ❌");
      return;
    }

    const normalizedBirthDate = normalizeBirthDateInput(birthDate);
    const normalizedPhoneNumber = normalizePhoneInput(phoneNumber);
    const canEditOrganizerFields = Boolean(
      profile.roles.includes("organizer")
    );
    const canEditJudgeFields = Boolean(
      profile.roles.includes("judge")
    );
    const normalizedJudgeValidUntil = normalizeFutureDateInput(judgeLicenseValidUntil);

    if (!normalizedBirthDate) {
      setMessage("Podaj poprawną datę urodzenia, np. 1987-03-18 albo 18.03.1987 ❌");
      return;
    }

    if (phoneNumber.trim() && !normalizedPhoneNumber) {
      setMessage("Podaj poprawny numer telefonu, minimum 7 cyfr, albo zostaw pole puste ❌");
      return;
    }

    if (canEditOrganizerFields && !organizerName.trim()) {
      setMessage("Podaj nazwę organizatora ❌");
      return;
    }

    if (canEditJudgeFields && !roleJudgeLicenseNumber.trim()) {
      setMessage("Podaj numer licencji sędziowskiej ❌");
      return;
    }

    if (canEditJudgeFields && !normalizedJudgeValidUntil) {
      setMessage("Podaj poprawną przyszłą datę ważności licencji sędziowskiej ❌");
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
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            license_number: noLicense ? "" : licenseNumber.trim(),
            license_uuid: licenseUuid.trim(),
            license_club_code: noClub ? "" : licenseClubCode.trim(),
            no_license: noLicense,
            club: noClub ? "" : club.trim(),
            no_club: noClub,
            verified_club_id: noClub || !verifiedClubId ? null : Number(verifiedClubId),
            voivodeship,
            birth_date: normalizedBirthDate,
            phone_number: normalizedPhoneNumber,
            organizer_name: canEditOrganizerFields
              ? organizerName.trim()
              : profile.organizer_name || "",
            judge_license_number: canEditJudgeFields
              ? roleJudgeLicenseNumber.trim()
              : profile.judge_license_number || "",
            judge_license_valid_until: canEditJudgeFields
              ? normalizedJudgeValidUntil
              : profile.judge_license_valid_until || "",
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się zapisać profilu ❌");
        return;
      }

      setProfile(data);
      syncStoredRoles(data);
      setEditing(false);
      setMessage("Profil zapisany. Otrzymujesz status Strzelca ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setSaving(false);
    }
  }

  function handleLicenseQrScan(value: string) {
    const licenseData = parseLicenseQrPayload(value);

    setLicenseScannerOpen(false);

    if (!licenseData) {
      setMessage("Nie rozpoznano danych licencji zawodniczej w kodzie QR ❌");
      return;
    }

    setFirstName(licenseData.firstName);
    setLastName(licenseData.lastName);
    setLicenseNumber(licenseData.licenseNumber);
    setLicenseUuid(licenseData.licenseUuid);
    setClub(licenseData.club);
    setVerifiedClubId("");
    setLicenseClubCode(licenseData.licenseClubCode);
    setNoLicense(false);
    setNoClub(false);
    window.alert("Poprawnie zeskanowano QR licencji zawodniczej. Dane zostały wstawione do formularza.");
    setMessage("Dane z QR licencji zostały wstawione. Możesz je poprawić ręcznie przed zapisem ✅");
  }

  async function requestPasswordReset() {
    const token = getAccessToken();

    if (!token) {
      router.push("/login");
      return;
    }

    const confirmed = window.confirm(
      "Czy wysłać link resetowania hasła na Twój adres e-mail?"
    );

    if (!confirmed) {
      return;
    }

    try {
      setRequestingPasswordReset(true);
      setMessage("");

      const response = await fetch(
        apiUrl("/me/password-reset"),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się wysłać linku resetującego ❌");
        return;
      }

      setMessage(data.message + " ✅");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setRequestingPasswordReset(false);
    }
  }

  async function deleteAccount() {
    const token = getAccessToken();

    if (!token) {
      router.push("/login");
      return;
    }

    const confirmed = window.confirm(
      "Czy na pewno chcesz trwale usunąć swoje konto? Ta operacja usunie też Twoje zapisy do zawodów i nie da się jej cofnąć."
    );

    if (!confirmed) {
      return;
    }

    const confirmationText = window.prompt(
      "Aby potwierdzić trwałe usunięcie konta, wpisz USUŃ KONTO"
    );

    const normalizedConfirmationText = (confirmationText || "")
      .trim()
      .toLocaleUpperCase("pl-PL")
      .replace(/Ń/g, "N");

    if (normalizedConfirmationText !== "USUN KONTO") {
      setMessage("Usuwanie konta anulowane.");
      return;
    }

    try {
      setDeletingAccount(true);
      setMessage("");

      const response = await fetch(
        apiUrl("/me"),
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(data.detail || "Nie udało się usunąć konta ❌");
        return;
      }

      clearStoredAuth();
      setMessage(data.message + " ✅");

      setTimeout(() => {
        router.replace("/");
      }, 800);
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia z serwerem ❌");
    } finally {
      setDeletingAccount(false);
    }
  }

  const isOwnerProfile = true;
  const rolesText = profile?.roles
    .map((role) => profileRoleLabels[role] || role)
    .join(", ");
  const hasShooterRole = Boolean(
    profile
    && (profile.profile_complete || profile.roles.includes("shooter"))
  );
  const showOrganizerData = Boolean(
    profile
    && (profile.roles.includes("organizer") || profile.roles.includes("admin"))
  );
  const showJudgeData = Boolean(
    profile
    && (profile.roles.includes("judge") || profile.roles.includes("admin"))
  );
  const canEditOrganizerProfileFields = Boolean(profile?.roles.includes("organizer"));
  const canEditJudgeProfileFields = Boolean(profile?.roles.includes("judge"));
  const requiredFieldTone = (isValid: boolean): FieldTone => isValid ? "valid" : "invalid";
  const birthDateTone = requiredFieldTone(Boolean(
    birthDate.trim() && normalizeBirthDateInput(birthDate)
  ));
  const phoneFieldTone: FieldTone = phoneNumber.trim()
    ? requiredFieldTone(Boolean(normalizePhoneInput(phoneNumber)))
    : "neutral";
  const clubFieldTone = requiredFieldTone(noClub || Boolean(club.trim()));
  const normalizedClubQuery = normalizeClubSearch(club);
  const matchingVerifiedClubs = normalizedClubQuery.length >= 2
    ? verifiedClubs
        .filter((verifiedClub) => (
          normalizeClubSearch(verifiedClub.short_name).startsWith(normalizedClubQuery)
          || normalizeClubSearch(verifiedClub.full_name).startsWith(normalizedClubQuery)
        ))
        .slice(0, 10)
    : [];
  const licenseFieldTone = requiredFieldTone(noLicense || Boolean(licenseNumber.trim()));
  const organizerNameFieldTone = requiredFieldTone(Boolean(organizerName.trim()));
  const judgeLicenseNumberFieldTone = requiredFieldTone(Boolean(roleJudgeLicenseNumber.trim()));
  const judgeLicenseValidUntilFieldTone = requiredFieldTone(Boolean(
    judgeLicenseValidUntil.trim() && normalizeFutureDateInput(judgeLicenseValidUntil)
  ));
  const photoCropPreviewSize = 280;
  const photoCropPreviewRect = profilePhotoCropRect(
    photoCropSize,
    photoCropZoom,
    photoCropX,
    photoCropY
  );
  const photoCropPreviewScale = photoCropPreviewRect
    ? photoCropPreviewSize / photoCropPreviewRect.side
    : 1;

  function startPhotoCropDrag(event: PointerEvent<HTMLDivElement>) {
    if (!photoCropPreviewRect || uploadingPhoto) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    photoCropDragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCropX: photoCropX,
      startCropY: photoCropY,
    };
  }

  function movePhotoCropDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = photoCropDragRef.current;

    if (!drag || drag.pointerId !== event.pointerId || !photoCropPreviewRect) {
      return;
    }

    event.preventDefault();
    const deltaX = (event.clientX - drag.startClientX) / photoCropPreviewScale;
    const deltaY = (event.clientY - drag.startClientY) / photoCropPreviewScale;
    setPhotoCropX(clampNumber(drag.startCropX - (deltaX / photoCropSize.width) * 100, 0, 100));
    setPhotoCropY(clampNumber(drag.startCropY - (deltaY / photoCropSize.height) * 100, 0, 100));
  }

  function stopPhotoCropDrag(event: PointerEvent<HTMLDivElement>) {
    if (photoCropDragRef.current?.pointerId === event.pointerId) {
      photoCropDragRef.current = null;
    }
  }

  const isPzssClubProfile = profile?.account_type === "pzss_club";

  return (
    <main className="min-h-screen bg-white text-zinc-950 dark:bg-black dark:text-red-400">
      {loading ? (
        <p className="px-6 py-8 text-zinc-700 dark:text-red-100 sm:px-10 lg:px-14">
          Ładowanie profilu...
        </p>
      ) : profile ? (
        <>
          {!isPzssClubProfile && (
            <>
              <PremiumStatusBar
                premiumUntil={profile.premium_until}
                premiumDisabled={profile.premium_disabled}
                label="PREMIUM STRZELCA"
              />

              <PremiumStatusBar
                premiumUntil={profile.premium_until}
                premiumDisabled={profile.premium_organizer_disabled}
                label="PREMIUM ORGANIZATORA"
              />
            </>
          )}

          <div className="mx-auto w-full max-w-[1800px] px-6 py-8 sm:px-10 lg:px-14">
          {!isPzssClubProfile && !profile.profile_complete && (
            <p className="mb-8 max-w-2xl rounded-lg border border-yellow-500/50 bg-yellow-400/10 px-4 py-3 text-yellow-900 dark:text-yellow-100">
              Uzupełnij profil, aby otrzymać status Strzelca i móc dołączyć do zawodów.
            </p>
          )}

          {message && (
            <p className="mb-8 max-w-2xl rounded-lg border border-green-700/30 bg-green-700/10 px-4 py-3 font-medium text-zinc-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-100">
              {message}
            </p>
          )}

          {isPzssClubProfile ? (
            <ClubProfileCard profile={profile} />
          ) : editing ? (
            <section className="max-w-5xl">
              <h1 className="mb-10 text-4xl font-bold text-red-400 sm:text-5xl">
                Profil
              </h1>

              <p className="mb-6 text-sm text-red-700 dark:text-red-200">
                Pola oznaczone <span className="font-bold text-red-500">*</span> są wymagane do zapisania się na zawody. Telefon jest opcjonalny, chyba że prosisz o rolę organizatora.
              </p>

              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setMessage("");
                    setLicenseScannerOpen(true);
                  }}
                  className="group flex w-full items-center gap-4 text-left sm:w-fit sm:gap-5"
                >
                  <NextImage
                    src="/icons/skaner.jpeg"
                    alt=""
                    width={1254}
                    height={1254}
                    sizes="(min-width: 640px) 144px, 112px"
                    className="h-28 w-28 shrink-0 rounded-2xl object-cover shadow-[0_12px_35px_rgba(220,38,38,0.2)] transition group-hover:scale-[1.03] group-hover:shadow-[0_14px_40px_rgba(220,38,38,0.32)] sm:h-36 sm:w-36"
                  />

                  <span className="max-w-sm">
                    <span className="block text-lg font-black text-zinc-950 transition group-hover:text-red-700 dark:text-white dark:group-hover:text-red-300 sm:text-2xl">
                      Skanuj QR licencji
                    </span>
                    <span className="mt-2 block text-sm leading-5 text-zinc-600 dark:text-red-100/70 sm:text-base sm:leading-6">
                      Jeśli posiadasz licencję zawodniczą, zeskanuj kod i uzupełnij dane automatycznie.
                    </span>
                  </span>
                </button>
              </div>

              <div className="mb-8 max-w-sm">
                <span className="mb-3 block text-sm font-semibold text-red-700 dark:text-red-300">
                  Zdjęcie profilowe
                </span>

                <div className="flex flex-wrap items-center gap-4">
                  {profile.profile_photo_url ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={profilePhotoSrc(profile.profile_photo_url)}
                        alt="Zdjęcie profilowe"
                        className="h-28 w-28 border border-zinc-300 object-cover dark:border-red-950"
                      />
                    </>
                  ) : (
                    <div className="flex h-28 w-28 items-center justify-center border border-dashed border-zinc-400 bg-zinc-100 text-xs font-semibold uppercase text-zinc-500 dark:border-red-950 dark:bg-zinc-950 dark:text-red-300/70">
                      Brak
                    </div>
                  )}

                  <div className="flex flex-col gap-3">
                    <label className="inline-flex cursor-pointer items-center justify-center bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-red-950 dark:hover:bg-red-900">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={uploadProfilePhoto}
                        disabled={uploadingPhoto}
                        className="sr-only"
                      />
                      {uploadingPhoto ? "Przetwarzanie..." : "Dodaj zdjęcie"}
                    </label>

                    {profile.profile_photo_url && (
                      <button
                        type="button"
                        onClick={deleteProfilePhoto}
                        disabled={uploadingPhoto}
                        className="bg-zinc-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
                      >
                        Usuń zdjęcie
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <h2 className="order-[1] border-b border-zinc-200 pb-2 text-2xl font-black text-zinc-950 dark:border-red-950 dark:text-red-300 md:col-span-2">
                  Dane podstawowe
                </h2>

                <h2 className="order-[6] mt-5 border-b border-zinc-200 pb-2 text-2xl font-black text-zinc-950 dark:border-red-950 dark:text-red-300 md:col-span-2">
                  Dane sportowe
                </h2>

                <h2 className="order-[11] mt-5 border-b border-zinc-200 pb-2 text-2xl font-black text-zinc-950 dark:border-red-950 dark:text-red-300 md:col-span-2">
                  Dane kontaktowe
                </h2>

                <h2 className="order-[14] mt-5 border-b border-zinc-200 pb-2 text-2xl font-black text-zinc-950 dark:border-red-950 dark:text-red-300 md:col-span-2">
                  Pozostałe dane
                </h2>

                <label className="order-[12]">
                  <span className="mb-2 block text-sm font-semibold text-red-700 dark:text-red-300">
                    Email
                  </span>
                  <input
                    value={profile.email}
                    readOnly
                    className={fieldClassNameFor("valid")}
                  />
                </label>

                <label className="order-[2]">
                  <RequiredLabel>Imię</RequiredLabel>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Podaj imię"
                    className={fieldClassNameFor(requiredFieldTone(Boolean(firstName.trim())))}
                  />
                </label>

                <label className="order-[3]">
                  <RequiredLabel>Nazwisko</RequiredLabel>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Podaj nazwisko"
                    className={fieldClassNameFor(requiredFieldTone(Boolean(lastName.trim())))}
                  />
                </label>

                <label className="order-[5]">
                  <RequiredLabel>Województwo</RequiredLabel>
                  <select
                    value={voivodeship}
                    onChange={(e) => setVoivodeship(e.target.value)}
                    className={fieldClassNameFor(requiredFieldTone(Boolean(voivodeship)))}
                  >
                    <option value="">Wybierz województwo</option>
                    {voivodeships.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="order-[4]">
                  <RequiredLabel>Data urodzenia</RequiredLabel>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className={fieldClassNameFor(birthDateTone)}
                  />
                </label>

                <div className="order-[7]">
                  {noClub ? (
                    <OptionalLabel>Klub</OptionalLabel>
                  ) : (
                    <RequiredLabel>Klub</RequiredLabel>
                  )}
                  <div className="relative">
                    <input
                      value={club}
                      onChange={(event) => {
                        setClub(event.target.value);
                        setVerifiedClubId("");
                        setClubSuggestionsOpen(true);
                      }}
                      onFocus={() => setClubSuggestionsOpen(true)}
                      onBlur={() => setClubSuggestionsOpen(false)}
                      placeholder="Wpisz nazwę klubu"
                      disabled={noClub}
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={clubSuggestionsOpen && matchingVerifiedClubs.length > 0}
                      aria-controls="verified-club-suggestions"
                      className={fieldClassNameFor(clubFieldTone)}
                    />

                    {clubSuggestionsOpen && matchingVerifiedClubs.length > 0 && (
                      <ul
                        id="verified-club-suggestions"
                        role="listbox"
                        className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-green-700 bg-white py-1 text-black shadow-2xl dark:bg-zinc-900 dark:text-white"
                      >
                        {matchingVerifiedClubs.map((verifiedClub) => (
                          <li key={verifiedClub.id} role="option" aria-selected={String(verifiedClub.id) === verifiedClubId}>
                            <button
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setVerifiedClubId(String(verifiedClub.id));
                                setClub(verifiedClub.short_name);
                                setLicenseClubCode(verifiedClub.license_number || licenseClubCode);
                                setNoClub(false);
                                setClubSuggestionsOpen(false);
                              }}
                              className="w-full px-4 py-3 text-left transition hover:bg-green-100 focus:bg-green-100 focus:outline-none dark:hover:bg-green-950 dark:focus:bg-green-950"
                            >
                              <span className="block font-bold">{verifiedClub.short_name}</span>
                              {verifiedClub.full_name && verifiedClub.full_name !== verifiedClub.short_name && (
                                <span className="mt-1 block text-sm text-gray-600 dark:text-gray-300">
                                  {verifiedClub.full_name}
                                </span>
                              )}
                              <span className="mt-1 block text-xs font-semibold text-green-700 dark:text-green-300">
                                Zweryfikowany klub
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <label className="mt-3 flex items-center gap-3 text-sm font-semibold text-red-700 dark:text-red-200">
                    <input
                      type="checkbox"
                      checked={noClub}
                      onChange={(event) => {
                        setNoClub(event.target.checked);

                        if (event.target.checked) {
                          setClub("");
                          setVerifiedClubId("");
                          setClubSuggestionsOpen(false);
                        }
                      }}
                      className={checkboxClassName}
                    />
                    Jeszcze nie posiadam klubu
                  </label>
                </div>

                <div className="order-[8]">
                  {noLicense ? (
                    <OptionalLabel>Licencja zawodnicza</OptionalLabel>
                  ) : (
                    <RequiredLabel>Licencja zawodnicza</RequiredLabel>
                  )}
                  <input
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    placeholder="Nr licencji zawodniczej"
                    disabled={noLicense}
                    className={fieldClassNameFor(licenseFieldTone)}
                  />
                  <label className="mt-3 flex items-center gap-3 text-sm font-semibold text-red-700 dark:text-red-200">
                    <input
                      type="checkbox"
                      checked={noLicense}
                      onChange={(event) => {
                        setNoLicense(event.target.checked);

                        if (event.target.checked) {
                          setLicenseNumber("");
                        }
                      }}
                      className={checkboxClassName}
                    />
                    Jeszcze nie posiadam licencji zawodniczej
                  </label>
                </div>

                <label className="order-[13]">
                  <span className="mb-2 block text-sm font-semibold text-red-700 dark:text-red-300">
                    Telefon
                  </span>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="Opcjonalnie"
                    className={fieldClassNameFor(phoneFieldTone)}
                  />
                </label>

                {canEditOrganizerProfileFields && (
                  <label className="order-[15]">
                    <RequiredLabel>Nazwa organizatora</RequiredLabel>
                    <input
                      value={organizerName}
                      onChange={(e) => setOrganizerName(e.target.value)}
                      placeholder="Podaj nazwę organizatora"
                      className={fieldClassNameFor(organizerNameFieldTone)}
                    />
                  </label>
                )}

                {canEditJudgeProfileFields && (
                  <>
                    <label className="order-[9]">
                      <RequiredLabel>Licencja sędziowska</RequiredLabel>
                      <input
                        value={roleJudgeLicenseNumber}
                        onChange={(e) => setRoleJudgeLicenseNumber(e.target.value)}
                        placeholder="Podaj numer licencji sędziowskiej"
                        className={fieldClassNameFor(judgeLicenseNumberFieldTone)}
                      />
                    </label>

                    <label className="order-[10]">
                      <RequiredLabel>Ważność licencji sędziowskiej</RequiredLabel>
                      <input
                        type="date"
                        value={judgeLicenseValidUntil}
                        onChange={(e) => setJudgeLicenseValidUntil(e.target.value)}
                        className={fieldClassNameFor(judgeLicenseValidUntilFieldTone)}
                      />
                    </label>
                  </>
                )}
              </div>

              <div className="mt-8 flex flex-wrap gap-4">
                <button
                  onClick={saveProfile}
                  disabled={saving}
                  className="bg-green-900 px-5 py-3 font-semibold text-white transition hover:bg-green-800 disabled:opacity-50"
                >
                  {saving
                    ? "Zapisywanie..."
                    : "Zapisz profil"}
                </button>

                {profile.profile_complete && (
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="bg-zinc-800 px-5 py-3 font-semibold text-white transition hover:bg-zinc-700"
                  >
                    Anuluj
                  </button>
                )}

                <button
                  type="button"
                  onClick={deleteAccount}
                  disabled={deletingAccount || saving}
                  className="bg-red-900 px-5 py-3 font-semibold text-white transition hover:bg-red-800 disabled:opacity-50"
                >
                  {deletingAccount
                    ? "Usuwanie konta..."
                    : "Usuń konto"}
                </button>
              </div>
            </section>
          ) : (
            <>
              <div className="grid min-h-[calc(100vh-12rem)] gap-12 lg:grid-cols-[minmax(0,720px)_minmax(280px,1fr)]">
                <aside className="space-y-5">
                  <ProfileSection title="Dane podstawowe">
                    <ProfileField
                      label="Imię"
                      value={displayValue(profile.first_name)}
                    />
                    <ProfileField
                      label="Nazwisko"
                      value={displayValue(profile.last_name)}
                    />
                    <ProfileField
                      label="Data urodzenia"
                      value={displayValue(profile.birth_date)}
                    />
                    <ProfileField
                      label="Województwo"
                      value={displayValue(profile.voivodeship)}
                    />
                  </ProfileSection>

                  {isOwnerProfile && (
                    <>
                      <ProfileSection title="Dane sportowe">
                        <ProfileField
                          label="Klub"
                          value={profile.no_club ? "Nie posiada" : displayValue(profile.club)}
                        />
                        <ProfileField
                          label="Licencja zawodnicza"
                          value={profile.no_license ? "Nie posiada" : displayValue(profile.license_number)}
                        />
                        <ProfileField
                          label="Licencja sędziowska"
                          value={showJudgeData ? displayValue(profile.judge_license_number) : "Nie posiada"}
                        />
                        {showJudgeData && (
                          <ProfileField
                            label="Ważność licencji sędziowskiej"
                            value={displayValue(profile.judge_license_valid_until)}
                          />
                        )}
                      </ProfileSection>

                      <ProfileSection title="Dane kontaktowe">
                        <ProfileField
                          label="Email"
                          value={profile.email}
                        />
                        <ProfileField
                          label="Telefon"
                          value={displayValue(profile.phone_number, "Brak numeru")}
                        />
                      </ProfileSection>

                      <ProfileSection title="Pozostałe dane">
                        {showOrganizerData && (
                          <ProfileField
                            label="Nazwa organizatora"
                            value={displayValue(profile.organizer_name)}
                          />
                        )}
                        {hasShooterRole && (
                          <ProfileField
                            label="Rola w systemie"
                            value={rolesText || "Brak"}
                          />
                        )}
                      </ProfileSection>
                    </>
                  )}
                </aside>

                <section className="flex min-w-0 flex-col items-center gap-8 text-center">
                  {isOwnerProfile && profile.profile_complete && (
                    <div className="w-full max-w-xs border border-zinc-200 bg-white p-4 text-zinc-950 dark:border-red-950 dark:bg-zinc-950 dark:text-red-50">
                      <h2 className="text-xl font-bold text-red-500">
                        QR profilu zawodnika
                      </h2>

                      <p className="mt-2 text-sm text-zinc-600 dark:text-red-100/80">
                        Kod do identyfikacji zawodnika przy obsłudze zawodów.
                      </p>

                      <QrCode
                        value={licenseQrPayloadFromProfile(profile)}
                        className="mx-auto mt-4 flex justify-center [&_svg]:h-auto [&_svg]:w-full [&_svg]:max-w-56"
                      />

                      {profile.profile_photo_url && (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={profilePhotoSrc(profile.profile_photo_url)}
                            alt="Zdjęcie profilowe"
                            className="mx-auto mt-5 h-40 w-40 border border-zinc-300 object-cover dark:border-red-950"
                          />
                        </>
                      )}
                    </div>
                  )}
                </section>
              </div>

              {isOwnerProfile && (
                <section className="mt-8 flex flex-col gap-5 border-t border-red-200 pt-8 dark:border-red-950">
                  <div className="flex flex-wrap gap-4">
                    <button
                      onClick={() => setEditing(true)}
                      className="bg-green-900 px-5 py-3 font-semibold text-white transition hover:bg-green-800"
                    >
                      Edytuj profil
                    </button>

                    <button
                      type="button"
                      onClick={requestPasswordReset}
                      disabled={requestingPasswordReset}
                      className="bg-zinc-800 px-5 py-3 font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
                    >
                      {requestingPasswordReset
                        ? "Wysyłanie..."
                        : "Zresetuj hasło"}
                    </button>

                  </div>

                  <div className="border-t border-red-200 pt-5 dark:border-red-950">
                    <button
                      type="button"
                      onClick={deleteAccount}
                      disabled={deletingAccount}
                      className="bg-red-900 px-5 py-3 font-semibold text-white transition hover:bg-red-800 disabled:opacity-50"
                    >
                      {deletingAccount
                        ? "Usuwanie konta..."
                        : "Usuń konto"}
                    </button>
                  </div>
                </section>
              )}
            </>
          )}


          {photoCropUrl && photoCropPreviewRect && (
            <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 px-4 py-6">
              <div className="mx-auto w-full max-w-2xl rounded-xl border border-red-900/60 bg-white p-5 text-zinc-950 shadow-2xl dark:bg-zinc-950 dark:text-red-50 sm:p-6">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <h2 className="text-2xl font-bold text-red-500">
                    Wybierz kadr zdjęcia
                  </h2>

                  <button
                    type="button"
                    onClick={closePhotoCropDialog}
                    disabled={uploadingPhoto}
                    className="bg-zinc-800 px-4 py-2 font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
                  >
                    Zamknij
                  </button>
                </div>

                <div
                  className="mx-auto cursor-move touch-none overflow-hidden border border-zinc-300 bg-zinc-950 dark:border-red-950"
                  onPointerDown={startPhotoCropDrag}
                  onPointerMove={movePhotoCropDrag}
                  onPointerUp={stopPhotoCropDrag}
                  onPointerCancel={stopPhotoCropDrag}
                  style={{ height: photoCropPreviewSize, width: photoCropPreviewSize }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoCropUrl}
                    alt="Podgląd kadru zdjęcia profilowego"
                    draggable={false}
                    className="max-w-none select-none"
                    style={{
                      height: photoCropSize.height * photoCropPreviewScale,
                      transform: "translate(" + (-photoCropPreviewRect.sx * photoCropPreviewScale) + "px, " + (-photoCropPreviewRect.sy * photoCropPreviewScale) + "px)",
                      width: photoCropSize.width * photoCropPreviewScale,
                    }}
                  />
                </div>

                <div className="mt-6 grid gap-4">
                  <label>
                    <span className="mb-2 block text-sm font-semibold text-red-700 dark:text-red-300">
                      Przesunięcie poziome
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={photoCropX}
                      onChange={(event) => setPhotoCropX(Number(event.target.value))}
                      className="w-full"
                    />
                  </label>

                  <label>
                    <span className="mb-2 block text-sm font-semibold text-red-700 dark:text-red-300">
                      Przesunięcie pionowe
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={photoCropY}
                      onChange={(event) => setPhotoCropY(Number(event.target.value))}
                      className="w-full"
                    />
                  </label>

                  <label>
                    <span className="mb-2 block text-sm font-semibold text-red-700 dark:text-red-300">
                      Przybliżenie
                    </span>
                    <input
                      type="range"
                      min="1"
                      max="3"
                      step="0.05"
                      value={photoCropZoom}
                      onChange={(event) => setPhotoCropZoom(Number(event.target.value))}
                      className="w-full"
                    />
                  </label>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={confirmProfilePhotoCrop}
                    disabled={uploadingPhoto}
                    className="bg-green-800 px-5 py-3 font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
                  >
                    {uploadingPhoto ? "Zapisywanie..." : "Zapisz kadr"}
                  </button>

                  <button
                    type="button"
                    onClick={closePhotoCropDialog}
                    disabled={uploadingPhoto}
                    className="bg-zinc-800 px-5 py-3 font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
                  >
                    Anuluj
                  </button>
                </div>
              </div>
            </div>
          )}

          {licenseScannerOpen && (
            <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 px-4 py-6">
              <div className="mx-auto w-full max-w-6xl rounded-xl border border-red-900/60 bg-black p-4 shadow-2xl sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <h2 className="text-2xl font-bold text-red-100">
                    Skan licencji zawodniczej
                  </h2>

                  <button
                    type="button"
                    onClick={() => setLicenseScannerOpen(false)}
                    className="bg-zinc-800 px-4 py-2 font-semibold text-white transition hover:bg-zinc-700"
                  >
                    Zamknij
                  </button>
                </div>

                <QrCodeScanner onScan={handleLicenseQrScan} />
              </div>
            </div>
          )}

          </div>
        </>
      ) : (
        <p className="px-6 py-8 text-zinc-700 dark:text-red-100 sm:px-10 lg:px-14">
          Nie udało się pobrać profilu.
        </p>
      )}
    </main>
  );
}
