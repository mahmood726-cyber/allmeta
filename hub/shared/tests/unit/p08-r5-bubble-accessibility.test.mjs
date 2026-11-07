import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('meta-regression/index.html', root), 'utf8');
const main = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(code => code.includes('const LS_KEY = "meta-regression-v1"'));
assert.ok(main, 'the test must execute the real main application script');
const decode = text => text.replace(/&(amp|lt|gt|quot|apos);/g,
  (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[name]);
const encode = text => String(text).replace(/[&<>"']/g,
  char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)]
    .map(([, name, value]) => [name, decode(value)]));
}

// Only the SVG DOM operations used by the real shared SVG exporter are needed.
// Children remain serialized; CSS style computation and browser accessibility
// tree construction are outside this node:test harness.
class SvgNode {
  constructor(markup) {
    const match = markup.match(/<(svg|rect)\b([^>]*)>([\s\S]*)<\/\1>$/);
    assert.ok(match, 'expected a serialized SVG element');
    this.localName = match[1];
    this.attrs = attributes(match[2]);
    this.content = match[3];
  }
  getAttribute(name) { return this.attrs[name] ?? null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  removeAttribute(name) { delete this.attrs[name]; }
  cloneNode() { return new SvgNode(this.outerHTML); }
  querySelectorAll(selector) { assert.equal(selector, '*'); return []; }
  get firstChild() { return null; }
  insertBefore(node) { this.content = node.outerHTML + this.content; }
  get outerHTML() {
    const attrs = Object.entries(this.attrs).map(([k, v]) => ` ${k}="${encode(v)}"`).join('');
    return `<${this.localName}${attrs}>${this.content}</${this.localName}>`;
  }
}

function app(state) {
  const elements = new Map([...html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)]
    .map(([tag, id]) => [id, {
      value: attributes(tag).value || '', checked: false, innerHTML: '', listeners: {},
      classList: { add() {}, remove() {} },
      addEventListener(type, listener) { this.listeners[type] = listener; }
    }]));
  let exportOptions;
  const document = {
    getElementById(id) { assert.ok(elements.has(id), `missing element ${id}`); return elements.get(id); },
    querySelector(selector) {
      assert.equal(selector, '#svg-host svg');
      return new SvgNode(elements.get('svg-host').innerHTML);
    },
    createElementNS(namespace, name) {
      assert.equal(namespace, 'http://www.w3.org/2000/svg');
      assert.equal(name, 'rect');
      return new SvgNode('<rect></rect>');
    }
  };
  const window = { alm: {
    analysisLifecycle: render => render,
    plotExport(options) { exportOptions = options; }
  } };
  const context = vm.createContext({ window, document, Blob, console,
    XMLSerializer: class { serializeToString(node) { return node.outerHTML; } },
    localStorage: { getItem: () => state ? JSON.stringify(state) : null, setItem() {} }
  });
  vm.runInContext(main, context, { filename: 'meta-regression/index.html (main script)' });
  assert.ok(exportOptions, 'the actual app must register its bubble export');
  return {
    window, context, exportOptions,
    get svg() { return elements.get('svg-host').innerHTML; },
    get stats() { return elements.get('stats-wrap').innerHTML; },
    update(values) {
      for (const [field, value] of Object.entries(values)) elements.get(`f-${field}`).value = value;
      elements.get('btn-run').listeners.click();
    }
  };
}

function imageName(svg) {
  const opening = svg.match(/<svg\b[^>]*>/)?.[0];
  assert.ok(opening, 'a bubble SVG must be generated');
  const attrs = attributes(opening);
  assert.equal(attrs.role, 'img', 'main bubble SVG must expose an image role');
  const title = svg.match(/<title\b[^>]*>([^<]*)<\/title>/);
  assert.ok(title, 'the standalone SVG must include a text title');
  const name = attrs['aria-label'] || decode(title[1]);
  assert.ok(name.trim(), 'main bubble SVG must have a nonempty accessible name');
  return { name, title: decode(title[1]) };
}

test('P08-R5 plant: rendered bubble plot names the moderator, effect and confidence band', () => {
  const h = app();
  assert.match(h.svg, /<polygon\b/);
  const { name, title } = imageName(h.svg);
  for (const text of ['Bubble plot', 'Baseline LVEF (%)', 'Effect (logOR)', '95% confidence band']) {
    assert.ok(name.includes(text), `accessible name must describe ${text}`);
    assert.ok(title.includes(text), `SVG title must describe ${text}`);
  }
  assert.match(name, /fitted regression line/i);
});

