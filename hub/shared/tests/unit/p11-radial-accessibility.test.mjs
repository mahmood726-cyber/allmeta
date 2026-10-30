import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('influence/index.html', root), 'utf8');
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).find(s => s.includes('function drawRadial(rows)'));
assert.ok(script, 'Exercise the real influence page script');
const mixed = '4, 1, A\n4, 1, B\n0, 1, C\n-4, 1, D\n-4, 1, E';
const balanced = '0, 1, F\n0, 1, G\n0, 1, H';

// Small DOM surface for the actual inline application and its numerical engines.
// This checks generated markup and state transitions, not a browser accessibility tree.
function harness(input = mixed) {
  const nodes = new Map();
  for (const m of html.matchAll(/<[a-z][\w-]*\b[^>]*\bid="([^"]+)"[^>]*>/gi)) {
    const attrs = Object.fromEntries([...m[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]]));
    nodes.set(m[1], {
      innerHTML: '', textContent: '', value: '', hidden: /\bhidden\b/.test(m[0]), disabled: false,
      attrs, listeners: {},
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return this.attrs[k] ?? null; },
      addEventListener(k, f) { this.listeners[k] = f; },
      classList: { toggle() {}, contains() { return false; } },
    });
  }
  nodes.get('src').value = input;
  const saved = new Map();
  const context = vm.createContext({
    document: {
      getElementById: id => nodes.get(id) ?? null,
      querySelectorAll: () => [], querySelector: () => null,
    },
    localStorage: {
      getItem: k => saved.get(k) ?? null,
      setItem: (k, v) => saved.set(k, String(v)), removeItem: k => saved.delete(k),
    },
    structuredClone,
    alm: { analysisLifecycle: fn => fn },
  });
  context.window = context;
  for (const file of ['shared/ma-core.js', 'shared/diagnostic-plots.js', 'influence/influence-extra.js']) {
    vm.runInContext(readFileSync(new URL(file, root), 'utf8'), context, { filename: file });
  }
  vm.runInContext(script, context, { filename: 'influence/index.html' });
  return {
    context, nodes,
    markup: id => nodes.get(id)?.innerHTML ?? '',
    run(value) { nodes.get('src').value = value; nodes.get('btn-run').listeners.click(); },
  };
}

