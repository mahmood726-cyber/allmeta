import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Execute the actual primary and sensitivity engines; stub only DOM plumbing.
const root = new URL('../../../../', import.meta.url);
function fixture() {
  const html = readFileSync(new URL('limit-ma/index.html', root), 'utf8'), nodes = {};
  function node() {
    let content = '';
    return { value: '', attrs: {}, dataset: {}, style: {}, parentNode: {}, children: [], checked: true,
      get innerHTML() { return content + this.children.map(n => typeof n === 'string' ? n : n.innerHTML).join(''); },
      set innerHTML(v) { content = v; this.children = []; },
      get textContent() { return this.innerHTML; }, set textContent(v) { this.innerHTML = v; },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { content = ''; this.children = children; },
      querySelectorAll() { return []; },
      addEventListener(event, fn) { this[event] = fn; },
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } };
  }
  for (const m of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    const n = nodes[m[1]] = node();
    n.value = m[0].match(/\bvalue="([^"]*)"/)?.[1] || '';
  }
  nodes.src.value = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1];
  const document = { getElementById: id => nodes[id], querySelectorAll: () => [],
    createElement: node, createElementNS: node, createTextNode: text => text };
  const noop = () => {};
  const alm = { analysisLifecycle: run => run, csvUpload: noop, plotExport: noop,
    axisControls: noop, resultsExport: noop, resetUndo: noop, tooltips: noop,
    urlState: Object.assign(noop, { read: () => null }) };
  const w = vm.createContext({ document, alm, structuredClone, console, AlmFeaturesState: { entryLog: [] } });
  w.window = w;
  vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], w);
  for (const file of ['shared/ma-core.js', 'shared/trimfill.js', 'shared/selmodel.js',
    'limit-ma/plus-opt.js', 'limit-ma/plus-selmodel.js', 'limit-ma/plus.js',
    'limit-ma/plus-ui.js', 'limit-ma/alm-features.js']) {
    vm.runInContext(readFileSync(new URL(file, root), 'utf8'), w, { filename: file });
  }
  return { w, nodes, apply: w.AlmLimitFeatures.entry.apply };
}
const rows = [.1, .2, .3].map((yi, i) => ({ study: 'New ' + i, yi, sei: .2 + i * .1 }));
const plain = value => JSON.parse(JSON.stringify(value));
const plusIds = ['plus-body', 'plus-details', 'plus-forest', 'plus-funnel', 'plus-interpretation', 'plus-status'];
const shownPlus = h => plusIds.map(id => h.nodes[id].innerHTML);
function seed(h) {
  h.w.AlmLimitPlusUI.run();
  assert.ok(h.w.AlmLimitPlusUI.snapshot());
  assert.match(h.nodes['plus-status'].textContent, /complete/);
  assert.ok(h.nodes['plus-body'].innerHTML);
}

test('limit entry clears sensitivity results from the previous studies after a successful import', () => {
  const h = fixture(); seed(h);
  const old = h.w._almLastLimit().limit_est;
  assert.deepEqual(plain(h.apply(rows)), { ok: true, n: 3 });
  assert.equal(h.w._almLastLimit().k, 3);
  assert.notEqual(h.w._almLastLimit().limit_est, old);
  assert.equal(h.w.AlmLimitPlusUI.snapshot(), null);
  for (const id of plusIds.slice(0, -1)) assert.equal(h.nodes[id].innerHTML, '', id);
  assert.doesNotMatch(h.nodes['plus-status'].textContent, /complete/);
  // Control: explicit sensitivity calculation uses the newly imported studies.
  seed(h);
  assert.deepEqual(plain(h.w.AlmLimitPlusUI.snapshot().c.te), rows.map(r => r.yi));
});

test('limit entry restores completed sensitivity results when finite inputs cannot be fitted', () => {
  const h = fixture(); seed(h);
  const main = plain(h.w.__almLimitValidationSnapshot());
  const plus = plain(h.w.AlmLimitPlusUI.snapshot()), shown = shownPlus(h);
  const extreme = rows.map(r => ({ ...r, yi: 1e308 }));
  assert.throws(() => h.apply(extreme), /numerically undefined/);
  assert.deepEqual(plain(h.w.__almLimitValidationSnapshot()), main);
  assert.deepEqual(plain(h.w.AlmLimitPlusUI.snapshot()), plus);
  assert.deepEqual(shownPlus(h), shown);
});

test('limit entry controls: invalid rows preserve sensitivity and valid rows work without prior sensitivity', () => {
  const h = fixture(); seed(h);
  const main = plain(h.w.__almLimitValidationSnapshot()), plus = plain(h.w.AlmLimitPlusUI.snapshot());
  const shown = shownPlus(h);
  assert.throws(() => h.apply(rows.map(r => ({ ...r, sei: -1 }))), /positive standard error/);
  assert.deepEqual(plain(h.w.__almLimitValidationSnapshot()), main);
  assert.deepEqual(plain(h.w.AlmLimitPlusUI.snapshot()), plus);
  assert.deepEqual(shownPlus(h), shown);
  const fresh = fixture();
  assert.equal(fresh.w.AlmLimitPlusUI.snapshot(), null);
  assert.deepEqual(plain(fresh.apply(rows)), { ok: true, n: 3 });
  assert.equal(fresh.w._almLastLimit().k, 3);
  assert.equal(fresh.w.AlmLimitPlusUI.snapshot(), null);
});
