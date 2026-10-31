import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readZip, readTiff, decodePng } from './zip-reader.mjs';

const APP = 'multivariate-ma', PAGE = '/' + APP + '/index.html';
const SNAP = fileURLToPath(new URL('./__snapshots__/text-multivariate-ma.json', import.meta.url));
// The page's Berkey example, preserved at its supplied precision.
const DATA = [
  [0.47, 0.0075, -0.32, 0.0077, 0.003],
  [0.20, 0.0057, -0.60, 0.0008, 0.0009],
  [0.40, 0.0021, -0.12, 0.0014, 0.0007],
  [0.26, 0.0029, -0.31, 0.0015, 0.0009],
  [0.56, 0.0148, -0.39, 0.0304, 0.0072],
];
const LONG = DATA.flatMap((r, i) => [
  [`Trial ${i + 1}`, 'PD', r[0], r[1], r[4]],
  [`Trial ${i + 1}`, 'AL', r[2], r[3], r[4]],
]);
const TSV = [['study', 'outcome', 'yi', 'vi', 'cov'], ...LONG].map(r => r.join('\t')).join('\n');
// A paper table can report both a CI and the original variance. Retaining the
// supplied variance avoids pretending rounded printed CIs recover exact inputs.
const PAPER = [['study', 'outcome', 'estimate', 'variance', 'covariance'], ...LONG.map(r => [
  r[0], r[1], `${r[2]} (${r[2] - 1.959963984540054 * Math.sqrt(r[3])}–${r[2] + 1.959963984540054 * Math.sqrt(r[3])})`, r[3], r[4],
])].map(r => r.join('  ')).join('\n');
// RevMan-style marginal rows augmented with the independently supplied
// covariance; unaugmented exports are separately tested as unavailable.
const EXPORT = [['Study or Subgroup', 'Outcome', 'Mean Difference', 'Variance', 'Covariance'], ...LONG]
  .map(r => r.join(';')).join('\n');

async function open(page, tab = 'entry') {
  await page.goto(PAGE);
  await page.waitForFunction(() => window.AlmFeatures?.get('multivariate-ma') && window._almLastMultivariate());
  await page.evaluate(tab => AlmFeatures.open('multivariate-ma', tab), tab);
}
async function currentFit(page) {
  await page.waitForFunction(() => {
    try { return !!AlmMultivariateFeatures.verify.adapter().currentState().result; }
    catch { return false; }
  });
}
async function render(page) {
  return page.evaluate(() => {
    const spec = AlmFeatures.get('multivariate-ma').text, r = spec.results();
    const ctx = { app: 'multivariate-ma', build: AlmBuildInfo, entryLog: [], verify: null };
    const text = AlmText.render(spec.templates, r, ctx), dom = spec.dom();
    const audit = AlmText.audit(text, r, { ctx, dom });
    const norm = p => p.segments.map(s => s.type === 'ctx' && s.key.startsWith('build.') ? `<${s.key}>` : s.text).join('');
    return { audit, dom, snapshot: { plain: norm(text.plain), methods: norm(text.methods), results: norm(text.results), flags: text.flags.map(norm) } };
  });
}
async function axe(page, label) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(a => !a.effect || a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => null))));
  const a = await new AxeBuilder({ page }).include('#alm-features').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = a.violations.filter(v => ['serious', 'critical'].includes(v.impact));
  console.log(`AXE ${label} ${a.passes.length} passed; ${bad.length} serious/critical`);
  expect(bad.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
}

