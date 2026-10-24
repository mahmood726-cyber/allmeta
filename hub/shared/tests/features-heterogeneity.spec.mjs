// Feature panel on app 5 (heterogeneity), on the app's built-in example (8 trials, log odds ratios, PM tau2):
//   (a) ENTRY  — the example pasted as an Excel (tab) table, a paper-style "OR (lo–hi)" table and a RevMan 5
//                generic-inverse-variance export, driven through the AlmEntry API (parseTable -> detect ->
//                convert -> spec.entry.apply), reproduces the example's result; a planted bad row blocks;
//                apply() refuses invalid records without touching the input. Prints ENTRYRT n/N.
//   (b) TEXT   — AlmText audit (TEXTAUDIT n/N, incl. DOM cross-check), >= 3 values equal what the page displays,
//                snapshot __snapshots__/text-heterogeneity.json, UI .md/.docx, planted perturbation FAILS.
//   (c) VERIFY — Verify in R (webR) on the example: N of N PASS; planted perturbation -> that row FAILS; ZIP.
//   (d) SHARE  — link round trip restores data, options, provenance and the result; bad links change nothing.
//   (e) axe on the panel (serious/critical) after animations settle.
// Run: npx playwright test -c playwright.features.config.mjs features-heterogeneity
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readZip, readTiff, decodePng } from './zip-reader.mjs';

const APP = 'heterogeneity';
const PAGE = '/heterogeneity/index.html';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SNAP = path.join(HERE, '__snapshots__', 'text-heterogeneity.json');
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BENIGN = /frame-ancestors|ERR_CONNECTION|favicon|glossary|404/;

// The built-in example exactly as heterogeneity/index.html EXAMPLE writes it (asserted against the page below).
const EX = [
  ['Trial A', '-0.20', '0.10'], ['Trial B', '-0.35', '0.12'], ['Trial C', '0.05', '0.18'], ['Trial D', '-0.50', '0.15'],
  ['Trial E', '0.12', '0.11'], ['Trial F', '-0.28', '0.09'], ['Trial G', '-0.10', '0.14'], ['Trial H', '-0.45', '0.20'],
];
const EXAMPLE_TEXT = '# Example: logOR across trials\n' + EX.map(r => r.join(', ')).join('\n');
const Z975 = 1.959963984540054; // qnorm(0.975), the app's own constant

const PROVENANCE = [
  { id: 'p1', label: 'Alpha 2019', reference: 'Alpha A et al. Trials 2019;20:1', location: 'Table 2', pastedText: 'OR 0.82 (0.67–0.99)',
    choice: { 'arm(s)': 'treatment: drug / control: placebo', outcome: 'mortality', timepoint: '12 months' },
    values: [{ field: 'yi', value: 0.82, span: [3, 7], text: '0.82' }],
    conversions: [{ field: 'sei', formula: 'SE = (ln U − ln L)/(2·z)', citation: 'Cochrane Handbook v6.5 §6.3.1', inputs: { lo: 0.67, hi: 0.99 }, output: 0.0996 }],
    flags: [], usedAs: 'log odds ratio (natural-scale OR log-transformed)', confirmed: true, confirmedAt: '2026-10-20T10:00:00Z' },
];

async function openPanel(page) {
  const toggle = page.locator('#alm-features .alm-f-toggle');
  await expect(toggle).toBeVisible();
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}
async function settle(page) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(a => !a.effect || a.effect.getComputedTiming().iterations !== Infinity)
    .map(a => a.finished.catch(() => null))));
}
async function axe(page, label) {
  await settle(page);
  const r = await new AxeBuilder({ page }).include('#alm-features').withTags(AXE_TAGS).analyze();
  const bad = r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  console.log(`AXE ${label}: ${r.violations.length} violations (${bad.length} serious/critical); ${r.passes.length} rules passed`);
  expect(bad.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target.join(' ')) }))).toEqual([]);
}
const sha = b => createHash('sha256').update(b).digest('hex');

