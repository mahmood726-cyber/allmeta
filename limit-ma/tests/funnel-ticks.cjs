// Execute the real inline renderer with the same minimal DOM pattern as loo/replay.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function load(page) {
  const html = fs.readFileSync(page, 'utf8'), nodes = {};
  const node = () => ({value: '', innerHTML: '', textContent: '', parentNode: {},
    addEventListener() {}, setAttribute() {}});
  for (const m of html.matchAll(/\bid="([^"]+)"/g)) nodes[m[1]] = node();
  nodes.src.value = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1];
  let axes, exporter;
  const noop = () => {};
  const window = {alm: {analysisLifecycle: run => run, csvUpload: noop,
    axisControls: options => { axes = options; }, plotExport: options => { exporter = options; },
    resultsExport: noop, urlState: Object.assign(noop, {read: () => null}), resetUndo: noop, tooltips: noop}};
  const document = {getElementById: id => nodes[id] || null, querySelectorAll: () => [node(), node()]};
  vm.runInNewContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], {window, document});
  return {window, nodes, axes, exporter};
}
const page = process.argv[2] || path.join(__dirname, '../index.html');
const original = process.argv[3];
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
const close = (a, b, tolerance = 1e-9) => assert.ok(Number.isFinite(a) && Number.isFinite(b) &&
  Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), `${a} != ${b}`);
