import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { decodePng, readTiff as readPlainTiff } from './zip-reader.mjs';

const apps = { 'proportion-ma': '#forest', heterogeneity: '#svg-host svg', nma: '#svg-host svg' };
const evidenceDir = new URL('./rchecks-out/figpresets/', import.meta.url);
const warning = "Unverified — check the journal's current author guide";
function csvFile(name, rows) {
  mkdirSync(evidenceDir, { recursive: true });
  const keys = Object.keys(rows[0]);
  const cell = value => '"' + String(value).replaceAll('"', '""') + '"';
  writeFileSync(new URL(name, evidenceDir), [keys, ...rows.map(row => keys.map(key => row[key]))].map(row => row.map(cell).join(',')).join('\n') + '\n');
}
// Persist actual browser downloads, never regenerated fixtures, for independent base R readers.
async function evidenceDownload(page, panel, record) {
  const bytes = await download(page, panel);
  const file = `${record.app}-${record.preset}.${record.format}`;
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(new URL(file, evidenceDir), bytes);
  csvFile(file + '.csv', [{ file, ...record }]);
  return bytes;
}

test('all presets visibly disclose unverified provenance and Custom has no source', async ({ page }) => {
  await page.goto('/proportion-ma/index.html');
  const panel = page.locator('.alm-figpresets').first();
  await expect(panel).toBeVisible();
  const presets = await page.evaluate(() => window.AlmFigPresets.presets);
  const records = [];
  for (const preset of presets) {
    await panel.getByLabel('Journal preset', { exact: true }).selectOption(preset.id);
    const disclosure = panel.locator('.alm-figpresets-verification');
    await expect(disclosure).toBeVisible();
    await expect(disclosure).toHaveText(`${preset.name}: ${warning}`);
    const option = panel.locator(`option[value="${preset.id}"]`).first();
    await expect(option).toHaveText(`${preset.name} — ${warning}`);
    expect(preset.verified).toBe(false);
    if (preset.id === 'custom') {
      expect(preset.source_url).toBeNull();
      await expect(panel.locator('a')).toBeHidden();
      await expect(panel.locator('a')).not.toHaveAttribute('href');
    } else await expect(panel.locator('a')).toHaveAttribute('href', preset.source_url);
    records.push({ id: preset.id, name: preset.name, verified: preset.verified, source_url: preset.source_url === null ? 'null' : preset.source_url,
      visible: await disclosure.isVisible(), disclosure: await disclosure.textContent(), option: await option.textContent() });
  }
  csvFile('provenance.csv', records);
  // Plant a falsely confirmed visible label: the same comparison must reject it.
  await panel.locator('.alm-figpresets-verification').evaluate(el => { el.textContent = 'Verified'; });
  await expect(panel.locator('.alm-figpresets-verification')).not.toHaveText(`Custom: ${warning}`);
});

test('R evidence includes a real wrong-dpi export and a matching control', async ({ page }) => {
  await page.goto('/proportion-ma/index.html');
  const panel = page.locator('.alm-figpresets').first();
  await expect(panel).toBeVisible();
  await panel.getByLabel('Journal preset', { exact: true }).selectOption('custom');
  await panel.getByLabel('Preset width (mm)').fill('25.4');
  await panel.getByLabel('Preset resolution (dpi)').fill('300');
  await panel.getByLabel('Preset export format').selectOption('png');
  const ratio = await page.locator('#forest').evaluate(el => (el.viewBox.baseVal.height + 24) / (el.viewBox.baseVal.width + 24));
  const record = { app: 'control', preset: 'custom', format: 'png', width_mm: 25.4, dpi: 300, ratio, compression: 'lzw' };
  const control = decodePng(await evidenceDownload(page, panel, record));
  expect(control.phys.x).toBe(Math.round(300 / .0254));
  await panel.getByLabel('Preset resolution (dpi)').fill('150');
  // Intentionally keep the expected 300 dpi in the manifest. R must reject this file.
  const plant = decodePng(await evidenceDownload(page, panel, { ...record, app: 'plant' }));
  expect(plant.phys.x).not.toBe(Math.round(300 / .0254));
});
test('preset labels stay exact across option changes and multiple panels', async ({ page }) => {
  await page.goto('/hub/shared/tests/');
  await page.setContent('<div id="first"></div><div id="second"></div>');
  await page.addScriptTag({ url: '/shared/alm-figpresets.js' });
  await page.evaluate(() => {
    for (const id of ['first', 'second']) window.AlmFigPresets.mount({ target: document.getElementById(id), plots: [] });
  });
  const panel = page.locator('#first .alm-figpresets');
  const names = ['Journal preset', 'Column width', 'Preset width (mm)', 'Preset resolution (dpi)',
    'Preset font family', 'Preset minimum font (pt)', 'Preset export format'];
  for (const name of names) await expect(panel.getByLabel(name, { exact: true })).toHaveCount(1);
  await panel.getByLabel('Journal preset', { exact: true }).selectOption('f1000');
  await panel.getByLabel('Column width', { exact: true }).selectOption('double');
  await expect(panel.getByLabel('Preset width (mm)', { exact: true })).toHaveValue('150');
  await panel.getByLabel('Journal preset', { exact: true }).selectOption('bmj');
  await panel.getByLabel('Preset export format', { exact: true }).selectOption('tiff');
  await expect(page.locator('#second').getByLabel('Journal preset', { exact: true })).toHaveValue('custom');
  const ids = await page.locator('.alm-figpresets input, .alm-figpresets select').evaluateAll(els => els.map(el => el.id));
  expect(new Set(ids).size).toBe(ids.length);
  // Plant the original defect: option text becomes part of the label's text.
  await panel.getByLabel('Journal preset', { exact: true }).evaluate(el => el.labels[0].appendChild(el));
  await expect(panel.getByLabel('Journal preset', { exact: true })).toHaveCount(0);
  await panel.locator('select').first().evaluate(el => el.parentElement.after(el));
  await expect(panel.getByLabel('Journal preset', { exact: true })).toHaveValue('bmj');
});

