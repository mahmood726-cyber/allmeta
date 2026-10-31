import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readZip, readTiff, decodePng } from './zip-reader.mjs';

const APP = 'meta-regression', PAGE = `/${APP}/index.html`;
const SNAP = fileURLToPath(new URL('./__snapshots__/text-meta-regression.json', import.meta.url));
function requireVerifiedSummary(text) {
  expect(text).not.toContain('unavailable');
  expect(text).toMatch(/^\d+ of \d+ computed quantities match R; 0 not computed — PASS$/);
  const counts = text.match(/\d+/g).map(Number);
  expect(counts[1]).toBeGreaterThan(0);
  expect(counts[0]).toBe(counts[1]);
  return true;
}
async function open(page, tab = 'text', search = '') {
  await page.goto(PAGE + search);
  await expect(page.locator('#alm-features .alm-f-toggle')).toBeVisible();
  await page.evaluate(({ app, tab }) => AlmFeatures.open(app, tab), { app: APP, tab });
}
async function rendered(page) {
  return page.evaluate(app => {
    const s = AlmFeatures.get(app).text, r = s.results();
    const ctx = { app, build: AlmBuildInfo, entryLog: [], verify: null };
    const text = AlmText.render(s.templates, r, ctx);
    const norm = p => p.segments.map(v => v.type === 'ctx' && v.key.startsWith('build.') ? `<${v.key}>` : v.text).join('');
    return { audit: AlmText.audit(text, r, { ctx, dom: s.dom() }), r, dom: s.dom(),
      snapshot: { app, source: 'Built-in eight-study example; PM, floored Knapp–Hartung; location-scale off.',
        plain: norm(text.plain), methods: norm(text.methods), results: norm(text.results),
        flags: text.flags.map(norm), references: text.cites.map(c => c.full) } };
  }, APP);
}

test('PASTE PLANTED: lenient number tokens are excluded and listed, never read as another number', async ({ page }) => {
  // parseFloat('0.1x') = 0.1, parseFloat('40 5') = 40 and Number('0x10') = 16: each was analysed silently.
  await page.goto(PAGE);
  await page.waitForFunction(() => typeof window.__almMetaRegParse === 'function');
  const base = 'Trial A, -0.28, 0.12, 32\nTrial B, -0.22, 0.09, 35\nTrial C, -0.15, 0.11, 42';
  const parse = text => page.evaluate(t => window.__almMetaRegParse(t), text);
  for (const row of ['Trial D, 0.1x, 0.1, 40', 'Trial D, 0x10, 0.1, 40', 'Trial D, 0 1, 0.1, 40', 'Trial D, 0.1, 0.1x, 40',
    'Trial D, 0.1, 0x1, 40', 'Trial D, 0.1, 0.1, 40x', 'Trial D, 0.1, 0.1, 40 5', 'Trial D, 0.1, 0.1, 0x10', 'Trial D, 0.1, 0.1, NaN',
    'Trial D, 0.1, 0.1, Infinity', 'Trial D, 0.1, , 40']) {
    const p = await parse(base + '\n' + row);
    expect(p.studies.length, row).toBe(3);
    expect(p.warnings.join(' | '), row).toContain('Line 4');
    await page.locator('#f-data').fill(base + '\n' + row);
    await expect(page.locator('#warn-banner'), row).toContainText('Line 4');
  }
  // A mistyped first row is listed, not skipped as if it were a header; a real header is still skipped.
  const top = await parse('Trial A, -0.28x, 0.12, 32\n' + base);
  expect(top.warnings.join(' | ')).toContain('Line 1');
  const head = await parse('label, logOR, SE, moderator\n' + base);
  expect([head.studies.length, head.warnings]).toEqual([3, []]);
  // Valid forms stay accepted: leading '+', exponent.
  const ok = await parse(base + '\nTrial D, +0.1, 1e-1, 4.5e1');
  expect([ok.warnings, ok.studies[3].est, ok.studies[3].se, ok.studies[3].x]).toEqual([[], 0.1, 0.1, 45]);
});

