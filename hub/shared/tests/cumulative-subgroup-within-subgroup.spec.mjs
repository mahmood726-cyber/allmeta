// Within-subgroup cumulative meta-analysis (cumulative-subgroup/subcum/): replay of the separate, pinned
// R composite reference (per subgroup: metafor 5.2.1 rma(method="PM") + cumul(order = year)), planted
// negative controls that MUST fail, a rendered check of the new plot and an export round trip.
// Expected counts come from the pinned MANIFEST, never from a run.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const root = new URL('../../../cumulative-subgroup/subcum/validate/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('MANIFEST.json', root), 'utf8'));
const url = '/cumulative-subgroup/index.html';

async function open(page) {
  await page.goto(url);
  await page.waitForFunction(() => window.AlmSubgroupCumulative && window.__almSubCumLast);
}
// Load the pinned evidence once into the page (SHA-256 verified) for the negative controls.
async function loadEvidence(page) {
  await page.evaluate(async () => { window.__ev = await AlmSubgroupCumulative.loadPinned(document.baseURI); });
}
// Run replayCore on a mutated copy of the evidence; `mutate` is a function body with (ev, A) in scope.
async function planted(page, mutate, engine) {
  return page.evaluate(([mutate, engine]) => {
    const A = AlmSubgroupCumulative, ev = structuredClone(window.__ev);
    new Function('ev', 'A', mutate)(ev, A);
    const deps = { parse: __almParseStudies, cumulative: __almCumulative, adjudicated: ev.adjudicated, maxFailures: 1e6 };
    if (engine) new Function('deps', engine)(deps);
    const r = A.replayCore(ev.corpus, ev.reference, deps);
    const q = {}; r.failures.forEach(f => { q[f.quantity] = (q[f.quantity] || 0) + 1; });
    return { checks: r.checks, failed: r.failed, expected: r.expected, quantities: q, keys: [...new Set(r.failures.map(f => f.key))] };
  }, [mutate, engine || null]);
}

test('within-subgroup tier replays the pinned R composite reference exactly (button path)', async ({ page }) => {
  test.setTimeout(300000);
  expect(manifest.configurations).toBe(2485); expect(manifest.refused).toBe(6); expect(manifest.adjudicated_pools).toBe(34);
  await open(page);
  // The existing 609,398-check contract is a different object and must still be the one the adapter pins.
  await page.locator('#subcum-replay').click();
  await expect(page.locator('#subcum-status')).toContainText('passed', { timeout: 240000 });
  const r = await page.evaluate(() => window.__almSubCumReplay);
  expect(r.error).toBeUndefined();
  expect(r.checks).toBe(manifest.checks); expect(r.expected).toBe(manifest.checks);
  expect(r.passed).toBe(manifest.checks); expect(r.failed).toBe(0); expect(r.failures).toEqual([]);
  expect(r.refusals).toHaveLength(manifest.refused); expect(r.configurations).toBe(manifest.configurations);
  expect(r.groups).toBe(manifest.subgroups); expect(r.steps).toBe(manifest.steps);
  expect(r.conditionalPools).toBe(manifest.adjudicated_pools);
  await expect(page.locator('#subcum-status')).toContainText(`${manifest.checks}/${manifest.checks} passed; 0 failed`);
  console.log('SUBCUM REPLAY', r.passed + '/' + r.checks, 'conditional pools', r.conditionalPools);
});

test('within-subgroup tier refuses changed evidence bytes', async ({ page }) => {
  await open(page);
  for (const f of ['corpus', 'reference', 'adjudicated']) {
    await page.route(`**/cumulative-subgroup/subcum/validate/corpus/${f}.json`, r => r.fulfill({ contentType: 'application/json', body: '[]' }));
    await page.locator('#subcum-replay').click();
    await expect(page.locator('#subcum-status')).toHaveText(/^Refused: Evidence refused: SHA-256 mismatch/);
    await page.unrouteAll();
  }
});

