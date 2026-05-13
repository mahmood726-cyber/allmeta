(function () {
  let _version = 1;
  const MAX_BYTES = 4096;

  function init(opts) {
    opts = opts || {};
    if (typeof opts.version === 'number') _version = opts.version;
  }

  init.read = function () {
    const h = (window.location.hash || '').replace(/^#/, '');
    if (!h) return null;
    var obj;
    try { obj = JSON.parse(atob(h)); }
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
    var wrapped = Object.assign({ v: _version }, state);
    var blob = btoa(JSON.stringify(wrapped));
    if (blob.length > MAX_BYTES) {
      console.warn('[alm.urlState] state too long for URL (' + blob.length + ' B > ' + MAX_BYTES + ' B); use Save Project file instead');
      return false;
    }
    window.location.hash = blob;
    return true;
  };

  init.clear = function () { window.location.hash = ''; };

  window.alm = window.alm || {};
  window.alm.urlState = init;
})();
