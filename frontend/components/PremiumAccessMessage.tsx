"use client";

import { useState } from "react";

import { PREMIUM_EXPIRED_MESSAGE } from "@/lib/premium";
import PremiumExpiredDialog from "./PremiumExpiredDialog";

function DismissiblePremiumExpiredDialog({ onDismiss }: { onDismiss?: () => void }) {
  const [open, setOpen] = useState(true);

  if (!open) return null;

  return (
    <PremiumExpiredDialog onClose={() => {
      setOpen(false);
      onDismiss?.();
    }} />
  );
}

export default function PremiumAccessMessage({
  message,
  className,
  onDismiss,
}: {
  message: string;
  className?: string;
  onDismiss?: () => void;
}) {
  if (message === PREMIUM_EXPIRED_MESSAGE) {
    return <DismissiblePremiumExpiredDialog onDismiss={onDismiss} />;
  }

  return (
    <div role="alert" className={className}>
      <p>{message}</p>
    </div>
  );
}
