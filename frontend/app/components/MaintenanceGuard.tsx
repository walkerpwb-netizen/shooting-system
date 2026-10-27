"use client";

import { useEffect } from "react";

export default function MaintenanceGuard() {
  useEffect(() => {
    let pending = false;
    let stopped = false;
    let controller: AbortController | null = null;

    async function check() {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 5000);
      try {
        const response = await fetch("/maintenance/status", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const status = await response.json();
        if (!stopped && status.restricted === 1) {
          // A full navigation lets nginx serve its independent maintenance screen.
          window.location.reload();
        }
      } catch {
        // A network error alone does not mean that maintenance was enabled.
      } finally {
        window.clearTimeout(timeout);
        pending = false;
      }
    }

    const timer = window.setInterval(check, 15000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    window.addEventListener("pageshow", check);
    void check();

    return () => {
      stopped = true;
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      window.removeEventListener("pageshow", check);
    };
  }, []);

  return null;
}
