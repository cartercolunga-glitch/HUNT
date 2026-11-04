self.addEventListener('install',e=>e.waitUntil(caches.open('hunt-v6').then(c=>c.addAll(['./','./index.html','./manifest.webmanifest','./hunt-forest-bg.jpg','./hunt-app-icon.png']))));
self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));

