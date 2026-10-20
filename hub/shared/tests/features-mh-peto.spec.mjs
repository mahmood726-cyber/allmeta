import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { readZip, readTiff, decodePng } from './zip-reader.mjs';

const APP = 'mh-peto', PAGE = '/mh-peto/index.html';
const SNAP = new URL('./__snapshots__/text-mh-peto.json', import.meta.url);
const rows = [
  ['StudyA', 3, 500, 8, 500], ['StudyB', 1, 200, 5, 200], ['StudyC', 0, 150, 4, 150],
  ['StudyD', 2, 400, 6, 400], ['StudyE', 4, 600, 10, 600]
];
const formats = [
  'Study\tai\tn1i\tci\tn2i\n' + rows.map(r => r.join('\t')).join('\n'),
  'Study  Treatment events  Control events\n' + rows.map(r => `${r[0]}  ${r[1]}/${r[2]}  ${r[3]}/${r[4]}`).join('\n'),
  'Study or Subgroup\tExperimental Events\tExperimental Total\tControl Events\tControl Total\n' +
    rows.map(r => r.join('\t')).join('\n')
];
async function open(page, tab = 'Data entry') {
  await page.goto(PAGE);
  await expect(page.locator('#pooled-body tr')).toHaveCount(2);
  await page.locator('#alm-features .alm-f-toggle').click();
  await page.getByRole('tab', { name: tab, exact: true }).click();
}
async function render(page) {
  return page.evaluate(() => {
    const spec = AlmTextSpecs['mh-peto'], r = spec.results();
    const ctx = { app: 'mh-peto', build: AlmBuildInfo, entryLog: [], verify: null };
    const rendered = AlmText.render(spec.templates, r, ctx);
    const audit = AlmText.audit(rendered, r, { ctx, dom: spec.dom() });
    const norm = p => p.segments.map(s =>
      s.type === 'ctx' && s.key.startsWith('build.') ? `<${s.key}>` : s.text).join('');
    return { audit, results: rendered.results.text, snapshot: {
      app: 'mh-peto', source: 'Built-in five-study example, OR; unmodified counts',
      plain: norm(rendered.plain), methods: norm(rendered.methods), results: norm(rendered.results),
      flags: rendered.flags.map(norm), references: rendered.cites.map(c => c.full)
    } };
  });
}
async function axe(page, name) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(a => !a.effect || a.effect.getComputedTiming().iterations !== Infinity)
    .map(a => a.finished.catch(() => null))));
  const out = await new AxeBuilder({ page }).include('#alm-features')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = out.violations.filter(v => ['serious', 'critical'].includes(v.impact));
  console.log(`AXE ${name} serious/critical=${bad.length} passes=${out.passes.length}`);
  expect(bad).toEqual([]);
}

test('ENTRY: three table formats preserve every count and the example result through the shared APIs', async ({ page }) => {
  await open(page);
  const baseline = await page.evaluate(() => _almLastMhPeto());
  for (const [i, input] of formats.entries()) {
    const out = await page.evaluate(input => {
      const table = AlmEntry.parseTable(input), detection = AlmEntry.detect(table, 'binary2x2');
      const converted = AlmEntry.convert(table, detection, 'binary2x2', {});
      if (converted.flags.some(f => f.blocking) || converted.questions.length) throw new Error(JSON.stringify(converted));
      const applied = AlmFeatures.get('mh-peto').entry.apply(converted.records);
      AlmFeaturesState.entryLog = converted.steps;
      return { converted, applied, parsed: __mhValidation.parse(document.getElementById('src').value), result: _almLastMhPeto() };
    }, input);
    expect(out.applied).toEqual({ ok: true, n: 5 });
    expect(out.parsed).toEqual(rows.map(([label, e1, n1, e2, n2]) => ({ label, e1, n1, e2, n2 })));
    for (const [key, value] of Object.entries(baseline)) {
      if (typeof value === 'number') expect(Math.abs(out.result[key] - value)).toBeLessThanOrEqual(Math.abs(value) * 1e-9);
      else expect(out.result[key]).toEqual(value);
    }
    console.log(`ENTRYRT ${i + 1}/3 format=${['Excel', 'paper n/N', 'RevMan/Covidence'][i]} counts=20/20`);
  }
  await expect(page.getByRole('heading', { name: 'Conversion log', exact: true })).toBeVisible();
  await expect(page.locator('#alm-f-panel-entry')).toContainText('No numerical conversions recorded');
  // The integrated source-confirmation workflow starts with the apply gate closed.
  await expect(page.locator('#alm-f-panel-entry').getByRole('button', { name: 'Use these rows', exact: true })).toBeDisabled();
});