// The app's own last result (computeAll output the page renders from) + the rendered stats text.
async function appResult(page) {
  return page.evaluate(() => {
    const i = window._almLastFE(), s = i.sum;
    return {
      k: i.k, estimator: i.estimator, tau2: i.tau2, mu: s.mu, se: s.se, ciLo: s.ciLo, ciHi: s.ciHi,
      hkLo: s.ciLoHKSJ, hkHi: s.ciHiHKSJ, Q: s.Q, df: s.df, pQ: s.pQ, I2: s.I2, I2Model: s.I2Model, piLo: i.pi.lo, piHi: i.pi.hi,
      stats: document.getElementById('stats-wrap').innerText,
    };
  });
}

// ENTRY through the API: parseTable -> detect -> convert(answers) -> spec.entry.apply(records) (only if nothing blocks).
async function enter(page, text, answers) {
  return page.evaluate(({ text, answers }) => {
    const t = AlmEntry.parseTable(text);
    const d = AlmEntry.detect(t, 'generic');
    const out = AlmEntry.convert(t, d, 'generic', answers);
    const blocking = out.flags.filter(f => f.blocking);
    const res = blocking.length ? null : AlmFeatures.get('heterogeneity').entry.apply(out.records);
    return {
      blocking: blocking.map(f => f.code), questions: out.questions.map(q => q.id),
      warnings: out.flags.filter(f => !f.blocking).map(f => f.code), steps: out.steps.map(s => s.text),
      records: out.records.map(r => ({ study: r.study, yi: r.yi, sei: r.sei })), res,
      data: document.getElementById('f-data').value,
    };
  }, { text, answers });
}

const rel = (a, b) => a === b || Math.abs(a - b) <= 1e-9 * Math.abs(b);
const MAIN = ['tau2', 'mu', 'se', 'ciLo', 'ciHi', 'hkLo', 'hkHi', 'Q', 'pQ', 'I2', 'I2Model', 'piLo', 'piHi'];

