// Feature panel on app 16 (nma-inconsistency), on the app's built-in example (11 independent two-arm contrasts,
// treatments A-D, fixed-effect model):
//   (a) ENTRY  — the example as an Excel (tab) table, a paper-style "MD (lo to hi)" table and a Covidence-style
//                CSV export, driven through the AlmEntry API (parseTable -> detect -> convert(answers) ->
//                spec.entry.apply), reproduces the example's result; a planted reversed CI blocks; apply() refuses
//                invalid records (and networks the app would refuse) without touching the input. Prints ENTRYRT n/N.
//   (b) TEXT   — AlmText audit (TEXTAUDIT n/N, incl. DOM cross-check of the node-split table and global test),
//                >= 3 values equal what the page displays, snapshot __snapshots__/text-nma-inconsistency.json,
//                UI .md/.docx, planted perturbation of a DOM-cross-checked key FAILS.
//   (c) VERIFY — Verify in R (webR, netmeta) on the example: N of N PASS; the verification sentence appears in
//                Methods only while AlmFeatures.verifiedCurrent; planted perturbation -> that row FAILS; ZIP.
//   (d) SHARE  — link round trip restores data, model, provenance and the result; bad links change nothing.
//   (e) axe on the panel (serious/critical) after animations settle.
// Run: npx playwright test -c playwright.features.config.mjs features-nma-inconsistency
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readZip, readTiff, decodePng } from './zip-reader.mjs';

const APP = 'nma-inconsistency';
const PAGE = '/nma-inconsistency/index.html';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SNAP = path.join(HERE, '__snapshots__', 'text-nma-inconsistency.json');
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BENIGN = /frame-ancestors|ERR_CONNECTION|favicon|glossary|404/;

// The built-in example exactly as the #src textarea in nma-inconsistency/index.html holds it (asserted below).
const EX = [
  ['A', 'B', '-0.30', '0.10'], ['A', 'B', '-0.32', '0.08'], ['A', 'B', '-0.28', '0.09'], ['A', 'C', '-0.20', '0.12'],
  ['A', 'C', '-0.22', '0.10'], ['B', 'C', '0.10', '0.11'], ['B', 'C', '0.08', '0.13'], ['A', 'D', '-0.50', '0.15'],
  ['B', 'D', '-0.25', '0.18'], ['C', 'D', '-0.35', '0.14'], ['A', 'D', '-0.48', '0.14'],
];
const EXAMPLE_TEXT = EX.map(r => r.join(', ')).join('\n');
const LABELS = EX.map((_, i) => `Study ${i + 1}`);
const Z975 = 1.959963984540054; // qnorm(0.975), the app's own constant
const minus = s => String(s).replace(/^-/, '−');

