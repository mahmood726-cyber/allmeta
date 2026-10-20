/**
 * cumulative-subgroup: paper-14 feature claims that had no test (wave-1 audit, feature_evidence_matrix.csv).
 *
 * F10  "Cumulative I² and effect p-values are not computed": the cumulative view exports, shows and plots neither
 *      (absence assertion over the results object, the summary cards, the SVG and the CSV/Markdown exports).
 * F14  "Results update as data are edited; there is no separate run button".
 * F16  Results export as CSV, Markdown table and Methods + Results report (.md and .txt): each downloaded file carries the
 *      page's current results exactly (value strings equal String(value) of window._almLastCumSub()).
 * F17  The state saves as JSON (Download JSON) and Import JSON restores it: data, view and title, and therefore identical
 *      results and plot.
 * Each claim has a planted negative control showing its assertion fails when the behaviour is broken.
 */
import { test, expect } from '@playwright/test';

const APP = '/cumulative-subgroup/index.html';
const CUM_EXPORT = ['_schema', 'view', 'k', 'mu_final', 'se_final', 'lo_final', 'hi_final', 'tau2_final', 'Q_final', 'series'];
const CUM_SERIES = ['step', 'label', 'year', 'mu', 'se', 'lo', 'hi', 'tau2'];
const DATA3 = 'Alpha, 0.31, 0.12, 2001, G1\nBeta, 0.12, 0.09, 2003, G2\nGamma, 0.45, 0.2, 2002, G1';

async function open(page) {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window._almLastCumSub === 'function' && window._almLastCumSub() && document.querySelector('#svg-host svg'));
}
async function download(page, selector) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
  const chunks = []; for await (const c of await dl.createReadStream()) chunks.push(c);
  return { name: dl.suggestedFilename(), text: Buffer.concat(chunks).toString('utf8') };
}
const results = page => page.evaluate(() => window._almLastCumSub());

// ---- F10 ----
// Everything the cumulative view exposes, as seen by a user: results object, cards, plot texts.
function f10Violations() {
  const r = window._almLastCumSub(), v = [];
  const cum = ['_schema', 'view', 'k', 'mu_final', 'se_final', 'lo_final', 'hi_final', 'tau2_final', 'Q_final', 'series'];
  const ser = ['step', 'label', 'year', 'mu', 'se', 'lo', 'hi', 'tau2'];
  if (!r || r.view !== 'cumulative') return ['not in cumulative view'];
  if (JSON.stringify(Object.keys(r)) !== JSON.stringify(cum)) v.push('results keys ' + Object.keys(r).join(','));
  r.series.forEach((s, j) => { if (JSON.stringify(Object.keys(s)) !== JSON.stringify(ser)) v.push('series[' + j + '] keys ' + Object.keys(s).join(',')); });
  const cards = [...document.querySelectorAll('#stats-wrap .stat .k')].map(e => e.textContent);
  if (JSON.stringify(cards) !== JSON.stringify(['k', 'Final pooled', 'Final τ²'])) v.push('cards ' + cards.join('|'));
  const shown = document.getElementById('stats-wrap').textContent + ' ' + [...document.querySelectorAll('#svg-host svg text')].map(t => t.textContent).join(' ');
  if (/I²|I2|I\^2/.test(shown)) v.push('I2 shown');
  if (/\bp\s*[=<>]|p-value|pval/i.test(shown)) v.push('p-value shown');
  return v;
}
const NO_I2_P_KEY = k => !/(^|[._])(I2|i2|I²|p|pval|p_value|pz|zval)([._]|$)/.test(k);

test('F10: the cumulative view computes, shows, plots and exports no I² and no effect p-value', async ({ page }) => {
  await open(page);
  expect(await page.evaluate(f10Violations)).toEqual([]);
  const csv = await download(page, '#alm-export-mount [data-action="csv"]');
  const keys = csv.text.split('\r\n').slice(1).map(l => l.split(',')[0]);
  expect(keys).toEqual(CUM_EXPORT);
  const row = csv.text.split('\r\n').find(l => l.startsWith('series,"'));
  const series = JSON.parse(row.slice('series,"'.length, -1).replace(/""/g, '"'));
  expect(series.every(s => JSON.stringify(Object.keys(s)) === JSON.stringify(CUM_SERIES))).toBe(true);
  expect(keys.filter(k => !NO_I2_P_KEY(k))).toEqual([]);
});

