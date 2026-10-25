import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readZip, decodePng, readTiff } from './zip-reader.mjs';

const APP = 'cumulative-subgroup';
const PAGE = '/' + APP + '/index.html';
const SNAP = new URL('./__snapshots__/text-cumulative-subgroup.json', import.meta.url);
async function open(page, search = '') {
  await page.goto(PAGE + search);
  await expect(page.locator('#alm-features .alm-f-toggle')).toBeVisible();
  await page.locator('#btn-example').click();
}
async function tab(page, key) { await page.evaluate(key => AlmFeatures.open('cumulative-subgroup', key), key); }
async function example(page) {
  return page.evaluate(() => {
    let a; alm.urlState.withoutWrites(() => { a = __almCumSubValidationRun(); });
    return a.parsed.studies;
  });
}
function formats(rows) {
  // Wald limits carry full precision: rounded paper intervals cannot reproduce an SE
  // to 1e-9 and must not be presented as if they did. These are synthetic layouts of
  // the built-in example, not claims about an actual vendor's extraction output.
  const z = 1.959963984540054;
  return [
    ['Excel TSV', ['study\testimate\tSE\tyear\tsubgroup', ...rows.map(r => [r.label, r.est, r.se, r.year, r.group].join('\t'))].join('\n'), { 'measure:type': 'difference' }],
    ['paper intervals', ['study  estimate  year  subgroup', ...rows.map(r =>
      `${r.label}  ${r.est} (${r.est - z * r.se} to ${r.est + z * r.se})  ${r.year}  ${r.group}`)].join('\n'), { 'measure:type': 'difference' }],
    ['RevMan-style generic inverse variance export', ['Study or Subgroup\tlog OR\tSE\tyear\tsubgroup', ...rows.map(r => [r.label, r.est, r.se, r.year, r.group].join('\t'))].join('\n'), {}]
  ];
}
async function convert(page, source, apply = true, answers = {}) {
  return page.evaluate(({ source, apply, answers }) => {
    const spec = AlmFeatures.get('cumulative-subgroup').entry;
    const table = AlmEntry.parseTable(source), detection = AlmEntry.detect(table, spec.schema);
    // Explicit passthrough-column decisions (the entry UI offers the same choices).
    (table.header || []).forEach((h, i) => {
      if (spec.extras.includes(h)) { detection.mapping[i] = h; detection.questions = detection.questions.filter(q => q.id !== 'column:' + i); }
    });
    const out = AlmEntry.convert(table, detection, spec.schema, answers);
    const blocking = out.flags.filter(f => f.blocking);
    let applied = null;
    if (apply && !blocking.length) {
      applied = spec.apply(out.records);
      AlmFeaturesState.entryLog = out.steps;
    }
    return { ...out, blocking, applied, result: _almLastCumSub(), source: document.getElementById('f-data').value };
  }, { source, apply, answers });
}
test('ENTRY: three example layouts round trip through the parsing APIs in both views', async ({ page }) => {
  await open(page);
  const rows = await example(page), inputs = formats(rows);
  let passed = 0;
  for (const view of ['cumulative', 'subgroup']) {
    await page.locator('#btn-example').click();
    await page.locator('#f-view').selectOption(view);
    const expected = await page.evaluate(() => _almLastCumSub());
    for (const [name, source, answers] of inputs) {
      // These synthetic estimates/intervals stay on the supplied analysis scale.
      // An unlabeled effect must fail closed until the measure choice is explicit.
      const before = await page.locator('#f-data').inputValue();
      const unanswered = answers['measure:type'] ? await convert(page, source) : null;
      if (unanswered) {
        expect(unanswered.blocking.some(f => f.questionId === 'measure:type')).toBe(true);
        expect(unanswered.applied).toBeNull();
        expect(unanswered.source).toBe(before);
      }
      const out = await convert(page, source, true, answers);
      expect(out.blocking, name + JSON.stringify(out.flags)).toEqual([]);
      expect(out.questions.map(q => q.id)).toEqual(Object.keys(answers));
      if (answers['measure:type']) expect(out.steps.some(s => s.text === 'Effect measure confirmed as a difference')).toBe(true);
      expect(out.applied).toEqual({ ok: true, n: rows.length });
      expect(out.result.k).toBe(expected.k);
      const key = view === 'cumulative' ? 'mu_final' : 'overall_mu';
      expect(Math.abs(out.result[key] - expected[key]) / Math.abs(expected[key]), name).toBeLessThanOrEqual(1e-9);
      const parsed = await example(page);
      expect(parsed.map(r => [r.label, r.year, r.group])).toEqual(rows.map(r => [r.label, r.year, r.group]));
      if (name === 'paper intervals') expect(out.steps.filter(s => /SE estimated from CI/.test(s.text))).toHaveLength(rows.length);
      passed++;
    }
  }
  console.log(`ENTRYRT ${passed}/6 rows=${rows.length}`);
});

