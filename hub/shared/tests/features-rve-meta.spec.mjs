import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readZip } from './zip-reader.mjs';

const APP = 'rve-meta', PAGE = '/rve-meta/index.html';
const SNAP = fileURLToPath(new URL('./__snapshots__/text-rve-meta.json', import.meta.url));
async function open(page) {
  await page.goto(PAGE);
  await expect(page.locator('#coef-body tr')).toHaveCount(3);
  await page.waitForFunction(() => window.AlmFeatures?.get('rve-meta'));
}
async function tab(page, key) {
  await page.evaluate(key => AlmFeatures.open('rve-meta', key), key);
}
async function render(page) {
  return page.evaluate(() => {
    const spec = AlmFeatures.get('rve-meta').text, r = spec.results();
    const ctx = { app: 'rve-meta', build: AlmBuildInfo, entryLog: [], verify: null };
    const rendered = AlmText.render(spec.templates, r, ctx);
    const audit = AlmText.audit(rendered, r, { ctx, dom: spec.dom() });
    const norm = p => p.segments.map(s => s.type === 'ctx' && s.key.startsWith('build.') ? '<' + s.key + '>' : s.text).join('');
    return { audit, text: rendered.results.text, snapshot: {
      app: 'rve-meta', source: 'Built-in example; CORR, CR2, rho 0.8; intervention and dose_weeks predictors.',
      plain: norm(rendered.plain), methods: norm(rendered.methods), results: norm(rendered.results),
      flags: rendered.flags.map(norm), references: rendered.cites.map(c => c.full)
    } };
  });
}

test('ENTRY: three table formats preserve the built-in example and all moderators', async ({ page }) => {
  await open(page);
  const out = await page.evaluate(() => {
    const spec = AlmFeatures.get('rve-meta'), baseline = __almLastRVE();
    const native = document.getElementById('src').value.split('\n').map(line => line.split(/\s*,\s*/));
    // Synthetic, lossless reformattings of the example, not claims about a held-out paper/export corpus.
    const formats = [
      ['study\tcluster\tyi\tSE\tintervention\tdose_weeks', '\t', false],
      ['study  cluster  Effect  intervention  dose_weeks', '  ', true],
      ['Study ID\tcluster\tEffect size\tStandard error\tintervention\tdose_weeks', '\t', false]
    ];
    return formats.map(([header, delimiter, paper]) => {
      const paste = [header, ...native.map((r, i) => {
        const yi = +r[1], se = Math.sqrt(+r[2]);
        const effect = paper ? `${yi} (${yi - 1.959963984540054 * se}–${yi + 1.959963984540054 * se})` : yi;
        return [`Effect ${i + 1}`, r[0], effect, ...(paper ? [] : [se]), r[3], r[4]].join(delimiter);
      })].join('\n');
      const table = AlmEntry.parseTable(paste), detected = AlmEntry.detect(table, spec.entry.schema);
      const mapping = { ...detected.mapping };
      table.header.forEach((h, i) => { if (spec.entry.extras.includes(h)) mapping[i] = h; });
      // Passing the explicit map is the user's column decision (no inferred cluster/moderators).
      const converted = AlmEntry.convert(table, mapping, spec.entry.schema, { decimal: 'point' });
      if (converted.flags.some(f => f.blocking)) throw Error(JSON.stringify(converted.flags));
      AlmFeaturesState.entryLog = converted.steps;
      const applied = spec.entry.apply(converted.records);
      const result = __almLastRVE();
      return { applied, blockers: converted.flags.filter(f => f.blocking), log: AlmFeaturesState.entryLog,
        before: baseline, after: result, data: document.getElementById('src').value };
    });
  });
  for (const [i, result] of out.entries()) {
    expect(result.applied).toEqual({ ok: true, n: 13 });
    expect(result.blockers).toEqual([]);
    expect(result.after.fit.k_total).toBe(result.before.fit.k_total);
    expect(result.after.fit.m_clusters).toBe(result.before.fit.m_clusters);
    expect(result.after.fit.p).toBe(3);
    for (const [j, row] of result.after.summary.entries()) {
      for (const key of ['estimate', 'se', 't', 'df', 'ci_lo', 'ci_hi', 'p']) {
        const expected = result.before.summary[j][key];
        expect(Math.abs(row[key] - expected), `${i}/${j}/${key}`).toBeLessThanOrEqual(1e-9 * Math.abs(expected));
      }
    }
    expect(result.log.length).toBeGreaterThanOrEqual(13);
  }
  console.log('ENTRYRT 3/3 formats; 13 effects, 5 clusters, 3 coefficients; 63 numerical comparisons');
});

