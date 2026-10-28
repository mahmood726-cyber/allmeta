import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('influence/index.html', root), 'utf8');
const engine = readFileSync(new URL('shared/diagnostic-plots.js', root), 'utf8');
const start = html.indexOf('      function drawRadial(rows) {');
const end = html.indexOf('      function drawLOO(', start);
assert.ok(start >= 0 && end > start, 'locate the production radial renderer');
const drawRadial = html.slice(start, end);
const plot = { left: 50, right: 580, top: 20, bottom: 258 };

function elements(markup, tag) {
  return [...markup.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'g'))].map(([element]) =>
    Object.fromEntries([...element.matchAll(/([\w-]+)="([^"]*)"/g)]
      .map(([, key, value]) => [key, value])));
}

function render(effects, se = 0.1) {
  const rows = effects.map(te => ({ te, se }));
  const svg = { innerHTML: '' };
  const context = vm.createContext({
    window: {},
    document: { getElementById(id) { return id === 'radial-plot' ? svg : null; } },
    esc: String, // These test rows use only numeric fallback labels.
  });
  vm.runInContext(engine, context, { filename: 'shared/diagnostic-plots.js' });
  vm.runInContext(drawRadial, context, { filename: 'influence/drawRadial' });
  const expected = JSON.stringify(context.window.AlmDiagPlots.radial(
    rows.map(r => r.te), rows.map(r => r.se * r.se)));
  context.drawRadial(rows);
  assert.equal(JSON.stringify(context.window.__almRadial), expected,
    'rendering preserves the statistical coordinates, slope and residuals');
  const lines = elements(svg.innerHTML, 'line');
  const circles = elements(svg.innerHTML, 'circle');
  assert.equal(lines.length, 4, 'zero line, slope line and both band edges are present');
  assert.equal(lines.filter(line => line['stroke-dasharray']).length, 2);
  assert.equal(circles.length, rows.length, 'all study points are present');
  return { lines, circles };
}

function assertInsidePlot({ lines, circles }) {
  function within(value, lo, hi, description) {
    const coordinate = Number(value);
    assert.ok(Number.isFinite(coordinate) && coordinate >= lo && coordinate <= hi,
      `${description}=${value} must be inside [${lo}, ${hi}]`);
  }
  for (const [i, line] of lines.entries()) {
    for (const endpoint of [1, 2]) {
      within(line[`x${endpoint}`], plot.left, plot.right, `line ${i} x${endpoint}`);
      within(line[`y${endpoint}`], plot.top, plot.bottom, `line ${i} y${endpoint}`);
    }
  }
  for (const [i, circle] of circles.entries()) {
    within(circle.cx, plot.left, plot.right, `study ${i} cx`);
    within(circle.cy, plot.top, plot.bottom, `study ${i} cy`);
  }
}

test('P11-R3 plant: negative effects keep both radial band edges inside the plot', t => {
  const rendered = render([-0.1, -0.1, -0.1]);
  t.diagnostic(`lower band endpoint y=${rendered.lines[3].y2}; plot bottom=258; SVG height=300`);
  assertInsidePlot(rendered);
});

test('P11-R3 control: positive effects keep both radial band edges inside the plot', () => {
  assertInsidePlot(render([0.1, 0.1, 0.1]));
});

test('P11-R3 plant: reflecting effects mirrors the band and study points around zero', () => {
  const positive = render([0.1, 0.1, 0.1]);
  const negative = render([-0.1, -0.1, -0.1]);
  function mirrored(a, b, x, y) {
    assert.equal(Number(a[x]), Number(b[x]), 'precision is unchanged');
    assert.ok(Math.abs(Number(a[y]) + Number(b[y]) - (plot.top + plot.bottom)) < 1e-10,
      `${y} coordinates ${a[y]} and ${b[y]} must reflect around the zero line`);
  }
  // A sign reflection swaps the upper and lower band edges.
  for (const [i, j] of [[0, 0], [1, 1], [2, 3], [3, 2]]) {
    for (const endpoint of [1, 2]) {
      mirrored(positive.lines[i], negative.lines[j], `x${endpoint}`, `y${endpoint}`);
    }
  }
  for (let i = 0; i < positive.circles.length; i++) {
    mirrored(positive.circles[i], negative.circles[i], 'cx', 'cy');
    assert.equal(positive.circles[i].fill, negative.circles[i].fill,
      'reflection preserves outlier classification');
  }
});

test('P11-R3 control: zero slope and extreme study points remain inside the plot', () => {
  assertInsidePlot(render([0, 0, 0]));
  assertInsidePlot(render([-5, 0, 5]));
});