async function download(page, panel) {
  const [file] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: /^Export .* with preset$/ }).first().click()]);
  return readFileSync(await file.path());
}

test('preset-only auto export preserves legacy SVG containers and removes stale controls', async ({ page }) => {
  await page.goto('/hub/shared/tests/');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150" viewBox="0 0 300 150"><path d="M10 10L200 100"/></svg>';
  await page.setContent(`<main><div id="chart-host">${svg}</div><button id="legacy">Existing export</button></main>`);
  const before = await page.locator('#chart-host').innerHTML();
  await page.evaluate(() => new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = '/hub/shared/chart-export-auto.js';
    script.setAttribute('data-presets-only', ''); script.onload = resolve; script.onerror = reject;
    document.head.appendChild(script);
  }));
  const panel = page.locator('.alm-figpresets');
  await expect(panel).toHaveCount(1);
  expect(await page.locator('#chart-host').innerHTML()).toBe(before);
  await expect(page.locator('button[data-xfmt]')).toHaveCount(0);
  expect((await download(page, panel)).toString()).toContain('d="M10 10L200 100"');
  // Replacing the entire SVG used to leave an export bar pointing at a detached figure.
  const oldPanel = await panel.elementHandle();
  await page.locator('#chart-host').evaluate((host, xml) => { host.innerHTML = xml.replace('M10 10L200 100', 'M20 20L100 50'); }, svg);
  await expect.poll(() => oldPanel.evaluate(el => el.isConnected)).toBe(false);
  await expect(panel).toHaveCount(1);
  await expect(page.locator('.alm-preset-auto')).toHaveCount(1);
  await expect(page.locator('#chart-host .alm-figpresets')).toHaveCount(0);
  expect((await download(page, panel)).toString()).toContain('d="M20 20L100 50"');
  await page.locator('#chart-host').evaluate(host => host.replaceChildren());
  await expect(panel).toHaveCount(0);
  await expect(page.locator('#legacy')).toHaveText('Existing export');
});

for (const app of ['forest-plot', 'funnel-plot']) {
  test(`${app}: bespoke SVG exports also receive journal presets`, async ({ page }) => {
    await page.goto(`/${app}/index.html`);
    const panel = page.locator('.alm-figpresets').first();
    await expect(panel).toBeVisible();
    const before = await page.locator('#svg-host').innerHTML();
    await panel.getByLabel('Journal preset', { exact: true }).selectOption('f1000');
    const xml = (await download(page, panel)).toString();
    expect(xml).toContain('width="75mm"');
    const paths = await page.evaluate(xml => Array.from(new DOMParser().parseFromString(xml, 'image/svg+xml').querySelectorAll('path'), el => el.getAttribute('d')), xml);
    expect(paths).toEqual(await page.locator('#svg-host path').evaluateAll(els => els.map(el => el.getAttribute('d'))));
    expect(await page.locator('#svg-host').innerHTML()).toBe(before);
  });
}