test('ENTRY: example as Excel, paper-style and RevMan tables -> same result; planted bad row blocks', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(PAGE);
  await expect(page.locator('#stats-wrap .stat').first()).toBeVisible();
  expect(await page.locator('#f-data').inputValue()).toBe(EXAMPLE_TEXT);
  const base = await appResult(page);
  expect(base.k).toBe(8); expect(base.estimator).toBe('pm');
  const entry = await page.evaluate(() => { const e = AlmFeatures.get('heterogeneity').entry; return { schema: e.schema, usedAs: e.usedAs }; });
  expect(entry.schema).toBe('generic');
  expect(entry.usedAs).toMatch(/standard error/);
  let passed = 0;
  const N = 3;

  // 1. Excel / Covidence-style tab-separated paste.
  const excel = 'Study\tEstimate\tSE\n' + EX.map(r => r.join('\t')).join('\n');
  const e1 = await enter(page, excel, {});
  expect(e1.blocking, JSON.stringify(e1)).toEqual([]); expect(e1.questions).toEqual([]);
  expect(e1.records).toEqual(EX.map(r => ({ study: r[0], yi: Number(r[1]), sei: Number(r[2]) })));
  expect(e1.res).toEqual({ ok: true, n: 8 });
  const r1 = await appResult(page);
  expect(r1).toEqual(base); // identical numbers -> identical display
  passed++;

  // 2. Paper-style table: natural-scale odds ratio with "(lo–hi)" (unicode en dash), CI limits written at full
  //    precision so the SE recovered from the CI equals the example SE to ~1e-15; every row's scale is confirmed.
  const paperRows = EX.map(([l, e, s]) => {
    const y = Number(e), se = Number(s);
    return `${l}\t${String(Math.exp(y))} (${String(Math.exp(y - Z975 * se))}–${String(Math.exp(y + Z975 * se))})`;
  });
  const paper = 'Study\tOdds ratio (95% CI)\n' + paperRows.join('\n');
  const natural = Object.fromEntries(EX.map((_, i) => [`scale:${i}`, 'natural']));
  const e2 = await enter(page, paper, natural);
  expect(e2.blocking, JSON.stringify(e2)).toEqual([]);
  expect(e2.questions.sort()).toEqual(Object.keys(natural).sort());
  expect(e2.steps.filter(s => /SE estimated from CI/.test(s))).toHaveLength(8);
  console.log('ENTRY conversion log (paper-style): ' + e2.steps[0]);
  expect(e2.res).toEqual({ ok: true, n: 8 });
  const r2 = await appResult(page);
  expect(r2.k).toBe(base.k); expect(r2.estimator).toBe(base.estimator); expect(r2.df).toBe(base.df);
  const miss2 = MAIN.filter(k => !rel(r2[k], base[k])).map(k => `${k}: ${r2[k]} vs ${base[k]}`);
  expect(miss2).toEqual([]);
  passed++;

  // 3. RevMan 5 generic inverse-variance export: log[OR] + SE (used), Weight and the OR CI column (ignored).
  const w = EX.map(r => 1 / Number(r[2]) ** 2), sw = w.reduce((a, b) => a + b, 0);
  const revman = 'Study or Subgroup\tlog[Odds Ratio]\tSE\tWeight\tOdds Ratio IV, Random, 95% CI\n' + EX.map(([l, e, s], i) => {
    const y = Number(e), se = Number(s), f = v => Math.exp(v).toFixed(2);
    return `${l}\t${e}\t${s}\t${(100 * w[i] / sw).toFixed(1)}%\t${f(y)} [${f(y - 1.96 * se)}, ${f(y + 1.96 * se)}]`;
  }).join('\n');
  const e3 = await enter(page, revman, { 'column:4': 'ignore' });
  expect(e3.blocking, JSON.stringify(e3)).toEqual([]);
  expect(e3.questions).toEqual(['column:4']);
  expect(e3.steps.filter(s => /log scale/.test(s))).toHaveLength(8);
  expect(e3.records).toEqual(EX.map(r => ({ study: r[0], yi: Number(r[1]), sei: Number(r[2]) })));
  expect(e3.res).toEqual({ ok: true, n: 8 });
  expect(await appResult(page)).toEqual(base);
  passed++;
  console.log(`ENTRYRT ${passed}/${N} formats reproduce the example result (Excel exact, paper-style rel 1e-9, RevMan exact)`);

  // PLANTED: a reversed CI (lower > upper) is a blocking sanity check; nothing is applied.
  const before = await page.locator('#f-data').inputValue();
  const planted = paper.replace(/^Trial D\t.*$/m, 'Trial D\t0.61 (0.73–0.45)');
  const e4 = await enter(page, planted, natural);
  console.log('ENTRY planted blocking flags: ' + e4.blocking.join(', '));
  expect(e4.blocking).toContain('ci-order');
  expect(e4.res).toBeNull();
  expect(e4.questions).toContain('swap-ci:3');
  expect(e4.data).toBe(before);
  // PLANTED: apply() itself refuses invalid records before touching the input (defence in depth).
  const refusals = await page.evaluate(() => {
    const a = AlmFeatures.get('heterogeneity').entry.apply;
    return [a([{ study: 'X', yi: 0.1, sei: 0 }]), a([{ study: 'X', yi: NaN, sei: 0.1 }]), a([{ study: '# X', yi: 0.1, sei: 0.1 }]), a([])]
      .map(r => r.ok);
  });
  expect(refusals).toEqual([false, false, false, false]);
  expect(await page.locator('#f-data').inputValue()).toBe(before);
  expect(errors).toEqual([]);
});

// ------------------------------------------------------------------------------------------------ TEXT

async function openApp(page, errs) {
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(PAGE, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window._almLastFE === 'function' && window._almLastFE()
    && window.AlmText && window.AlmTextSpecs && window.AlmTextSpecs['heterogeneity'], null, { timeout: 20000 });
}

async function renderInPage(page) {
  return page.evaluate((app) => {
    const spec = window.AlmTextSpecs[app];
    const r = spec.results();
    const ctx = { app, build: window.AlmBuildInfo, entryLog: [], verify: null, revision: undefined };
    const rendered = window.AlmText.render(spec.templates, r, ctx);
    const dom = spec.dom();
    const audit = window.AlmText.audit(rendered, r, { ctx, dom });
    const norm = p => p.segments.map(s => (s.type === 'ctx' && s.key.indexOf('build.') === 0 ? '<' + s.key + '>' : s.text)).join('');
    return {
      audit,
      domKeys: Object.keys(dom),
      text: { plain: rendered.plain.text, methods: rendered.methods.text, results: rendered.results.text, flags: rendered.flags.map(f => f.text) },
      snapshot: {
        app,
        source: 'built-in example (heterogeneity/index.html EXAMPLE: 8 trials, log odds ratios), default options: Paule-Mandel tau2',
        plain: norm(rendered.plain),
        methods: norm(rendered.methods),
        results: norm(rendered.results),
        flags: rendered.flags.map(norm),
        references: rendered.cites.map(c => c.full),
      },
    };
  }, APP);
}

