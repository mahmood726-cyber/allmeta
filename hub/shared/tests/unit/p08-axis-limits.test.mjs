import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('meta-regression/index.html', root), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const lifecycle = readFileSync(new URL('hub/shared/analysis-lifecycle.js', root), 'utf8');
const DATA = 'A, -1, 0.2, -2\nB, 0, 0.3, 0\nC, 1, 0.25, 2\nD, 2, 0.4, 4';

// Execute the real app and adapter scripts, including the registered axis
// callback and Run analysis listener. Only DOM and unrelated shared UI are
// substituted; expose the existing export builder without changing its body.
function harness() {
  const elements = new Map();
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) {
    const listeners = new Map();
    elements.set(id, {
      id, value: '', checked: false, hidden: false, innerHTML: '',
      classList: { add() {}, remove() {} },
      matches(selector) { return selector === '[id^="f-"]' && id.startsWith('f-'); },
      addEventListener(type, callback) {
        const callbacks = listeners.get(type) || [];
        callbacks.push(callback);
        listeners.set(type, callbacks);
      },
      dispatchEvent(event) {
        for (const callback of listeners.get(event.type) || []) callback({ ...event, target: this });
      },
      click() { this.dispatchEvent({ type: 'click' }); },
    });
  }
  let axisOptions, plotOptions;
  const document = {
    getElementById: id => elements.get(id) || null,
    querySelectorAll: selector => [...elements.values()].filter(el => el.matches(selector)),
    querySelector: selector => selector === '#svg-host svg'
      ? { outerHTML: elements.get('svg-host').innerHTML } : null,
    addEventListener() {},
  };
  const urlState = Object.assign(() => {}, { read: () => ({}), write() {} });
  const context = vm.createContext({
    document, console,
    localStorage: { getItem: () => null, setItem() {} },
    alm: {
      axisControls: options => { axisOptions = options; },
      plotExport: options => { plotOptions = options; },
      csvUpload() {}, resultsExport() {}, resetUndo() {}, tooltips() {}, urlState,
    },
  });
  context.window = context;
  vm.runInContext(lifecycle, context);
  assert.ok(scripts[0].includes('    const loaded = loadSaved();'));
  vm.runInContext(scripts[0].replace('    const loaded = loadSaved();',
    '    window.__testCurrentSvg = currentSvg;\n    window.__testNiceTicks = niceTicks;\n    const loaded = loadSaved();'), context);
  vm.runInContext(scripts[1], context);
  elements.get('f-data').value = DATA;
  elements.get('f-title').value = 'Axis limits';
  elements.get('btn-run').click();
  assert.equal(axisOptions.target, '#alm-axis-mount');
  context.__testAxisChange = axisOptions.onChange;
  context.__testRun = () => elements.get('btn-run').click();
  return {
    context, elements,
    get svg() { return elements.get('svg-host').innerHTML; },
    get stats() { return elements.get('stats-wrap').innerHTML; },
    run() { vm.runInContext('__testRun()', context, { timeout: 250 }); },
    change(x = [null, null], y = [null, null]) {
      // Matches axis-controls.js fmtState(): null means automatic per edge.
      context.__testAxisState = { ticks: 'auto', x, xLog: false, y, yLog: false };
      vm.runInContext('__testAxisChange(__testAxisState)', context, { timeout: 250 });
    },
    exportSvg() { return vm.runInContext('__testCurrentSvg().svg', context, { timeout: 250 }); },
    sharedExportSvg() { return plotOptions.plots[0].getSvg().outerHTML; },
    ticks(lo, hi) {
      context.__testTickRange = [lo, hi];
      return Array.from(vm.runInContext('__testNiceTicks(...__testTickRange, 6)', context, { timeout: 250 }));
    },
  };
}

function bubbles(svg) {
  return [...svg.matchAll(/<circle cx="([^"]+)" cy="([^"]+)"/g)]
    .map(m => ({ x: Number(m[1]), y: Number(m[2]) }));
}

