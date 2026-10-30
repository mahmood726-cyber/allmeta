// Lane A3: journal presets / colour modes are opt-in and leave the default export byte-identical.
// Run: npx playwright test -c addons-a3.playwright.config.mjs   (private port 8163)
import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {readTiff} from './plot-export-reader.mjs';

const BASE = '/hub/shared/tests/addons-a3-fixture-base.html';
const NEW = '/hub/shared/tests/addons-a3-fixture.html';
const OPT = NEW + '?presets=1';

async function download(page, plot = 'chart') {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: 'Download ' + plot, exact: true}).click()]);
  const bytes = readFileSync(await file.path());
  return {bytes, name: file.suggestedFilename(), status: await page.getByRole('status').textContent()};
}
async function choose(page, fmt, dpi, mm) {
  await page.getByLabel('Format', {exact: true}).selectOption(fmt);
  if (dpi && !(await page.getByLabel('Resolution', {exact: true}).isDisabled())) await page.getByLabel('Resolution', {exact: true}).selectOption(String(dpi));
  await page.getByLabel('Physical width', {exact: true}).selectOption(String(mm));
}
// jsPDF stamps a creation time and a document ID; everything else must match byte for byte.
function normalisePdf(bytes) {
  return bytes.toString('latin1').replace(/\/CreationDate \(D:[^)]*\)/g, '/CreationDate ()').replace(/\/ID \[[^\]]*\]/g, '/ID []');
}
const CASES = [['svg', null, 85], ['svg', null, 170], ['pdf', null, 85], ['pdf', null, 170]];
for (const fmt of ['png', 'tiff']) for (const dpi of [300, 600]) for (const mm of [85, 170]) CASES.push([fmt, dpi, mm]);

// Byte-level golden. Raster bytes are compared under software rasterisation (see the config):
// with GPU raster on, identical wave-0 code gave different PNG bytes run to run (measured), so a
// second wave-0 page ("base2") is a control that must reproduce "base" exactly first.
const BYTE_CASES = [['svg', null, 85], ['svg', null, 170], ['png', 300, 85], ['tiff', 300, 85], ['pdf', null, 85]];
test('golden: default export bytes are identical to the wave-0 plot-export.js, with and without opting in', async ({browser}) => {
  test.setTimeout(1800000);
  const pages = {};
  for (const [key, url] of [['base', BASE], ['base2', BASE], ['default', NEW], ['optedIn', OPT]]) {
    const context = await browser.newContext({acceptDownloads: true});
    pages[key] = await context.newPage(); await pages[key].goto(url);
  }
  const panel = p => p.evaluate(() => document.querySelector('#exports > fieldset').outerHTML);
  expect(await panel(pages.default)).toBe(await panel(pages.base));
  expect(await panel(pages.optedIn)).not.toBe(await panel(pages.base));
  let compared = 0;
  for (const [fmt, dpi, mm] of BYTE_CASES) {
    const got = {};
    for (const key of Object.keys(pages)) { await choose(pages[key], fmt, dpi, mm); got[key] = await download(pages[key]); }
    const norm = b => fmt === 'pdf' ? normalisePdf(b) : b.toString('latin1');
    expect(got.base.bytes.length, `${fmt} ${dpi} ${mm}`).toBeGreaterThan(100);
    expect(norm(got.base2.bytes), `control base vs base ${fmt} ${dpi} ${mm}`).toBe(norm(got.base.bytes));
    expect(norm(got.default.bytes), `default ${fmt} ${dpi} ${mm}`).toBe(norm(got.base.bytes));
    expect(norm(got.optedIn.bytes), `opted-in ${fmt} ${dpi} ${mm}`).toBe(norm(got.base.bytes));
    expect(got.default.status).toBe(got.base.status);
    expect(got.default.name).toBe(got.base.name);
    compared += 2;
  }
  expect(compared).toBe(2 * BYTE_CASES.length);
  // The comparison can fail: a different width changes the bytes.
  await choose(pages.base, 'svg', null, 85); await choose(pages.default, 'svg', null, 170);
  expect((await download(pages.default)).bytes.equals((await download(pages.base)).bytes)).toBe(false);
});

