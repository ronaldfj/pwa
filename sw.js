const CACHE='fenix-v6-26';
const SHELL=['./','./index.html','./firebase-init.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(
  ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch',e=>{
  if(e.request.mode==='navigate'||e.request.destination==='document'||e.request.url.endsWith('index.html')||e.request.url.endsWith('/')){
    e.respondWith(
      fetch(e.request).then(res=>{
        const copy=res.clone();
        caches.open(CACHE).then(c=>c.put(e.request,copy));
        return res;
      }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html')||caches.match('./')))
    );
    return;
  }
  // También cachea el SDK de Firebase (gstatic.com), no solo el shell local:
  // sin esto, la app se rompe offline apenas requiere el módulo de Firestore/Auth.
  e.respondWith(caches.match(e.request).then(r=>{
    if(r) return r;
    return fetch(e.request).then(res=>{
      if(res.ok){ const copy=res.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)); }
      return res;
    });
  }));
});