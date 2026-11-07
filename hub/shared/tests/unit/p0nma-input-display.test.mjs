import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('nma/index.html', root), 'utf8');
const engine = readFileSync(new URL('shared/nma-multiarm-v1.js', root), 'utf8');
const adapter = readFileSync(new URL('nma/validate/adapter.js', root), 'utf8');
const fixture = JSON.parse(readFileSync(new URL('hub/shared/tests/_nma_parity_fixture.json', root), 'utf8'));
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])
  .find(code => code.includes('function parseContrasts'));
assert.ok(script);
// Execute the actual parser, renderer and numerical engine; omit only page startup/listeners.
const source = script.slice(0, script.indexOf('    const loaded = loadSaved();')) +
  'window.testNma = { parseContrasts, render }; })();';
function harness() {
  const elements = new Map();
  const element = () => ({ value: '', innerHTML: '', textContent: '', children: [],
    classList: { add() {}, remove() {} }, appendChild(child) { this.children.push(child); } });
  const document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  }, createElement: element };
  const window = { alm: { analysisLifecycle: fn => fn } };
  const ctx = vm.createContext({ window, document, localStorage: { setItem() {} } });
  vm.runInContext(engine, ctx);
  vm.runInContext(source, ctx);
  vm.runInContext(adapter, ctx);
  return { window, el: id => document.getElementById(id),
    parse: text => JSON.parse(JSON.stringify(window.testNma.parseContrasts(text))),
    render(data, scale = 'log') {
      for (const [key, value] of Object.entries({ data, scale, model: 're', ref: 'A', ci: 'classic', dir: 'undesirable' })) {
        document.getElementById('f-' + key).value = value;
      }
      window.testNma.render();
    } };
}
const native = 'study,treatment1,treatment2,estimate,SE\nS1,A,B,0.3,0.15\nS2,A,B,0.1,0.20';
const netmeta = 'studlab,treat1,treat2,TE,seTE\nS1,A,B,-0.3,0.15\nS2,A,B,-0.1,0.20';

test('plant P0-2 integration: live R validation receives the same oriented contrasts as the display', () => {
  const h = harness();
  h.render(netmeta);
  const live = h.window.AlmNmaValidateAdapter.live;
  const state = live.currentState();
  assert.deepEqual(Array.from(state.rows, r => r.est), [0.3, 0.1]);
  const script = live.buildScript(state);
  h.render(native);
  assert.equal(live.buildScript(live.currentState()), script, 'same R reference inputs for equivalent conventions');
});

test('P0-2 validation: quoted native labels and fail-closed parsing use the page parser', () => {
  const h = harness(), live = h.window.AlmNmaValidateAdapter.live;
  h.render(native.replace('S1,A,B,', '"S, 1",A,B,'));
  const state = live.currentState();
  assert.equal(state.rows[0].study, 'S, 1');
  assert.equal(state.rows[0].est, 0.3);
  h.render(native + '\nS3,A,B,oops,0.2');
  assert.throws(() => live.currentState(), /estimate.*finite number/);
});

test('P0-2 validation control: native input preserves the R treatment-column swap', () => {
  const h = harness();
  h.render(native);
  const live = h.window.AlmNmaValidateAdapter.live, state = live.currentState();
  assert.deepEqual(Array.from(state.rows, r => r.est), [0.3, 0.1]);
  assert.match(live.buildScript(state), /treat1=c\("B","B"\), treat2=c\("A","A"\)/);
});

test('plant P0-2: netmeta header reverses TE once, retaining labels and SE', () => {
  const h = harness(), parsed = h.parse(netmeta);
  assert.deepEqual(parsed.rows, h.parse(native).rows);
  assert.deepEqual(parsed.warnings, []);
  h.render(netmeta);
  assert.match(h.el('warn-banner').innerHTML, /netmeta.*treat1.*treat2/i);
});

test('P0-2: quoted/tab-separated header after comments retains its convention', () => {
  const h = harness();
  const input = '# exported contrasts\n\n"STUDLAB"\t"TREAT1"\t"TREAT2"\t"TE"\t"SETE"\n"S, 1"\tA\tB\t-0.3\t0.15';
  assert.deepEqual(h.parse(input).rows, [{ study: 'S, 1', t1: 'A', t2: 'B', est: 0.3, se: 0.15, v: 0.0225 }]);
});

test('P0-2 control: native, headerless and non-netmeta alias input retain signs', () => {
  const h = harness(), rows = h.parse(native).rows;
  assert.deepEqual(h.parse(native.split('\n').slice(1).join('\n')).rows, rows);
  assert.deepEqual(h.parse(native.replace('study,treatment1,treatment2,estimate,SE', 'study,t1,t2,yi,sei')).rows, rows);
  h.render(native);
  assert.doesNotMatch(h.el('warn-banner').innerHTML, /netmeta header/i);
});