test('ENTRY PLANTED: reversed CI blocks use; conversion log is visible; invalid apply is atomic', async ({ page }) => {
  await open(page);
  const before = await page.locator('#f-data').inputValue();
  const bad = 'study\testimate\tyear\tsubgroup\nBad\t-0.2 (0.4 to -0.8)\t2020\tA';
  const out = await convert(page, bad);
  expect(out.blocking.some(f => f.code === 'ci-order')).toBe(true);
  expect(out.applied).toBeNull();
  expect(out.source).toBe(before);
  // Exercise the production entry panel, including its app-local conversion log.
  await tab(page, 'entry');
  await page.getByLabel('Paste the exact paper text or table', { exact: true }).fill(bad);
  await page.getByRole('button', { name: 'Extract candidates', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Use these rows', exact: true })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Conversion log', exact: true })).toBeVisible();
  await expect(page.locator('#alm-f-panel-entry .alm-entry-block')).not.toHaveCount(0);
  const rejected = await page.evaluate(() => {
    const apply = AlmFeatures.get('cumulative-subgroup').entry.apply;
    return [
      [{ study: 'A', yi: 0.2, sei: 0 }],
      [{ study: 'A', yi: 0.2, sei: 0.1, year: '2020junk' }]
    ].map(rows => { try { apply(rows); return false; } catch { return true; } });
  });
  expect(rejected).toEqual([true, true]);
  expect(await page.locator('#f-data').inputValue()).toBe(before);
  console.log('ENTRY PLANTED blocking=yes disabled=yes atomic=2/2');
});

async function text(page) {
  return page.evaluate(() => {
    const spec = AlmFeatures.get('cumulative-subgroup').text, r = spec.results();
    const ctx = { app: 'cumulative-subgroup', build: AlmBuildInfo, entryLog: [], verify: null };
    const rendered = AlmText.render(spec.templates, r, ctx);
    const audit = AlmText.audit(rendered, r, { ctx, dom: spec.dom() });
    const norm = p => p.segments.map(s => s.type === 'ctx' && s.key.startsWith('build.') ? '<' + s.key + '>' : s.text).join('');
    return { r, audit, results: rendered.results.text,
      snapshot: { plain: norm(rendered.plain), methods: norm(rendered.methods), results: norm(rendered.results), flags: rendered.flags.map(norm), references: rendered.cites.map(c => c.full) } };
  });
}
test('TEXT: audits and displayed precision pass in both views and match the snapshot', async ({ page }, info) => {
  await open(page);
  const snapshots = { app: APP, source: 'Built-in example; default title and axes; both views' };
  for (const view of ['cumulative', 'subgroup']) {
    await page.locator('#f-view').selectOption(view);
    const out = await text(page);
    console.log(`TEXTAUDIT ${out.audit.passed}/${out.audit.checks} view=${view} dom=${out.audit.domChecked}`);
    expect(out.audit.failures).toEqual([]);
    expect(out.audit.ok).toBe(true);
    expect(out.audit.domChecked).toBeGreaterThanOrEqual(5);
    const pooled = await page.locator('#stats-wrap .stat').filter({ hasText: view === 'cumulative' ? 'Final pooled' : 'Overall pooled' }).locator('.v').textContent();
    const [mu, lo, hi] = pooled.match(/-?\d+\.\d+/g);
    expect(out.results.replace(/−/g, '-')).toContain(`was ${mu} (95% CI ${lo} to ${hi})`);
    snapshots[view] = out.snapshot;
    await tab(page, 'text');
    await expect(page.locator('#alm-f-panel-text .alm-text-body')).toBeVisible();
  }
  const actual = info.outputPath('text-cumulative-subgroup.json');
  writeFileSync(actual, JSON.stringify(snapshots, null, 2) + '\n');
  await info.attach('text snapshot', { path: actual, contentType: 'application/json' });
  expect(snapshots).toEqual(JSON.parse(readFileSync(SNAP, 'utf8')));
});

