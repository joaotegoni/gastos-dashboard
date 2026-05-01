// Service Worker — cache offline + abertura instantânea.
// Bumpa CACHE_VERSION quando quiser forçar todos os clientes a re-fetchar tudo.
const CACHE_VERSION = 'gastos-v1';
const CSV_HOST = 'docs.google.com';

// Ativos do app que devem estar sempre disponíveis offline.
// Paths relativos pra funcionar tanto em user.github.io quanto user.github.io/repo.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  // Ativa o novo SW imediatamente, sem esperar abas antigas fecharem.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  // Limpa caches de versões antigas + assume controle imediatamente.
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // CSV do Google Sheets — network-first com fallback pra cache.
  // Se online, sempre traz dado fresco; se offline, mostra última versão cached.
  if (url.host.includes(CSV_HOST)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Mesma origem (HTML/CSS/JS) — cache-first com revalidação em background.
  // App abre instantâneo do cache, e o SW atualiza em segundo plano.
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Outras origens (CDN, fonts) — passa direto.
});

async function networkFirst(req) {
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (e) {
    const cached = await caches.match(req);
    if (cached) return cached;
    throw e;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then((fresh) => {
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  }).catch(() => cached);
  return cached || fetchPromise;
}
