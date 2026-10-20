import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { readZip, readTiff, decodePng } from './zip-reader.mjs';

const APP = 'influence', PAGE = '/influence/index.html';
const SNAP = new URL('./__snapshots__/text-influence.json', import.meta.url);
const EXAMPLE = [
  ['Smith', .25, .08], ['Jones', .18, .10], ['Khan', .40, .15], ['Lee', .30, .09], ['Park', .12, .07],
  ['Outlier', .85, .09], ['Chen', .22, .08], ['Garcia', .32, .12], ['Ahmed', .45, .17], ['Brown', .28, .10]
];
const Z = 1.959963984540054;
const paper = 'Study  Mean difference\n' + EXAMPLE.map(([s, y, se]) => `${s}  ${y} (${y - Z * se}–${y + Z * se})`).join('\n');
const formats = [
  ['Excel TSV', 'Study\tEffect\tSE\n' + EXAMPLE.map(r => r.join('\t')).join('\n')],
  ['paper estimate (CI)', paper],
  ['RevMan generic inverse-variance style', 'Study or Subgroup\tMean Difference\tStandard Error\tWeight\n' + EXAMPLE.map(r => r.join('\t') + '\t10%').join('\n')]
];

async function open(page, tab = 'entry') {
  await page.goto(PAGE);
  await expect(page.locator('#body tr')).toHaveCount(11);
  await page.evaluate(key => AlmFeatures.open('influence', key), tab);
  await expect(page.locator('#alm-f-panel-' + tab)).toBeVisible();
}
async function render(page) {
  return page.evaluate(() => {
    const spec = AlmFeatures.get('influence').text, r = spec.results();
    const ctx = { app: 'influence', build: AlmBuildInfo, entryLog: [], verify: null };
    const rendered = AlmText.render(spec.templates, r, ctx);
    const norm = p => p.segments.map(s => s.type === 'ctx' && s.key.startsWith('build.') ? '<' + s.key + '>' : s.text).join('');
    return {
      audit: AlmText.audit(rendered, r, { ctx, dom: spec.dom() }),
      snapshot: { app: 'influence', source: 'Built-in ten-study example; intercept-only REML; supplied effect scale',
        plain: norm(rendered.plain), methods: norm(rendered.methods), results: norm(rendered.results),
        flags: rendered.flags.map(norm), references: rendered.cites.map(c => c.full) }
    };
  });
}
async function axe(page, label) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(a => !a.effect || a.effect.getComputedTiming().iterations !== Infinity)
    .map(a => a.finished.catch(() => null))));
  const r = await new AxeBuilder({ page }).include('#alm-features').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = r.violations.filter(v => ['serious', 'critical'].includes(v.impact));
  console.log(`AXE ${label}: ${bad.length} serious/critical; ${r.passes.length} rules passed`);
  expect(bad.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
}

test('ENTRY: three formats reproduce the built-in example through parser APIs and the native input', async ({ page }) => {
  await open(page);
  const original = await page.evaluate(() => ({ full: _almLastInfluence(), studies: _almStudies() }));
  expect(original.studies.map(r => [r.label, r.te, r.se])).toEqual(EXAMPLE);
  let passed = 0;
  for (const [name, input] of formats) {
    const out = await page.evaluate(input => {
      const spec = AlmFeatures.get('influence'), table = AlmEntry.parseTable(input);
      const detected = AlmEntry.detect(table, spec.entry.schema);
      // Explicit user choice for these MD fixtures: the word "or" in RevMan's
      // "Study or Subgroup" header otherwise triggers the shared ratio question.
      const converted = AlmEntry.convert(table, detected, { name: spec.entry.schema, ratio: false }, {});
      if (converted.flags.some(f => f.blocking)) return { converted, detected };
      const response = spec.entry.apply(converted.records);
      return { converted, detected, response, full: _almLastInfluence(), studies: _almStudies(), src: document.getElementById('src').value };
    }, input);
    expect(out.converted.flags.filter(f => f.blocking), name).toEqual([]);
    expect(out.detected.questions, name).toEqual([]);
    expect(out.response).toEqual({ ok: true, n: 10 });
    expect(out.studies.map(s => s.label)).toEqual(original.studies.map(s => s.label));
    expect(Math.abs(out.full.mu - original.full.mu) / Math.abs(original.full.mu), name).toBeLessThanOrEqual(1e-9);
    for (let i = 0; i < EXAMPLE.length; i++) {
      expect(out.studies[i].te).toBe(EXAMPLE[i][1]);
      expect(Math.abs(out.studies[i].se - EXAMPLE[i][2]) / EXAMPLE[i][2]).toBeLessThanOrEqual(1e-9);
    }
    if (name.startsWith('paper')) expect(out.converted.steps.filter(s => s.method === 'SE from CI')).toHaveLength(10);
    passed++;
  }
  console.log(`ENTRYRT ${passed}/${formats.length}`);
});

