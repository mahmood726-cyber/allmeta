import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root = new URL('../../../../', import.meta.url);
const html = fs.readFileSync(new URL('copas/index.html', root), 'utf8');
const sample = html.match(/<textarea\b[^>]*id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1].replace(/\r\n/g, '\n');
const valid = '0.2, 0.1, A\n0.3, 0.2, B\n0.4, 0.3, C';
function harness({ adjusted = NaN, dropped = 0, realEngine = false } = {}) {
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
  el('src').defaultValue = sample;
  const document = { readyState: 'complete', getElementById: id => id === 'share-data-note' ? null : el(id), querySelector: s => el(s.slice(1)), createElement: () => el('created') };
  const context = vm.createContext({ document, console, Event: class { constructor(type) { this.type = type; } },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } });
  context.window = context;
  for (const file of ['shared/copas-core.js', 'shared/canonical-datasets.js', 'shared/hero-examples.js', 'hub/shared/csv-upload.js']) vm.runInContext(fs.readFileSync(new URL(file, root), 'utf8'), context);
  const csvParse = context.alm.csvUpload.parse;
  if (realEngine) {
    vm.runInContext(fs.readFileSync(new URL('shared/ma-core.js', root), 'utf8'), context);
  } else {
    context.AlmMaCore = { pool: () => ({ mu: .3, se: .1, tau2: 0 }) };
    context.AlmCopasCore.copas = input => {
    calls++;
    return { ...input, k: input.TE.length, dropped, TE_adjust: adjusted, seTE_adjust: .1, lower_adjust: .1, upper_adjust: .5,
      publprob: [1, .5], TE_slope: [.3, .2], seTE_slope: [.1, .1], lower_slope: [.1, 0], upper_slope: [.5, .4],
      rho_slope: [0, .5], tau_slope: [0, 0], pval_rsb: [.01, .01], N_unpubl: [0, 2], sel_adj: Number.isFinite(adjusted) ? 2 : null,
      n_orthogonal_points: 2, slope: 1 };
    };
  }
  const urlState = Object.assign(() => {}, { read: () => ({}), write: () => true, isSuspended: () => false });
  context.alm = { urlState };
  for (const name of ['csvUpload', 'chartDownload', 'axisControls', 'resultsExport', 'resetUndo', 'tooltips']) context.alm[name] = opts => { context[name + 'Options'] = opts; };
  context.alm.csvUpload.parse = csvParse;
  for (const block of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(block[1], context);
  if (!realEngine) context.__almCopasProfileMLE = () => ({ TE: .2, seTE: .1, rho: .5, tau: 0 });
  function flush() { let guard = 0; while (timers.size) { assert.ok(++guard < 20); const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); } }
  flush();
  return { context, el, flush, get calls() { return calls; },
    csv(text) { const opts = context.csvUploadOptions; opts.onParse((opts.parse || csvParse)(text, opts.columns)); },
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

test('review-270: CSV upload preserves tokens for the same numeric validation as pasted input', () => {
  const h = harness();
  h.csv('yi,sei,study\n.2,.1,A\n.3,.2,B\n.4,.3,C\n0x10,.2,Hex effect\n.5,0b10,Binary SE\n0o10,.2,Octal effect');
  h.flush();
  assert.equal(h.context._almLastCopas().k, 3);
  assert.equal(h.context._almLastCopas().dropped_rows, 3);
  assert.match(h.el('k-warn').textContent, /3 .*row\(s\).*refused/);
});

test('review-270 control: real CSV parser accepts decimal, signed and scientific numbers with quoted labels', () => {
  const h = harness();
  h.csv('yi,sei,study\n0,1e-1,"Zero, study"\n-3e-1,+.2,Negative\n+.4,3E-1,Positive');
  h.flush();
  const result = h.context._almLastCopas();
  assert.equal(result.k, 3);
  assert.equal(result.dropped_rows, 0);
  assert.deepEqual(Array.from(result.rows, r => [r.te, r.se]), [[0, .1], [-.3, .2], [.4, .3]]);
});

test('review-270: empty and header-only CSV invalidate the previous fit and cancel pending refits', () => {
  for (const csv of ['', 'yi,sei,study\n']) {
    const h = harness();
    h.el('btn-run').dispatchEvent({ type: 'click' });
    h.csv(csv);
    assert.equal(h.el('src').value, '');
    assert.equal(h.context._almLastCopas(), null);
    assert.equal(h.el('body').innerHTML, '');
    assert.equal(h.el('plot').innerHTML, '');
    h.flush();
    assert.equal(h.calls, 1);
    assert.equal(h.context._almLastCopas(), null);
    assert.match(h.el('fit-status').textContent, /0 rows read; 0 row\(s\) refused\. No fit/);
    assert.equal(h.el('interpretation').textContent, '');
    assert.equal(h.context.chartDownloadOptions.getReceiptInput(), null);
  }
});

test('review-270 control: a nonempty CSV replaces the old dataset and produces a current fit', () => {
  const h = harness();
  h.csv('yi,sei\n-.2,.1\n-.3,.2\n-.4,.3\n-.5,.4');
  assert.equal(h.context._almLastCopas(), null);
  h.flush();
  assert.equal(h.context._almLastCopas().k, 4);
  assert.equal(h.context._almLastCopas().rows[0].te, -.2);
  assert.equal(h.context._almLastCopas().dropped_rows, 0);
});

test('review-270: Undo restores uploaded refusal provenance with the restored dataset', () => {
  const h = harness();
  h.csv('yi,sei\n.2,.1\n.3,.2\n.4,.3\noops,.2'); h.flush();
  assert.equal(h.context._almLastCopas().dropped_rows, 1);
  const snap = h.context.resetUndoOptions.snapshot();
  h.edit(valid); h.run();
  assert.equal(h.context._almLastCopas().dropped_rows, 0);
  h.context.resetUndoOptions.restore(snap); h.flush();
  assert.equal(h.context._almLastCopas().dropped_rows, 1);
  assert.match(h.el('k-warn').textContent, /1 .*row\(s\).*refused/);
  h.run();
  assert.equal(h.context._almLastCopas().dropped_rows, 1);
});

test('review-270 control: restoring ordinary text does not inherit unrelated upload refusals', () => {
  const h = harness();
  const clean = h.context.resetUndoOptions.snapshot();
  h.csv('yi,sei\n.2,.1\n.3,.2\n.4,.3\noops,.2'); h.flush();
  h.context.resetUndoOptions.restore(clean); h.flush();
  assert.equal(h.context._almLastCopas().dropped_rows, 0);
  h.context.resetUndoOptions.restore({ src: valid + '\ninvalid' }); h.flush();
  assert.equal(h.context._almLastCopas().dropped_rows, 1);
});

test('ci-270: the catalogue Load Sample action has a visible button on Copas', () => {
  // tests/playwright/catalog-svg-plots.spec.mjs clicks this before #btn-run
  // at both viewport widths. The benchmark selector is a separate control.
  assert.match(html, /<button\b[^>]*id="btn-sample"[^>]*>Load Sample<\/button>/);
});

test('ci-270: Load Sample replaces uploaded input, cancels pending fits and preserves Undo', () => {
  const h = harness();
  h.csv('yi,sei\n.2,.1\n.3,.2\n.4,.3\noops,.2'); h.flush();
  assert.equal(h.context._almLastCopas().dropped_rows, 1);
  const uploaded = h.context.resetUndoOptions.snapshot();
  const snapshots = [];
  h.context.alm.resetUndo.snapshot = () => { snapshots.push(h.context.resetUndoOptions.snapshot()); };
  h.el('btn-run').dispatchEvent({ type: 'click' });
  const calls = h.calls;
  h.el('btn-sample').dispatchEvent({ type: 'click' });
  // Retain the sample action's snapshot even when the later Fit takes another.
  const saved = snapshots[1];
  assert.equal(h.el('src').value, sample);
  assert.deepEqual(saved, uploaded);
  assert.equal(h.context._almLastCopas(), null);
  for (const id of ['summary', 'body', 'plot']) assert.equal(h.el(id).innerHTML, '');
  assert.equal(h.context.chartDownloadOptions.getReceiptInput(), null);
  h.flush();
  assert.equal(h.calls, calls, 'loading sample must cancel the previous pending fit');
  h.run();
  assert.deepEqual(Array.from(h.context._almLastCopas().rows, r => [r.te, r.se]),
    sample.trim().split('\n').map(line => line.split(',').map(Number)));
  assert.equal(h.context._almLastCopas().dropped_rows, 0);
  assert.match(h.el('plot').innerHTML, /<path\b/);
  assert.match(h.el('plot').innerHTML, /<circle\b/);
  h.context.resetUndoOptions.restore(saved); h.flush();
  assert.equal(h.el('src').value, uploaded.src);
  assert.equal(h.context._almLastCopas().dropped_rows, 1);
});

test('ci-270 control: fitting edited input does not replace it with the sample', () => {
  const h = harness();
  const edited = '-.2, .1\n-.3, .2\n-.4, .3\n-.5, .4';
  h.edit(edited); h.run();
  assert.equal(h.el('src').value, edited);
  assert.equal(h.context._almLastCopas().k, 4);
  assert.equal(h.context._almLastCopas().rows[0].te, -.2);
  assert.equal(h.context._almLastCopas().dropped_rows, 0);
});

test('ci-270: Load Sample then Fit renders finite SVG marks with the real engines', () => {
  const h = harness({ realEngine: true });
  h.el('btn-sample').dispatchEvent({ type: 'click' });
  assert.equal(h.el('src').value, sample);
  // Match the page default used by the catalogue browser spec.
  h.el('opt-ngrid').value = '20';
  h.run();
  const result = h.context._almLastCopas();
  assert.ok(result, h.el('summary').innerHTML);
  assert.equal(result.k, sample.trim().split('\n').length);
  assert.equal(result.dropped_rows, 0);
  assert.match(h.el('plot').innerHTML, /<path\b/);
  assert.match(h.el('plot').innerHTML, /<circle\b/);
  assert.doesNotMatch(h.el('plot').innerHTML, /NaN|Infinity/);
});
