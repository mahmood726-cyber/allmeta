/* shared/alm-share.js — "Share" tab (F5): whole-state share link.
 *
 * Spec block: share: { get() -> state (data text + every option), set(state) -> restore AND re-run the app;
 * set() must validate before changing anything and throw on invalid input }.
 * Link = <page URL without hash> + '#s=' + base64url(gzip(JSON {app, v:1, state, provenance})) built with
 * shared/url-pack.js. provenance = window.AlmFeaturesState.provenance (F1 per-study records), so the
 * provenance never detaches from the numbers. Links longer than 32,768 characters are refused.
 *
 * On load, a '#s=' hash for THIS app is decoded and applied through spec.share.set() inside
 * alm.urlState.withoutWrites (when available); the '#s=' hash is then put back with history.replaceState.
 * Invalid or mismatched links show a message and change nothing. Only hashes starting with 's=' are
 * handled, so the existing url-state '#<base64>' hashes are untouched.
 *
 * Load order: an app's url-state may rewrite location.hash during its first run, before end-of-body
 * scripts execute, so this file records the hash at load time. Load it in <head> (or as early as
 * possible); as a fallback the navigation entry's URL is consulted.
 */
(function (global) {
  'use strict';

  var MAX_LINK = 32768;
  var PREFIX = '#s=';
  var initialHash = '';
  try { initialHash = (global.location && global.location.hash) || ''; } catch (e) { initialHash = ''; }
  if (initialHash.indexOf(PREFIX) !== 0 && global.performance && typeof global.performance.getEntriesByType === 'function') {
    try {
      var nav = global.performance.getEntriesByType('navigation')[0];
      var navHash = nav && nav.name ? new URL(nav.name).hash : '';
      if (navHash.indexOf(PREFIX) === 0) initialHash = navHash;
    } catch (e) { /* no navigation entry: nothing to restore */ }
  }

  function b64urlToBytes(s) {
    if (typeof s !== 'string' || !/^[A-Za-z0-9_-]+$/.test(s)) throw new Error('link contains invalid characters');
    var b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    if (b64.length % 4 === 1) throw new Error('link has an invalid length');
    while (b64.length % 4) b64 += '=';
    var bin = global.atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // Same wire format as AlmUrlPack.unpack, but every failure surfaces through ONE awaited promise
  // (pipeThrough), so a corrupted link can never leave an unhandled rejection behind.
  async function gunzip(bytes) {
    if (bytes.length < 18 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error('link is not a compressed allmeta state');
    if (typeof global.DecompressionStream !== 'function') throw new Error('this browser cannot decompress share links');
    var stream = new global.Blob([bytes]).stream().pipeThrough(new global.DecompressionStream('gzip'));
    return new Uint8Array(await new global.Response(stream).arrayBuffer());
  }

  function provenanceArray(p) {
    if (p === undefined) return [];
    if (!Array.isArray(p) || p.some(function (r) { return !r || typeof r !== 'object' || Array.isArray(r); })) throw new Error('link provenance is malformed');
    return p;
  }

  async function encode(app, state, provenance) {
    if (!global.AlmUrlPack) throw new Error('shared/url-pack.js is not loaded');
    var payload = { app: app, v: 1, state: state };
    var prov = provenanceArray(provenance);
    if (prov.length) payload.provenance = prov;
    return global.AlmUrlPack.pack(payload, { maxLen: 1e9 });
  }

  function makeLink(base, packed) {
    var link = String(base).split('#')[0] + PREFIX + packed;
    if (link.length > MAX_LINK) {
      var err = new Error('This analysis is too large for a share link (' + link.length.toLocaleString('en-US') + ' characters; the limit is ' + MAX_LINK.toLocaleString('en-US') + '). Use Save project instead.');
      err.code = 'TOO_LARGE'; err.length = link.length;
      throw err;
    }
    return link;
  }

  // -> {ok:true, state, provenance} | {ok:false, reason}
  async function decode(packed, app) {
    try {
      var json = new TextDecoder('utf-8', { fatal: true }).decode(await gunzip(b64urlToBytes(packed)));
      var obj = JSON.parse(json);
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, reason: 'the link does not contain an allmeta state' };
      if (obj.v !== 1) return { ok: false, reason: 'unsupported share-link version ' + String(obj.v) };
      if (obj.app !== app) return { ok: false, reason: 'the link is for app "' + String(obj.app) + '", not "' + app + '"' };
      if (!obj.state || typeof obj.state !== 'object' || Array.isArray(obj.state)) return { ok: false, reason: 'the link has no analysis state' };
      return { ok: true, state: obj.state, provenance: provenanceArray(obj.provenance) };
    } catch (e) {
      return { ok: false, reason: e && e.message ? e.message : String(e) };
    }
  }

  function el(tag, attrs, text, parent) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text !== undefined && text !== null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  function featureState() {
    var st = global.AlmFeaturesState = global.AlmFeaturesState || {};
    if (!Array.isArray(st.provenance)) st.provenance = [];
    return st;
  }

  var restoreAttempted = false;

  function render(panel, ctx) {
    var app = ctx.app, block = ctx.block;
    el('p', { class: 'alm-f-note' }, 'Copy a link that reopens this analysis with the same data, options and data-entry provenance. Everything is inside the link itself; nothing is uploaded.', panel);
    var button = el('button', { type: 'button', class: 'alm-f-btn alm-f-primary' }, 'Copy share link', panel);
    var row = el('div', { class: 'alm-f-share-row' }, null, panel);
    el('label', { for: 'alm-f-share-link' }, 'Share link', row);
    var input = el('input', { id: 'alm-f-share-link', type: 'url', readonly: '', autocomplete: 'off', spellcheck: 'false' }, null, row);
    var status = el('p', { role: 'status', 'aria-live': 'polite', class: 'alm-f-note', 'data-testid': 'share-status' }, null, panel);

    button.addEventListener('click', async function () {
      try {
        var packed = await encode(app, block.get(), featureState().provenance);
        var link = makeLink(global.location.href, packed);
        input.value = link;
        var copied = false;
        try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(link); copied = true; } } catch (e) { copied = false; }
        status.textContent = copied ? 'Share link copied to the clipboard (' + link.length + ' characters).' : 'Share link ready below (' + link.length + ' characters); copy it from the box.';
      } catch (e) {
        input.value = '';
        status.textContent = e && e.message ? e.message : String(e);
      }
    });

    if (!restoreAttempted && initialHash.indexOf(PREFIX) === 0) {
      restoreAttempted = true;
      var packed = initialHash.slice(PREFIX.length);
      decode(packed, app).then(async function (res) {
        if (!res.ok) throw new Error(res.reason);
        var apply = function () { block.set(res.state); };
        var us = global.alm && global.alm.urlState;
        if (us && typeof us.withoutWrites === 'function') await us.withoutWrites(apply); else apply();
        featureState().provenance = res.provenance;
        try { global.history.replaceState(global.history.state, '', global.location.href.split('#')[0] + PREFIX + packed); } catch (e) { /* URL bar only */ }
        status.textContent = 'Analysis restored from the share link.';
        ctx.host.open('share');
      }).catch(function (e) {
        status.textContent = 'This share link could not be opened (' + (e && e.message ? e.message : String(e)) + '). Nothing was changed.';
        ctx.host.open('share');
      });
    }
  }

  var mod = { label: 'Share', render: render };
  var api = { encode: encode, decode: decode, makeLink: makeLink, MAX_LINK: MAX_LINK, module: mod };
  global.AlmShare = api;
  if (global.AlmFeatures && typeof global.AlmFeatures.registerModule === 'function') global.AlmFeatures.registerModule('share', mod);
  else (global.AlmFeaturesPending = global.AlmFeaturesPending || []).push(['share', mod]);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