test('P0-2: smokingcessation pasted netmeta output matches source-backed estimates and rankings', () => {
  const h = harness(), ds = fixture.datasets.find(d => d.dataset === 'smokingcessation');
  const text = ['studlab,treat1,treat2,TE,seTE', ...ds.contrasts.map(c =>
    [c.studlab, c.treat1, c.treat2, c.TE, c.seTE].join(','))].join('\n');
  const result = h.window.__almNmaCompute(text, 'A');
  assert.equal(result.error, undefined);
  const ref = ds.fits.find(f => f.method_random_ci === 'classic');
  for (const [i, t] of ref.trts.entries()) {
    const cell = i * ref.trts.length + ref.trts.indexOf('A');
    for (const [model, key] of [['fe', 'common'], ['re', 'random']]) {
      assert.ok(Math.abs(result[model].est[t].d - ref['TE_' + key][cell]) < 1e-6, `${model} ${t} estimate`);
      assert.ok(Math.abs(result[model].est[t].se - ref['seTE_' + key][cell]) < 1e-6, `${model} ${t} SE`);
      for (const direction of ['desirable', 'undesirable']) {
        assert.ok(Math.abs(result.pscore[direction][model][t] - ref['pscore_' + direction][key][i]) < 1e-6,
          `${model} ${direction} ${t} P-score`);
      }
    }
  }
});

test('control: malformed header/data still refuses the entire network', () => {
  const h = harness();
  for (const bad of [native + '\nS3,A,B,oops,0.2', netmeta + '\nS3,A,B,0.2,0',
    netmeta.replace('TE,seTE', 'oops,seTE')]) {
    const parsed = h.parse(bad);
    assert.deepEqual(parsed.rows, []);
    assert.ok(parsed.warnings.length);
  }
});

function i2Text(h) {
  return h.el('het-host').innerHTML.match(/I² \(95% CI\)<\/th><td>(.*?)<\/td>/)[1];
}
test('plant P0-3: real df=1 analysis preserves a zero estimate with unavailable CI', () => {
  const h = harness();
  const a = h.window.__almNmaCompute(native, 'A').analysis;
  assert.equal(a.I2, 0);
  assert.equal(a.lowerI2, null);
  assert.equal(a.upperI2, null);
  h.render(native);
  assert.equal(i2Text(h), '0.0% (95% CI not estimable)');
});

test('P0-3: either missing/nonfinite bound makes the interval not estimable', () => {
  const h = harness(), analyse = h.window.AlmNmaMultiarm.analyse;
  for (const bounds of [[null, 0.5], [0, null], [undefined, 0.5], [0, NaN], [0, Infinity]]) {
    h.window.AlmNmaMultiarm.analyse = (...args) => ({ ...analyse(...args), lowerI2: bounds[0], upperI2: bounds[1] });
    h.render(native);
    assert.equal(i2Text(h), '0.0% (95% CI not estimable)');
  }
});

test('P0-3 control: df=0 stays unavailable; finite bounds including zero remain numeric', () => {
  const h = harness();
  h.render('S1,A,B,0.3,0.15');
  assert.equal(i2Text(h), 'not estimable');
  const data = native + '\nS3,A,B,0.2,0.20';
  const a = h.window.__almNmaCompute(data, 'A').analysis;
  assert.equal(a.lowerI2, 0);
  assert.ok(Number.isFinite(a.upperI2));
  h.render(data);
  assert.equal(i2Text(h), `${(100 * a.I2).toFixed(1)}% (${(100 * a.lowerI2).toFixed(1)}% to ${(100 * a.upperI2).toFixed(1)}%)`);
});

const ratios = 'S1,A,B,0.7,0.15\nS2,A,B,1.2,0.20';
test('plant P0-25: exponentiated display warns on ratio-like entries, with log-scale SE guidance', () => {
  const h = harness(), before = h.window.__almNmaCompute(ratios, 'A');
  h.render(ratios, 'exp');
  const note = h.el('warn-banner').innerHTML;
  assert.match(note, /ratio-like/i);
  assert.match(note, /ln\(ratio\)/i);
  assert.match(note, /SE.*log/i);
  assert.match(note, /positive log effects.*valid/i);
  assert.equal(h.el('f-data').value, ratios);
  assert.deepEqual(h.window.__almNmaCompute(ratios, 'A'), before);
  assert.ok(h.el('ref-host').innerHTML.includes('<table'));
});

test('P0-25: check entered values before netmeta orientation conversion', () => {
  const h = harness();
  h.render('studlab,treat1,treat2,TE,seTE\n' + ratios, 'exp');
  assert.match(h.el('warn-banner').innerHTML, /ratio-like/i);
});

test('P0-25 controls: analysis-scale display, signed effects and distant values are not flagged; warning clears', () => {
  const h = harness();
  for (const [data, scale] of [[ratios, 'log'], [ratios.replace('0.7', '-0.7'), 'exp'],
    [ratios.replace('0.7', '0'), 'exp'], ['S1,A,B,0.1,0.15\nS2,A,B,0.2,0.20', 'exp'],
    ['S1,A,B,5,0.15\nS2,A,B,6,0.20', 'exp']]) {
    h.render(ratios, 'exp');
    h.render(data, scale);
    assert.doesNotMatch(h.el('warn-banner').innerHTML, /ratio-like/i);
  }
});
