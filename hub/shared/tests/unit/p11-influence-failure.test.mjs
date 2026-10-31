import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('influence/index.html');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const FOUR = '0.25, 0.08, A\n0.18, 0.10, B\n0.40, 0.15, C\n0.30, 0.09, D';
const THREE = '0.10, 0.10, E\n0.20, 0.12, F\n0.35, 0.09, G';
const UNDERFLOW = '0.10, 1e-200, E\n0.20, 0.12, F\n0.35, 0.09, G';
const OUTPUTS = ['body', 'model-body', 'loo-plot', 'influence-plot', 'baujat-plot', 'radial-plot'];

// Execute the actual page and export adapters with the real numerical modules.
// Only DOM surfaces and optional UI module mounts are doubles; no browser or downloads.
function setup() {
  const events = new Map(), mounts = {};
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, {
    id, value: '', checked: false, disabled: false, hidden: true, innerHTML: '', textContent: '',
    listeners: {},
    matches(selector) { return selector === '#' + id; },
    setAttribute(key, value) { this[key] = value; },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    click() { return this.listeners.click?.call(this, { target: this }); }
  }]));
  const el = id => {
    assert.ok(elements.has(id), 'Known DOM element: ' + id);
    return elements.get(id);
  };
  el('src').value = FOUR;
  const exclusionHeaders = [{ hidden: true }, { hidden: true }];
  const document = {
    getElementById: el,
    querySelector(selector) {
      if (selector === '#model-summary thead th.excl-col') return exclusionHeaders[0];
      if (/^#[\w-]+$/.test(selector)) return elements.get(selector.slice(1)) || null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '#src') return [el('src')];
      if (selector === '#model-summary .excl-col') return exclusionHeaders;
      // Row/plot highlighting does not affect the state/export assertions below.
      return [];
    },
    addEventListener(type, fn) {
      if (!events.has(type)) events.set(type, []);
      events.get(type).push(fn);
    }
  };
  const alm = {};
  for (const name of ['csvUpload', 'axisControls', 'plotExport', 'resultsExport', 'urlState', 'resetUndo', 'tooltips']) {
    alm[name] = options => { mounts[name] = options; };
  }
  alm.urlState.read = () => null;
  const context = vm.createContext({ document, alm });
  context.window = context;
  for (const path of ['shared/ma-core.js', 'shared/diagnostic-plots.js', 'influence/influence-extra.js',
    'influence/r-script.js', 'hub/shared/analysis-lifecycle.js']) {
    vm.runInContext(read(path), context, { filename: path });
  }
  const pageScripts = scripts.filter(s => s.includes('let _lastDiag = null;') || s.includes('window.__almResults = function'));
  assert.equal(pageScripts.length, 2);
  pageScripts.forEach(s => vm.runInContext(s, context, { filename: 'influence/index.html' }));
  const event = type => (events.get(type) || []).forEach(fn => fn({ target: el('src') }));
  return { w: context, el, mounts, exclusionHeaders, event,
    edit(text) { el('src').value = text; event('input'); },
    run() { return el('btn-run').click(); }
  };
}

function assertSuccess(h, k) {
  const { w, el } = h;
  assert.equal(w._almStudies().length, k);
  assert.equal(w._almLastInfluence().k, k);
  assert.equal(w._almLastDiag().length, k);
  assert.ok(Number.isFinite(w._almLastInfluence().mu));
  assert.equal(w.__almResults().k, k);
  assert.equal(w.__almResults().pooled_mu, w._almLastInfluence().mu);
  assert.equal(w.__almInfluenceStudyRows().length, k);
  assert.equal(w.__almInfluenceStudyCsv().trim().split(/\r?\n/).length, k + 1);
  assert.match(w.__almInfluenceRScript(), /library\(metafor\)/);
  for (const name of ['resultsExport', 'plotExport']) {
    assert.equal(h.mounts[name].getReceiptInput().studies.length, k);
  }
  assert.equal(w.__almBaujat.k, k);
  assert.equal(w.__almRadial.k, k);
  OUTPUTS.forEach(id => assert.notEqual(el(id).innerHTML, '', id));
  assert.equal(el('input-error').hidden, true);
  assert.equal(el('analysis-status').hidden, false);
  assert.equal(el('analysis-stale').hidden, true);
}

