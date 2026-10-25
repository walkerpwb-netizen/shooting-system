import Image from "next/image";

export default function AutopayPaymentInfo() {
  return (
    <section aria-label="Informacje o płatnościach Autopay" className="my-8 rounded-2xl border border-green-700 bg-green-950 p-5 text-green-50 print:border-zinc-400 print:bg-white print:text-black">
      <h2 className="text-xl font-bold">Planowane płatności online — Autopay</h2>
      <p className="mt-3 leading-7">
        <strong>Rzeczywiste płatności są wyłączone do czasu pozytywnej weryfikacji Autopay.</strong> Po uruchomieniu płatności dostępność poszczególnych metod będzie widoczna w bramce płatniczej.
      </p>
      <Image
        src="/payments/autopay-methods.png"
        alt="Autopay — BLIK, Visa, Mastercard, Apple Pay i Google Pay"
        width={485}
        height={115}
        unoptimized
        className="mt-5 h-auto w-full max-w-[485px]"
      />
    </section>
  );
}