test('PASTE PLANTED: lenient number tokens are omitted and listed, never read as another number', async ({ page }) => {
  // Number('0x10') = 16 and Number('0x0') = 0: a hexadecimal token is not a decimal estimate or variance.
  await page.goto(PAGE);
  await page.waitForFunction(() => window.AlmMvPage && typeof window.AlmMvPage.parse === 'function');
  const base = 'Trial 1, 0.47, 0.0075, -0.32, 0.0077, 0.002\nTrial 2, 0.20, 0.0057, -0.60, 0.0008, 0.001\nTrial 3, 0.40, 0.0021, -0.12, 0.0014, 0.0005';
  const parse = text => page.evaluate(t => {
    const p = window.AlmMvPage.parse(t, 'cov', NaN);
    return { k: p.rows.length, omitted: p.omitted.map(o => o.line) };
  }, text);
  for (const row of ['Trial 4, 0x0, 0.01, 0.1, 0.01, 0.001', 'Trial 4, 0x10, 0.01, 0.1, 0.01, 0.001', 'Trial 4, 0.1, 0x10, 0.1, 0.01, 0.001',
    'Trial 4, 0.1, 0.01, 0x0, 0.01, 0.001', 'Trial 4, 0.1, 0.01, 0.1, 0x10, 0.001', 'Trial 4, 0.1, 0.01, 0.1, 0.01, 0x0',
    'Trial 4, 0.1x, 0.01, 0.1, 0.01, 0.001', 'Trial 4, 0.1, 0.01, 0 1, 0.01, 0.001', 'Trial 4, 0.1, 0.01, 0.1, Infinity, 0.001']) {
    expect(await parse(base + '\n' + row), row).toEqual({ k: 3, omitted: [4] });
  }
  // Valid forms stay accepted: leading '+', exponent.
  expect(await parse(base + '\nTrial 4, +0.1, 1e-2, 0.1, 0.01, 1e-3')).toEqual({ k: 4, omitted: [] });
});

test('ENTRY: three formats through shared parse/detect/convert and apply preserve the example', async ({ page }) => {
  await open(page);
  const baseline = await page.evaluate(() => _almLastMultivariate());
  let passed = 0;
  for (const source of [TSV, PAPER, EXPORT]) {
    const out = await page.evaluate(source => {
      const entry = AlmFeatures.get('multivariate-ma').entry;
      // Adapter.convert uses AlmEntry.parseTable, detect, convert. UI selection
      // is deliberately not needed for these format equivalence checks.
      const converted = entry.convert(source);
      if (converted.flags.some(f => f.blocking) || converted.questions.length) return converted;
      const applied = entry.apply(converted.records);
      return { ...converted, applied, fit: _almLastMultivariate() };
    }, source);
    expect(out.flags.filter(f => f.blocking)).toEqual([]);
    expect(out.questions).toEqual([]);
    expect(out.applied).toEqual({ ok: true, n: 5 });
    expect(out.fit.k).toBe(baseline.k);
    for (const key of ['mu', 'muSE', 'G']) {
      const actual = out.fit[key].flat(), reference = baseline[key].flat();
      actual.forEach((x, i) => expect(Math.abs(x - reference[i])).toBeLessThanOrEqual(1e-9 * Math.abs(reference[i])));
    }
    expect(out.steps.length).toBeGreaterThan(0);
    passed++;
  }
  console.log(`ENTRYRT ${passed}/3`);
  // CI-only conversion is useful but cannot reproduce rounded source variances.
  const ciOnly = await page.evaluate(source => {
    const table = AlmEntry.parseTable(source);
    const withoutVariance = [table.header.filter((_, i) => i !== 3), ...table.rows.map(r => r.filter((_, i) => i !== 3))]
      .map(r => r.join('\t')).join('\n');
    return AlmFeatures.get('multivariate-ma').entry.convert(withoutVariance);
  }, PAPER);
  expect(ciOnly.flags.filter(f => f.blocking)).toEqual([]);
  expect(ciOnly.steps.some(s => s.method === 'SE from CI')).toBe(true);
  ciOnly.records.forEach((r, i) => expect(Math.abs(r.vi - LONG[i][3])).toBeLessThan(1e-10));
  const replay = await page.evaluate(record => {
    const p = { ...record, label: 'Berkey 1998', reference: 'Berkey et al. 1998', location: 'Example',
      source: { type: 'Table', detail: 'Example' }, choice: { randomisation: 'not stated' } };
    AlmEntry.provenance.confirm(p, { by: 'QA', via: 'row' });
    const entry = AlmFeatures.get('multivariate-ma').entry;
    const clean = entry.validateProvenance(p);
    p.conversions.find(c => c.method === 'variance = SE squared').output += 0.01;
    return { clean, planted: entry.validateProvenance(p) };
  }, ciOnly.records[0]);
  expect(replay.clean).toEqual([]);
  expect(replay.planted).toContain('variance conversion replay');
});

