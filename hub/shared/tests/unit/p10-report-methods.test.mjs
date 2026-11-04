import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('mh-peto/index.html');
const app = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(source => source.includes('var Z975 ='));
assert.ok(app?.includes('window.alm.resultsExport('), 'Load the actual app analysis and export wiring');

function textContent(markup) {
  const entities = { lt: '<', gt: '>', amp: '&', Sigma: 'Σ', middot: '·', minus: '−' };
  return markup.replace(/<[^>]*>/g, '').replace(/&(\w+);/g, (whole, name) => entities[name] ?? whole)
    .replace(/\s+/g, ' ').trim();
}

// Execute the app's complete main script, real analysis lifecycle, and real
// exporter in Node. Only DOM/download plumbing and unrelated widgets are stubbed.
// Report assertions inspect the Blob produced by the registered click handler.
function harness() {
  const elements = new Map(), blobs = new Map(), downloads = [];
  function element(id = '') {
    const listeners = new Map();
    return {
      id, value: '', textContent: '', innerHTML: '', hidden: false, checked: false,
      addEventListener(type, handler) { listeners.set(type, handler); },
      dispatch(type) { return listeners.get(type)?.(); },
      setAttribute(key, value) { this[key] = value; },
      getAttribute(key) { return this[key] ?? null; },
      removeAttribute(key) { delete this[key]; },
      appendChild() {}, removeChild() {},
    };
  }
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) elements.set(id, element(id));
  elements.get('src').value = html.match(/<textarea\b[^>]*id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];
  elements.get('measure').value = 'OR';
  const buttons = new Map(['report-md', 'report-txt', 'json', 'csv', 'md'].map(action => [action, element()]));
  elements.get('alm-export-mount').querySelector = selector => buttons.get(selector.match(/data-action="([^"]+)"/)[1]);
  const metadata = {
    h1: { textContent: textContent(html.match(/<h1>([\s\S]*?)<\/h1>/)[1]) },
    'header p': { textContent: textContent(html.match(/<header>[\s\S]*?<p>([\s\S]*?)<\/p>/)[1]) },
    footer: { textContent: textContent(html.match(/<footer>([\s\S]*?)<\/footer>/)[1]) },
  };
  const document = {
    head: element(), body: element(),
    getElementById: id => elements.get(id) ?? null,
    querySelector: selector => metadata[selector] ?? (selector.startsWith('#') ? elements.get(selector.slice(1)) : null),
    querySelectorAll: selector => selector === '#src, #measure' ? [elements.get('src'), elements.get('measure')] : [],
    addEventListener() {},
    createElement(tag) {
      const el = element();
      if (tag === 'a') el.click = () => downloads.push({ name: el.download, blob: blobs.get(el.href) });
      return el;
    },
  };
  const noop = () => {};
  const window = { alm: {
    csvUpload: noop, plotExport: noop, axisControls: noop, resetUndo: noop, tooltips: noop,
    urlState: Object.assign(() => {}, { read: () => null, write: noop }),
  } };
  const context = vm.createContext({ window, document, Blob, console, setTimeout: noop,
    URL: {
      createObjectURL(blob) { const key = `blob:test-${blobs.size}`; blobs.set(key, blob); return key; },
      revokeObjectURL: noop,
    },
  });
  vm.runInContext(read('hub/shared/analysis-lifecycle.js'), context);
  vm.runInContext(read('hub/shared/results-export.js'), context);
  vm.runInContext(app, context, { filename: 'mh-peto/index.html' });
  return {
    select(measure, rerun = true) {
      elements.get('measure').value = measure;
      if (rerun) elements.get('measure').dispatch('change');
    },
    results: () => JSON.parse(JSON.stringify(window._almLastMhPeto())),
    async download(action) {
      const count = downloads.length;
      await buttons.get(action).dispatch('click');
      assert.equal(downloads.length, count + 1, `${action} must produce a download`);
      const { name, blob } = downloads.at(-1);
      return { name, text: await blob.text() };
    },
  };
}

