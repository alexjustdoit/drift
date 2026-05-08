const CACHE_V = 'drift-v1'
const CACHE_URLS = [
  '/',
  '/log',
  '/capture',
  '/focus',
  '/breakdown',
  '/insights',
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_V).then(cache => cache.addAll(CACHE_URLS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_V).map(n => caches.delete(n)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // API requests: network-first, cache fallback
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (!res.ok) throw res
          const clone = res.clone()
          caches.open(CACHE_V).then(c => c.put(event.request, clone))
          return res
        })
        .catch(() => caches.match(event.request))
    )
    return
  }

  // App shell: cache-first
  if (CACHE_URLS.some(u => url.pathname === u || url.pathname.startsWith(u + '?'))) {
    event.respondWith(
      caches.match(event.request).then(res => res || fetch(event.request))
    )
    return
  }

  // Static assets: cache-first
  if (/\.(js|css|png|jpg|svg|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(res => res || fetch(event.request))
    )
    return
  }
})

self.addEventListener('push', event => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Drift', {
      body: data.body ?? '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      requireInteraction: true,
      data: { url: data.url ?? '/focus' },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/focus'
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        for (const c of list) {
          if ('focus' in c) return c.focus()
        }
        if (clients.openWindow) return clients.openWindow(url)
      })
  )
})
