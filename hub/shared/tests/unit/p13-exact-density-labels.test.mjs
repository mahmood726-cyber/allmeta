import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import load from '../../../../gosh/tests/input-harness.cjs';
import engine from '../../../../gosh/exact-enum.js';

const pagePath = fileURLToPath(new URL('../../../../gosh/index.html', import.meta.url));
const controllerSource = readFileSync(new URL('../../../../gosh/exact-ui.js', import.meta.url), 'utf8');
const small = Array.from({ length: 16 }, (_, i) => (i + 1) / 100000);
const ordinary = Array.from({ length: 16 }, (_, i) => i / 10);
const input = effects => effects.map((te, i) => `${te}, 1, S${i + 1}`).join('\n');

// Execute the actual page and controller. Only DOM, shared UI and worker transport
// are stubbed; the real exact engine supplies the worker's completion message.
function page() {
  const h = load(pagePath), workers = [];
  function node() {
    return { style: {}, hidden: false, textContent: '', innerHTML: '', children: [],
      append(...xs) { this.children.push(...xs); }, replaceChildren(...xs) { this.children = xs; },
      addEventListener(event, fn) { this[event] = fn; } };
  }
  const el = id => h.nodes[id] ||= node();
  for (const id of ['exact-summary', 'exact-perstudy']) {
    Object.assign(el(id), { tBodies: [node()], tHead: node(), caption: node() });
  }
  class Worker {
    constructor() { workers.push(this); }
    postMessage(payload) { this.payload = payload; }
    terminate() { this.stopped = true; }
  }
  h.nodes['enum-mode'].value = 'exact';
  vm.runInNewContext(controllerSource, { window: h.window,
    document: { getElementById: el, createElement: node }, Worker, setTimeout, clearTimeout });
  return { ...h, workers };
}

function xLabels(svg) {
  const labels = [...svg.matchAll(/<text\b[^>]*\by="388"[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);
  assert.equal(labels.length, 3, 'three x-axis labels are present in the SVG');
  return labels;
}

function distinct(labels) {
  assert.equal(new Set(labels).size, 3, `distinct tick values need distinct labels: ${JSON.stringify(labels)}`);
  const values = labels.map(Number);
  assert.ok(values.every(Number.isFinite));
  assert.ok(values[0] < values[1] && values[1] < values[2], 'labels preserve tick order');
}

function preview(h, effects, axes) {
  const result = h.window.__almGoshValidationRun(input(effects), 'FE', 64, axes);
  assert.equal(result.summary.n_subsets, 64);
  return xLabels(h.nodes.plot.innerHTML);
}

function exact(h, effects) {
  h.run(input(effects));
  const worker = h.workers.at(-1);
  assert.ok(worker, 'the page requested exact enumeration');
  const res = engine.run(worker.payload.te, worker.payload.se, worker.payload.model);
  const before = JSON.stringify(res);
  worker.onmessage({ data: { type: 'done', id: worker.payload.id, result: res } });
  assert.equal(JSON.stringify(res), before, 'rendering does not mutate numerical results or grid counts');
  assert.equal(h.window._almLastGosh().n_subsets, 65535);
  const svg = h.nodes.plot.innerHTML;
  const cellCounts = [...svg.matchAll(/class="exact-cell" data-count="(\d+)"/g)].map(m => Number(m[1]));
  assert.deepEqual(cellCounts, Array.from(res.grid.counts).filter(n => n > 0));
  assert.equal(cellCounts.reduce((a, b) => a + b, 0), 65535);
  const exported = h.plotExport.plots[0].getSvg();
  assert.equal(exported, h.nodes.plot, 'plot export receives the displayed SVG');
  assert.equal(exported.innerHTML, svg);
  return xLabels(svg);
}

test('P13-R6 plant: 16-study small-scale exact FE density has distinct displayed and export SVG ticks', () => {
  distinct(exact(page(), small));
});

const ranges = [
  ['small fixed-decimal range', [0.00001, 0.00016]],
  ['negative scientific range', [-3e-7, -1e-7]],
  ['narrow range away from zero', [1.000001, 1.000003]],
];
for (const [name, x] of ranges) {
  test(`P13-R6 plant: exact ${name} uses the preview tick precision rule`, () => {
    const h = page(), expected = preview(h, small, { x });
    distinct(expected);
    const actual = exact(h, small);
    distinct(actual);
    assert.deepEqual(actual, expected);
  });
  test(`P13-R6 control: preview ${name} already distinguishes tick values`, () => {
    distinct(preview(page(), small, { x }));
  });
}

test('P13-R6 control: ordinary exact range keeps two decimals and all density counts', () => {
  assert.deepEqual(exact(page(), ordinary), ['-0.15', '0.75', '1.65']);
});

test('P13-R6 control: small-scale sampled preview already has distinct default ticks', () => {
  distinct(preview(page(), small));
});