// Minimal reader for store-only ZIP (the AlmZip.docx container): central directory -> entry bytes.
function readStoredZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('no EOCD');
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central header');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    if (method !== 0) throw new Error('entry ' + name + ' is not stored');
    const lnlen = buf.readUInt16LE(off + 26), lxlen = buf.readUInt16LE(off + 28);
    out[name] = buf.slice(off + 30 + lnlen + lxlen, off + 30 + lnlen + lxlen + csize);
    p += 46 + nlen + xlen + clen;
  }
  return out;
}
const xmlEsc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

test('TEXT: audit passes, matches the page display and the committed snapshot', async ({ page }, testInfo) => {
  const errs = [];
  await openApp(page, errs);
  const out = await renderInPage(page);

  // Always emit the rendered text (artifact) so the snapshot can be reviewed / regenerated.
  const actualJson = JSON.stringify(out.snapshot, null, 2) + '\n';
  const actualPath = testInfo.outputPath('text-heterogeneity.json');
  fs.writeFileSync(actualPath, actualJson, 'utf8');
  fs.mkdirSync(path.join(HERE, 'artifacts'), { recursive: true });
  fs.writeFileSync(path.join(HERE, 'artifacts', 'text-heterogeneity.actual.json'), actualJson, 'utf8');
  await testInfo.attach('text-heterogeneity.json', { path: actualPath, contentType: 'application/json' });

  console.log(`TEXTAUDIT ${out.audit.passed}/${out.audit.checks} tokens=${out.audit.tokens} domChecked=${out.audit.domChecked} domKeys=${out.domKeys.join(',')}`);
  expect(out.audit.failures, JSON.stringify(out.audit.failures)).toEqual([]);
  expect(out.audit.ok).toBe(true);
  expect(out.audit.domChecked).toBeGreaterThanOrEqual(3);

  // Independent DOM read of the stat cards: the values the page displays appear verbatim in the Results text.
  const cards = await page.locator('#stats-wrap .stat').evaluateAll(cs => Object.fromEntries(cs.map(c =>
    [c.querySelector('.k').textContent.trim(), c.querySelector('.v').textContent.trim()])));
  const n = s => String(s).match(/-?\d+(?:\.\d+)?/g);
  const qLabel = Object.keys(cards).find(k => /^Q \(df=\d+\)$/.test(k));
  const df = /df=(\d+)/.exec(qLabel)[1];
  const [mu, zLo, zHi] = n(cards['RE pooled (z)']);
  const [, hkLo, hkHi] = n(cards['RE pooled (modified HK + t)']);
  const [piLo, piHi] = n(cards['95% PI (model SE + t)']);
  const [t2Lo, t2Hi] = n(cards['τ² 95% CI (Q-profile)']);
  const res = out.text.results.replace(/−/g, '-');
  const expectations = [
    [`pooled estimate was ${mu} (95% CI ${hkLo} to ${hkHi} with the modified Hartung–Knapp method; ${zLo} to ${zHi} with the normal approximation)`, 'pooled + both CIs'],
    [`using τ² = ${n(cards['τ² used'])[0]} (Paule–Mandel)`, 'tau2 used'],
    [`Cochran’s Q = ${n(cards[qLabel])[0]} (df = ${df}, `, 'Q and df'],
    [`I² = ${cards['I² (Q-based)']} (Q-based`, 'I2 Q-based'],
    [`model-based I² = ${n(cards['I² (model-based)'])[0]}%`, 'I2 model-based'],
    [`Q-profile CI for τ² was ${t2Lo} to ${t2Hi}`, 'tau2 Q-profile CI'],
    [`Paule–Mandel ${n(cards['τ² (PM)'])[0]} and REML ${n(cards['τ² (REML)'])[0]}`, 'PM and REML tau2'],
    [`similar to those included was ${piLo} to ${piHi}`, 'PI'],
  ];
  let hit = 0;
  for (const [s, what] of expectations) { if (res.includes(s)) hit++; else console.log(`TEXTDOM miss ${what}: ${s}`); }
  console.log(`TEXTDOM ${hit}/${expectations.length}`);
  expect(hit).toBe(expectations.length);

  if (!fs.existsSync(SNAP)) {
    throw new Error(`Snapshot ${path.relative(HERE, SNAP)} is missing. Review the actual text attached as text-heterogeneity.json ` +
      `(also artifacts/text-heterogeneity.actual.json), check its numbers against the page, and commit it.`);
  }
  expect(out.snapshot).toEqual(JSON.parse(fs.readFileSync(SNAP, 'utf8')));
  expect(errs, 'no console errors').toEqual([]);
});

