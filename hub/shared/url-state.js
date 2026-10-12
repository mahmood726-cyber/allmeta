(function () {
  let _version = 1;
  let suspended = 0;
  const MAX_BYTES = 4096;

  function init(opts) {
    opts = opts || {};
    if (typeof opts.version === 'number') _version = opts.version;
  }

  init.read = function () {
    const h = (window.location.hash || '').replace(/^#/, '');
    if (!h) return null;
    var obj;
    try { obj = JSON.parse(decodeURIComponent(escape(atob(h)))); }
    catch (_) { return null; }
    if (!obj || typeof obj !== 'object') return null;
    if (obj.v !== _version) return null;  // version-mismatch: fail-open with null
    var rest = {};
    for (var k in obj) {
      if (k !== 'v') rest[k] = obj[k];
    }
    return rest;
  };

  init.write = function (state) {
    if (suspended) return false;
    var wrapped = Object.assign({ v: _version }, state);
    var blob = btoa(unescape(encodeURIComponent(JSON.stringify(wrapped))));
    if (blob.length > MAX_BYTES) {
      console.warn('[alm.urlState] state too long for URL (' + blob.length + ' B > ' + MAX_BYTES + ' B); use Save Project file instead');
      return false;
    }
    window.location.hash = blob;
    return true;
  };

  init.clear = function () { if (!suspended) window.location.hash = ''; };

  // Includes restoration in the callback; nesting and failures always release the guard.
  init.withoutWrites = async function (fn) {
    suspended++;
    try { return await fn(); } finally { suspended--; }
  };

  window.alm = window.alm || {};
  window.alm.urlState = init;
})();
