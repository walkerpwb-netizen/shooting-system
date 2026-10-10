self.addEventListener("push", (event) => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = {
        body: event.data.text(),
      };
    }
  }

  const title = payload.title || "System Strzelecki";
  const url = payload.url || "/";
  const options = {
    body: payload.body || "Masz nowe powiadomienie w Systemie Strzeleckim.",
    icon: payload.icon || "/icons/system-strzelecki-192.png",
    badge: payload.badge || "/icons/system-strzelecki-192.png",
    data: {
      url,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }

      return self.clients.openWindow(targetUrl);
    })
  );
});
