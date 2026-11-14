// node:test — shared/alm-zip.js (store-only ZIP, minimal .docx, baseline TIFF, PNG pHYs).
// The reader in ../zip-reader.mjs is independent of the writer (own CRC-32 + APPNOTE layout).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';
import { readZip, readTiff, decodePng, crc32 as refCrc } from '../zip-reader.mjs';

const require = createRequire(import.meta.url);
const Z = require('../../../../shared/alm-zip.js');
const enc = s => new TextEncoder().encode(s);
const dec = b => new TextDecoder().decode(b);
let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };

test('CRC-32 known vectors (IEEE 802.3)', () => {
  eq(Z.crc32(enc('')), 0);
  eq(Z.crc32(enc('a')), 0xE8B7BE43);
  eq(Z.crc32(enc('123456789')), 0xCBF43926);
  eq(Z.crc32(enc('The quick brown fox jumps over the lazy dog')), 0x414FA339);
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  eq(Z.crc32(all), refCrc(all), 'writer CRC equals the independent reader CRC');
});

test('zip round-trips through an independent reader with identical bytes', () => {
  const bin = Uint8Array.from({ length: 1000 }, (_, i) => (i * 37) & 255);
  const files = [
    { name: 'a.txt', string: 'hello\n' },
    { name: 'dir/ü-α.bin', bytes: bin },
    { name: 'empty.txt', bytes: new Uint8Array(0) },
    { name: 'str-as-bytes.R', bytes: 'x <- 1' },
  ];
  const z = Z.zip(files);
  const back = readZip(z);
  eq(back.map(e => e.name), files.map(f => f.name));
  eq(dec(back[0].bytes), 'hello\n');
  eq(Array.from(back[1].bytes), Array.from(bin));
  eq(back[2].bytes.length, 0);
  eq(dec(back[3].bytes), 'x <- 1');
  for (const e of back) { eq(e.date, 0x21, 'DOS date 1980-01-01'); eq(e.time, 0); }
  eq(Array.from(Z.zip(files)), Array.from(z), 'deterministic bytes');
  const dated = readZip(Z.zip(files, { date: new Date(2026, 9, 22, 13, 30, 10) }));
  eq(dated[0].date, ((2026 - 1980) << 9) | (10 << 5) | 22);
  eq(dated[0].time, (13 << 11) | (30 << 5) | 5);
  console.log('ZIP entries round-tripped: ' + back.length + '/' + files.length);
});

test('zip refuses unsafe or duplicate names', () => {
  assert.throws(() => Z.zip([{ name: '../x', string: '' }]), /Invalid zip entry name/); checks++;
  assert.throws(() => Z.zip([{ name: '/abs', string: '' }]), /Invalid zip entry name/); checks++;
  assert.throws(() => Z.zip([{ name: 'a', string: '' }, { name: 'a', string: '' }]), /Duplicate/); checks++;
});

