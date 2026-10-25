import type { PremiumCommerce } from "@/lib/premiumCommerce";

export default function PremiumSellerDetails({ seller }: { seller?: PremiumCommerce["seller"] }) {
  if (!seller?.complete) {
    return (
      <div className="rounded-xl border border-amber-400/50 p-4">
        <strong>Dane sprzedawcy są chwilowo niedostępne.</strong> Odśwież stronę lub skontaktuj się z serwisem. Sprzedaż Premium pozostaje wyłączona.
        {seller?.email && <p className="mt-2">Kontakt: <a className="underline" href={`mailto:${seller.email}`}>{seller.email}</a></p>}
      </div>
    );
  }

  return (
    <address className="space-y-2 not-italic">
      <p><strong>{seller.name}</strong> — osoba fizyczna prowadząca działalność nierejestrowaną, bez wpisu do CEIDG.</p>
      <p className="whitespace-pre-line">Adres do korespondencji i reklamacji: {seller.address}</p>
      <p>E-mail: <a className="underline" href={`mailto:${seller.email}`}>{seller.email}</a></p>
      <p>Telefon: <a className="underline" href={`tel:${seller.phone.replace(/[^+\d]/g, "")}`}>{seller.phone}</a></p>
      {seller.nip && <p>NIP: {seller.nip}</p>}
    </address>
  );
}