test('planted negative controls fail; unplanted evidence passes', async ({ page }) => {
  test.setTimeout(600000);
  await open(page); await loadEvidence(page);
  // Control of the controls: no mutation -> zero failures with the same harness.
  const clean = await planted(page, '');
  expect(clean.failed).toBe(0); expect(clean.checks).toBe(manifest.checks);
  // NC1 shuffle one subgroup's accrual order in the R reference (reverse the steps of the first group with k >= 3).
  const nc1 = await planted(page, `const r = ev.reference.find(r => r.status==='ok' && r.groups.some(g => g.k >= 3)), g = r.groups.find(g => g.k >= 3);
    const st = g.steps.map(s => ({...s})).reverse(); g.steps = st.map((s, j) => ({...s, step: j + 1, k: j + 1, members: g.steps[j].members}));`);
  expect(nc1.failed).toBeGreaterThan(0); expect(nc1.keys).toHaveLength(1);
  // NC2 swap two subgroups' names in the R reference.
  const nc2 = await planted(page, `const r = ev.reference.find(r => r.status==='ok' && r.groups.length >= 2 && r.groups[0].k !== r.groups[1].k);
    const a = r.groups[0].name; r.groups[0].name = r.groups[1].name; r.groups[1].name = a;`);
  expect(nc2.failed).toBeGreaterThan(0); expect(nc2.quantities.group_k).toBeGreaterThan(0);
  // NC3 drop one study from one corpus configuration (the R reference still contains it).
  const nc3 = await planted(page, `const c = ev.corpus.find(c => c.k >= 6 && c.group.every(g => g)); const j = 2;
    for (const f of ['label','te','se','year','group']) c[f].splice(j, 1); c.k -= 1;`);
  expect(nc3.failed).toBeGreaterThan(0); expect(nc3.keys).toHaveLength(1);
  // NC4 shuffle the year order: swap two distinct years inside one fully-dated subgroup of a year-ordered configuration.
  const nc4 = await planted(page, `for (const c of ev.corpus) { if (!c.key.includes('::year=')) continue;
      const by = {}; c.group.forEach((g, i) => (by[g] = by[g] || []).push(i));
      for (const ix of Object.values(by)) { if (ix.some(i => c.year[i] == null)) continue;
        const a = ix.find(i => ix.some(m => c.year[m] !== c.year[i])); if (a === undefined) continue;
        const b = ix.find(m => c.year[m] !== c.year[a]); const t = c.year[a]; c.year[a] = c.year[b]; c.year[b] = t; return; } }
    throw Error('no candidate');`);
  expect(nc4.failed).toBeGreaterThan(0); expect(nc4.keys).toHaveLength(1); expect(nc4.quantities.members).toBeGreaterThan(0);
  // NC5 engine defect of the kind meta::metacum shows for a subgrouped object: every subgroup gets the POOLED path.
  const nc5 = await planted(page, '', `const page = deps.cumulative, parse = deps.parse; let all = null;
    deps.parse = t => { const p = parse(t); all = p.studies; return p; };
    deps.cumulative = rows => { const c = page(all); return { sorted: c.sorted.slice(0, rows.length), series: c.series.slice(0, rows.length) }; };`);
  expect(nc5.failed).toBeGreaterThan(1000);
  // NC6 the declared conditional rule is load-bearing and limited: without the adjudication list exactly the
  // 34 residual-Q comparisons fail, nothing else.
  const nc6 = await planted(page, `ev.adjudicated = [];`);
  expect(nc6.failed).toBe(34); expect(Object.keys(nc6.quantities)).toEqual(['Q']);
  // NC7 the conditional reference is used only at the page's exact tau2: move one tau2_app by one ulp.
  const nc7 = await planted(page, `const a = ev.adjudicated[0]; a.tau2_app = a.tau2_app * (1 + 2 ** -52);`);
  expect(nc7.failed).toBe(1); expect(nc7.quantities).toEqual({ Q: 1 });
  // NC8 tolerance brackets: tau2 moved by 2e-6 relative fails; mu moved by 2e-9 fails; mu moved by 5e-10 passes.
  // The perturbation is applied to the PAGE value for that pool, so the bracket does not depend on the existing agreement.
  const pick = `const r = ev.reference.find(r => r.status==='ok' && r.groups.some(g => g.k >= 4)), G = r.groups.find(g => g.k >= 4), s = G.steps[3];
    const c = ev.corpus.find(x => x.key === r.key), app = A.compute(__almParseStudies(A.csvOf(c)).studies, __almCumulative).groups.find(g => g.name === G.name).series[3];`;
  const nc8a = await planted(page, pick + `s.tau2 = s.tau2 + 2e-6 * Math.max(1, Math.abs(s.tau2));`);
  expect(nc8a.quantities.tau2).toBe(1);
  const nc8b = await planted(page, pick + `s.mu = app.mu + 2e-9 * Math.max(1, Math.abs(app.mu));`);
  expect(nc8b.failed).toBe(1); expect(nc8b.quantities).toEqual({ mu: 1 });
  const nc8c = await planted(page, pick + `s.mu = app.mu + 5e-10 * Math.max(1, Math.abs(app.mu));`);
  expect(nc8c.failed).toBe(0);
  // NC9 a refused configuration that the page would analyse must fail (give one refused corpus row a group).
  const nc9 = await planted(page, `const c = ev.corpus.find(c => c.group.every(g => !g)); c.group[0] = 'G';`);
  expect(nc9.quantities.refused).toBe(1);
  console.log('SUBCUM NEGATIVE CONTROLS', JSON.stringify({ nc1: nc1.failed, nc2: nc2.failed, nc3: nc3.failed, nc4: nc4.failed, nc5: nc5.failed, nc6: nc6.failed, nc7: nc7.failed, nc8a: nc8a.failed, nc8b: nc8b.failed, nc8c: nc8c.failed, nc9: nc9.failed }));
});

