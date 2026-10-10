"use client";

import { useState } from "react";

import {
  saveCurrentPushDecision,
  subscribeCurrentDeviceToPush,
  webPushPublicKeyConfigured,
} from "@/lib/pushNotifications";

type PushNotificationPromptProps = {
  onFinished: () => void;
};

export default function PushNotificationPrompt({
  onFinished,
}: PushNotificationPromptProps) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function enablePush() {
    try {
      setSaving(true);
      setMessage("");
      await subscribeCurrentDeviceToPush();
      setMessage("Powiadomienia zostały włączone.");
      window.setTimeout(onFinished, 500);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się włączyć powiadomień.");
      setSaving(false);
    }
  }

  async function dismissPrompt() {
    try {
      setSaving(true);
      await saveCurrentPushDecision("dismissed");
    } finally {
      onFinished();
    }
  }

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-zinc-950 px-4 py-8 text-white">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center">
        <div className="border border-emerald-300/20 bg-white/[0.06] p-6 shadow-2xl sm:p-10">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">
            Aplikacja System Strzelecki
          </p>

          <h2 className="mt-4 text-3xl font-black sm:text-5xl">
            Włączyć powiadomienia push?
          </h2>

          <p className="mt-5 text-lg leading-8 text-zinc-200">
            Możemy informować Cię na tym urządzeniu o nowych zawodach, zmianach
            w zapisach, komunikatach organizatorów i opublikowanych wynikach.
          </p>

          <div className="mt-6 grid gap-3 text-sm leading-6 text-zinc-300 sm:grid-cols-3">
            <div className="border border-white/10 bg-black/20 p-4">
              Nowe zawody i treningi
            </div>
            <div className="border border-white/10 bg-black/20 p-4">
              Zmiany w wydarzeniach
            </div>
            <div className="border border-white/10 bg-black/20 p-4">
              Wyniki i komunikaty
            </div>
          </div>

          {!webPushPublicKeyConfigured() && (
            <p className="mt-5 border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-100">
              Powiadomienia wymagają konfiguracji klucza Web Push na serwerze.
            </p>
          )}

          {message && (
            <p className="mt-5 border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-zinc-100">
              {message}
            </p>
          )}

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={enablePush}
              disabled={saving || !webPushPublicKeyConfigured()}
              className="bg-emerald-400 px-5 py-4 font-black text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Zapisywanie..." : "Włącz powiadomienia"}
            </button>

            <button
              type="button"
              onClick={dismissPrompt}
              disabled={saving}
              className="border border-white/15 bg-white/10 px-5 py-4 font-bold text-white transition hover:bg-white/15 disabled:opacity-50"
            >
              Nie teraz
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
