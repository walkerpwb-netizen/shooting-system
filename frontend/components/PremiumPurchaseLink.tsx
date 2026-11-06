import Link from "next/link";

export default function PremiumPurchaseLink({ onClick }: { onClick?: () => void }) {
  return (
    <Link
      href="/premium/zakup"
      onClick={onClick}
      className="ui-button inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white transition hover:bg-emerald-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
    >
      Kup Dostęp
    </Link>
  );
}