test('P08-R5 plant: rerendered names escape custom labels and use empty-label fallbacks', () => {
  const h = app();
  const values = { title: 'Trial "A" & <B>', modlabel: 'Dose <5 & "high"', effectlabel: "Effect >0 & 'risk'" };
  h.update(values);
  const custom = imageName(h.svg);
  for (const value of Object.values(values)) {
    assert.ok(custom.name.includes(value), 'accessible name must reflect current display labels');
    assert.ok(custom.title.includes(value), 'SVG title must retain escaped display labels');
  }
  assert.doesNotMatch(h.svg, /<B>|<5/);
  h.update({ title: '', modlabel: '', effectlabel: '' });
  const fallback = imageName(h.svg);
  assert.match(fallback.name, /Effect/);
  assert.match(fallback.name, /Moderator/);
  assert.match(fallback.name, /95% confidence band/);
  assert.ok(!fallback.name.includes(values.title), 'rerender must replace the old name');
});

test('P08-R5 plant: an unfittable bubble plot is named without claiming a confidence band', () => {
  const h = app();
  h.update({ data: 'A, 0.1, 0.1, 5\nB, 0.2, 0.1, 5\nC, 0.3, 0.1, 5' });
  assert.equal(h.window._almLastFitted(), null);
  assert.doesNotMatch(h.svg, /<polygon\b|<polyline\b/);
  const { name, title } = imageName(h.svg);
  assert.match(name, /Bubble plot/);
  assert.match(name, /Baseline LVEF/);
  assert.match(name, /Effect/);
  assert.doesNotMatch(name + title, /confidence band|fitted regression line/i);
});

test('P08-R5 plant: shared SVG export preserves the image name and title, including receipt stamping', async () => {
  const h = app();
  const exporter = readFileSync(new URL('hub/shared/plot-export.js', root), 'utf8');
  const hook = '  const panelContracts = new WeakMap();';
  assert.ok(exporter.includes(hook));
  // Expose the real artifact function only in the test VM, without changing it.
  vm.runInContext(exporter.replace(hook, `  window.exportArtifact = artifact;\n${hook}`), h.context);
  vm.runInContext(readFileSync(new URL('shared/truthcert-export.js', root), 'utf8'), h.context);
  const stampSVG = h.window.AlmTruthCertExport.stampSVG;
  let receipts = 0;
  h.window.AlmTruthCertExport = {
    async buildReceipt(input) {
      assert.equal(input.studies.length, 8);
      receipts++;
      return { signed: false, manifest: { label: input.label } };
    },
    stampSVG
  };
  const original = h.svg;
  for (const stamped of [false, true]) {
    const blob = await h.window.exportArtifact(h.exportOptions.plots[0], 'svg', 300, 170,
      stamped ? h.exportOptions.getReceiptInput : undefined);
    assert.equal(blob.type, 'image/svg+xml');
    const exported = await blob.text();
    assert.deepEqual(imageName(exported), imageName(original));
    assert.equal(exported.includes('<metadata id="truthcert">'), stamped);
    assert.match(exported, /viewBox="-12 -12 744 544"/);
    assert.match(exported, /<polygon\b/);
    assert.equal(h.svg, original, 'export must not mutate the preview');
  }
  assert.equal(receipts, 1);
});

test('P08-R5 control: existing input and live-status accessibility remains present', () => {
  const textarea = attributes(html.match(/<textarea\b[^>]*id="f-data"[^>]*>/)[0]);
  const status = attributes(html.match(/<div\b[^>]*id="analysis-status"[^>]*>/)[0]);
  assert.equal(textarea['aria-label'], 'Studies');
  assert.equal(status.role, 'status');
  assert.equal(status['aria-live'], 'polite');
});

test('P08-R5 control: example fit, bubbles, visible labels and confidence geometry remain intact', t => {
  const h = app();
  assert.equal(h.window._almLastStudies().length, 8);
  assert.ok(Number.isFinite(h.window._almLastFitted().fit.b1));
  assert.equal((h.svg.match(/<circle\b/g) || []).length, 8);
  assert.equal((h.svg.match(/<polygon\b/g) || []).length, 1);
  assert.equal((h.svg.match(/<polyline\b/g) || []).length, 1);
  assert.match(h.svg, /<text\b[^>]*>Baseline LVEF \(%\)<\/text>/);
  assert.match(h.svg, /<text\b[^>]*>Effect \(logOR\)<\/text>/);
  const visualSvg = h.svg.replace(/<title\b[^>]*>[\s\S]*?<\/title>/g, '')
    .replace(/ (?:role|aria-label|aria-labelledby)="[^"]*"/g, '');
  const content = JSON.stringify({ svg: visualSvg, stats: h.stats,
    fit: h.window._almLastFitted(), hk: h.window._almLastHK(), qe: h.window._almLastQE() });
  const digest = createHash('sha256').update(content).digest('hex');
  t.diagnostic('Example geometry/statistics SHA256: ' + digest);
  // Captured from the unchanged production app in the pass-1 wrapper run.
  assert.equal(digest, '433aec5186a3f31341562c0e43f50f184c6e2baeafd22fc0ad453dc8182389af',
    'accessible metadata must not change the example plot or statistics');
});