test('ENTRY PLANTED: impossible event count blocks the shared UI and the app adapter atomically', async ({ page }) => {
  await open(page);
  const before = await page.locator('#src').inputValue();
  const bad = formats[0].replace('StudyA\t3\t500', 'StudyA\t501\t500');
  // Exercise the stable table API; use a separate shared table mount for its blocking-button contract.
  await page.evaluate(() => {
    const host = document.createElement('div'); host.id = 'table-gate'; document.body.appendChild(host);
    const spec = AlmFeatures.get('mh-peto').entry;
    window.entryGate = AlmEntryUI.mount(host, { schema: spec.schema, apply: spec.apply });
  });
  await page.locator('#table-gate textarea').fill(bad);
  await page.locator('#table-gate').getByRole('button', { name: 'Preview and convert', exact: true }).click();
  await expect(page.locator('#table-gate').getByRole('button', { name: 'Use these rows', exact: true })).toBeDisabled();
  await expect(page.locator('#table-gate .alm-entry-block').first()).toBeVisible();
  const result = await page.evaluate(() => {
    const c = entryGate.getResult();
    let rejected = false;
    try { AlmFeatures.get('mh-peto').entry.apply(c.records); } catch { rejected = true; }
    return { blocked: c.flags.some(f => f.blocking), rejected };
  });
  expect(result).toEqual({ blocked: true, rejected: true });
  expect(await page.locator('#src').inputValue()).toBe(before);
  console.log('ENTRY PLANTED blocking=1/1 adapter-refusal=1/1 unchanged=1/1');
});

