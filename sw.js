const CACHE='fenix-v6-31';
const SHELL=['./','./index.html','./firebase-init.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(
  ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch',e=>{
  // La Cache API solo admite peticiones GET (cache.put lanza en cualquier
  // otro método). Auth/Firestore hacen POST para sus canales de datos —
  // dejarlos pasar sin interceptar, en vez de intentar cachearlos.
  if(e.request.method!=='GET') return;
  // Solo se cachea lo propio de la app (shell, SDK de Firebase, fuentes).
  // Todo lo demás pasa directo a la red: las peticiones GET de Firestore
  // (canal de escucha) y Auth llevan datos del usuario y son de un solo
  // uso — cachearlas llenaba Cache Storage sin límite y dejaba datos de la
  // cuenta en el dispositivo aun tras cerrar sesión. /__/ son las rutas
  // reservadas de Firebase (handler de auth), que no deben interceptarse.
  const url=new URL(e.request.url);
  const propio=url.origin===self.location.origin && !url.pathname.startsWith('/__/');
  const cdn=(url.hostname==='www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))
    || url.hostname==='fonts.googleapis.com' || url.hostname==='fonts.gstatic.com';
  if(!propio && !cdn) return;
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