test('F10 negative control: a planted cumulative I² / p-value is reported', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const orig = window._almLastCumSub;
    window._almLastCumSub = () => { const r = orig(); return r && Object.assign({}, r, { series: r.series.map(s => Object.assign({}, s, { I2: 0, pval: 0.5 })) }); };
    document.querySelector('#svg-host svg').insertAdjacentHTML('beforeend', '<text x="1" y="1">I² = 0%</text>');
  });
  const v = await page.evaluate(f10Violations);
  expect(v.some(x => x.startsWith('series[0] keys'))).toBe(true);
  expect(v).toContain('I2 shown');
  expect(NO_I2_P_KEY('I2') || NO_I2_P_KEY('pval') || NO_I2_P_KEY('series.p')).toBe(false);
});

// ---- F14 ----
test('F14: no run button; editing the data, the view and the title updates results immediately', async ({ page }) => {
  await open(page);
  const buttons = await page.evaluate(() => [...document.querySelectorAll('button,input[type=submit],input[type=button]')].filter(b => !b.closest('#alm-validate'))
    .map(b => (b.textContent || b.value || '').trim()));
  expect(buttons.length).toBeGreaterThan(10);
  expect(buttons.filter(t => /^(run|calculate|compute|analy[sz]e|update|go|submit|apply)\b/i.test(t))).toEqual([]);
  expect(await page.locator('form:not(#alm-validate form):not(dialog form)').count()).toBe(0);
  const before = await results(page);
  await page.locator('#f-data').fill(DATA3);   // fires 'input' only; nothing is clicked
  await page.waitForFunction(() => window._almLastCumSub()?.k === 3, null, { timeout: 5000 });
  const after = await results(page);
  expect(after.mu_final).not.toBe(before.mu_final);
  await expect(page.locator('#stats-wrap .stat').first()).toContainText('3');
  expect(after.series.map(s => s.label)).toEqual(['Alpha', 'Gamma', 'Beta']);   // year order 2001, 2002, 2003
  await page.selectOption('#f-view', 'subgroup');
  await page.waitForFunction(() => window._almLastCumSub()?.view === 'subgroup', null, { timeout: 5000 });
  await expect(page.locator('#preview-heading')).toHaveText('Subgroup analysis');
  await page.locator('#f-title').fill('Edited title');
  await expect(page.locator('#svg-host svg text').first()).toHaveText('Edited title', { timeout: 5000 });
});

test('F14 negative control: a data box without the live listener leaves results stale, and the check sees it', async ({ page }) => {
  await open(page);
  const before = await results(page);
  await page.evaluate(() => { const t = document.getElementById('f-data'); t.replaceWith(t.cloneNode(true)); });  // drops the input listener
  await page.locator('#f-data').fill(DATA3);
  await page.waitForTimeout(500);
  expect((await results(page)).k).toBe(before.k);   // the F14 assertion (k becomes 3) would fail
});

// ---- F16 ----
// Each export carries the results exactly; value strings are String(value) (arrays: JSON).
function exportProblems(kind, text, r, meta) {
  const flat = Object.entries(r).map(([k, v]) => [k, Array.isArray(v) ? JSON.stringify(v) : String(v)]);
  const p = [];
  const has = (s, what) => { if (!text.includes(s)) p.push('missing ' + what); };
  if (kind === 'csv') {
    const esc = s => /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    const want = ['key,value', ...flat.map(([k, v]) => esc(k) + ',' + esc(v))].join('\r\n');
    if (text !== want) p.push('csv differs');
  } else if (kind === 'md') {
    const lines = text.split('\n');
    if (!/^\| key\s+\| value\s+\|$/.test(lines[0])) p.push('md header');
    flat.forEach(([k, v]) => { if (!lines.some(l => l.replace(/\s+\|$/, '').replace(/\s+\|\s+/, ' | ') === '| ' + k + ' | ' + v.replace(/\|/g, '\\|'))) p.push('md row ' + k); });
  } else if (kind === 'report-md' || kind === 'report-txt') {
    const plain = kind === 'report-txt';
    has((plain ? '' : '# ') + meta.title, 'title'); has(plain ? 'METHODS' : '## Methods', 'methods heading'); has(meta.desc, 'description');
    has(meta.methods, 'methods note'); has(plain ? 'RESULTS' : '## Results', 'results heading');
    flat.filter(([k]) => k !== '_schema').forEach(([k, v]) => {
      if (plain) has('\n' + k + ': ' + v + (k === flat[flat.length - 1][0] ? '' : '\n'), 'row ' + k);
      else if (!text.split('\n').some(l => l.replace(/\s+\|$/, '').replace(/\s+\|\s+/, ' | ') === '| ' + k + ' | ' + v.replace(/\|/g, '\\|'))) p.push('row ' + k);
    });
  }
  return p;
}
const META = page => page.evaluate(() => ({ title: document.querySelector('h1').textContent.replace(/\s+/g, ' ').trim(),
  desc: document.querySelector('header p').textContent.replace(/\s+/g, ' ').trim(), methods: document.querySelector('.footer-note').textContent.replace(/\s+/g, ' ').trim() }));

