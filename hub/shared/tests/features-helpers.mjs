// Shared helpers for the <app>-features.spec.mjs files (papers 6-9 feature coverage).
// Every assertion helper here THROWS on mismatch, so each spec can prove the helper is able to
// fail by feeding it a planted defect (expect(() => helper(bad)).toThrow()).
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import vm from 'node:vm';
import { readTiff } from './plot-export-reader.mjs';

export function fail(message) { throw new Error(message); }

// ---- Load named top-level functions out of an app page into a Node vm context ----------------
// Brace-matches `function <name>(` blocks in the page source, so the code executed is the page's
// own bytes (no copy). Strings/comments containing braces are not expected in these functions;
// the extracted source is evaluated and a missing function fails loudly.
export function loadPageFunctions(htmlPath, names, extraGlobals = {}, scripts = []) {
  const html = readFileSync(htmlPath, 'utf8');
  const parts = [];
  for (const name of names) {
    const start = html.indexOf('function ' + name + '(');
    if (start < 0) fail('function ' + name + ' not found in ' + htmlPath);
    let depth = 0, i = html.indexOf('{', start);
    for (; i < html.length; i++) {
      if (html[i] === '{') depth++;
      else if (html[i] === '}' && --depth === 0) break;
    }
    parts.push(html.slice(start, i + 1));
  }
  const ctx = vm.createContext({ Math, Number, isFinite, Error, Array, ...extraGlobals });
  ctx.window = ctx; // shared/*.js modules attach to window (AlmStats, AlmMaCore, ...)
  for (const file of scripts) vm.runInContext(readFileSync(file, 'utf8'), ctx, { filename: file });
  vm.runInContext(parts.join('\n') + '\n;this.__fns={' + names.join(',') + '};', ctx);
  return ctx.__fns;
}

// ---- CSV results export ---------------------------------------------------------------------
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r') { /* CRLF */ }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  row.push(cell); rows.push(row);
  return rows;
}

// Flatten exactly like hub/shared/results-export.js (_flatKVs) so the comparison is key-for-key.
export function flatKVs(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? prefix + '.' + k : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) out.push(...flatKVs(v, path));
    else if (Array.isArray(v)) out.push([path, JSON.stringify(v)]);
    else out.push([path, v]);
  }
  return out;
}

export async function downloadCsv(page) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.locator('#alm-export-mount [data-action="csv"]').click()]);
  return { name: file.suggestedFilename(), text: readFileSync(await file.path(), 'utf8') };
}

// csvText: downloaded CSV. results: the page's results object (same object the export reads).
// displayed: [{key, text, digits, scale?}] -- each is a number as printed on the page; the CSV's
// full-precision value, scaled and rounded with toFixed(digits), must reproduce the printed text.
export function checkCsvAgainstPage(csvText, results, displayed) {
  const rows = parseCsv(csvText);
  if (rows[0].join(',') !== 'key,value') fail('CSV header is ' + JSON.stringify(rows[0]));
  const kv = new Map(rows.slice(1).map(r => { if (r.length !== 2) fail('CSV row width ' + r.length + ': ' + r); return r; }));
  const expected = flatKVs(results);
  if (kv.size !== expected.length) fail('CSV has ' + kv.size + ' value rows, results have ' + expected.length);
  for (const [k, v] of expected) {
    if (!kv.has(k)) fail('CSV lacks key ' + k);
    const want = v == null ? '' : String(v);
    if (kv.get(k) !== want) fail('CSV ' + k + '=' + kv.get(k) + ' but page results ' + want);
  }
  if (!displayed.length) fail('no displayed numbers to compare');
  for (const d of displayed) {
    if (!kv.has(d.key)) fail('CSV lacks displayed key ' + d.key);
    const value = Number(kv.get(d.key)) * (d.scale || 1);
    if (!Number.isFinite(value)) fail('CSV ' + d.key + ' not numeric: ' + kv.get(d.key));
    const printed = value.toFixed(d.digits);
    if (printed !== d.text) fail('page shows ' + d.key + '=' + d.text + ' but CSV value ' + kv.get(d.key) + ' prints as ' + printed);
  }
  return kv;
}