test('ENTRY PLANTED: blocking CI check disables apply; invalid native records leave input untouched', async ({ page }) => {
  await open(page);
  const out = await page.evaluate(() => {
    const host = document.createElement('div'); host.id = 'entry-gate'; document.body.appendChild(host);
    let called = false;
    const ui = AlmEntryUI.mount(host, { schema: 'generic', apply: () => { called = true; } });
    host.querySelector('textarea').value = 'Study\tEffect\nBad\t0.45 (0.9–0.1)';
    ui.parse();
    const result = ui.getResult();
    const before = AlmFeatures.get('rve-meta').share.get();
    let error;
    try { AlmFeatures.get('rve-meta').entry.apply([{ study: 'Bad', cluster: 'a', yi: 0.4, vi: -0.1 }]); }
    catch (e) { error = e.message; }
    return { flags: result.flags, called, error, before, after: AlmFeatures.get('rve-meta').share.get() };
  });
  expect(out.flags.some(f => f.blocking && f.code === 'ci-order')).toBe(true);
  await expect(page.locator('#entry-gate').getByRole('button', { name: 'Use these rows', exact: true })).toBeDisabled();
  await expect(page.locator('#entry-gate').getByRole('heading', { name: 'Conversion log' })).toBeVisible();
  await expect(page.locator('#entry-gate .alm-entry-block')).not.toHaveCount(0);
  expect(out.called).toBe(false);
  expect(out.error).toMatch(/variance must be positive/i);
  expect(out.after).toEqual(out.before);
  console.log('ENTRY BLOCK 2/2: reversed CI and negative variance refused');
});

test('TEXT: audited values match every displayed coefficient and the reviewed snapshot', async ({ page }, testInfo) => {
  await open(page);
  const out = await render(page);
  console.log(`TEXTAUDIT ${out.audit.passed}/${out.audit.checks} domChecked=${out.audit.domChecked}`);
  expect(out.audit.ok, JSON.stringify(out.audit.failures)).toBe(true);
  expect(out.audit.domChecked).toBeGreaterThanOrEqual(20);
  const cells = await page.locator('#coef-body tr').evaluateAll(rows => rows.map(row => [...row.cells].slice(1).map(c => c.textContent.trim())));
  const resultText = out.text.replaceAll('−', '-');
  let matched = 0;
  for (const row of cells) {
    for (const value of row.flatMap((v, i) => i === 4 ? v.split(',').map(x => x.trim()) : [v])) {
      expect(resultText).toContain(value); matched++;
    }
  }
  console.log(`TEXTDOM ${matched}/${matched}`);
  const actualPath = testInfo.outputPath('text-rve-meta.actual.json');
  fs.writeFileSync(actualPath, JSON.stringify(out.snapshot, null, 2) + '\n');
  await testInfo.attach('text-rve-meta', { path: actualPath, contentType: 'application/json' });
  expect(fs.existsSync(SNAP), `Review snapshot artifact: ${actualPath}`).toBe(true);
  expect(out.snapshot).toEqual(JSON.parse(fs.readFileSync(SNAP, 'utf8')));
  await tab(page, 'text');
  await expect(page.locator('#alm-f-panel-text .alm-text-body')).toBeVisible();
  const [md] = await Promise.all([page.waitForEvent('download'), page.locator('#alm-f-panel-text .alm-text-md').click()]);
  expect(fs.readFileSync(await md.path(), 'utf8')).toContain(out.snapshot.results);
  const [docx] = await Promise.all([page.waitForEvent('download'), page.locator('#alm-f-panel-text .alm-text-docx').click()]);
  expect(readZip(fs.readFileSync(await docx.path())).map(e => e.name)).toContain('word/document.xml');
  console.log('TEXT EXPORT 2/2 Markdown and DOCX');
});

