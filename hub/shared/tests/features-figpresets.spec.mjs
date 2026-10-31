import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { decodePng, readTiff as readPlainTiff } from './zip-reader.mjs';

const apps = { 'proportion-ma': '#forest', heterogeneity: '#svg-host svg', nma: '#svg-host svg' };
const evidenceDir = new URL('./rchecks-out/figpresets/', import.meta.url);
const warning = "Unverified — check the journal's current author guide";

// R must only see files from this run. In particular, a canceled download must
// not leave a previous run's valid PDF masquerading as fresh browser evidence.
test.beforeAll(() => {
  const files = ['provenance.csv', 'plant-custom.png', 'control-custom.png', 'control-custom.svg', 'control-custom.pdf'];
  for (const app of Object.keys(apps)) for (const preset of ['f1000', 'bmj'])
    for (const format of ['svg', 'png', 'tiff', 'pdf']) files.push(`${app}-${preset}.${format}`);
  for (const file of files) {
    rmSync(new URL(file, evidenceDir), { force: true });
    if (!file.endsWith('.csv')) rmSync(new URL(file + '.csv', evidenceDir), { force: true });
  }
});

test('late preset mounting and edits preserve real autosave keys and analysis fingerprints', async ({ page }) => {
  await page.goto('/hub/shared/tests/');
  await page.setContent('<main><input id="study" type="text" value="1,2"><select><option>DL</option></select><div id="exports"></div><svg id="chart" viewBox="0 0 300 150"><path d="M1 2L3 4"/></svg></main><div id="alm-features"></div>');
  await page.addScriptTag({ url: '/shared/autosave.js' });
  const snapshot = () => page.evaluate(() => JSON.stringify(Array.from(document.querySelectorAll('input,select,textarea'), el => [el.id, el.value, el.checked])));
  const save = async () => {
    await page.locator('#study').dispatchEvent('input');
    await expect.poll(() => page.evaluate(() => AlmAutosave.peek('preset-isolation')?.values || null)).not.toBeNull();
    return page.evaluate(() => AlmAutosave.peek('preset-isolation').values);
  };
  await page.evaluate(() => { localStorage.clear(); AlmAutosave.install({ appKey: 'preset-isolation', debounceMs: 50 }); });
  const before = await snapshot(), keys = await save();
  await page.addScriptTag({ url: '/shared/alm-figpresets.js' });
  await page.evaluate(() => AlmFigPresets.register({ target: document.getElementById('exports'), plots: [{ id: 'chart', getSvg: () => document.getElementById('chart') }] }));
  const panel = page.locator('.alm-figpresets'); await expect(panel).toBeVisible();
  await expect(panel.locator('input, select')).toHaveCount(7);
  expect(await snapshot()).toBe(before);
  await page.evaluate(() => AlmAutosave.clear('preset-isolation'));
  await panel.getByLabel('Journal preset', { exact: true }).selectOption('bmj');
  await panel.getByLabel('Preset width (mm)').fill('125');
  expect(await snapshot()).toBe(before);
  // Wait longer than the real debounce: presentation edits must not save analysis data.
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => AlmAutosave.peek('preset-isolation'))).toBeNull();
  expect(await save()).toEqual(keys);
  // Plant the original document-level form pollution; the same checks must reject it.
  await panel.evaluate(el => { const input = document.createElement('input'); input.type = 'text'; input.id = 'preset-plant'; input.value = 'bad'; el.append(input); });
  expect(await snapshot()).not.toBe(before);
  await page.evaluate(() => AlmAutosave.clear('preset-isolation'));
  expect(await save()).not.toEqual(keys);
  await page.locator('#preset-plant').evaluate(el => el.remove());
  await page.evaluate(() => AlmAutosave.clear('preset-isolation'));
  expect(await save()).toEqual(keys); expect(await snapshot()).toBe(before);
});

