import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readZip, readTiff, decodePng } from './zip-reader.mjs';

const APP = 'dta-sroc', PAGE = '/dta-sroc/index.html';
const SNAP = new URL('./__snapshots__/text-dta-sroc.json', import.meta.url);
const PROVENANCE = [{ id: 'example-a', label: 'Study A', reference: 'Built-in synthetic example',
  location: 'Example data', pastedText: 'Study A, 85, 10, 15, 140', confirmed: true,
  values: [{ field: 'tp', value: 85, span: [9, 11], text: '85' }], conversions: [], flags: [] }];

async function open(page, tab, url = PAGE) {
  await page.goto(url);
  await page.waitForFunction(() => window.AlmFeatures?.get('dta-sroc') && window.__almBivariate());
  if (tab) await page.evaluate(tab => AlmFeatures.open('dta-sroc', tab), tab);
}
async function render(page) {
  return page.evaluate(() => {
    const spec = AlmFeatures.get('dta-sroc').text, r = spec.results();
    const ctx = { app: 'dta-sroc', build: AlmBuildInfo, entryLog: [], verify: null };
    const text = AlmText.render(spec.templates, r, ctx);
    const norm = p => p.segments.map(s => s.type === 'ctx' && s.key.startsWith('build.') ? `<${s.key}>` : s.text).join('');
    return { audit: AlmText.audit(text, r, { ctx, dom: spec.dom() }),
      snapshot: { app: 'dta-sroc', source: 'Built-in generic example; REML, all-study correction, no covariate',
        plain: norm(text.plain), methods: norm(text.methods), results: norm(text.results),
        flags: text.flags.map(norm), references: text.cites.map(c => c.full) } };
  });
}
async function axe(page, name) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(a => !a.effect || a.effect.getComputedTiming().iterations !== Infinity)
    .map(a => a.finished.catch(() => null))));
  const a = await new AxeBuilder({ page }).include('#alm-features')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = a.violations.filter(v => ['serious', 'critical'].includes(v.impact));
  console.log(`AXE ${name}: ${bad.length} serious/critical; ${a.passes.length} rules passed`);
  expect(bad.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
}

test('ENTRY: three formats round-trip the native example through the shared APIs', async ({ page }) => {
  await open(page, 'entry');
  const output = await page.evaluate(() => {
    const adapter = AlmFeatures.get('dta-sroc');
    const before = __almBivariate(), raw = __almResults().rows;
    const counts = raw.map(r => [r.study, r.TP, r.FP, r.FN, r.TN]);
    const formats = [
      'Study\tTP\tFP\tFN\tTN\n' + counts.map(r => r.join('\t')).join('\n'),
      // Paper table with explicit counts as n/N, using the diseased/non-diseased
      // denominators. Counts, rather than sensitivity estimates, are supplied.
      'Study  TP  FP  FN  TN\n' + raw.map(r => [r.study, `${r.TP}/${r.TP + r.FN}`,
        `${r.FP}/${r.FP + r.TN}`, `${r.FN}/${r.TP + r.FN}`, `${r.TN}/${r.FP + r.TN}`].join('  ')).join('\n'),
      'Study ID,True Positives,False Positives,False Negatives,True Negatives\n' +
        counts.map(r => r.join(',')).join('\n')
    ];
    return formats.map((src, i) => {
      const table = AlmEntry.parseTable(src), detected = AlmEntry.detect(table, 'dta');
      // Explicitly confirm CSV separators, as the shared parser requires for
      // digit-comma-digit input; never silently reinterpret decimal commas.
      const converted = AlmEntry.convert(table, detected, 'dta', i === 2 ? { 'table:delimiter': 'columns' } : {});
      const blocking = converted.flags.filter(f => f.blocking);
      if (blocking.length) return { i, blocking };
      // This API fixture supplies explicit synthetic confirmations. It does not
      // claim that the legacy shared UI can collect provenance (see REVIEW P1).
      converted.records.forEach(r => {
        const pastedText = [r.study, r.tp, r.fp, r.fn, r.tn].join('\t');
        let start = r.study.length + 1;
        r.provenance = { label: r.study, reference: 'Built-in synthetic example', location: 'Example data',
          pastedText, confirmed: true, values: ['tp', 'fp', 'fn', 'tn'].map(field => {
            const text = String(r[field]), span = [start, start + text.length];
            start += text.length + 1;
            return { field, value: r[field], text, span };
          }) };
      });
      const applied = adapter.entry.apply(converted.records);
      return { i, blocking, applied, expected: counts,
        actual: __almResults().rows.map(r => [r.study, r.TP, r.FP, r.FN, r.TN]),
        before: { sens: before.sens, spec: before.spec, dor: before.dor },
        after: { sens: __almBivariate().sens, spec: __almBivariate().spec, dor: __almBivariate().dor } };
    });
  });
  for (const r of output) {
    expect(r.blocking).toEqual([]);
    expect(r.applied).toEqual({ ok: true, n: 7 });
    expect(r.actual).toEqual(r.expected);
    for (const key of ['sens', 'spec', 'dor'])
      expect(Math.abs(r.after[key] - r.before[key]) / Math.abs(r.before[key])).toBeLessThanOrEqual(1e-9);
  }
  await expect(page.getByRole('heading', { name: 'Conversion log', exact: true })).toBeVisible();
  console.log(`ENTRYRT ${output.length}/${output.length} formats; counts exact; estimates relative <= 1e-9`);
});