// ---- Plot export decoding -------------------------------------------------------------------
function unfilter(raw, width, height, bpp) {
  const stride = width * bpp, out = Buffer.alloc(stride * height);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const type = raw[p++], row = y * stride, prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[row + x - bpp] : 0, b = y ? out[prev + x] : 0, c = (y && x >= bpp) ? out[prev + x - bpp] : 0;
      let v = raw[p++];
      if (type === 1) v += a; else if (type === 2) v += b; else if (type === 3) v += (a + b) >> 1;
      else if (type === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      else if (type !== 0) fail('bad PNG filter ' + type);
      out[row + x] = v & 255;
    }
  }
  return out;
}
function toRgb(px, n, channels) {
  if (channels === 3) return px;
  const rgb = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) { rgb[3 * i] = px[channels * i]; rgb[3 * i + 1] = px[channels * i + 1]; rgb[3 * i + 2] = px[channels * i + 2]; }
  return rgb;
}

// Returns {width, height, ppm, phys, rgb}; throws on a malformed file or missing/misplaced pHYs.
export function decodePng(bytes) {
  if (![137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) fail('not a PNG signature');
  let width, height, depth, ctype, idat = [], phys = 0, ppm = null, seenData = false;
  for (let p = 8; p < bytes.length;) {
    const size = bytes.readUInt32BE(p), type = bytes.toString('ascii', p + 4, p + 8), data = bytes.subarray(p + 8, p + 8 + size);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; if (data[12] !== 0) fail('interlaced PNG'); }
    if (type === 'pHYs') { if (seenData) fail('pHYs after IDAT'); phys++; if (data[8] !== 1) fail('pHYs unit not metre'); ppm = [data.readUInt32BE(0), data.readUInt32BE(4)]; }
    if (type === 'IDAT') { seenData = true; idat.push(data); }
    p += size + 12;
  }
  if (depth !== 8 || ![2, 6].includes(ctype)) fail('unsupported PNG depth/colour ' + depth + '/' + ctype);
  const ch = ctype === 2 ? 3 : 4;
  const px = unfilter(inflateSync(Buffer.concat(idat)), width, height, ch);
  return { width, height, ppm, phys, rgb: toRgb(px, width * height, ch) };
}

export function checkPng(bytes, { width, height, dpi }) {
  const png = decodePng(bytes);
  if (png.width !== width || png.height !== height) fail(`PNG is ${png.width}x${png.height}, expected ${width}x${height}`);
  if (png.phys !== 1) fail('PNG has ' + png.phys + ' pHYs chunks');
  const ppm = Math.round(dpi / 0.0254);
  if (png.ppm[0] !== ppm || png.ppm[1] !== ppm) fail(`pHYs ${png.ppm} px/m, expected ${ppm} (${dpi} dpi)`);
  if (!png.rgb.some(v => v < 200)) fail('PNG is blank');
  return png;
}

export function checkTiff(bytes, { width, height, dpi }) {
  const t = readTiff(bytes), tags = t.tags;
  const eq = (id, want) => { if (JSON.stringify(tags[id]) !== JSON.stringify(want)) fail(`TIFF tag ${id} = ${JSON.stringify(tags[id])}, expected ${JSON.stringify(want)}`); };
  eq(256, [width]); eq(257, [height]);
  eq(259, [5]);            // Compression = LZW
  eq(262, [2]);            // PhotometricInterpretation = RGB
  eq(258, [8, 8, 8]); eq(277, [3]);
  eq(282, [dpi]); eq(283, [dpi]); eq(296, [2]);
  if (!t.bytes.some(v => v < 200)) fail('TIFF is blank');
  return t;
}

