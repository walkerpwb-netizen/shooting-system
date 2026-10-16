import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

type Props = {
  clubName: string;
  email: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<string | null>;
};

export default function PzssClubRejectionDialog({ clubName, email, onClose, onConfirm }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError("Podaj powód odrzucenia klubu PZSS.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const failure = await onConfirm(trimmedReason);
      if (failure) {
        setError(failure);
      } else {
        onClose();
      }
    } catch {
      setError("Nie udało się odrzucić klubu. Spróbuj ponownie.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="pzss-rejection-title"
      aria-describedby="pzss-rejection-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!submitting) onClose();
      }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-white shadow-2xl backdrop:bg-black/70"
    >
      <form onSubmit={submit} aria-busy={submitting}>
        <h2 id="pzss-rejection-title" className="text-2xl font-black">
          Odrzuć klub PZSS
        </h2>
        <p className="mt-2 font-semibold">{clubName}</p>
        <p id="pzss-rejection-description" className="mt-2 text-sm text-gray-400">
          Konto klubu zostanie usunięte. Powód odrzucenia zostanie wysłany e-mailem na adres {email}.
        </p>

        <label htmlFor="pzss-rejection-reason" className="mt-5 mb-2 block text-sm font-bold text-gray-300">
          Powód odrzucenia (wymagany)
        </label>
        <textarea
          id="pzss-rejection-reason"
          name="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
          maxLength={2000}
          rows={5}
          autoFocus
          disabled={submitting}
          aria-describedby="pzss-rejection-hint"
          placeholder="Wyjaśnij, dlaczego zgłoszenie klubu zostało odrzucone..."
          className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder:text-gray-500 disabled:opacity-60"
        />
        <p id="pzss-rejection-hint" className="mt-1 text-xs text-gray-500">
          Maksymalnie 2000 znaków. Wpisana treść znajdzie się w wiadomości do klubu.
        </p>
        {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl bg-zinc-800 px-5 py-3 font-semibold transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Anuluj
          </button>
          <button
            type="submit"
            disabled={submitting || !reason.trim()}
            className="rounded-xl bg-red-700 px-5 py-3 font-semibold transition hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-zinc-700"
          >
            {submitting ? "Odrzucam..." : "Odrzuć i wyślij e-mail"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
