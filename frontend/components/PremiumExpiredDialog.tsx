"use client";

import { useEffect, useId, useRef } from "react";

import { PREMIUM_EXPIRED_MESSAGE } from "@/lib/premium";
import { PremiumPurchaseLink } from "./PremiumAccessMessage";

export default function PremiumExpiredDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-950 shadow-2xl backdrop:bg-black/70 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
    >
      <p id={titleId} className="text-lg font-medium">
        {PREMIUM_EXPIRED_MESSAGE}
      </p>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="ui-button min-h-11 rounded-lg border border-zinc-300 px-4 py-2 font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Zamknij
        </button>
        <PremiumPurchaseLink onClick={onClose} />
      </div>
    </dialog>
  );
}
