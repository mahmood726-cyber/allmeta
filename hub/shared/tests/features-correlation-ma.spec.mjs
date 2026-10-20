import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { readZip, readTiff, decodePng } from './zip-reader.mjs';

const APP = 'correlation-ma', PAGE = '/' + APP + '/index.html';
const SNAP = new URL('__snapshots__/text-correlation-ma.json', import.meta.url);
function watchOutsideRequests(page, baseURL) {
  // Before the first navigation commits, page.url() is still about:blank.
  // Keep the allowed origin fixed so an external navigation cannot redefine it.
  const origin = new URL(PAGE, baseURL).origin, outside = [];
  page.on('request', req => {
    if (/^https?:/.test(req.url()) && new URL(req.url()).origin !== origin) outside.push(req.url());
  });
  return outside;
}
async function open(page, tab) {
  await page.goto(PAGE);
  await page.waitForFunction(() => window.AlmFeatures && AlmFeatures.get('correlation-ma'));
  await page.locator('#alm-features .alm-f-toggle').click();
  if (tab) await page.getByRole('tab', { name: tab, exact: true }).click();
}
async function render(page) {
  return page.evaluate(app => {
    const spec = AlmFeatures.get(app).text, r = spec.results();
    const ctx = { app, build: AlmBuildInfo, entryLog: [], verify: null };
    const out = AlmText.render(spec.templates, r, ctx);
    const norm = p => p.segments.map(s => s.type === 'ctx' && s.key.startsWith('build.') ? '<' + s.key + '>' : s.text).join('');
    return {
      audit: AlmText.audit(out, r, { ctx, dom: spec.dom() }),
      snapshot: { app, source: 'Built-in example; default REML estimator',
        plain: norm(out.plain), methods: norm(out.methods), results: norm(out.results),
        flags: out.flags.map(norm), references: out.cites.map(c => c.full) }
    };
  }, APP);
}

test('ENTRY: three table formats reproduce the built-in analysis via entry APIs', async ({ page }) => {
  await open(page, 'Data entry');
  const checks = await page.evaluate(() => {
    const baseline = structuredClone(_almLastCorrMA()), rows = baseline.studies;
    // Synthetic formatting fixtures from the built-in data, not claims of real paper extraction.
    // Paper-style table retains r separately: the shared correlation parser needs raw r and n.
    const formats = [
      'Study\tr\tn\n' + rows.map(s => `${s.label}\t${s.r}\t${s.n}`).join('\n'),
      'Study  r  n  95% CI\n' + rows.map(s =>
        `${s.label}  ${s.r}  ${s.n}  ${s.r} (${(s.r - .1).toFixed(2)}–${(s.r + .1).toFixed(2)})`).join('\n'),
      'Study ID;Pearson r;Sample size\n' + rows.map(s => `${s.label};${s.r};${s.n}`).join('\n')
    ];
    return formats.map(text => {
      const table = AlmEntry.parseTable(text), detection = AlmEntry.detect(table, 'correlation');
      const converted = AlmEntry.convert(table, detection, 'correlation');
      if (converted.flags.some(f => f.blocking)) return { flags: converted.flags };
      const applied = AlmFeatures.get('correlation-ma').entry.apply(converted.records);
      return { flags: converted.flags.filter(f => f.blocking), applied, actual: _almLastCorrMA(), baseline };
    });
  });
  for (const c of checks) {
    expect(c.flags).toEqual([]);
    expect(c.applied).toEqual({ ok: true, n: 8 });
    expect(c.actual.studies).toEqual(c.baseline.studies);
    for (const k of ['r', 'r_lo', 'r_hi', 'tau2_z', 'mu_z', 'I2', 'r_pi_lo', 'r_pi_hi']) {
      expect(Math.abs(c.actual[k] - c.baseline[k])).toBeLessThanOrEqual(1e-9 * Math.abs(c.baseline[k]));
    }
  }
  console.log(`ENTRYRT ${checks.length}/${checks.length} formats; exact study membership and sample sizes`);
  await expect(page.getByRole('heading', { name: 'Conversion log', exact: true })).toBeVisible();
});

