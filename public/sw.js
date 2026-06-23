// Service Worker — IE Line Balance
// App-shell caching supaya halaman tetap kebuka saat wifi pabrik putus.
// POST (input aktual) TIDAK pernah di-cache — ditangani offline-queue di client.
const CACHE = 'ie-lb-v1'
const SHELL = ['/', '/leader']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  if (request.method !== 'GET') return // jangan sentuh POST/PATCH/DELETE
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return // API selalu live; jangan cache (auth/stale)

  // Navigasi: network-first, fallback ke cache lalu '/'
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('/'))),
    )
    return
  }

  // Aset statis (_next, js/css/svg/font): cache-first
  if (url.pathname.startsWith('/_next/') || /\.(js|css|svg|png|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(request).then(
        (r) =>
          r ||
          fetch(request).then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {})
            return res
          }),
      ),
    )
  }
})