test('ENTRY PLANTED: reversed CI blocks application; conversion log and atomic native-input refusal', async ({ page }) => {
  await open(page);
  // Use the shared mount API, not entry UI clicks: the source-confirmation UI is developed separately.
  const out = await page.evaluate(input => {
    const spec = AlmFeatures.get('influence'), host = document.createElement('div');
    host.id = 'entry-api-check'; document.body.appendChild(host);
    const ui = AlmEntryUI.mount(host, { schema: spec.entry.schema, apply: spec.entry.apply });
    host.querySelector('textarea').value = input; ui.parse();
    const good = ui.getResult();
    const log = host.textContent;
    host.querySelector('textarea').value = 'Study\tMean difference\nBad\t0.2 (0.4–0.1)'; ui.parse();
    const bad = ui.getResult();
    const disabled = [...host.querySelectorAll('button')].find(b => b.textContent === 'Use these rows').disabled;
    const before = document.getElementById('src').value, errors = [];
    for (const records of [good.records.map((r, i) => i ? r : { ...r, sei: 0 }),
      good.records.map((r, i) => i ? r : { ...r, study: 'lost,label' }), good.records.slice(0, 2)]) {
      try { spec.entry.apply(records); errors.push('UNSAFE PASS'); } catch (e) { errors.push(e.message); }
    }
    return { good: good.steps.length, log, flags: bad.flags, disabled, errors, unchanged: before === document.getElementById('src').value };
  }, paper);
  expect(out.good).toBe(10);
  expect(out.log).toContain('Conversion log'); expect(out.log).toContain('SE estimated from CI');
  expect(out.flags.some(f => f.blocking)).toBe(true); expect(out.disabled).toBe(true);
  expect(out.errors).toHaveLength(3); expect(out.errors).not.toContain('UNSAFE PASS'); expect(out.unchanged).toBe(true);
  console.log('ENTRY PLANTED blocked; native-input refusals 3/3; conversion log 10/10');
});

test('TEXT: number audit, every displayed diagnostic and reviewed snapshot', async ({ page }, testInfo) => {
  await open(page, 'text');
  const out = await render(page);
  console.log(`TEXTAUDIT ${out.audit.passed}/${out.audit.checks} domChecked=${out.audit.domChecked}`);
  expect(out.audit.failures).toEqual([]); expect(out.audit.ok).toBe(true);
  expect(out.audit.domChecked).toBe(82);
  const text = out.snapshot.results.replace(/−/g, '-');
  const values = await page.locator('#body tr').evaluateAll(rows => rows.flatMap((r, i) =>
    i === rows.length - 1 ? r.cells[1].textContent.match(/-?\d+\.\d+/g) :
      [...r.cells].slice(1).flatMap(c => c.textContent.match(/-?\d+\.\d+/g) || [])));
  for (const value of values) expect(text).toContain(value);
  expect(values).toHaveLength(82); console.log(`TEXTDOM ${values.length}/${values.length}`);
  await testInfo.attach('text-influence.json', { body: JSON.stringify(out.snapshot, null, 2) + '\n', contentType: 'application/json' });
  expect(out.snapshot).toEqual(JSON.parse(fs.readFileSync(SNAP, 'utf8')));
  await expect(page.locator('#alm-f-panel-text .alm-text-body')).toBeVisible();
});