// Pipeline golden: the exact SVG text handed to the rasteriser (every Blob given to
// URL.createObjectURL) and every canvas size, for every format, match the wave-0 code exactly.
// This holds even where the browser's rasteriser itself is not byte-reproducible.
const capture = () => {
  window.__blobs = []; window.__canvases = [];
  const create = URL.createObjectURL;
  URL.createObjectURL = function (b) { if (b instanceof Blob) window.__blobs.push(b); return create.call(URL, b); };
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...a) { window.__canvases.push(this.width + 'x' + this.height); return get.apply(this, a); };
};
const drain = page => page.evaluate(async () => {
  const out = {blobs: await Promise.all(window.__blobs.map(async b => b.type + ':' + (b.type === 'image/svg+xml' ? await b.text() : b.size > 0))), canvases: window.__canvases};
  window.__blobs = []; window.__canvases = []; return out;
});
test('golden: raster pipeline inputs (SVG text and canvas sizes) are identical to wave-0 for every format', async ({browser}) => {
  test.setTimeout(1800000);
  const pages = {};
  for (const [key, url] of [['base', BASE], ['default', NEW], ['optedIn', OPT]]) {
    const context = await browser.newContext({acceptDownloads: true});
    pages[key] = await context.newPage(); await pages[key].addInitScript(capture); await pages[key].goto(url);
  }
  for (const [fmt, dpi, mm] of CASES) for (const plot of ['chart']) {
    const got = {};
    for (const key of Object.keys(pages)) { await choose(pages[key], fmt, dpi, mm); await download(pages[key], plot); got[key] = await drain(pages[key]); }
    expect(got.base.blobs.length, `${fmt} ${dpi} ${mm}`).toBeGreaterThan(fmt === 'svg' ? 0 : 1);
    expect(got.default, `default ${plot} ${fmt} ${dpi} ${mm}`).toEqual(got.base);
    expect(got.optedIn, `opted-in ${plot} ${fmt} ${dpi} ${mm}`).toEqual(got.base);
  }
  // Control: the capture sees a change (opted-in greyscale alters the rasteriser input).
  await pages.optedIn.getByLabel('Colours', {exact: true}).selectOption('greyscale');
  await choose(pages.optedIn, 'png', 300, 85); await choose(pages.base, 'png', 300, 85);
  await download(pages.optedIn); await download(pages.base);
  expect(await drain(pages.optedIn)).not.toEqual(await drain(pages.base));
});

test('default panel has no preset or colour controls', async ({page}) => {
  await page.goto(NEW);
  await expect(page.getByLabel('Journal preset', {exact: true})).toHaveCount(0);
  await expect(page.getByLabel('Colours', {exact: true})).toHaveCount(0);
  await page.goto(OPT);
  await expect(page.getByLabel('Journal preset', {exact: true})).toHaveCount(1);
  await expect(page.getByLabel('Colours', {exact: true})).toHaveValue('default');
  await expect(page.locator('#alm-plot-1-journal-preset')).toHaveCount(1);
  await expect(page.locator('#alm-plot-1-colours')).toHaveCount(1);
});

test('journal presets set the printed width and resolution, and show their source', async ({page}) => {
  await page.goto(OPT);
  await page.getByLabel('Journal preset', {exact: true}).selectOption('lancet-107');
  await expect(page.locator('[data-alm-preset-source]')).toContainText('https://www.thelancet.com/pb-assets/Lancet/authors/tl-info-for-authors.pdf (read 2026-10-18)');
  await choose(page, 'tiff', 600, 170);
  let {tags} = readTiff((await download(page)).bytes);
  expect(tags[256]).toEqual([Math.round(107 / 25.4 * 300)]); expect(tags[282]).toEqual([300]);
  await page.getByLabel('Journal preset', {exact: true}).selectOption('plos-page');
  ({tags} = readTiff((await download(page)).bytes));
  expect(tags[256]).toEqual([2250]); // PLOS ONE: 19.05 cm is 2250 pixels at 300 dpi
  // A preset with no stated width keeps the chosen width and sets only the resolution.
  await page.getByLabel('Journal preset', {exact: true}).selectOption('bmj-line-art');
  await choose(page, 'tiff', 300, 85);
  ({tags} = readTiff((await download(page)).bytes));
  expect(tags[256]).toEqual([Math.round(85 / 25.4 * 1200)]); expect(tags[282]).toEqual([1200]);
  // Back to no preset: the chosen controls apply again.
  await page.getByLabel('Journal preset', {exact: true}).selectOption('');
  await expect(page.locator('[data-alm-preset-source]')).toHaveText('');
  ({tags} = readTiff((await download(page)).bytes));
  expect(tags[256]).toEqual([Math.round(85 / 25.4 * 300)]); expect(tags[282]).toEqual([300]);
});