test('preset fields fit a narrow screen and keep their labels and focus visible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/influence/index.html');
  const panel = page.locator('.alm-figpresets'); await expect(panel).toBeVisible();
  const width = () => page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  let size = await width(); expect(size.scroll).toBeLessThanOrEqual(size.client + 1);
  const journal = panel.getByLabel('Journal preset', { exact: true });
  await journal.selectOption('cochrane'); await journal.focus(); await expect(journal).toBeFocused();
  size = await width(); expect(size.scroll).toBeLessThanOrEqual(size.client + 1);
  // Plant the unbounded long selector from the failed layout.
  await journal.evaluate(el => { el.style.width = '700px'; el.style.maxWidth = 'none'; });
  size = await width(); expect(size.scroll).toBeGreaterThan(size.client + 1);
  await journal.evaluate(el => el.removeAttribute('style'));
  size = await width(); expect(size.scroll).toBeLessThanOrEqual(size.client + 1);
});

test('dose-response live validation survives first preset mount; planted document inputs invalidate it', async ({ page }) => {
  // Delay only the presentation module so it mounts during the actual validator's
  // pending run. The unchanged contract spec remains responsible for real webR.
  await page.route('**/shared/alm-figpresets.js', route => route.fulfill({ contentType: 'application/javascript', body: '/* presentation delayed */' }));
  await page.goto('/dose-response-ma/index.html');
  await page.evaluate(() => {
    const live = AlmDoseValidate.live;
    const ref = Object.fromEntries(live.appValues(live.currentState()).map(v => [v.key, v.value]));
    window.AlmWebR = { runR: () => new Promise(resolve => {
      window.__finishPresetR = () => resolve({ ok: true, stdout: 'ALMJSON:' + JSON.stringify(ref), versions: {} });
    }) };
    window.__presetValidator = AlmValidate.mount(document.getElementById('alm-validate'), AlmDoseValidate);
    window.__pendingPresetR = __presetValidator.runLive();
  });
  await page.waitForFunction(() => !!window.__finishPresetR);
  await page.unroute('**/shared/alm-figpresets.js');
  await page.addScriptTag({ url: '/shared/alm-figpresets.js' });
  await expect(page.locator('.alm-figpresets')).toBeVisible();
  const control = await page.evaluate(async () => { __finishPresetR(); window.__finishPresetR = null; return await __pendingPresetR; });
  expect(control.stale).not.toBe(true); expect(control.rows.length).toBeGreaterThan(0);
  expect(control.rows.filter(row => !row.pass)).toEqual([]);
  await page.evaluate(() => { window.__pendingPresetR = __presetValidator.runLive(); });
  await page.waitForFunction(() => !!window.__finishPresetR);
  // Reintroduce a document-visible preset input, without an analysis edit event.
  await page.locator('.alm-figpresets').evaluate(el => { const input = document.createElement('input'); input.id = 'late-preset-plant'; el.append(input); });
  const plant = await page.evaluate(async () => { __finishPresetR(); return await __pendingPresetR; });
  expect(plant).toEqual({ stale: true, rows: [] });
  await expect(page.locator('#alm-validate [role=status]')).toContainText('out of date');
});

