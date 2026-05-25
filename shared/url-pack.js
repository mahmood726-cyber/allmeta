/**
 * shared/url-pack.js — pack/unpack a JSON object into a URL-safe string
 * suitable for a location fragment (`#p=...`).
 *
 * Why this exists: we want "submit and immediately display" without a
 * backend. The trick is to encode the WHOLE protocol into the URL itself,
 * so anyone clicking the link renders the protocol read-only — pure
 * client-side, no account, no server.
 *
 * Encoding pipeline:
 *   1. JSON.stringify
 *   2. UTF-8 → Uint8Array
 *   3. gzip via CompressionStream (browser-native, no dependency) — falls
 *      back to identity if the API is missing (older browsers).
 *   4. base64url (RFC 4648 §5 — `-` and `_`, no padding)
 *
 * Typical sizes for a real systematic-review protocol:
 *   - JSON:      ~3-8 KB
 *   - gzipped:   ~1-3 KB
 *   - base64url: ~1.5-4 KB → comfortably under the 8 KB browser URL limits.
 *
 * If the packed payload exceeds `maxLen` (default 7 KB to leave room for
 * the rest of the URL), pack() throws so the caller can fall back to a
 * download-only export.
 *
 * Public API:
 *   AlmUrlPack.pack(obj, opts)    -> Promise<string>
 *   AlmUrlPack.unpack(str)        -> Promise<object>
 */
(function (global) {
  'use strict';

  function _toBase64Url(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    var b64 = global.btoa(bin);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function _fromBase64Url(s) {
    var b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
    var pad = b64.length % 4;
    if (pad === 2) b64 += '==';
    else if (pad === 3) b64 += '=';
    else if (pad === 1) throw new Error('invalid base64url length');
    var bin = global.atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  async function _readStream(stream) {
    var reader = stream.getReader();
    var chunks = [];
    var total = 0;
    while (true) {
      var r = await reader.read();
      if (r.done) break;
      chunks.push(r.value);
      total += r.value.length;
    }
    var out = new Uint8Array(total);
    var off = 0;
    for (var i = 0; i < chunks.length; i++) {
      out.set(chunks[i], off);
      off += chunks[i].length;
    }
    return out;
  }

  async function _gzipBytes(bytes) {
    if (typeof global.CompressionStream !== 'function') return bytes;
    var cs = new global.CompressionStream('gzip');
    var writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    return await _readStream(cs.readable);
  }

  async function _gunzipBytes(bytes) {
    if (typeof global.DecompressionStream !== 'function') return bytes;
    var ds = new global.DecompressionStream('gzip');
    var writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    return await _readStream(ds.readable);
  }

  function _utf8Encode(str) {
    if (typeof global.TextEncoder === 'function') {
      return new global.TextEncoder().encode(str);
    }
    // Fallback (very old browsers): naive
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
      else bytes.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
    }
    return new Uint8Array(bytes);
  }

  function _utf8Decode(bytes) {
    if (typeof global.TextDecoder === 'function') {
      return new global.TextDecoder('utf-8').decode(bytes);
    }
    var str = '';
    for (var i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return decodeURIComponent(escape(str));
  }

  /**
   * Pack a JSON-serialisable object into a URL-safe string.
   * opts.maxLen — max length of the returned string. Throws if exceeded.
   */
  async function pack(obj, opts) {
    opts = opts || {};
    var maxLen = Number.isFinite(opts.maxLen) ? opts.maxLen : 7000;
    var json = JSON.stringify(obj == null ? {} : obj);
    var raw = _utf8Encode(json);
    var packed = await _gzipBytes(raw);
    var s = _toBase64Url(packed);
    if (s.length > maxLen) {
      var err = new Error('packed length ' + s.length + ' exceeds maxLen ' + maxLen);
      err.code = 'TOO_LARGE';
      err.packedLength = s.length;
      err.maxLen = maxLen;
      throw err;
    }
    return s;
  }

  /**
   * Unpack a URL-safe string back into a JSON-deserialised object.
   * Throws on malformed input.
   */
  async function unpack(s) {
    if (typeof s !== 'string' || s.length === 0) throw new Error('empty input');
    var bytes = _fromBase64Url(s);
    var raw = await _gunzipBytes(bytes);
    var json = _utf8Decode(raw);
    return JSON.parse(json);
  }

  var api = { pack: pack, unpack: unpack };
  global.AlmUrlPack = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