function methods(report, action) {
  const start = action === 'report-txt' ? 'METHODS\n' : '## Methods\n';
  const end = action === 'report-txt' ? '\nRESULTS\n' : '\n## Results\n';
  assert.ok(report.includes(start) && report.includes(end), 'Report has Methods and Results sections');
  return report.split(start)[1].split(end)[0];
}

function assertMeasure(report, action, measure) {
  assert.match(report, action === 'report-txt'
    ? new RegExp(`^measure: ${measure}$`, 'm')
    : new RegExp(`\\| measure\\s*\\| ${measure}\\s*\\|`));
}

for (const action of ['report-txt', 'report-md']) {
  test(`P10-R3 plant: RD ${action} describes Greenland-Robins variance, not OR methods`, async () => {
    const h = harness();
    h.select('RD');
    const report = await h.download(action);
    assertMeasure(report.text, action, 'RD');
    const prose = methods(report.text, action);
    assert.match(prose, /risk difference/i);
    assert.match(prose, /Mantel-Haenszel/i);
    assert.match(prose, /Greenland[-–]Robins variance/);
    assert.match(prose, /no continuity correction/i);
    assert.doesNotMatch(prose, /log[- ]OR|odds ratio|Peto|Robins[-–]Breslow[-–]Greenland/i);
  });

  test(`P10-R3 plant: RR ${action} describes the selected risk ratio`, async () => {
    const h = harness();
    h.select('RR');
    const report = await h.download(action);
    assertMeasure(report.text, action, 'RR');
    const prose = methods(report.text, action);
    assert.match(prose, /risk ratio/i);
    assert.match(prose, /Mantel-Haenszel/i);
    assert.match(prose, /no continuity correction/i);
    assert.doesNotMatch(prose, /log[- ]OR|odds ratio|Peto|Robins[-–]Breslow[-–]Greenland/i);
  });

  test(`P10-R3 control: OR ${action} retains MH variance and Peto methods`, async () => {
    const h = harness();
    const report = await h.download(action);
    assertMeasure(report.text, action, 'OR');
    const prose = methods(report.text, action);
    assert.match(prose, /odds ratio/i);
    assert.match(prose, /Robins[-–]Breslow[-–]Greenland variance/);
    assert.match(prose, /Peto/);
    assert.match(prose, /(?:avoid|no) continuity correction/i);
    assert.ok(Number.isFinite(h.results().peto_est));
  });
}

for (const measure of ['OR', 'RD', 'RR']) {
  test(`P10-R3 control: ${measure} JSON, CSV and data Markdown preserve the analysis payload`, async () => {
    const h = harness();
    h.select(measure);
    const expected = h.results();
    assert.equal(expected.measure, measure);
    assert.equal(expected._schema, 'mhpeto-results-v1');
    assert.ok(Number.isFinite(expected.mh_est));
    const json = await h.download('json');
    assert.equal(json.name, 'mhpeto-results.json');
    assert.deepEqual(JSON.parse(json.text), expected);
    const csv = await h.download('csv');
    assert.equal(csv.name, 'mhpeto-results.csv');
    assert.equal(csv.text, ['key,value', ...Object.entries(expected).map(([key, value]) => `${key},${value ?? ''}`)].join('\r\n'));
    const md = await h.download('md');
    assert.equal(md.name, 'mhpeto-results.md');
    const rows = md.text.split('\n').slice(2).map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
    assert.deepEqual(rows, Object.entries(expected).map(([key, value]) => [key, String(value ?? '')]));
    assert.deepEqual(h.results(), expected, 'Export does not mutate the analysis');
  });
}

test('P10-R3 plant: report metadata follows completed analyses across measure changes', async () => {
  const h = harness();
  for (const [measure, name] of [['OR', 'odds ratio'], ['RD', 'risk difference'], ['RR', 'risk ratio'], ['OR', 'odds ratio']]) {
    h.select(measure);
    // A changed selector without a run must not relabel the saved results.
    h.select(measure === 'OR' ? 'RD' : 'OR', false);
    const { text } = await h.download('report-txt');
    assertMeasure(text, 'report-txt', measure);
    assert.match(methods(text, 'report-txt'), new RegExp(name, 'i'));
  }
});
