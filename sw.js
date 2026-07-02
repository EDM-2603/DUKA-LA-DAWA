const CACHE_NAME='edm-pos-v3';
const ASSETS=['./index.html','./app.js','./manifest.json','./icon-192.png','./icon-512.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  if(e.request.url.includes('supabase.co')||e.request.url.includes('jsdelivr')||e.request.url.includes('cloudflare'))return;
  e.respondWith(
    fetch(e.request).then(res=>{
      const clone=res.clone();
      caches.open(CACHE_NAME).then(cache=>cache.put(e.request,clone));
      return res;
    }).catch(()=>caches.match(e.request))
  );
});
