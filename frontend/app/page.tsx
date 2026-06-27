"use client";

import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useState, useSyncExternalStore } from "react";

import TrackedAdSlot from "@/components/TrackedAdSlot";
import { apiUrl } from "@/lib/api";
import { authFetch, getAuthSnapshot, subscribeToAuthChange } from "@/lib/auth";

type FeatureKind =
  | "qr"
  | "organizer"
  | "live"
  | "judge"
  | "history"
  | "ranking";

type Feature = {
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  kind: FeatureKind;
};

type HomePost = {
  id: number;
  description: string;
  image_url: string;
  created_at: string;
};

type HomeScreenOverride = {
  kind: FeatureKind;
  image_url: string;
};

type FeatureScreenImage = {
  src: string;
  alt: string;
};

const features: Feature[] = [
  {
    eyebrow: "QR zawodnika",
    title: "Skanuj zawodników w kilka sekund",
    description:
      "Każdy zawodnik posiada własny kod QR na licencji i w profilu. Organizator lub sędzia może zeskanować go podczas rejestracji albo bezpośrednio na stanowisku — bez ręcznego wyszukiwania danych.",
    bullets: [
      "szybka identyfikacja zawodnika",
      "mniej pomyłek przy obsłudze",
      "działa na telefonie, tablecie i komputerze",
    ],
    kind: "qr",
  },
  {
    eyebrow: "Panel organizatora",
    title: "Zarządzaj zawodami z jednego miejsca",
    description:
      "Twórz i publikuj zawody, zarządzaj zapisami, sędziami oraz wynikami bez pracy w wielu osobnych plikach. Panel jest prosty, czytelny i przygotowany pod realną obsługę zawodów.",
    bullets: [
      "aktualne i historyczne zawody",
      "publikacja i zakończenie zawodów",
      "dostęp do wyników, sędziów i szczegółów",
    ],
    kind: "organizer",
  },
  {
    eyebrow: "Wyniki na żywo",
    title: "Wyniki aktualizowane na bieżąco",
    description:
      "Zawodnicy, trenerzy i kibice mogą śledzić wyniki w trakcie trwania zawodów. Klasyfikacja aktualizuje się po każdym wpisanym wyniku — bez czekania na końcowy komunikat.",
    bullets: [
      "podgląd wyników live",
      "klasyfikacje w czasie rzeczywistym",
      "dostęp z telefonu, tabletu i komputera",
    ],
    kind: "live",
  },
  {
    eyebrow: "Interfejs sędziowski",
    title: "Czytelne ekrany do pracy na strzelnicy",
    description:
      "Interfejsy sędziowskie pozwalają szybko wprowadzać wyniki podczas zawodów. Bez zbędnych kliknięć, chaosu i szukania zawodnika na długiej liście.",
    bullets: [
      "szybkie wpisywanie wyników",
      "obsługa różnych konkurencji",
      "wygoda pracy na stanowisku",
    ],
    kind: "judge",
  },
  {
    eyebrow: "Historia wyników",
    title: "Historia startów zawodnika",
    description:
      "Zawodnik gromadzi swoje wyniki i starty w jednym miejscu. Może łatwo sprawdzić postępy, poprzednie zawody i osiągnięcia z różnych konkurencji.",
    bullets: [
      "archiwum wyników",
      "historia startów",
      "podgląd osiągnięć sportowych",
    ],
    kind: "history",
  },
  {
    eyebrow: "Rankingi",
    title: "Rankingi regionalne i ogólnopolskie",
    description:
      "System może automatycznie tworzyć rankingi na podstawie wyników zawodników. To dodatkowa motywacja do startów i prosty sposób porównywania osiągnięć w różnych konkurencjach.",
    bullets: [
      "rankingi zawodników",
      "klasyfikacje regionalne",
      "zestawienia ogólnopolskie",
    ],
    kind: "ranking",
  },
];

