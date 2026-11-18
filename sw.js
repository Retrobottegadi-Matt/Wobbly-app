// Cache dei file dell'app: si apre anche senza rete (i dati usano la cache di Firestore).
const C = "pattinaggio-v2";
const FILES = ["./", "index.html", "style.css", "app.js", "backend.js", "catalog.js", "config.js",
  "manifest.json", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(C).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== C).map((x) => caches.delete(x)))));
  self.clients.claim();
});
// rete prima, cache se offline (così gli aggiornamenti arrivano subito)
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone();
    caches.open(C).then((c) => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