test('TEXT: audited example matches displayed digits, exports and committed snapshot', async ({ page }, info) => {
  await open(page, 'Report text');
  const out = await render(page);
  console.log(`TEXTAUDIT ${out.audit.passed}/${out.audit.checks} domChecked=${out.audit.domChecked}`);
  expect(out.audit.failures).toEqual([]);
  expect(out.audit.ok).toBe(true);
  expect(out.audit.domChecked).toBeGreaterThanOrEqual(12);
  const shown = await page.locator('#pooled-body tr').evaluateAll(trs => trs.flatMap(tr => [
    tr.cells[1].textContent, ...tr.cells[2].textContent.replace(/[[\]]/g, '').split(',').map(s => s.trim()),
    tr.cells[3].textContent, tr.cells[4].textContent
  ]));
  for (const value of shown) expect(out.results.replace(/−/g, '-')).toContain(value);
  console.log(`TEXTDOM ${shown.length}/${shown.length}`);
  const actual = info.outputPath('text-mh-peto.json');
  fs.writeFileSync(actual, JSON.stringify(out.snapshot, null, 2) + '\n');
  await info.attach('text-mh-peto.json', { path: actual, contentType: 'application/json' });
  expect(out.snapshot).toEqual(JSON.parse(fs.readFileSync(SNAP, 'utf8')));
  await expect(page.locator('#alm-f-panel-text .alm-text-audit')).toContainText('checks passed');
  const [md] = await Promise.all([page.waitForEvent('download'), page.locator('#alm-f-panel-text .alm-text-md').click()]);
  expect(fs.readFileSync(await md.path(), 'utf8')).toContain(out.results);
  const [docx] = await Promise.all([page.waitForEvent('download'), page.locator('#alm-f-panel-text .alm-text-docx').click()]);
  expect(readZip(fs.readFileSync(await docx.path())).map(e => e.name)).toEqual(
    expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']));
  console.log('TEXTEXPORT 2/2');
});

test('TEXT PLANTED: changed MH estimate fails DOM audit and withholds prose; RR/RD remain honest', async ({ page }) => {
  await open(page, 'Report text');
  await page.evaluate(() => { window.__almTextPerturb = { key: 'mh_est', delta: 0.1 }; });
  const out = await render(page);
  console.log(`TEXTAUDIT planted ${out.audit.passed}/${out.audit.checks}`);
  expect(out.audit.ok).toBe(false);
  expect(out.audit.failures.map(f => f.check)).toContain('dom:mh_est');
  await page.locator('#alm-f-panel-text .alm-text-regenerate').click();
  await expect(page.locator('#alm-f-panel-text .alm-text-status')).toContainText('Number audit failed');
  await expect(page.locator('#alm-f-panel-text .alm-text-body')).toBeHidden();
  await page.evaluate(() => { delete window.__almTextPerturb; });
  for (const measure of ['RR', 'RD']) {
    await page.locator('#measure').selectOption(measure);
    const changed = await render(page);
    expect(changed.audit.ok, JSON.stringify(changed.audit.failures)).toBe(true);
    expect(changed.results).toContain(`MH ${measure}`);
    expect(changed.results).not.toContain('Peto OR');
    console.log(`TEXTAUDIT ${measure} ${changed.audit.passed}/${changed.audit.checks}`);
  }
});

test('VERIFY: live R, forest exports, ZIP integrity, planted failure and stale verification prose', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await open(page, 'Verify in R');
  const panel = page.locator('#alm-f-panel-verify'), summary = panel.getByTestId('verify-summary');
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(summary).toHaveText(/^\d+ of \d+ quantities match R — PASS$/, { timeout: 600_000 });
  const m = /^(\d+) of (\d+)/.exec(await summary.textContent()), n = Number(m[2]);
  expect(Number(m[1])).toBe(n); expect(n).toBeGreaterThanOrEqual(5);
  console.log(`VERIFY ${m[1]}/${n}`);
  expect(await panel.locator('td[data-result]').allTextContents()).toEqual(Array(n).fill('PASS'));
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('mh-peto'))).toBe(true);
  await expect(panel.locator('figure img')).toHaveCount(1);
  expect(await panel.locator('figure img').evaluate(e => e.complete && e.naturalWidth > 0)).toBe(true);
  await expect(panel.locator('figure svg')).toHaveCount(1);
  await axe(page, 'verify after R');
  const [zip] = await Promise.all([page.waitForEvent('download'),
    panel.getByRole('button', { name: 'Download everything (ZIP)', exact: true }).click()]);
  const entries = readZip(fs.readFileSync(await zip.path()));
  const files = Object.fromEntries(entries.map(e => [e.name, e.bytes]));
  for (const name of ['mh-peto-verify.R', 'mh-peto-verify-comparison.csv', 'sessionInfo.txt', 'console.txt',
    'mh-peto-forest-R-300dpi.png', 'mh-peto-forest-R.pdf', 'mh-peto-forest-R-300dpi.tiff', 'truthcert.json']) {
    expect(files[name], name).toBeDefined();
  }
  expect(Object.keys(files).filter(n => /^mh-peto-forest-(R|app)\.svg$/.test(n))).toHaveLength(1);
  const decode = b => new TextDecoder().decode(b);
  expect(decode(files['mh-peto-verify.R'])).toContain('metafor::rma.mh');
  expect(decode(files['mh-peto-verify.R'])).toContain('metafor::rma.peto');
  expect(decode(files['mh-peto-verify.R'])).toContain('metafor::forest(mh');
  expect(decode(files['mh-peto-forest-R.pdf'].subarray(0, 5))).toBe('%PDF-');
  const png = decodePng(files['mh-peto-forest-R-300dpi.png']);
  expect([png.width, png.height]).toEqual([2400, 1800]);
  const tiff = readTiff(files['mh-peto-forest-R-300dpi.tiff']);
  expect(tiff.tags[282].value).toEqual([300, 1]);
  expect(tiff.tags[283].value).toEqual([300, 1]);
  const receipt = JSON.parse(decode(files['truthcert.json']));
  expect(receipt.extra.results.passed).toBe(true);
  expect(await page.evaluate(r => AlmTruthCertExport.verifyContentHash(r), receipt)).toBe(true);
  console.log(`VERIFYZIP ${entries.length}/${entries.length} entries; PNG/PDF/TIFF/SVG checked`);
  await page.getByRole('tab', { name: 'Report text', exact: true }).click();
  await expect(page.locator('[data-para=methods]')).toContainText('Results were independently verified in R');
  await page.locator('#src').fill((await page.locator('#src').inputValue()).replace('3, 500', '4, 500'));
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('mh-peto'))).toBe(false);
  await page.locator('#btn-run').click();
  await page.locator('#alm-f-panel-text .alm-text-regenerate').click();
  await expect(page.locator('[data-para=methods]')).not.toContainText('Results were independently verified in R');
  await page.locator('#src').fill(rows.map(r => r.join(', ')).join('\n'));
  await page.locator('#btn-run').click();
  await page.getByRole('tab', { name: 'Verify in R', exact: true }).click();
  await page.evaluate(() => { window.__almVerifyPerturb = { key: 'mh_est', delta: 0.1 }; });
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(summary).toContainText('FAIL', { timeout: 300_000 });
  const failing = await panel.locator('tbody tr').evaluateAll(trs =>
    trs.filter(tr => tr.querySelector('[data-result]').textContent !== 'PASS').map(tr => tr.dataset.key));
  expect(failing).toEqual(['mh_est']);
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('mh-peto'))).toBe(false);
  console.log(`VERIFY planted ${n - 1}/${n} failing=mh_est`);
  expect(errors).toEqual([]);
});