test('TEXT PLANTED: changed DOM-cross-checked estimate fails and withholds text', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.__almTextPerturb = { key: 'mu', delta: 0.1 }; });
  const out = await text(page);
  expect(out.audit.ok).toBe(false);
  expect(out.audit.failures.map(f => f.check)).toContain('dom:mu');
  console.log(`TEXTAUDIT PLANTED ${out.audit.passed}/${out.audit.checks} dom:mu=FAIL`);
  await tab(page, 'text');
  await expect(page.locator('.alm-text-status')).toContainText('Number audit failed');
  await expect(page.locator('.alm-text-body')).toBeHidden();
  await page.evaluate(() => { delete window.__almTextPerturb; });
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-body')).toBeVisible();
  const [md] = await Promise.all([page.waitForEvent('download'), page.locator('.alm-text-md').click()]);
  expect(readFileSync(await md.path(), 'utf8')).toContain('## Results');
  const [dx] = await Promise.all([page.waitForEvent('download'), page.locator('.alm-text-docx').click()]);
  expect(readZip(readFileSync(await dx.path())).map(x => x.name)).toContain('word/document.xml');
  await page.locator('#btn-reset').click();
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-status')).toHaveText('Run the analysis first.');
  console.log('TEXT EXPORT md/docx=2/2 empty-state=PASS');
});

