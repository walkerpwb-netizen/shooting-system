import { apiUrl } from "@/lib/api";
import { authFetch } from "@/lib/auth";

const PUSH_DEVICE_ID_STORAGE_KEY = "shooting-system:push-device-id";
const WEB_PUSH_PUBLIC_KEY = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY || "";

export type PushLoginSource = "pwa_standalone" | "browser";

export type PushDevicePayload = {
  device_id: string;
  device_name: string;
  platform: string;
  browser: string;
  login_source: PushLoginSource;
  notification_permission: string;
};

export type PushDevice = {
  id: number;
  device_id: string;
  device_name: string;
  platform: string;
  browser: string;
  login_source: string;
  push_status: string;
  has_subscription: boolean;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
  last_subscribed_at: string;
  disabled_at: string;
};

export type PushStatusResponse = PushDevice & {
  should_prompt: boolean;
  message?: string;
};

export type PushPreferences = {
  new_events: boolean;
  my_event_cancelled: boolean;
  my_event_started: boolean;
  organizer_participant_changes: boolean;
  organizer_participant_changes_available: boolean;
  updated_at: string;
};

function browserName() {
  const userAgent = navigator.userAgent;

  if (/edg\//i.test(userAgent)) {
    return "Edge";
  }

  if (/chrome|crios/i.test(userAgent) && !/edg\//i.test(userAgent)) {
    return "Chrome";
  }

  if (/firefox|fxios/i.test(userAgent)) {
    return "Firefox";
  }

  if (/safari/i.test(userAgent) && !/chrome|crios|android/i.test(userAgent)) {
    return "Safari";
  }

  return "Przeglądarka";
}

function platformName() {
  const userAgent = navigator.userAgent;
  const navigatorData = navigator as Navigator & {
    userAgentData?: {
      platform?: string;
    };
  };

  if (navigatorData.userAgentData?.platform) {
    return navigatorData.userAgentData.platform;
  }

  if (/iphone|ipad|ipod/i.test(userAgent)) {
    return "iOS";
  }

  if (/android/i.test(userAgent)) {
    return "Android";
  }

  if (/windows/i.test(userAgent)) {
    return "Windows";
  }

  if (/mac os|macintosh/i.test(userAgent)) {
    return "macOS";
  }

  return "Urządzenie";
}

export function pushLoginSource(): PushLoginSource {
  if (typeof window === "undefined") {
    return "browser";
  }

  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };

  return window.matchMedia("(display-mode: standalone)").matches
    || navigatorWithStandalone.standalone
    ? "pwa_standalone"
    : "browser";
}

export function isPwaStandalone() {
  return pushLoginSource() === "pwa_standalone";
}

function notificationPermission() {
  return typeof Notification === "undefined"
    ? "unsupported"
    : Notification.permission;
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /macintosh/i.test(navigator.userAgent));
}

function permissionErrorMessage(permission: NotificationPermission) {
  if (permission === "denied") {
    return "Powiadomienia są zablokowane w ustawieniach systemu lub aplikacji. Na iPhonie usuń aplikację z ekranu początkowego i dodaj ją ponownie z Safari z włączoną opcją otwierania jako aplikacja webowa. Jeżeli widzisz dolny pasek Safari, iOS nie uruchomił pełnej aplikacji PWA dla Web Push.";
  }

  if (isIosDevice()) {
    return "iPhone nie wyświetlił systemowego pytania. Uruchom aplikację z ikony na ekranie początkowym, sprawdź iOS 16.4 lub nowszy oraz czy aplikacja otwiera się bez dolnego paska Safari.";
  }

  return "Powiadomienia nie zostały włączone.";
}

function requestNotificationPermission() {
  return new Promise<NotificationPermission>((resolve) => {
    let resolved = false;

    function finish(permission: NotificationPermission) {
      if (resolved) {
        return;
      }

      resolved = true;
      resolve(permission);
    }

    const permissionResult = Notification.requestPermission(finish);

    if (permissionResult?.then) {
      permissionResult.then(finish).catch(() => finish(Notification.permission));
    }
  });
}

