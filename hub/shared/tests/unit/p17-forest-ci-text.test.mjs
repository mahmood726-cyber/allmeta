import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('correlation-ma/index.html');
const text = markup => markup.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const attrs = markup => Object.fromEntries(Array.from(markup.matchAll(/([\w:-]+)\s*=\s*(['"])(.*?)\2/g), m => [m[1], m[3]]));
const rows = markup => Array.from(markup.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g), m =>
  Array.from(m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g), c => text(c[1])));
const data = 'Alpha, .2, 40\nBeta, -.4, 70\nGamma, .65, 25\nDelta, .05, 120';

// Execute the actual page, statistical core and plus UI. The small DOM sink captures
// generated markup and input events; it does not simulate an accessibility tree.
function page() {
  const nodes = new Map(), timers = new Map();
  let nextTimer = 0;
  class Element {
    constructor(attributes = {}) { this.attributes = attributes; this.listeners = {}; this.value = ''; this.disabled = false; this.markup = ''; }
    set innerHTML(value) {
      this.markup = value;
      register(value);
      const svg = value.match(/<svg\b[^>]*>/);
      this.svg = svg ? new Element(attrs(svg[0])) : null;
    }
    get innerHTML() { return this.markup; }
    set textContent(value) { this.markup = value; }
    get textContent() { return text(this.markup); }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
    dispatch(type) { for (const fn of this.listeners[type] ?? []) fn({ target: this }); }
  }
  function register(markup) {
    for (const match of markup.matchAll(/<[a-z][^>]*\bid=['"][^'"]+['"][^>]*>/gi)) {
      const a = attrs(match[0]);
      if (!nodes.has(a.id)) nodes.set(a.id, new Element(a));
    }
  }
  register(html);
  nodes.get('f-method').value = 'REML';
  const document = {
    readyState: 'complete', getElementById: id => nodes.get(id) ?? null,
    querySelector: selector => {
      assert.equal(selector, '#forest-host svg');
      return nodes.get('forest-host').svg;
    },
    querySelectorAll: () => [],
  };
  const window = {};
  const context = vm.createContext({ window, document, matchMedia: () => ({ matches: false }),
    setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout: id => timers.delete(id),
    MutationObserver: class { observe() {} },
  });
  const run = path => vm.runInContext(read(path), context, { filename: path });
  run('shared/ma-core.js');
  const inline = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g)).find(m => m[1].includes('var EXAMPLE'));
  assert.ok(inline, 'real main-page script is present');
  vm.runInContext(inline[1], context, { filename: 'correlation-ma/index.html' });
  run('correlation-ma/plus-core.js');
  run('correlation-ma/plus-ui.js');
  function flush() {
    let count = 0;
    while (timers.size) {
      assert.ok(count++ < 100, 'UI timers settle');
      const [id, fn] = timers.entries().next().value;
      timers.delete(id); fn();
    }
  }
  flush();
  return { window, nodes,
    setData(value) { nodes.get('f-data').value = value; nodes.get('f-data').dispatch('input'); flush(); },
    setMethod(value) { nodes.get('f-method').value = value; nodes.get('f-method').dispatch('change'); flush(); },
    leaveOneOut() { nodes.get('alm-plus-loo-btn').dispatch('click'); flush(); },
  };
}

// Read the plotted endpoints, using the SVG's own -1 and +1 tick positions to
// invert its linear r axis. No statistical reference values are hard-coded.
function plottedIntervals(markup) {
  const ticks = Array.from(markup.matchAll(/<text\b([^>]*)>(-?1)<\/text>/g), m => [Number(m[2]), Number(attrs(m[1]).x)]);
  const min = ticks.find(t => t[0] === -1)?.[1], max = ticks.find(t => t[0] === 1)?.[1];
  assert.ok(Number.isFinite(min) && max > min, 'forest has an r-scale axis');
  const r = x => ((Number(x) - min) / (max - min) * 2 - 1).toFixed(3);
  return Array.from(markup.matchAll(/<line\b[^>]*>/g), m => attrs(m[0]))
    .filter(a => a.stroke === '#6aa6d4').map(a => [r(a.x1), r(a.x2)]);
}

function assertStudyText(p) {
  const tableRows = rows(p.nodes.get('res-body').innerHTML);
  const intervals = plottedIntervals(p.nodes.get('forest-host').innerHTML);
  const studies = p.window._almLastCorrMA().studies;
  assert.equal(intervals.length, studies.length);
  assert.equal(tableRows.length, studies.length + 1);
  for (let i = 0; i < studies.length; i++) {
    assert.equal(tableRows[i][0], studies[i].label);
    assert.ok(tableRows[i].includes(`[${intervals[i].join(', ')}]`),
      `${studies[i].label}: text table must expose both plotted 95% CI bounds [${intervals[i].join(', ')}]; got ${tableRows[i].join(' | ')}`);
  }
  const table = html.match(/<table\b[^>]*>[\s\S]*?<tbody id="res-body">/);
  assert.ok(table);
  assert.match(table[0], /<th\b[^>]*scope=['"]col['"][^>]*>95% CI \(r\)<\/th>/);
}

test('plant P17-R5: every main-forest study has text for both plotted CI bounds', () => {
  const p = page(); p.setData(data); assertStudyText(p);
});

test('plant P17-R5: the main forest is associated with its labelled CI table', () => {
  const p = page(); p.setData(data);
  const svg = p.nodes.get('forest-host').svg;
  assert.equal(svg.getAttribute('role'), 'img');
  const ids = (svg.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  const table = html.match(/<table\b([^>]*)>([\s\S]*?)<tbody id="res-body">/);
  assert.ok(table);
  assert.ok(ids.includes(attrs(table[1]).id), 'forest must reference the study table');
  assert.match(text(table[2].match(/<caption>([\s\S]*?)<\/caption>/)?.[1] ?? ''), /Forest.*95%.*r scale/i);
});

test('plant P17-R5: CI text follows the example, data edits and estimator changes', () => {
  const p = page(); assertStudyText(p);
  p.setData(data); assertStudyText(p);
  for (const method of ['FE', 'DL', 'PM', 'REML']) { p.setMethod(method); assertStudyText(p); }
  p.setData('New <study> & label, -.7, 45\nSecond, .1, 90'); assertStudyText(p);
  assert.doesNotMatch(p.nodes.get('res-body').innerHTML, /Alpha|Beta|Gamma|Delta/);
});

test('control: main-forest pooled label and headline retain the computed estimate and CI', () => {
  const p = page(); p.setData(data);
  const last = p.window._almLastCorrMA();
  const expected = `${last.r.toFixed(3)} [${last.r_lo.toFixed(3)}, ${last.r_hi.toFixed(3)}]`;
  assert.ok(p.nodes.get('headline').textContent.includes(expected));
  assert.ok(p.nodes.get('forest-host').svg.getAttribute('aria-label').includes(expected));
  const pooled = rows(p.nodes.get('res-body').innerHTML).at(-1);
  assert.deepEqual(pooled.slice(0, 5), ['Pooled', last.r.toFixed(3), '—', last.mu_z.toFixed(3), '100%']);
  assert.deepEqual(Object.keys(last.studies[0]), ['label', 'r', 'n']);
});

test('control: leave-one-out retains a text CI for every omission', () => {
  const p = page(); p.setData(data); p.leaveOneOut();
  const loo = p.window._almCorrPlus().loo;
  const tableRows = rows(p.nodes.get('alm-plus-loo').innerHTML).slice(1);
  assert.equal(tableRows.length, loo.rows.length);
  for (let i = 0; i < loo.rows.length; i++) {
    const r = loo.rows[i];
    assert.equal(tableRows[i][0], r.omitted);
    assert.equal(tableRows[i][1], `${r.r.toFixed(3)} [${r.r_lo.toFixed(3)}, ${r.r_hi.toFixed(3)}]`);
  }
});

test('control: clear and singleton inputs remove previous study rows and forest', () => {
  const p = page();
  for (const invalid of ['', 'Only, .2, 40']) {
    p.setData(data); p.setData(invalid);
    assert.equal(p.nodes.get('res-body').innerHTML, '');
    assert.equal(p.nodes.get('forest-host').innerHTML, '');
    assert.equal(p.window._almLastCorrMA(), null);
  }
});

test('control: study labels remain escaped in table and forest markup', () => {
  const p = page(); p.setData('A <b> & C, .2, 40\nSecond, -.3, 80');
  for (const id of ['res-body', 'forest-host']) {
    assert.ok(p.nodes.get(id).innerHTML.includes('A &lt;b&gt; &amp; C'));
    assert.doesNotMatch(p.nodes.get(id).innerHTML, /<b>/);
  }
});