test('TEXT PLANTED: changed DOM-cross-checked value fails audit; stale and refused fits withhold text', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.__almTextPerturb = { key: 'coef_0_estimate', delta: 0.1 }; });
  const out = await render(page);
  expect(out.audit.ok).toBe(false);
  expect(out.audit.failures.map(f => f.check)).toContain('dom:coef_0_estimate');
  console.log(`TEXTAUDIT planted ${out.audit.passed}/${out.audit.checks}: dom:coef_0_estimate FAIL`);
  await tab(page, 'text');
  await expect(page.locator('.alm-text-status')).toContainText('Number audit failed');
  await expect(page.locator('.alm-text-body')).toBeHidden();
  await page.evaluate(() => { delete window.__almTextPerturb; });
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-body')).toBeVisible();
  await page.locator('#f-rho').fill('0.2');
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-body')).toBeHidden();
  await page.locator('#src').fill('');
  await page.locator('#btn-run').click();
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-status')).toHaveText('Run the analysis first.');
});

test('VERIFY: real browser runner reports missing packages, offers R and an explicitly unverified ZIP', async ({ page }) => {
  test.setTimeout(600_000);
  await open(page);
  await tab(page, 'verify');
  const panel = page.locator('#alm-f-panel-verify');
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(panel.locator('[data-testid=verify-summary]')).toHaveText(/Not checked in the browser: R package (robumeta|clubSandwich) is unavailable\./, { timeout: 500_000 });
  await expect(panel.getByRole('link', { name: 'cross-platform checks' })).toHaveAttribute('href', /xplat-verify\.yml$/);
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('rve-meta'))).toBe(false);
  expect(await page.evaluate(() => AlmFeaturesState.verify)).toMatchObject({ passed: false, n: 0, nPassed: 0 });
  await expect(panel.locator('td[data-result]')).toHaveCount(0);
  const [r] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'R script (.R)', exact: true }).click()]);
  const script = fs.readFileSync(await r.path(), 'utf8');
  for (const source of ['robumeta::robu', "modelweights='CORR'", 'small=TRUE', 'clubSandwich::coef_test', "test='Satterthwaite'", 'plot(tab$b.r', 'segments(tab$CI.L', 'print(sessionInfo())']) expect(script).toContain(source);
  expect(script).not.toContain('forest.robu');
  const [zip] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download unavailable-check bundle (ZIP)' }).click()]);
  const entries = readZip(fs.readFileSync(await zip.path()));
  expect(entries.map(e => e.name).sort()).toEqual(['README.txt', 'rve-meta-verify.R', 'status.json', 'truthcert.json'].sort());
  const decode = name => new TextDecoder().decode(entries.find(e => e.name === name).bytes);
  expect(decode('rve-meta-verify.R')).toBe(script);
  expect(JSON.parse(decode('status.json'))).toMatchObject({ passed: false, n: 0, nPassed: 0, stale: false });
  const receipt = JSON.parse(decode('truthcert.json'));
  expect(receipt.extra.results).toMatchObject({ passed: false, n: 0, nPassed: 0 });
  expect(await page.evaluate(r => AlmTruthCertExport.verifyContentHash(r), receipt)).toBe(true);
  await tab(page, 'text');
  await expect(page.locator('[data-para=methods]')).not.toContainText('independently verified');
  console.log('VERIFY unavailable: 0 R comparisons; .R + ZIP 2/2 exports, no PASS claimed');
});

test('VERIFY PLANTED: comparator UI catches a changed estimate (synthetic reference; not R parity)', async ({ page }) => {
  await open(page);
  // Exercise the actual shared comparison/UI/hook without claiming this test executed R.
  await page.evaluate(() => {
    const adapter = AlmLiveAdapters['rve-meta'], state = adapter.currentState();
    const reference = Object.fromEntries(adapter.appValues(state).map(v => [v.key, v.value]));
    window.AlmWebR = { runRPlots: async () => ({
      ok: true, stdout: 'ALMJSON:' + JSON.stringify(reference), versions: { R: 'synthetic-test', webR: 'synthetic-test' },
      sessionInfo: 'Synthetic comparator test; R was not run.', cairo: false, plots: []
    }) };
    window.__almVerifyPerturb = { key: 'coef.0.estimate', delta: 0.1 };
  });
  await tab(page, 'verify');
  const panel = page.locator('#alm-f-panel-verify');
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(panel.locator('[data-testid=verify-summary]')).toHaveText('39 of 40 quantities match R — FAIL: 1 outside tolerance or unavailable');
  const failing = await panel.locator('tbody tr').evaluateAll(rows => rows.filter(r => r.querySelector('[data-result]').textContent !== 'PASS').map(r => r.dataset.key));
  expect(failing).toEqual(['coef.0.estimate']);
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('rve-meta'))).toBe(false);
  console.log('VERIFY comparator planted 39/40: coef.0.estimate FAIL (synthetic reference, not R parity)');
});

