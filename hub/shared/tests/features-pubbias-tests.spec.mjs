import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readZip, readTiff, decodePng } from './zip-reader.mjs';

const APP = 'pubbias-tests';
const PAGE = '/pubbias-tests/index.html';
const SNAP = new URL('./__snapshots__/text-pubbias-tests.json', import.meta.url);
test('REVIEW: focused failing-first regressions and planted audit failure', () => {
  const run = spawnSync(process.execPath, ['--test', '--test-isolation=none',
    fileURLToPath(new URL('./fixtures/features/pubbias-tests/review-regressions.cjs', import.meta.url))],
  { encoding: 'utf8' });
  expect(run.status, run.stdout + run.stderr).toBe(0);
});
async function open(page, tab = 'entry') {
  await page.goto(PAGE);
  await page.waitForFunction(() => window.AlmFeatures?.get('pubbias-tests') && window._almLastPubbias());
  await page.evaluate(tab => AlmFeatures.open('pubbias-tests', tab), tab);
}
async function textOutput(page) {
  return page.evaluate(() => {
    const spec = AlmFeatures.get('pubbias-tests').text, r = spec.results();
    const ctx = { app: 'pubbias-tests', build: AlmBuildInfo, entryLog: [], verify: null };
    const rendered = AlmText.render(spec.templates, r, ctx);
    const audit = AlmText.audit(rendered, r, { ctx, dom: spec.dom() });
    const norm = p => p.segments.map(s => s.type === 'ctx' && s.key.startsWith('build.') ? `<${s.key}>` : s.text).join('');
    return { r, audit, snapshot: {
      app: 'pubbias-tests', source: 'Built-in ten-study effect/SE example; default options',
      plain: norm(rendered.plain), methods: norm(rendered.methods), results: norm(rendered.results),
      flags: rendered.flags.map(norm), references: rendered.cites.map(c => c.full)
    } };
  });
}
async function axe(page, label) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(a => !a.effect || a.effect.getComputedTiming().iterations !== Infinity)
    .map(a => a.finished.catch(() => null))));
  const scan = await new AxeBuilder({ page }).include('#alm-features')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = scan.violations.filter(v => ['serious', 'critical'].includes(v.impact));
  console.log(`AXE ${label} serious/critical=${bad.length} passes=${scan.passes.length}`);
  expect(bad).toEqual([]);
}

test('ENTRY: three table formats preserve example results through the conversion/apply APIs', async ({ page }) => {
  await open(page);
  const out = await page.evaluate(() => {
    const baseline = _almLastPubbias(), spec = AlmFeatures.get('pubbias-tests');
    const rows = baseline.studies;
    const z = 1.959963984540054; // independent normal 97.5% quantile, full precision CI fixture
    const formats = [
      'Study\tyi\tsei\n' + rows.map((r, i) => `Study ${i + 1}\t${r.te}\t${r.se}`).join('\n'),
      'Study  MD\n' + rows.map((r, i) => `Study ${i + 1}  ${r.te} (${r.te - z * r.se}–${r.te + z * r.se})`).join('\n'),
      'Study or subgroup;Effect;Standard error\n' + rows.map((r, i) => `Study ${i + 1};${r.te};${r.se}`).join('\n')
    ];
    const runs = formats.map((input, i) => {
      const table = AlmEntry.parseTable(input), detection = AlmEntry.detect(table, spec.entry.schema);
      // Explicitly identify the export as generic effects: "or" in RevMan's label
      // header otherwise raises a ratio-scale question in the shared detector.
      const schema = i === 2 ? { name: 'generic', ratio: false } : spec.entry.schema;
      const converted = AlmEntry.convert(table, detection, schema, { decimal: 'point' });
      if (converted.flags.some(f => f.blocking)) return { flags: converted.flags };
      const applied = spec.entry.apply(converted.records);
      AlmFeaturesState.entryLog = converted.steps;
      return { applied, flags: converted.flags, steps: converted.steps, result: _almLastPubbias() };
    });
    return { baseline, runs };
  });
  for (const [index, run] of out.runs.entries()) {
    expect(run.flags.filter(f => f.blocking)).toEqual([]);
    expect(run.applied).toEqual({ ok: true, n: 10 });
    // CI reconstruction can split exact SE ties at machine precision. Begg's
    // rank test is discontinuous at ties; the required main result is Egger t.
    const keys = index === 1 ? ['egger_t', 'egger_p', 'tf_est'] : ['egger_t', 'egger_p', 'begg_tau', 'begg_p', 'tf_est'];
    for (const key of keys) {
      expect(Math.abs(run.result[key] - out.baseline[key])).toBeLessThanOrEqual(Math.abs(out.baseline[key]) * 1e-9);
    }
    expect(run.result.tf_k0).toBe(out.baseline.tf_k0);
  }
  expect(out.runs[1].steps).toHaveLength(10);
  expect(out.runs[1].steps.every(s => s.method === 'SE from CI')).toBe(true);
  console.log('ENTRYRT 3/3 formats; 10/10 CI conversion records');
});