test('ENTRY PLANTED: bad sample size blocks conversion; invalid application is atomic', async ({ page }) => {
  await open(page, 'Data entry');
  const result = await page.evaluate(() => {
    const t = AlmEntry.parseTable('Study\tr\tn\nBad\t0.4\t0\nGood\t0.3\t40');
    const bad = AlmEntry.convert(t, AlmEntry.detect(t, 'correlation'), 'correlation');
    const spec = AlmFeatures.get('correlation-ma'), before = spec.share.get(), rejected = [];
    for (const row of [
      { study: 'Bad', ri: 1, ni: 30 }, { study: 'Bad', ri: -.2, ni: 3 },
      { study: '# hidden', ri: .2, ni: 40 }, { study: 'Injected\nrow', ri: .2, ni: 40 },
      bad.records[0]
    ]) {
      try { spec.entry.apply([{ study: 'Good', ri: .3, ni: 40 }, row]); rejected.push(false); }
      catch { rejected.push(true); }
    }
    // Drive the UI's public parse API without clicking entry controls (lane requirement).
    const host = document.createElement('div'), ui = AlmEntryUI.mount(host, spec.entry);
    host.querySelector('textarea').value = t.source;
    ui.parse();
    const disabled = [...host.querySelectorAll('button')].find(b => b.textContent === 'Use these rows').disabled;
    const loggedBlock = host.querySelector('.alm-entry-block').textContent;
    ui.destroy();
    return { flags: bad.flags, before, after: spec.share.get(), rejected, disabled, loggedBlock };
  });
  expect(result.flags.some(f => f.blocking && f.code === 'sample-size')).toBe(true);
  expect(result.rejected).toEqual([true, true, true, true, true]);
  expect(result.after).toEqual(result.before);
  expect(result.disabled).toBe(true);
  expect(result.loggedBlock).toContain('Bad');
  console.log('ENTRY PLANTED sample-size blocked; atomic rejections 5/5');
  console.log('ENTRYUI 2/2 blocking log present; Use these rows disabled');
});

test('TEXT: number audit, displayed values, snapshot and export downloads', async ({ page }, info) => {
  await open(page, 'Report text');
  const out = await render(page);
  console.log(`TEXTAUDIT ${out.audit.passed}/${out.audit.checks} domChecked=${out.audit.domChecked}`);
  expect(out.audit.failures).toEqual([]);
  expect(out.audit.ok).toBe(true);
  expect(out.audit.domChecked).toBeGreaterThanOrEqual(9);
  const head = await page.locator('#headline').innerText();
  const m = /pooled r = ([-.\d]+) \[([-.\d]+), ([-.\d]+)\] · τ²\(z\) = ([-.\d]+) · I² = ([-.\d]+)%/.exec(head);
  for (const value of m.slice(1)) expect(out.snapshot.results).toContain(value);
  expect(out.snapshot.results).toContain(await page.locator('#res-body .pooled-row td').nth(3).innerText());
  expect(out.snapshot.results).toContain('included ' + /k = (\d+)/.exec(head)[1] + ' studies');
  console.log('TEXTDOM 7/7');
  const actual = info.outputPath('text-correlation-ma.json');
  fs.writeFileSync(actual, JSON.stringify(out.snapshot, null, 2) + '\n');
  await info.attach('text-correlation-ma', { path: actual, contentType: 'application/json' });
  expect(out.snapshot).toEqual(JSON.parse(fs.readFileSync(SNAP, 'utf8')));
  const panel = page.locator('#alm-f-panel-text');
  await expect(panel.locator('.alm-text-body')).toBeVisible();
  const [md] = await Promise.all([page.waitForEvent('download'), panel.locator('.alm-text-md').click()]);
  expect(fs.readFileSync(await md.path(), 'utf8')).toContain(out.snapshot.results);
  const [docx] = await Promise.all([page.waitForEvent('download'), panel.locator('.alm-text-docx').click()]);
  const entries = readZip(fs.readFileSync(await docx.path()));
  expect(entries.map(e => e.name)).toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']));
  expect(new TextDecoder().decode(entries.find(e => e.name === 'word/document.xml').bytes)).toContain(out.snapshot.results);
  console.log(`TEXTEXPORT 2/2 DOCX entries=${entries.length}`);
});

test('TEXT PLANTED: changed result fails DOM audit and withholds text', async ({ page }) => {
  await open(page, 'Report text');
  await page.evaluate(() => { window.__almTextPerturb = { key: 'r', delta: .1 }; });
  const out = await render(page);
  expect(out.audit.ok).toBe(false);
  expect(out.audit.failures.map(f => f.check)).toContain('dom:r');
  console.log(`TEXTAUDIT planted ${out.audit.passed}/${out.audit.checks} FAIL dom:r`);
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-status')).toContainText('Number audit failed');
  await expect(page.locator('.alm-text-body')).toBeHidden();
  await page.evaluate(() => { delete window.__almTextPerturb; });
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-body')).toBeVisible();
});

