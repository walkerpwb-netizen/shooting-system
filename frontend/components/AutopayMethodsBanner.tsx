import Image from "next/image";

export default function AutopayMethodsBanner({ wideDesktop = false }: { wideDesktop?: boolean }) {
  return (
    <div
      role="group"
      aria-label="Metody płatności Autopay: BLIK i przelew tradycyjny"
      className={`grid w-full max-w-[485px] grid-cols-2 overflow-hidden rounded-xl border border-zinc-200 bg-white text-zinc-950 sm:grid-cols-[1.1fr_1fr_1.3fr] ${wideDesktop ? "lg:mx-auto lg:max-w-[800px]" : ""}`}
    >
      <div className="col-span-2 flex min-h-20 items-center justify-center bg-[#e4ff9c] px-6 py-5 sm:col-span-1 sm:rounded-r-full">
        <Image src="/payments/autopay-logo.svg" alt="Autopay" width={142} height={36} unoptimized className="h-auto w-full max-w-[142px]" />
      </div>
      <div className="flex min-h-32 items-center justify-center border-r border-zinc-200 px-3">
        <Image src="/payments/blik-logo.png" alt="BLIK" width={123} height={123} unoptimized className="h-24 w-24" />
      </div>
      <div className="flex min-h-32 flex-col items-center justify-center gap-2 px-3 py-5 text-center">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9 text-green-800">
          <path d="m3 9 9-6 9 6H3Z M3 21h18 M5 18v-6 M10 18v-6 M14 18v-6 M19 18v-6" />
        </svg>
        <span className="max-w-36 text-sm font-bold sm:text-base">Przelew tradycyjny</span>
      </div>
    </div>
  );
}
