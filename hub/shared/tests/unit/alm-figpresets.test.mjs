import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { decodePng, readTiff as readPlainTiff } from '../zip-reader.mjs';
import { readTiff } from '../plot-export-reader.mjs';
const require = createRequire(import.meta.url);
const F = require('../../../../shared/alm-figpresets.js');
const Z = require('../../../../shared/alm-zip.js');
const scope = { window: {}, document: { currentScript: null }, TextEncoder, Uint8Array, DataView, Blob, URL };
vm.runInNewContext(readFileSync(new URL('../../plot-export.js', import.meta.url), 'utf8'), scope);
const P = scope.window.alm.plotExport;

test('all seven journals and Custom carry auditable, conservative data', () => {
  assert.deepEqual(F.presets.map(p => p.id), ['f1000', 'bmj', 'lancet', 'jama', 'nejm', 'plos', 'cochrane', 'custom']);
  assert.deepEqual(F.lint(F.presets), []);
  assert.equal(F.presets.find(p => p.id === 'bmj').width_mm.single, null);
  assert.equal(F.presets.find(p => p.id === 'f1000').min_dpi, 600);
  assert.equal(F.presets.find(p => p.id === 'bmj').min_dpi, 1200);
  for (const p of F.presets) assert.equal(p.verified, false);
});
test('planted missing/unsafe source, invalid numbers and unsupported format fail lint; original passes', () => {
  for (const patch of [{ source_url: '' }, { source_url: 'javascript:alert(1)' }, { min_dpi: -1 }, { formats: ['jpeg2000'] }]) {
    assert.ok(F.lint([{ ...F.presets[0], ...patch }]).length);
  }
  assert.deepEqual(F.lint([F.presets[0]]), []);
});
test('millimetres convert at exact dpi with rounding only at pixel boundary', () => {
  assert.equal(F.mmToPx(25.4, 300), 300);
  assert.equal(F.mmToPx(75, 600), 1772);
  assert.equal(F.mmToPx(85, 1200), 4016);
  assert.notEqual(F.mmToPx(75, 600), Math.round(75 / 25 * 600)); // planted wrong inch
  for (const n of [0, -1, NaN, Infinity]) assert.throws(() => F.mmToPx(n, 300));
  assert.throws(() => F.mmToPx(25.4, 0));
});
test('preset sizing, custom sizing and unknown values stay distinct', () => {
  assert.equal(F.settings('f1000', { column: 'double' }).widthMm, 150);
  assert.equal(F.settings('f1000').minPt, 8);
  assert.equal(F.settings('bmj').dpi, 1200);
  assert.equal(F.settings('bmj').widthIsDefault, true);
  assert.equal(F.settings('custom', { widthMm: 25.4, dpi: 150 }).widthMm, 25.4);
  assert.throws(() => F.settings('bmj', { dpi: 300 }), /minimum/);
  assert.throws(() => F.settings('missing'), /Unknown/);
  assert.throws(() => F.settings('custom', { widthMm: -1 }), /positive/);
});
test('SVG physical dimensions and font minimum operate on prepared copy', () => {
  const attrs = { viewBox: '0 0 100 50', width: '100', height: '50' };
  const text = { style: { fontSize: '5px', fontFamily: 'serif' } };
  const svg = { getAttribute: k => attrs[k], setAttribute: (k,v) => { attrs[k] = String(v); }, querySelectorAll: () => [text] };
  F.applySvg(svg, { widthMm: 25.4, minPt: 8, fontFamily: 'Arial' });
  assert.equal(attrs.width, '25.4mm'); assert.equal(attrs.height, '12.7mm');
  assert.equal(attrs.viewBox, '0 0 100 50');
  assert.ok(Math.abs(parseFloat(text.style.fontSize) - 100 / 72 * 8) < 1e-9);
  assert.equal(text.style.fontFamily, 'Arial');
  text.style.fontSize = '50px'; text.style.fontFamily = 'serif';
  F.applySvg(svg, { widthMm: 25.4, minPt: 0, fontFamily: null });
  assert.equal(text.style.fontSize, '50px'); assert.equal(text.style.fontFamily, 'serif');
  attrs.viewBox = '0 0 0 50';
  assert.throws(() => F.applySvg(svg, { widthMm: 25.4 }), /dimensions/);
});
test('TIFF LZW and uncompressed resolution tags retain independent x/y dpi', () => {
  const b = Buffer.from(P._tiff(new Uint8Array([12,34,56]), 1, 1, 600));
  const t = readTiff(b);
  assert.deepEqual(t.tags[282], [600]); assert.deepEqual(t.tags[283], [600]);
  assert.deepEqual(t.tags[296], [2]); assert.deepEqual(t.tags[259], [5]);
  assert.deepEqual([...t.bytes], [12,34,56]);
  const plain = readPlainTiff(Z.tiff({ width: 1, height: 1, rgba: new Uint8Array([12,34,56,255]), dpi: 1200 }));
  assert.deepEqual(plain.tags[282].value, [1200, 1]); assert.deepEqual(plain.tags[283].value, [1200, 1]);
  assert.equal(plain.tags[259].value, 1); assert.equal(plain.tags[296].value, 2);
  const bad = Buffer.from(b); // planted resolution unit corruption
  for (let p = 10; p < 190; p += 12) if (bad.readUInt16LE(p) === 296) bad.writeUInt16LE(3, p + 8);
  assert.notDeepEqual(readTiff(bad).tags[296], [2]);
});
test('PNG pHYs metadata has correct units and CRC and replaces previous resolution', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const once = await P._pngDpi(new Blob([png]), 600);
  assert.deepEqual(decodePng(new Uint8Array(await once.arrayBuffer())).phys, { x: 23622, y: 23622, unit: 1 });
  const twice = new Uint8Array(await (await P._pngDpi(once, 1200)).arrayBuffer());
  assert.deepEqual(decodePng(twice).phys, { x: 47244, y: 47244, unit: 1 });
  assert.equal(Buffer.from(twice).toString('latin1').split('pHYs').length - 1, 1);
  const bad = twice.slice(); const at = Buffer.from(bad).indexOf('pHYs'); bad[at + 12] = 0;
  assert.throws(() => decodePng(bad), /CRC/);
});
test('invalid artifact options fail before reading or modifying the app SVG', async () => {
  let reads = 0;
  const plot = { getSvg() { reads++; return null; } };
  for (const args of [['eps', 300, 85], ['png', 0, 85], ['svg', 300, -85], ['png', 300.5, 85]]) {
    await assert.rejects(P.artifact(plot, ...args), /Unsupported|Invalid/);
  }
  assert.equal(reads, 0);
  await assert.rejects(P.artifact(plot, 'svg', 300, 85), /No SVG/);
  assert.equal(reads, 1);
});