const text = markup => markup.replace(/<[^>]*>/g, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<')
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const rows = markup => [...markup.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
  .map(m => [...m[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/g)].map(c => text(c[1])))
  .filter(c => c.length === 3 && c[0] !== 'Study');
const point = (markup, i) => markup.match(new RegExp(`<g data-i="${i}">([\\s\\S]*?)</g>`))?.[1] ?? '';

test('P11-R6 plant: radial table exposes FE residuals and outlier identities independently of RE influence', () => {
  const h = harness();
  assert.equal(h.context._almLastDiag()[0].influential, false, 'A is a radial outlier without an RE influence flag');
  const table = h.markup('radial-summary');
  assert.match(table, /<table\b/, 'A visible semantic table must accompany the radial SVG');
  assert.match(table, /<caption>[\s\S]*fixed-effect[\s\S]*<\/caption>/i);
  assert.match(text(table), /absolute.*residual.*> 2/i);
  assert.equal((table.match(/<th scope="col">/g) ?? []).length, 3);
  assert.equal((table.match(/<th scope="row">/g) ?? []).length, 5);
  assert.deepEqual(rows(table), [
    ['A', '4.000', 'Outlier'], ['B', '4.000', 'Outlier'], ['C', '0.000', 'Not an outlier'],
    ['D', '-4.000', 'Outlier'], ['E', '-4.000', 'Outlier'],
  ]);
});

test('P11-R6 plant: radial SVG has a linked FE description and study-specific residual/status titles', () => {
  const h = harness(), svg = h.markup('radial-plot');
  const descriptionId = h.nodes.get('radial-plot').getAttribute('aria-describedby');
  assert.ok(descriptionId, 'The image must reference its useful description');
  const description = svg.match(new RegExp(`<desc id="${descriptionId}">([\\s\\S]*?)</desc>`))?.[1];
  assert.ok(description, 'aria-describedby must resolve to the rendered SVG description');
  assert.match(text(description), /fixed-effect/i);
  assert.match(text(description), /residual.*> 2/i);
  assert.match(text(description), /table/i);
  for (const [i, label, residual, status] of [[0, 'A', '4.000', 'Outlier'], [2, 'C', '0.000', 'Not an outlier'], [3, 'D', '-4.000', 'Outlier']]) {
    const title = text(point(svg, i).match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
    assert.ok(title.includes(label) && title.includes(residual) && title.includes(status), title);
  }
});

test('P11-R6 plant: textual status uses the strict unrounded FE residual threshold on both sides', () => {
  const h = harness('-2, 1, Lower\n0, 1, Centre\n2, 1, Upper');
  assert.deepEqual(rows(h.markup('radial-summary')), [
    ['Lower', '-2.000', 'Not an outlier'], ['Centre', '0.000', 'Not an outlier'], ['Upper', '2.000', 'Not an outlier'],
  ]);
  h.run('-2.0001, 1, Lower\n0, 1, Centre\n2.0001, 1, Upper');
  assert.deepEqual(rows(h.markup('radial-summary')), [
    ['Lower', '-2.000', 'Outlier'], ['Centre', '0.000', 'Not an outlier'], ['Upper', '2.000', 'Outlier'],
  ]);
});

test('P11-R6 plant: study names remain escaped in the new table and SVG titles', () => {
  const label = 'A <img src=x onerror=alert(1)> & "quoted"';
  const h = harness(mixed.replace('4, 1, A', `4, 1, ${label}`));
  const table = h.markup('radial-summary'), svg = h.markup('radial-plot');
  assert.equal(rows(table)[0]?.[0], label);
  for (const markup of [table, svg]) {
    assert.doesNotMatch(markup, /<img\b/);
    assert.ok(markup.includes('A &lt;img src=x onerror=alert(1)&gt; &amp; &quot;quoted&quot;'));
  }
});

test('P11-R6 plant: reruns replace the radial text and refused input clears it with the plot', () => {
  const h = harness();
  assert.equal(rows(h.markup('radial-summary')).length, 5);
  h.run(balanced);
  assert.deepEqual(rows(h.markup('radial-summary')), [
    ['F', '0.000', 'Not an outlier'], ['G', '0.000', 'Not an outlier'], ['H', '0.000', 'Not an outlier'],
  ]);
  h.run('invalid');
  assert.equal(h.markup('radial-summary'), '');
  assert.equal(h.markup('radial-plot'), '');
  assert.equal(h.context.__almRadial, null);
});

test('P11-R6 plant: validation snapshot restores radial text and plot together', () => {
  const h = harness(), summary = h.markup('radial-summary'), svg = h.markup('radial-plot');
  assert.equal(rows(summary).length, 5);
  h.nodes.get('src').value = balanced; // Unsubmitted edit must survive validation too.
  const snapshot = h.context.__almInfluenceValidationSnapshot();
  h.run(balanced);
  assert.notEqual(h.markup('radial-summary'), summary);
  h.context.__almInfluenceValidationRestore(snapshot);
  assert.equal(h.markup('radial-summary'), summary);
  assert.equal(h.markup('radial-plot'), svg);
  assert.equal(h.nodes.get('src').value, balanced);
});

test('P11-R6 control: existing FE radial coordinates and visual threshold remain unchanged', () => {
  const h = harness();
  assert.equal(h.context.__almRadial.slope, 0);
  assert.deepEqual(Array.from(h.context.__almRadial.resid), [4, 4, 0, -4, -4]);
  for (const [input, fill] of [
    ['-2, 1, Lower\n0, 1, Centre\n2, 1, Upper', 'var(--accent)'],
    ['-2.0001, 1, Lower\n0, 1, Centre\n2.0001, 1, Upper', 'var(--warn)'],
  ]) {
    h.run(input);
    for (const i of [0, 2]) assert.ok(point(h.markup('radial-plot'), i).includes(`fill="${fill}"`));
    assert.ok(point(h.markup('radial-plot'), 1).includes('fill="var(--accent)"'));
  }
});

test('P11-R6 control: RE influential studies retain table text and diamond markers', () => {
  const initial = html.match(/<textarea id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];
  const h = harness(initial), diag = h.context._almLastDiag();
  assert.ok(diag.some(d => d.influential));
  assert.ok(diag.some(d => !d.influential));
  const tableRows = [...h.markup('body').matchAll(/<tr[^>]*data-i="\d+"[^>]*>([\s\S]*?)<\/tr>/g)];
  diag.forEach((d, i) => {
    const plotPoint = point(h.markup('influence-plot'), i);
    if (d.influential) {
      assert.match(plotPoint, /<path\b/);
      assert.match(plotPoint, /\(influential\)/);
      assert.match(tableRows[i][1], /class="infl-yes">Yes/);
    } else {
      assert.match(plotPoint, /<circle\b/);
      assert.doesNotMatch(plotPoint, /\(influential\)/);
      assert.match(tableRows[i][1], />No<\/td>/);
    }
  });
});