test('TEXT UI: three blocks, audit line, .md and .docx downloads; provenance reaches Methods', async ({ page }) => {
  const errs = [];
  await openApp(page, errs);
  await page.evaluate((app) => {
    const host = document.createElement('div');
    host.id = 'alm-text-test-host';
    document.body.appendChild(host);
    window.AlmTextUI.mount(host, { app, text: window.AlmTextSpecs[app] });
  }, APP);
  const host = page.locator('#alm-text-test-host');
  const out = await renderInPage(page);
  for (const k of ['plain', 'methods', 'results']) await expect(host.locator(`[data-para="${k}"]`)).toHaveText(out.text[k]);
  await expect(host.locator('.alm-text-audit')).toContainText('Number audit:');
  await expect(host.locator('.alm-text-flags li')).toHaveCount(out.text.flags.length);

  const [md] = await Promise.all([page.waitForEvent('download'), host.locator('.alm-text-md').click()]);
  expect(md.suggestedFilename()).toBe('heterogeneity-report-text.md');
  const mdText = fs.readFileSync(await md.path(), 'utf8');
  expect(mdText).toContain('## Results'); expect(mdText).toContain(out.text.results); expect(mdText).toContain(out.text.methods);
  const [dx] = await Promise.all([page.waitForEvent('download'), host.locator('.alm-text-docx').click()]);
  expect(dx.suggestedFilename()).toBe('heterogeneity-report-text.docx');
  const entries = readStoredZip(fs.readFileSync(await dx.path()));
  expect(Object.keys(entries)).toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']));
  expect(entries['word/document.xml'].toString('utf8')).toContain(xmlEsc(out.text.results));
  console.log(`TEXTMD bytes=${Buffer.byteLength(mdText)} TEXTDOCX entries=${Object.keys(entries).length}`);

  // F1 provenance is summarised in Methods (counts are typed ctx tokens, audited).
  const prov = await page.evaluate(({ app, p }) => {
    window.AlmFeaturesState.provenance = p;
    const spec = window.AlmTextSpecs[app], r = spec.results(), ctx = window.AlmText.context(app, spec);
    const rendered = window.AlmText.render(spec.templates, r, ctx);
    const a = window.AlmText.audit(rendered, r, { ctx, dom: spec.dom() });
    window.AlmFeaturesState.provenance = [];
    return { methods: rendered.methods.text, ok: a.ok };
  }, { app: APP, p: PROVENANCE });
  expect(prov.ok).toBe(true);
  expect(prov.methods).toContain('Data were extracted from 1 report (source location recorded for each study)');
  expect(errs, 'no console errors').toEqual([]);
});