test('ENTRY: apply completes the fit synchronously and uses supplied covariance in every input mode', async ({ page }) => {
  await open(page);
  const baseline = await page.evaluate(() => _almLastMultivariate());
  for (const mode of ['r', 'rhoW']) {
    await page.locator('#f-mode').selectOption(mode);
    const result = await page.evaluate(source => {
      const entry = AlmMultivariateFeatures.entry;
      const applied = entry.apply(entry.convert(source).records);
      return { applied, current: AlmMultivariateFeatures.verify.adapter().currentState().result,
        mode: AlmMvPage.getMode(), text: AlmMultivariateFeatures.text.results() };
    }, TSV);
    expect(result.applied).toEqual({ ok: true, n: 5 });
    expect(result.mode).toBe('cov');
    expect(result.current).toEqual(baseline);
    expect(result.text).not.toBeNull();
  }
});

test('ENTRY: confirmation, conversion log and blocking covariance gate; planted row cannot change results', async ({ page }) => {
  await open(page);
  const panel = page.locator('#alm-f-panel-entry'), use = panel.getByRole('button', { name: 'Use these rows', exact: true });
  await panel.getByLabel('Paired outcome table', { exact: true }).fill(TSV);
  await panel.getByRole('button', { name: 'Preview and convert' }).click();
  await expect(panel.getByTestId('entry-log')).toContainText('retained as supplied');
  await expect(use).toBeDisabled();
  await panel.getByLabel('Your initials', { exact: true }).fill('QA');
  for (const fieldset of await panel.locator('fieldset').all()) {
    await fieldset.getByLabel('Source author and year').fill('Berkey 1998');
    await fieldset.getByLabel('Full reference').fill('Berkey et al. 1998, Stat Med');
    await fieldset.getByLabel('Source location').fill('Example data');
    await fieldset.getByLabel('Timepoint (or not stated)').fill('not stated');
    await expect(fieldset.getByLabel('I confirm this outcome row')).toBeDisabled();
    await fieldset.getByLabel('Source type', { exact: true }).selectOption('Table');
    await fieldset.getByLabel('What was randomised?', { exact: true }).selectOption('not stated');
    await fieldset.getByLabel('I confirm this outcome row').check();
  }
  await expect(use).toBeEnabled();
  // Changing the extractor invalidates every prior confirmation.
  await panel.getByLabel('Your initials', { exact: true }).fill('QC');
  await expect(use).toBeDisabled();
  for (const fieldset of await panel.locator('fieldset').all()) {
    await expect(fieldset.getByLabel('I confirm this outcome row')).not.toBeChecked();
    await fieldset.getByLabel('I confirm this outcome row').check();
  }
  await expect(use).toBeEnabled();
  await use.click();
  await expect(panel.getByRole('status')).toHaveText('Applied 5 complete studies.');
  expect(await page.evaluate(() => AlmFeaturesState.provenance.length)).toBe(10);
  expect(await page.evaluate(() => AlmFeaturesState.provenance.every(p =>
    p.values.length >= 3 && p.values.every(v => p.pastedText.slice(...v.span) === v.text)))).toBe(true);
  expect(await page.evaluate(() => AlmFeaturesState.provenance.flatMap(p =>
    AlmMultivariateFeatures.entry.validateProvenance(p)))).toEqual([]);
  expect(await page.evaluate(() => AlmFeaturesState.provenance.every(p =>
    p.source.type === 'Table' && p.confirmedBy === 'QC' && p.confirmedVia === 'row' &&
    p.sourceHash === AlmEntry.sha256(p.pastedText) && p.choice.randomisation === 'not stated'))).toBe(true);
  const before = await page.locator('#stats').innerText();
  const planted = TSV.replaceAll('\t0.003\n', '\t1\n');
  await panel.getByLabel('Paired outcome table', { exact: true }).fill(planted);
  await panel.getByRole('button', { name: 'Preview and convert' }).click();
  await expect(panel).toContainText('positive definite');
  await expect(use).toBeDisabled();
  const refusal = await page.evaluate(source => {
    const e = AlmFeatures.get('multivariate-ma').entry, c = e.convert(source);
    try { e.apply(c.records); return false; } catch { return true; }
  }, planted);
  expect(refusal).toBe(true);
  expect(await page.locator('#stats').innerText()).toBe(before);
  const missing = await page.evaluate(source => {
    const table = AlmEntry.parseTable(source);
    return AlmFeatures.get('multivariate-ma').entry.convert([table.header.slice(0, -1), ...table.rows.map(r => r.slice(0, -1))]
      .map(r => r.join('\t')).join('\n'));
  }, TSV);
  expect(missing.flags.some(f => f.blocking && /cov/.test(f.text))).toBe(true);
  console.log('ENTRY planted covariance BLOCK; missing covariance BLOCK; confirmation gate PASS');
  await axe(page, 'entry');
});

