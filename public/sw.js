// ============================================================================
// sw.js — Service worker de RhinoPlan (PWA).
// ----------------------------------------------------------------------------
// Objetivo: funcionar offline en consulta SIN servir versiones viejas tras un
// despliegue. La estrategia depende del tipo de recurso:
//
//   • index.html y navegaciones → NETWORK-FIRST: siempre se intenta la red para
//     detectar despliegues nuevos; si no hay red, cae al caché (offline).
//   • assets con hash (/assets/*.js, *.css) → STALE-WHILE-REVALIDATE: se sirven
//     del caché al instante (son inmutables, el hash cambia si cambia el
//     contenido) y se actualizan en segundo plano.
//   • orígenes externos (Supabase, Creem, CDN del modelo) → NO se tocan: van
//     directo a la red, así los datos de pacientes nunca quedan en caché.
//
// Subir CACHE_VERSION en cada cambio de este archivo fuerza limpieza del caché
// viejo en todos los dispositivos.
// ============================================================================

const CACHE_VERSION = 'rhinoplan-v3';
const PRECACHE = ['/', '/index.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(PRECACHE)));
  // Activa esta versión de inmediato, sin esperar a que se cierren pestañas.
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

// Permite que la app pida al SW que se actualice ya (ver index.html).
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

function isHashedAsset(url) {
  // Vite emite /assets/nombre-HASH.js|css — inmutables por el hash.
  return /\/assets\/.+\.(js|css)$/.test(url.pathname);
}

function isNavigation(request, url) {
  return request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname.endsWith('/index.html');
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Recursos de otro origen (Supabase, Creem, CDN de onnx/modelo): no interferir.
  if (url.origin !== self.location.origin) return;

  // 1) Navegación / index.html → network-first (detecta despliegues nuevos).
  if (isNavigation(e.request, url)) {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          if (r && r.ok) {
            const clone = r.clone();
            caches.open(CACHE_VERSION).then((c) => c.put('/index.html', clone));
          }
          return r;
        })
        .catch(() => caches.match(e.request).then((m) => m || caches.match('/index.html'))),
    );
    return;
  }

  // 2) Assets con hash → stale-while-revalidate (rápido y se refresca detrás).
  if (isHashedAsset(url)) {
    e.respondWith(
      caches.open(CACHE_VERSION).then((c) =>
        c.match(e.request).then((cached) => {
          const network = fetch(e.request).then((r) => {
            if (r && r.ok) c.put(e.request, r.clone());
            return r;
          }).catch(() => cached);
          return cached || network;
        }),
      ),
    );
    return;
  }

  // 3) Resto del mismo origen (íconos, manifest, etc.) → network-first simple.
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r && r.ok) {
          const clone = r.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(e.request, clone));
        }
        return r;
      })
      .catch(() => caches.match(e.request)),
  );
});