test('TEXT PLANTED: perturbing a DOM-cross-checked result makes the audit FAIL and the UI withhold the text', async ({ page }) => {
  const errs = [];
  await openApp(page, errs);
  const out = await page.evaluate((app) => {
    window.__almTextPerturb = { key: 'mu', delta: 0.01 };
    try {
      const spec = window.AlmTextSpecs[app];
      const r = spec.results();
      const ctx = window.AlmText.context(app, spec);
      const rendered = window.AlmText.render(spec.templates, r, ctx);
      const audit = window.AlmText.audit(rendered, r, { ctx, dom: spec.dom() });
      const host = document.createElement('div');
      host.id = 'alm-text-planted';
      document.body.appendChild(host);
      window.AlmTextUI.mount(host, { app, text: spec });
      return { ok: audit.ok, passed: audit.passed, checks: audit.checks, failed: audit.failures.map(f => f.check) };
    } finally {
      delete window.__almTextPerturb;
    }
  }, APP);
  console.log(`TEXTAUDIT planted ${out.passed}/${out.checks} failed=${out.failed.join(',')}`);
  expect(out.ok).toBe(false);
  expect(out.failed).toContain('dom:mu');
  const host = page.locator('#alm-text-planted');
  await expect(host.locator('.alm-text-status')).toContainText('Number audit failed');
  await expect(host.locator('.alm-text-body')).toBeHidden();
  await host.locator('.alm-text-regenerate').click();
  await expect(host.locator('.alm-text-body')).toBeVisible();
  expect(errs, 'no console errors').toEqual([]);
});

// ---------------------------------------------------------------------------------------------- VERIFY