test('TEXT: number audit, independent displayed values, snapshot and exports', async ({ page }, info) => {
  await open(page, 'text');
  const out = await render(page);
  console.log(`TEXTAUDIT ${out.audit.passed}/${out.audit.checks} domChecked=${out.audit.domChecked}`);
  expect(out.audit.ok, JSON.stringify(out.audit.failures)).toBe(true);
  expect(out.audit.domChecked).toBeGreaterThanOrEqual(3);
  const cards = await page.locator('#stats .v').allTextContents();
  const text = out.snapshot.results.replaceAll('−', '-');
  for (const value of [cards[0].split(' ')[0], cards[1].split(' ')[0], cards[2], cards[3], cards[4]]) expect(text).toContain(value);
  console.log('TEXTDOM 5/5');
  fs.writeFileSync(info.outputPath('text-multivariate-ma.actual.json'), JSON.stringify(out.snapshot, null, 2) + '\n');
  expect(out.snapshot).toEqual(JSON.parse(fs.readFileSync(SNAP, 'utf8')));
  const panel = page.locator('#alm-f-panel-text');
  await expect(panel.locator('.alm-text-body')).toBeVisible();
  const [md] = await Promise.all([page.waitForEvent('download'), panel.locator('.alm-text-md').click()]);
  expect(fs.readFileSync(await md.path(), 'utf8')).toContain(out.snapshot.results);
  const [doc] = await Promise.all([page.waitForEvent('download'), panel.locator('.alm-text-docx').click()]);
  const files = readZip(fs.readFileSync(await doc.path()));
  expect(files.map(f => f.name)).toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']));
  await axe(page, 'text');
});

test('TEXT PLANTED: changed pooled result fails DOM audit and withholds report', async ({ page }) => {
  await open(page, 'text');
  await page.evaluate(() => { window.__almTextPerturb = { key: 'mua', delta: 0.01 }; });
  const out = await render(page);
  expect(out.audit.ok).toBe(false);
  expect(out.audit.failures.map(f => f.check)).toContain('dom:mua');
  console.log(`TEXTAUDIT planted ${out.audit.passed}/${out.audit.checks} FAIL dom:mua`);
  await page.locator('#alm-f-panel-text .alm-text-regenerate').click();
  await expect(page.locator('#alm-f-panel-text .alm-text-status')).toContainText('Number audit failed');
  await expect(page.locator('#alm-f-panel-text .alm-text-body')).toBeHidden();
});