test('SHARE: round trip restores data, rho, names and provenance; corrupt and invalid links change nothing', async ({ page, browser }) => {
  await open(page);
  const original = await page.evaluate(() => AlmFeatures.get('rve-meta').share.get());
  await page.locator('#src').fill(original.src.replace('0.45', '0.46'));
  await page.locator('#f-rho').fill('0.35');
  await page.locator('#f-names').fill('group, weeks');
  await page.locator('#btn-run').click();
  const expected = await page.evaluate(() => ({ state: AlmFeatures.get('rve-meta').share.get(), result: __almLastRVE() }));
  const provenance = [{ label: 'Synthetic example', reference: 'Built-in example', location: 'Studies input', confirmed: true }];
  await page.evaluate(p => { AlmFeaturesState.provenance = p; }, provenance);
  await tab(page, 'share');
  await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
  await expect(page.locator('[data-testid=share-status]')).toContainText('Share link');
  const link = await page.getByLabel('Share link', { exact: true }).inputValue();
  const context = await browser.newContext();
  try {
    const restored = await context.newPage();
    await restored.goto(link);
    await expect(restored.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the share link.');
    expect(await restored.evaluate(() => ({ state: AlmFeatures.get('rve-meta').share.get(), result: __almLastRVE() }))).toEqual(expected);
    expect(await restored.evaluate(() => AlmFeaturesState.provenance)).toEqual(provenance);
    for (const suffix of [link.split('#s=')[1].slice(0, -10),
      await page.evaluate(s => AlmShare.encode('rve-meta', { ...s, rho: '1.5' }, []), original),
      await page.evaluate(s => AlmShare.encode('rve-meta', { ...s, src: 'a, 0.4, 0.03, 1, 1\nb, 0.5, 0.03, 1, 1' }, []), original)]) {
      const fresh = await browser.newContext();
      try {
        const bad = await fresh.newPage();
        await bad.goto(link.split('#')[0] + '#s=' + suffix);
        await expect(bad.locator('[data-testid=share-status]')).toContainText('Nothing was changed.');
        expect(await bad.evaluate(() => AlmFeatures.get('rve-meta').share.get())).toEqual(original);
        expect(await bad.locator('#coef-body tr').count()).toBe(3);
      } finally { await fresh.close(); }
    }
  } finally { await context.close(); }
  console.log('SHARE 4/4: round trip, truncated payload, invalid rho, singular design rollback');
});

test('AXE: all feature tabs have no serious or critical accessibility violations', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page);
  for (const key of ['entry', 'text', 'verify', 'share']) {
    await tab(page, key);
    await page.evaluate(() => Promise.all(document.getAnimations()
      .filter(a => !a.effect || a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => null))));
    const result = await new AxeBuilder({ page }).include('#alm-features').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const serious = result.violations.filter(v => ['serious', 'critical'].includes(v.impact));
    console.log(`AXE ${key}: ${result.passes.length} rules passed; ${serious.length} serious/critical`);
    expect(serious.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test('REVIEW P1: desktop plots reuse coefficient intervals for moderator and intercept-only fits', async ({ page }) => {
  await open(page);
  for (const interceptOnly of [false, true]) {
    const out = await page.evaluate(interceptOnly => {
      const spec = AlmFeatures.get('rve-meta');
      if (interceptOnly) {
        const state = spec.share.get();
        state.src = state.src.split('\n').map(line => line.split(',').slice(0, 3).join(',')).join('\n');
        state.names = '';
        spec.share.set(state);
      }
      const adapter = spec.verify.adapter(), state = adapter.currentState();
      return {
        p: state.result.fit.p,
        plots: spec.verify.plots.map(p => ({ id: p.id, title: p.title, r: p.r })),
        expected: adapter.plots,
        script: AlmVerifyR.downloadScript('rve-meta', adapter.buildScript(state), spec.verify.plots, state)
      };
    }, interceptOnly);
    expect(out.p).toBe(interceptOnly ? 1 : 3);
    expect(out.plots).toEqual(out.expected);
    expect(out.script).not.toContain('forest.robu');
    expect(out.script).toContain('plot(tab$b.r');
    expect(out.script).toContain('segments(tab$CI.L');
    expect(out.script).toMatch(/grDevices::dev.off\(\)[\s\n]*print\(sessionInfo\(\)\)/);
  }
  await tab(page, 'verify');
  await expect(page.locator('#alm-f-panel-verify')).toContainText('coefficient-interval plot');
  await expect(page.locator('#alm-f-panel-verify')).not.toContainText('robumeta forest plot');
});

test('REVIEW P2: coefficient numbering starts at one in results and flags', async ({ page }) => {
  await open(page);
  const out = await render(page);
  expect(out.audit.ok).toBe(true);
  expect(out.snapshot.results).not.toContain('Coefficient 0:');
  for (const index of [1, 2, 3]) {
    expect(out.snapshot.results).toContain(`Coefficient ${index}: estimate`);
    expect(out.snapshot.flags.some(f => f.startsWith(`Coefficient ${index}:`))).toBe(true);
  }
});

test('REVIEW P2: low-df warning uses the strict four-df boundary and a typed Tipton citation', async ({ page }) => {
  await open(page);
  const cases = await page.evaluate(() => {
    const spec = AlmFeatures.get('rve-meta').text;
    return [1.15, 3.999, 4, 4.999, 5].map(df => {
      const r = spec.results();
      r.coefficientKeys.forEach(c => { r[c.prefix + 'df'] = df; });
      const rendered = AlmText.render(spec.templates, r, { app: 'rve-meta' });
      return { df, flags: rendered.flags, audit: AlmText.audit(rendered, r) };
    });
  });
  for (const c of cases) {
    expect(c.audit.ok, JSON.stringify(c.audit.failures)).toBe(true);
    const warnings = c.flags.filter(f => /Satterthwaite degrees of freedom|Satterthwaite df/.test(f.text));
    expect(warnings).toHaveLength(c.df < 4 ? 1 : 0);
    if (c.df < 4) {
      expect(warnings[0].text).toContain('p-values and confidence intervals may not be trustworthy');
      expect(warnings[0].text).toContain('Satterthwaite df < 4');
      expect(warnings[0].segments).toContainEqual(expect.objectContaining({ type: 'cite', text: 'Tipton 2015' }));
    }
  }
});

test('REVIEW P2: Methods exports include typed sources for CORR and small-sample inference', async ({ page }) => {
  await open(page);
  const out = await page.evaluate(() => {
    const spec = AlmFeatures.get('rve-meta').text, r = spec.results();
    const rendered = AlmText.render(spec.templates, r, { app: 'rve-meta' });
    return { rendered, audit: AlmText.audit(rendered, r), md: AlmText.toMarkdown(rendered), docx: AlmText.docxParagraphs(rendered) };
  });
  expect(out.audit.ok).toBe(true);
  for (const text of ['Hedges, Tipton and Johnson 2010', 'Tipton 2015', 'Pustejovsky and Tipton 2018']) {
    expect(out.rendered.methods.segments).toContainEqual(expect.objectContaining({ type: 'cite', text }));
  }
  expect(out.rendered.cites).toHaveLength(3);
  for (const cite of out.rendered.cites) {
    expect(out.md).toContain(cite.full);
    expect(out.docx.some(p => p.text === cite.full)).toBe(true);
  }
});

test('REVIEW P2: feature verification uses the documented AlmValidate adapter registry', async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => {
    const registered = AlmValidate.adapters['rve-meta'];
    return !!registered && registered === AlmLiveAdapters['rve-meta'] &&
      registered === AlmFeatures.get('rve-meta').verify.adapter();
  })).toBe(true);
});
