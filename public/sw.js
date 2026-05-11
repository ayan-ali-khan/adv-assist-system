const CACHE_NAME = 'saarthi-ai-v1'

// URLs that must never be intercepted by the SW
// (API calls, Firebase, external CDNs)
const PASSTHROUGH_ORIGINS = [
  'serverless.roboflow.com',
  'firebaseapp.com',
  'googleapis.com',
  'gstatic.com',
  'cdn.jsdelivr.net',
  'storage.googleapis.com',
]

function shouldPassthrough(url) {
  try {
    const { hostname, pathname } = new URL(url)
    // Pass through known external origins
    if (PASSTHROUGH_ORIGINS.some((o) => hostname.includes(o))) return true
    // Pass through POST requests (API calls)
    return false
  } catch {
    return false
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(['/']))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((n) => n !== CACHE_NAME && caches.delete(n)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Ignore non-http(s) schemes (chrome-extension, blob, data, etc.)
  if (!url.protocol.startsWith('http')) return

  // Never intercept non-GET or external API calls
  if (request.method !== 'GET' || shouldPassthrough(request.url)) {
    event.respondWith(fetch(request))
    return
  }

  // Network-first for HTML navigation
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone()  // clone BEFORE returning
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return res
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match('/'))
        )
    )
    return
  }

  // Cache-first for assets
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((res) => {
        if (res.ok && res.status < 400) {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return res
      })
    }).catch(() => caches.match('/'))
  )
})
