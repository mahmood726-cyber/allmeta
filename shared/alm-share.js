/* Share analysis v2: explicit creation of #a2= links containing raw-DEFLATE
 * UTF-8 JSON and the first eight hex digits of SHA-256(JSON). The offline pako
 * bundle supports browsers without compression streams. No state is uploaded.
 * Links and JSON files validate before applying; differing builds require consent.
 * Adapters must validate before mutation and restore every option, then re-run.
 * Legacy encode/decode/makeLink and the original Copy action retain #s= support.
 * Capture the navigation hash early because an app's first run may rewrite it.
 */
(function (global) {
  'use strict';

  var MAX_LINK = 32768;
  var PREFIX = '#s=';
  function shareHash(hash) { return /^#(?:s|a2)=/.test(hash); }
  var initialHash = '';
  try { initialHash = (global.location && global.location.hash) || ''; } catch (e) { initialHash = ''; }
  if (!shareHash(initialHash) && global.performance && typeof global.performance.getEntriesByType === 'function') {
    try {
      var nav = global.performance.getEntriesByType('navigation')[0];
      var navHash = nav && nav.name ? new URL(nav.name).hash : '';
      if (shareHash(navHash)) initialHash = navHash;
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


  // v2 wire format: #a2=<SHA-256(JSON)[0:8]>.<base64url(raw-DEFLATE(UTF-8(JSON)))>.
  // Legacy encode/decode/makeLink above deliberately retain their public v1 contracts.
  var MAX_FRAGMENT = 8000, MAX_JSON = 4 * 1024 * 1024;
  function object(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function buildInfo() {
    var b = global.AlmBuildInfo;
    if (!b && typeof module !== 'undefined' && module.exports) b = require('./build-info.js');
    if (!b || typeof b.version !== 'string' || typeof b.sha !== 'string') throw new Error('build identity is unavailable');
    return { version: b.version, sha: b.sha };
  }
  function validatePayload(p, app) {
    if (!object(p) || typeof p.app !== 'string' || !/^[a-z0-9][a-z0-9-]{0,60}$/.test(p.app) || p.v !== 2) throw new Error('unsupported analysis file or share-link version');
    if (p.app !== app) throw new Error('the link is for app "' + String(p.app) + '", not "' + app + '"');
    if (!object(p.state)) throw new Error('the link has no analysis state');
    if (!object(p.build) || typeof p.build.version !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9.+_-]{0,99}$/.test(p.build.version) ||
        typeof p.build.sha !== 'string' || !/^[0-9a-f]{7,64}$/i.test(p.build.sha)) throw new Error('invalid build identity');
    if (!Array.isArray(p.provenance)) throw new Error('link provenance is malformed');
    provenanceArray(p.provenance);
    return p;
  }
  function payload(app, state, provenance, build) {
    return validatePayload(JSON.parse(JSON.stringify({
      app: app, v: 2, build: build || buildInfo(), state: state, provenance: provenanceArray(provenance)
    })), app);
  }
  function bytesToB64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return global.btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function checksum(bytes) {
    if (!global.crypto || !global.crypto.subtle) throw new Error('SHA-256 is unavailable; use a secure browser context');
    var digest = new Uint8Array(await global.crypto.subtle.digest('SHA-256', bytes));
    return Array.from(digest.slice(0, 4), function (n) { return n.toString(16).padStart(2, '0'); }).join('');
  }
  function fallback() {
    var c = global.AlmShareDeflate;
    if (!c && typeof module !== 'undefined' && module.exports) c = require('./vendor/share-deflate.js');
    if (!c) throw new Error('the offline compression library is unavailable');
    return c;
  }
  async function readBounded(stream) {
    var reader = stream.getReader(), chunks = [], total = 0;
    try {
      for (;;) {
        var r = await reader.read();
        if (r.done) break;
        total += r.value.length;
        if (total > MAX_JSON) throw new Error('analysis exceeds the decoded size limit');
        chunks.push(r.value);
      }
    } catch (e) { await reader.cancel().catch(function () {}); throw e; }
    var out = new Uint8Array(total), offset = 0;
    chunks.forEach(function (c) { out.set(c, offset); offset += c.length; });
    return out;
  }
  async function deflate(bytes, forceFallback) {
    var cs;
    if (!forceFallback && typeof global.CompressionStream === 'function') {
      try { cs = new global.CompressionStream('deflate-raw'); } catch (e) { /* older stream implementations */ }
    }
    if (cs) return readBounded(new global.Blob([bytes]).stream().pipeThrough(cs));
    return fallback().deflateRaw(bytes);
  }
  async function inflate(bytes, forceFallback) {
    var ds;
    if (!forceFallback && typeof global.DecompressionStream === 'function') {
      try { ds = new global.DecompressionStream('deflate-raw'); } catch (e) { /* use bundled pako */ }
    }
    if (ds) return readBounded(new global.Blob([bytes]).stream().pipeThrough(ds));
    var inflator = new (fallback().Inflate)({ raw: true }), chunks = [], total = 0;
    inflator.onData = function (chunk) {
      total += chunk.length;
      if (total > MAX_JSON) throw new Error('analysis exceeds the decoded size limit');
      chunks.push(chunk);
    };
    // Without a forced finish, ended is true only after the DEFLATE end marker.
    inflator.push(bytes, false);
    if (inflator.err || !inflator.ended || inflator.strm.avail_in) throw new Error('corrupt or truncated compressed analysis');
    var out = new Uint8Array(total), offset = 0;
    chunks.forEach(function (c) { out.set(c, offset); offset += c.length; });
    return out;
  }
  async function encodeV2(p, options) {
    validatePayload(p, p.app);
    var bytes = new TextEncoder().encode(JSON.stringify(p));
    if (bytes.length > MAX_JSON) throw new Error('analysis exceeds the decoded size limit');
    return (await checksum(bytes)) + '.' + bytesToB64(await deflate(bytes, options && options.fallback));
  }
  function makeLinkV2(base, packed) {
    var fragment = '#a2=' + packed;
    if (fragment.length > MAX_FRAGMENT) {
      var e = new Error('This analysis is too large for a share link. Download an analysis file instead.');
      e.code = 'TOO_LARGE'; e.length = fragment.length; throw e;
    }
    return String(base).split('#')[0] + fragment;
  }
  async function decodeV2(packed, app, options) {
    if (typeof packed !== 'string' || !/^[0-9a-f]{8}\.[A-Za-z0-9_-]+$/.test(packed)) throw new Error('invalid share link or checksum');
    if (packed.length + 4 > MAX_FRAGMENT) throw new Error('share link exceeds 8,000 characters');
    var expected = packed.slice(0, 8), encoded = packed.slice(9), bytes = b64urlToBytes(encoded);
    if (bytesToB64(bytes) !== encoded) throw new Error('invalid base64url encoding');
    var raw;
    try { raw = await inflate(bytes, options && options.fallback); }
    catch (e) { throw new Error('corrupt or truncated share link: ' + e.message); }
    if (await checksum(raw) !== expected) throw new Error('share link checksum mismatch (corrupt or truncated link)');
    return validatePayload(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)), app);
  }
  function parseFile(text, app) {
    if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_JSON) throw new Error('analysis file is too large');
    return validatePayload(JSON.parse(text), app);
  }
  function versionMismatch(p, current) {
    current = current || buildInfo();
    return p.build.version !== current.version || p.build.sha !== current.sha;
  }
  function versionNotice(p, current) {
    current = current || buildInfo();
    return 'This link was made with allmeta ' + p.build.version + ' (' + p.build.sha.slice(0, 7) +
      '); you are using ' + current.version + ' (' + current.sha.slice(0, 7) + '). Results may differ.';
  }
  function archiveURL(p) {
    return 'https://github.com/mahmood726-cyber/allmeta/' +
      (/^v?\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?$/.test(p.build.version) ?
        'releases/tag/' + encodeURIComponent(p.build.version) : 'tree/' + encodeURIComponent(p.build.sha));
  }
  async function restore(p, app, block, options) {
    options = options || {};
    if (p.v === 2) {
      validatePayload(p, app);
      if (versionMismatch(p) && !options.allowMismatch) return { pending: true, payload: p };
    } else if (p.v !== 1 || p.app !== app || !object(p.state)) throw new Error('invalid legacy analysis');
    provenanceArray(p.provenance);
    // Adapter contract: validate all fields before mutation; set may return a promise.
    var previous = JSON.parse(JSON.stringify(block.get()));
    var st = featureState(), oldProvenance = st.provenance;
    var apply = async function () {
      try {
        await block.set(p.state);
        st.provenance = p.provenance || [];
      } catch (e) {
        st.provenance = oldProvenance;
        if (JSON.stringify(block.get()) !== JSON.stringify(previous)) await block.set(previous);
        throw e;
      }
    };
    var us = global.alm && global.alm.urlState;
    // Await the callback even when an older withoutWrites wrapper drops its return value.
    var work;
    if (us && typeof us.withoutWrites === 'function') {
      await us.withoutWrites(function () { work = apply(); return work; }); await work;
    } else await apply();
    return { pending: false };
  }
  async function openHash(hash, app, block, options) {
    var p;
    if (hash.indexOf('#a2=') === 0) p = await decodeV2(hash.slice(4), app);
    else if (hash.indexOf('#s=') === 0) {
      var legacy = await decode(hash.slice(3), app);
      if (!legacy.ok) throw new Error(legacy.reason);
      p = { app: app, v: 1, state: legacy.state, provenance: legacy.provenance };
    } else throw new Error('unrecognized share link');
    return restore(p, app, block, options);
  }
  function filename(p, date) { return p.app + '-analysis-' + (date || new Date()).toISOString().slice(0, 10).replace(/-/g, '') + '.json'; }
  function reproduction(p, link, file) {
    return link ? 'Analysis reproducible at ' + link + ' (allmeta ' + p.app + ' ' + p.build.version +
      ', commit ' + p.build.sha.slice(0, 7) + '; open in a browser, no installation needed).' :
      'Analysis reproducible from the attached file ' + file + ' (open it in allmeta ' + p.app + ' ' +
      p.build.version + ', commit ' + p.build.sha.slice(0, 7) + ').';
  }
  async function copyText(text) {
    try {
      if (global.navigator && global.navigator.clipboard) { await global.navigator.clipboard.writeText(text); return true; }
    } catch (e) { /* clipboard denied: use a selectable textarea */ }
    var focused = document.activeElement, area = document.createElement('textarea');
    area.value = text; area.setAttribute('aria-label', 'Text to copy'); area.style.position = 'fixed'; area.style.left = '-10000px';
    document.body.appendChild(area); area.select();
    var copied = false;
    try { copied = document.execCommand('copy'); } catch (e) { /* user can copy the visible output */ }
    area.remove(); if (focused && focused.focus) focused.focus();
    return copied;
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
    var app = ctx.app, block = ctx.block, pending = null, download = null, busy = false;
    var button = el('button', { type: 'button', class: 'alm-f-btn alm-f-primary', 'aria-describedby': 'alm-f-share-privacy' }, 'Share this analysis', panel);
    el('p', { id: 'alm-f-share-privacy', class: 'alm-f-note' },
      'Anyone with this link can see the data it contains. Nothing is uploaded: the data is inside the link itself.', panel);
    var row = el('div', { class: 'alm-f-share-row' }, null, panel);
    el('label', { for: 'alm-f-share-link' }, 'Share link', row);
    var input = el('input', { id: 'alm-f-share-link', type: 'url', readonly: '', autocomplete: 'off', spellcheck: 'false' }, null, row);
    var copy = el('button', { type: 'button', class: 'alm-f-btn' }, 'Copy share link', panel);
    var fileButton = el('button', { type: 'button', class: 'alm-f-btn', hidden: '' }, 'Download analysis file (.json)', panel);
    var fileRow = el('div', { class: 'alm-f-share-row' }, null, panel);
    el('label', { for: 'alm-f-share-file' }, 'Open analysis file', fileRow);
    var file = el('input', { id: 'alm-f-share-file', type: 'file', accept: '.json,application/json' }, null, fileRow);
    var citationRow = el('div', { class: 'alm-f-share-row' }, null, panel);
    el('label', { for: 'alm-f-share-reproduce' }, 'Reproduce this analysis', citationRow);
    var citation = el('input', { id: 'alm-f-share-reproduce', type: 'text', readonly: '' }, null, citationRow);
    var copyCitation = el('button', { type: 'button', class: 'alm-f-btn', disabled: '' }, 'Copy reproduction text', panel);
    var status = el('p', { role: 'status', 'aria-live': 'polite', class: 'alm-f-note', 'data-testid': 'share-status' }, null, panel);
    var warning = el('div', { hidden: '', 'data-testid': 'share-version' }, null, panel);
    var notice = el('p', { role: 'status', 'aria-live': 'polite' }, '', warning);
    var anyway = el('button', { type: 'button', class: 'alm-f-btn' }, 'Restore anyway', warning);
    var archive = el('a', { target: '_blank', rel: 'noopener noreferrer' }, 'Open the archived version', warning);

    function clearPending() { pending = null; warning.hidden = true; }
    function fail(e, source) {
      clearPending();
      status.textContent = 'This ' + source + ' could not be opened (' + (e.message || String(e)) + '). Nothing was changed.';
      ctx.host.open('share');
    }
    async function accept(p, source, hash, allowMismatch) {
      var result = await restore(p, app, block, { allowMismatch: !!allowMismatch });
      ctx.host.open('share');
      if (result.pending) {
        // Keep the incoming link usable on reload while awaiting consent.
        if (hash) {
          try { global.history.replaceState(global.history.state, '', global.location.href.split('#')[0] + hash); } catch (e) { /* URL bar only */ }
        }
        pending = { payload: p, source: source, hash: hash };
        notice.textContent = versionNotice(p); archive.href = archiveURL(p); warning.hidden = false;
        status.textContent = 'Restore paused: confirm the version difference before applying this analysis.';
        return;
      }
      clearPending();
      if (hash) {
        try { global.history.replaceState(global.history.state, '', global.location.href.split('#')[0] + hash); } catch (e) { /* URL bar only */ }
      }
      status.textContent = 'Analysis restored from the ' + source + '.';
    }
    async function locked(work) {
      if (busy) return;
      busy = true; button.disabled = copy.disabled = file.disabled = anyway.disabled = true;
      try { await work(); }
      finally { busy = false; button.disabled = copy.disabled = file.disabled = anyway.disabled = false; }
    }
    button.addEventListener('click', function () { locked(async function () {
      clearPending(); input.value = ''; citation.value = ''; copyCitation.disabled = true; fileButton.hidden = true; download = null;
      try {
        var p = payload(app, block.get(), featureState().provenance), packed = await encodeV2(p);
        try {
          input.value = makeLinkV2(global.location.href, packed);
          citation.value = reproduction(p, input.value);
          status.textContent = 'Share link ready below (' + ('#a2=' + packed).length + ' fragment characters).';
        } catch (e) {
          if (e.code !== 'TOO_LARGE') throw e;
          download = { text: JSON.stringify(p, null, 2), name: filename(p) };
          fileButton.hidden = false;
          citation.value = reproduction(p, null, download.name);
          status.textContent = 'This analysis exceeds the 8,000-character link limit. Download the analysis file below.';
        }
        copyCitation.disabled = false;
      } catch (e) { status.textContent = 'Could not create a share link: ' + e.message; }
    }); });
    copy.addEventListener('click', function () { locked(async function () {
      try {
        // Preserve the original explicit "Copy share link" action for v1 integrations.
        // Once v2 generation has run, this button copies its v2 output unchanged.
        if (!input.value && !download) {
          var p = payload(app, block.get(), featureState().provenance);
          var packed = await encode(app, p.state, p.provenance);
          if (packed.length + 3 > MAX_FRAGMENT) {
            download = { text: JSON.stringify(p, null, 2), name: filename(p) };
            fileButton.hidden = false; citation.value = reproduction(p, null, download.name); copyCitation.disabled = false;
            status.textContent = 'This analysis exceeds the 8,000-character link limit. Download the analysis file below.';
            return;
          }
          input.value = makeLink(global.location.href, packed);
          citation.value = reproduction(p, input.value); copyCitation.disabled = false;
        }
        if (!input.value) { status.textContent = 'Download the analysis file below.'; return; }
        status.textContent = await copyText(input.value) ? 'Share link copied to the clipboard.' : 'Share link ready below; copy it from the box.';
      } catch (e) { input.value = ''; status.textContent = e.message; }
    }); });
    copyCitation.addEventListener('click', async function () {
      status.textContent = await copyText(citation.value) ? 'Reproduction text copied to the clipboard.' : 'Copy the reproduction text from the box.';
    });
    fileButton.addEventListener('click', function () {
      if (!download) return;
      var url = URL.createObjectURL(new Blob([download.text], { type: 'application/json;charset=utf-8' }));
      var a = el('a', { href: url, download: download.name }, '', panel);
      a.click(); a.remove(); global.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
    file.addEventListener('change', function () {
      var chosen = file.files && file.files[0];
      if (!chosen) return;
      locked(async function () {
        clearPending();
        try {
          if (chosen.size > MAX_JSON) throw new Error('analysis file is too large');
          await accept(parseFile(await chosen.text(), app), 'analysis file');
        } catch (e) { fail(e, 'analysis file'); }
        finally { file.value = ''; }
      });
    });
    anyway.addEventListener('click', function () {
      if (!pending) return;
      var next = pending;
      locked(async function () {
        try { await accept(next.payload, next.source, next.hash, true); }
        catch (e) { fail(e, next.source); }
      });
    });
    if (!restoreAttempted && shareHash(initialHash)) {
      restoreAttempted = true;
      locked(async function () {
        try {
          var p;
          if (initialHash.indexOf('#a2=') === 0) p = await decodeV2(initialHash.slice(4), app);
          else {
            var legacy = await decode(initialHash.slice(3), app);
            if (!legacy.ok) throw new Error(legacy.reason);
            p = { v: 1, app: app, state: legacy.state, provenance: legacy.provenance };
          }
          await accept(p, 'share link', initialHash);
        } catch (e) { fail(e, 'share link'); }
      });
    }
  }

  var mod = { label: 'Share', render: render };
  var api = { encode: encode, decode: decode, makeLink: makeLink, MAX_LINK: MAX_LINK, module: mod };
  Object.assign(api, { payload: payload, encodeV2: encodeV2, decodeV2: decodeV2, makeLinkV2: makeLinkV2,
    parseFile: parseFile, validatePayload: validatePayload, versionMismatch: versionMismatch, versionNotice: versionNotice,
    archiveURL: archiveURL, restore: restore, openHash: openHash, filename: filename, reproduction: reproduction,
    MAX_FRAGMENT: MAX_FRAGMENT, MAX_JSON: MAX_JSON });
  global.AlmShare = api;
  if (global.AlmFeatures && typeof global.AlmFeatures.registerModule === 'function') global.AlmFeatures.registerModule('share', mod);
  else (global.AlmFeaturesPending = global.AlmFeaturesPending || []).push(['share', mod]);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
