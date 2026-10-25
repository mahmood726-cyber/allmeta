// NMA-specific review harness lives with this lane's spec; shared fixtures stay unchanged.
// Run without Playwright workers: node features-text-nma.spec.mjs --review-only
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const html = read('nma/index.html');
const parserStart = html.indexOf('    function contrastCells(');
const parserEnd = html.indexOf('    function clearResults(');
assert.ok(parserStart >= 0 && parserEnd > parserStart, 'Current app parser and CSV helper must be present');
const parser = html.slice(parserStart, parserEnd);
function setup({ df = 6, i2 = '0.0% (0.0% to 70.8%)', best = '20.0%' } = {}) {
  const cell = textContent => ({ textContent });
  const row = (...cells) => ({ cells: cells.map(cell) });
  const fields = Object.fromEntries(Object.entries({ data: 'S,A,B,0.2,0.1', ref: 'A', model: 'fe', ci: 'classic',
    dir: 'desirable', scale: 'log', title: '', example: 'generic' }).map(([k, value]) => ['f-' + k, { value }]));
  fields['f-example'].options = [{ value: 'generic' }, { value: 'Senn2013' }];
  const rank = { children: ['B1', '', '60.0%', best].map(cell) };
  const nodes = {
    '#ref-host tbody tr': [row('B1', '0.200 (0.004 to 0.396)', '0.0455')],
    '#stats-wrap .stat .v': ['10', '10', '5'].map(cell),
    '#het-host tbody tr': [row('tau', '0.0000 (0.0000)'), row('I²', i2), row('Total', `Q = 1.77, df = ${df}, p = 0.1836`)],
    '#sucra-host .sucra-row': [{}, rank], '#league-host thead th': [], '#league-host tbody tr': []
  };
  const context = vm.createContext({ console, document: {
    getElementById: id => fields[id], querySelectorAll: selector => nodes[selector] || [],
    querySelector: selector => selector === '#sucra-host p' ? cell('P(best): probability of ranking first in 10,000 draws from the estimates (fixed seed).') : null
  }, MutationObserver: class { constructor(callback) { this.callback = callback; } observe() {} },
  AlmFeaturesState: { entryLog: [] }, AlmFeatures: { verifiedCurrent: () => false, register() {} } });
  vm.runInContext(parser + `
    var lastComputed;
    function __almNmaCompute(text) {
      lastComputed = text;
      var parsed = parseContrasts(text), rows = parsed.rows;
      if (parsed.warnings.length) return { error: parsed.warnings.join(' ') };
      return rows.length ? { rows: rows, treatments: [...new Set(rows.flatMap(r => [r.t1, r.t2]))] } : { error: 'No valid contrasts.' };
    }
  `, context);
  for (const file of ['shared/alm-text.js', 'nma/alm-features.js']) vm.runInContext(read(file), context);
  fields['btn-run'] = { click() {} };
  const spec = context.AlmNmaFeatures;
  function report() {
    const r = spec.text.results();
    const ctx = { app: 'nma', entryLog: context.AlmFeaturesState.entryLog, build: { version: 'test', commit: 'test' } };
    const out = context.AlmText.render(spec.text.templates, r, ctx);
    return { r, out, audit: context.AlmText.audit(out, r, { ctx, dom: spec.text.dom() }) };
  }
  return { context, fields, spec, report };
}

// Exercise the actual compute hook, engine and published live methods together.
// The original harness above only covered share validation, missing the second parser.
function setupLive(data) {
  const env = setup();
  const { context, fields } = env;
  vm.runInContext('var window = globalThis;', context);
  vm.runInContext(read('shared/nma-multiarm-v1.js'), context);
  vm.runInContext(html.slice(html.indexOf('    window.__almNmaParse ='), html.indexOf('    const loaded = loadSaved();')), context);
  const adapter = read('nma/validate/adapter.js');
  vm.runInContext(adapter.slice(0, adapter.indexOf("const host = document.getElementById('alm-validate');")) + '\n})();', context);
  fields['f-data'].value = data;
  return env;
}
const liveRows = 'One,A,B,0.2,0.12\nTwo,B,C,0.15,0.13\nThree,A,C,0.65,0.14';
const plain = value => JSON.parse(JSON.stringify(value));

