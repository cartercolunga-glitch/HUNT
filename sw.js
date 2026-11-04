self.addEventListener('install',e=>e.waitUntil(caches.open('hunt-v7').then(c=>c.addAll(['./','./index.html','./manifest.webmanifest','./hunt-forest-bg.jpg','./hunt-app-icon.png']))));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));
self.addEventListener('push',e=>{let data={title:'HUNT',body:'Game update'};try{data={...data,...e.data?.json()}}catch(_){if(e.data)data.body=e.data.text()}e.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:'./hunt-app-icon.png',badge:'./hunt-app-icon.png',tag:data.tag||'hunt-update',data:{url:data.url||'./'}}))});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{const open=list.find(c=>c.url.includes(location.origin));return open?open.focus():clients.openWindow(e.notification.data?.url||'./')}))});