// Minimal PDF reader for jsPDF output: finds the single page, its MediaBox and the image XObject
// it paints, and decodes that image (Flate + PNG predictors) to RGB.
export function checkPdf(bytes, { widthMm, width, height }) {
  const s = bytes.toString('latin1');
  if (!s.startsWith('%PDF-')) fail('not %PDF');
  if (!/%%EOF\s*$/.test(s)) fail('PDF lacks %%EOF');
  const objs = new Map();
  for (const m of s.matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)) objs.set(Number(m[1]), m[2]);
  const pages = [...objs.values()].filter(o => /\/Type\s*\/Page\b(?!s)/.test(o));
  if (pages.length !== 1) fail('PDF has ' + pages.length + ' pages');
  const box = pages[0].match(/\/MediaBox\s*\[([^\]]+)\]/)[1].trim().split(/\s+/).map(Number);
  // Page height is width * (SVG h/w); the raster height is that ratio rounded to whole pixels, so the
  // ratio is known from the pixels only to +/- 0.5 px.
  const wantW = widthMm * 72 / 25.4, wantH = wantW * height / width, slack = wantW * 0.5 / width + 0.01;
  if (Math.abs(box[2] - box[0] - wantW) > 0.01 || Math.abs(box[3] - box[1] - wantH) > slack) fail(`MediaBox ${box} vs ${wantW}x${wantH} (+/-${slack}) pt`);
  const contentRef = Number(pages[0].match(/\/Contents\s+(\d+) 0 R/)[1]);
  const content = streamOf(objs.get(contentRef), objs);
  const doName = (content.toString('latin1').match(/\/(\S+)\s+Do/) || [])[1];
  if (!doName) fail('page content paints no XObject');
  const images = [...objs.entries()].filter(([, o]) => /\/Subtype\s*\/Image/.test(o));
  const img = images.find(([, o]) => /\/DeviceRGB/.test(o));
  if (!img) fail('PDF has no RGB image XObject');
  const dict = img[1];
  if (!new RegExp('/' + doName.replace(/[^\w]/g, '\\$&') + '\\s+' + img[0] + '\\s+0\\s+R').test(s)) fail('painted XObject /' + doName + ' is not the RGB image object ' + img[0]);
  const num = key => Number((dict.match(new RegExp('/' + key + '\\s+(\\d+)')) || [])[1]);
  if (num('Width') !== width || num('Height') !== height) fail(`PDF image ${num('Width')}x${num('Height')}, expected ${width}x${height}`);
  const colors = 3;
  let data = streamOf(dict, objs);
  if (/\/Predictor\s+1[0-5]/.test(dict)) data = unfilter(data, width, height, colors);
  if (data.length !== width * height * 3) fail('PDF image has ' + data.length + ' bytes');
  if (!data.some(v => v < 200)) fail('PDF image is blank');
  return { rgb: data, doName };
}
function streamOf(obj, objs) {
  const m = obj.match(/^([\s\S]*?)stream\r?\n/);
  if (!m) fail('object has no stream');
  let len = obj.match(/\/Length\s+(\d+)(\s+0\s+R)?/);
  len = len[2] ? Number(objs.get(Number(len[1])).trim()) : Number(len[1]);
  const start = m[0].length, raw = Buffer.from(obj.slice(start, start + len), 'latin1');
  return /\/FlateDecode/.test(m[1]) ? inflateSync(raw) : raw;
}

// Pixel-level identity of two RGB rasters of the same size (fraction of differing bytes).
export function rgbDifference(a, b) {
  if (a.length !== b.length) return 1;
  let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d / a.length;
}

