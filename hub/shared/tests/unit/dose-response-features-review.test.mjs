import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const text = html => html.replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]*>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// Execute the shipped parser, fit, renderer and feature adapter. Only DOM plumbing
// is stubbed; table cells are obtained from the HTML produced by the real renderer.
function load() {
  const html = read('dose-response-ma/index.html'), nodes = new Map();
  const document = {
    readyState: 'loading', addEventListener() {},
    getElementById: id => nodes.get(id),
    querySelectorAll: () => [...nodes.values()].filter(n => n.id.startsWith('f-'))
  };
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) {
    const listeners = {};
    nodes.set(id, {
      id, value: '', checked: false, innerHTML: '', options: [],
      get textContent() { return text(this.innerHTML); },
      set textContent(value) { this.innerHTML = value; },
      get rows() {
        return [...this.innerHTML.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(([, row]) => ({
          cells: [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)]
            .map(([, cell]) => ({ textContent: text(cell) }))
        }));
      },
      addEventListener(type, fn) { listeners[type] = fn; },
      click() { listeners.click?.(); }
    });
  }
  for (const [, id, body] of html.matchAll(/<select id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const node = nodes.get(id);
    node.options = [...body.matchAll(/<option value="([^"]+)"([^>]*)>/g)]
      .map(m => ({ value: m[1], selected: m[2].includes('selected') }));
    node.value = (node.options.find(o => o.selected) || node.options[0]).value;
  }
  const context = vm.createContext({ document, console });
  context.window = context;
  context.alm = { plotExport() {} };
  for (const path of ['shared/ma-core.js', 'shared/dose-response.js', 'hub/shared/analysis-lifecycle.js'])
    vm.runInContext(read(path), context);
  for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(script, context);
  for (const path of ['shared/alm-text.js', 'dose-response-ma/alm-features.js'])
    vm.runInContext(read(path), context);
  assert.ok(context._almLastDoseResponse(), nodes.get('msgs').textContent);
  return { context, nodes, spec: context.AlmDoseFeatures };
}

function records(nodes) {
  return nodes.get('f-data').value.split('\n').filter(l => l.trim() && !l.startsWith('#')).map(line => {
    const [study, dose, cases, n, yi, sei, type] = line.split(',').map(s => s.trim());
    return { study, dose: +dose, cases: +cases, n: +n, yi: +yi, sei: +sei, type };
  });
}

test('PLANTED: entry preserves literal quotation marks in study labels', () => {
  for (const label of ['"Study A"', 'Study "A"']) {
    const { context, nodes, spec } = load();
    const before = context._almLastDoseResponse(), rows = records(nodes);
    const original = rows[0].study;
    rows.forEach(r => { if (r.study === original) r.study = label; });
    spec.entry.apply(rows);
    const after = context._almLastDoseResponse();
    assert.equal(after.perStudy[0].id, label);
    assert.equal(after.k, before.k);
    assert.equal(after.slope, before.slope);
    assert.deepEqual(after.predictions, before.predictions);
  }
});

test('CONTROL: ordinary entry labels, counts and estimates round-trip unchanged', () => {
  const { context, nodes, spec } = load(), before = context._almLastDoseResponse();
  const rows = records(nodes);
  assert.equal(spec.entry.apply(rows).n, rows.length);
  assert.deepEqual(records(nodes), rows);
  assert.deepEqual(context._almLastDoseResponse(), before);
});

function report(context, spec) {
  const r = spec.text.results();
  const ctx = { app: 'dose-response-ma', build: { version: 'test', shortSha: 'abcdef0' }, entryLog: [], verify: null };
  const rendered = context.AlmText.render(spec.text.templates, r, ctx);
  const audit = context.AlmText.audit(rendered, r, { ctx, dom: spec.text.dom() });
  return { rendered, audit };
}

test('PLANTED: scientific-notation prediction cells preserve their values and pass the report audit', () => {
  for (const dose of ['-4000', '-12000']) {
    const { context, nodes, spec } = load();
    nodes.get('f-pdoses').value = dose;
    nodes.get('btn-run').click();
    assert.ok(context._almLastDoseResponse());
    const cells = nodes.get('pred-body').rows[1].cells;
    assert.match(cells[2].textContent, /e\+/);
    const { rendered, audit } = report(context, spec);
    assert.equal(audit.ok, true, JSON.stringify(audit.failures));
    for (const cell of cells)
      assert.ok(rendered.results.text.replace(/−/g, '-').includes(cell.textContent), cell.textContent);
  }
});

test('CONTROL: default report retains its snapshot and detects a perturbed coefficient', () => {
  const { context, spec } = load();
  const { rendered, audit } = report(context, spec);
  assert.equal(audit.ok, true, JSON.stringify(audit.failures));
  const snapshot = JSON.parse(read('hub/shared/tests/__snapshots__/text-dose-response-ma.json'));
  assert.equal(rendered.results.text, snapshot.results);
  assert.equal(rendered.plain.text, snapshot.plain);
  context.__almTextPerturb = { key: 'coef_0_1_0', delta: 0.1 };
  assert.ok(report(context, spec).audit.failures.some(f => f.check === 'dom:coef_0_1_0'));
});

test('PLANTED: report refuses an old fit after a silent change to any analysis input', () => {
  const { nodes, spec } = load();
  const before = spec.text.results();
  for (const [id, node] of nodes) {
    if (!id.startsWith('f-')) continue;
    const field = id === 'f-mod' ? 'checked' : 'value', value = node[field];
    node[field] = field === 'checked' ? !value : value + ' changed';
    assert.throws(() => spec.text.results(), /does not match the current inputs/, id);
    node[field] = value;
    assert.deepEqual(spec.text.results(), before, id + ' restored');
  }
});

test('CONTROL: report uses a successful refit and returns no results after a refused refit', () => {
  const { context, nodes, spec } = load();
  const before = spec.text.results();
  nodes.get('f-data').value = nodes.get('f-data').value.replace('-0.223144', '-0.323144');
  nodes.get('btn-run').click();
  const after = spec.text.results();
  assert.notEqual(after.coef_0_1_0, before.coef_0_1_0);
  assert.equal(after.coef_0_1_0, context._almLastDoseResponse().slope);
  assert.equal(report(context, spec).audit.ok, true);
  nodes.get('f-data').value = 'invalid';
  nodes.get('btn-run').click();
  assert.equal(spec.text.results(), null);
});