test('ENTRY PLANTED: reversed CI blocks application; conversion log and disabled button', async ({ page }) => {
  await open(page);
  const out = await page.evaluate(() => {
    const spec = AlmFeatures.get('pubbias-tests');
    const before = spec.share.get();
    const pasted = 'Study  MD\nBad  0.25 (0.5–0.1)';
    const table = AlmEntry.parseTable(pasted), detected = AlmEntry.detect(table, 'generic');
    const bad = AlmEntry.convert(table, detected, 'generic', {});
    // Exercise the shared table UI via its public parse API, independent of the
    // source-confirmation UI being developed in the entry lane.
    const host = document.createElement('div'); host.id = 'entry-table-gate'; document.body.append(host);
    const ui = AlmEntryUI.mount(host, { schema: 'generic', apply: spec.entry.apply });
    host.querySelector('textarea').value = pasted; ui.parse();
    let rejected = false;
    try { spec.entry.apply(Array.from({ length: 10 }, () => ({ yi: 0.2, sei: -0.1 }))); }
    catch { rejected = true; }
    return { flags: bad.flags, before, after: spec.share.get(), rejected };
  });
  expect(out.flags.some(f => f.blocking)).toBe(true);
  expect(out.rejected).toBe(true); expect(out.after).toEqual(out.before);
  await expect(page.locator('#entry-table-gate').getByRole('button', { name: 'Use these rows', exact: true })).toBeDisabled();
  await expect(page.locator('#entry-table-gate').getByRole('heading', { name: 'Conversion log' })).toBeVisible();
  await expect(page.locator('#entry-table-gate .alm-entry-block').first()).toBeVisible();
  console.log('ENTRY PLANTED 2/2 rejection gates; conversion log visible');
});

test('TEXT: audit, every displayed result, snapshot and report downloads', async ({ page }, info) => {
  await open(page, 'text');
  const out = await textOutput(page);
  console.log(`TEXTAUDIT ${out.audit.passed}/${out.audit.checks} domChecked=${out.audit.domChecked}`);
  expect(out.audit.failures).toEqual([]); expect(out.audit.ok).toBe(true);
  expect(out.audit.domChecked).toBeGreaterThanOrEqual(12);
  // Only these nine comparisons are independent of results()'s DOM reads.
  // Thompson, Peters, Harbord and sel_unadjusted check display consistency only.
  const independentKeys = await page.evaluate(() => Object.keys(AlmPubbiasFeatures.text.dom())
    .filter(key => Object.hasOwn(_almLastPubbias(), key)));
  expect(independentKeys).toEqual(['egger_t', 'egger_p', 'begg_tau', 'begg_p',
    'tf_k0', 'tf_est', 'sel_delta2', 'sel_LRTp', 'sel_mu']);
  console.log(`TEXTDOM independent=${independentKeys.length}; other checks validate display consistency`);
  const shown = await page.locator('#body tr').evaluateAll(rows => rows.flatMap(row => {
    if (row.cells.length !== 5) return [];
    const label = row.cells[0].querySelector('code')?.textContent;
    if (label === 'Trim-and-fill') return [row.cells[1].textContent.replace('k0=', ''), row.cells[3].textContent.replace('adjusted est=', '')];
    if (label?.startsWith('Selection model')) return [
      row.cells[1].textContent.split('=')[1], row.cells[2].textContent,
      ...row.cells[3].textContent.match(/-?\d+\.\d+/g)
    ];
    return [row.cells[1].textContent, row.cells[2].textContent];
  }));
  for (const value of shown) expect(out.snapshot.results.replace(/−/g, '-')).toContain(value);
  console.log(`TEXTDOM ${shown.length}/${shown.length}`);
  const actual = info.outputPath('text-pubbias-tests.json');
  fs.writeFileSync(actual, JSON.stringify(out.snapshot, null, 2) + '\n');
  await info.attach('reviewable-text', { path: actual, contentType: 'application/json' });
  expect(out.snapshot).toEqual(JSON.parse(fs.readFileSync(SNAP, 'utf8')));
  await expect(page.locator('#alm-f-panel-text .alm-text-body')).toBeVisible();
  for (const ext of ['md', 'docx']) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator(`.alm-text-${ext}`).click()]);
    const bytes = fs.readFileSync(await dl.path());
    expect(dl.suggestedFilename()).toBe(`${APP}-report-text.${ext}`);
    if (ext === 'md') expect(bytes.toString()).toContain(out.snapshot.results);
    else expect(readZip(bytes).map(e => e.name)).toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']));
  }
  console.log('TEXTEXPORT 2/2');
});