for (const view of ['cumulative', 'subgroup']) test(`VERIFY: ${view} real webR, downloads, stale state and planted defect`, async ({ page }) => {
  test.setTimeout(900000);
  await open(page, '?almtest=1');
  await page.locator('#f-view').selectOption(view);
  await tab(page, 'verify');
  const panel = page.locator('#alm-f-panel-verify'), summary = panel.locator('[data-testid=verify-summary]');
  const run = () => panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await run();
  await expect(summary).not.toBeEmpty({ timeout: 600000 });
  // metafor is pinned and available: an unavailable-package or runtime error must fail.
  const summaryText = await summary.textContent();
  const m = /^(\d+) of (\d+) computed quantities match R; 0 not computed(?:; (\d+) not applicable)? — PASS$/.exec(summaryText);
  expect(m, summaryText).not.toBeNull();
  // The first cumulative pool has k=1: both engines leave its PI undefined.
  // Retain all original rows, and require every other value to match R.
  const notApplicable = view === 'cumulative' ? ['step.1.piLo', 'step.1.piHi'] : [];
  const n = Number(m[2]);
  expect(Number(m[1])).toBe(n);
  expect(Number(m[3] || 0)).toBe(notApplicable.length);
  expect(n + notApplicable.length).toBe(view === 'cumulative' ? 151 : 58);
  console.log(`VERIFY ${n}/${n} view=${view}`);
  await expect(panel.locator('td[data-result]')).toHaveCount(n + notApplicable.length);
  expect(await panel.locator('td[data-result=pass]').allTextContents()).toEqual(Array(n).fill('PASS'));
  expect(await panel.locator('tbody tr').evaluateAll(rows => rows.filter(tr => tr.querySelector('td[data-result]').dataset.result !== 'pass')
    .map(tr => ({ key: tr.dataset.key, result: tr.querySelector('td[data-result]').textContent })))).toEqual(
      notApplicable.map(key => ({ key, result: 'NOT APPLICABLE for this analysis' })));
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('cumulative-subgroup'))).toBe(true);
  expect(await page.evaluate(() => AlmFeaturesState.verify.testHook)).toBe(false);
  await expect(panel.locator('figure img')).toHaveCount(1);
  await expect(panel.locator('figure svg')).toHaveCount(1);
  const [zip] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download everything (ZIP)', exact: true }).click()]);
  const files = Object.fromEntries(readZip(readFileSync(await zip.path())).map(e => [e.name, e.bytes]));
  const decode = bytes => new TextDecoder().decode(bytes);
  expect(Object.keys(files)).toEqual(expect.arrayContaining([
    APP + '-verify.R', APP + '-verify-comparison.csv', 'sessionInfo.txt', 'console.txt', 'truthcert.json',
    APP + '-forest-R.pdf', APP + '-forest-R-300dpi.png', APP + '-forest-R-300dpi.tiff'
  ]));
  expect(Object.keys(files).filter(n => /-forest-(R|app)\.svg$/.test(n))).toHaveLength(1);
  expect(decode(files[APP + '-verify.R'])).toContain(view === 'cumulative' ? 'metafor::cumul' : 'fits_plot');
  expect(decode(files['sessionInfo.txt'])).toContain('metafor');
  expect(decode(files[APP + '-forest-R.pdf'].subarray(0, 5))).toBe('%PDF-');
  const png = decodePng(files[APP + '-forest-R-300dpi.png']);
  expect([png.width, png.height]).toEqual([2400, 1800]);
  const tif = readTiff(files[APP + '-forest-R-300dpi.tiff']);
  expect(tif.tags[282].value).toEqual([300, 1]);
  const receipt = JSON.parse(decode(files['truthcert.json']));
  expect(receipt.extra.results.passed).toBe(true);
  expect(receipt.extra.results.n).toBe(n);
  expect(receipt.extra.results.nPassed).toBe(n);
  expect(receipt.extra.results.nNotComputed).toBe(0);
  expect(receipt.extra.results.nOptional).toBe(0);
  expect(receipt.extra.results.nNotApplicable).toBe(notApplicable.length);
  expect(receipt.extra.results.testHook).toBe(false);
  for (const f of receipt.extra.results.files) expect(f.sha256).toBe(createHash('sha256').update(files[f.name]).digest('hex'));
  expect(await page.evaluate(r => AlmTruthCertExport.verifyContentHash(r), receipt)).toBe(true);
  console.log(`VERIFY ZIP ${Object.keys(files).length} entries; receipt=PASS graphics=PASS`);
  await tab(page, 'text');
  await expect(page.locator('[data-para=methods]')).toContainText('independently verified in R');
  await expect(page.locator('[data-para=methods]')).toContainText(view === 'cumulative'
    ? '140 statistical quantities matched R; 9 page self-checks passed'
    : '50 statistical quantities matched R; 8 page self-checks passed');
  const original = await page.locator('#f-data').inputValue();
  await page.locator('#f-data').fill(original.replace('-0.22', '-0.23'));
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('[data-para=methods]')).not.toContainText('independently verified in R');
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('cumulative-subgroup'))).toBe(false);
  await page.locator('#f-data').fill(original);
  const key = view === 'cumulative' ? 'step.9.mu' : 'overall.mu';
  await page.evaluate(key => { window.__almVerifyPerturb = { key, delta: 0.01 }; }, key);
  await tab(page, 'verify');
  await run();
  await expect(summary).toContainText('FAIL', { timeout: 600000 });
  await expect(summary).toContainText('TEST MODE');
  const failing = await panel.locator('tbody tr').evaluateAll(rows => rows.filter(tr => !['pass', 'notapplicable'].includes(tr.querySelector('td[data-result]').dataset.result)).map(tr => tr.dataset.key));
  expect(failing).toEqual([key]);
  expect(await panel.locator('tbody tr').evaluateAll(rows => rows.filter(tr => tr.querySelector('td[data-result]').dataset.result === 'notapplicable').map(tr => tr.dataset.key))).toEqual(notApplicable);
  const planted = await page.evaluate(() => AlmFeaturesState.verify);
  expect(planted.passed).toBe(false);
  expect(planted.testHook).toBe(true);
  expect(planted.nPassed).toBe(n - 1);
  expect(planted.nNotComputed).toBe(0);
  expect(planted.perturbed).toEqual({ key, delta: 0.01 });
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('cumulative-subgroup'))).toBe(false);
  console.log(`VERIFY PLANTED ${n - 1}/${n} ${key}=FAIL; stale=PASS`);
});