test('TEXT exports; planted displayed-value defect withholds text; pending edits do not rerun the app', async ({ page }) => {
  await open(page, 'text');
  const panel = page.locator('#alm-f-panel-text');
  const result = await panel.locator('[data-para=results]').textContent();
  for (const [selector, ext] of [['.alm-text-md', 'md'], ['.alm-text-docx', 'docx']]) {
    const [dl] = await Promise.all([page.waitForEvent('download'), panel.locator(selector).click()]);
    expect(dl.suggestedFilename()).toBe(`influence-report-text.${ext}`);
    const bytes = fs.readFileSync(await dl.path());
    if (ext === 'md') expect(bytes.toString('utf8')).toContain(result);
    else expect(readZip(bytes).map(e => e.name)).toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']));
  }
  await page.evaluate(() => { window.__almTextPerturb = { key: 'mu', delta: .1 }; });
  await panel.locator('.alm-text-regenerate').click();
  const audit = await page.evaluate(() => document.getElementById('alm-f-panel-text').almText.state.audit);
  expect(audit.ok).toBe(false); expect(audit.failures.map(f => f.check)).toContain('dom:mu');
  console.log(`TEXTAUDIT planted ${audit.passed}/${audit.checks} dom:mu FAIL`);
  await expect(panel.locator('.alm-text-body')).toBeHidden();
  await page.evaluate(() => { delete window.__almTextPerturb; });
  await panel.locator('.alm-text-regenerate').click();
  await expect(panel.locator('.alm-text-body')).toBeVisible();
  const before = await page.evaluate(() => _almLastInfluence());
  await page.locator('#src').fill('0.1, 0.1, A\n0.2, 0.1, B\n0.3, 0.1, C');
  await panel.locator('.alm-text-regenerate').click();
  await expect(panel.locator('.alm-text-body')).toBeHidden();
  expect(await page.evaluate(() => _almLastInfluence())).toEqual(before);
});

test('VERIFY: real webR example, plots and ZIP; current-state wording; planted defect fails', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await open(page, 'verify');
  expect(await page.evaluate(() => AlmFeatures.get('influence').verify.adapter() === AlmValidate.adapters.influence)).toBe(true);
  const panel = page.locator('#alm-f-panel-verify'), summary = panel.locator('[data-testid=verify-summary]');
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(summary).not.toBeEmpty({ timeout: 600_000 });
  expect(await summary.textContent()).toBe('177 of 177 quantities match R — PASS');
  expect(await panel.locator('td[data-result]').allTextContents()).toEqual(Array(177).fill('PASS'));
  console.log('VERIFY 177/177');
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('influence'))).toBe(true);
  await expect(panel.locator('figure img')).toHaveCount(1);
  expect(await panel.locator('figure img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(panel.locator('figure svg')).toHaveCount(1);
  await expect(panel.getByRole('region', { name: 'R script' })).toContainText('plot(influence(res)');
  await axe(page, 'verify after R');
  const [dl] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download everything (ZIP)', exact: true }).click()]);
  expect(dl.suggestedFilename()).toBe('influence-verify-in-r.zip');
  const entries = Object.fromEntries(readZip(fs.readFileSync(await dl.path())).map(e => [e.name, e.bytes]));
  for (const name of ['influence-verify.R', 'influence-verify-comparison.csv', 'sessionInfo.txt', 'console.txt', 'truthcert.json',
    'influence-influence-R-300dpi.png', 'influence-influence-R.pdf', 'influence-influence-R-300dpi.tiff']) expect(entries[name], name).toBeDefined();
  expect(Object.keys(entries).filter(n => /^influence-influence-(R|app)\.svg$/.test(n))).toHaveLength(1);
  const decode = b => new TextDecoder().decode(b);
  expect(decode(entries['influence-verify.R'])).toContain('print(sessionInfo())');
  expect(decode(entries['influence-verify-comparison.csv']).trim().split('\n')).toHaveLength(178);
  expect(decode(entries['sessionInfo.txt'])).toContain('metafor');
  expect(decode(entries['influence-influence-R.pdf'].subarray(0, 5))).toBe('%PDF-');
  const png = decodePng(entries['influence-influence-R-300dpi.png']); expect([png.width, png.height]).toEqual([2400, 2400]);
  const tif = readTiff(entries['influence-influence-R-300dpi.tiff']); expect(tif.tags[282].value).toEqual([300, 1]);
  const receipt = JSON.parse(decode(entries['truthcert.json']));
  expect(receipt.extra.results.n).toBe(177); expect(receipt.extra.results.passed).toBe(true);
  for (const f of receipt.extra.results.files) expect(f.sha256).toBe(createHash('sha256').update(entries[f.name]).digest('hex'));
  expect(await page.evaluate(r => AlmTruthCertExport.verifyContentHash(r), receipt)).toBe(true);
  console.log(`VERIFY ZIP ${Object.keys(entries).length} entries; receipt hashes PASS`);
  await page.getByRole('tab', { name: 'Report text', exact: true }).click();
  await expect(page.locator('[data-para=methods]')).toContainText('Results were independently verified in R');
  const src = await page.locator('#src').inputValue();
  await page.locator('#src').fill(src.replace('0.25', '0.26'));
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('influence'))).toBe(false);
  await page.locator('#btn-run').click();
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('[data-para=methods]')).not.toContainText('Results were independently verified in R');
  await page.locator('#src').fill(src); await page.locator('#btn-run').click();
  await page.getByRole('tab', { name: 'Verify in R', exact: true }).click();
  await page.evaluate(() => { window.__almVerifyPerturb = { key: 'full.mu', delta: .1 }; });
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(summary).toHaveText('176 of 177 quantities match R — FAIL: 1 outside tolerance or unavailable', { timeout: 600_000 });
  const failing = await panel.locator('tbody tr').evaluateAll(rows => rows.filter(r => r.querySelector('[data-result]').textContent !== 'PASS').map(r => r.dataset.key));
  expect(failing).toEqual(['full.mu']); console.log('VERIFY planted 176/177 full.mu FAIL');
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('influence'))).toBe(false);
  expect(errors).toEqual([]);
});