function assertCleared(h, message) {
  const { w, el } = h;
  assert.equal(w._almLastInfluence(), null, 'A refused run must clear the prior fit');
  assert.equal(w._almLastDiag(), null);
  assert.equal(w._almStudies().length, 0);
  assert.equal(w._almLastExclusion(), null);
  assert.equal(w.__almBaujat, null);
  assert.equal(w.__almRadial, null);
  assert.equal(JSON.stringify(w.__almResults()), '{"_schema":"influence-results-v1","k":0}');
  assert.equal(h.mounts.resultsExport.getResults().k, 0);
  for (const name of ['resultsExport', 'plotExport']) assert.equal(h.mounts[name].getReceiptInput(), null);
  assert.equal(w.__almInfluenceStudyRows().length, 0);
  assert.throws(() => w.__almInfluenceStudyCsv(), /Run the analysis first/);
  assert.throws(() => w.__almInfluenceRScript(), /Run the analysis first/);
  OUTPUTS.forEach(id => assert.equal(el(id).innerHTML, '', id));
  assert.equal(el('excl-sentence').textContent, '');
  assert.equal(el('excl-msg').textContent, '');
  assert.ok(h.exclusionHeaders.every(e => e.hidden));
  assert.equal(el('input-error').hidden, false);
  assert.match(el('input-error').textContent, message);
  assert.equal(el('analysis-status').hidden, true);
  assert.equal(el('analysis-stale').hidden, true);
  h.event('change'); // Blurring the refused input must not advertise stale results.
  assert.equal(el('analysis-stale').hidden, true);
  w.__almInfluenceRedrawLOO();
  el('btn-excl-apply').click();
  OUTPUTS.forEach(id => assert.equal(el(id).innerHTML, '', id + ' stays empty'));
}

test('P11-R1 plant: real REML rejection clears the old fit, exports and plots, then recovers', t => {
  const h = setup();
  assertSuccess(h, 4);
  h.w.__almInfluenceSetExcluded([0]);
  assert.equal(h.w._almLastExclusion().kept.k, 3);
  h.edit(UNDERFLOW);
  const parsed = h.w.__almInfluenceParse(UNDERFLOW);
  assert.equal(parsed.errors.length, 0, 'The input is syntactically valid');
  assert.throws(() => h.w.AlmMaCore.tau2REML(parsed.rows.map(r => r.te), parsed.rows.map(r => r.se * r.se)),
    { name: 'RangeError', message: /strictly positive finite variances/ });
  let escaped;
  try { h.run(); } catch (e) { escaped = e; }
  t.diagnostic(JSON.stringify({ escaped: escaped?.message, inputK: parsed.rows.length,
    storedK: h.w._almStudies().length, exportK: h.w.__almResults().k,
    oldFitPresent: h.w._almLastInfluence() !== null, errorHidden: h.el('input-error').hidden }));
  assertCleared(h, /strictly positive finite variances/);
  assert.equal(escaped, undefined, 'The page must display a numerical rejection without throwing');
  h.edit(THREE);
  assert.equal(h.el('analysis-stale').hidden, false);
  h.run();
  assertSuccess(h, 3);
  assert.equal(h.w._almLastExclusion().excluded.length, 0);
});

for (const stage of ['leave-one-out', 'Baujat']) {
  test(`P11-R1 plant: ${stage} rejection clears partially updated analysis state`, () => {
    const h = setup();
    assertSuccess(h, 4);
    let calls = 0;
    const target = stage === 'leave-one-out' ? h.w.AlmMaCore : h.w.AlmDiagPlots;
    const key = stage === 'leave-one-out' ? 'tau2REML' : 'baujat';
    const original = target[key];
    target[key] = function (...args) {
      calls++;
      if (stage === 'Baujat' || calls === 2) throw new RangeError('Planted numerical rejection: ' + stage);
      return original.apply(this, args);
    };
    h.edit(THREE);
    let escaped;
    try { h.run(); } catch (e) { escaped = e; }
    assert.equal(calls, stage === 'leave-one-out' ? 2 : 1);
    assertCleared(h, /Planted numerical rejection/);
    assert.equal(escaped, undefined);
    target[key] = original;
    h.run();
    assertSuccess(h, 3);
  });
}

test('P11-R1 control: successful rerun replaces studies and exports and clears exclusions', () => {
  const h = setup();
  assertSuccess(h, 4);
  h.w.__almInfluenceSetExcluded([0]);
  h.edit(THREE);
  assert.equal(h.el('analysis-stale').hidden, false);
  h.run();
  assertSuccess(h, 3);
  assert.equal(h.w._almStudies()[0].label, 'E');
  assert.equal(h.w._almLastExclusion().excluded.length, 0);
  h.event('change');
  assert.equal(h.el('analysis-stale').hidden, true);
});

for (const [label, input, message] of [
  ['malformed', THREE + '\nbad, data', /Input refused:.*line 4/],
  ['empty', '', /No studies entered/],
  ['too few studies', '0.1, 0.1, A\n0.2, 0.1, B', /At least 3 studies/]
]) {
  test(`P11-R1 control: ${label} input clears results and permits recovery`, () => {
    const h = setup();
    assertSuccess(h, 4);
    h.edit(input);
    h.run();
    assertCleared(h, message);
    h.edit(THREE);
    h.run();
    assertSuccess(h, 3);
  });
}