test('idle presets preserve the legacy export status and have a named landmark', async ({ page }) => {
  await page.goto('/hub/shared/tests/');
  await page.setContent('<main><div id="exports"></div><svg id="chart" width="300" height="150" viewBox="0 0 300 150"><path d="M1 2L3 4"/></svg></main>');
  await page.addScriptTag({ url: '/hub/shared/plot-export.js' });
  await page.evaluate(() => alm.plotExport({ target: '#exports', plots: [{ id: 'chart', name: 'Chart', getSvg: () => document.getElementById('chart') }] }));
  const panel = page.locator('.alm-figpresets'); await expect(panel).toBeVisible();
  await expect(page.getByRole('region', { name: 'Journal figure export', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(1);
  const legacy = page.getByRole('group', { name: 'Download plots', exact: true });
  await legacy.getByRole('button', { name: 'Select none', exact: true }).click();
  await legacy.getByRole('button', { name: 'Download selected', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Select at least one plot.');
  await panel.evaluate(el => el.querySelector('[aria-live]').setAttribute('role', 'status'));
  await expect(page.getByRole('status')).toHaveCount(2); // planted empty duplicate
  await panel.evaluate(el => el.querySelector('[aria-live]').removeAttribute('role'));
  await expect(page.getByRole('status')).toHaveCount(1);
  await download(page, panel);
  await expect(panel.getByRole('status')).toContainText('Figure exported.');
});
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

test('a delayed download retains its bytes; premature URL revocation is detected', async ({ page }) => {
  await page.goto('/hub/shared/tests/');
  await page.setContent('<main><svg id="chart" viewBox="0 0 300 150"><path d="M1 2L3 4"/></svg></main><div id="alm-features"></div>');
  await page.clock.install();
  await page.addScriptTag({ url: '/shared/alm-figpresets.js' });
  await page.evaluate(() => {
    AlmFigPresets.register({ target: document.querySelector('main'), plots: [{ id: 'chart', getSvg: () => document.getElementById('chart') }] });
    AlmFigPresets.scan();
    window.__nativePresetClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { window.__delayedPresetLink = this; };
  });
  const panel = page.locator('.alm-figpresets');
  await panel.getByRole('button', { name: /^Export .* with preset$/ }).click();
  await expect(panel.getByRole('status')).toContainText('Figure exported.');
  await page.clock.runFor(2000); // beyond the old 1500 ms URL revocation
  const [file] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => {
    document.body.appendChild(__delayedPresetLink);
    __nativePresetClick.call(__delayedPresetLink);
    __delayedPresetLink.remove();
  })]);
  expect(readFileSync(await file.path(), 'utf8')).toContain('d="M1 2L3 4"');
  const readable = () => page.evaluate(async () => {
    try { return (await fetch(__delayedPresetLink.href)).ok; } catch { return false; }
  });
  expect(await readable()).toBe(true);
  await page.evaluate(() => URL.revokeObjectURL(__delayedPresetLink.href));
  expect(await readable()).toBe(false);
});

async function waitForPlotEntrance() {
  // Visibility does not imply stationary geometry. app-style.css animates main
  // and .panel from translateY(6px), with a delay on the second panel. Await the
  // actual finite animations on plot ancestors before taking the baseline;
  // preserve the app's motion and every subsequent exact geometry assertion.
  const ancestors = new Set();
  for (const svg of document.querySelectorAll('main svg')) {
    for (let el = svg; el; el = el.parentElement) ancestors.add(el);
  }
  const animations = new Set();
  for (const el of ancestors) {
    for (const animation of el.getAnimations()) {
      if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animations.add(animation);
    }
  }
  // Cancellation also ends an entrance (for example when the app re-renders).
  await Promise.allSettled(Array.from(animations, animation => animation.finished));
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

test('geometry readiness excludes entrance motion but still detects a planted layout shift', async ({ page }) => {
  await page.goto('/hub/shared/tests/');
  await page.setContent('<main><section id="plot-panel"><svg width="300" height="150" viewBox="0 0 300 150"><path d="M1 2L3 4"/></svg></section></main><div id="alm-features"></div>');
  await page.addScriptTag({ url: '/shared/alm-figpresets.js' });
  await page.evaluate(() => window.AlmFigPresets.register({ target: document.querySelector('main'),
    plots: [{ id: 'chart', getSvg: () => document.querySelector('main svg') }] }));
  const panel = page.locator('#alm-features .alm-figpresets');
  await expect(panel).toHaveCount(1);
  const geometry = () => page.locator('main svg').evaluate(el => {
    const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height];
  });
  const baseline = await geometry();
  await page.evaluate(() => {
    const parent = document.getElementById('plot-panel');
    // Hold a real browser animation midway, so the pre-readiness defect is deterministic.
    window.__entrance = parent.animate([{ transform: 'translateY(6px)' }, { transform: 'none' }],
      { duration: 300, fill: 'both' });
    window.__entrance.pause(); window.__entrance.currentTime = 150;
    const original = parent.getAnimations.bind(parent);
    parent.getAnimations = (...args) => { window.__entranceRead = true; return original(...args); };
  });
  expect(await geometry()).not.toEqual(baseline);
  const waiting = page.evaluate(waitForPlotEntrance);
  await page.waitForFunction(() => window.__entranceRead === true);
  await page.evaluate(() => window.__entrance.play());
  await waiting;
  expect(await geometry()).toEqual(baseline);
  await panel.getByLabel('Journal preset', { exact: true }).selectOption('bmj');
  expect(await geometry()).toEqual(baseline);
  // Plant a one-pixel layout shift after readiness. The exact predicate must reject it.
  await page.locator('#plot-panel').evaluate(el => { el.style.paddingTop = '1px'; });
  expect(await geometry()).not.toEqual(baseline);
  await page.locator('#plot-panel').evaluate(el => { el.style.paddingTop = ''; });
  expect(await geometry()).toEqual(baseline);
});

// Exercise the unchanged archived adapters, not a substitute text comparator.
for (const app of ['gosh', 'nma-inconsistency']) {
  test(`${app}: features placement passes the display contract; a download-bar plant fails`, async ({ page }) => {
    await page.goto(`/${app}/index.html`);
    const panel = page.locator('.alm-figpresets');
    await expect(page.locator('#alm-features .alm-figpresets')).toHaveCount(1);
    await expect(panel).toBeVisible();
    await expect(page.locator('main .alm-figpresets, .alm-xbar .alm-figpresets, .alm-dl .alm-figpresets')).toHaveCount(0);
    const contract = () => page.evaluate(app => app === 'gosh'
      ? window.AlmGoshValidationAdapter.live.currentState().values.find(v => v.key === 'display').value
      : window.AlmIncoValidationAdapter.chartControls(), app);
    expect(await contract()).toBe(true);
    await page.evaluate(waitForPlotEntrance);
    const geometry = () => page.locator('main svg').evaluateAll(els => els.map(el => {
      const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height];
    }));
    const before = await geometry();
    // plot-export names its fieldset through a legend, not an aria-label.
    // Resolve the actual legacy control before taking snapshots or planting UI;
    // an empty locator would otherwise make the markup comparison vacuous.
    const plotGroup = page.locator('main').getByRole('group', { name: 'Download plots', exact: true });
    const bars = page.locator('main .alm-xbar, main .alm-dl').or(plotGroup);
    const plantTarget = app === 'gosh' ? plotGroup : page.locator('main .alm-xbar').first();
    await expect(plantTarget).toHaveCount(1);
    await expect(plantTarget).toBeVisible();
    const markup = await bars.evaluateAll(els => els.map(el => el.outerHTML));
    await panel.getByLabel('Journal preset', { exact: true }).selectOption('bmj');
    expect(await geometry()).toEqual(before);
    expect(await bars.evaluateAll(els => els.map(el => el.outerHTML))).toEqual(markup);
    // Plant the reviewed defect. The real archived display predicate must reject it.
    await plantTarget.evaluate((bar, source) => {
      const plant = source.cloneNode(true); plant.className = 'alm-figpresets-plant';
      bar.appendChild(plant);
    }, await panel.elementHandle());
    await expect(plantTarget.locator('.alm-figpresets-plant')).toHaveCount(1);
    expect(await contract()).toBe(false);
    await page.locator('.alm-figpresets-plant').evaluate(el => el.remove());
    expect(await contract()).toBe(true);
    expect(await bars.evaluateAll(els => els.map(el => el.outerHTML))).toEqual(markup);
    expect(await geometry()).toEqual(before);
    await panel.getByLabel('Preset export format').selectOption('svg');
    expect((await download(page, panel)).toString()).toContain('width="85mm"');
  });
}

test('one features panel aggregates plots, preserves settings and never changes legacy bars', async ({ page }) => {
  await page.goto('/hub/shared/tests/');
  await page.setContent('<main><div id="exports-a"></div><svg id="a" width="300" height="150" viewBox="0 0 300 150"><path d="M1 2L3 4"/></svg><div id="exports-b"></div><svg id="b" width="300" height="150" viewBox="0 0 300 150"><path d="M5 6L7 8"/></svg></main><div id="alm-features"></div>');
  await page.addScriptTag({ url: '/hub/shared/chart-download.js' });
  await page.evaluate(() => {
    for (const id of ['a', 'b']) window.alm.chartDownload({ target: '#exports-' + id, basename: id, getSvg: () => document.getElementById(id) });
  });
  const panel = page.locator('#alm-features .alm-figpresets');
  await expect(page.locator('.alm-figpresets')).toHaveCount(1);
  await expect(panel.getByRole('button', { name: /^Export .* with preset$/ })).toHaveCount(2);
  await expect(page.locator('main .alm-figpresets')).toHaveCount(0);
  const before = await page.locator('main').innerHTML();
  await panel.getByLabel('Journal preset', { exact: true }).selectOption('bmj');
  await page.evaluate(() => window.alm.chartDownload({ target: '#exports-a', basename: 'a', getSvg: () => document.getElementById('a') }));
  await expect(panel.getByLabel('Journal preset', { exact: true })).toHaveValue('bmj');
  await expect(panel.getByRole('button', { name: /^Export .* with preset$/ })).toHaveCount(2);
  expect(await page.locator('main').innerHTML()).toBe(before);
  for (const [index, path] of [[0, 'M1 2L3 4'], [1, 'M5 6L7 8']]) {
    const [file] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: /^Export .* with preset$/ }).nth(index).click()]);
    expect(readFileSync(await file.path(), 'utf8')).toContain(`d="${path}"`);
  }
});