test('TEXT: all estimators, negative and null-crossing effects, two studies, refused input', async ({ page }) => {
  await open(page, 'Report text');
  for (const method of ['REML', 'PM', 'DL', 'FE']) {
    await page.locator('#f-method').selectOption(method);
    const out = await render(page);
    expect(out.audit.ok, JSON.stringify(out.audit.failures)).toBe(true);
    expect(out.snapshot.methods).toContain(method === 'FE' ? 'fixed-effect (common-effect)' :
      { REML: 'restricted maximum likelihood', PM: 'Paule–Mandel', DL: 'DerSimonian–Laird' }[method]);
    expect(out.snapshot.results.includes('prediction interval')).toBe(method !== 'FE');
  }
  await page.locator('#f-method').selectOption('PM');
  await page.locator('#f-data').fill('A, -.1, 40\nB, .1, 40');
  const small = await render(page);
  expect(small.audit.ok, JSON.stringify(small.audit.failures)).toBe(true);
  expect(small.snapshot.plain).toContain('includes no association');
  expect(small.snapshot.results).toContain('prediction interval');
  expect(small.snapshot.flags).toContain('Few studies: heterogeneity estimates and prediction limits are imprecise.');
  await page.locator('#f-data').fill('A, -.4, 40\nB, -.3, 60');
  expect((await render(page)).audit.ok).toBe(true);
  await page.locator('#f-data').fill('');
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-status')).toHaveText('Run the analysis first.');
  console.log('TEXTOPTIONS 7/7');
});

test('NETWORK PLANTED: initial app navigation is local; external navigation stays outside', async ({ page, baseURL }) => {
  const outside = watchOutsideRequests(page, baseURL);
  expect(page.url()).toBe('about:blank');
  await open(page);
  expect(outside).toEqual([]);
  // Fulfil locally: exercise real request events without contacting an external server.
  const foreign = 'https://alm-network-check.invalid';
  await page.route(foreign + '/**', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Planted external request</title>'
  }));
  await page.goto(foreign + '/first');
  expect(outside).toEqual([foreign + '/first']);
  await page.goto(foreign + '/second');
  expect(outside).toEqual([foreign + '/first', foreign + '/second']);
  console.log('NETWORK initial navigation local; planted external requests 2/2 detected');
});

test('VERIFY: live webR passes, forest downloads and ZIP; planted result fails', async ({ page, baseURL }) => {
  test.setTimeout(900_000);
  const outside = watchOutsideRequests(page, baseURL), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, 'Verify in R');
  const panel = page.locator('#alm-f-panel-verify'), summary = panel.locator('[data-testid=verify-summary]');
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(summary).not.toBeEmpty({ timeout: 600_000 });
  const text = await summary.innerText();
  const m = /^(\d+) of (\d+) quantities match R — PASS$/.exec(text);
  expect(m, text).not.toBeNull();
  const n = +m[2];
  expect(n).toBeGreaterThanOrEqual(5); expect(+m[1]).toBe(n);
  expect(await panel.locator('td[data-result]').allTextContents()).toEqual(Array(n).fill('PASS'));
  console.log(`VERIFY ${m[1]}/${m[2]}`);
  await expect(panel.locator('figure svg')).toHaveCount(1);
  await expect(panel.locator('figure img')).toHaveCount(1);
  expect(await panel.locator('figure img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download everything (ZIP)', exact: true }).click()]);
  expect(download.suggestedFilename()).toBe(APP + '-verify-in-r.zip');
  const entries = Object.fromEntries(readZip(fs.readFileSync(await download.path())).map(e => [e.name, e.bytes]));
  for (const name of [APP + '-verify.R', APP + '-verify-comparison.csv', 'sessionInfo.txt', 'console.txt',
    APP + '-forest-R-300dpi.png', APP + '-forest-R.pdf', APP + '-forest-R-300dpi.tiff', 'truthcert.json']) expect(entries[name], name).toBeDefined();
  expect(Object.keys(entries).filter(n => /-forest-(R|app)\.svg$/.test(n))).toHaveLength(1);
  const decode = b => new TextDecoder().decode(b);
  expect(decode(entries[APP + '-verify.R'])).toContain('metafor::escalc');
  expect(decode(entries[APP + '-verify.R'])).toContain('metafor::forest(m, transf=tanh');
  expect(decode(entries['sessionInfo.txt'])).toContain('metafor');
  expect(decode(entries[APP + '-forest-R.pdf']).slice(0, 5)).toBe('%PDF-');
  const png = decodePng(entries[APP + '-forest-R-300dpi.png']);
  expect([png.width, png.height]).toEqual([2400, 1800]);
  expect(png.phys).toEqual({ x: 11811, y: 11811, unit: 1 });
  const tif = readTiff(entries[APP + '-forest-R-300dpi.tiff']);
  expect(tif.tags[282].value).toEqual([300, 1]); expect(tif.tags[283].value).toEqual([300, 1]);
  const receipt = JSON.parse(decode(entries['truthcert.json']));
  expect(receipt.extra.results.passed).toBe(true);
  expect(await page.evaluate(r => AlmTruthCertExport.verifyContentHash(r), receipt)).toBe(true);
  console.log(`VERIFYZIP ${Object.keys(entries).length} entries; PNG/TIFF 300dpi`);
  await page.getByRole('tab', { name: 'Report text', exact: true }).click();
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('[data-para=methods]')).toContainText('independently verified in R');
  await page.locator('#f-method').selectOption('DL');
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('[data-para=methods]')).not.toContainText('independently verified in R');
  await page.locator('#f-method').selectOption('REML');
  await page.getByRole('tab', { name: 'Verify in R', exact: true }).click();
  await page.evaluate(() => { window.__almVerifyPerturb = { key: 'tau2_z', delta: .01 }; });
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(summary).toContainText('FAIL', { timeout: 300_000 });
  const failed = await panel.locator('tbody tr').evaluateAll(rows => rows.filter(r => r.querySelector('[data-result]').textContent !== 'PASS').map(r => r.dataset.key));
  expect(failed).toEqual(['tau2_z']);
  console.log(`VERIFY planted ${n - 1}/${n} FAIL tau2_z`);
  expect(outside).toEqual([]); expect(errors).toEqual([]);
});