// ---- rendered plot ----
const MANY = Array.from({ length: 30 }, (_, i) => `S${i + 1}, ${(0.05 * (i % 7) - 0.1).toFixed(2)}, 0.${10 + (i % 9)}, ${2000 + (i % 11)}, G${String(Math.floor(i / 1)).padStart(2, '0')}`).join('\n');
const BIG = Array.from({ length: 64 }, (_, i) => `S${i + 1}, ${(Math.sin(i) * 0.3).toFixed(3)}, 0.${12 + (i % 7)}, ${1990 + i}, ${i % 2 ? 'A rather long subgroup label that will not fit in one panel title' : 'B'}`).join('\n');
async function setData(page, text, mode) {
  await page.locator('#f-data').fill(text); await page.locator('#f-data').dispatchEvent('input');
  if (mode) await page.selectOption('#subcum-mode', mode);
  await page.waitForFunction(t => window.__almSubCumLast && window.__almSubCumLast.k === __almParseStudies(t).studies.length, text);
  await page.waitForFunction(m => { const s = document.querySelector('#subcum-svg svg'); return s && (s.dataset.subcumMode === m || s.dataset.subcumRefusal); }, mode || 'multiples');
}
// Every check is read off the rendered SVG in screen space.
const audit = () => {
  const svg = document.querySelector('#subcum-svg svg'), res = window.__almSubCumLast;
  const attrs = [...svg.querySelectorAll('*')].flatMap(e => [...e.attributes].map(a => a.value));
  const texts = [...svg.querySelectorAll('text')].filter(t => t.textContent.trim());
  const boxes = texts.map(t => { const b = t.getBoundingClientRect(); return { t: t.textContent, x0: b.left, x1: b.right, y0: b.top, y1: b.bottom, h: b.height }; });
  const overlaps = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.5 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.5) overlaps.push([a.t, b.t]);
  }
  const panels = [...svg.querySelectorAll('[data-subcum-panel]')].map(g => ({ group: g.dataset.group, k: Number(g.dataset.k), circles: g.querySelectorAll('circle').length,
    title: (g.querySelector('[data-role=panel-title]') || {}).textContent, fullTitle: g.querySelector('title').textContent }));
  const sb = svg.getBoundingClientRect(), outside = boxes.filter(b => b.x0 < sb.left - 0.5 || b.x1 > sb.right + 0.5 || b.y0 < sb.top - 0.5 || b.y1 > sb.bottom + 0.5).map(b => b.t);
  return { mode: svg.dataset.subcumMode || null, refusal: svg.dataset.subcumRefusal || null, nonFinite: attrs.filter(v => /NaN|Infinity|undefined/.test(v)).length,
    overlaps, outside, minTextPx: Math.min(...boxes.map(b => b.h)), panels, groups: res.groups.map(g => [g.name, g.k]), note: (svg.querySelector('[data-subcum-note]') || {}).textContent || null,
    refusalText: svg.dataset.subcumRefusal ? svg.textContent : null };
};

test('rendered within-subgroup plot: no NaN, no empty panel, no overlapping or clipped labels', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 900 });
  await open(page);
  // Built-in example (2 subgroups), both layouts.
  for (const mode of ['multiples', 'overlay']) {
    await page.selectOption('#subcum-mode', mode);
    await page.waitForFunction(m => document.querySelector('#subcum-svg svg').dataset.subcumMode === m, mode);
    const a = await page.evaluate(audit);
    expect(a.mode).toBe(mode); expect(a.nonFinite).toBe(0); expect(a.overlaps).toEqual([]); expect(a.outside).toEqual([]);
    expect(a.minTextPx).toBeGreaterThanOrEqual(9);
    expect(a.panels.map(p => [p.group, p.k])).toEqual(a.groups);
    for (const p of a.panels) { expect(p.k).toBeGreaterThan(0); expect(p.circles).toBe(p.k); }
    await page.locator('#alm-subcum').screenshot({ path: `test-results/subcum-example-${mode}.png` });
  }
  // 30 subgroups: small multiples cap at 24 panels with a visible note; overlay refuses with a message (never a blank plot).
  await setData(page, MANY, 'multiples');
  let a = await page.evaluate(audit);
  expect(a.panels).toHaveLength(24); expect(a.note).toContain('24 of 30'); expect(a.overlaps).toEqual([]); expect(a.nonFinite).toBe(0);
  for (const p of a.panels) expect(p.circles).toBe(p.k);
  await setData(page, MANY, 'overlay');
  a = await page.evaluate(audit);
  expect(a.refusal).toBe('1'); expect(a.refusalText).toContain('up to 8 subgroups');
  // k = 32 per subgroup and a long name: ticks thinned, long title truncated with the full name kept in <title>.
  await setData(page, BIG, 'multiples');
  a = await page.evaluate(audit);
  expect(a.overlaps).toEqual([]); expect(a.outside).toEqual([]); expect(a.nonFinite).toBe(0);
  const long = a.panels.find(p => p.group.startsWith('A rather'));
  expect(long.title.endsWith('…')).toBe(true); expect(long.fullTitle).toBe('A rather long subgroup label that will not fit in one panel title (k=32)');
  for (const p of a.panels) expect(p.circles).toBe(32);
  await page.locator('#alm-subcum').screenshot({ path: 'test-results/subcum-k32.png' });
  await setData(page, BIG, 'overlay');
  a = await page.evaluate(audit);
  expect(a.overlaps).toEqual([]); expect(a.outside).toEqual([]); expect(a.nonFinite).toBe(0);
  // No group column: an explicit refusal, not an empty panel.
  await setData(page, 'A, 0.1, 0.1, 2001\nB, 0.2, 0.1, 2002\nC, 0.3, 0.2, 2003', 'multiples');
  a = await page.evaluate(audit);
  expect(a.refusal).toBe('1'); expect(a.refusalText).toContain('need a group column');
});