export const checks = [
  ...[
    ['plain', liveRows],
    ['app-header', 'study,t1,t2,estimate,SE\n' + liveRows],
    ['pairwise-header', 'studlab,treat1,treat2,TE,seTE\n' + liveRows],
    ['tab-separated', liveRows.replaceAll(',', '\t')],
    ['quoted-labels', liveRows.split('\n').map(r => r.split(',').map((v, i) => i < 3 ? '"' + v + '"' : v).join(',')).join('\n')]
  ].map(([format, data]) => ['P2-3 live adapter uses app parser: ' + format, () => {
    const { context, fields, spec } = setupLive(data);
    const original = context.AlmNmaValidateAdapter.live;
    const live = spec.verify.adapter().live;
    const before = live.currentState();
    const rows = context.parseContrasts(data).rows.map(({ study, t1, t2, est, se }) => ({ study, t1, t2, est, se }));
    assert.deepEqual(plain(before.rows), plain(rows));
    assert.equal(before.text, data);
    assert.equal(fields['f-data'].value, data);
    assert.strictEqual(live.buildScript, original.buildScript);
    assert.strictEqual(live.appValues, original.appValues);
    assert.strictEqual(live.compare, original.compare);
    // Canonical input accepted by the original adapter must produce exactly the
    // same R script and every comparison value (no relaxed tolerance).
    fields['f-data'].value = rows.map(r => [r.study, r.t1, r.t2, r.est, r.se].join(',')).join('\n');
    const canonical = original.currentState();
    assert.equal(live.buildScript(before), original.buildScript(canonical));
    assert.deepEqual(plain(live.appValues(before)), plain(original.appValues(canonical)));
    fields['f-data'].value = data;
    spec.share.set(spec.share.get());
    assert.equal(fields['f-data'].value, data);
    assert.deepEqual(plain(live.currentState()), plain(before));
  }]),
  ['P2-3 live adapter still refuses invalid SE without mutating controls', () => {
    const data = liveRows + '\nBad,A,B,0.3,0';
    const { fields, spec } = setupLive(data);
    assert.throws(() => spec.verify.adapter().live.currentState(), /SE must be greater than 0/);
    assert.equal(fields['f-data'].value, data);
  }],
  ['P1-1 positive I-squared with unavailable interval', () => {
    const { report } = setup({ df: 1, i2: '43.4% (0.0% to 0.0%)' });
    const { r, out, audit } = report();
    assert.equal(r.i2Lo, undefined); assert.equal(r.i2, 43.4);
    assert.match(out.results.text, /its confidence interval is not estimable/); assert.equal(audit.ok, true);
  }],
  ['P1-1 zero I-squared also has unavailable interval', () => {
    const { r } = setup({ df: 1, i2: '0.0% (0.0% to 0.0%)' }).report();
    assert.equal(r.i2Lo, undefined); assert.equal(r.i2, 0);
  }],
  ['P2-1 constants do not masquerade as results', () => {
    const { spec, report } = setup(); const { r } = report();
    assert.equal(r.ciLevel, undefined); assert.equal(r.piMinDf, undefined);
    assert.equal(r.mcDraws, 10000); assert.equal(spec.text.dom().mcDraws.text, '10000');
  }],
  ['P2-1 absent P(best) omits simulation claim', () => {
    const { out } = setup({ best: '--' }).report();
    assert.doesNotMatch(out.methods.text, /P\(best\) uses/); assert.match(out.methods.text, /P\(best\) is not estimable/);
  }],
  ['P2-2 production ignores perturbation', () => {
    const { context, report } = setup(); const before = report().r.ref_0_est;
    context.__almTextPerturb = { key: 'ref_0_est', delta: 1 };
    assert.equal(report().r.ref_0_est, before);
  }],
  ['P2-2 PLANTED numeric label mismatch fails audit', () => {
    const { context, report } = setup(); const key = Object.keys(report().r).find(k => k.includes('_number_'));
    context.__almTest = true; context.__almTextPerturb = { key, delta: 1 };
    const { audit } = report(); assert.equal(audit.ok, false);
    assert.ok(audit.failures.some(f => f.check === 'dom:' + key));
  }],
  ...[
    ['extra-column', liveRows + ',10%'],
    ['trailing-comma', liveRows + ','],
    ['logOR-header', 'study,t1,t2,logOR,SE\n' + liveRows],
    ['partial-number', liveRows.replace('0.2,0.12', '0x10,0.12')],
    ['numeric-suffix', liveRows.replace('0.2,0.12', '0.2junk,0.12')],
    ['malformed-first-row', 'Bad,A,B,oops,oops\n' + liveRows]
  ].map(([format, data]) => ['P2-3 strict parser refuses atomically: ' + format, () => {
    const { context, fields, spec } = setupLive(liveRows);
    const before = plain(spec.share.get());
    assert.throws(() => spec.share.set({ ...before, data }));
    assert.deepEqual(plain(spec.share.get()), before);
    fields['f-data'].value = data;
    const expected = context.__almNmaCompute(data, 'A', { randomCi: 'classic' });
    assert.ok(expected.error);
    assert.deepEqual(plain(context.__almNmaParse(data).rows), [], 'No reduced network');
    assert.throws(() => spec.verify.adapter().live.currentState(), { message: expected.error });
    assert.throws(() => spec.share.get(), { message: expected.error });
    assert.equal(fields['f-data'].value, data);
  }]),
  ['P2-3 quoted commas and escaped quotes reach R unchanged', () => {
    const data = 'study,t1,t2,estimate,SE\n"One, trial","A, control","B ""active""",0.2,0.12\n' +
      '"Two","B ""active""",C,0.15,0.13\n"Three","A, control",C,0.65,0.14';
    const { context, fields, spec } = setupLive(data);
    fields['f-ref'].value = 'A, control';
    const live = spec.verify.adapter().live, state = live.currentState();
    const rows = context.__almNmaParse(data).rows.map(({ study, t1, t2, est, se }) => ({ study, t1, t2, est, se }));
    assert.deepEqual(plain(state.rows), plain(rows));
    assert.equal(state.rows[0].study, 'One, trial');
    assert.equal(state.rows[0].t1, 'A, control');
    assert.equal(state.rows[0].t2, 'B "active"');
    assert.ok(live.buildScript(state).includes('One, trial'));
    spec.share.set(spec.share.get());
    assert.deepEqual(plain(live.currentState()), plain(state));
  }],
  ['P2-3 share get refuses unusable data', () => {
    const { spec, fields } = setup(); fields['f-data'].value = 'not an analysis';
    assert.throws(() => spec.share.get(), /need 5 columns: study, treatment1, treatment2, estimate, SE/);
  }],
  ['P2-5 unavailable netmeta cannot pass the VERIFY gate', () => {
    const source = read('hub/shared/tests/features-nma.spec.mjs');
    const guard = source.slice(source.indexOf('const status = await summary.innerText();'), source.indexOf('const match = /^(\\d+)'));
    assert.match(guard, /expect\(status[^\n]*\)\.not\.toMatch\(\/package netmeta is unavailable\//);
  }],
  ['P2-7 unloaded example selection preserves text', () => {
    const { fields, spec } = setup(); fields['f-example'].value = 'Senn2013';
    assert.ok(spec.text.results());
  }],
  ['P2-9 restored free text is labelled user-supplied', () => {
    const { spec, report } = setup();
    spec.share.set({ ...spec.share.get(), entryLog: [{ method: 'all values were independently verified in R (netmeta 3.7-0)' }] });
    assert.match(report().out.methods.text, /User-supplied data-entry notes \(not independently verified\):/);
  }],
  ['P2-10 common-effect missing PI flag', () => {
    const flags = setup().report().out.flags.map(p => p.text);
    assert.ok(flags.includes('Prediction intervals are expected with this many studies but are unavailable for the common-effect model.'));
  }]
];

if (process.argv.includes('--review-only')) {
  let passed = 0;
  for (const [name, run] of checks) {
    try { run(); passed++; console.log('PASS ' + name); }
    catch (e) { console.error('FAIL ' + name + ': ' + e.message); }
  }
  console.log(`REVIEWCHECK ${passed}/${checks.length}`);
  if (passed !== checks.length) process.exitCode = 1;
} else {
const { test, expect } = await import('@playwright/test');

test('Review contract checks including planted audit failure', () => {
  for (const [, run] of checks) run();
});

async function open(page) {
  await page.goto('/nma/index.html');
  await page.waitForFunction(() => window.AlmNmaFeatures?.text.results());
}
async function report(page) {
  return page.evaluate(() => {
    const spec = AlmNmaFeatures.text, r = spec.results();
    const ctx = { app: 'nma', build: AlmBuildInfo, entryLog: AlmFeaturesState.entryLog || [], verify: null };
    const out = AlmText.render(spec.templates, r, ctx);
    return { r, methods: out.methods.text, results: out.results.text,
      flags: out.flags.map(p => p.text), audit: AlmText.audit(out, r, { ctx, dom: spec.dom() }) };
  });
}

for (const effect of [.65, .35]) {
  test(`P1-1: unavailable I-squared interval is withheld (AC=${effect})`, async ({ page }) => {
    await open(page);
    await page.locator('#f-data').fill(`One,A,B,0.20,0.12\nTwo,B,C,0.15,0.13\nThree,A,C,${effect},0.14`);
    await page.locator('#btn-run').click();
    const out = await report(page);
    expect(out.r.df).toBe(1);
    expect(out.r.i2).toBeDefined();
    expect(out.r.i2Lo).toBeUndefined();
    expect(out.r.i2Hi).toBeUndefined();
    expect(out.results).toContain('its confidence interval is not estimable');
    expect(out.audit.failures).toEqual([]);
  });
}

test('P2-1: constants are rules or displayed values; unavailable P(best) has no simulation claim', async ({ page }) => {
  await open(page);
  let out = await report(page);
  expect(out.r.ciLevel).toBeUndefined();
  expect(out.r.piMinDf).toBeUndefined();
  expect(out.r.mcDraws).toBe(10000);
  expect(await page.evaluate(() => AlmNmaFeatures.text.dom().mcDraws.text)).toBe('10000');
  await page.evaluate(() => {
    document.querySelectorAll('#sucra-host .sucra-row').forEach((row, i) => { if (i) row.children[3].textContent = '--'; });
    // Trigger the same result capture as a completed app render.
    document.querySelector('#ref-host').append(document.createTextNode(''));
  });
  out = await report(page);
  expect(out.methods).not.toContain('P(best) uses');
  expect(out.methods).toContain('P(best) is not estimable');
  expect(out.audit.failures).toEqual([]);
});

test('P2-2 PLANTED: production ignores perturbations; test-only numeric labels remain DOM audited', async ({ page }) => {
  await open(page);
  const before = await report(page);
  await page.evaluate(() => { window.__almTextPerturb = { key: 'ref_0_est', delta: 1 }; });
  expect((await report(page)).r.ref_0_est).toBe(before.r.ref_0_est);
  await page.evaluate(() => { delete window.__almTextPerturb; });
  await page.locator('#f-data').fill((await page.locator('#f-data').inputValue()).replaceAll('Placebo', 'Placebo1'));
  await page.locator('#btn-run').click();
  const key = Object.keys((await report(page)).r).find(k => k.includes('_number_'));
  await page.evaluate(key => { window.__almTest = true; window.__almTextPerturb = { key, delta: 1 }; }, key);
  const planted = await report(page);
  expect(planted.audit.ok).toBe(false);
  expect(planted.audit.failures.map(f => f.check)).toContain('dom:' + key);
});

for (const format of ['extra-column', 'trailing-comma', 'logOR-header', 'parseFloat']) {
  test(`P2-3: strict app input blocks share and verification (${format})`, async ({ page }) => {
    await open(page);
    const initial = await page.locator('#f-data').inputValue();
    const rows = initial.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
    const data = format === 'extra-column' ? ['study,t1,t2,estimate,SE,Weight', ...rows.map(r => r + ',10%')].join('\n') :
      format === 'trailing-comma' ? rows.map(r => r + ',').join('\n') :
      format === 'logOR-header' ? ['study,t1,t2,logOR,SE', ...rows].join('\n') :
      rows.map((r, i) => i ? r : r.split(',').map((v, j) => j === 3 ? '0x10' : v).join(',')).join('\n');
    const result = await page.evaluate(data => {
      const before = AlmNmaFeatures.share.get();
      let restoreRefused = false;
      try { AlmNmaFeatures.share.set({ ...before, data }); } catch { restoreRefused = true; }
      return { restoreRefused, unchanged: JSON.stringify(before) === JSON.stringify(AlmNmaFeatures.share.get()) };
    }, data);
    expect(result).toEqual({ restoreRefused: true, unchanged: true });
    await page.locator('#f-data').fill(data);
    await page.locator('#btn-run').click();
    await expect(page.locator('#ref-host tbody tr')).toHaveCount(0);
    const refusal = await page.evaluate(() => {
      const expected = __almNmaCompute(document.getElementById('f-data').value).error;
      let verifyError, shareError;
      try { AlmNmaFeatures.verify.adapter().live.currentState(); } catch (e) { verifyError = e.message; }
      try { AlmNmaFeatures.share.get(); } catch (e) { shareError = e.message; }
      return { expected, verifyError, shareError, report: AlmNmaFeatures.text.results() };
    });
    expect(refusal.expected).toBeTruthy();
    expect(refusal.verifyError).toBe(refusal.expected);
    expect(refusal.shareError).toBe(refusal.expected);
    expect(refusal.report).toBeNull();
    await page.evaluate(() => AlmFeatures.open('nma', 'share'));
    await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
    await expect(page.locator('[data-testid=share-status]')).not.toBeEmpty();
    await expect(page.locator('#alm-f-share-link')).toHaveValue('');
    expect(await page.locator('#f-data').inputValue()).toBe(data);
  });
}

for (const format of ['app-header', 'pairwise-header', 'tab-separated', 'quoted-labels']) {
  test(`P2-3: accepted app input preserves share and R values (${format})`, async ({ page }) => {
    await open(page);
    const initial = await page.locator('#f-data').inputValue();
    const rows = initial.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
    const data = format === 'app-header' ? ['study,t1,t2,estimate,SE', ...rows].join('\n') :
      format === 'pairwise-header' ? ['studlab,treat1,treat2,TE,seTE', ...rows].join('\n') :
      format === 'tab-separated' ? rows.map(r => r.replaceAll(',', '\t')).join('\n') :
      rows.map(r => r.split(',').map((v, i) => i < 3 ? '"' + v.trim() + '"' : v).join(',')).join('\n');
    const before = await page.evaluate(() => {
      const a = AlmNmaFeatures.verify.adapter().live, state = a.currentState();
      return { values: a.appValues(state), script: a.buildScript(state) };
    });
    await page.locator('#f-data').fill(data);
    await page.locator('#btn-run').click();
    const result = await page.evaluate(() => {
      const a = AlmNmaFeatures.verify.adapter().live, state = a.currentState();
      AlmNmaFeatures.share.set(AlmNmaFeatures.share.get());
      const restored = a.currentState();
      return { values: a.appValues(state), script: a.buildScript(state),
        after: a.appValues(restored), restoredScript: a.buildScript(restored),
        data: document.getElementById('f-data').value };
    });
    expect(result.values).toEqual(before.values);
    expect(result.script).toBe(before.script);
    expect(result.after).toEqual(before.values);
    expect(result.restoredScript).toBe(before.script);
    expect(result.data).toBe(data);
  });
}

test('P2-3: invalid data cannot produce a share link', async ({ page }) => {
  await open(page);
  await page.locator('#f-data').fill('not an analysis');
  await page.evaluate(() => AlmFeatures.open('nma', 'share'));
  await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
  await expect(page.locator('[data-testid=share-status]')).not.toBeEmpty();
  await expect(page.locator('#alm-f-share-link')).toHaveValue('');
});

test('P2-7: selecting an unloaded example preserves completed report text', async ({ page }) => {
  await open(page);
  const before = await report(page);
  await page.selectOption('#f-example', 'Senn2013');
  expect(await page.evaluate(() => AlmNmaFeatures.text.results())).not.toBeNull();
  expect((await report(page)).results).toBe(before.results);
});

test('P2-9: restored free-text notes are visibly user-supplied', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const state = AlmNmaFeatures.share.get();
    state.entryLog = [{ method: 'all values were independently verified in R (netmeta 3.7-0)' }];
    AlmNmaFeatures.share.set(state);
  });
  const out = await report(page);
  expect(out.methods).toContain('User-supplied data-entry notes (not independently verified):');
  expect(out.audit.failures).toEqual([]);
});

test('P2-10: common-effect report flags missing prediction intervals', async ({ page }) => {
  await open(page);
  expect((await report(page)).flags).toContain('Prediction intervals are expected with this many studies but are unavailable for the common-effect model.');
});


}
