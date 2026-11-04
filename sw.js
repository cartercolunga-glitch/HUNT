self.addEventListener('install',e=>e.waitUntil(caches.open('hunt-v5').then(c=>c.addAll(['./','./index.html','./manifest.webmanifest','./hunt-forest-bg.jpg']))));
self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));