const PROVENANCE = [
  { id: 'p1', label: 'Alpha 2019', reference: 'Alpha A et al. Trials 2019;20:1', location: 'Table 2', pastedText: 'MD −0.30 (−0.50 to −0.10)',
    choice: { 'arm(s)': 'treatment: A / control: B', outcome: 'pain score', timepoint: '12 weeks' },
    values: [{ field: 'yi', value: -0.3, span: [3, 8], text: '−0.30' }],
    conversions: [{ field: 'sei', formula: 'SE = (U − L)/(2·z)', citation: 'Cochrane Handbook v6.5 §6.3.1', inputs: { lo: -0.5, hi: -0.1 }, output: 0.102 }],
    flags: [], usedAs: 'effect of A relative to B (mean difference) with its standard error', confirmed: true, confirmedAt: '2026-10-20T10:00:00Z' },
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

// The app's own last result (the object run() stores and renders from) + the rendered table and global text.
async function appResult(page) {
  return page.evaluate(() => ({
    result: JSON.parse(JSON.stringify(window._almLastInco())),
    table: document.getElementById('ns-body').innerText,
    global: document.getElementById('dbt').innerText,
  }));
}
// Every numeric leaf of the result object, by path.
function leaves(o, pre = '', out = {}) {
  if (typeof o === 'number') { out[pre] = o; return out; }
  if (o && typeof o === 'object') for (const k of Object.keys(o)) leaves(o[k], pre ? pre + '.' + k : k, out);
  return out;
}
const rel = (a, b) => a === b || Math.abs(a - b) <= 1e-9 * Math.max(1e-300, Math.abs(b));

// ENTRY through the API: parseTable -> detect -> convert(answers) -> spec.entry.apply(records) (only if nothing blocks).
async function enter(page, text, answers) {
  return page.evaluate(({ text, answers, app }) => {
    const t = AlmEntry.parseTable(text);
    const d = AlmEntry.detect(t, 'contrast-nma');
    const out = AlmEntry.convert(t, d, 'contrast-nma', answers);
    const blocking = out.flags.filter(f => f.blocking);
    const res = blocking.length ? null : AlmFeatures.get(app).entry.apply(out.records);
    return {
      blocking: blocking.map(f => f.code), questions: out.questions.map(q => q.id),
      warnings: out.flags.filter(f => !f.blocking).map(f => f.code), steps: out.steps.map(s => s.text),
      records: out.records.map(r => ({ study: r.study, t1: r.t1, t2: r.t2, yi: r.yi, sei: r.sei })), res,
      src: document.getElementById('src').value,
    };
  }, { text, answers, app: APP });
}

test('ENTRY: example as Excel, paper-style and Covidence tables -> same result; planted bad row blocks', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(PAGE);
  await expect(page.locator('#ns-body tr').first()).toBeVisible();
  expect(await page.locator('#src').inputValue()).toBe(EXAMPLE_TEXT);
  expect(await page.locator('#f-model').inputValue()).toBe('FE');
  const base = await appResult(page);
  expect(base.result.model).toBe('FE');
  expect(base.result.nodeSplit.length).toBeGreaterThan(0);
  const entry = await page.evaluate(app => { const e = AlmFeatures.get(app).entry; return { schema: e.schema, usedAs: e.usedAs }; }, APP);
  expect(entry.schema).toBe('contrast-nma');
  expect(entry.usedAs).toMatch(/standard error/);
  const want = EX.map((r, i) => ({ study: LABELS[i], t1: r[0], t2: r[1], yi: Number(r[2]), sei: Number(r[3]) }));
  let passed = 0;
  const N = 3;

  // 1. Excel-style paste: generic Estimate needs an explicit measure as well as the treatment columns.
  const excel = 'Study\tTreatment 1\tTreatment 2\tEstimate\tSE\n' + EX.map((r, i) => [LABELS[i], ...r].join('\t')).join('\n');
  const unanswered = await enter(page, excel, { 'column:1': 't1', 'column:2': 't2' });
  expect(unanswered.blocking).toEqual(['unanswered-question']);
  expect(unanswered.questions.sort()).toEqual(['column:1', 'column:2', 'measure:type']);
  expect(unanswered.res).toBeNull();
  expect(unanswered.src).toBe(EXAMPLE_TEXT);
  expect(await appResult(page)).toEqual(base);
  const e1 = await enter(page, excel, { 'column:1': 't1', 'column:2': 't2', 'measure:type': 'difference' });
  expect(e1.blocking, JSON.stringify(e1)).toEqual([]);
  expect(e1.questions.sort()).toEqual(['column:1', 'column:2', 'measure:type']);
  expect(e1.steps).toContain('Effect measure confirmed as a difference');
  expect(e1.records).toEqual(want);
  expect(e1.res).toEqual({ ok: true, n: 11 });
  expect(await appResult(page)).toEqual(base); // identical numbers -> identical result and display
  passed++;

  // 2. Paper-style table: "MD (95% CI)" with unicode minus and "to", CI limits at full precision so the SE recovered
  //    from the CI equals the example SE to ~1e-15 (Cochrane Handbook §6.3.1: (U - L)/(2z)).
  const paperRows = EX.map(([a, b, e, s], i) => {
    const y = Number(e), se = Number(s);
    return `${LABELS[i]}\t${a}\t${b}\t${minus(e)} (${minus(String(y - Z975 * se))} to ${minus(String(y + Z975 * se))})`;
  });
  const paper = 'Trial\tExperimental\tControl\tMean difference (95% CI)\n' + paperRows.join('\n');
  const e2 = await enter(page, paper, { 'column:1': 't1', 'column:2': 't2' });
  expect(e2.blocking, JSON.stringify(e2)).toEqual([]);
  expect(e2.steps.filter(s => /SE estimated from CI/.test(s))).toHaveLength(11);
  console.log('ENTRY conversion log (paper-style): ' + e2.steps[0]);
  expect(e2.records.map(r => [r.study, r.t1, r.t2, r.yi])).toEqual(want.map(r => [r.study, r.t1, r.t2, r.yi]));
  expect(e2.res).toEqual({ ok: true, n: 11 });
  const r2 = await appResult(page), lb = leaves(base.result), l2 = leaves(r2.result);
  expect(Object.keys(l2).sort()).toEqual(Object.keys(lb).sort());
  expect(r2.result.model).toBe('FE');
  expect(r2.result.nodeSplit.map(x => x.comparison)).toEqual(base.result.nodeSplit.map(x => x.comparison));
  const miss2 = Object.keys(lb).filter(k => !rel(l2[k], lb[k])).map(k => `${k}: ${l2[k]} vs ${lb[k]}`);
  expect(miss2).toEqual([]);
  console.log(`ENTRY paper-style: ${Object.keys(lb).length} numeric result fields within rel 1e-9`);
  passed++;

  // 3. Covidence-style extraction export (comma-separated, quoted, extra Outcome column ignored by the user).
  const q = s => '"' + s + '"';
  const cov = [['Study ID', 'Treatment 1', 'Treatment 2', 'Outcome', 'Effect estimate', 'Standard error'].map(q).join(',')]
    .concat(EX.map((r, i) => [LABELS[i], r[0], r[1], 'Pain score', r[2], r[3]].map(q).join(','))).join('\n');
  const e3 = await enter(page, cov, { 'column:1': 't1', 'column:2': 't2', 'column:3': 'ignore', 'column:4': 'yi', 'measure:type': 'difference' });
  expect(e3.blocking, JSON.stringify(e3)).toEqual([]);
  expect(e3.questions.sort()).toEqual(['column:1', 'column:2', 'column:3', 'column:4', 'measure:type']);
  expect(e3.steps).toContain('Effect measure confirmed as a difference');
  expect(e3.records).toEqual(want);
  expect(e3.res).toEqual({ ok: true, n: 11 });
  expect(await appResult(page)).toEqual(base);
  passed++;
  console.log(`ENTRYRT ${passed}/${N} formats reproduce the example result (Excel exact, paper-style rel 1e-9, Covidence exact)`);

  // PLANTED: a reversed CI (lower > upper) is a blocking sanity check; nothing is applied.
  const before = await page.locator('#src').inputValue();
  const planted = paper.replace(/^Study 4\t.*$/m, 'Study 4\tA\tC\t−0.20 (−0.10 to −0.30)');
  const e4 = await enter(page, planted, { 'column:1': 't1', 'column:2': 't2' });
  console.log('ENTRY planted blocking flags: ' + e4.blocking.join(', '));
  expect(e4.blocking).toContain('ci-order');
  expect(e4.res).toBeNull();
  expect(e4.questions).toContain('swap-ci:3');
  expect(e4.src).toBe(before);
  // PLANTED: apply() itself refuses invalid records and networks the app refuses, before touching the input.
  const refusals = await page.evaluate(app => {
    const a = AlmFeatures.get(app).entry.apply;
    const ok = [
      { study: 's1', t1: 'A', t2: 'B', yi: 0.1, sei: 0.1 }, { study: 's2', t1: 'B', t2: 'C', yi: 0.1, sei: 0.1 },
      { study: 's3', t1: 'A', t2: 'C', yi: 0.1, sei: 0.1 }];
    return [
      a(ok.map((r, i) => i === 0 ? { ...r, sei: 0 } : r)),
      a(ok.map((r, i) => i === 1 ? { ...r, t2: 'B' } : r)),
      a(ok.map((r, i) => i === 2 ? { ...r, yi: NaN } : r)),
      a([...ok, { study: 's4', t1: 'D', t2: 'E', yi: 0.1, sei: 0.1 }]),   // disconnected network (app's own rule)
      a(ok.map(r => ({ ...r, study: 'same' }))),                         // multi-arm / repeated study ID
      a(ok.slice(0, 2)),                                                  // fewer than 3 contrasts
      a([]),
    ].map(r => [r.ok, r.error || '']);
  }, APP);
  console.log('ENTRY apply refusals: ' + refusals.map(r => r[1]).join(' | '));
  expect(refusals.map(r => r[0])).toEqual([false, false, false, false, false, false, false]);
  expect(refusals[3][1]).toContain('disconnected');
  expect(await page.locator('#src').inputValue()).toBe(before);
  expect(errors).toEqual([]);
});

