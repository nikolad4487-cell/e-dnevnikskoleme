const CACHE_NAME = 'ednevnik-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Intentionally swallow errors for missing files during dev
      return Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url)));
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests or skip if not matching standard http/https
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      
      return fetch(event.request).then((response) => {
        // Cache dynamic responses for offline support if it's JSON from API
        if (event.request.url.includes('/api/') && response.status === 200) {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, resClone);
          });
        }
        return response;
      }).catch(() => {
        // Offline fallback for html
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/');
        }
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
