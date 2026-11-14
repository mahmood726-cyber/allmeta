/* shared/alm-zip.js — dependency-free binary writers shared by the feature panel.
 *
 *   AlmZip.crc32(bytes)                         -> unsigned 32-bit CRC (IEEE 802.3, as used by ZIP and PNG)
 *   AlmZip.zip([{name, bytes|string, date?}], {date?}) -> Uint8Array  store-only ZIP (no compression),
 *       UTF-8 names (general-purpose flag bit 11), local + central headers + EOCD. Deterministic:
 *       every entry carries the fixed DOS date 1980-01-01 00:00 unless a Date is passed.
 *   AlmZip.docx({title, paragraphs:[{heading?, text}]}) -> Uint8Array  minimal WordprocessingML package
 *       ([Content_Types].xml, _rels/.rels, word/document.xml); all text XML-escaped.
 *   AlmZip.tiff({width, height, rgba, dpi}) -> Uint8Array  baseline little-endian RGB 8-bit TIFF,
 *       uncompressed, single strip, XResolution/YResolution = dpi/1, ResolutionUnit = 2 (inch).
 *       Alpha is composited over white (R plots are drawn on an opaque white background).
 *   AlmZip.pngSetDpi(pngBytes, dpi) -> Uint8Array  same PNG with one pHYs chunk (pixels per metre).
 *
 * Browser: window.AlmZip. Node: module.exports (unit tests in hub/shared/tests/unit/alm-zip.test.mjs).
 */