// ---- export round trip ----
const TRICKY = ['A, 0.10, 0.10, 2001, "Comma, inside"', 'B, 0.30, 0.20, 2002, "Comma, inside"', 'C, 0.20, 0.15, 2003, =SUM(1)', 'D, -0.1, 0.12, 2000, =SUM(1)',
  'E, 0.05, 0.11, 2004, "He said ""hi"""', 'F, 0.4, 0.3, , "He said ""hi"""', 'G, 0.12, 0.09, 2005, '].join('\n');
test('JSON and CSV exports round-trip the engine output exactly', async ({ page }) => {
  await open(page);
  await setData(page, TRICKY, 'multiples');
  const engine = await page.evaluate(() => AlmSubgroupCumulative.toJson(window.__almSubCumLast));
  expect(engine.groups.map(g => g.name)).toEqual(['(ungrouped)', '=SUM(1)', 'Comma, inside', 'He said "hi"']);   // UTF-16 order, as the page sorts
  const read = async (sel) => { const [d] = await Promise.all([page.waitForEvent('download'), page.click(sel)]); return { name: d.suggestedFilename(), text: readFileSync(await d.path(), 'utf8') }; };
  const j = await read('#subcum-json');
  expect(j.name).toBe('within-subgroup-cumulative.json');
  expect(JSON.parse(j.text)).toEqual(engine);
  const c = await read('#subcum-csv');
  expect(c.name).toBe('within-subgroup-cumulative.csv');
  expect(c.text).toContain("\"'=SUM(1)\"");            // formula-injection guard is applied in the file
  const rows = await page.evaluate(t => AlmSubgroupCumulative.parseCsv(t), c.text);
  const flat = engine.groups.flatMap(g => g.series.map(s => ({ group: g.name, group_k: g.k, by_year: g.by_year, step: s.step, row: s.row, label: s.label, year: s.year, k: s.k,
    mu: s.mu, se: s.se, lo: s.lo, hi: s.hi, tau2: s.tau2, Q: s.Q, pi_lo: s.pi_lo, pi_hi: s.pi_hi })));
  expect(rows).toEqual(flat);                         // toEqual uses Object.is per number: bit-exact
  // by_year is false only for the subgroup holding the study with no year.
  expect(engine.groups.find(g => g.name === 'He said "hi"').by_year).toBe(false);
  expect(engine.groups.find(g => g.name === 'Comma, inside').by_year).toBe(true);
  const s = await read('#subcum-svgdl');
  expect(s.text.startsWith('<svg')).toBe(true); expect(s.text).not.toMatch(/NaN|Infinity/);
});

test('the existing pinned contract and template are untouched by the new tier', async ({ page }) => {
  await open(page);
  const pins = await page.evaluate(() => AlmCumSubValidationAdapter && AlmCumSubValidationAdapter.corpus ? AlmCumSubValidationAdapter.corpus.files.map(f => f.sha256) : null);
  expect(pins).toEqual(['dac5806f456eb35518124d44b74e721f21c353abdb21287db533bc8f36616ea2', 'a0721e62d0b8862b9d68bbea3dba668060786810442b2ef2c124bdb55b91a8e5']);
  // The new section is a body-level region, not inside any template root the existing page-text contract reads.
  const where = await page.evaluate(() => { const s = document.getElementById('alm-subcum'); return { parent: s.parentElement.tagName, inRoot: !!s.closest('main,header,footer,nav') }; });
  expect(where).toEqual({ parent: 'BODY', inRoot: false });
});