test('ENTRY PLANTED: negative counts block conversion; invalid imports leave data unchanged', async ({ page }) => {
  await open(page, 'entry');
  const out = await page.evaluate(() => {
    const s = AlmFeatures.get('dta-sroc'), before = s.share.get();
    const table = AlmEntry.parseTable('Study\tTP\tFP\tFN\tTN\nBad\t-1\t10\t15\t140');
    const converted = AlmEntry.convert(table, AlmEntry.detect(table, 'dta'), 'dta', {});
    // Exercise the shared UI's public parse API, without clicking its controls.
    const host = document.createElement('div');
    const ui = AlmEntryUI.mount(host, s.entry);
    host.querySelector('textarea').value = table.source;
    ui.parse();
    const disabled = Array.from(host.querySelectorAll('button')).find(b => b.textContent === 'Use these rows').disabled;
    const log = host.textContent;
    const rows = __almResults().rows.map(r => ({ study: r.study, tp: r.TP, fp: r.FP, fn: r.FN, tn: r.TN }));
    const failures = [];
    for (const edit of [r => { r.tp = -1; }, r => { r.tp = 0; r.fn = 0; },
      r => { r.tp = 1.5; }, r => { r.study = '# hidden'; }, r => { r.study = 'bad\nlabel'; }]) {
      const bad = structuredClone(rows); edit(bad[0]);
      try { s.entry.apply(bad); failures.push(false); } catch { failures.push(true); }
    }
    return { flags: converted.flags, disabled, log, failures, before, after: s.share.get() };
  });
  expect(out.flags.some(f => f.blocking && f.code === 'negative-count')).toBe(true);
  expect(out.failures).toEqual([true, true, true, true, true]);
  expect(out.after).toEqual(out.before);
  expect(out.disabled).toBe(true);
  expect(out.log).toContain('Conversion log');
  expect(out.log).toContain('tp must not be negative');
  console.log('ENTRY PLANTED negative-count blocks; atomic refusal 5/5');
});