test('docx contains the three parts and XML-escaped text', () => {
  const d = Z.docx({ title: 'T & <title>', paragraphs: [{ heading: 'Methods', text: 'a <b> & "c" \'d\'\nline2' }, { text: 'plain' }] });
  const parts = readZip(d);
  eq(parts.map(p => p.name).sort(), ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']);
  const doc = dec(parts.find(p => p.name === 'word/document.xml').bytes);
  ok(doc.includes('a &lt;b&gt; &amp; &quot;c&quot; &apos;d&apos;'), 'escaped body text');
  ok(doc.includes('T &amp; &lt;title&gt;'), 'escaped title');
  ok(!doc.includes('<b>'), 'no raw markup leaks');
  ok(doc.includes('<w:br/>'), 'newline becomes a break');
  ok(doc.includes('>Methods<'), 'heading present');
  const ct = dec(parts.find(p => p.name === '[Content_Types].xml').bytes);
  ok(ct.includes('PartName="/word/document.xml"') && ct.includes('wordprocessingml.document.main+xml'));
  const rels = dec(parts.find(p => p.name === '_rels/.rels').bytes);
  ok(rels.includes('Target="word/document.xml"'));
  for (const p of parts) ok(dec(p.bytes).startsWith('<?xml version="1.0" encoding="UTF-8"'), p.name + ' XML declaration');
});

test('tiff header: magic, IFD entries, 300 dpi rationals, strip size = w*h*3', () => {
  const w = 3, h = 2, rgba = new Uint8ClampedArray(w * h * 4);
  rgba.set([255, 0, 0, 255], 0);        // opaque red
  rgba.set([0, 0, 255, 0], 4);          // fully transparent -> white
  rgba.set([0, 0, 0, 128], 8);          // half black over white -> grey
  const t = Z.tiff({ width: w, height: h, rgba, dpi: 300 });
  const r = readTiff(t);
  eq(r.entries, 13); eq(r.nextIFD, 0);
  eq(r.tags[256].value, w); eq(r.tags[257].value, h);
  eq(r.tags[258].value, [8, 8, 8]); eq(r.tags[259].value, 1); eq(r.tags[262].value, 2);
  eq(r.tags[277].value, 3); eq(r.tags[278].value, h); eq(r.tags[279].value, w * h * 3);
  eq(r.tags[282].value, [300, 1]); eq(r.tags[283].value, [300, 1]); eq(r.tags[296].value, 2);
  eq(r.tags[284].value, 1);
  eq(r.tags[273].value + r.tags[279].value, t.length, 'strip ends at EOF');
  const off = r.tags[273].value;
  eq(Array.from(t.subarray(off, off + 9)), [255, 0, 0, 255, 255, 255, 127, 127, 127]);
  const tags = Object.keys(r.tags).map(Number);
  eq(tags, [...tags].sort((a, b) => a - b), 'IFD tags ascending (baseline requirement)');
  assert.throws(() => Z.tiff({ width: 2, height: 2, rgba: new Uint8ClampedArray(3), dpi: 300 }), /rgba/); checks++;
});

test('pngSetDpi inserts exactly one pHYs (300 dpi = 11811 px/m) and the PNG still decodes', () => {
  const chunk = (type, data) => {
    const b = new Uint8Array(12 + data.length), v = new DataView(b.buffer);
    v.setUint32(0, data.length); b.set(enc(type), 4); b.set(data, 8);
    v.setUint32(8 + data.length, refCrc(b.subarray(4, 8 + data.length))); return b;
  };
  const ihdr = new Uint8Array(13); new DataView(ihdr.buffer).setUint32(0, 2); new DataView(ihdr.buffer).setUint32(4, 1);
  ihdr[8] = 8; ihdr[9] = 6;
  const idat = deflateSync(Buffer.from([0, 1, 2, 3, 255, 4, 5, 6, 255]));
  const parts = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { png.set(p, o); o += p.length; }
  const once = Z.pngSetDpi(png, 300), twice = Z.pngSetDpi(once, 300);
  const d = decodePng(twice);
  eq(d.phys, { x: 11811, y: 11811, unit: 1 });
  eq([d.width, d.height], [2, 1]);
  eq(Array.from(twice), Array.from(once), 'idempotent: a second call replaces, never duplicates');
  assert.throws(() => Z.pngSetDpi(enc('not a png at all'), 300), /not a PNG/); checks++;
});

test('PLANTED DEFECT: a corrupted CRC or data byte is rejected by the reader', () => {
  const z = Z.zip([{ name: 'x.csv', string: 'quantity,app,R\nmu,1,1\n' }]);
  readZip(z); // control: intact archive parses
  const v = new DataView(z.buffer);
  let cd = -1; for (let p = 0; p < z.length - 4; p++) if (v.getUint32(p, true) === 0x02014b50) { cd = p; break; }
  const badCentral = z.slice(); badCentral[cd + 16] ^= 0xFF;
  assert.throws(() => readZip(badCentral), /CRC/, 'central CRC corruption must be rejected'); checks++;
  const badData = z.slice(); badData[30 + 'x.csv'.length + 3] ^= 0x01;
  assert.throws(() => readZip(badData), /CRC mismatch/, 'flipped data byte must be rejected'); checks++;
  console.log('ALMZIP checks ' + checks);
});