test('TEXT PLANTED: DOM mismatch withholds text, recovery and binary coverage', async ({ page }) => {
  await open(page, 'text');
  await page.evaluate(() => { window.__almTextPerturb = { key: 'egger_t', delta: 1 }; });
  const out = await textOutput(page);
  expect(out.audit.ok).toBe(false);
  expect(out.audit.failures.map(f => f.check)).toContain('dom:egger_t');
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-status')).toContainText('Number audit failed');
  await expect(page.locator('.alm-text-body')).toBeHidden();
  console.log(`TEXTAUDIT planted ${out.audit.passed}/${out.audit.checks} FAIL`);
  await page.evaluate(() => { delete window.__almTextPerturb; });
  await page.locator('#format').selectOption('binary');
  await page.locator('.alm-text-regenerate').click();
  const binary = await textOutput(page);
  expect(binary.audit.ok, JSON.stringify(binary.audit.failures)).toBe(true);
  expect(binary.audit.domChecked).toBe(16);
  expect(binary.snapshot.results).toContain('Peters: t =');
  expect(binary.snapshot.results).toContain('Harbord: t =');
  console.log(`TEXTAUDIT binary ${binary.audit.passed}/${binary.audit.checks}`);
  await page.locator('#src').fill('0.2,0.1');
  await page.locator('#format').evaluate(el => { el.value = 'te-se'; });
  await page.locator('#btn-run').click();
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-status')).toHaveText('Run the analysis first.');
});

test('VERIFY: live R, funnel exports, receipt, planted failure and stale text', async ({ page }) => {
  test.setTimeout(900_000);
  await open(page, 'verify');
  const panel = page.locator('#alm-f-panel-verify'), summary = panel.locator('[data-testid=verify-summary]');
  await expect(panel).toContainText('Thompson–Sharp is excluded');
  await expect(panel).toContainText('not validated against metafor');
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(summary).toHaveText(/^11 of 11 quantities match R — PASS$/, { timeout: 600_000 });
  const message = await summary.innerText();
  const m = /^(\d+) of (\d+) quantities match R — PASS$/.exec(message);
  expect(m, message).not.toBeNull();
  const n = +m[2]; expect(n).toBe(11); expect(+m[1]).toBe(n);
  console.log(`VERIFY ${m[1]}/${n}`);
  expect(await panel.locator('tbody td[data-result]').allTextContents()).toEqual(Array(n).fill('PASS'));
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('pubbias-tests'))).toBe(true);
  await expect(panel.locator('figure img')).toHaveCount(1);
  await expect(panel.locator('figure svg')).toHaveCount(1);
  const [dl] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download everything (ZIP)', exact: true }).click()]);
  const files = Object.fromEntries(readZip(fs.readFileSync(await dl.path())).map(e => [e.name, e.bytes]));
  for (const name of [`${APP}-verify.R`, `${APP}-verify-comparison.csv`, 'sessionInfo.txt', 'console.txt',
    `${APP}-funnel-R-300dpi.png`, `${APP}-funnel-R.pdf`, `${APP}-funnel-R-300dpi.tiff`, 'truthcert.json']) expect(files[name], name).toBeDefined();
  const dec = bytes => new TextDecoder().decode(bytes);
  expect(dec(files[`${APP}-verify.R`])).toContain('metafor::funnel(m');
  expect(dec(files[`${APP}-verify-comparison.csv`]).trim().split('\n')).toHaveLength(n + 1);
  expect(dec(files['console.txt'])).toContain('ALMJSON:');
  expect(dec(files[`${APP}-funnel-R.pdf`].subarray(0, 5))).toBe('%PDF-');
  const png = decodePng(files[`${APP}-funnel-R-300dpi.png`]);
  expect([png.width, png.height]).toEqual([2400, 1800]);
  const tif = readTiff(files[`${APP}-funnel-R-300dpi.tiff`]);
  expect(tif.tags[282].value).toEqual([300, 1]);
  const receipt = JSON.parse(dec(files['truthcert.json']));
  expect(await page.evaluate(r => AlmTruthCertExport.verifyContentHash(r), receipt)).toBe(true);
  console.log(`VERIFYZIP ${Object.keys(files).length}/${Object.keys(files).length} entries; PNG/PDF/TIFF and content hash valid`);
  await page.evaluate(() => AlmFeatures.open('pubbias-tests', 'text'));
  await expect(page.locator('[data-para=methods]')).toContainText('Results were independently verified in R');
  const src = await page.locator('#src').inputValue();
  await page.locator('#src').fill(src.replace('0.25', '0.26'));
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('[data-para=methods]')).not.toContainText('Results were independently verified in R');
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('pubbias-tests'))).toBe(false);
  await page.locator('#src').fill(src);
  await page.evaluate(() => {
    window.__almVerifyPerturb = { key: 'egger_lm_statistic', delta: 0.1 };
    AlmFeatures.open('pubbias-tests', 'verify');
  });
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(summary).toContainText('FAIL', { timeout: 300_000 });
  expect(await panel.locator('tbody td[data-result]').allTextContents()).toEqual(['FAIL', ...Array(n - 1).fill('PASS')]);
  console.log(`VERIFY planted ${n - 1}/${n} FAIL`);
});