test('FEATURE LIFECYCLE: collapsed controls stay unmounted; opening tabs preserves entry drafts', async ({ page }) => {
  await page.goto(PAGE);
  const toggle = page.locator('#alm-features .alm-f-toggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#alm-f-panel-entry textarea')).toHaveCount(0);
  await expect(page.locator('#alm-f-panel-text .alm-text')).toHaveCount(0);
  await page.locator('#f-data').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#btn-run')).toBeFocused();
  await page.evaluate(app => AlmFeatures.open(app, 'entry'), APP);
  const draft = page.locator('#alm-f-panel-entry textarea');
  await draft.fill('Unapplied study rows');
  await page.evaluate(app => AlmFeatures.open(app, 'text'), APP);
  await expect(page.locator('#alm-f-panel-text .alm-text-body')).toBeVisible();
  await page.evaluate(app => AlmFeatures.open(app, 'entry'), APP);
  await expect(draft).toHaveValue('Unapplied study rows');
  await expect(draft).toHaveCount(1);
});

test('AUTOSAVE: feature inputs never enter or renumber the original draft', async ({ page }) => {
  // Same pinned original key contract as meta-regression-usability.spec.mjs.
  const expected = ['alm-plot-1-format', 'alm-plot-1-physical-width', 'alm-plot-1-resolution', 'f-data', 'f-effectlabel',
    'f-modlabel', 'f-scale', 'f-title', 'idx:1', 'idx:10', 'idx:11', 'idx:12', 'idx:13', 'idx:14', 'idx:15', 'idx:17', 'idx:2', 'idx:6'];
  await open(page, 'entry');
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('alm-autosave:meta-regression') || 'null'));
  await page.evaluate(() => {
    localStorage.clear();
    document.getElementById('f-data').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(async () => Object.keys((await saved())?.values || {}).sort()).toEqual(expected);
  const original = (await saved()).values;
  await page.evaluate(() => localStorage.clear());
  await page.locator('#alm-f-panel-entry textarea').fill('Study\tEstimate\tSE\tmoderator\nA\t0.2\t0.1\t30');
  await page.locator('#alm-f-panel-entry').getByRole('button', { name: 'Preview and convert', exact: true }).click();
  await page.waitForTimeout(1000); // beyond the original autosave's 600 ms debounce
  expect(await saved()).toBeNull();
  // A real edit to the original form still saves, after all feature controls exist.
  await page.locator('#f-title').fill('Original form still saves');
  await expect.poll(async () => (await saved())?.values?.['f-title']).toBe('Original form still saves');
  expect((await saved()).values).toEqual({ ...original, 'f-title': 'Original form still saves' });
});

