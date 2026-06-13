const CACHE_NAME = 'ednevnik-cache-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Intentionally swallow errors for missing files during dev
      return Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url)));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (
    url.pathname.startsWith('/api/')
    || url.pathname === '/login'
    || url.pathname === '/manifest.json'
    || url.pathname === '/favicon.ico'
    || url.pathname.startsWith('/icon-')
    || event.request.method !== 'GET'
  ) {
    return;
  }

  // Bypass cache for document loads to avoid stale pages, fall back to cache only when offline
  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/index.html').then((res) => {
          return res || caches.match('/');
        });
      })
    );
    return;
  }

  // Network-First strategy
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache dynamic responses for offline support if it's JSON from API, or other assets
        if (response.status === 200) {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, resClone);
          });
        }
        return response;
      })
      .catch((err) => {
        // Fallback to cache if network fails
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          throw err; // Re-throw original network error to avoid TypeError in event.respondWith
        });
      })
  );
});

// Push notification event listener
self.addEventListener('push', (event) => {
  let data = { title: 'Nova Obavijest', body: 'Imate novu obavijest iz škole.' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch(e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: data.url || '/'
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data)
  );
});