test('VERIFY: real browser R, joint plot, ZIP and planted estimate', async ({ page }) => {
  test.setTimeout(900_000);
  await open(page, 'verify');
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const panel = page.locator('#alm-f-panel-verify'), summary = panel.getByTestId('verify-summary');
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(summary).not.toBeEmpty({ timeout: 600_000 });
  const status = await summary.textContent();
  if (status.includes('unavailable')) {
    expect(status).toContain('R package mvmeta is unavailable');
    expect(await page.evaluate(() => AlmFeaturesState.verify.passed)).toBe(false);
    await expect(panel.getByRole('button', { name: 'R script (.R)', exact: true })).toBeVisible();
    await expect(panel.locator('tbody td[data-result]')).toHaveCount(0);
    console.log('VERIFY unavailable: mvmeta; no pass claimed');
    return;
  }
  expect(status).toBe('10 of 10 computed quantities match R; 0 not computed — PASS');
  const state = await page.evaluate(() => AlmFeaturesState.verify);
  console.log(`VERIFY ${state.nPassed}/${state.n} ${JSON.stringify(state.versions)}`);
  expect({ passed: state.passed, n: state.n, nPassed: state.nPassed, nNotComputed: state.nNotComputed,
    nOptional: state.nOptional, nNotApplicable: state.nNotApplicable, testHook: state.testHook })
    .toEqual({ passed: true, n: 10, nPassed: 10, nNotComputed: 0, nOptional: 0, nNotApplicable: 0, testHook: false });
  expect(state.rows.filter(r => !r.pass)).toEqual([]);
  await expect(panel.locator('figure svg')).toHaveCount(1);
  await expect(panel.locator('figure img')).toHaveCount(1);
  const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download everything (ZIP)', exact: true }).click()]);
  const entries = Object.fromEntries(readZip(fs.readFileSync(await download.path())).map(e => [e.name, e.bytes]));
  const expected = [`${APP}-verify.R`, `${APP}-verify-comparison.csv`, 'sessionInfo.txt', 'console.txt',
    `${APP}-joint-R-300dpi.png`, `${APP}-joint-R.pdf`, `${APP}-joint-R-300dpi.tiff`, 'truthcert.json'];
  for (const name of expected) expect(entries[name], name).toBeDefined();
  expect(Object.keys(entries).some(n => /joint-(R|app)\.svg/.test(n))).toBe(true);
  const png = decodePng(entries[`${APP}-joint-R-300dpi.png`]);
  expect([png.width, png.height]).toEqual([2400, 1800]);
  const tiff = readTiff(entries[`${APP}-joint-R-300dpi.tiff`]);
  expect(tiff.tags[282].value).toEqual([300, 1]);
  const receipt = JSON.parse(new TextDecoder().decode(entries['truthcert.json']));
  expect(receipt.extra.results.passed).toBe(true);
  expect(await page.evaluate(r => AlmTruthCertExport.verifyContentHash(r), receipt)).toBe(true);
  console.log(`ZIP ${Object.keys(entries).length} entries; PNG/PDF/TIFF/SVG and receipt present`);
  await axe(page, 'verify');
  await page.evaluate(() => {
    const url = new URL(location.href); url.searchParams.set('almtest', '1');
    history.replaceState(null, '', url);
    window.__almVerifyPerturb = { key: 'mu1', delta: 0.01 };
  });
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(summary).toHaveText('TEST MODE (test hook active; not a verification) — 9 of 10 computed quantities match R; 0 not computed — FAIL: 1 not matching R; test hook active', { timeout: 600_000 });
  expect(await page.evaluate(() => AlmFeaturesState.verify.rows.filter(r => !r.pass).map(r => r.key))).toEqual(['mu1']);
  expect(await page.evaluate(() => ({ passed: AlmFeaturesState.verify.passed, testHook: AlmFeaturesState.verify.testHook,
    perturbed: AlmFeaturesState.verify.perturbed }))).toEqual({ passed: false, testHook: true, perturbed: { key: 'mu1', delta: 0.01 } });
  console.log('VERIFY planted 9/10 FAIL mu1');
  expect(errors).toEqual([]);
});

test('SHARE: full data and outcome names round trip; corrupted and malformed states change nothing', async ({ page, context }) => {
  await open(page, 'share');
  const original = await page.locator('#f-data').inputValue();
  await page.locator('#f-data').fill(original.replace('0.47', '0.48'));
  await page.locator('#f-o1').fill('PD change');
  await page.locator('#f-o2').fill('AL change');
  await currentFit(page);
  await page.evaluate(() => {
    AlmFeaturesState.provenance = [{ label: 'Berkey 1998', reference: 'Berkey et al. 1998',
      location: 'Example', pastedText: '0.48', choice: { outcome: 'PD change', timepoint: 'not stated' },
      values: [{ field: 'yi', value: 0.48, span: [0, 4], text: '0.48' }], conversions: [], flags: [], confirmed: true }];
    AlmFeaturesState.entryLog = [{ text: 'Explicit supplied effect.', method: 'direct input', citation: 'User-supplied data' }];
  });
  const before = await page.evaluate(() => ({ data: AlmFeatures.get('multivariate-ma').share.get(),
    fit: _almLastMultivariate(), provenance: AlmFeaturesState.provenance }));
  await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
  const link = await page.getByLabel('Share link', { exact: true }).inputValue();
  expect(link).toContain('#s=');
  const next = await context.newPage();
  await next.goto(link);
  await expect(next.getByTestId('share-status')).toHaveText('Analysis restored from the share link.');
  expect(await next.evaluate(() => ({ data: AlmFeatures.get('multivariate-ma').share.get(),
    fit: _almLastMultivariate(), provenance: AlmFeaturesState.provenance }))).toEqual(before);
  await next.locator('#f-o1').fill('Edited after restore');
  expect(await next.evaluate(() => [AlmFeaturesState.provenance, AlmFeaturesState.entryLog])).toEqual([[], []]);
  const broken = await context.newPage();
  await broken.goto(link.slice(0, -10));
  await expect(broken.getByTestId('share-status')).toContainText('Nothing was changed.');
  expect(await broken.locator('#f-data').inputValue()).toBe(original);
  const malformed = await page.evaluate(async () => AlmShare.encode('multivariate-ma', { src: 'bad', names: ['only one'] }, []));
  await broken.goto(link.split('#')[0] + '#s=' + malformed);
  await expect(broken.getByTestId('share-status')).toContainText('Nothing was changed.');
  expect(await broken.locator('#f-data').inputValue()).toBe(original);
  console.log('SHARE round trip PASS; corrupted and malformed links refused');
  await axe(page, 'share');
});