test('SHARE: data, estimator, provenance, result round trip; corrupted and invalid links are atomic', async ({ page, context }) => {
  await open(page, 'Share');
  const original = await page.locator('#f-data').inputValue();
  await page.locator('#f-data').fill('Alpha, -.25, 40\nBeta, .3, 60\nGamma, .1, 80');
  await page.locator('#f-method').selectOption('DL');
  const prov = [{ label: 'Alpha', reference: 'Synthetic share fixture', location: 'Table 1', confirmed: true }];
  await page.evaluate(p => { AlmFeaturesState.provenance = p; }, prov);
  const before = await page.evaluate(() => ({ state: AlmFeatures.get('correlation-ma').share.get(), result: _almLastCorrMA() }));
  await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
  const link = await page.getByLabel('Share link', { exact: true }).inputValue();
  const restored = await context.newPage();
  await restored.goto(link);
  await expect(restored.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the share link.');
  expect(await restored.evaluate(() => ({ state: AlmFeatures.get('correlation-ma').share.get(), result: _almLastCorrMA() }))).toEqual(before);
  expect(await restored.evaluate(() => AlmFeaturesState.provenance)).toEqual(prov);
  const invalid = await page.evaluate(() => AlmShare.encode('correlation-ma', { data: 'Changed, .2, 40', method: 'BOGUS' }, []));
  for (const hash of [link.split('#s=')[1].slice(0, -10), invalid]) {
    const bad = await context.newPage();
    await bad.goto(link.split('#')[0] + '#s=' + hash);
    await expect(bad.locator('[data-testid=share-status]')).toContainText('Nothing was changed.');
    expect(await bad.locator('#f-data').inputValue()).toBe(original);
    expect(await bad.locator('#f-method').inputValue()).toBe('REML');
  }
  console.log('SHARE 3/3 round trip + corrupt/invalid refusals');
});

test('AXE: all feature tabs, keyboard navigation, no serious or critical violations', async ({ page }) => {
  await open(page);
  for (const name of ['Data entry', 'Report text', 'Verify in R', 'Share']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await page.evaluate(() => Promise.all(document.getAnimations().filter(a => !a.effect || a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => null))));
    const scan = await new AxeBuilder({ page }).include('#alm-features').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const bad = scan.violations.filter(v => ['serious', 'critical'].includes(v.impact));
    expect(bad).toEqual([]);
    console.log(`AXE ${name}: ${bad.length} serious/critical; ${scan.passes.length} rules passed`);
  }
  await page.getByRole('tab', { name: 'Share', exact: true }).focus();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: 'Data entry', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Report text', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('REGRESSION: published offline replay remains green with features mounted', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);
  const out = await page.evaluate(() => AlmCorrValidation.runCorpus());
  expect(out.failed).toEqual([]);
  expect(out.passed).toBe(out.checks);
  console.log(`REPLAY ${out.passed}/${out.checks}`);
});