// ------------------------------------------------------------------------------------------------ TEXT

async function openApp(page, errs) {
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(PAGE, { waitUntil: 'load' });
  await page.waitForFunction(app => typeof window._almLastInco === 'function' && window._almLastInco()
    && window.AlmText && window.AlmTextSpecs && window.AlmTextSpecs[app], APP, { timeout: 20000 });
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
        source: 'built-in example (nma-inconsistency/index.html #src: 11 independent two-arm contrasts, treatments A-D), default options: fixed-effect model',
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

// The node-split table and global line as the page DISPLAYS them (read independently of the adapter's dom()).
async function pageCells(page) {
  return page.evaluate(() => ({
    rows: [...document.querySelectorAll('#ns-body tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent.trim())),
    global: document.getElementById('dbt').textContent.replace(/\s+/g, ' ').trim(),
  }));
}

test('TEXT: audit passes, matches the page display and the committed snapshot', async ({ page }, testInfo) => {
  const errs = [];
  await openApp(page, errs);
  const out = await renderInPage(page);

  // Always emit the rendered text (artifact) so the snapshot can be reviewed / regenerated.
  const actualJson = JSON.stringify(out.snapshot, null, 2) + '\n';
  const actualPath = testInfo.outputPath('text-nma-inconsistency.json');
  fs.writeFileSync(actualPath, actualJson, 'utf8');
  fs.mkdirSync(path.join(HERE, 'artifacts'), { recursive: true });
  fs.writeFileSync(path.join(HERE, 'artifacts', 'text-nma-inconsistency.actual.json'), actualJson, 'utf8');
  await testInfo.attach('text-nma-inconsistency.json', { path: actualPath, contentType: 'application/json' });

  console.log(`TEXTAUDIT ${out.audit.passed}/${out.audit.checks} tokens=${out.audit.tokens} domChecked=${out.audit.domChecked} domKeys=${out.domKeys.length}`);
  expect(out.audit.failures, JSON.stringify(out.audit.failures)).toEqual([]);
  expect(out.audit.ok).toBe(true);
  expect(out.audit.domChecked).toBeGreaterThanOrEqual(3);

  // Independent DOM read: every displayed node-split row and the global test appear verbatim in the Results text.
  const cells = await pageCells(page);
  const res = out.text.results.replace(/−/g, '-');
  // A displayed p of 0.000 or 0.001 may be printed as "p < 0.001" (AlmText threshold); anything else verbatim.
  const pTexts = p => (p === '0.000' ? ['p < 0.001'] : p === '0.001' ? [`p = ${p}`, 'p < 0.001'] : [`p = ${p}`]);
  const expectations = cells.rows.map(([cmp, d, i, df, z, p]) => [pTexts(p).map(pt =>
    `${cmp}: direct ${d.replace(' (', ' (SE ')}, indirect ${i.replace(' (', ' (SE ')}, difference ${df.replace(' (', ' (SE ')}, z = ${z}, ${pt}`),
    `node-split ${cmp}`]);
  const g = /Q = (\S+), df = (\d+), p = (\S+?)\.(?:\s|$)/.exec(cells.global);
  expect(g, cells.global).not.toBeNull();
  expectations.push([pTexts(g[3]).map(pt => `Q = ${g[1]} (df = ${g[2]}, ${pt})`), 'design-by-treatment Q, df, p']);
  let hit = 0;
  for (const [alts, what] of expectations) { if (alts.some(s => res.includes(s))) hit++; else console.log(`TEXTDOM miss ${what}: ${alts.join(' | ')}`); }
  console.log(`TEXTDOM ${hit}/${expectations.length} (${cells.rows.length} node-split rows x 8 values + global Q/df/p)`);
  expect(expectations.length).toBeGreaterThanOrEqual(3);
  expect(hit).toBe(expectations.length);
  // Counts in the text equal the page: one row per split comparison, "inconsistent" chips.
  expect(out.text.results).toContain(`Node-splitting (${cells.rows.length} comparisons`);
  const nIncon = cells.rows.filter(r => r[6] === 'inconsistent').length;
  if (nIncon) expect(out.text.results).toContain(`${nIncon} comparison`); else expect(out.text.results).toContain('No comparison had a P value below five per cent.');

  if (!fs.existsSync(SNAP)) {
    throw new Error(`Snapshot ${path.relative(HERE, SNAP)} is missing. Review the actual text attached as text-nma-inconsistency.json ` +
      `(also artifacts/text-nma-inconsistency.actual.json), check its numbers against the page, and commit it.`);
  }
  expect(out.snapshot).toEqual(JSON.parse(fs.readFileSync(SNAP, 'utf8')));
  expect(errs, 'no console errors').toEqual([]);
});

test('TEXT: random-effects (PM) run also passes the audit with tau2 cross-checked against the page', async ({ page }) => {
  const errs = [];
  await openApp(page, errs);
  await page.locator('#f-model').selectOption('PM');
  await page.locator('#btn-run').click();
  await expect(page.locator('#dbt')).toContainText('PM τ² =');
  const out = await renderInPage(page);
  console.log(`TEXTAUDIT PM ${out.audit.passed}/${out.audit.checks} domKeys=${out.domKeys.length}`);
  expect(out.audit.failures, JSON.stringify(out.audit.failures)).toEqual([]);
  expect(out.domKeys).toContain('tau2');
  const shown = /PM τ² = (-?\d+\.\d+)/.exec((await pageCells(page)).global)[1];
  expect(out.text.results.replace(/−/g, '-')).toContain(`The random-effects model used τ² = ${shown} (Paule–Mandel).`);
  expect(out.text.methods).toContain('Paule and Mandel');
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
  expect(md.suggestedFilename()).toBe('nma-inconsistency-report-text.md');
  const mdText = fs.readFileSync(await md.path(), 'utf8');
  expect(mdText).toContain('## Results'); expect(mdText).toContain(out.text.results); expect(mdText).toContain(out.text.methods);
  const [dx] = await Promise.all([page.waitForEvent('download'), host.locator('.alm-text-docx').click()]);
  expect(dx.suggestedFilename()).toBe('nma-inconsistency-report-text.docx');
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
    window.__almTextPerturb = { key: 'split.0.direct', delta: 0.01 };
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
  expect(out.failed).toContain('dom:split.0.direct');
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
  // The core honours the planted-defect hook only on an explicitly opted-in test page.
  await page.goto(PAGE + '?almtest=1');
  await expect(page.locator('#ns-body tr').first()).toBeVisible();
  await expect(page.locator('#alm-features')).toBeVisible();
  await openPanel(page);

  const verifyTab = page.getByRole('tab', { name: 'Verify in R', exact: true });
  const shareTab = page.getByRole('tab', { name: 'Share', exact: true });
  await verifyTab.click();
  await expect(verifyTab).toHaveAttribute('aria-selected', 'true');
  await expect(shareTab).toHaveAttribute('tabindex', '-1');
  await axe(page, 'verify tab (before run)');

  const nExpected = await page.evaluate(app => { const a = AlmLiveAdapters[app]; return a.appValues(a.currentState()).length; }, APP);
  const panel = page.locator('#alm-f-panel-verify');
  const summary = panel.locator('[data-testid=verify-summary]');
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(summary).not.toBeEmpty({ timeout: 600_000 });
  const text = (await summary.textContent()).trim();
  console.log('VERIFY ' + text);
  const m = /^(\d+) of (\d+) computed quantities match R; 0 not computed — PASS$/.exec(text);
  expect(m, text).not.toBeNull();
  const N = +m[2];
  expect(N).toBe(nExpected);
  expect(N).toBeGreaterThanOrEqual(5); expect(+m[1]).toBe(N);
  const results = await panel.locator('tbody td[data-result]').allTextContents();
  expect(results).toHaveLength(N); expect(results.filter(r => r !== 'PASS')).toEqual([]);
  const keys = await panel.locator('tbody tr').evaluateAll(trs => trs.map(tr => tr.dataset.key));
  console.log('VERIFY keys ' + keys.join(','));
  const st = await page.evaluate(app => ({ verify: AlmFeaturesState.verify, revision: AlmFeatures.revision(app), current: AlmFeatures.verifiedCurrent(app) }), APP);
  console.log('VERIFY versions ' + JSON.stringify(st.verify.versions) + ' graphics ' + JSON.stringify(st.verify.graphics));
  expect(st.verify.passed).toBe(true); expect(st.verify.nPassed).toBe(N);
  expect(st.verify.n).toBe(N);
  expect([st.verify.nNotComputed, st.verify.nOptional, st.verify.nNotApplicable]).toEqual([0, 0, 0]);
  expect(st.verify.testHook).toBe(false); expect(st.verify.perturbed).toBeNull();
  expect(st.verify.revision).toBe(st.revision);
  expect(st.current).toBe(true);
  expect(st.verify.versions.webR).toBe('0.5.5');
  // R net-split forest beside the app's net-split SVG; R network graph (R only).
  await expect(panel.locator('figure img')).toHaveCount(2);
  expect(await panel.locator('figure img').evaluateAll(imgs => imgs.every(img => img.complete && img.naturalWidth > 0))).toBe(true);
  await expect(panel.locator('figure svg')).toHaveCount(1);
  expect(await page.evaluate(() => document.querySelectorAll('#ns-plot').length)).toBe(1);
  await expect(panel.getByRole('region', { name: 'R script' })).toContainText('meta::forest(spl)');
  await expect(panel.getByRole('region', { name: 'R script' })).toContainText('netmeta::netgraph(m)');
  await axe(page, 'verify tab (after run)');

  // The Methods verification sentence: present only while the verified state is current (AlmFeatures.verifiedCurrent).
  const methodsNow = () => page.evaluate(app => {
    const spec = AlmTextSpecs[app], r = spec.results(), ctx = AlmText.context(app, spec);
    const out = AlmText.render(spec.templates, r, ctx);
    return { methods: out.methods.text, ok: AlmText.audit(out, r, { ctx, dom: spec.dom() }).ok };
  }, APP);
  const m1 = await methodsNow();
  expect(m1.ok).toBe(true);
  expect(m1.methods).toMatch(new RegExp(`Results were independently verified in R \\(netmeta [^;]+; webR 0\\.5\\.5\\), with all ${N} compared quantities within tolerance\\.`));
  await page.locator('#f-model').selectOption('DL'); // changed, not re-run: no longer the verified state
  expect(await page.evaluate(app => AlmFeatures.verifiedCurrent(app), APP)).toBe(false);
  expect((await methodsNow()).methods).not.toContain('independently verified');
  await page.locator('#f-model').selectOption('FE');
  expect(await page.evaluate(app => AlmFeatures.verifiedCurrent(app), APP)).toBe(true);

  const [zipDl] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: /^Download everything \(ZIP\)/ }).click()]);
  expect(zipDl.suggestedFilename()).toBe('nma-inconsistency-verify-in-r.zip');
  const entries = readZip(fs.readFileSync(await zipDl.path()));
  const byName = Object.fromEntries(entries.map(e => [e.name, e.bytes]));
  console.log('VERIFY ZIP ' + entries.map(e => e.name + ':' + e.bytes.length).join(' '));
  for (const name of ['nma-inconsistency-verify.R', 'nma-inconsistency-verify-comparison.csv', 'sessionInfo.txt', 'console.txt',
    'nma-inconsistency-netsplit-R-300dpi.png', 'nma-inconsistency-netsplit-R.pdf', 'nma-inconsistency-netsplit-R-300dpi.tiff',
    'nma-inconsistency-netgraph-R-300dpi.png', 'nma-inconsistency-netgraph-R.pdf', 'nma-inconsistency-netgraph-R-300dpi.tiff',
    'truthcert.json']) expect(byName[name], name).toBeDefined();
  expect(Object.keys(byName).filter(nm => /^nma-inconsistency-netsplit-(R|app)\.svg$/.test(nm))).toHaveLength(1);
  expect(Object.keys(byName).filter(nm => /^nma-inconsistency-netgraph-app\.svg$/.test(nm))).toEqual([]);
  const dec = b => new TextDecoder().decode(b);
  const csv = dec(byName['nma-inconsistency-verify-comparison.csv']).trim().split('\n');
  expect(csv[0]).toBe('quantity,key,app,R,diff,abs_diff,tolerance,kind,result'); expect(csv).toHaveLength(N + 1);
  expect(csv.slice(1).every(l => l.endsWith(',PASS'))).toBe(true);
  // Every exported field must match the actual comparison, including relative diff and absolute difference.
  expect(csv.slice(1).map(l => l.split(','))).toEqual(st.verify.rows.map(r =>
    [r.label, r.key, r.app, r.ref, r.diff, r.absDiff, r.tol, r.kind, 'PASS'].map(String)));
  const script = dec(byName['nma-inconsistency-verify.R']);
  expect(script).toContain('netmeta::netsplit('); expect(script).toContain('netmeta::decomp.design(');
  expect(script).toContain('meta::forest(spl)'); expect(script).toContain('print(sessionInfo())');
  expect(dec(byName['sessionInfo.txt'])).toContain('netmeta');
  expect(dec(byName['console.txt'])).toContain('ALMJSON:');
  expect(dec(byName['nma-inconsistency-netsplit-R.pdf'].subarray(0, 5))).toBe('%PDF-');
  const png = decodePng(byName['nma-inconsistency-netsplit-R-300dpi.png']);
  expect([png.width, png.height]).toEqual([2400, 2400]);
  expect(png.phys).toEqual({ x: 11811, y: 11811, unit: 1 });
  const tif = readTiff(byName['nma-inconsistency-netgraph-R-300dpi.tiff']);
  expect([tif.tags[256].value, tif.tags[257].value]).toEqual([2100, 2100]);
  expect(tif.tags[282].value).toEqual([300, 1]); expect(tif.tags[283].value).toEqual([300, 1]);
  const receipt = JSON.parse(dec(byName['truthcert.json']));
  const rr = receipt.extra.results;
  expect(rr.app).toBe('nma-inconsistency'); expect(rr.passed).toBe(true); expect(rr.n).toBe(N);
  expect(rr.nPassed).toBe(N);
  expect([rr.nNotComputed, rr.nOptional, rr.nNotApplicable]).toEqual([0, 0, 0]);
  expect(rr.testHook).toBe(false); expect(rr.perturbed).toBeNull(); expect(rr.summary).toBe(text);
  expect(rr.stateRevision).toBe(st.verify.revision); expect(rr.stale).toBe(false);
  expect(rr.files.map(f => f.name).sort()).toEqual(Object.keys(byName).filter(nm => nm !== 'truthcert.json').sort());
  for (const f of rr.files) expect(f.sha256, f.name).toBe(sha(byName[f.name]));
  expect(receipt.signed).toBe(false);

  // PLANTED DEFECT: perturb one app value via the documented test hook -> exactly that row FAILS.
  await page.evaluate(() => { window.__almVerifyPerturb = { key: 'split.0.direct', delta: 1e-3 }; });
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(summary).toContainText('FAIL', { timeout: 300_000 });
  const planted = (await summary.textContent()).trim();
  console.log('VERIFY PLANTED ' + planted);
  expect(planted).toBe(`TEST MODE (test hook active; not a verification) — ${N - 1} of ${N} computed quantities match R; 0 not computed — FAIL: 1 not matching R; test hook active`);
  await expect(summary).toHaveAttribute('data-test-mode', 'true');
  const failing = await panel.locator('tbody tr').evaluateAll(trs => trs.filter(tr => tr.querySelector('td[data-result]').textContent !== 'PASS').map(tr => tr.dataset.key));
  expect(failing).toEqual(['split.0.direct']);
  const plantedState = await page.evaluate(() => AlmFeaturesState.verify);
  expect(plantedState.passed).toBe(false); expect(plantedState.testHook).toBe(true);
  expect(plantedState.perturbed).toEqual({ key: 'split.0.direct', delta: 1e-3 });
  expect([plantedState.n, plantedState.nPassed, plantedState.nNotComputed, plantedState.nOptional, plantedState.nNotApplicable]).toEqual([N, N - 1, 0, 0, 0]);
  expect(await page.evaluate(app => AlmFeatures.verifiedCurrent(app), APP)).toBe(false);
  expect((await methodsNow()).methods).not.toContain('independently verified');
  await page.evaluate(() => { delete window.__almVerifyPerturb; });
  expect(errors).toEqual([]);
});