test('VERIFY in R: every row passes on the built-in example; planted defect fails; downloads', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(PAGE);
  await expect(page.locator('#stats-wrap .stat').first()).toBeVisible();
  await expect(page.locator('#alm-features')).toBeVisible();
  await openPanel(page);

  const verifyTab = page.getByRole('tab', { name: 'Verify in R', exact: true });
  const shareTab = page.getByRole('tab', { name: 'Share', exact: true });
  await verifyTab.click();
  await expect(verifyTab).toHaveAttribute('aria-selected', 'true');
  await expect(shareTab).toHaveAttribute('tabindex', '-1');
  await verifyTab.focus(); await page.keyboard.press('ArrowRight');
  await expect(shareTab).toHaveAttribute('aria-selected', 'true'); await expect(shareTab).toBeFocused();
  await verifyTab.click();
  await axe(page, 'verify tab (before run)');

  const panel = page.locator('#alm-f-panel-verify');
  const summary = panel.locator('[data-testid=verify-summary]');
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(summary).not.toBeEmpty({ timeout: 600_000 });
  const text = (await summary.textContent()).trim();
  console.log('VERIFY ' + text);
  const m = /^(\d+) of (\d+) quantities match R — PASS$/.exec(text);
  expect(m, text).not.toBeNull();
  const N = +m[2];
  expect(N).toBeGreaterThanOrEqual(5); expect(+m[1]).toBe(N);
  const results = await panel.locator('tbody td[data-result]').allTextContents();
  expect(results).toHaveLength(N); expect(results.filter(r => r !== 'PASS')).toEqual([]);
  const keys = await panel.locator('tbody tr').evaluateAll(trs => trs.map(tr => tr.dataset.key));
  console.log('VERIFY keys ' + keys.join(','));
  const st = await page.evaluate(() => ({ verify: AlmFeaturesState.verify, revision: AlmFeatures.revision('heterogeneity') }));
  console.log('VERIFY versions ' + JSON.stringify(st.verify.versions) + ' graphics ' + JSON.stringify(st.verify.graphics));
  expect(st.verify.passed).toBe(true); expect(st.verify.nPassed).toBe(N);
  expect(st.verify.revision).toBe(st.revision);
  expect(st.verify.versions.webR).toBe('0.5.5');
  // R forest plot (R only: the page draws none) and R Baujat plot beside the app's Baujat SVG; no duplicate ids.
  await expect(panel.locator('figure img')).toHaveCount(2);
  expect(await panel.locator('figure img').evaluateAll(imgs => imgs.every(img => img.complete && img.naturalWidth > 0))).toBe(true);
  await expect(panel.locator('figure svg')).toHaveCount(1);
  expect(await page.evaluate(() => document.querySelectorAll('#baujat-title').length)).toBe(1);
  await expect(panel.getByRole('region', { name: 'R script' })).toContainText('metafor::baujat(fb');
  await expect(panel.getByRole('region', { name: 'R script' })).toContainText('metafor::forest(f');
  await axe(page, 'verify tab (after run)');

  const [zipDl] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download everything (ZIP)', exact: true }).click()]);
  expect(zipDl.suggestedFilename()).toBe('heterogeneity-verify-in-r.zip');
  const entries = readZip(fs.readFileSync(await zipDl.path()));
  const byName = Object.fromEntries(entries.map(e => [e.name, e.bytes]));
  console.log('VERIFY ZIP ' + entries.map(e => e.name + ':' + e.bytes.length).join(' '));
  for (const name of ['heterogeneity-verify.R', 'heterogeneity-verify-comparison.csv', 'sessionInfo.txt', 'console.txt',
    'heterogeneity-baujat-R-300dpi.png', 'heterogeneity-baujat-R.pdf', 'heterogeneity-baujat-R-300dpi.tiff',
    'heterogeneity-forest-R-300dpi.png', 'heterogeneity-forest-R.pdf', 'heterogeneity-forest-R-300dpi.tiff', 'truthcert.json']) expect(byName[name], name).toBeDefined();
  expect(Object.keys(byName).filter(nm => /^heterogeneity-baujat-(R|app)\.svg$/.test(nm))).toHaveLength(1);
  // The forest plot has no app counterpart: its SVG can only be R's own (webR has cairo), never an "app" SVG.
  expect(Object.keys(byName).filter(nm => /^heterogeneity-forest-app\.svg$/.test(nm))).toEqual([]);
  const dec = b => new TextDecoder().decode(b);
  const csv = dec(byName['heterogeneity-verify-comparison.csv']).trim().split('\n');
  expect(csv[0]).toBe('quantity,key,app,R,abs_diff,tolerance,kind,result'); expect(csv).toHaveLength(N + 1);
  expect(csv.slice(1).every(l => l.endsWith(',PASS'))).toBe(true);
  const script = dec(byName['heterogeneity-verify.R']);
  expect(script).toContain('rma(yi, vi'); expect(script).toContain('metafor::baujat('); expect(script).toContain('print(sessionInfo())');
  expect(dec(byName['sessionInfo.txt'])).toContain('metafor');
  expect(dec(byName['console.txt'])).toContain('ALMJSON:');
  expect(dec(byName['heterogeneity-baujat-R.pdf'].subarray(0, 5))).toBe('%PDF-');
  const png = decodePng(byName['heterogeneity-baujat-R-300dpi.png']);
  expect([png.width, png.height]).toEqual([2400, 1800]);
  expect(png.phys).toEqual({ x: 11811, y: 11811, unit: 1 });
  const tif = readTiff(byName['heterogeneity-baujat-R-300dpi.tiff']);
  expect([tif.tags[256].value, tif.tags[257].value]).toEqual([2400, 1800]);
  expect(tif.tags[282].value).toEqual([300, 1]); expect(tif.tags[283].value).toEqual([300, 1]);
  const receipt = JSON.parse(dec(byName['truthcert.json']));
  const rr = receipt.extra.results;
  expect(rr.app).toBe('heterogeneity'); expect(rr.passed).toBe(true); expect(rr.n).toBe(N);
  expect(rr.stateRevision).toBe(st.verify.revision);
  expect(rr.files.map(f => f.name).sort()).toEqual(Object.keys(byName).filter(nm => nm !== 'truthcert.json').sort());
  for (const f of rr.files) expect(f.sha256, f.name).toBe(sha(byName[f.name]));
  expect(receipt.signed).toBe(false);

  // Provenance travels into the ZIP when present.
  await page.evaluate(p => { AlmFeaturesState.provenance = p; }, PROVENANCE);
  const [zip2] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download everything (ZIP)', exact: true }).click()]);
  const prov = readZip(fs.readFileSync(await zip2.path())).find(e => e.name === 'provenance.csv');
  expect(prov).toBeDefined();
  expect(dec(prov.bytes).trim().split('\n')).toHaveLength(2);

  // PLANTED DEFECT: perturb one app value via the documented test hook -> exactly that row FAILS.
  await page.evaluate(() => { window.__almVerifyPerturb = { key: 'tau2', delta: 1e-3 }; });
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(summary).toContainText('FAIL', { timeout: 300_000 });
  const planted = (await summary.textContent()).trim();
  console.log('VERIFY PLANTED ' + planted);
  expect(planted).toBe(`${N - 1} of ${N} quantities match R — FAIL: 1 outside tolerance or unavailable`);
  const failing = await panel.locator('tbody tr').evaluateAll(trs => trs.filter(tr => tr.querySelector('td[data-result]').textContent !== 'PASS').map(tr => tr.dataset.key));
  expect(failing).toEqual(['tau2']);
  expect(await page.evaluate(() => AlmFeaturesState.verify.passed)).toBe(false);
  await page.evaluate(() => { delete window.__almVerifyPerturb; });
  expect(errors).toEqual([]);
});