test('chart refresh keeps live validation current, while a real analysis edit invalidates it', async ({ page }) => {
  await page.goto('/correlation-ma/index.html');
  const panel = page.locator('#alm-features .alm-figpresets');
  await expect(panel).toBeVisible();
  await panel.getByLabel('Journal preset', { exact: true }).selectOption('bmj');
  await panel.getByLabel('Preset width (mm)').fill('125');
  await page.evaluate(() => {
    // A deferred runner isolates the revision lifecycle. The existing contract
    // specs still execute real webR and independently check all 12 quantities.
    const state = AlmCorrValidationAdapter.live.currentState();
    const ref = Object.fromEntries(state.values.map(v => [v.key, v.value]));
    ref.display = true; ref.controls = true;
    window.AlmWebR = { runR: () => new Promise(resolve => {
      window.__figFinishR = () => resolve({ ok: true, stdout: 'ALMJSON:' + JSON.stringify(ref), versions: { metafor: '4.8-0' } });
    }) };
    alm.chartExportAuto.scan(); AlmFigPresets.scan();
    window.__figInputs = () => JSON.stringify(Array.from(document.querySelectorAll('input,select,textarea'),
      el => [el.id, el.value, el.checked]));
    window.__figBefore = __figInputs();
    window.__figEvents = [];
    document.addEventListener('change', e => __figEvents.push(e.target.id), true);
  });
  // Control and headline plant both redraw the chart in currentState(). Neither
  // may be silently discarded as stale because the exporter rebuilt its form.
  for (const tampered of [false, true]) {
    await page.evaluate(tampered => {
      if (tampered) {
        const run = __almCorrValidationRun;
        window.__almCorrValidationRun = () => { run(); document.getElementById('headline').textContent = 'Pooled r = 99'; };
      }
      window.__figResult = AlmCorrValidation.runLive();
    }, tampered);
    await page.waitForFunction(() => !!window.__figFinishR);
    const observed = await page.evaluate(() => {
      alm.chartExportAuto.scan(); AlmFigPresets.scan();
      return { fingerprint: __figInputs(), before: __figBefore, events: __figEvents };
    });
    expect(observed.fingerprint).toBe(observed.before);
    expect(observed.events).toEqual([]);
    const result = await page.evaluate(async () => { __figFinishR(); window.__figFinishR = null; return await __figResult; });
    expect(result.stale).not.toBe(true);
    expect(result.rows).toHaveLength(12);
    expect(result.rows.filter(row => !row.pass).map(row => row.label)).toEqual(tampered ? ['display'] : []);
  }
  await expect(panel.getByLabel('Preset width (mm)')).toHaveValue('125');
  // A real edit must continue to trip the unchanged validator's stale guard.
  await page.evaluate(() => { window.__figResult = AlmCorrValidation.runLive(); });
  await page.waitForFunction(() => !!window.__figFinishR);
  await page.locator('#f-data').fill('A, .3, 20\nB, -.2, 30');
  const stale = await page.evaluate(async () => { __figFinishR(); return await __figResult; });
  expect(stale).toEqual({ stale: true, rows: [] });
});

