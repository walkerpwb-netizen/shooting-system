"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "./api";
import { authFetch } from "./auth";
import { GUN_SHOP_SUBMISSIONS_CHANGE_EVENT, GUN_SHOP_SUBMISSIONS_CHANGE_STORAGE_KEY } from "./gunShopNotifications";

export function usePendingGunShopSubmissions(isAdmin: boolean, token: string) {
  const [result, setResult] = useState({ token: "", count: 0 });
  useEffect(() => {
    if (!isAdmin || !token) return;
    let active = true;
    let generation = 0;
    async function load() {
      const requestGeneration = ++generation;
      try {
        const response = await authFetch(apiUrl("/admin/gun-shop-submissions"), { cache: "no-store" });
        const data: { status?: string }[] = await response.json().catch(() => []);
        if (active && requestGeneration === generation) setResult({ token,
          count: response.ok && Array.isArray(data) ? data.filter((entry) => entry.status === "pending").length : 0,
        });
      } catch {
        if (active && requestGeneration === generation) setResult({ token, count: 0 });
      }
    }
    const refresh = () => { if (!document.hidden) void load(); };
    const onStorage = (event: StorageEvent) => { if (event.key === GUN_SHOP_SUBMISSIONS_CHANGE_STORAGE_KEY) refresh(); };
    void load();
    window.addEventListener(GUN_SHOP_SUBMISSIONS_CHANGE_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    const interval = window.setInterval(refresh, 15000);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener(GUN_SHOP_SUBMISSIONS_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
    };
  }, [isAdmin, token]);
  return isAdmin && result.token === token ? result.count : 0;
}
