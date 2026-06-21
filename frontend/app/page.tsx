import Image from "next/image";

import TrackedAdSlot from "@/components/TrackedAdSlot";

export default function Home() {
  return (
    <main
      className="min-h-screen bg-[#063b36] text-zinc-950 dark:text-white"
      style={{
        backgroundImage:
          "radial-gradient(circle at 50% 22%, rgba(28, 176, 159, 0.32), transparent 38%), linear-gradient(90deg, rgba(0, 0, 0, 0.32), transparent 18%, transparent 82%, rgba(0, 0, 0, 0.38)), repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.035) 0, rgba(255, 255, 255, 0.035) 1px, transparent 1px, transparent 8px), linear-gradient(180deg, #087466 0%, #064c43 45%, #042d2a 100%)",
        backgroundAttachment: "fixed",
        backgroundPosition: "center",
        backgroundSize: "cover",
      }}
    >
      <TrackedAdSlot
        slot="home_mobile_top"
        device="mobile"
        placement="Mobilny baner reklamowy"
        className="min-h-16 border-x-0 border-t-0 lg:hidden"
      />

      <div className="mx-auto grid w-full max-w-[1600px] gap-8 px-0 pt-0 pb-10 lg:grid-cols-[160px_minmax(0,1fr)_160px] lg:items-start lg:px-6">
        <TrackedAdSlot
          slot="home_desktop_left"
          device="desktop"
          placement="Lewa kolumna reklamowa"
          className="sticky top-6 hidden h-[600px] lg:flex"
        />

        <div className="flex min-h-[60vh] items-start justify-center px-0 pt-0 pb-8 sm:pt-0 sm:pb-10 lg:pt-0 lg:pb-12">
          <Image
            src="/icons/Logo-final-20260604-2200-cropped.png"
            alt="System Organizacji Zawodów Strzeleckich"
            width={1317}
            height={1010}
            priority
            sizes="(min-width: 1024px) 100vw, 100vw"
            className="h-auto w-screen max-w-none drop-shadow-2xl lg:w-full lg:max-w-full"
          />
        </div>

        <TrackedAdSlot
          slot="home_desktop_right"
          device="desktop"
          placement="Prawa kolumna reklamowa"
          className="sticky top-6 hidden h-[600px] lg:flex"
        />
      </div>
    </main>
  );
}