test('ENTRY: three source formats reproduce the example through the shared conversion APIs', async ({ page }) => {
  await open(page, 'entry');
  const result = await page.evaluate(app => {
    const entry = AlmFeatures.get(app).entry;
    const baseline = __almResults(), original = _almLastStudies();
    const z = 1.959963984540054;
    const formats = [
      ['Excel TSV', ['Study\tEstimate\tSE\tmoderator', ...original.map(s => [s.label, s.est, s.se, s.x].join('\t'))].join('\n')],
      ['Paper table', ['Study  Estimate  moderator', ...original.map(s =>
        `${s.label}  ${s.est} (${s.est-z*s.se}–${s.est+z*s.se})  ${s.x}`)].join('\n')],
      ['RevMan generic inverse-variance TSV with moderator column',
        ['Study or Subgroup\tlog OR\tStandard Error\tmoderator', ...original.map(s => [s.label, s.est, s.se, s.x].join('\t'))].join('\n')]
    ];
    const outcomes = formats.map(([name, source]) => {
      const table = AlmEntry.parseTable(source), detection = AlmEntry.detect(table, entry.schema);
      // Same explicit extra-column mapping as AlmEntryUI, independent of its changing confirmation UI.
      table.header.forEach((h, i) => {
        if (entry.extras.includes(h)) {
          detection.mapping[i] = h;
          detection.questions = detection.questions.filter(q => q.id !== `column:${i}`);
        }
      });
      const pending = AlmEntry.convert(table, detection, entry.schema, { decimal: 'point' });
      // EXAMPLE in the app is explicitly logOR. Generic Estimate headers need the same
      // ratio/log confirmations as the UI; these values must never be logged again.
      const answers = { decimal: 'point', 'measure:type': 'ratio',
        ...Object.fromEntries(original.map((_, i) => [`scale:${i}`, 'log'])) };
      const converted = AlmEntry.convert(table, detection, entry.schema, answers);
      const blocked = converted.flags.filter(f => f.blocking);
      if (blocked.length) return { name, blocked, converted };
      const applied = entry.apply(converted.records);
      AlmFeaturesState.entryLog = converted.steps;
      return { name, blocked, pending: pending.flags.filter(f => f.blocking), applied, baseline, actual: __almResults(), steps: converted.steps,
        rows: _almLastStudies(), original };
    });
    // Exercise the same confirmations in the public UI below, including its blocking state.
    const host = document.createElement('div'); host.id = 'entry-log-probe'; document.body.appendChild(host);
    const ui = AlmEntryUI.mount(host, entry);
    ui.element.querySelector('textarea').value = formats[1][1]; ui.parse();
    return outcomes;
  }, APP);
  for (const f of result) {
    expect(f.blocked, JSON.stringify(f)).toEqual([]);
    expect(f.applied).toEqual({ ok: true, n: 8 });
    expect(f.actual.k).toBe(f.baseline.k);
    for (const key of ['intercept', 'slope', 'slope_se', 'tau2_pm', 'QE', 'R2_tau2']) {
      expect(Math.abs(f.actual[key] - f.baseline[key]) / Math.max(1, Math.abs(f.baseline[key])), `${f.name}: ${key}`).toBeLessThanOrEqual(1e-9);
    }
    expect(f.rows.map(r => r.x)).toEqual(f.original.map(r => r.x));
  }
  for (const f of result.slice(0, 2)) {
    expect(f.pending.map(flag => flag.questionId)).toEqual(['measure:type']);
    expect(f.steps.filter(s => s.method === 'measure confirmed').map(s => s.inputs)).toEqual([{ measure: 'ratio' }]);
  }
  expect(result[2].pending).toEqual([]);
  for (const f of result) {
    const scales = f.steps.filter(s => s.method === 'scale confirmed');
    expect(scales.map(s => s.row)).toEqual(result[0].original.map((_, i) => i));
    expect(scales.every(s => s.inputs.scale === 'log')).toBe(true);
  }
  const ciSteps = result[1].steps.filter(s => /SE estimated from CI/.test(s.text));
  expect(ciSteps).toHaveLength(8);
  expect(ciSteps.map(s => s.row)).toEqual(result[1].original.map((_, i) => i));
  expect(result[1].steps).toHaveLength(17); // one measure confirmation, eight scales, eight CIs
  const probe = page.locator('#entry-log-probe'), useRows = probe.getByRole('button', { name: 'Use these rows', exact: true });
  await expect(useRows).toBeDisabled();
  await probe.getByRole('radio', { name: 'ratio', exact: true }).check();
  await expect(useRows).toBeDisabled();
  await expect(probe.getByRole('radio', { name: 'log', exact: true })).toHaveCount(8);
  for (let i = 0; i < 8; i++) {
    await expect(useRows).toBeDisabled();
    await probe.getByRole('radio', { name: 'log', exact: true }).nth(i).check();
  }
  await expect(useRows).toBeEnabled();
  await expect(probe).toContainText('SE estimated from CI');
  console.log(`ENTRYRT ${result.length}/${result.length} formats; 8/8 paper CI conversions`);
});

