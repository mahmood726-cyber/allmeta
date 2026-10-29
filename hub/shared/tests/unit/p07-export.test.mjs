import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('multilevel-ma/index.html');
const pageScript = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(source => source.includes('window._almLastMlma ='));
assert.ok(pageScript, 'Exercise the actual standalone app script');
const numericKeys = [
  'k', 'J', 'mu', 'seMu', 'ci_lb_z', 'ci_ub_z', 'seMuHK', 'ci_lb_hk',
  'ci_ub_hk', 'pi_lb', 'pi_ub', 'tau2_study', 'tau2_within',
  'I2_study', 'I2_within', 'I2_sampling',
];
const formats = ['json', 'csv', 'md', 'report-md', 'report-txt'];
const editedInput = 'A, -0.5, 0.1, first\nA, 0.7, 0.2, second\n' +
  'B, 0.2, 0.15, first\nB, 1.4, 0.25, second\nC, 1.1, 0.3, only';
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Minimal DOM for the real page, engines and download handlers; no browser,
// network, saved fit or replacement export implementation is involved.
function loadPage() {
  const downloads = [], blobs = new Map();
  let nextBlob = 0, plotOptions;
  function element(id = '') {
    const listeners = new Map(), children = new Map();
    return {
      id, value: '', innerHTML: '', textContent: '', hidden: false,
      addEventListener(type, fn) { listeners.set(type, fn); },
      click() {
        if (this.download) downloads.push({ name: this.download, blob: blobs.get(this.href) });
        return listeners.get('click')?.();
      },
      setAttribute(key, value) { this[key] = value; },
      appendChild() {}, removeChild() {},
      querySelector(selector) {
        const action = selector.match(/^\[data-action="([^"]+)"\]$/)?.[1];
        assert.ok(action && this.innerHTML.includes(`data-action="${action}"`), selector);
        if (!children.has(action)) children.set(action, element(action));
        return children.get(action);
      },
    };
  }
  const ids = new Map(['src', 'btn-run', 'summary', 'body', 'forest',
    'analysis-status', 'analysis-stale', 'alm-export-mount'].map(id => [id, element(id)]));
  ids.get('src').value = html.match(/<textarea\b[^>]*id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];
  const textNode = markup => ({ textContent: markup.replace(/<[^>]*>/g, ' ') });
  const header = html.match(/<header>([\s\S]*?)<\/header>/)[1];
  const copy = new Map([
    ['h1', textNode(header.match(/<h1>([\s\S]*?)<\/h1>/)[1])],
    ['header p', textNode(header.match(/<p>([\s\S]*?)<\/p>/)[1])],
    ['footer', textNode(html.match(/<footer>([\s\S]*?)<\/footer>/)[1])],
  ]);
  const document = {
    title: 'Multi-level MA', head: element(), body: element(),
    createElement: () => element(), addEventListener() {},
    getElementById(id) { assert.ok(ids.has(id), `Unexpected element: ${id}`); return ids.get(id); },
    querySelector(selector) { return selector.startsWith('#') ? ids.get(selector.slice(1)) : copy.get(selector) || null; },
    querySelectorAll(selector) { assert.equal(selector, '#src'); return [ids.get('src')]; },
  };
  const urlState = Object.assign(() => {}, { read: () => ({}), write() {} });
  const context = vm.createContext({
    document, Blob, console, setTimeout: fn => fn(),
    URL: {
      createObjectURL(blob) { const url = `blob:test-${++nextBlob}`; blobs.set(url, blob); return url; },
      revokeObjectURL(url) { blobs.delete(url); },
    },
    alm: {
      csvUpload() {}, axisControls() {}, tooltips() {}, urlState,
      resetUndo: Object.assign(() => {}, { snapshot() {} }),
      plotExport(opts) { plotOptions = opts; },
    },
  });
  context.window = context;
  for (const path of ['shared/ma-core.js', 'shared/multilevel-reml.js', 'shared/stats-qt.js',
    'hub/shared/analysis-lifecycle.js', 'hub/shared/results-export.js']) {
    vm.runInContext(read(path), context, { filename: path });
  }
  vm.runInContext(pageScript, context, { filename: 'multilevel-ma/index.html' });
  return {
    context, ids,
    results: () => clone(context._almLastMlma()),
    reml: () => clone(context.__almReml()),
    receipt: () => clone(plotOptions.getReceiptInput()),
    run(input) { ids.get('src').value = input; ids.get('btn-run').click(); },
    async download(action) {
      const before = downloads.length;
      await ids.get('alm-export-mount').querySelector(`[data-action="${action}"]`).click();
      assert.equal(downloads.length, before + 1, 'One download per click');
      const { name, blob } = downloads.at(-1);
      assert.ok(blob instanceof Blob);
      return { name, text: await blob.text() };
    },
  };
}

