// Simple service worker for PWA
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

  // Never intercept non-GET requests or external API calls
  if (request.method !== 'GET' || shouldPassthrough(request.url)) {
    event.respondWith(fetch(request))
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  )
})