for (const view of ['cumulative', 'subgroup']) test(`F16: CSV, Markdown and Methods+Results (.md, .txt) exports carry the ${view} results exactly`, async ({ page }) => {
  await open(page);
  if (view === 'subgroup') { await page.selectOption('#f-view', 'subgroup'); await page.waitForFunction(() => window._almLastCumSub()?.view === 'subgroup'); }
  const r = await results(page), meta = await META(page);
  expect(r.view).toBe(view);
  for (const [kind, ext] of [['csv', 'cumsub-results.csv'], ['md', 'cumsub-results.md'], ['report-md', 'cumsub-results-report.md'], ['report-txt', 'cumsub-results-report.txt']]) {
    const f = await download(page, `#alm-export-mount [data-action="${kind}"]`);
    expect(f.name).toBe(ext);
    expect(exportProblems(kind, f.text, r, meta), kind).toEqual([]);
  }
});

test('F16 negative control: an export with one altered value or a missing row is reported', async ({ page }) => {
  await open(page);
  const r = await results(page), meta = await META(page);
  for (const kind of ['csv', 'md', 'report-md', 'report-txt']) {
    const f = await download(page, `#alm-export-mount [data-action="${kind}"]`);
    const v = String(r.mu_final), altered = f.text.replace(v, String(r.mu_final + 1e-12 * Math.max(1, Math.abs(r.mu_final)) * 7));
    expect(altered).not.toBe(f.text);
    expect(exportProblems(kind, altered, r, meta).length, kind + ' altered').toBeGreaterThan(0);
    const dropped = f.text.split(/\r?\n/).filter(l => !l.includes('tau2_final')).join(kind === 'csv' ? '\r\n' : '\n');
    expect(exportProblems(kind, dropped, r, meta).length, kind + ' dropped row').toBeGreaterThan(0);
  }
});

// ---- F17 ----
async function stateOf(page) {
  return page.evaluate(() => ({ data: document.getElementById('f-data').value, view: document.getElementById('f-view').value, title: document.getElementById('f-title').value,
    results: window._almLastCumSub(), svg: document.getElementById('svg-host').innerHTML }));
}
test('F17: Download JSON then Import JSON restores data, view and title, and the same results and plot', async ({ page }) => {
  await open(page);
  await page.locator('#f-data').fill('"Trial, quoted", 0.31, 0.12, 2001, G1\nBeta, 0.12, 0.09, 2003, G2\nGamma, -0.45, 0.2, 2002, G1');
  await page.selectOption('#f-view', 'subgroup');
  await page.locator('#f-title').fill('Round-trip title');
  await page.waitForFunction(() => window._almLastCumSub()?.view === 'subgroup' && window._almLastCumSub().k === 3);
  const saved = await stateOf(page);
  const f = await download(page, '#btn-json');
  expect(f.name).toBe('cumsub-state.json');
  const j = JSON.parse(f.text);
  expect(j._schema).toBe('cumulative-subgroup-v1');
  expect([j.data, j.view, j.title]).toEqual([saved.data, saved.view, saved.title]);
  await page.click('#btn-reset');
  await page.waitForFunction(() => window._almLastCumSub() === null);
  expect((await stateOf(page)).data).toBe('');
  await page.setInputFiles('#file-import', { name: 'cumsub-state.json', mimeType: 'application/json', buffer: Buffer.from(f.text) });
  await page.waitForFunction(() => window._almLastCumSub()?.k === 3);
  expect(await stateOf(page)).toEqual(saved);
});

test('F17 negative control: importing an altered state file does not reproduce the saved state, and the check sees it', async ({ page }) => {
  await open(page);
  const saved = await stateOf(page);
  const f = await download(page, '#btn-json');
  const j = JSON.parse(f.text); j.data = j.data.replace('-0.22', '-0.23');
  await page.click('#btn-reset');
  await page.setInputFiles('#file-import', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(j)) });
  await page.waitForFunction(() => window._almLastCumSub()?.k === 9);
  const back = await stateOf(page);
  expect(back).not.toEqual(saved);
  expect(back.results.mu_final).not.toBe(saved.results.mu_final);
});
