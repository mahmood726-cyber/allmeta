const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '../../..');
const original = process.env.HERO_ORIGINAL;
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// Exercise attachHero itself, including its selected adapter, event and callback.
function harness() {
  let change, inputs = 0, runs = 0;
  const textarea = { value: '', dispatchEvent() { inputs++; } };
  const mount = { innerHTML: '', addEventListener(name, fn) { assert.equal(name, 'change'); change = fn; } };
  const context = vm.createContext({
    Event: class { constructor(type) { this.type = type; } },
    document: {
      querySelector: selector => selector === '#alm-hero-mount' ? mount : textarea,
      getElementById: id => { assert.equal(id, 'btn-run'); return { click() { runs++; } }; },
    },
  });
  for (const file of ['shared/canonical-datasets.js', 'shared/hero-examples.js']) vm.runInContext(read(file), context);
  return { context, textarea, select(adapter, key) {
    if (adapter) context.AlmHero.attachHero({ container: '#alm-hero-mount', textarea: '#src', adapter });
    change({ target: { closest: () => ({ value: key }) } });
    return textarea.value;
  }, get inputs() { return inputs; }, get runs() { return runs; } };
}

for (const app of ['gosh', 'limit-ma']) {
  test(`${app}: actual hero attachment produces all 13 studies using the page parser`, () => {
    const file = original ? path.join(original, app === 'gosh' ? 'gosh-original.html' : 'limit-original.html') : path.join(root, app, 'index.html');
    const html = fs.readFileSync(file, 'utf8');
    // Extract the page's own parser, not an imitation: gosh/index.html:176;
    // limit-ma/index.html:192. Stops at the declaration's four-space closing brace.
    const parser = html.match(/    function parse\(text\) \{[\s\S]*?\n    \}/)[0];
    const attachment = html.match(/AlmHero\.attachHero\(\{[\s\S]*?\n      \}\);/)[0];
    const h = harness();
    vm.runInContext(attachment, h.context);
    h.select(null, 'bcg');
    const parse = vm.runInContext(`(${parser.trim()})`, h.context);
    const rows = JSON.parse(JSON.stringify(parse(h.textarea.value)));
    assert.equal(rows.length, 13);
    assert.deepEqual(rows, JSON.parse(JSON.stringify(h.context.AlmDatasets.get('bcg').effect_se.map(s => ({ te: s.yi, se: Number(Math.sqrt(s.vi).toFixed(4)), label: s.label })))));
    assert.equal(h.inputs, 1);
    assert.equal(h.runs, 1, 'selection must run the analysis');
  });
}

test('each adapter emits its specified row layout through attachHero', () => {
  const h = harness();
  const examples = {
    forest: ['bcg', 'Aronson 1948, -0.8893, 0.5706'],
    bma: ['bcg', 'Aronson 1948, -0.8893, 0.5706'],
    'effect-se-label': ['bcg', '-0.8893, 0.5706, Aronson 1948'],
    glmm: ['eltrombopag', 'TRA-100773A, 0, 38, 4, 35'],
    'cross-design': ['bcg', 'Aronson 1948, -0.8893, 0.5706, rct'],
    'cross-network': ['bcg', 'BCG_vs_placebo, -0.8893, 0.3256, rct'],
    sequential: ['sequential_demo', '-0.4, 0.2, 200'],
    personalised: ['subgroup_demo', 'S1, young/bm-, -0.3, 0.02'],
  };
  assert.deepEqual(Object.keys(h.context.AlmHero.MANIFESTS).sort(), Object.keys(examples).sort());
  for (const [adapter, [key, first]] of Object.entries(examples)) {
    assert.equal(h.select(adapter, key).split('\n')[0], first, adapter);
  }
});

test('new adapter retains forest precision and equals the entire R input fixture byte for byte', () => {
  const h = harness();
  const text = h.select('effect-se-label', 'bcg');
  assert.equal(text, read('hub/shared/tests/fixtures/hero-bcg-input.csv'));
  const forest = h.select('forest', 'bcg');
  assert.equal(text, forest.split('\n').map(line => {
    const [label, effect, se] = line.split(', ');
    return [effect, se, label].join(', ');
  }).join('\n'));
});

test('old forest layout is refused by both effect-first parsing rules', () => {
  const h = harness();
  const text = h.select('forest', 'bcg');
  for (const app of ['gosh', 'limit-ma']) {
    const html = read(`${app}/index.html`);
    const parse = vm.runInContext(`(${html.match(/    function parse\(text\) \{[\s\S]*?\n    \}/)[0].trim()})`, h.context);
    assert.throws(() => parse(text), /Line 1: effect/);
  }
});
