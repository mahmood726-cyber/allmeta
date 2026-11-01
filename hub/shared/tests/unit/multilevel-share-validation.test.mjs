import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const adapter = readFileSync(new URL('../../../../multilevel-ma/alm-features.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../../../multilevel-ma/index.html', import.meta.url), 'utf8');
function setup() {
  const src = { value: 'original', addEventListener() {} };
  let runs = 0;
  const axes = Object.fromEntries(['min', 'max', 'log'].map(k => [k, { value: '', checked: false, dispatchEvent() {} }]));
  const state = { entryLog: [{ text: 'original log' }], provenance: [] };
  const ctx = vm.createContext({ AlmFeaturesState: state, Event: class {}, document: {
    getElementById: id => id === 'src' ? src : { click() { runs++; } },
    querySelector: s => axes[/data-edge="(.*?)"/.exec(s)[1]]
  } });
  // Exercise the actual page parser, including its permissive parseFloat behavior.
  vm.runInContext(html.slice(html.indexOf('function parse(text)'), html.indexOf('function fmt(')) + ';globalThis.__almMlmaParse = parse;', ctx);
  vm.runInContext(adapter, ctx);
  return { src, axes, state, runs: () => runs, set: ctx.AlmMultilevelFeatures.share.set };
}
const share = src => ({ src, axis: { min: '-1', max: '2', log: false } });
for (const row of ['A, 0.3garbage, 0.1, a', 'A, 0.3, 0.1garbage, a']) {
  test('multilevel share PLANTED: rejects partial numeric token: ' + row, () => {
    const app = setup();
    assert.throws(() => app.set(share(row + '\nA, .2, .1, b\nB, .4, .2, a')), /Invalid effect rows/);
    assert.equal(app.src.value, 'original');
    assert.equal(app.axes.min.value, '');
    assert.equal(app.state.entryLog[0].text, 'original log');
    assert.equal(app.runs(), 0);
  });
}
test('multilevel share CONTROL: decimal and scientific notation restore all rows', () => {
  const app = setup(), text = 'A, 3e-1, 1e-1, a\nA, -.2, .1, b\nB, +.4, .2, a';
  app.set(share(text));
  assert.equal(app.src.value, text);
  assert.equal(app.axes.min.value, '-1');
  assert.equal(app.runs(), 1);
});