for (const [app, selector] of Object.entries(apps)) {
  test(`${app}: F1000 and BMJ exports preserve geometry and physical metadata`, async ({ page }) => {
    await page.goto(`/${app}/index.html`);
    const panel = page.locator('.alm-figpresets').first();
    await expect(panel).toBeVisible();
    const before = await page.locator(selector).evaluate(el => el.outerHTML);
    const source = await page.locator(selector).evaluate(el => ({
      paths: Array.from(el.querySelectorAll('path'), n => n.getAttribute('d')),
      lines: Array.from(el.querySelectorAll('line'), n => ['x1','y1','x2','y2'].map(k => n.getAttribute(k))),
      ratio: (el.viewBox.baseVal.height + 24) / (el.viewBox.baseVal.width + 24)
    }));
    expect(source.paths.length + source.lines.length).toBeGreaterThan(0);
    await page.evaluate(() => {
      const serialize = XMLSerializer.prototype.serializeToString;
      XMLSerializer.prototype.serializeToString = function (node) {
        if (node.localName === 'svg') window.__presetRasterSource = {
          paths: Array.from(node.querySelectorAll('path'), n => n.getAttribute('d')),
          lines: Array.from(node.querySelectorAll('line'), n => ['x1','y1','x2','y2'].map(k => n.getAttribute(k)))
        };
        return serialize.call(this, node);
      };
    });
    for (const [id, width, dpi] of [['f1000', 75, 600], ['bmj', 85, 1200]]) {
      const record = { app, preset: id, width_mm: width, dpi, ratio: source.ratio, compression: id === 'f1000' ? 'none' : 'lzw' };
      await panel.getByLabel('Journal preset', { exact: true }).selectOption(id);
      await expect(panel).toContainText("check the journal's current guidelines");
      await expect(panel.locator('a')).toHaveAttribute('href', /^https:\/\//);
      await panel.getByLabel('Preset export format').selectOption('svg');
      const svg = (await evidenceDownload(page, panel, { ...record, format: 'svg' })).toString();
      const parsed = await page.evaluate(xml => {
        const el = new DOMParser().parseFromString(xml, 'image/svg+xml').documentElement;
        return { width: el.getAttribute('width'), height: el.getAttribute('height'),
          paths: Array.from(el.querySelectorAll('path'), n => n.getAttribute('d')),
          lines: Array.from(el.querySelectorAll('line'), n => ['x1','y1','x2','y2'].map(k => n.getAttribute(k))) };
      }, svg);
      expect(parsed.width).toBe(width + 'mm');
      expect(parseFloat(parsed.height)).toBeCloseTo(width * source.ratio, 8);
      expect(parsed.paths).toEqual(source.paths); expect(parsed.lines).toEqual(source.lines);
      // A corrupted export must fail the same geometry comparison.
      expect({ ...parsed, paths: [...parsed.paths, 'M999 999'] }).not.toMatchObject({ paths: source.paths });
      await panel.getByLabel('Preset export format').selectOption('png');
      const png = decodePng(await evidenceDownload(page, panel, { ...record, format: 'png' }));
      const px = Math.round(width / 25.4 * dpi);
      expect(png.width).toBe(px); expect(png.height).toBe(Math.round(px * source.ratio));
      expect(png.phys).toEqual({ x: Math.round(dpi / .0254), y: Math.round(dpi / .0254), unit: 1 });
      expect(await page.evaluate(() => window.__presetRasterSource)).toEqual({ paths: source.paths, lines: source.lines });
      {
        await panel.getByLabel('Preset export format').selectOption('tiff');
        const tiff = readPlainTiff(await evidenceDownload(page, panel, { ...record, format: 'tiff' }));
        expect(tiff.tags[256].value).toBe(px); expect(tiff.tags[257].value).toBe(Math.round(px * source.ratio));
        expect(tiff.tags[282].value).toEqual([dpi, 1]); expect(tiff.tags[283].value).toEqual([dpi, 1]);
        expect(tiff.tags[259].value).toBe(id === 'f1000' ? 1 : 5); expect(tiff.tags[296].value).toBe(2);
        expect(await page.evaluate(() => window.__presetRasterSource)).toEqual({ paths: source.paths, lines: source.lines });
      }
      await panel.getByLabel('Preset export format').selectOption('pdf');
      const pdf = (await evidenceDownload(page, panel, { ...record, format: 'pdf' })).toString('latin1');
      const box = pdf.match(/\/MediaBox\s*\[([^\]]+)\]/)[1].trim().split(/\s+/).map(Number);
      expect(Math.abs(box[2] - width / 25.4 * 72)).toBeLessThan(.01);
      expect(Math.abs(box[3] - width / 25.4 * 72 * source.ratio)).toBeLessThan(.01);
      expect(await page.evaluate(() => window.__presetRasterSource)).toEqual({ paths: source.paths, lines: source.lines });
    }
    expect(await page.locator(selector).evaluate(el => el.outerHTML)).toBe(before);
    const oldPanel = page.getByRole('group', { name: 'Download plots', exact: true });
    expect(await oldPanel.evaluate(el => window.alm.plotExport.statusContract(el))).toBe(true);
  });
}