test('SHARE: data, measure, axis options, provenance and log survive; corrupt links change nothing', async ({ browser, baseURL }) => {
  const contexts = [];
  async function fresh(url) {
    const context = await browser.newContext(); contexts.push(context);
    const page = await context.newPage(); await page.goto(url); return page;
  }
  try {
    const page = await fresh(new URL(PAGE, baseURL).href);
    const initial = await page.locator('#src').inputValue();
    await page.locator('#src').fill('Alpha, 2, 60, 8, 60\nBeta, 1, 80, 6, 80\nGamma, 3, 90, 9, 90');
    await page.locator('#measure').selectOption('RR');
    await page.getByLabel('X axis minimum').fill('0.01');
    await page.getByLabel('X axis minimum').dispatchEvent('change');
    await page.getByLabel('X axis maximum').fill('10');
    await page.getByLabel('X axis maximum').dispatchEvent('change');
    await page.locator('#alm-axis-mount [data-edge=log]').check();
    await page.evaluate(() => {
      AlmFeaturesState.entryLog = [{ text: 'Counts transcribed without conversion', method: 'transcription' }];
      AlmFeaturesState.provenance = [{ label: 'Alpha', reference: 'Example fixture', location: 'Table', confirmed: true }];
    });
    const state = await page.evaluate(() => ({ input: AlmMhPetoFeatures.share.get(), result: _almLastMhPeto(),
      forest: document.getElementById('forest').innerHTML, provenance: AlmFeaturesState.provenance }));
    await page.locator('#alm-features .alm-f-toggle').click();
    await page.getByRole('tab', { name: 'Share', exact: true }).click();
    await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
    await expect(page.getByTestId('share-status')).toContainText('Share link');
    const link = await page.getByLabel('Share link', { exact: true }).inputValue();
    const restored = await fresh(link);
    await expect(restored.getByTestId('share-status')).toHaveText('Analysis restored from the share link.');
    expect(await restored.evaluate(() => ({ input: AlmMhPetoFeatures.share.get(), result: _almLastMhPeto(),
      forest: document.getElementById('forest').innerHTML, provenance: AlmFeaturesState.provenance }))).toEqual(state);
    const corrupt = await fresh(link.slice(0, -12));
    await expect(corrupt.getByTestId('share-status')).toContainText('Nothing was changed.');
    expect(await corrupt.locator('#src').inputValue()).toBe(initial);
    expect(await corrupt.locator('#measure').inputValue()).toBe('OR');
    // A structurally valid envelope with invalid options also refuses atomically.
    const bad = await page.evaluate(async () => AlmShare.encode('mh-peto',
      { ...AlmMhPetoFeatures.share.get(), measure: 'invalid' }, []));
    const invalid = await fresh(new URL(PAGE, baseURL).href + '#s=' + bad);
    await expect(invalid.getByTestId('share-status')).toContainText('Nothing was changed.');
    expect(await invalid.locator('#src').inputValue()).toBe(initial);
    console.log('SHARE roundtrip=1/1 corrupted=1/1 invalid-options=1/1');
  } finally { for (const context of contexts) await context.close(); }
});

test('ACCESSIBILITY: all feature tabs have no serious or critical axe violations', async ({ page }) => {
  await open(page);
  for (const name of ['Data entry', 'Report text', 'Verify in R', 'Share']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await axe(page, name);
  }
});
