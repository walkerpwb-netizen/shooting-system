import Link from "next/link";

import { PREMIUM_EXPIRED_MESSAGE } from "@/lib/premium";

export function PremiumPurchaseLink({ onClick }: { onClick?: () => void }) {
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

export default function PremiumAccessMessage({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <div role="alert" className={className}>
      <p>{message}</p>
      {message === PREMIUM_EXPIRED_MESSAGE && (
        <div className="mt-3">
          <PremiumPurchaseLink />
        </div>
      )}
    </div>
  );
}