test('custom size, PDF page and failure recovery', async ({ page }) => {
  await page.goto('/proportion-ma/index.html');
  const panel = page.locator('.alm-figpresets').first();
  await expect(panel).toBeVisible();
  await panel.getByLabel('Journal preset', { exact: true }).selectOption('custom');
  await panel.getByLabel('Preset width (mm)').fill('25.4');
  await panel.getByLabel('Preset resolution (dpi)').fill('300');
  await panel.getByLabel('Preset export format').selectOption('pdf');
  const ratio = await page.locator('#forest').evaluate(el => (el.viewBox.baseVal.height + 24) / (el.viewBox.baseVal.width + 24));
  const record = { app: 'control', preset: 'custom', width_mm: 25.4, dpi: 300, ratio, compression: 'lzw' };
  const pdf = (await evidenceDownload(page, panel, { ...record, format: 'pdf' })).toString('latin1');
  const box = pdf.match(/\/MediaBox\s*\[([^\]]+)\]/)[1].trim().split(/\s+/).map(Number);
  expect(box[2]).toBeCloseTo(72, 2);
  expect(box[3]).toBeCloseTo(72 * ratio, 2);
  await panel.getByLabel('Preset width (mm)').fill('0');
  await panel.getByRole('button', { name: /^Export .* with preset$/ }).click();
  await expect(panel.getByRole('status')).toContainText('positive');
  await panel.getByLabel('Preset width (mm)').fill('25.4');
  await panel.getByLabel('Preset export format').selectOption('svg');
  expect((await evidenceDownload(page, panel, { ...record, format: 'svg' })).toString()).toContain('width="25.4mm"');
});

for (const exporter of ['chart-download', 'chart-export-auto']) {
  test(`${exporter}: lazy shared preset control, current SVG and idempotent mounting`, async ({ page }) => {
    await page.goto('/hub/shared/tests/');
    await page.setContent('<div id="exports"></div><svg id="chart" xmlns="http://www.w3.org/2000/svg" width="300" height="150" viewBox="0 0 300 150"><path d="M10 10L200 100" stroke="black"/><text x="20" y="30" style="font-size:5px">Example</text></svg>');
    await page.addScriptTag({ url: `/hub/shared/${exporter}.js` });
    if (exporter === 'chart-download') await page.evaluate(() => window.alm.chartDownload({ target: '#exports', getSvg: () => document.querySelector('#chart') }));
    const panel = page.locator('.alm-figpresets');
    await expect(panel).toHaveCount(1);
    await panel.getByLabel('Journal preset', { exact: true }).selectOption('f1000');
    const original = await page.locator('#chart').evaluate(el => el.outerHTML);
    const xml = (await download(page, panel)).toString();
    expect(xml).toContain('width="75mm"'); expect(xml).toContain('d="M10 10L200 100"');
    const font = await page.evaluate(xml => {
      const svg = new DOMParser().parseFromString(xml, 'image/svg+xml').documentElement;
      return parseFloat(svg.querySelector('text').style.fontSize) / 324 * 75 / 25.4 * 72;
    }, xml);
    expect(font).toBeGreaterThanOrEqual(8 - 1e-6);
    expect(await page.locator('#chart').evaluate(el => el.outerHTML)).toBe(original);
    // Re-rendered data must be read at export time, not cached when mounting.
    await page.locator('#chart path').evaluate(el => el.setAttribute('d', 'M20 20L100 50'));
    expect((await download(page, panel)).toString()).toContain('d="M20 20L100 50"');
    if (exporter === 'chart-download') await page.evaluate(() => window.alm.chartDownload({ target: '#exports', getSvg: () => document.querySelector('#chart') }));
    else await page.evaluate(() => window.alm.chartExportAuto.scan());
    await expect(panel).toHaveCount(1);
  });
}