test('SHARE: data, view, title, axis limits and provenance round trip; corrupt or invalid links are atomic', async ({ page, browser }) => {
  await open(page);
  const original = await page.evaluate(() => AlmFeatures.get('cumulative-subgroup').share.get());
  await page.locator('#f-view').selectOption('subgroup');
  await page.locator('#f-title').fill('Shared subgroup plot');
  await page.locator('#f-data').fill((await page.locator('#f-data').inputValue()).replace('-0.22', '-0.21'));
  await page.evaluate(() => {
    const spec = AlmFeatures.get('cumulative-subgroup');
    spec.share.set({ ...spec.share.get(), axis: ['-2', '2'] });
    AlmFeaturesState.provenance = [{ id: 'source-test', label: 'Trial A', reference: 'Built-in example (synthetic)', location: 'Example input', confirmed: true }];
  });
  const before = await page.evaluate(() => ({ state: AlmFeatures.get('cumulative-subgroup').share.get(), result: _almLastCumSub(), provenance: AlmFeaturesState.provenance }));
  await tab(page, 'share');
  await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
  await expect(page.locator('[data-testid=share-status]')).toContainText('Share link');
  const link = await page.getByLabel('Share link', { exact: true }).inputValue();
  const ctx = await browser.newContext();
  try {
    const restored = await ctx.newPage();
    await restored.goto(link);
    await expect(restored.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the share link.');
    const after = await restored.evaluate(() => ({ state: AlmFeatures.get('cumulative-subgroup').share.get(), result: _almLastCumSub(), provenance: AlmFeaturesState.provenance }));
    expect(after).toEqual(before);
    const invalidState = await page.evaluate(async () => AlmShare.encode('cumulative-subgroup', { data: 'bad', view: 'invalid', title: '', axis: ['', ''] }, []));
    for (const hash of [link.split('#s=')[1].slice(0, -10), invalidState]) {
      const clean = await browser.newContext();
      try {
        const bad = await clean.newPage(); await bad.goto(link.split('#')[0] + '#s=' + hash);
        await expect(bad.locator('[data-testid=share-status]')).toContainText('Nothing was changed.');
        expect(await bad.evaluate(() => AlmFeatures.get('cumulative-subgroup').share.get())).toEqual(original);
      } finally { await clean.close(); }
    }
  } finally { await ctx.close(); }
  console.log('SHARE roundtrip=PASS corrupt/invalid=2/2');
});

test('AXE: every feature tab has no serious/critical violations after animations settle', async ({ page }) => {
  await open(page);
  for (const key of ['entry', 'text', 'verify', 'share']) {
    await tab(page, key);
    await page.evaluate(() => Promise.all(document.getAnimations().filter(a => !a.effect || a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => null))));
    const result = await new AxeBuilder({ page }).include('#alm-features').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const bad = result.violations.filter(v => ['serious', 'critical'].includes(v.impact));
    expect(bad.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
    console.log(`AXE ${key}: ${result.passes.length} rules passed; ${bad.length} serious/critical`);
  }
});
