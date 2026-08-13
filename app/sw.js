// Cache so da casca do app (o saldo e sempre ao vivo, nunca cacheado).
// O nome TEM que mudar quando a casca muda: o activate so apaga cache de nome diferente,
// entao repetir o nome deixa a versao velha do app viva no celular.
const CACHE = "estoque-v6";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(["./", "manifest.webmanifest"])));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

// So a casca do app entra no cache. A consulta de saldo vai para outro dominio (o Worker)
// e NUNCA e cacheada: saldo velho no balcao faz vender o que nao tem.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(r => { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request, {ignoreSearch: true})
                         .then(r => r || caches.match("./"))));
});