test('VERIFY BINARY: meta rows, planted failure and verified inputs with unrun results', async ({ page }) => {
  test.setTimeout(900_000);
  await open(page, 'verify');
  await page.locator('#format').selectOption('binary');
  const panel = page.locator('#alm-f-panel-verify');
  const summary = panel.locator('[data-testid=verify-summary]');
  const verify = panel.getByRole('button', { name: 'Verify this analysis in R', exact: true });
  await verify.click();
  await expect(summary).toHaveText('15 of 15 quantities match R — PASS', { timeout: 600_000 });
  const receipt = await page.evaluate(() => AlmFeaturesState.verify);
  expect(receipt.rows).toHaveLength(15);
  expect(receipt.rows.every(row => row.pass)).toBe(true);
  for (const key of ['peters_statistic', 'peters_p', 'harbord_statistic', 'harbord_p']) {
    expect(receipt.rows.find(row => row.key === key)?.pass, key).toBe(true);
  }
  expect(receipt.versions.meta).toMatch(/^\d/);
  expect(receipt.versions.metafor).toMatch(/^\d/);
  console.log('VERIFY 15/15 binary (including Peters and Harbord via meta)');
  await page.evaluate(() => AlmFeatures.open('pubbias-tests', 'text'));
  await expect(page.locator('[data-para=methods]')).toContainText('Results were independently verified in R');
  await expect(page.locator('[data-para=methods]')).toContainText('Peters and Harbord were compared using meta');

  // Verify edited inputs without running the app. A fresh passing R receipt
  // must not certify the older results still displayed by the engine.
  const before = await page.evaluate(() => _almLastPubbias());
  const src = await page.locator('#src').inputValue();
  await page.locator('#src').fill(src.replace(/\d+/, n => String(Number(n) + 1)));
  await page.evaluate(() => AlmFeatures.open('pubbias-tests', 'verify'));
  await verify.click();
  await expect(summary).toHaveText('15 of 15 quantities match R — PASS', { timeout: 300_000 });
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('pubbias-tests'))).toBe(true);
  expect(await page.evaluate(() => _almLastPubbias())).toEqual(before);
  expect(await page.evaluate(() => AlmPubbiasFeatures.text.results().verified)).toBe(false);
  await page.evaluate(() => AlmFeatures.open('pubbias-tests', 'text'));
  await expect(page.locator('[data-para=methods]')).not.toContainText('Results were independently verified in R');
  await expect(page.locator('[data-para=methods]')).not.toContainText('This comparison covers');

  await page.locator('#src').fill(src);
  await page.evaluate(() => {
    window.__almVerifyPerturb = { key: 'peters_statistic', delta: 0.1 };
    AlmFeatures.open('pubbias-tests', 'verify');
  });
  await verify.click();
  await expect(summary).toContainText('14 of 15 quantities match R — FAIL', { timeout: 300_000 });
  const failed = await page.evaluate(() => AlmFeaturesState.verify.rows.filter(row => !row.pass).map(row => row.key));
  expect(failed).toEqual(['peters_statistic']);
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('pubbias-tests'))).toBe(false);
  console.log('VERIFY planted 14/15 binary FAIL');
});