test('ENTRY planted invalid interval blocks use; invalid moderator/SE are rejected atomically', async ({ page }) => {
  await open(page, 'entry');
  const out = await page.evaluate(app => {
    const source = 'Study\tEstimate\tmoderator\nBad\t0.2 (0.5–0.1)\t32\nB\t0.3 (0.1–0.5)\t35\nC\t0.4 (0.2–0.6)\t38';
    const table = AlmEntry.parseTable(source), detection = AlmEntry.detect(table, 'generic');
    detection.mapping[2] = 'moderator'; detection.questions = detection.questions.filter(q => q.id !== 'column:2');
    const converted = AlmEntry.convert(table, detection, 'generic', { decimal: 'point' });
    const host = document.createElement('div'); host.id = 'entry-block-probe'; document.body.appendChild(host);
    const ui = AlmEntryUI.mount(host, AlmFeatures.get(app).entry);
    ui.element.querySelector('textarea').value = source; ui.parse();
    const before = document.getElementById('f-data').value;
    const good = _almLastStudies().map(s => ({ study: s.label, yi: s.est, sei: s.se, moderator: s.x }));
    const refused = [];
    for (const bad of [{ sei: 0 }, { moderator: '' }, { moderator: 'unknown' }]) {
      try { AlmFeatures.get(app).entry.apply(good.map((r, i) => i ? r : { ...r, ...bad })); refused.push(false); }
      catch { refused.push(true); }
    }
    return { blocked: converted.flags.some(f => f.blocking), refused, unchanged: before === document.getElementById('f-data').value };
  }, APP);
  expect(out).toEqual({ blocked: true, refused: [true, true, true], unchanged: true });
  await expect(page.locator('#entry-block-probe')).toContainText('Lower CI exceeds upper CI');
  await expect(page.locator('#entry-block-probe').getByRole('button', { name: 'Use these rows', exact: true })).toBeDisabled();
  console.log('ENTRY planted: blocking sanity check PASS; atomic refusals 3/3');
});

test('TEXT: audit, independent displayed values, snapshot, and report downloads', async ({ page }, info) => {
  await open(page);
  const out = await rendered(page);
  console.log(`TEXTAUDIT ${out.audit.passed}/${out.audit.checks} domChecked=${out.audit.domChecked}`);
  expect(out.audit.failures).toEqual([]);
  expect(out.audit.ok).toBe(true);
  expect(out.audit.domChecked).toBeGreaterThanOrEqual(3);
  const shown = await page.locator('#stats-wrap .stat').evaluateAll(cs => Object.fromEntries(cs.map(c =>
    [c.querySelector('.k').textContent, c.querySelector('.v').textContent])));
  expect(out.snapshot.results).toContain(`Residual τ² = ${shown['τ² (PM)']}`);
  expect(out.r.R2_tau2).toBe(Number(shown['R² (τ² explained)'].replace('%', '')) / 100);
  expect(out.snapshot.results).toContain('R² not estimable (no between-study variance in the intercept-only model)');
  expect(out.snapshot.results).toContain(`HKSJ q = ${shown['HKSJ q']}`);
  expect(out.snapshot.results).toContain(`The permutation test gave p = ${Object.entries(shown).find(([k]) => k.startsWith('β₁ permutation'))[1]}`);
  const slope = shown['β₁ (slope)'].match(/([-.\d]+) \[([-.\d]+), ([-.\d]+)\]/);
  expect(out.snapshot.results.replaceAll('−', '-')).toContain(`slope was ${slope[1]} (95% CI ${slope[2]} to ${slope[3]})`);
  console.log('TEXTDOM 5/5');
  fs.writeFileSync(info.outputPath('text-meta-regression.actual.json'), JSON.stringify(out.snapshot, null, 2) + '\n');
  expect(out.snapshot).toEqual(JSON.parse(fs.readFileSync(SNAP, 'utf8')));
  const panel = page.locator('#alm-f-panel-text');
  await expect(panel.locator('.alm-text-body')).toBeVisible();
  for (const [selector, suffix] of [['.alm-text-md', '.md'], ['.alm-text-docx', '.docx']]) {
    const [dl] = await Promise.all([page.waitForEvent('download'), panel.locator(selector).click()]);
    expect(dl.suggestedFilename()).toBe(APP + '-report-text' + suffix);
    const bytes = fs.readFileSync(await dl.path());
    if (suffix === '.md') expect(bytes.toString()).toContain(out.snapshot.results);
    else expect(readZip(bytes).map(e => e.name)).toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']));
  }
});

test('TEXT planted DOM-cross-checked slope defect fails and withholds text; scale model is refused', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.__almTextPerturb = { key: 'slope', delta: 0.1 }; });
  const out = await rendered(page);
  expect(out.audit.ok).toBe(false);
  expect(out.audit.failures.map(f => f.check)).toContain('dom:slope');
  console.log(`TEXTAUDIT planted ${out.audit.passed}/${out.audit.checks}`);
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-status')).toContainText('Number audit failed');
  await expect(page.locator('.alm-text-body')).toBeHidden();
  await page.evaluate(() => { delete window.__almTextPerturb; });
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-body')).toBeVisible();
  await page.locator('#f-scale').check();
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-status')).toContainText('Paule–Mandel model only');
  await expect(page.locator('.alm-text-body')).toBeHidden();
});