async function presetsOnly(page) {
  await page.evaluate(() => new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = '/hub/shared/chart-export-auto.js';
    script.setAttribute('data-presets-only', ''); script.onload = resolve; script.onerror = reject;
    document.head.appendChild(script);
  }));
}
const autoSvg = path => `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150" viewBox="0 0 300 150"><path d="${path}"/></svg>`;
async function exportName(page, panel, button) {
  const [file] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: button, exact: true }).click()]);
  return file.suggestedFilename();
}

test('auto-discovered figures are named after the app and a redraw never reuses a number', async ({ page }) => {
  await page.goto('/hub/shared/tests/');
  await page.setContent(`<main><div id="chart-host">${autoSvg('M10 10L200 100')}</div></main><div id="alm-features" data-app="demo-app"></div>`);
  await presetsOnly(page);
  const panel = page.locator('.alm-figpresets');
  await expect(panel).toHaveCount(1);
  // Formerly 'chart-1-chart-1-custom.svg': no app name, and the number restarted after every redraw.
  expect(await exportName(page, panel, 'Export chart-1 with preset')).toBe('demo-app-chart-1-custom.svg');
  await page.locator('#chart-host').evaluate((host, xml) => { host.innerHTML = xml; }, autoSvg('M20 20L100 50'));
  await expect(panel.getByRole('button', { name: 'Export chart-2 with preset', exact: true })).toHaveCount(1);
  await expect(panel.getByRole('button', { name: 'Export chart-1 with preset', exact: true })).toHaveCount(0);
  expect(await exportName(page, panel, 'Export chart-2 with preset')).toBe('demo-app-chart-2-custom.svg');
  // Without data-app the page's own folder names the app, as chart-export-auto.js names its downloads.
  await page.goto('/hub/shared/tests/');
  await page.setContent(`<main><div id="chart-host">${autoSvg('M10 10L200 100')}</div></main>`);
  await presetsOnly(page);
  expect(await exportName(page, page.locator('.alm-figpresets'), 'Export chart-1 with preset')).toBe('tests-chart-1-custom.svg');
});

