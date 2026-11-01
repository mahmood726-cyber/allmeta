import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const adapter = readFileSync(new URL('../../../../multilevel-ma/alm-features.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../../../multilevel-ma/index.html', import.meta.url), 'utf8');

function setup() {
  const src = { value: 'original', addEventListener() {} };
  const axes = Object.fromEntries(['min', 'max', 'log'].map(key =>
    [key, { value: '', checked: false, dispatchEvent() {} }]));
  const state = { entryLog: [{ text: 'original log' }], provenance: [{ label: 'original source' }] };
  let runs = 0;
  const ctx = vm.createContext({ AlmFeaturesState: state, Event: class {}, document: {
    getElementById: id => id === 'src' ? src : { click() { runs++; } },
    querySelector: selector => axes[/data-edge="(.*?)"/.exec(selector)[1]]
  } });
  // Use the shipped parser: it ignores fields after the optional effect label.
  vm.runInContext(html.slice(html.indexOf('function parse(text)'), html.indexOf('function fmt(')) +
    ';globalThis.__almMlmaParse = parse;', ctx);
  vm.runInContext(adapter, ctx);
  return { src, axes, state, runs: () => runs, set: ctx.AlmMultilevelFeatures.share.set,
    parse: ctx.__almMlmaParse };
}

const share = src => ({ src, axis: { min: '-1', max: '3', log: true } });
for (const row of ['A, .3, .1, a, discarded', 'Study, 1, .3, .1, endpoint']) {
  test('multilevel share PLANTED: extra columns are rejected atomically: ' + row, () => {
    const app = setup();
    const input = row + '\nA, .2, .1, b\nB, .4, .2, a';
    assert.equal(app.parse(input).length, 3, 'the permissive page parser alone accepts the malformed row');
    assert.throws(() => app.set(share(input)), /Invalid effect rows/);
    assert.equal(app.src.value, 'original');
    assert.equal(app.axes.min.value, '');
    assert.equal(app.axes.max.value, '');
    assert.equal(app.axes.log.checked, false);
    assert.equal(app.state.entryLog[0].text, 'original log');
    assert.equal(app.state.provenance[0].label, 'original source');
    assert.equal(app.runs(), 0);
  });
}

for (const suffix of ['', ', endpoint', ',']) {
  test('multilevel share CONTROL: three columns and optional labels restore: ' + JSON.stringify(suffix), () => {
    const app = setup(), input = ['A, .3, .1', 'A, .2, .1', 'B, .4, .2']
      .map(row => row + suffix).join('\n');
    app.set(share(input));
    assert.equal(app.src.value, input);
    assert.equal(app.axes.min.value, '-1');
    assert.equal(app.axes.max.value, '3');
    assert.equal(app.axes.log.checked, true);
    assert.equal(app.runs(), 1);
    assert.deepEqual(Array.from(app.parse(input), row => [row.te, row.se, row.label]),
      [[.3, .1, suffix.includes('endpoint') ? 'endpoint' : ''],
        [.2, .1, suffix.includes('endpoint') ? 'endpoint' : ''],
        [.4, .2, suffix.includes('endpoint') ? 'endpoint' : '']]);
  });
}