test('VERIFY: real browser R, all comparisons, bubble plots, ZIP, stale claim and planted defect', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // The shared core only honours the planted perturbation on an explicit test URL.
  await open(page, 'verify', '?almtest=1');
  const panel = page.locator('#alm-f-panel-verify'), summary = panel.locator('[data-testid=verify-summary]');
  const button = panel.getByRole('button', { name: 'Verify this analysis in R', exact: true });
  await button.click();
  await expect(summary).not.toBeEmpty({ timeout: 600_000 });
  const text = await summary.textContent();
  requireVerifiedSummary(text);
  const state = await page.evaluate(() => AlmFeaturesState.verify);
  console.log(`VERIFY ${state.nPassed}/${state.n}`);
  expect(state.n).toBeGreaterThanOrEqual(5);
  expect(state.n).toBe(28);
  expect(state.rows).toHaveLength(28);
  expect(state.passed).toBe(true);
  expect(state.testHook).toBe(false);
  expect([state.nNotComputed, state.nOptional, state.nNotApplicable]).toEqual([0, 0, 0]);
  expect(state.rows.every(r => r.pass)).toBe(true);
  await expect(panel.locator('figure img')).toHaveCount(1);
  await expect(panel.locator('figure svg')).toHaveCount(1);
  const [zip] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download everything (ZIP)', exact: true }).click()]);
  const files = Object.fromEntries(readZip(fs.readFileSync(await zip.path())).map(e => [e.name, e.bytes]));
  for (const name of [`${APP}-verify.R`, `${APP}-verify-comparison.csv`, 'sessionInfo.txt', 'console.txt',
    `${APP}-bubble-R-300dpi.png`, `${APP}-bubble-R.pdf`, `${APP}-bubble-R-300dpi.tiff`, 'truthcert.json']) expect(files[name], name).toBeDefined();
  expect(Object.keys(files).filter(n => /-bubble-(R|app)\.svg$/.test(n))).toHaveLength(1);
  const dec = b => new TextDecoder().decode(b);
  const script = dec(files[`${APP}-verify.R`]);
  expect(script).toContain('mods=~x'); expect(script).toContain('test="adhoc"'); expect(script).toContain('QM=f$QM');
  expect(script).toContain('metafor::regplot'); expect(script).toContain('print(sessionInfo())');
  const png = decodePng(files[`${APP}-bubble-R-300dpi.png`]);
  expect([png.width, png.height]).toEqual([2400, 1800]);
  expect(readTiff(files[`${APP}-bubble-R-300dpi.tiff`]).tags[282].value).toEqual([300, 1]);
  const receipt = JSON.parse(dec(files['truthcert.json']));
  expect(receipt.extra.results.passed).toBe(true);
  expect(receipt.extra.results.testHook).toBe(false);
  expect(receipt.extra.results.nNotComputed).toBe(0);
  expect(await page.evaluate(r => AlmTruthCertExport.verifyContentHash(r), receipt)).toBe(true);
  console.log(`VERIFY ZIP ${Object.keys(files).length} entries; PNG/TIFF 300dpi`);
  await page.evaluate(app => AlmFeatures.open(app, 'text'), APP);
  await expect(page.locator('[data-para=methods]')).toContainText('Results were independently verified in R');
  await page.locator('#f-data').fill((await page.locator('#f-data').inputValue()).replace('-0.28', '-0.27'));
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('[data-para=methods]')).not.toContainText('Results were independently verified in R');
  expect(await page.evaluate(app => AlmFeatures.verifiedCurrent(app), APP)).toBe(false);
  await page.locator('#btn-example').click();
  await page.evaluate(app => { window.__almVerifyPerturb = { key: 'slope', delta: 0.01 }; AlmFeatures.open(app, 'verify'); }, APP);
  await button.click();
  await expect(summary).toContainText('FAIL', { timeout: 300_000 });
  await expect(summary).toContainText('TEST MODE (test hook active; not a verification)');
  const failed = await page.evaluate(() => AlmFeaturesState.verify.rows.filter(r => !r.pass).map(r => r.key));
  expect(failed).toEqual(['slope']);
  expect(await page.evaluate(app => ({ passed: AlmFeaturesState.verify.passed,
    testHook: AlmFeaturesState.verify.testHook, current: AlmFeatures.verifiedCurrent(app) }), APP))
    .toEqual({ passed: false, testHook: true, current: false });
  console.log(`VERIFY planted ${state.n - 1}/${state.n}; slope FAIL`);
  expect(errors).toEqual([]);
});