test('TEXT: audit, displayed values, and reviewed snapshot', async ({ page }, info) => {
  await open(page, 'text');
  const out = await render(page);
  const artifact = info.outputPath('text-dta-sroc.actual.json');
  writeFileSync(artifact, JSON.stringify(out.snapshot, null, 2) + '\n');
  await info.attach('text snapshot', { path: artifact, contentType: 'application/json' });
  console.log(`TEXTAUDIT ${out.audit.passed}/${out.audit.checks} domChecked=${out.audit.domChecked}`);
  expect(out.audit.failures).toEqual([]);
  expect(out.audit.domChecked).toBeGreaterThanOrEqual(3);
  const display = await page.locator('#stats-wrap .stat').evaluateAll(cards => Object.fromEntries(
    cards.map(c => [c.querySelector('.k').textContent, c.querySelector('.v').textContent])));
  const text = out.snapshot.results.replace(/−/g, '-');
  const vals = ['Summary Se (REML)', 'Summary Sp (REML)', 'LR+', 'LR−', 'Diagnostic OR', 'AUC (partial AUC)', 'AIC']
    .flatMap(k => display[k].match(/-?\d+(?:\.\d+)?/g));
  for (const v of vals) expect(text).toContain(v);
  console.log(`TEXTDOM ${vals.length}/${vals.length}`);
  expect(out.snapshot).toEqual(JSON.parse(readFileSync(SNAP, 'utf8')));
  await expect(page.locator('#alm-features .alm-text-body')).toBeVisible();
});

test('TEXT PLANTED: DOM mismatch fails audit and withholds report', async ({ page }) => {
  await open(page, 'text');
  await page.evaluate(() => { window.__almTextPerturb = { key: 'sens', delta: 0.01 }; });
  const out = await render(page);
  expect(out.audit.ok).toBe(false);
  expect(out.audit.failures.map(f => f.check)).toContain('dom:sens');
  await page.locator('#alm-features .alm-text-regenerate').click();
  await expect(page.locator('#alm-features .alm-text-status')).toContainText('Number audit failed');
  await expect(page.locator('#alm-features .alm-text-body')).toBeHidden();
  console.log(`TEXTAUDIT planted ${out.audit.passed}/${out.audit.checks} FAIL dom:sens`);
  await page.evaluate(() => { delete window.__almTextPerturb; });
  await page.locator('#alm-features .alm-text-regenerate').click();
  await expect(page.locator('#alm-features .alm-text-body')).toBeVisible();
});

test('TEXT: all estimators, correction wording, meta-regression, and report exports', async ({ page }) => {
  await open(page, 'text');
  for (const method of ['ml', 'mm', 'vc', 'fixed', 'reml']) {
    await page.selectOption('#f-method', method);
    await page.click('#btn-run');
    const out = await render(page);
    expect(out.audit.failures, method).toEqual([]);
  }
  for (const cc of ['single', 'none', 'all']) {
    await page.selectOption('#f-cc', cc);
    await page.click('#btn-run');
    const out = await render(page);
    expect(out.audit.failures, cc).toEqual([]);
    expect(out.snapshot.methods).toContain(cc === 'none' ? 'No continuity correction' :
      cc === 'single' ? 'that study only' : 'every cell of every study');
  }
  await page.selectOption('#f-example', 'smoking');
  await page.click('#btn-example');
  const out = await render(page);
  expect(out.audit.failures).toEqual([]);
  expect(out.snapshot.methods).toContain('summary point and plots still show the intercept-only fit');
  expect(out.snapshot.results).toContain('Meta-regression coefficient');
  await page.locator('#alm-features .alm-text-regenerate').click();
  for (const [selector, suffix] of [['.alm-text-md', '.md'], ['.alm-text-docx', '.docx']]) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#alm-features ' + selector).click()]);
    expect(dl.suggestedFilename()).toBe(APP + '-report-text' + suffix);
    const bytes = readFileSync(await dl.path());
    if (suffix === '.md') expect(bytes.toString()).toContain(out.snapshot.results);
    else expect(readZip(bytes).map(e => e.name)).toEqual(expect.arrayContaining(['word/document.xml', '[Content_Types].xml', '_rels/.rels']));
  }
  console.log('TEXT options 5/5 estimators, 3/3 corrections; meta-regression and exports PASS');
});

