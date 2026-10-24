// In-process regression checks for sandboxes that cannot spawn browser/test workers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = new URL('../../../../../../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const html = read('nma/index.html');
const parser = html.slice(html.indexOf('    function parseContrasts('), html.indexOf('    function uniqueTreatments('));
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
      var rows = parseContrasts(text).rows;
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
  vm.runInContext(html.slice(html.indexOf('    window.__almNmaCompute ='), html.indexOf('    const loaded = loadSaved();')), context);
  const adapter = read('nma/validate/adapter.js');
  vm.runInContext(adapter.slice(0, adapter.indexOf("const host = document.getElementById('alm-validate');")) + '\n})();', context);
  fields['f-data'].value = data;
  return env;
}
const liveRows = 'One,A,B,0.2,0.12\nTwo,B,C,0.15,0.13\nThree,A,C,0.65,0.14';
const plain = value => JSON.parse(JSON.stringify(value));

export const checks = [
  ...[
    ['extra-column', 'study,t1,t2,logOR,SE,Weight\n' + liveRows.split('\n').map(r => r + ',10%').join('\n')],
    ['logOR-header', 'study,t1,t2,logOR,SE\n' + liveRows],
    ['parseFloat', liveRows.replace('0.2,0.12', '0x10,0.12')]
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
    assert.throws(() => spec.verify.adapter().live.currentState(), /invalid contrast/);
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
  ...['S,A,B,0.2,0.1,10%', 'S,A,B,0.2,0.1,', 'study,t1,t2,logOR,SE\nS,A,B,0.2,0.1', 'S,A,B,0x10,0.1'].map(data =>
    ['P2-3 exact parser input: ' + data.replaceAll('\n', ' / '), () => {
      const { spec, context } = setup(); const state = spec.share.get();
      spec.share.set({ ...state, data }); assert.equal(context.lastComputed, data);
    }]),
  ['P2-3 share get refuses unusable data', () => {
    const { spec, fields } = setup(); fields['f-data'].value = 'not an analysis';
    assert.throws(() => spec.share.get(), /No valid contrasts/);
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let passed = 0;
  for (const [name, run] of checks) {
    try { run(); passed++; console.log('PASS ' + name); }
    catch (e) { console.log('FAIL ' + name + ': ' + e.message); }
  }
  console.log(`REVIEWCHECK ${passed}/${checks.length}`);
  if (passed !== checks.length) process.exitCode = 1;
}
