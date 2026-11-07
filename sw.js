const CACHE = "cam2app-shell-v1";
const SHELL = ["./", "./index.html", "./style.css", "./app.js", "./manifest.json",
  "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Shell files: cache-first. Everything else (models, Telegram API): network-only,
// so detection models and alerts always use a live connection.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const isShell = url.origin === location.origin && SHELL.some((p) => url.pathname.endsWith(p.replace("./", "")));
  if (!isShell) return;
  e.respondWith(caches.match(e.request).then((cached) => cached || fetch(e.request)));
});