test('SHARE: data and every option round trip; corrupt and invalid links leave defaults unchanged', async ({ page, browser }) => {
  await open(page, 'share');
  await page.locator('#f-data').fill('Alpha, -0.4, 0.15, 24\nBeta, -0.2, 0.12, 30\nGamma, 0.1, 0.2, 40\nDelta, 0.3, 0.1, 52');
  await page.locator('#f-title').fill('Shared example');
  await page.locator('#f-modlabel').fill('Age');
  await page.locator('#f-effectlabel').fill('Mean difference');
  await page.locator('#f-scale').check();
  await page.locator('[data-axis=x][data-edge=min]').fill('10');
  await page.locator('[data-axis=x][data-edge=min]').dispatchEvent('change');
  await page.locator('[data-axis=y][data-edge=log]').check();
  await page.locator('#btn-run').click();
  const before = await page.evaluate(app => ({ state: AlmFeatures.get(app).share.get(), result: __almResults() }), APP);
  await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
  await expect(page.locator('[data-testid=share-status]')).toContainText('Share link');
  const link = await page.getByLabel('Share link', { exact: true }).inputValue();
  const ctx = await browser.newContext(), restored = await ctx.newPage();
  try {
    await restored.goto(link);
    await expect(restored.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the share link.');
    expect(await restored.evaluate(app => ({ state: AlmFeatures.get(app).share.get(), result: __almResults() }), APP)).toEqual(before);
    const bad = await browser.newContext(), badPage = await bad.newPage();
    try {
      await badPage.goto(link.split('#')[0] + '#s=corrupt!');
      await expect(badPage.locator('[data-testid=share-status]')).toContainText('Nothing was changed.');
      expect(await badPage.locator('#f-title').inputValue()).toBe('Example meta-regression');
      expect(await badPage.locator('#f-scale').isChecked()).toBe(false);
      const atomic = await badPage.evaluate(app => {
        const s = AlmFeatures.get(app).share, before = s.get();
        try { s.set({ ...before, data: 'changed', axes: ['bad'] }); } catch {}
        return JSON.stringify(before) === JSON.stringify(s.get());
      }, APP);
      expect(atomic).toBe(true);
    } finally { await bad.close(); }
  } finally { await ctx.close(); }
  console.log('SHARE roundtrip and planted corrupt/invalid state 3/3');
});

test('AXE: every feature tab has no serious or critical accessibility violations', async ({ page }) => {
  await open(page, 'entry');
  for (const tab of ['entry', 'text', 'verify', 'share']) {
    await page.evaluate(({ app, tab }) => AlmFeatures.open(app, tab), { app: APP, tab });
    await page.evaluate(() => Promise.all(document.getAnimations()
      .filter(a => !a.effect || a.effect.getComputedTiming().iterations !== Infinity)
      .map(a => a.finished.catch(() => null))));
    const scan = await new AxeBuilder({ page }).include('#alm-features').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const bad = scan.violations.filter(v => ['serious', 'critical'].includes(v.impact));
    expect(bad.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
    console.log(`AXE ${tab}: ${scan.passes.length} rules passed; ${bad.length} serious/critical`);
  }
});

test('REVIEW P1: unsupported paper extraction is disabled with an honest provenance notice', async ({ page }) => {
  await open(page, 'entry');
  const panel = page.locator('#alm-f-panel-entry');
  await expect(panel.getByRole('button', { name: 'Extract paper text with source confirmation' })).toBeDisabled();
  await expect(panel).toContainText('Paper-text extraction is unavailable');
  await expect(panel).toContainText('moderator');
  await expect(panel).toContainText('Table entry does not yet provide per-study source confirmation');
});

test('REVIEW P1: share preserves detached copies of entry metadata and clears it for changed data', async ({ page }) => {
  await open(page, 'share');
  const out = await page.evaluate(app => {
    const spec = AlmFeatures.get(app);
    const records = _almLastStudies().map(s => ({ study: s.label, yi: s.est, sei: s.se, moderator: s.x,
      provenance: { label: s.label, pastedText: 'verbatim − text', confirmed: true, location: 'Table A' } }));
    spec.entry.apply(records);
    AlmFeaturesState.entryLog = [{ study: records[0].study, text: 'SE estimated from CI', method: 'SE from CI' }];
    const saved = spec.share.get();
    const captured = JSON.parse(JSON.stringify(saved));
    AlmFeaturesState.entryLog[0].text = 'mutated';
    if (AlmFeaturesState.provenance) AlmFeaturesState.provenance[0].location = 'mutated';
    const detached = JSON.stringify(saved) === JSON.stringify(captured);
    spec.share.set(saved);
    const restored = { provenance: AlmFeaturesState.provenance, entryLog: AlmFeaturesState.entryLog };
    const before = spec.share.get();
    let rejected = false;
    try { spec.share.set({ ...before, data: 'invalid changed data', provenance: {} }); } catch { rejected = true; }
    const atomic = JSON.stringify(before) === JSON.stringify(spec.share.get());
    document.getElementById('f-data').value += '\nNew, 0.1, 0.2, 29';
    const stale = spec.share.get();
    spec.share.set({ ...captured, provenance: undefined, entryLog: undefined });
    const legacy = spec.share.get();
    return { captured, restored, detached, rejected, atomic, stale, legacy, expected: records.map(r => r.provenance) };
  }, APP);
  expect(out.captured.provenance).toEqual(out.expected);
  expect(out.captured.entryLog).toHaveLength(1);
  expect(out.restored).toEqual({ provenance: out.expected, entryLog: out.captured.entryLog });
  expect(out.detached && out.rejected && out.atomic).toBe(true);
  expect(out.stale.provenance).toEqual([]);
  expect(out.stale.entryLog).toEqual([]);
  expect(out.legacy.provenance).toEqual([]);
  expect(out.legacy.entryLog).toEqual([]);
});

test('REVIEW P1: entry metadata survives an actual share link in a fresh browser context', async ({ page, browser }) => {
  await open(page, 'share');
  const before = await page.evaluate(app => {
    const s = AlmFeatures.get(app);
    s.entry.apply(_almLastStudies().map(row => ({ study: row.label, yi: row.est, sei: row.se, moderator: row.x,
      provenance: { label: row.label, reference: 'Example source', location: 'Table A', pastedText: 'exact source text', confirmed: true } })));
    AlmFeaturesState.entryLog = [{ study: 'Trial A', text: 'SE estimated from CI', method: 'SE from CI' }];
    return s.share.get();
  }, APP);
  await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
  await expect(page.locator('[data-testid=share-status]')).toContainText('Share link');
  const link = await page.getByLabel('Share link', { exact: true }).inputValue();
  const ctx = await browser.newContext();
  try {
    const restored = await ctx.newPage();
    await restored.goto(link);
    await expect(restored.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the share link.');
    expect(await restored.evaluate(app => AlmFeatures.get(app).share.get(), APP)).toEqual(before);
    expect(before.provenance).toHaveLength(8);
    expect(before.entryLog).toHaveLength(1);
  } finally { await ctx.close(); }
});

test('REVIEW P2-1: changing moderator units cannot conceal a jointly scaled slope and SE defect', async ({ page }) => {
  await open(page, 'verify');
  const out = await page.evaluate(app => {
    const spec = AlmFeatures.get(app), live = spec.verify.adapter();
    spec.entry.apply(_almLastStudies().map(s => ({ study: s.label, yi: s.est, sei: s.se, moderator: s.x * 1e6 })));
    const state = live.currentState(), base = live.appValues(state), ref = Object.fromEntries(base.map(v => [v.key, v.value]));
    const bad = structuredClone(state);
    for (const key of ['slope', 'slope_se', 'slope_ci_lb', 'slope_ci_ub']) bad.result[key] *= 0.2;
    function compare(values) { return values.filter(v => !AlmValidate.compare(v.value, ref[v.key],
      live.compare.kind[v.key], live.compare.tolerance[v.key] ?? live.compare.tolerance.default).pass).map(v => v.key); }
    return { good: compare(base), bad: compare(live.appValues(bad)), script: live.buildScript(state) };
  }, APP);
  expect(out.good).toEqual([]);
  expect(out.bad.length).toBeGreaterThan(0);
  expect(out.script).toContain('slope_per_range');
});

test('REVIEW P2-2 planted unavailable package must fail the real-R verification gate', () => {
  expect(() => requireVerifiedSummary('Not checked in the browser: R package metafor is unavailable.')).toThrow();
  expect(() => requireVerifiedSummary('0 of 0 quantities match R — PASS')).toThrow();
  for (const summary of [
    '0 of 0 computed quantities match R; 0 not computed — PASS',
    '27 of 28 computed quantities match R; 0 not computed — PASS',
    '28 of 28 computed quantities match R; 1 not computed — PASS',
    '28 of 28 computed quantities match R; 0 not computed (1 optional not computed) — PASS',
    '28 of 28 computed quantities match R; 0 not computed — FAIL',
    'TEST MODE (test hook active; not a verification) — 28 of 28 computed quantities match R; 0 not computed — PASS',
    'STALE (earlier version of the analysis): 28 of 28 computed quantities match R; 0 not computed — PASS'
  ]) expect(() => requireVerifiedSummary(summary), summary).toThrow();
  expect(requireVerifiedSummary('28 of 28 computed quantities match R; 0 not computed — PASS')).toBe(true);
});

test('REVIEW P2-3: distinguish undefined R squared from a genuinely zero reduction', async ({ page }) => {
  await open(page);
  const out = await rendered(page);
  expect(out.snapshot.results).toContain('R² not estimable (no between-study variance in the intercept-only model)');
  expect(out.snapshot.results).not.toContain('R² = 0.0%');
  const defined = await page.evaluate(app => {
    const s = AlmFeatures.get(app).text, raw = __almResults;
    window.__almResults = () => ({ ...raw(), tau2_pm: 0.3, R2_tau2: 0 });
    try { return AlmText.render(s.templates, s.results(), {}).results.text; } finally { window.__almResults = raw; }
  }, APP);
  expect(defined).toContain('R² = 0.0%');
});

test('REVIEW P2-4: endpoint p values use audited inequalities in copied Results', async ({ page }) => {
  await open(page);
  const cases = await page.evaluate(app => {
    const s = AlmFeatures.get(app).text;
    return [0, 1, 0.051].map(p => {
      const r = { ...s.results(), slope_p_display: p, permP: p, QE_p: p };
      const text = AlmText.render(s.templates, r, {});
      return { text: text.results.text, audit: AlmText.audit(text, r, {}) };
    });
  }, APP);
  expect(cases[0].text).toContain('p < 0.001');
  expect(cases[1].text).toContain('p > 0.999');
  expect(cases[2].text).toContain('p = 0.051');
  for (const c of cases) {
    expect(c.text).not.toMatch(/p = (0\.000|1\.000)/);
    expect(c.audit.failures).toEqual([]);
  }
});

test('REVIEW P2-5: study-count caution addresses meta-regression and observational bias', async ({ page }) => {
  await open(page);
  const out = await rendered(page);
  expect(out.snapshot.flags.join(' ')).toContain('ten studies per characteristic');
  expect(out.snapshot.flags.join(' ')).toContain('aggregation bias');
  expect(out.snapshot.flags.join(' ')).not.toContain('funnel');
  expect(out.snapshot.references.join(' ')).toContain('10.11.4');
  expect(out.audit.failures).toEqual([]);
});

test('REVIEW P2-6: the valid prediction-interval citation belongs to its Methods sentence', async ({ page }) => {
  await open(page);
  const out = await rendered(page);
  expect(out.snapshot.methods).toContain('variance of the fitted mean (Cochrane Handbook v6.5, §10.10.4.3).');
});

test('REVIEW P2-7: the live adapter is discoverable through the public registry', async ({ page }) => {
  await open(page, 'verify');
  expect(await page.evaluate(app => Boolean(window.AlmLiveAdapters?.[app]) &&
    AlmLiveAdapters[app] === AlmFeatures.get(app).verify.adapter(), APP)).toBe(true);
});
