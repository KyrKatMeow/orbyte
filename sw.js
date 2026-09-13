const CACHE='orbyte-mobile-r418-stable-base-merged';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(req.mode==='navigate'||url.pathname.endsWith('.html')||url.pathname==='/'||url.pathname==='/mobile'||url.pathname==='/mobile.html'){
    event.respondWith((async()=>{
      try{return await fetch(req,{cache:'no-store'});}catch{
        return (await caches.match(req))||Response.error();
      }
    })());
  }
});