test('VERIFY: real mada comparison, SROC plots, ZIP and planted defect', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', req => {
    const u = new URL(req.url());
    if (/^https?:$/.test(u.protocol) && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') external.push(req.url());
  });
  // v2-core only honours the planted-defect hook on explicitly opted-in pages.
  // The first run below has no active hook and must still be a real R pass.
  await open(page, 'verify', PAGE + '?almtest=1');
  const panel = page.locator('#alm-f-panel-verify'), summary = panel.locator('[data-testid=verify-summary]');
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(summary).not.toBeEmpty({ timeout: 600_000 });
  const verdict = await summary.textContent();
  console.log('VERIFY verdict: ' + verdict);
  // Missing-package fallback is accepted only if the actual pinned manifest
  // lacks mada. A network/boot error is never recast as unavailability.
  const manifest = JSON.parse(readFileSync(new URL('../../../r-shiny/shinylive/webr/repo/manifest.json', import.meta.url), 'utf8'));
  if (!manifest.packages.some(p => p.package === 'mada')) {
    await expect(summary).toHaveText('Not checked in the browser: R package mada is unavailable.');
    expect(await page.evaluate(() => AlmFeaturesState.verify.passed)).toBe(false);
    const [script] = await Promise.all([page.waitForEvent('download'),
      panel.getByRole('button', { name: 'R script (.R)', exact: true }).click()]);
    expect(readFileSync(await script.path(), 'utf8')).toContain('reitsma(d');
    console.log('VERIFY unavailable: mada absent; no pass claimed');
    return;
  }
  const state = await page.evaluate(() => AlmFeaturesState.verify);
  expect(verdict).toBe(`${state.n} of ${state.n} computed quantities match R; 0 not computed — PASS`);
  expect(state.n).toBeGreaterThanOrEqual(5);
  expect(state.nPassed).toBe(state.n);
  expect(state.rows).toHaveLength(state.n);
  expect(state.nNotComputed).toBe(0);
  expect(state.nOptional).toBe(0);
  expect(state.nNotApplicable).toBe(0);
  expect(state.testHook).toBe(false);
  expect(state.passed).toBe(true);
  expect(state.rows.every(r => r.pass)).toBe(true);
  console.log(`VERIFY ${state.nPassed}/${state.n} mada=${state.versions.mada}`);
  expect(await page.evaluate(() => {
    const t = AlmFeatures.get('dta-sroc').text;
    return AlmText.render(t.templates, t.results(), AlmText.context('dta-sroc', t)).methods.text;
  })).toContain('Results were independently verified in R');
  await expect(panel.getByRole('button', { name: 'Download everything (ZIP)', exact: true })).toBeVisible();
  await expect(panel.locator('figure img')).toHaveCount(1);
  await expect(panel.locator('figure svg')).toHaveCount(1);
  expect(await panel.locator('figure img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.evaluate(p => { AlmFeaturesState.provenance = p; }, PROVENANCE);
  const [dl] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download everything (ZIP)', exact: true }).click()]);
  expect(dl.suggestedFilename()).toBe(APP + '-verify-in-r.zip');
  const files = Object.fromEntries(readZip(readFileSync(await dl.path())).map(e => [e.name, e.bytes]));
  for (const name of ['dta-sroc-verify.R', 'dta-sroc-verify-comparison.csv', 'sessionInfo.txt', 'console.txt',
    'dta-sroc-sroc-R-300dpi.png', 'dta-sroc-sroc-R.pdf', 'dta-sroc-sroc-R-300dpi.tiff', 'truthcert.json', 'provenance.csv']) {
    expect(files[name], name).toBeDefined();
  }
  expect(Object.keys(files).filter(n => /^dta-sroc-sroc-(R|app)\.svg$/.test(n))).toHaveLength(1);
  const dec = b => new TextDecoder().decode(b);
  expect(dec(files['dta-sroc-verify.R'])).toContain('plot(f, sroclwd=2, predict=TRUE)');
  expect(dec(files['dta-sroc-verify.R'])).toContain('points(mada::fpr(dp), mada::sens(dp)');
  expect(dec(files['dta-sroc-verify.R'])).toContain('print(sessionInfo())');
  const png = decodePng(files['dta-sroc-sroc-R-300dpi.png']);
  expect([png.width, png.height]).toEqual([2100, 2100]);
  expect(png.phys).toEqual({ x: 11811, y: 11811, unit: 1 });
  const tif = readTiff(files['dta-sroc-sroc-R-300dpi.tiff']);
  expect(tif.tags[282].value).toEqual([300, 1]);
  expect(dec(files['dta-sroc-sroc-R.pdf']).slice(0, 5)).toBe('%PDF-');
  const receipt = JSON.parse(dec(files['truthcert.json']));
  expect(receipt.extra.results.passed).toBe(true);
  expect(receipt.extra.results.testHook).toBe(false);
  expect(receipt.extra.results.files.map(f => f.name).sort()).toEqual(Object.keys(files).filter(n => n !== 'truthcert.json').sort());
  for (const f of receipt.extra.results.files) expect(f.sha256).toBe(createHash('sha256').update(files[f.name]).digest('hex'));
  expect(await page.evaluate(r => AlmTruthCertExport.verifyContentHash(r), receipt)).toBe(true);
  console.log(`VERIFY ZIP ${Object.keys(files).length} entries; hashes and plot encodings PASS`);
  await axe(page, 'verify after R');
  await page.evaluate(() => { window.__almVerifyPerturb = { key: 'sens', delta: 0.01 }; });
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(summary).toContainText('FAIL', { timeout: 300_000 });
  const planted = await page.evaluate(() => AlmFeaturesState.verify);
  expect(planted.n).toBe(state.n);
  expect(planted.nPassed).toBe(state.n - 1);
  expect(planted.nNotComputed).toBe(0);
  expect(planted.testHook).toBe(true);
  expect(planted.perturbed).toEqual({ key: 'sens', delta: 0.01 });
  await expect(summary).toHaveText(`TEST MODE (test hook active; not a verification) — ${state.n - 1} of ${state.n} computed quantities match R; 0 not computed — FAIL: 1 not matching R; test hook active`);
  expect(planted.rows.filter(r => !r.pass).map(r => r.key)).toEqual(['sens']);
  expect(planted.passed).toBe(false);
  expect(await page.evaluate(() => {
    const t = AlmFeatures.get('dta-sroc').text;
    return AlmText.render(t.templates, t.results(), AlmText.context('dta-sroc', t)).methods.text;
  })).not.toContain('Results were independently verified in R');
  console.log(`VERIFY planted ${planted.nPassed}/${planted.n} FAIL sens`);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('SHARE: data, every option, provenance and conversion log round-trip; corrupt state is atomic', async ({ page, browser }) => {
  await open(page, 'share');
  await page.selectOption('#f-example', 'AuditC');
  await page.click('#btn-example');
  await page.selectOption('#f-method', 'ml');
  await page.selectOption('#f-cc', 'single');
  await page.fill('#f-title', 'Diagnostic accuracy — shared');
  // The native ROC plot has a fixed unit-square domain (see its U2 usability
  // contract). These controls are reference-only, not editable share options.
  const axes = page.locator('#alm-axis-mount input');
  await expect(axes).toHaveCount(6);
  for (let i = 0; i < 6; i++) await expect(axes.nth(i)).toBeDisabled();
  await page.evaluate(p => {
    AlmFeaturesState.provenance = p;
    AlmFeaturesState.entryLog = [{ study: 'Study A', text: 'Counts copied without conversion', method: 'direct counts' }];
  }, PROVENANCE);
  await page.click('#btn-run');
  const expected = await page.evaluate(() => ({ state: AlmFeatures.get('dta-sroc').share.get(),
    sens: __almBivariate().sens, spec: __almBivariate().spec }));
  expect(expected.state.axes).toEqual(['0', '1', false, '0', '1', false]);
  await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
  await expect(page.locator('[data-testid=share-status]')).toContainText('Share link');
  const link = await page.getByLabel('Share link', { exact: true }).inputValue();
  const ctx = await browser.newContext(), fresh = await ctx.newPage();
  try {
    await fresh.goto(link);
    await expect(fresh.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the share link.');
    const actual = await fresh.evaluate(() => ({ state: AlmFeatures.get('dta-sroc').share.get(),
      sens: __almBivariate().sens, spec: __almBivariate().spec }));
    expect(actual).toEqual(expected);
    const restoredAxes = fresh.locator('#alm-axis-mount input');
    await expect(restoredAxes).toHaveCount(6);
    for (let i = 0; i < 6; i++) await expect(restoredAxes.nth(i)).toBeDisabled();
    expect(await fresh.evaluate(() => AlmFeaturesState.provenance)).toEqual(PROVENANCE);
    expect(new URL(fresh.url()).hash).toBe(new URL(link).hash);
    // PLANTED malformed option: validation happens before even the title changes.
    const bad = await fresh.evaluate(async () => {
      const s = AlmFeatures.get('dta-sroc').share.get(); s.title = 'must not apply'; s.method = 'bad';
      return AlmShare.encode('dta-sroc', s, []);
    });
    await fresh.goto(link.split('#')[0] + '#s=' + bad);
    await expect(fresh.locator('[data-testid=share-status]')).toContainText('Nothing was changed.');
    expect(await fresh.locator('#f-title').inputValue()).toBe(expected.state.title);
    const baseline = await fresh.evaluate(() => __almBivariate().sens);
    await fresh.goto(link.slice(0, -10));
    await expect(fresh.locator('[data-testid=share-status]')).toContainText('could not be opened');
    expect(await fresh.evaluate(() => __almBivariate().sens)).toBe(baseline);
    expect(await fresh.locator('#f-data').inputValue()).toBe(expected.state.data);
    console.log('SHARE round-trip PASS; planted invalid option and truncated link refused unchanged');
  } finally { await ctx.close(); }
});

test('AXE: all four feature tabs; keyboard navigation', async ({ page }) => {
  await open(page, 'entry');
  for (const tab of ['Data entry', 'Report text', 'Verify in R', 'Share']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await axe(page, tab);
  }
  await page.getByRole('tab', { name: 'Share', exact: true }).focus();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: 'Data entry', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Report text', exact: true })).toBeFocused();
});


test('AUTOSAVE: feature controls never enter or trigger the legacy draft', async ({ page }) => {
  await open(page, 'entry');
  await page.evaluate(() => AlmFeatures.open('dta-sroc', 'share'));
  const keys = ['alm-plot-1-format', 'alm-plot-1-physical-width', 'alm-plot-1-resolution',
    'f-cc', 'f-cov', 'f-data', 'f-example', 'f-method', 'f-title',
    'idx:1', 'idx:9', 'idx:11', 'idx:12', 'idx:13', 'idx:14', 'idx:15',
    'idx:16', 'idx:17', 'idx:18', 'idx:19'];
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('alm-autosave:dta-sroc')));
  await page.evaluate(() => {
    localStorage.removeItem('alm-autosave:dta-sroc');
    document.getElementById('f-data').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(saved).not.toBeNull();
  const disabled = await page.evaluate(() => [...document.querySelectorAll('[data-autosave-index]')]
    .filter(el => el.disabled && !el.closest('#alm-plus, #alm-features'))
    .map(el => el.id || el.name || 'idx:' + el.dataset.autosaveIndex));
  expect(Object.keys((await saved()).values).sort()).toEqual(keys.filter(k => !disabled.includes(k)).sort());
  await page.evaluate(() => {
    localStorage.removeItem('alm-autosave:dta-sroc');
    const fields = document.querySelectorAll('#alm-features textarea, #alm-features select, #alm-features input');
    if (!fields.length) throw new Error('Feature controls must be mounted');
    fields.forEach(el => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  await page.waitForTimeout(1500);
  expect(await saved()).toBeNull();
  // Positive control: the native title still saves after feature interaction.
  await page.fill('#f-title', 'Native draft control');
  await expect.poll(async () => (await saved())?.values['f-title']).toBe('Native draft control');
});