const colours = text => [...text.matchAll(/#[0-9a-fA-F]{6}\b|rgba?\([^)]*\)/g)].map(m => m[0].toLowerCase());
const isGrey = c => { const m = c.startsWith('#') ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)) : c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number); return m[0] === m[1] && m[1] === m[2]; };

test('Okabe-Ito mode recolours only the export clone and keeps neutral colours', async ({page}) => {
  await page.goto(OPT);
  const before = await page.evaluate(() => document.getElementById('chart').outerHTML);
  await choose(page, 'svg', null, 170);
  const plain = (await download(page)).bytes.toString('utf8');
  expect(plain).toContain('#14532d'); expect(plain).toContain('#1d4ed8');
  await page.getByLabel('Colours', {exact: true}).selectOption('okabe-ito');
  const svg = (await download(page)).bytes.toString('utf8');
  for (const c of ['#0072b2', '#d55e00', '#009e73']) expect(svg).toContain(c);
  for (const c of ['#14532d', '#1d4ed8', 'rgb(20, 83, 45)', 'rgb(200, 30, 40)', 'rgb(29, 78, 216)']) expect(svg).not.toContain(c);
  expect(svg).toContain('#808080');
  expect(await page.evaluate(() => document.getElementById('chart').outerHTML)).toBe(before);
  // Raster output carries the mapped colour too.
  await choose(page, 'tiff', 300, 85);
  const {tags, bytes} = readTiff((await download(page)).bytes);
  const w = tags[256][0], h = tags[257][0], at = (Math.floor(h * 0.5) * w + Math.floor(w * 0.3)) * 3;
  expect([...bytes.subarray(at, at + 3)]).toEqual([0, 114, 178]);
});

test('greyscale mode leaves no chromatic colour in the export (and the check can fail)', async ({page}) => {
  await page.goto(OPT);
  await choose(page, 'svg', null, 85);
  const plain = colours((await download(page)).bytes.toString('utf8'));
  expect(plain.some(c => !isGrey(c))).toBe(true);
  await page.getByLabel('Colours', {exact: true}).selectOption('greyscale');
  const grey = colours((await download(page)).bytes.toString('utf8'));
  expect(grey.length).toBeGreaterThan(3);
  expect(grey.filter(c => !isGrey(c))).toEqual([]);
});

test('minimum-font warning: journal minimum, house minimum, and silence when text is large enough', async ({page}) => {
  await page.goto(OPT);
  await choose(page, 'svg', null, 85);
  expect((await download(page, 'small')).status).toBe('Downloaded 1 file(s). Smallest text is 5.8 pt at this width; below 6 pt may be hard to read.');
  await choose(page, 'svg', null, 170);
  expect((await download(page, 'small')).status).toBe('Downloaded 1 file(s)');
  await page.getByLabel('Journal preset', {exact: true}).selectOption('f1000-75');
  expect((await download(page, 'small')).status).toBe('Downloaded 1 file(s). Smallest text is 5.1 pt at this width; F1000Research asks for at least 8 pt.');
  expect((await download(page, 'chart')).status).toBe('Downloaded 1 file(s)');
  // The default panel never adds the warning.
  await page.goto(NEW);
  await choose(page, 'svg', null, 85);
  expect((await download(page, 'small')).status).toBe('Downloaded 1 file(s)');
});

test('oversized rasters are refused before rendering; the status contract still holds', async ({page}) => {
  await page.goto(OPT);
  await page.getByLabel('Journal preset', {exact: true}).selectOption('bmj-line-art');
  await choose(page, 'png', 300, 170);
  await page.getByRole('button', {name: 'Download tall', exact: true}).click();
  await expect(page.getByRole('status')).toHaveText('Downloaded 0 file(s). Export failed: Raster would exceed 100 million pixels; choose a smaller width or resolution');
  const valid = () => page.evaluate(() => alm.plotExport.statusContract(document.querySelector('#exports > fieldset')));
  expect(await valid()).toBe(true);
  await page.evaluate(() => { document.querySelector('#exports legend').textContent = 'Edited'; });
  expect(await valid()).toBe(false);
});

test('opting in without plot-presets.js loaded is refused', async ({page}) => {
  await page.goto(BASE);
  await page.addScriptTag({url: '/hub/shared/plot-export.js'});
  const error = await page.evaluate(() => { delete window.alm.plotPresets; try { window.alm.plotExport({target: '#exports', presets: true, plots: []}); return ''; } catch (e) { return e.message; } });
  expect(error).toBe('opts.presets requires hub/shared/plot-presets.js to be loaded first');
});