export function hasPushSupport() {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window
    && Boolean(WEB_PUSH_PUBLIC_KEY);
}

export function webPushPublicKeyConfigured() {
  return Boolean(WEB_PUSH_PUBLIC_KEY);
}

export function getOrCreatePushDeviceId() {
  if (typeof window === "undefined") {
    return "";
  }

  const existingDeviceId = localStorage.getItem(PUSH_DEVICE_ID_STORAGE_KEY);

  if (existingDeviceId) {
    return existingDeviceId;
  }

  const deviceId = crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  localStorage.setItem(PUSH_DEVICE_ID_STORAGE_KEY, deviceId);

  return deviceId;
}

export function currentPushDevicePayload(): PushDevicePayload {
  const platform = platformName();
  const browser = browserName();

  return {
    device_id: getOrCreatePushDeviceId(),
    device_name: `${platform} ${browser}`.trim(),
    platform,
    browser,
    login_source: pushLoginSource(),
    notification_permission: notificationPermission(),
  };
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return output;
}

async function registerPushServiceWorker() {
  const registration = await navigator.serviceWorker.register("/push-service-worker.js");
  await navigator.serviceWorker.ready;

  return registration;
}

export async function fetchCurrentPushStatus() {
  if (!isPwaStandalone()) {
    return null;
  }

  const response = await authFetch(apiUrl("/me/push-subscriptions/status"), {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(currentPushDevicePayload()),
  });

  if (!response.ok) {
    return null;
  }

  return response.json() as Promise<PushStatusResponse>;
}

export async function subscribeCurrentDeviceToPush() {
  if (!hasPushSupport()) {
    throw new Error("Ta przeglądarka nie obsługuje powiadomień push w aplikacji.");
  }

  const permission = await requestNotificationPermission();

  if (permission !== "granted") {
    await saveCurrentPushDecision(permission === "denied" ? "denied" : "dismissed");
    throw new Error(permissionErrorMessage(permission));
  }

  const registration = await registerPushServiceWorker();
  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription = existingSubscription || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY),
  });

  const subscriptionJson = subscription.toJSON();
  const response = await authFetch(apiUrl("/me/push-subscriptions"), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...currentPushDevicePayload(),
      notification_permission: permission,
      subscription: {
        endpoint: subscriptionJson.endpoint || subscription.endpoint,
        keys: {
          p256dh: subscriptionJson.keys?.p256dh || "",
          auth: subscriptionJson.keys?.auth || "",
        },
      },
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.detail || "Nie udało się zapisać urządzenia.");
  }

  return data as PushStatusResponse;
}

export async function saveCurrentPushDecision(pushStatus: "denied" | "dismissed") {
  await authFetch(apiUrl("/me/push-subscriptions/decision"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...currentPushDevicePayload(),
      push_status: pushStatus,
    }),
  });
}

export async function listPushDevices() {
  const response = await authFetch(apiUrl("/me/push-subscriptions"), {
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  return response.json() as Promise<PushDevice[]>;
}

export async function disablePushDevice(deviceId: string) {
  const response = await authFetch(
    apiUrl(`/me/push-subscriptions/${encodeURIComponent(deviceId)}`),
    {
      method: "DELETE",
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.detail || "Nie udało się wyłączyć urządzenia.");
  }

  return data as { message?: string; device_id?: string };
}

export async function getPushPreferences() {
  const response = await authFetch(apiUrl("/me/push-preferences"), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Nie udało się pobrać preferencji powiadomień.");
  }

  return response.json() as Promise<PushPreferences>;
}

export async function savePushPreferences(preferences: PushPreferences) {
  const response = await authFetch(apiUrl("/me/push-preferences"), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      new_events: preferences.new_events,
      my_event_cancelled: preferences.my_event_cancelled,
      my_event_started: preferences.my_event_started,
      organizer_participant_changes: preferences.organizer_participant_changes,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.detail || "Nie udało się zapisać preferencji powiadomień.");
  }

  return data as PushPreferences & { message?: string };
}
