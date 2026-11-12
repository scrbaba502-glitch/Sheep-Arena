const C="beastryx-v2";
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(clients.claim()));
self.addEventListener("fetch",e=>{const r=e.request;if(r.method!="GET"||new URL(r.url).origin!=location.origin)return;
e.respondWith(fetch(r).then(x=>{const c=x.clone();if(x.ok)caches.open(C).then(k=>k.put(r,c));return x}).catch(()=>caches.match(r).then(x=>x||caches.match("index.html"))))});