test('missing app result is withheld; adapter reads the fit without refitting', async ({ page }) => {
  await open(page, 'text');
  const n = await page.evaluate(() => {
    const a = AlmFeatures.get('multivariate-ma').verify.adapter();
    AlmMultivariate.fit = () => { throw Error('Unexpected refit'); };
    return a.appValues(a.currentState()).length;
  });
  expect(n).toBe(10);
  await page.locator('#f-data').fill('');
  expect(await page.evaluate(() => AlmMultivariateFeatures.text.results())).toBeNull();
  await page.locator('#alm-f-panel-text .alm-text-regenerate').click();
  await expect(page.locator('#alm-f-panel-text .alm-text-status')).toHaveText('Run the analysis first.');
});

test('TEXT: edited nonempty input is withheld during debounce and accepted after the new fit', async ({ page }) => {
  await open(page, 'text');
  const pending = await page.evaluate(() => {
    const before = _almLastMultivariate(), input = document.getElementById('f-data');
    input.value = input.value.replace('0.47', '0.48');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // Check in the input's own task, before the page's 250 ms debounce can run.
    return { retainedFit: _almLastMultivariate() === before, before,
      text: AlmMultivariateFeatures.text.results() };
  });
  expect(pending.retainedFit).toBe(true);
  expect(pending.text).toBeNull();
  await currentFit(page);
  expect(await page.evaluate(() => _almLastMultivariate().mu)).not.toEqual(pending.before.mu);
  await page.locator('#alm-f-panel-text .alm-text-regenerate').click();
  await expect(page.locator('#alm-f-panel-text .alm-text-status')).toHaveText('Text generated from the current results.');
  expect((await render(page)).audit.ok).toBe(true);
});

test('REVIEW: decimal choice preserves comma source and requires fresh confirmation', async ({ page }) => {
  await open(page);
  const panel = page.locator('#alm-f-panel-entry'), source = TSV.replaceAll('.', ',');
  const paste = panel.getByLabel('Paired outcome table', { exact: true });
  const use = panel.getByRole('button', { name: 'Use these rows', exact: true });
  await paste.fill(source);
  await panel.getByRole('button', { name: 'Preview and convert' }).click();
  await expect(use).toBeDisabled();
  await panel.getByLabel('Decimal mark for this paste', { exact: true }).selectOption('comma');
  await expect(panel.locator('fieldset')).toHaveCount(10);
  await expect(panel.locator('mark').filter({ hasText: '0,0075' })).toHaveCount(1);
  await panel.getByLabel('Your initials', { exact: true }).fill('QA');
  for (const box of await panel.locator('fieldset').all()) {
    await box.getByLabel('Source author and year').fill('Smith 2020');
    await box.getByLabel('Full reference').fill('Smith et al.');
    await box.getByLabel('Source location').fill('Table 1');
    await box.getByLabel('Timepoint (or not stated)').fill('not stated');
    await box.getByLabel('Source type', { exact: true }).selectOption('Table');
    await box.getByLabel('What was randomised?', { exact: true }).selectOption('not stated');
    await box.getByLabel('I confirm this outcome row').check();
  }
  await expect(use).toBeEnabled(); await use.click();
  const saved = await page.evaluate(() => ({ provenance: AlmFeaturesState.provenance,
    errors: AlmFeaturesState.provenance.flatMap(p => AlmMultivariateFeatures.entry.validateProvenance(p)) }));
  expect(saved.errors).toEqual([]);
  expect(saved.provenance[0].pastedText).toBe(source.split('\n')[1]);
  expect(saved.provenance[0].decimal).toBe('comma');
  await paste.fill(source.replace('0,47', '0,48'));
  await expect(use).toBeDisabled(); await expect(panel.locator('fieldset')).toHaveCount(0);
  await expect(panel.getByLabel('Decimal mark for this paste', { exact: true })).toHaveValue('point');
});