test('SHARE: data, axis options and provenance round trip; corrupt and invalid states change nothing', async ({ page, browser, baseURL }) => {
  await open(page, 'share');
  const baseline = await page.evaluate(() => AlmFeatures.get('influence').share.get());
  await page.locator('#src').fill(baseline.src.replace('0.25', '0.27')); await page.locator('#btn-run').click();
  await page.locator('[data-edge=min]').fill('-1'); await page.locator('[data-edge=max]').fill('2'); await page.locator('[data-edge=log]').check();
  await page.evaluate(() => { AlmFeaturesState.provenance = [{ id: 'test-source', label: 'Smith', reference: 'Example fixture', location: 'row 1', confirmed: true }]; });
  const expected = await page.evaluate(() => ({ state: AlmFeatures.get('influence').share.get(), mu: _almLastInfluence().mu, provenance: AlmFeaturesState.provenance }));
  await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
  await expect(page.locator('#alm-f-share-link')).not.toHaveValue('');
  const link = await page.locator('#alm-f-share-link').inputValue();
  const context = await browser.newContext();
  try {
    const other = await context.newPage(); await other.goto(link);
    await expect(other.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the share link.');
    expect(await other.evaluate(() => ({ state: AlmFeatures.get('influence').share.get(), mu: _almLastInfluence().mu, provenance: AlmFeaturesState.provenance }))).toEqual(expected);
  } finally { await context.close(); }
  const invalid = await page.evaluate(async state => AlmShare.encode('influence', { ...state, src: state.src.replace('0.25', '0.9'), axis: { min: '5', max: '1', log: false } }, []), baseline);
  for (const hash of ['not-valid-%%%gzip', invalid]) {
    const clean = await browser.newContext();
    try {
      const other = await clean.newPage(); await other.goto(new URL(PAGE, baseURL).href + '#s=' + hash);
      await expect(other.locator('[data-testid=share-status]')).toContainText('Nothing was changed.');
      expect(await other.evaluate(() => AlmFeatures.get('influence').share.get())).toEqual(baseline);
    } finally { await clean.close(); }
  }
  console.log('SHARE roundtrip 1/1; corrupt/invalid refusal 2/2');
});

test('AXE: every feature tab has no serious or critical violations', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await open(page);
  for (const tab of ['Data entry', 'Report text', 'Verify in R', 'Share']) {
    await page.getByRole('tab', { name: tab, exact: true }).click(); await axe(page, tab);
  }
  expect(errors).toEqual([]);
});