function check(env, bounds = {}) {
  const {nodes, window: w} = env, markup = nodes.plot.innerHTML;
  assert.equal(nodes['limit-error'].textContent, '');
  const rows = nodes.src.value.trim().split('\n').map(line => line.split(',').map(Number));
  const x = [bounds.x?.[0] ?? Math.min(w._almLastLimit().limit_est, ...rows.map(r => r[0])) - .1,
    bounds.x?.[1] ?? Math.max(w._almLastLimit().limit_est, ...rows.map(r => r[0])) + .1];
  const y = [bounds.y?.[0] ?? 0, bounds.y?.[1] ?? Math.max(...rows.map(r => r[1])) * 1.1];
  for (const [axis, range, start, length] of [['x', x, 60, 520], ['y', y, 20, 280]]) {
    const paths = [...markup.matchAll(new RegExp('<path data-limit-axis="' + axis + '"[^>]*><title>([^<]+)</title></path>', 'g'))];
    const labels = [...markup.matchAll(new RegExp('<text data-limit-tick-label="' + axis + '"[^>]*>([^<]+)</text>', 'g'))];
    assert.ok(labels.length >= 4 && labels.length <= 7, `${axis}: expected 4-7 numeric ticks, got ${labels.length}`);
    assert.equal(paths.length, labels.length);
    let previous = -Infinity, previousPosition = -Infinity;
    for (let i = 0; i < labels.length; i++) {
      const a = attrs(labels[i][0]), value = Number(labels[i][1]), exact = Number(paths[i][1]);
      assert.ok(!/^-0(?:\.0*)?(?:e[+-]?\d+)?$/.test(labels[i][1]), 'negative zero');
      assert.ok(value > previous && value >= range[0] && value <= range[1], 'ordered, in-range values');
      const p = attrs(paths[i][0]).d.match(/^M (\S+) (\S+) l /).slice(1).map(Number);
      const position = p[axis === 'x' ? 0 : 1];
      assert.ok(position > previousPosition && position >= start - 1e-9 && position <= start + length + 1e-9);
      assert.ok(+a.x >= 60 && +a.x <= 580 && +a.y >= 20 && +a.y <= 300, 'anchor inside plot');
      close(+a[axis], position); close(value, exact);
      const span = range[1] - range[0];
      const fraction = Number.isFinite(span) ? (value - range[0]) / span :
        (value / 2 - range[0] / 2) / (range[1] / 2 - range[0] / 2);
      // Labels must map through the renderer's existing X/Y scale to the actual tick.
      close(position, start + fraction * length);
      previous = value; previousPosition = position;
    }
    const values = labels.map(m => Number(m[1]));
    const step = values[1] - values[0], unit = 10 ** Math.floor(Math.log10(step));
    assert.ok([1, 2, 2.5, 5, 10].some(n => Math.abs(step / unit - n) < 1e-8), 'nice-number step');
    for (let i = 2; i < values.length; i++) close((values[i] - values[i - 1]) / step, 1);
  }
  assert.equal(env.exporter.plots[0].getSvg(), nodes.plot, 'all formats export the tick-bearing SVG');
  assert.ok(markup.indexOf('data-limit-axis') > markup.lastIndexOf('</g>'), 'ticks outside data clip');
  assert.ok(!/NaN|Infinity/.test(markup));
}
const tests = [];
const test = (name, run) => tests.push({name, run});
const cases = [
  ['built-in example', {}],
  ['axis override and omission notice', {x: [.4, .6], y: [.05, .15]}],
  ['negative range and zero label', {x: [-.3, .3], y: [0, .3]}],
  ['small-scale precision', {x: [-3e-7, 4e-7], y: [0, 4e-8]}],
  ['large finite bounds', {x: [-1e308, 1e308], y: [0, 1e200]}],
  ['partial overrides', {x: [null, 1], y: [null, .25]}],
  ['offset narrow range', {x: [100.001, 100.009], y: [.10001, .10009]}],
];
for (const [name, bounds] of cases) test(name, () => {
  const env = load(page); env.axes.onChange(bounds); check(env, bounds);
  if (name === 'axis override and omission notice') assert.match(env.nodes['limit-range-note'].textContent, /stud.*not shown/);
  env.axes.onChange({}); check(env);
});
test('invalid ranges retain the existing error and clear the SVG', () => {
  const env = load(page); env.axes.onChange({x: [1, 0]});
  assert.equal(env.nodes.plot.innerHTML, ''); assert.match(env.nodes['limit-error'].textContent, /Plot range error/);
});
test('all primary corpus successful fits have calibrated ticks', () => {
  const env = load(page), corpus = JSON.parse(fs.readFileSync(path.join(__dirname, '../validate/corpus/corpus.json')));
  let count = 0;
  for (const c of corpus) {
    env.window.__almLimitValidationRun(c.te.map((x, i) => `${x},${c.se[i]}`).join('\n'), true);
    if (env.nodes.plot.innerHTML) { check(env); count++; }
  }
  assert.equal(count, 169); console.log(`${count}/${corpus.length} corpus plots calibrated`);
});
if (original) test('existing geometry and results unchanged for all primary corpus cases and overrides', () => {
  const before = load(original), after = load(page);
  const removeTicks = s => s.replace(/<path data-limit-axis="[xy]"[^>]*><title>[^<]*<\/title><\/path>/g, '')
    .replace(/<text data-limit-tick-label="[xy]"[^>]*>[^<]*<\/text>/g, '');
  const compare = () => {
    assert.equal(removeTicks(after.nodes.plot.innerHTML), before.nodes.plot.innerHTML);
    assert.equal(JSON.stringify(after.window._almLastLimit()), JSON.stringify(before.window._almLastLimit()));
    assert.equal(after.nodes['limit-range-note'].textContent, before.nodes['limit-range-note'].textContent);
  };
  for (const [, bounds] of cases) { before.axes.onChange(bounds); after.axes.onChange(bounds); compare(); }
  const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, '../validate/corpus/corpus.json')));
  for (const c of corpus) {
    const input = c.te.map((x, i) => `${x},${c.se[i]}`).join('\n');
    before.window.__almLimitValidationRun(input, true); after.window.__almLimitValidationRun(input, true); compare();
  }
  console.log(`${corpus.length + cases.length}/${corpus.length + cases.length} original geometry/results comparisons identical`);
});
let passed = 0;
for (const {name, run} of tests) {
  try { run(); passed++; console.log('PASS ' + name); }
  catch (error) { console.log('FAIL ' + name + '\n' + error.stack); }
}
console.log(`${passed}/${tests.length} funnel tick checks passed`);
if (passed !== tests.length) process.exitCode = 1;
