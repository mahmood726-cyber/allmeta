// Independent store-only ZIP reader + TIFF/PNG header parsers used by the feature tests.
// Deliberately does NOT import shared/alm-zip.js: it re-implements CRC-32 and the record
// layout from the PKWARE APPNOTE so a writer bug cannot be mirrored by the reader.
import { inflateSync } from 'node:zlib';

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (const b of bytes) c = TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

export function readZip(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 22 - 65535); p--) {
    if (v.getUint32(p, true) === 0x06054b50) { eocd = p; break; }
  }
  if (eocd < 0) throw new Error('EOCD not found');
  const count = v.getUint16(eocd + 10, true), cdSize = v.getUint32(eocd + 12, true), cdOff = v.getUint32(eocd + 16, true);
  if (cdOff + cdSize !== eocd) throw new Error('central directory does not end at EOCD');
  const dec = new TextDecoder('utf-8', { fatal: true });
  const out = [];
  let p = cdOff;
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('bad central header signature at ' + p);
    const flags = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true);
    const time = v.getUint16(p + 12, true), date = v.getUint16(p + 14, true);
    const crc = v.getUint32(p + 16, true), csize = v.getUint32(p + 20, true), usize = v.getUint32(p + 24, true);
    const nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true);
    const loff = v.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
    if (method !== 0) throw new Error('not stored: ' + name);
    if (!(flags & 0x0800)) throw new Error('UTF-8 flag missing: ' + name);
    if (csize !== usize) throw new Error('stored size mismatch: ' + name);
    if (v.getUint32(loff, true) !== 0x04034b50) throw new Error('bad local header signature: ' + name);
    const lcrc = v.getUint32(loff + 14, true), lnlen = v.getUint16(loff + 26, true), lxlen = v.getUint16(loff + 28, true);
    if (lcrc !== crc) throw new Error('local/central CRC differ: ' + name);
    if (dec.decode(bytes.subarray(loff + 30, loff + 30 + lnlen)) !== name) throw new Error('local/central name differ: ' + name);
    const start = loff + 30 + lnlen + lxlen;
    const data = bytes.slice(start, start + usize);
    if (data.length !== usize) throw new Error('truncated entry: ' + name);
    if (crc32(data) !== crc) throw new Error('CRC mismatch: ' + name);
    out.push({ name, bytes: data, crc, time, date });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

export function readTiff(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b[0] !== 0x49 || b[1] !== 0x49 || v.getUint16(2, true) !== 42) throw new Error('not a little-endian TIFF');
  const ifd = v.getUint32(4, true), n = v.getUint16(ifd, true), tags = {};
  for (let i = 0; i < n; i++) {
    const p = ifd + 2 + i * 12, tag = v.getUint16(p, true), type = v.getUint16(p + 2, true), count = v.getUint32(p + 4, true);
    let value;
    if (type === 3 && count === 1) value = v.getUint16(p + 8, true);
    else if (type === 4 && count === 1) value = v.getUint32(p + 8, true);
    else if (type === 5) { const o = v.getUint32(p + 8, true); value = [v.getUint32(o, true), v.getUint32(o + 4, true)]; }
    else if (type === 3) { const o = v.getUint32(p + 8, true); value = Array.from({ length: count }, (_, k) => v.getUint16(o + 2 * k, true)); }
    else value = v.getUint32(p + 8, true);
    tags[tag] = { type, count, value };
  }
  return { entries: n, tags, nextIFD: v.getUint32(ifd + 2 + n * 12, true), length: b.length };
}

// Full PNG decode check: chunk CRCs, IHDR, and zlib-inflated IDAT size = h * (1 + w * bpp).
export function decodePng(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!sig.every((x, i) => b[i] === x)) throw new Error('PNG signature missing');
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 8, ihdr = null, phys = null; const idat = [];
  while (p < b.length) {
    const len = v.getUint32(p), type = String.fromCharCode(...b.subarray(p + 4, p + 8));
    const crc = v.getUint32(p + 8 + len);
    if (crc32(b.subarray(p + 4, p + 8 + len)) !== crc) throw new Error('PNG chunk CRC mismatch: ' + type);
    const d = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') ihdr = { width: v.getUint32(p + 8), height: v.getUint32(p + 12), depth: d[8], colorType: d[9] };
    if (type === 'pHYs') phys = { x: v.getUint32(p + 8), y: v.getUint32(p + 12), unit: d[8] };
    if (type === 'IDAT') idat.push(Buffer.from(d));
    p += 12 + len;
    if (type === 'IEND') break;
  }
  if (!ihdr) throw new Error('IHDR missing');
  const raw = inflateSync(Buffer.concat(idat));
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.colorType];
  const expected = ihdr.height * (1 + Math.ceil(ihdr.width * channels * ihdr.depth / 8));
  if (raw.length !== expected) throw new Error('IDAT size ' + raw.length + ' != ' + expected);
  return { ...ihdr, phys, rawBytes: raw.length };
}
