import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root = new URL('../../../../', import.meta.url);
const html = fs.readFileSync(new URL('copas/index.html', root), 'utf8');
const valid = '0.2, 0.1, A\n0.3, 0.2, B\n0.4, 0.3, C';
function harness({ adjusted = NaN, dropped = 0 } = {}) {
  const elements = new Map(), timers = new Map();
  let timerId = 0, calls = 0;
  function el(id) {
    if (!elements.has(id)) elements.set(id, { value: '', innerHTML: '', textContent: '', style: {}, tagName: 'SELECT', listeners: {},
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      dispatchEvent(e) { for (const fn of this.listeners[e.type] || []) fn(e); },
      setAttribute() {}, before() {} });
    return elements.get(id);
  }
  for (const [id, value] of Object.entries({ src: valid, 'opt-ngrid': '10', 'opt-tau': 'REML', 'opt-signrsb': '0.1', 'opt-level': '0.95' })) el(id).value = value;
  const document = { readyState: 'complete', getElementById: id => id === 'share-data-note' ? null : el(id), querySelector: s => el(s.slice(1)), createElement: () => el('created') };
  const context = vm.createContext({ document, console, Event: class { constructor(type) { this.type = type; } },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } });
  context.window = context;
  for (const file of ['shared/copas-core.js', 'shared/canonical-datasets.js', 'shared/hero-examples.js']) vm.runInContext(fs.readFileSync(new URL(file, root), 'utf8'), context);
  context.AlmMaCore = { pool: () => ({ mu: .3, se: .1, tau2: 0 }) };
  context.AlmCopasCore.copas = input => {
    calls++;
    return { ...input, k: input.TE.length, dropped, TE_adjust: adjusted, seTE_adjust: .1, lower_adjust: .1, upper_adjust: .5,
      publprob: [1, .5], TE_slope: [.3, .2], seTE_slope: [.1, .1], lower_slope: [.1, 0], upper_slope: [.5, .4],
      rho_slope: [0, .5], tau_slope: [0, 0], pval_rsb: [.01, .01], N_unpubl: [0, 2], sel_adj: Number.isFinite(adjusted) ? 2 : null,
      n_orthogonal_points: 2, slope: 1 };
  };
  const urlState = Object.assign(() => {}, { read: () => ({}), write: () => true, isSuspended: () => false });
  context.alm = { urlState };
  for (const name of ['csvUpload', 'chartDownload', 'axisControls', 'resultsExport', 'resetUndo', 'tooltips']) context.alm[name] = opts => { context[name + 'Options'] = opts; };
  for (const block of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(block[1], context);
  context.__almCopasProfileMLE = () => ({ TE: .2, seTE: .1, rho: .5, tau: 0 });
  function flush() { let guard = 0; while (timers.size) { assert.ok(++guard < 20); const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); } }
  flush();
  return { context, el, flush, get calls() { return calls; },
    edit(text) { el('src').value = text; el('src').dispatchEvent({ type: 'input' }); },
    run() { el('btn-run').dispatchEvent({ type: 'click' }); flush(); },
    hero() { el('alm-hero-mount').dispatchEvent({ type: 'change', target: { closest: () => ({ value: 'bcg' }) } }); } };
}
test('P0-49: withheld estimate explains residual bias without legacy robustness claim', () => {
  const h = harness();
  assert.doesNotMatch(html, /otherwise, it is robust|&#947; = 0 means no selection/);
  assert.match(h.el('interpretation').textContent, /residual selection bias at every selection level/i);
  assert.match(h.el('interpretation').textContent, /cannot rule out publication bias/i);
});
test('P0-49 control: reported estimate has conditional sensitivity guidance', () => {
  const h = harness({ adjusted: .2 });
  assert.match(h.el('summary').innerHTML, /<strong>0.200<\/strong>/);
  assert.match(h.el('interpretation').textContent, /zero.*publication bias/i);
  assert.doesNotMatch(h.el('interpretation').textContent, /at every selection level/);
});
test('P0-58: BCG loads 13 effect-first rows and immediately clears previous output', () => {
  const h = harness();
  h.hero();
  assert.equal(h.context._almLastCopas(), null);
  assert.equal(h.el('summary').innerHTML, '');
  assert.equal(h.el('body').innerHTML, '');
  assert.equal(h.el('plot').innerHTML, '');
  assert.match(h.el('fit-status').textContent, /13 rows read/);
  h.run();
  assert.equal(h.context._almLastCopas().k, 13);
  assert.equal(h.context._almLastCopas().dropped_rows, 0);
});
test('P0-58 control: input edits invalidate exports, chart redraw and pending refits', () => {
  const h = harness();
  assert.equal(h.context._almLastCopas().k, 3);
  h.el('opt-level').dispatchEvent({ type: 'change' });
  assert.equal(h.context._almLastCopas(), null);
  h.edit('bad row');
  assert.match(h.el('fit-status').textContent, /0 rows read/);
  h.flush();
  assert.equal(h.calls, 1);
  h.context.axisControlsOptions.onChange({ y: [0, 1] });
  assert.equal(h.el('plot').innerHTML, '');
  assert.equal(h.context.chartDownloadOptions.getReceiptInput(), null);
  assert.equal(h.el('interpretation').textContent, '');
});
test('U-COPAS-PARSE: paste refusals are visible and exported along with engine drops', () => {
  const h = harness({ dropped: 2 });
  h.edit(valid + '\n.4oops, .1\n0.5, 0\nonlyone\n, 0.2, 0.3\n\n');
  h.run();
  assert.equal(h.context._almLastCopas().dropped_rows, 6);
  assert.match(h.el('k-warn').textContent, /4 .*row\(s\).*refused/);
  h.run();
  assert.equal(h.context._almLastCopas().dropped_rows, 6);
});
test('U-COPAS-PARSE control: blank lines and trailing labels are accepted without drops', () => {
  const h = harness();
  h.edit('\n' + valid + '\n  \n'); h.run();
  assert.equal(h.context._almLastCopas().k, 3);
  assert.equal(h.context._almLastCopas().dropped_rows, 0);
  assert.doesNotMatch(h.el('k-warn').textContent, /refused/);
});
test('CSV refusal counts persist across refits and reset when text is replaced', () => {
  const h = harness();
  h.context.__almCopasLoad([{yi:.2,sei:.1}, {yi:.3,sei:.2}, {yi:.4,sei:.3}, {yi:'oops',sei:.2}]);
  assert.equal(h.context._almLastCopas(), null);
  h.flush();
  assert.equal(h.context._almLastCopas().dropped_rows, 1);
  h.run();
  assert.equal(h.context._almLastCopas().dropped_rows, 1);
  h.edit(valid); h.run();
  assert.equal(h.context._almLastCopas().dropped_rows, 0);
});
test('all-invalid CSV replaces prior results with a zero-row refusal', () => {
  const h = harness();
  h.context.__almCopasLoad([{yi:'oops',sei:.2}]);
  assert.equal(h.context._almLastCopas(), null);
  h.flush();
  assert.equal(h.context._almLastCopas(), null);
  assert.match(h.el('fit-status').textContent, /0 rows read/);
  assert.match(h.el('k-warn').textContent, /1 .*row\(s\).*refused/);
});

test('P0-58: BCG refit uses the published effect-first dataset', () => {
  const h = harness(); h.hero(); h.run();
  const result = h.context._almLastCopas();
  assert.ok(result);
  assert.equal(result.k, 13);
  assert.equal(result.rows[0].te, -0.8893);
  assert.equal(result.rows[0].se, 0.5706);
});
test('control: whitespace-delimited input and zero/negative effects remain valid', () => {
  const h = harness(); h.edit('0 .1 Zero\n-.3 .2 Negative\n.4 .3 Positive'); h.run();
  assert.equal(h.context._almLastCopas().k, 3);
  assert.equal(h.context._almLastCopas().dropped_rows, 0);
});
test('pending explicit fit is cancelled by input edits; another fit uses current input', () => {
  const h = harness();
  h.el('btn-run').dispatchEvent({ type: 'click' });
  h.edit(valid + '\n.5, .4'); h.flush();
  assert.equal(h.calls, 1);
  assert.equal(h.context._almLastCopas(), null);
  h.run(); assert.equal(h.context._almLastCopas().k, 4);
});
test('all-invalid paste refuses fitting and preserves refusal status', () => {
  const h = harness(); h.edit('nonsense\n.3, -1'); h.run();
  assert.equal(h.calls, 1);
  assert.equal(h.context._almLastCopas(), null);
  assert.match(h.el('fit-status').textContent, /0 rows read; 2 row\(s\) refused/);
  assert.equal(h.el('body').innerHTML, '');
  assert.equal(h.el('plot').innerHTML, '');
});

test('control: mixed whitespace/comma separators keep the existing effect-first syntax', () => {
  const h = harness(); h.edit('.2 .1, First\n.3, .2 Second\n.4 , .3 , Third'); h.run();
  assert.equal(h.context._almLastCopas().k, 3);
  assert.equal(h.context._almLastCopas().dropped_rows, 0);
});
test('missing comma-delimited SE cannot be replaced by a numeric label', () => {
  const h = harness(); h.edit(valid + '\n.5,,.4'); h.run();
  assert.equal(h.context._almLastCopas().k, 3);
  assert.equal(h.context._almLastCopas().dropped_rows, 1);
});
