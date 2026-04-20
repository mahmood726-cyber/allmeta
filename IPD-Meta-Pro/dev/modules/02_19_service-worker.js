const ServiceWorkerManager = {

 registered: false,


 register: async function() {

 if (!this.registered) {

 this.registered = true;

 console.log('[SW] Local runtime dependencies already bundled; network bootstrap skipped');

 }

 },


 // Compatibility shim retained for older call sites; the release build is local-only.

 loadWithFallback: async function(url) {
 return null;

 },



 cacheData: function(key, data) {

 try {

 const cacheEntry = {

 data: data,

 timestamp: Date.now()

 };

 localStorage.setItem('ipd_cache_' + key, JSON.stringify(cacheEntry));

 } catch (e) {

 console.warn('Cache storage failed:', e);

 }

 },



 getCachedData: function(key, maxAge = 86400000) {

 try {

 const cached = localStorage.getItem('ipd_cache_' + key);

 if (cached) {

 const entry = JSON.parse(cached);

 if (Date.now() - entry.timestamp < maxAge) {

 return entry.data;

 }

 }

 } catch (e) { /* Cache miss — non-critical */ }

 return null;

 },



 clearCache: function() {

 const keys = Object.keys(localStorage).filter(k => k.startsWith('ipd_cache_'));

 keys.forEach(k => localStorage.removeItem(k));

 }

 };



 if (document.readyState === 'loading') {

 document.addEventListener('DOMContentLoaded', () => ServiceWorkerManager.register());

 } else {

 ServiceWorkerManager.register();

 }



 window.ServiceWorkerManager = ServiceWorkerManager;



 