(function (global) {
  'use strict';

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8(s) { return new TextEncoder().encode(String(s)); }

  function toBytes(f) {
    if (f.bytes instanceof Uint8Array) return f.bytes;
    if (f.bytes instanceof ArrayBuffer) return new Uint8Array(f.bytes);
    if (f.bytes && ArrayBuffer.isView(f.bytes)) return new Uint8Array(f.bytes.buffer, f.bytes.byteOffset, f.bytes.byteLength);
    if (typeof f.string === 'string') return utf8(f.string);
    if (typeof f.bytes === 'string') return utf8(f.bytes);
    throw new Error('zip entry has no bytes or string: ' + f.name);
  }

  // MS-DOS date/time. Default 1980-01-01 00:00:00 (the DOS epoch) keeps archives byte-reproducible.
  function dosDateTime(date) {
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return { date: (0 << 9) | (1 << 5) | 1, time: 0 };
    var y = Math.min(Math.max(date.getFullYear(), 1980), 2107);
    return {
      date: ((y - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    };
  }

  function zip(files, opts) {
    opts = opts || {};
    if (!Array.isArray(files)) throw new Error('zip(files): files must be an array');
    var entries = [], seen = new Set(), total = 0;
    files.forEach(function (f) {
      var name = String(f.name || '');
      if (!name || name.charAt(0) === '/' || name.indexOf('\\') >= 0 || /(^|\/)\.\.(\/|$)/.test(name)) throw new Error('Invalid zip entry name: ' + name);
      if (seen.has(name)) throw new Error('Duplicate zip entry name: ' + name);
      seen.add(name);
      var data = toBytes(f), nameBytes = utf8(name), dt = dosDateTime(f.date || opts.date);
      if (data.length > 0xFFFFFFFE) throw new Error('zip entry too large (ZIP64 not supported): ' + name);
      entries.push({ nameBytes: nameBytes, data: data, crc: crc32(data), dt: dt, offset: total });
      total += 30 + nameBytes.length + data.length;
    });
    var cdSize = entries.reduce(function (s, e) { return s + 46 + e.nameBytes.length; }, 0);
    var out = new Uint8Array(total + cdSize + 22), v = new DataView(out.buffer), p = 0;
    function u16(x) { v.setUint16(p, x, true); p += 2; }
    function u32(x) { v.setUint32(p, x >>> 0, true); p += 4; }
    entries.forEach(function (e) {
      u32(0x04034b50); u16(20); u16(0x0800); u16(0); u16(e.dt.time); u16(e.dt.date);
      u32(e.crc); u32(e.data.length); u32(e.data.length); u16(e.nameBytes.length); u16(0);
      out.set(e.nameBytes, p); p += e.nameBytes.length;
      out.set(e.data, p); p += e.data.length;
    });
    var cdOffset = p;
    entries.forEach(function (e) {
      u32(0x02014b50); u16(20); u16(20); u16(0x0800); u16(0); u16(e.dt.time); u16(e.dt.date);
      u32(e.crc); u32(e.data.length); u32(e.data.length); u16(e.nameBytes.length); u16(0); u16(0);
      u16(0); u16(0); u32(0); u32(e.offset);
      out.set(e.nameBytes, p); p += e.nameBytes.length;
    });
    u32(0x06054b50); u16(0); u16(0); u16(entries.length); u16(entries.length);
    u32(cdSize); u32(cdOffset); u16(0);
    return out;
  }

  // XML 1.0: escape markup and drop characters that are not allowed at all.
  function xmlEscape(s) {
    return String(s == null ? '' : s)
      .replace(/[^\x09\x0A\x0D\x20-퟿-�\uD800-􏰀-\uDFFF]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  var XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  var CONTENT_TYPES = XML_HEAD +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>';
  var RELS = XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';

  function runs(text, bold, sizeHalfPts) {
    var rPr = (bold || sizeHalfPts) ? '<w:rPr>' + (bold ? '<w:b/>' : '') + (sizeHalfPts ? '<w:sz w:val="' + sizeHalfPts + '"/>' : '') + '</w:rPr>' : '';
    return String(text == null ? '' : text).split(/\r?\n/).map(function (line, i) {
      return '<w:r>' + rPr + (i ? '<w:br/>' : '') + '<w:t xml:space="preserve">' + xmlEscape(line) + '</w:t></w:r>';
    }).join('');
  }

  function documentXml(spec) {
    var body = '';
    if (spec.title) body += '<w:p>' + runs(spec.title, true, 32) + '</w:p>';
    (spec.paragraphs || []).forEach(function (para) {
      if (para.heading) body += '<w:p>' + runs(para.heading, true, 26) + '</w:p>';
      body += '<w:p>' + runs(para.text, false, 0) + '</w:p>';
    });
    return XML_HEAD + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      body + '<w:sectPr/></w:body></w:document>';
  }

  function docx(spec) {
    spec = spec || {};
    return zip([
      { name: '[Content_Types].xml', string: CONTENT_TYPES },
      { name: '_rels/.rels', string: RELS },
      { name: 'word/document.xml', string: documentXml(spec) },
    ], { date: spec.date });
  }

  function tiff(spec) {
    spec = spec || {};
    var w = spec.width, h = spec.height, rgba = spec.rgba, dpi = spec.dpi === undefined ? 300 : spec.dpi;
    if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) throw new Error('tiff: width/height must be positive integers');
    if (!rgba || rgba.length !== w * h * 4) throw new Error('tiff: rgba must have width*height*4 bytes');
    if (!Number.isInteger(dpi) || dpi <= 0) throw new Error('tiff: dpi must be a positive integer');
    var N = 13, ifdOff = 8, ifdSize = 2 + N * 12 + 4;
    var bpsOff = ifdOff + ifdSize, xresOff = bpsOff + 6, yresOff = xresOff + 8, dataOff = yresOff + 8;
    var strip = w * h * 3;
    var out = new Uint8Array(dataOff + strip), v = new DataView(out.buffer);
    out[0] = 0x49; out[1] = 0x49; v.setUint16(2, 42, true); v.setUint32(4, ifdOff, true);
    v.setUint16(ifdOff, N, true);
    var p = ifdOff + 2;
    function entry(tag, type, count, value) {
      v.setUint16(p, tag, true); v.setUint16(p + 2, type, true); v.setUint32(p + 4, count, true);
      if (type === 3 && count === 1) v.setUint16(p + 8, value, true); else v.setUint32(p + 8, value, true);
      p += 12;
    }
    var SHORT = 3, LONG = 4, RATIONAL = 5;
    entry(256, LONG, 1, w);            // ImageWidth
    entry(257, LONG, 1, h);            // ImageLength
    entry(258, SHORT, 3, bpsOff);      // BitsPerSample 8,8,8
    entry(259, SHORT, 1, 1);           // Compression: none
    entry(262, SHORT, 1, 2);           // PhotometricInterpretation: RGB
    entry(273, LONG, 1, dataOff);      // StripOffsets
    entry(277, SHORT, 1, 3);           // SamplesPerPixel
    entry(278, LONG, 1, h);            // RowsPerStrip (single strip)
    entry(279, LONG, 1, strip);        // StripByteCounts
    entry(282, RATIONAL, 1, xresOff);  // XResolution
    entry(283, RATIONAL, 1, yresOff);  // YResolution
    entry(284, SHORT, 1, 1);           // PlanarConfiguration: chunky
    entry(296, SHORT, 1, 2);           // ResolutionUnit: inch
    v.setUint32(p, 0, true);           // no next IFD
    v.setUint16(bpsOff, 8, true); v.setUint16(bpsOff + 2, 8, true); v.setUint16(bpsOff + 4, 8, true);
    v.setUint32(xresOff, dpi, true); v.setUint32(xresOff + 4, 1, true);
    v.setUint32(yresOff, dpi, true); v.setUint32(yresOff + 4, 1, true);
    for (var i = 0, o = dataOff; i < w * h; i++) {
      var a = rgba[i * 4 + 3] / 255;
      out[o++] = Math.round(rgba[i * 4] * a + 255 * (1 - a));
      out[o++] = Math.round(rgba[i * 4 + 1] * a + 255 * (1 - a));
      out[o++] = Math.round(rgba[i * 4 + 2] * a + 255 * (1 - a));
    }
    return out;
  }

  var PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  function pngSetDpi(bytes, dpi) {
    bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (!Number.isFinite(dpi) || dpi <= 0) throw new Error('pngSetDpi: dpi must be positive');
    for (var s = 0; s < 8; s++) if (bytes[s] !== PNG_SIG[s]) throw new Error('pngSetDpi: not a PNG');
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var parts = [bytes.subarray(0, 8)], p = 8, inserted = false;
    var ppm = Math.round(dpi / 0.0254);
    var phys = new Uint8Array(21), pv = new DataView(phys.buffer);
    pv.setUint32(0, 9); phys.set([0x70, 0x48, 0x59, 0x73], 4); pv.setUint32(8, ppm); pv.setUint32(12, ppm); phys[16] = 1;
    pv.setUint32(17, crc32(phys.subarray(4, 17)));
    while (p + 12 <= bytes.length) {
      var len = dv.getUint32(p), type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
      var end = p + 12 + len;
      if (end > bytes.length) throw new Error('pngSetDpi: truncated chunk ' + type);
      if (type !== 'pHYs') parts.push(bytes.subarray(p, end));
      if (type === 'IHDR' && !inserted) { parts.push(phys); inserted = true; }
      p = end;
      if (type === 'IEND') break;
    }
    if (!inserted) throw new Error('pngSetDpi: IHDR missing');
    var total = parts.reduce(function (n, x) { return n + x.length; }, 0), out = new Uint8Array(total), o = 0;
    parts.forEach(function (x) { out.set(x, o); o += x.length; });
    return out;
  }

  var api = { crc32: crc32, zip: zip, docx: docx, tiff: tiff, pngSetDpi: pngSetDpi, xmlEscape: xmlEscape };
  global.AlmZip = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