function resultRows(format, text) {
  if (format === 'json') return JSON.parse(text);
  if (format === 'report-txt') {
    text = text.split('\nRESULTS\n')[1];
    assert.ok(text, 'Plain report has a Results section');
    return Object.fromEntries(text.trim().split('\n').map(line => {
      const colon = line.indexOf(': ');
      return [line.slice(0, colon), line.slice(colon + 2)];
    }));
  }
  if (format === 'csv') return Object.fromEntries(text.split(/\r?\n/).slice(1).map(line => {
    const comma = line.indexOf(',');
    return [line.slice(0, comma), line.slice(comma + 1)];
  }));
  return Object.fromEntries(text.split('\n').filter(line => line.startsWith('| ')).slice(1)
    .map(line => line.split('|').slice(1, -1).map(cell => cell.trim())));
}

for (const dataset of ['built-in', 'edited']) {
  function setup() { const page = loadPage(); if (dataset === 'edited') page.run(editedInput); return page; }

  for (const format of formats) {
    test(`P07-R3 plant: ${dataset} ${format} results identify the MoM estimator`, async () => {
      const page = setup();
      const rows = resultRows(format, (await page.download(format)).text);
      assert.equal(rows.estimator, 'method-of-moments', 'Standalone numbers must carry their estimator');
    });
  }

  for (const format of ['report-md', 'report-txt']) {
    test(`P07-R3 plant: ${dataset} ${format} methods describe the exported MoM fit`, async () => {
      const text = (await setup().download(format)).text;
      const methods = format === 'report-md'
        ? text.split('## Methods\n')[1]?.split('## Results\n')[0]
        : text.split('\nMETHODS\n')[1]?.split('\nRESULTS\n')[0];
      assert.ok(methods, 'Report has a Methods section');
      assert.match(methods, /export(?:ed|s)?[^.]*iterated method-of-moments \(MoM\)/i,
        'Bind the exported estimates to MoM, not the two-estimator page footer');
      assert.match(methods, /REML[^.]*not included/i, 'Explain the separately displayed REML fit');
      assert.doesNotMatch(methods, /Two estimators are shown|REML is the recommended result/);
      assert.match(methods, /not cluster-robust/i, 'Retain the inference limitation');
      assert.match(methods, /descriptive[^.]*< 10/i, 'Retain the small-cluster caveat');
    });
  }

  test(`P07-R3 control: ${dataset} all five formats preserve all 16 MoM numbers`, async t => {
    const page = setup(), results = page.results(), reml = page.reml();
    assert.equal(results._schema, 'mlma-results-v1');
    assert.deepEqual(Object.keys(results).filter(key => typeof results[key] === 'number'), numericKeys);
    assert.ok(Math.abs(results.mu - reml.mu) > 1e-5, 'Input distinguishes MoM from REML');
    const summary = page.ids.get('summary').innerHTML;
    assert.match(summary, /Method of moments \(MoM\)/);
    assert.match(summary, /REML \(exact/);
    assert.ok(summary.includes(results.mu.toFixed(3)));
    assert.ok(summary.includes(reml.mu.toFixed(3)));
    assert.deepEqual(page.receipt().results, results, 'Plot receipt uses the same MoM results');
    const suffixes = ['.json', '.csv', '.md', '-report.md', '-report.txt'];
    for (const [i, format] of formats.entries()) {
      const output = await page.download(format), rows = resultRows(format, output.text);
      assert.equal(output.name, 'mlma-results' + suffixes[i]);
      for (const key of numericKeys) {
        assert.ok(Number.isFinite(results[key]), key);
        assert.equal(String(rows[key]), String(results[key]), `${format}: ${key} retains full precision`);
      }
    }
    // Compare these old/new fingerprints in wrapper feedback. They cover all
    // numeric fields and the actual rendered content without inventing R parity.
    t.diagnostic(JSON.stringify({ dataset, mu: results.mu, remlMu: reml.mu,
      numbersSha256: hash(numericKeys.map(key => [key, results[key]])),
      remlSha256: hash(reml), summarySha256: hash(summary),
      tableSha256: hash(page.ids.get('body').innerHTML),
      forestSha256: hash(page.ids.get('forest').innerHTML) }));
  });
}

test('P07-R3 control: shared reports still use the footer when methods are omitted', async () => {
  const page = loadPage();
  page.context.alm.resultsExport({ target: '#alm-export-mount', getResults: page.results });
  for (const format of ['report-md', 'report-txt']) {
    assert.match((await page.download(format)).text, /Two estimators are shown/);
  }
});
