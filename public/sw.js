// Cache dei file dell'app: si apre anche senza rete (i dati usano la cache di Firestore).
const C = "pattinaggio-v29";
const FILES = ["./", "index.html", "style.css", "app.js", "design.js", "icons.js", "a11y.js", "drag.js", "samples.js", "backend.js", "catalog.js", "sched.js", "help.js", "stickers.js", "config.js",
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
  // no-cache: ricontrolla sempre col server (GitHub Pages fa tenere i file 10 minuti al browser,
  // e senza questo si mescolavano file vecchi e nuovi dopo un aggiornamento)
  e.respondWith(fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" }).then((r) => {
    const copy = r.clone();
    caches.open(C).then((c) => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