test('the presets host survives AlmFeatures building its panel in the same #alm-features', async ({ page }) => {
  await page.goto('/hub/shared/tests/');
  await page.setContent(`<main><div id="chart-host">${autoSvg('M10 10L200 100')}</div></main><div id="alm-features" data-app="demo-app"></div>`);
  await presetsOnly(page);
  const host = page.locator('#alm-features > #alm-figpresets-host');
  await expect(host.locator('.alm-figpresets')).toBeVisible();
  await host.getByLabel('Journal preset', { exact: true }).selectOption('bmj');
  // AlmFeatures.buildHost() starts with mountEl.replaceChildren(), which detaches the presets host.
  await page.addScriptTag({ url: '/shared/alm-features.js' });
  await page.evaluate(() => {
    AlmFeatures.registerModule('share', { render(panel) { panel.textContent = 'Demo share tab'; } });
    AlmFeatures.register('demo-app', { title: 'Demo', share: {} });
  });
  await expect(page.locator('#alm-features .alm-f-heading')).toBeVisible();
  await expect(host).toHaveCount(1);
  await expect(host.locator('.alm-figpresets')).toBeVisible();
  await expect(page.locator('.alm-figpresets')).toHaveCount(1);
  await expect(host.getByLabel('Journal preset', { exact: true })).toHaveValue('bmj');
  expect(await exportName(page, host, 'Export chart-1 with preset')).toBe('demo-app-chart-1-bmj.svg');
});