function near(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} versus ${expected}`);
}

function expectDomain(svg, xRange, yRange) {
  const points = bubbles(svg);
  assert.equal(points.length, 4);
  for (let i = 0; i < 4; i++) {
    near(points[i].x, 70 + ((-2 + 2 * i) - xRange[0]) / (xRange[1] - xRange[0]) * 620, 'x coordinate');
    near(points[i].y, 440 - ((-1 + i) - yRange[0]) / (yRange[1] - yRange[0]) * 380, 'y coordinate');
  }
}

test('P08-R4 plant: axis callback immediately redraws the requested x/y domains', () => {
  const h = harness(), before = h.svg, stats = h.stats;
  h.change([-10, 10], [-20, 20]);
  assert.notEqual(h.svg, before, 'editing limits must redraw without another analysis click');
  expectDomain(h.svg, [-10, 10], [-20, 20]);
  assert.equal(h.stats, stats, 'display limits must not change fitted results');
});

test('P08-R4 plant: Run analysis retains requested domains and matching ticks', () => {
  const h = harness();
  h.change([-10, 10], [-20, 20]);
  h.run();
  expectDomain(h.svg, [-10, 10], [-20, 20]);
  for (const label of ['-10.0', '10.0', '-20.00', '20.00']) {
    assert.ok(h.svg.includes('>' + label + '</text>'), 'missing axis tick ' + label);
  }
});

test('P08-R4 plant: native and shared plot export use the edited domains', () => {
  const h = harness();
  h.change([-10, 10], [-20, 20]);
  expectDomain(h.exportSvg(), [-10, 10], [-20, 20]);
  expectDomain(h.sharedExportSvg(), [-10, 10], [-20, 20]);
  assert.equal(h.exportSvg(), h.svg);
  assert.equal(h.sharedExportSvg(), h.svg);
});

test('P08-R4 plant: one automatic edge and clearing limits retain automatic geometry', () => {
  const h = harness(), before = h.svg, original = bubbles(before);
  h.change([-10, null]);
  near(bubbles(h.svg)[0].x, 70 + 8 / (4.48 + 10) * 620, 'automatic upper x edge');
  assert.deepEqual(bubbles(h.svg).map(p => p.y), original.map(p => p.y));
  h.change([null, 10]);
  near(bubbles(h.svg)[0].x, 70 + 0.48 / (10 + 2.48) * 620, 'automatic lower x edge');
  h.change([null, null], [null, 20]);
  assert.deepEqual(bubbles(h.svg).map(p => p.x), original.map(p => p.x));
  h.change();
  assert.equal(h.svg, before, 'clearing all limits must restore the original SVG exactly');
  assert.equal(h.exportSvg(), before);
});

test('P08-R4 plant: narrowed domains clip marks while keeping axes outside the clip', () => {
  const h = harness();
  h.change([-1, 1], [-0.5, 0.5]);
  expectDomain(h.svg, [-1, 1], [-0.5, 0.5]);
  const clip = h.svg.match(/<clipPath id="([^"]+)"[^>]*>([\s\S]*?)<\/clipPath>/);
  assert.ok(clip, 'custom limits need a plot-area clip');
  assert.match(clip[2], /<rect x="70" y="60" width="620" height="380"/);
  const opening = '<g clip-path="url(#' + clip[1] + ')">';
  const start = h.svg.indexOf(opening), end = h.svg.indexOf('</g>', start);
  assert.ok(start >= 0 && end > start);
  const marks = h.svg.slice(start, end);
  assert.match(marks, /<polygon /);
  assert.match(marks, /<polyline /);
  assert.equal(bubbles(marks).length, 4);
  assert.doesNotMatch(marks, /<text /);
  assert.match(h.svg.slice(end), /<text /);
  assert.equal(h.exportSvg(), h.svg);
});

test('P08-R4 control: invalid or reversed ranges fall back to the automatic SVG', () => {
  const h = harness(), before = h.svg;
  for (const range of [[5, 5], [10, -10], [NaN, 10], [-10, Infinity], ['-10', 10], [100, null]]) {
    h.change(range, [null, null]);
    h.run();
    assert.equal(h.svg, before, 'invalid x range must not corrupt the plot: ' + String(range));
    assert.equal(h.exportSvg(), before);
  }
});

test('P08-R4 control: automatic domains use padded data and preserve fit and export', () => {
  const h = harness(), before = h.svg, stats = h.stats;
  const z = h.context.Z975;
  const lo = -1 - z * 0.2, hi = 2 + z * 0.4, pad = (hi - lo) * 0.1;
  expectDomain(h.svg, [-2.48, 4.48], [lo - pad, hi + pad]);
  const fit = h.context._almLastFitted().fit;
  near(fit.b0, 0, 'intercept control');
  near(fit.b1, 0.5, 'slope control');
  h.change();
  h.run();
  assert.equal(h.svg, before);
  assert.equal(h.stats, stats);
  assert.equal(h.exportSvg(), before);
  assert.equal(h.sharedExportSvg(), before);
});

test('P08-R4 control: actual study-data edits change the plot', () => {
  const h = harness(), before = h.svg;
  h.elements.get('f-data').value = DATA.replace('A, -1', 'A, -3');
  h.run();
  assert.notEqual(h.svg, before);
  assert.equal(h.exportSvg(), h.svg);
});

function plotPoints(svg, tag) {
  const match = svg.match(new RegExp('<' + tag + ' points="([^"]+)"'));
  assert.ok(match, 'missing ' + tag);
  return match[1].split(' ').map(pair => pair.split(',').map(Number));
}

function expectBoundedPlot(h, stats) {
  const line = plotPoints(h.svg, 'polyline'), band = plotPoints(h.svg, 'polygon');
  assert.ok(line.length >= 2 && line.length <= 201, 'bounded fitted-line sampling');
  assert.equal(band.length, line.length * 2, 'both CI edges use the same samples');
  assert.ok([...line, ...band].flat().every(Number.isFinite), 'finite line and band coordinates');
  assert.ok(line.every(([x]) => x >= 70 - 1e-8 && x <= 690 + 1e-8), 'samples stay inside x domain');
  near(line[0][0], 70, 'line begins at lower x bound');
  near(line.at(-1)[0], 690, 'line reaches upper x bound');
  assert.ok([...h.svg.matchAll(/<text /g)].length <= 32, 'bounded axis label count');
  assert.equal(bubbles(h.svg).length, 4);
  assert.equal(h.stats, stats, 'display limits preserve fitted statistics');
  assert.equal(h.exportSvg(), h.svg, 'native export matches display');
  assert.equal(h.sharedExportSvg(), h.svg, 'shared export matches display');
  const before = h.svg;
  h.run();
  assert.equal(h.svg, before, 'explicit Run is deterministic');
}

for (const axis of ['x', 'y']) {
  for (const [domain, range] of [
    ['adjacent representable bounds at one', [1, 1 + Number.EPSILON]],
    ['tiny bounds around zero', [-1e-20, 1e-20]],
  ]) {
    test(`P08-R1 plant: ${axis} ${domain} redraw and export within bounded work`, () => {
      const h = harness(), stats = h.stats;
      h.change(axis === 'x' ? range : undefined, axis === 'y' ? range : undefined);
      expectBoundedPlot(h, stats);
    });
  }
  test(`P08-R1 control: ordinary ${axis} limits preserve geometry, ticks, fit and export`, () => {
    const h = harness(), stats = h.stats;
    h.change(axis === 'x' ? [-10, 10] : undefined, axis === 'y' ? [-20, 20] : undefined);
    expectBoundedPlot(h, stats);
    for (const label of axis === 'x' ? ['-10.0', '0.0', '10.0'] : ['-20.00', '0.00', '20.00']) {
      assert.ok(h.svg.includes('>' + label + '</text>'), 'missing tick ' + label);
    }
  });
}

test('P08-R1 plant: ticks stay finite, increasing and inside tiny or subnormal domains', () => {
  const h = harness();
  for (const [lo, hi] of [[1, 1 + Number.EPSILON], [-1e-20, 1e-20], [0, Number.MIN_VALUE], [-Number.MIN_VALUE, Number.MIN_VALUE]]) {
    const ticks = h.ticks(lo, hi);
    assert.ok(ticks.length >= 2 && ticks.length <= 13, 'bounded nonempty tick set');
    assert.ok(ticks.every((v, i) => Number.isFinite(v) && v >= lo && v <= hi && (i === 0 || v > ticks[i - 1])),
      'ticks must be unique, ordered and within the requested range');
  }
});

test('P08-R1 control: ordinary tick domains retain their readable steps', () => {
  const h = harness();
  assert.deepEqual(h.ticks(-10, 10), [-10, -5, 0, 5, 10]);
  assert.deepEqual(h.ticks(-20, 20), [-20, -10, 0, 10, 20]);
  assert.deepEqual(h.ticks(0, 1), [0, 0.2, 0.4, 0.6000000000000001, 0.8, 1]);
});