// ----------------------------------------------------------------------------------------------- SHARE

test('SHARE: link restores data, model, provenance and the result; bad links change nothing', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const errors = [];
  const fresh = async () => { const ctx = await browser.newContext(); const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); return p; };
  const DATA = 'A, B, -0.25, 0.11, s1\nA, C, -0.10, 0.13, s2\nB, C, 0.20, 0.12, s3\nA, B, -0.35, 0.10, s4\nA, D, -0.40, 0.15, s5\nC, D, -0.30, 0.14, s6\n"Drug, new", A, 0.05, 0.20, s7';
  const page = await fresh();
  await page.goto(new URL(PAGE, baseURL).href);
  const defaultSrc = await page.locator('#src').inputValue();
  expect(defaultSrc).toBe(EXAMPLE_TEXT);
  await page.locator('#src').fill(DATA);
  await page.locator('#f-model').selectOption('PM');
  await page.locator('#btn-run').click();
  const table = await page.locator('#ns-body').innerText(), global = await page.locator('#dbt').innerText();
  expect(global).toContain('PM τ²');
  await page.evaluate(p => { AlmFeaturesState.provenance = p; }, PROVENANCE);
  await openPanel(page);
  await page.getByRole('tab', { name: 'Share', exact: true }).click();
  await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
  await expect(page.locator('[data-testid=share-status]')).toContainText('Share link');
  const link = await page.getByLabel('Share link', { exact: true }).inputValue();
  console.log('SHARE link length ' + link.length);
  expect(link).toMatch(/\/nma-inconsistency\/index\.html#s=[A-Za-z0-9_-]+$/);
  await axe(page, 'share tab');

  const p2 = await fresh();
  await p2.goto(link);
  await expect(p2.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the share link.');
  expect(await p2.locator('#src').inputValue()).toBe(DATA);
  expect(await p2.locator('#f-model').inputValue()).toBe('PM');
  expect(await p2.locator('#ns-body').innerText()).toBe(table);
  expect(await p2.locator('#dbt').innerText()).toBe(global);
  expect(await p2.evaluate(() => AlmFeaturesState.provenance)).toEqual(PROVENANCE);
  await expect(p2.getByRole('tab', { name: 'Share', exact: true })).toHaveAttribute('aria-selected', 'true');

  // PLANTED DEFECTS: truncated link and a link for another app -> message, nothing changed.
  const packed = link.split('#s=')[1];
  const p3 = await fresh();
  await p3.goto(link.split('#')[0] + '#s=' + packed.slice(0, -10));
  await expect(p3.locator('[data-testid=share-status]')).toContainText('could not be opened');
  await expect(p3.locator('[data-testid=share-status]')).toContainText('Nothing was changed.');
  expect(await p3.locator('#src').inputValue()).toBe(defaultSrc);
  expect(await p3.locator('#f-model').inputValue()).toBe('FE');
  expect(await p3.evaluate(() => AlmFeaturesState.provenance)).toEqual([]);
  const foreign = await page.evaluate(async () => AlmShare.encode('dta-sroc', { src: 'x' }, []));
  const p4 = await fresh();
  await p4.goto(link.split('#')[0] + '#s=' + foreign);
  await expect(p4.locator('[data-testid=share-status]')).toContainText('for app "dta-sroc", not "nma-inconsistency"');
  expect(await p4.locator('#src').inputValue()).toBe(defaultSrc);
  // set() validates before changing anything.
  const bad = await p4.evaluate(app => { try { AlmFeatures.get(app).share.set({ src: 'x', model: 'REML' }); return 'accepted'; } catch (e) { return e.message; } }, APP);
  expect(bad).toContain('unknown model');
  expect(await p4.locator('#src').inputValue()).toBe(defaultSrc);
  expect(errors).toEqual([]);
});
