import AutopayMethodsBanner from "./AutopayMethodsBanner";

export default function AutopayPaymentInfo({ wideDesktop = false }: { wideDesktop?: boolean }) {
  return (
    <section aria-label="Informacje o płatnościach Autopay" className="my-8 rounded-2xl border border-green-700 bg-green-950 p-5 text-green-50 print:border-zinc-400 print:bg-white print:text-black">
      <h2 className="text-xl font-bold">Płatności online — Autopay</h2>
      <p className="mt-3 leading-7">
        Dostępne metody płatności: BLIK i przelew tradycyjny. Metodę wybierzesz w bramce Autopay.
      </p>
      <div className="mt-5"><AutopayMethodsBanner wideDesktop={wideDesktop} /></div>
    </section>
  );
}