test('REVIEW: CI questions can be answered without editing the source', async ({ page }) => {
  await open(page);
  const panel = page.locator('#alm-f-panel-entry');
  const source = [['study', 'outcome', 'yi', 'cov'], ...LONG.map(r => [r[0], r[1], '0.5 (0.7 to 0.3)', 0.001])]
    .map(r => r.join('\t')).join('\n');
  await panel.getByLabel('Paired outcome table', { exact: true }).fill(source);
  await panel.getByRole('button', { name: 'Preview and convert' }).click();
  for (let i = 0; i < 10; i++) await panel.getByLabel(/swap the lower and upper CI bounds/).first().selectOption('swap');
  await expect(panel.locator('fieldset')).toHaveCount(10);
  await expect(panel.getByRole('status')).toContainText('confirm the source');
  await expect(panel.getByTestId('entry-log')).toContainText('User confirmed swapping');
  await expect(panel.locator('.alm-entry-source').first()).toHaveText(source.split('\n')[1]);
  await expect(panel.getByRole('button', { name: 'Use these rows', exact: true })).toBeDisabled();
});

test('REVIEW: blocked preview announces the reason for disabled apply', async ({ page }) => {
  await open(page);
  const panel = page.locator('#alm-f-panel-entry');
  await panel.getByLabel('Paired outcome table', { exact: true }).fill(TSV.replaceAll('0.003', '1'));
  await panel.getByRole('button', { name: 'Preview and convert' }).click();
  await expect(panel.getByRole('status')).toContainText('Preview blocked:');
  await expect(panel.getByRole('status')).toContainText('positive definite');
  await expect(panel.getByRole('alert')).toContainText('positive definite');
  await expect(panel.getByRole('button', { name: 'Use these rows', exact: true })).toHaveAttribute('aria-describedby', 'mv-entry-status');
  await expect(panel.locator('fieldset')).toHaveCount(0);
});

test('REVIEW: supplied SE is checked at printed precision and retained in provenance', async ({ page }) => {
  await open(page);
  const out = await page.evaluate(rows => {
    const make = se => [['study', 'outcome', 'yi', 'vi', 'cov', 'se'], ...rows.map(r => [...r, se ?? Math.sqrt(r[3]).toFixed(4)])]
      .map(r => r.join('\t')).join('\n');
    return { clean: AlmMultivariateFeatures.entry.convert(make()),
      bad: ['0.1', '0', '-0.0866', 'invalid'].map(se => AlmMultivariateFeatures.entry.convert(make(se))) };
  }, LONG);
  expect(out.clean.flags.filter(f => f.blocking)).toEqual([]);
  expect(out.clean.records[0].vi).toBe(0.0075);
  expect(out.clean.records[0].values.find(v => v.field === 'sei').text).toBe('0.0866');
  for (const bad of out.bad) expect(bad.flags.some(f => f.blocking && /SE.*(variance|positive|finite)/i.test(f.text))).toBe(true);
});

test('REVIEW: signed-zero confidence limits retain the report and changed limits fail audit', async ({ page }) => {
  await open(page, 'text');
  await page.evaluate(() => {
    const card = document.querySelector('#stats .v');
    card.textContent = card.textContent.replace(/\[[-\d.]+,/, '[-0.000,');
  });
  expect((await render(page)).audit.ok).toBe(true);
  const panel = page.locator('#alm-f-panel-text');
  await panel.locator('.alm-text-regenerate').click();
  await expect(panel.locator('.alm-text-body')).toBeVisible();
  await page.evaluate(() => { window.__almTextPerturb = { key: 'loa', delta: 0.001 }; });
  expect((await render(page)).audit.failures.map(f => f.check)).toContain('dom:loa');
  await panel.locator('.alm-text-regenerate').click();
  await expect(panel.locator('.alm-text-body')).toBeHidden();
});

test('REVIEW: natural-ratio intervals get a scale-neutral no-effect caveat', async ({ page }) => {
  await open(page, 'text');
  await page.locator('#f-data').fill(DATA.map((_, i) => `Trial ${i + 1}, 1, 0.01, 1, 0.01, 0.003`).join('\n'));
  await currentFit(page);
  const out = await render(page);
  expect(out.audit.ok).toBe(true);
  expect(out.snapshot.plain).toContain('no-effect value for the supplied scale');
  expect(out.snapshot.plain).toContain('not evidence of no difference');
  expect(out.snapshot.plain).not.toContain('An interval includes no effect');
});
