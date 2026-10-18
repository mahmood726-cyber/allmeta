(function(){'use strict';
 const CACHE='screen-optional-model-751bff3';
 async function cacheModel(progress){const base=new URL('vendor/semantic/',location.href),r=await fetch(new URL('manifest.json',base));if(!r.ok)throw Error('Model manifest unavailable.');const manifest=await r.json(),cache=await caches.open(CACHE);let done=0;
  for(const file of manifest.files){const url=new URL(file.path,base);if(url.origin!==location.origin||!url.href.startsWith(base.href))throw Error('Invalid model asset path.');const cached=await cache.match(url);const response=cached||await fetch(url);if(!response.ok)throw Error('Model download failed: '+file.path);const bytes=await response.clone().arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');if(bytes.byteLength!==file.bytes||hash!==file.sha256){await cache.delete(url);throw Error('Model checksum mismatch: '+file.path+'. Reconnect and retry to repair the cache.');}if(!cached)await cache.put(url,response);if(progress)progress(++done,manifest.files.length);}
  await cache.put(new URL('manifest.json',base),new Response(JSON.stringify(manifest),{headers:{'Content-Type':'application/json'}}));return manifest;
 }
 async function register(){if(!('serviceWorker'in navigator)||!isSecureContext)throw Error('Offline caching needs HTTPS or localhost.');await navigator.serviceWorker.register('sw.js',{scope:'./'});await navigator.serviceWorker.ready;return true;}
 window.ScreenOffline={register,cacheModel};
})();