for (const pkg of ['metafor', 'meta']) {
  test(`VERIFY UNAVAILABLE: stubbed ${pkg} failure withholds receipt and preserves script download`, async ({ page }) => {
    await open(page, 'verify');
    await page.evaluate(pkg => {
      window.AlmWebR = { runRPlots: async () => ({ ok: false, error: 'Package not in pinned repository: ' + pkg }) };
    }, pkg);
    const panel = page.locator('#alm-f-panel-verify');
    await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
    await expect(panel.locator('[data-testid=verify-summary]'))
      .toContainText(`Not checked in the browser: R package ${pkg} is unavailable`);
    expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('pubbias-tests'))).toBe(false);
    expect(await panel.locator('tbody td[data-result]').allTextContents()).toEqual([]);
    const [download] = await Promise.all([page.waitForEvent('download'),
      panel.getByRole('button', { name: 'R script (.R)', exact: true }).click()]);
    expect(download.suggestedFilename()).toBe(`${APP}-verify.R`);
    expect(fs.readFileSync(await download.path(), 'utf8')).toContain('library(metafor)');
    await page.evaluate(() => AlmFeatures.open('pubbias-tests', 'text'));
    await expect(page.locator('[data-para=methods]')).not.toContainText('Results were independently verified in R');
  });
}

test('SHARE: binary data, all axis options, log/provenance round trip; corrupt and invalid links refuse atomically', async ({ page, browser, baseURL }) => {
  await open(page, 'share');
  const defaultSrc = await page.locator('#src').inputValue();
  await page.locator('#format').selectOption('binary');
  await page.locator('#alm-axis-mount input[data-axis=x][data-edge=min]').fill('-2');
  await page.locator('#alm-axis-mount input[data-axis=x][data-edge=min]').dispatchEvent('change');
  await page.locator('#alm-axis-mount input[data-axis=y][data-edge=max]').fill('0.9');
  await page.locator('#alm-axis-mount input[data-axis=y][data-edge=max]').dispatchEvent('change');
  await page.evaluate(() => {
    AlmFeaturesState.entryLog = [{ method: 'scale confirmed', study: 'A', text: 'Analysis scale confirmed' }];
    AlmFeaturesState.provenance = [{ id: 'example', label: 'Example', reference: 'Built-in example', location: 'Input',
      pastedText: document.getElementById('src').value, values: [], conversions: [], flags: [], choice: {},
      usedAs: 'binary log odds ratio', confirmed: true, confirmedAt: '2026-10-20T10:00:00Z' }];
  });
  const before = await page.evaluate(() => ({ state: AlmFeatures.get('pubbias-tests').share.get(),
    provenance: AlmFeaturesState.provenance, result: _almLastPubbias(), svg: document.getElementById('funnel').innerHTML }));
  await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
  await expect(page.locator('#alm-f-share-link')).toHaveValue(/#s=/);
  const link = await page.locator('#alm-f-share-link').inputValue();
  const context = await browser.newContext({ baseURL });
  try {
    const fresh = await context.newPage(); await fresh.goto(link);
    await expect(fresh.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the share link.');
    const after = await fresh.evaluate(() => ({ state: AlmFeatures.get('pubbias-tests').share.get(),
      provenance: AlmFeaturesState.provenance, result: _almLastPubbias(), svg: document.getElementById('funnel').innerHTML }));
    expect(after).toEqual(before);
    const corrupt = await context.newPage();
    await corrupt.goto(new URL(PAGE, baseURL).href + '#s=not-a-valid-packed-state');
    await expect(corrupt.locator('[data-testid=share-status]')).toContainText('Nothing was changed.');
    await expect(corrupt.locator('#src')).toHaveValue(defaultSrc);
    const refused = await page.evaluate(() => {
      const share = AlmFeatures.get('pubbias-tests').share, old = share.get();
      try { share.set({ ...old, src: 'changed', axes: ['NaN'] }); } catch {}
      return JSON.stringify(old) === JSON.stringify(share.get());
    });
    expect(refused).toBe(true);
    console.log('SHARE 3/3 round-trip, corrupt link, invalid state');
  } finally { await context.close(); }
});

test('AXE: all four feature tabs have no serious or critical violations', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await open(page);
  for (const tab of ['entry', 'text', 'verify', 'share']) {
    await page.evaluate(tab => AlmFeatures.open('pubbias-tests', tab), tab);
    await axe(page, tab);
  }
  expect(errors).toEqual([]);
});