// Drives the plot selector: every listed plot x {PNG 600, PDF, TIFF 300, TIFF 600} (+ PNG 300 used as
// the pixel reference for the PDF). Returns a log of what was checked.
export async function exportEveryPlot(page, expect) {
  const panel = page.getByRole('group', { name: 'Download plots', exact: true });
  await expect(panel).toHaveCount(1);
  const names = await panel.locator('label:has(input[type=checkbox])').allTextContents();
  if (!names.length) fail('plot selector lists no plots');
  const mm = 85;
  await panel.getByLabel('Physical width', { exact: true }).selectOption(String(mm));
  const log = [], last = {};
  const grab = async (name, format, dpi) => {
    await panel.getByLabel('Format', { exact: true }).selectOption(format);
    if (format !== 'pdf') await panel.getByLabel('Resolution', { exact: true }).selectOption(String(dpi));
    const [file] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download ' + name, exact: true }).click()]);
    await expect(panel.getByRole('status')).toHaveText('Downloaded 1 file(s)');
    return { file: file.suggestedFilename(), bytes: readFileSync(await file.path()) };
  };
  for (const name of names) {
    const sizes = {};
    for (const dpi of [300, 600]) {
      const png = await grab(name, 'png', dpi);
      if (!png.file.endsWith('.png')) fail('PNG filename ' + png.file);
      const decoded = decodePng(png.bytes);
      const width = Math.round(mm / 25.4 * dpi);
      sizes[dpi] = { width, height: decoded.height, ratio: decoded.height / decoded.width };
      checkPng(png.bytes, { width, height: decoded.height, dpi });
      if (dpi === 300) sizes.ref = decoded.rgb;
      last['png' + dpi] = { bytes: png.bytes, width, height: decoded.height, dpi };
      log.push(`${name} PNG ${dpi} dpi ${width}x${decoded.height}`);
    }
    // Height must be consistent between resolutions (same aspect ratio).
    const h600 = Math.max(1, Math.round(sizes[600].width * sizes[300].height / sizes[300].width));
    if (Math.abs(h600 - sizes[600].height) > 1) fail(`600 dpi height ${sizes[600].height} inconsistent with 300 dpi aspect (${h600})`);
    const pdf = await grab(name, 'pdf', 300);
    if (!pdf.file.endsWith('.pdf')) fail('PDF filename ' + pdf.file);
    const heightMm = mm * sizes[300].height / sizes[300].width;
    const decodedPdf = checkPdf(pdf.bytes, { widthMm: mm, heightMm, width: sizes[300].width, height: sizes[300].height });
    const diff = rgbDifference(decodedPdf.rgb, sizes.ref);
    last.pdf = { bytes: pdf.bytes, widthMm: mm, heightMm, width: sizes[300].width, height: sizes[300].height, ref: sizes.ref };
    if (diff > 0.001) fail(`PDF page image differs from the 300 dpi PNG in ${(diff * 100).toFixed(3)}% of bytes`);
    log.push(`${name} PDF image ${sizes[300].width}x${sizes[300].height} == PNG300 (diff ${diff})`);
    for (const dpi of [300, 600]) {
      const tif = await grab(name, 'tiff', dpi);
      if (!tif.file.endsWith('.tiff')) fail('TIFF filename ' + tif.file);
      const t = checkTiff(tif.bytes, { width: sizes[dpi].width, height: sizes[dpi].height, dpi });
      last['tiff' + dpi] = { bytes: tif.bytes, width: sizes[dpi].width, height: sizes[dpi].height, dpi };
      log.push(`${name} TIFF ${dpi} dpi LZW RGB ${t.tags[256]}x${t.tags[257]}`);
    }
  }
  return { names, log, last };
}

// Planted defects for the export checks: each must make its checker throw.
export function setTiffTag(bytes, id, value) {
  const b = Buffer.from(bytes), ifd = b.readUInt32LE(4);
  for (let i = 0; i < b.readUInt16LE(ifd); i++) {
    const p = ifd + 2 + 12 * i;
    if (b.readUInt16LE(p) === id) { b.writeUInt16LE(value, p + 8); return b; }
  }
  fail('tag ' + id + ' not present');
}
export function exportNegatives(last, expect) {
  const { png600, png300, tiff300, tiff600, pdf } = last;
  expect(() => checkPng(png600.bytes, png600)).not.toThrow();
  expect(() => checkPng(png300.bytes, { ...png300, dpi: 600, width: png600.width, height: png600.height })).toThrow(/PNG is/);
  expect(() => checkPng(png600.bytes, { ...png600, dpi: 300 })).toThrow(/pHYs/);
  expect(() => checkTiff(tiff600.bytes, tiff600)).not.toThrow();
  expect(() => checkTiff(setTiffTag(tiff300.bytes, 259, 1), tiff300)).toThrow(/tag 259/);
  expect(() => checkTiff(setTiffTag(tiff300.bytes, 262, 1), tiff300)).toThrow(/tag 262/);
  expect(() => checkTiff(tiff300.bytes, { ...tiff300, dpi: 600 })).toThrow(/tag 282/);
  expect(() => checkPdf(pdf.bytes, pdf)).not.toThrow();
  expect(() => checkPdf(Buffer.from('%PNG' + pdf.bytes.toString('latin1').slice(4), 'latin1'), pdf)).toThrow(/not %PDF/);
  const tampered = Buffer.from(pdf.bytes.toString('latin1').replace('/Width ' + pdf.width, '/Width ' + (pdf.width + 1)), 'latin1');
  expect(tampered.equals(pdf.bytes)).toBe(false);
  expect(() => checkPdf(tampered, pdf)).toThrow(/PDF image/);
  const blank = Buffer.alloc(pdf.ref.length, 255);
  expect(rgbDifference(checkPdf(pdf.bytes, pdf).rgb, blank)).toBeGreaterThan(0.001);
}