// ----------------------------------------------------------------------------------------------- SHARE

test('SHARE: link restores data, options, provenance and the result; bad links change nothing', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const errors = [];
  const fresh = async () => { const ctx = await browser.newContext(); const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); return p; };
  const DATA = 'Alpha 2019, -0.21, 0.10\nBeta 2021, 0.05, 0.15\nGamma 2020, -0.40, 0.12\nDelta 2018, -0.10, 0.20';
  const page = await fresh();
  await page.goto(new URL(PAGE, baseURL).href);
  const defaultSrc = await page.locator('#f-data').inputValue();
  expect(defaultSrc).toBe(EXAMPLE_TEXT);
  await page.locator('#f-data').fill(DATA);
  await page.locator('#f-tau2').selectOption('reml');
  await page.locator('#btn-run').click();
  const stats = await page.locator('#stats-wrap').innerText();
  expect(stats).toContain('(REML)');
  await page.evaluate(p => { AlmFeaturesState.provenance = p; }, PROVENANCE);
  await openPanel(page);
  await page.getByRole('tab', { name: 'Share', exact: true }).click();
  await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
  await expect(page.locator('[data-testid=share-status]')).toContainText('Share link');
  const link = await page.getByLabel('Share link', { exact: true }).inputValue();
  console.log('SHARE link length ' + link.length);
  expect(link).toMatch(/\/heterogeneity\/index\.html#s=[A-Za-z0-9_-]+$/);
  await axe(page, 'share tab');

  const p2 = await fresh();
  await p2.goto(link);
  await expect(p2.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the share link.');
  expect(await p2.locator('#f-data').inputValue()).toBe(DATA);
  expect(await p2.locator('#f-tau2').inputValue()).toBe('reml');
  expect(await p2.locator('#stats-wrap').innerText()).toBe(stats);
  expect(await p2.evaluate(() => AlmFeaturesState.provenance)).toEqual(PROVENANCE);
  await expect(p2.getByRole('tab', { name: 'Share', exact: true })).toHaveAttribute('aria-selected', 'true');

  // PLANTED DEFECTS: truncated link and a link for another app -> message, nothing changed.
  const packed = link.split('#s=')[1];
  const p3 = await fresh();
  await p3.goto(link.split('#')[0] + '#s=' + packed.slice(0, -10));
  await expect(p3.locator('[data-testid=share-status]')).toContainText('could not be opened');
  await expect(p3.locator('[data-testid=share-status]')).toContainText('Nothing was changed.');
  expect(await p3.locator('#f-data').inputValue()).toBe(defaultSrc);
  expect(await p3.locator('#f-tau2').inputValue()).toBe('pm');
  expect(await p3.evaluate(() => AlmFeaturesState.provenance)).toEqual([]);
  const foreign = await page.evaluate(async () => AlmShare.encode('dta-sroc', { src: 'x' }, []));
  const p4 = await fresh();
  await p4.goto(link.split('#')[0] + '#s=' + foreign);
  await expect(p4.locator('[data-testid=share-status]')).toContainText('for app "dta-sroc", not "heterogeneity"');
  expect(await p4.locator('#f-data').inputValue()).toBe(defaultSrc);
  // set() validates before changing anything.
  const bad = await p4.evaluate(() => { try { AlmFeatures.get('heterogeneity').share.set({ data: 'x', tau2: 'bogus' }); return 'accepted'; } catch (e) { return e.message; } });
  expect(bad).toContain('unknown tau2 estimator');
  expect(await p4.locator('#f-data').inputValue()).toBe(defaultSrc);
  expect(errors).toEqual([]);
});
