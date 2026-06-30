const CACHE_NAME='duka-la-dawa-v1';
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

// Network-first for everything (so sales data is always fresh when online),
// fallback to cache only for the app shell when offline.
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  // Don't cache Supabase API calls
  if(e.request.url.includes('supabase.co')){
    return;
  }
  e.respondWith(
    fetch(e.request).then(res=>{
      const resClone=res.clone();
      caches.open(CACHE_NAME).then(cache=>cache.put(e.request,resClone));
      return res;
    }).catch(()=>caches.match(e.request))
  );
});
