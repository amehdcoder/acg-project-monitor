/* Web Push handler — imported by the generated Workbox service worker.
   Shows notifications even when the app is closed, and focuses/opens the
   app when a notification is clicked. */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = { title: "New message", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Amehnities";
  const options = {
    body: data.body || "",
    tag: data.tag || "amehnities-chat",
    renotify: true,
    icon: "/pwa-icon-192.png",
    badge: "/pwa-icon-192.png",
    data: { url: data.url || "/?tab=project-chat" },
    vibrate: [80, 40, 80],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/?tab=project-chat";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(targetUrl);
            } catch (_e) { /* ignore cross-origin */ }
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