const featureScreens: Record<FeatureKind, { src: string; alt: string }> = {
  qr: {
    src: "/home-screens/qr-attendance.png",
    alt: "Lista obecności i opłat z szybkim skanowaniem licencji QR",
  },
  organizer: {
    src: "/home-screens/organizer-panel.png",
    alt: "Panel organizatora zawodów z obsługą sędziów, opłat i grup",
  },
  live: {
    src: "/home-screens/live-groups.png",
    alt: "Bieżący status grup startowych podczas zawodów",
  },
  judge: {
    src: "/home-screens/judge-trap.png",
    alt: "Pełnoekranowy interfejs sędziowski konkurencji Trap",
  },
  history: {
    src: "/home-screens/history-statistics.png",
    alt: "Statystyki i historia startów zawodnika",
  },
  ranking: {
    src: "/home-screens/live-ranking.png",
    alt: "Ranking zawodników aktualizowany podczas zawodów",
  },
};

function FeatureScreen({
  kind,
  screen,
  canReplace,
  replaceSaving,
  replaceMessage,
  onOpen,
  onReplace,
}: {
  kind: FeatureKind;
  screen: FeatureScreenImage;
  canReplace: boolean;
  replaceSaving: boolean;
  replaceMessage: string;
  onOpen: (image: FeatureScreenImage) => void;
  onReplace: (kind: FeatureKind, file: File) => void;
}) {
  const inputId = `home-screen-replace-${kind}`;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (file) {
      onReplace(kind, file);
    }
  }

  return (
    <div className="relative mx-auto w-full max-w-[650px]">
      <div className="absolute -inset-4 rounded-[2rem] bg-emerald-400/10 blur-2xl" />
      {canReplace && (
        <div className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-2 rounded-xl border border-emerald-300/40 bg-black/80 p-2 shadow-xl backdrop-blur-sm">
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={replaceSaving}
            onChange={handleFileChange}
            className="sr-only"
          />
          <label
            htmlFor={inputId}
            className="cursor-pointer rounded-lg bg-emerald-400 px-3 py-2 text-xs font-black text-emerald-950 transition hover:bg-emerald-300"
          >
            {replaceSaving ? "Wgrywanie..." : "Podmień screen"}
          </label>
          {replaceMessage && (
            <p className="max-w-56 text-left text-[11px] font-semibold leading-4 text-emerald-100">
              {replaceMessage}
            </p>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => onOpen(screen)}
        aria-label={`Otwórz screen w pełnej rozdzielczości: ${screen.alt}`}
        title="Kliknij, aby powiększyć screen"
        className="group relative block w-full cursor-zoom-in overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#071713] p-0 text-left shadow-[0_28px_80px_rgba(0,0,0,0.38)] outline-none transition hover:-translate-y-1 hover:border-emerald-300/50 focus-visible:ring-2 focus-visible:ring-emerald-300"
      >
        <Image
          src={screen.src}
          alt={screen.alt}
          width={2880}
          height={1578}
          sizes="(min-width: 1024px) 650px, 100vw"
          unoptimized={screen.src.startsWith("http")}
          className="h-auto w-full transition duration-300 group-hover:scale-[1.01]"
        />
        <span className="absolute bottom-3 right-3 rounded-lg bg-black/75 px-3 py-2 text-xs font-black text-white opacity-100 shadow-lg backdrop-blur-sm transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100">
          Powiększ
        </span>
      </button>
    </div>
  );
}

function FeatureSection({
  feature,
  screen,
  reversed,
  canReplaceScreen,
  replaceSaving,
  replaceMessage,
  onOpenScreen,
  onReplaceScreen,
}: {
  feature: Feature;
  screen: FeatureScreenImage;
  reversed: boolean;
  canReplaceScreen: boolean;
  replaceSaving: boolean;
  replaceMessage: string;
  onOpenScreen: (image: FeatureScreenImage) => void;
  onReplaceScreen: (kind: FeatureKind, file: File) => void;
}) {
  return (
    <section className="my-5 grid items-center gap-8 rounded-2xl border border-white/12 bg-white/[0.045] p-5 shadow-xl sm:p-7 lg:my-0 lg:grid-cols-2 lg:gap-16 lg:rounded-none lg:border-0 lg:bg-transparent lg:px-0 lg:py-24 lg:shadow-none">
      <div className={reversed ? "lg:order-1" : "lg:order-2"}>
        <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">
          {feature.eyebrow}
        </p>
        <h2 className="mt-4 max-w-xl text-3xl font-black leading-tight tracking-[-0.03em] text-white sm:text-4xl">
          {feature.title}
        </h2>
        <p className="mt-5 max-w-xl text-base leading-7 text-zinc-300 sm:text-lg">
          {feature.description}
        </p>
        <ul className="mt-7 space-y-3">
          {feature.bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-3 text-sm font-semibold text-zinc-200 sm:text-base">
              <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-400/12 text-xs text-emerald-300">
                ✓
              </span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={reversed ? "lg:order-2" : "lg:order-1"}>
        <FeatureScreen
          kind={feature.kind}
          screen={screen}
          canReplace={canReplaceScreen}
          replaceSaving={replaceSaving}
          replaceMessage={replaceMessage}
          onOpen={onOpenScreen}
          onReplace={onReplaceScreen}
        />
      </div>
    </section>
  );
}

export default function Home() {
  const [posts, setPosts] = useState<HomePost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsMessage, setPostsMessage] = useState("");
  const [showPostForm, setShowPostForm] = useState(false);
  const [postDescription, setPostDescription] = useState("");
  const [postImage, setPostImage] = useState<File | null>(null);
  const [postImagePreview, setPostImagePreview] = useState("");
  const [postSaving, setPostSaving] = useState(false);
  const [postImageSaving, setPostImageSaving] = useState<Record<number, boolean>>({});
  const [postImageMessages, setPostImageMessages] = useState<Record<number, string>>({});
  const [openedScreen, setOpenedScreen] = useState<{ src: string; alt: string } | null>(null);
  const [featureScreenOverrides, setFeatureScreenOverrides] = useState<Partial<Record<FeatureKind, string>>>({});
  const [screenUploadSaving, setScreenUploadSaving] = useState<Partial<Record<FeatureKind, boolean>>>({});
  const [screenUploadMessages, setScreenUploadMessages] = useState<Partial<Record<FeatureKind, string>>>({});
  const authSnapshot = useSyncExternalStore(
    subscribeToAuthChange,
    getAuthSnapshot,
    () => ""
  );
  const roles = authSnapshot.split("|")[2]?.split(",").filter(Boolean) || [];
  const canAddPost = roles.includes("admin");

  useEffect(() => {
    let active = true;

    fetch(apiUrl("/home-posts"), { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Nie udało się pobrać aktualności");
        }

        if (active) {
          setPosts(data);
        }
      })
      .catch((error) => {
        console.error(error);

        if (active) {
          setPostsMessage("Aktualności są chwilowo niedostępne.");
        }
      })
      .finally(() => {
        if (active) {
          setPostsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    fetch(apiUrl("/home-screens"), { cache: "no-store" })
      .then(async (response) => {
        const data: HomeScreenOverride[] = await response.json();

        if (!response.ok) {
          throw new Error("Nie udało się pobrać podmienionych screenów");
        }

        if (!active) {
          return;
        }

        const overrides: Partial<Record<FeatureKind, string>> = {};

        data.forEach((screen) => {
          if (screen.kind in featureScreens) {
            overrides[screen.kind] = apiUrl(screen.image_url);
          }
        });

        setFeatureScreenOverrides(overrides);
      })
      .catch((error) => {
        console.error(error);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (postImagePreview) {
        URL.revokeObjectURL(postImagePreview);
      }
    };
  }, [postImagePreview]);

  useEffect(() => {
    if (!openedScreen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenedScreen(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openedScreen]);

  function handlePostImageChange(file: File | null) {
    setPostImage(file);
    setPostImagePreview(file ? URL.createObjectURL(file) : "");
  }

  async function handleAddPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPostsMessage("");

    if (!postDescription.trim() || !postImage) {
      setPostsMessage("Dodaj opis oraz plik screena.");
      return;
    }

    const formData = new FormData();
    formData.append("description", postDescription.trim());
    formData.append("image", postImage);

    try {
      setPostSaving(true);
      const response = await authFetch(apiUrl("/admin/home-posts"), {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        setPostsMessage(data.detail || "Nie udało się dodać wpisu.");
        return;
      }

      setPosts((currentPosts) => [data, ...currentPosts]);
      setPostDescription("");
      setPostImage(null);
      setPostImagePreview("");
      setShowPostForm(false);
      setPostsMessage("Nowy wpis został opublikowany.");
    } catch (error) {
      console.error(error);
      setPostsMessage("Błąd połączenia z serwerem.");
    } finally {
      setPostSaving(false);
    }
  }

  async function handleReplaceFeatureScreen(kind: FeatureKind, file: File) {
    if (!file.type.startsWith("image/")) {
      setScreenUploadMessages((currentMessages) => ({
        ...currentMessages,
        [kind]: "Wybierz plik JPG, PNG albo WebP.",
      }));
      return;
    }

    const formData = new FormData();
    formData.append("image", file);

    setScreenUploadSaving((currentSaving) => ({
      ...currentSaving,
      [kind]: true,
    }));
    setScreenUploadMessages((currentMessages) => ({
      ...currentMessages,
      [kind]: "",
    }));

    try {
      const response = await authFetch(apiUrl(`/admin/home-screens/${kind}`), {
        method: "PUT",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        setScreenUploadMessages((currentMessages) => ({
          ...currentMessages,
          [kind]: data.detail || "Nie udało się podmienić screena.",
        }));
        return;
      }

      const nextSrc = apiUrl(data.image_url);

      setFeatureScreenOverrides((currentOverrides) => ({
        ...currentOverrides,
        [kind]: nextSrc,
      }));
      setScreenUploadMessages((currentMessages) => ({
        ...currentMessages,
        [kind]: "Screen podmieniony.",
      }));
    } catch (error) {
      console.error(error);
      setScreenUploadMessages((currentMessages) => ({
        ...currentMessages,
        [kind]: "Błąd połączenia z serwerem.",
      }));
    } finally {
      setScreenUploadSaving((currentSaving) => ({
        ...currentSaving,
        [kind]: false,
      }));
    }
  }

  async function handleReplacePostImage(postId: number, file: File) {
    if (!file.type.startsWith("image/")) {
      setPostImageMessages((currentMessages) => ({
        ...currentMessages,
        [postId]: "Wybierz plik JPG, PNG albo WebP.",
      }));
      return;
    }

    const formData = new FormData();
    formData.append("image", file);

    setPostImageSaving((currentSaving) => ({
      ...currentSaving,
      [postId]: true,
    }));
    setPostImageMessages((currentMessages) => ({
      ...currentMessages,
      [postId]: "",
    }));

    try {
      const response = await authFetch(apiUrl(`/admin/home-posts/${postId}/image`), {
        method: "PUT",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        setPostImageMessages((currentMessages) => ({
          ...currentMessages,
          [postId]: data.detail || "Nie udało się podmienić screena.",
        }));
        return;
      }

      setPosts((currentPosts) => currentPosts.map((post) => (
        post.id === postId ? data : post
      )));
      setPostImageMessages((currentMessages) => ({
        ...currentMessages,
        [postId]: "Screen podmieniony.",
      }));
    } catch (error) {
      console.error(error);
      setPostImageMessages((currentMessages) => ({
        ...currentMessages,
        [postId]: "Błąd połączenia z serwerem.",
      }));
    } finally {
      setPostImageSaving((currentSaving) => ({
        ...currentSaving,
        [postId]: false,
      }));
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#031c18] text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 4%, rgba(24, 160, 135, 0.28), transparent 28%), radial-gradient(circle at 12% 42%, rgba(16, 185, 129, 0.08), transparent 22%), linear-gradient(180deg, #073c35 0%, #031f1b 32%, #020d0b 100%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative">
        <TrackedAdSlot
          slot="home_mobile_top"
          device="mobile"
          placement="Mobilny baner reklamowy"
          className="min-h-20 border-x-0 border-t-0 bg-[#062c27]/95 lg:hidden"
        />

        <div className="mx-auto grid w-full max-w-[1600px] gap-8 px-4 pb-16 sm:px-6 lg:grid-cols-[160px_minmax(0,1120px)_160px] lg:justify-center lg:px-6">
          <TrackedAdSlot
            slot="home_desktop_left"
            device="desktop"
            placement="Lewa kolumna reklamowa"
            className="sticky top-6 mt-8 hidden h-[600px] rounded-2xl bg-[#062c27]/75 lg:flex"
          />

          <div className="min-w-0">
            <section className="flex min-h-[calc(100vh-3rem)] flex-col items-center justify-center pb-14 pt-16 text-center sm:pt-20 lg:min-h-[760px] lg:pb-20 lg:pt-20">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/8 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200 sm:text-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.9)]" />
                Wszystko, czego potrzebują zawody
              </div>

              <h1 className="mt-7 w-full text-4xl font-black leading-[0.98] tracking-[-0.055em] text-white sm:text-6xl lg:text-[clamp(4.75rem,5vw,6rem)]">
                System Organizacji
                <span className="block text-emerald-300">Zawodów Strzeleckich</span>
              </h1>

              <p className="mt-8 max-w-3xl text-base leading-7 text-zinc-300 sm:text-xl sm:leading-8">
                Kompleksowy system do obsługi zawodów strzeleckich. Rejestracja zawodników,
                sędziowanie, wyniki na żywo, rankingi i historia startów w jednym miejscu.
              </p>

              <div className="mt-9 flex w-full max-w-md flex-col justify-center gap-3 sm:w-auto sm:max-w-none sm:flex-row">
                <Link
                  href="/register"
                  className="rounded-xl bg-emerald-400 px-7 py-3.5 text-sm font-black text-[#05221d] shadow-[0_12px_35px_rgba(52,211,153,0.2)] transition hover:-translate-y-0.5 hover:bg-emerald-300"
                >
                  Załóż konto
                </Link>
                <Link
                  href="/competitions"
                  className="rounded-xl border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-black text-white transition hover:-translate-y-0.5 hover:border-emerald-300/50 hover:bg-white/10"
                >
                  Przeglądaj zawody
                </Link>
              </div>

              <Image
                src="/icons/system-strzelecki-logo-20260623.png"
                alt="Logo Systemu Organizacji Zawodów Strzeleckich"
                width={1560}
                height={1008}
                priority
                sizes="(min-width: 1024px) 430px, (min-width: 640px) 360px, 280px"
                className="mt-10 h-auto w-[280px] drop-shadow-[0_22px_40px_rgba(0,0,0,0.5)] sm:w-[360px] lg:w-[430px]"
              />

              {canAddPost && (
                <div className="mt-7 w-full max-w-2xl">
                  <button
                    type="button"
                    onClick={() => setShowPostForm((currentValue) => !currentValue)}
                    className="rounded-xl border border-emerald-300/45 bg-emerald-300/10 px-5 py-3 text-sm font-black text-emerald-100 transition hover:bg-emerald-300/20"
                  >
                    {showPostForm ? "Anuluj dodawanie wpisu" : "+ Dodaj nowy wpis"}
                  </button>

                  {showPostForm && (
                    <form
                      onSubmit={handleAddPost}
                      className="mt-5 rounded-2xl border border-emerald-300/25 bg-black/30 p-5 text-left shadow-2xl backdrop-blur-sm"
                    >
                      <label htmlFor="home-post-description" className="block text-sm font-black text-white">
                        Opis aktualności
                      </label>
                      <textarea
                        id="home-post-description"
                        value={postDescription}
                        onChange={(event) => setPostDescription(event.target.value)}
                        maxLength={4000}
                        required
                        placeholder="Napisz, co nowego pojawiło się w systemie..."
                        className="mt-2 min-h-32 w-full rounded-xl border border-white/15 bg-[#031713] p-4 text-white outline-none transition focus:border-emerald-300"
                      />

                      <label htmlFor="home-post-image" className="mt-4 block text-sm font-black text-white">
                        Screen
                      </label>
                      <input
                        id="home-post-image"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        required
                        onChange={(event) => handlePostImageChange(event.target.files?.[0] || null)}
                        className="mt-2 w-full text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-500 file:px-4 file:py-2 file:font-black file:text-emerald-950"
                      />

                      {postImagePreview && (
                        <div className="relative mt-4 aspect-video overflow-hidden rounded-xl border border-white/10 bg-black/30">
                          <Image
                            src={postImagePreview}
                            alt="Podgląd dodawanego screena"
                            fill
                            unoptimized
                            className="object-contain"
                          />
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={postSaving}
                        className="mt-5 w-full rounded-xl bg-emerald-400 px-5 py-3 font-black text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-60"
                      >
                        {postSaving ? "Publikowanie..." : "Opublikuj wpis"}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </section>

            {(posts.length > 0 || postsLoading || postsMessage) && (
              <section aria-labelledby="home-news-title" className="border-t border-white/8 py-10 lg:py-16">
                <div className="mb-7">
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">
                    Co nowego
                  </p>
                  <h2 id="home-news-title" className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
                    Aktualności
                  </h2>
                </div>

                {postsMessage && (
                  <p className="mb-5 rounded-xl border border-emerald-300/20 bg-emerald-300/8 px-4 py-3 text-sm font-semibold text-emerald-100">
                    {postsMessage}
                  </p>
                )}

                {postsLoading && (
                  <p className="text-zinc-400">Ładowanie aktualności...</p>
                )}

                <div className="space-y-7">
                  {posts.map((post) => {
                    const postImageInputId = `home-post-image-replace-${post.id}`;
                    const postImageUrl = apiUrl(post.image_url);

                    return (
                      <article
                        key={post.id}
                        className="grid gap-7 rounded-2xl border border-white/12 bg-white/[0.05] p-5 shadow-2xl sm:p-7 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center"
                      >
                        <div>
                          <p className="whitespace-pre-line text-base leading-7 text-zinc-200 sm:text-lg">
                            {post.description}
                          </p>
                          <time
                            dateTime={post.created_at}
                            className="mt-4 block text-xs font-bold uppercase tracking-wider text-emerald-300/80"
                          >
                            {new Intl.DateTimeFormat("pl-PL", {
                              dateStyle: "long",
                              timeZone: "Europe/Warsaw",
                            }).format(new Date(post.created_at))}
                          </time>
                        </div>

                        <div className="relative">
                          {canAddPost && (
                            <div className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-2 rounded-xl border border-emerald-300/40 bg-black/80 p-2 shadow-xl backdrop-blur-sm">
                              <input
                                id={postImageInputId}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                disabled={Boolean(postImageSaving[post.id])}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  event.target.value = "";

                                  if (file) {
                                    void handleReplacePostImage(post.id, file);
                                  }
                                }}
                                className="sr-only"
                              />
                              <label
                                htmlFor={postImageInputId}
                                className="cursor-pointer rounded-lg bg-emerald-400 px-3 py-2 text-xs font-black text-emerald-950 transition hover:bg-emerald-300"
                              >
                                {postImageSaving[post.id] ? "Wgrywanie..." : "Podmień screen"}
                              </label>
                              {postImageMessages[post.id] && (
                                <p className="max-w-56 text-left text-[11px] font-semibold leading-4 text-emerald-100">
                                  {postImageMessages[post.id]}
                                </p>
                              )}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => setOpenedScreen({
                              src: postImageUrl,
                              alt: "Screen do aktualności",
                            })}
                            aria-label="Otwórz screen aktualności w pełnej rozdzielczości"
                            title="Kliknij, aby powiększyć screen"
                            className="group relative block w-full cursor-zoom-in overflow-hidden rounded-xl border border-white/10 bg-[#071713] p-0 text-left outline-none transition hover:-translate-y-1 hover:border-emerald-300/50 focus-visible:ring-2 focus-visible:ring-emerald-300"
                          >
                            <Image
                              src={postImageUrl}
                              alt="Screen do aktualności"
                              width={2200}
                              height={1400}
                              sizes="(min-width: 1024px) 650px, 100vw"
                              unoptimized
                              className="h-auto w-full transition duration-300 group-hover:scale-[1.01]"
                            />
                            <span className="absolute bottom-3 right-3 rounded-lg bg-black/75 px-3 py-2 text-xs font-black text-white opacity-100 shadow-lg backdrop-blur-sm transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100">
                              Powiększ
                            </span>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            <div className="border-t border-white/8">
              {features.map((feature, index) => {
                const screen = {
                  ...featureScreens[feature.kind],
                  src: featureScreenOverrides[feature.kind] || featureScreens[feature.kind].src,
                };

                return (
                  <FeatureSection
                    key={feature.title}
                    feature={feature}
                    screen={screen}
                    reversed={index % 2 === 1}
                    canReplaceScreen={canAddPost}
                    replaceSaving={Boolean(screenUploadSaving[feature.kind])}
                    replaceMessage={screenUploadMessages[feature.kind] || ""}
                    onOpenScreen={setOpenedScreen}
                    onReplaceScreen={handleReplaceFeatureScreen}
                  />
                );
              })}
            </div>

            <section className="my-12 overflow-hidden rounded-[2rem] border border-emerald-300/15 bg-emerald-300/[0.07] px-6 py-12 text-center shadow-[0_24px_80px_rgba(0,0,0,0.2)] sm:px-10 sm:py-16">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">
                Gotowy na start?
              </p>
              <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl">
                Organizuj zawody sprawniej
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-zinc-300">
                Załóż konto lub zobacz zawody dostępne już teraz.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  href="/register"
                  className="rounded-xl bg-emerald-400 px-7 py-3.5 text-sm font-black text-[#05221d] transition hover:bg-emerald-300"
                >
                  Załóż konto
                </Link>
                <Link
                  href="/competitions"
                  className="rounded-xl border border-white/15 px-7 py-3.5 text-sm font-black text-white transition hover:bg-white/10"
                >
                  Zobacz zawody
                </Link>
              </div>
            </section>
          </div>

          <TrackedAdSlot
            slot="home_desktop_right"
            device="desktop"
            placement="Prawa kolumna reklamowa"
            className="sticky top-6 mt-8 hidden h-[600px] rounded-2xl bg-[#062c27]/75 lg:flex"
          />
        </div>
      </div>

      {openedScreen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Powiększony screen"
          onClick={() => setOpenedScreen(null)}
        >
          <div
            className="relative flex max-h-full max-w-full items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <Image
              src={openedScreen.src}
              alt={openedScreen.alt}
              width={2880}
              height={1800}
              unoptimized
              priority
              className="max-h-[calc(100vh-1.5rem)] w-auto max-w-[calc(100vw-1.5rem)] rounded-xl object-contain shadow-2xl sm:max-h-[calc(100vh-3rem)] sm:max-w-[calc(100vw-3rem)]"
            />
            <button
              type="button"
              onClick={() => setOpenedScreen(null)}
              aria-label="Zamknij powiększony screen"
              className="absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full bg-black/80 text-2xl font-black text-white shadow-xl transition hover:bg-emerald-500 hover:text-emerald-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
