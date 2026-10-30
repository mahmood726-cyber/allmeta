import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('dose-response-ma/index.html');
const warning = 'Some requested doses lie outside the observed range (0 to 20); those predictions are extrapolations.';
const engineWarning = 'Engine warning control: <limit> & convergence';
const formats = [
  ['json', 'JSON', '.json'],
  ['csv', 'CSV', '.csv'],
  ['report-md', 'Methods+Results Markdown', '-report.md'],
  ['report-txt', 'Methods+Results text', '-report.txt'],
  ['md', 'Data Markdown', '.md'],
];
// Synthetic case-control studies with an observed dose range of 0 to 20.
const data = ['study,dose,cases,n,logRR,SE,type',
  'A,0,20,200,0,,cc', 'A,10,25,200,0.25,0.3,cc', 'A,20,30,200,0.46,0.3,cc',
  'B,0,30,300,0,,cc', 'B,10,36,300,0.2,0.25,cc', 'B,20,42,300,0.38,0.25,cc',
].join('\n');
const copy = value => JSON.parse(JSON.stringify(value));

// Execute the unmodified inline app, real engine/lifecycle, and real export
// click handlers. Only the DOM/download plumbing and plot toolbar are stubbed.
// Blobs stay in memory: no browser, files, network, or additional dependencies.
function harness(extraWarning = null) {
  const downloads = [], blobs = new Map(), ready = [];
  function element(id = '') {
    const listeners = new Map(), buttons = new Map();
    let markup = '';
    return {
      id, value: '', checked: false, hidden: false, textContent: '', options: [],
      get innerHTML() { return markup; },
      set innerHTML(value) {
        markup = value;
        buttons.clear();
        for (const match of value.matchAll(/data-action="([^"]+)"/g)) buttons.set(match[1], element());
      },
      querySelector(selector) { return buttons.get(selector.match(/^\[data-action="([^"]+)"\]$/)?.[1]) || null; },
      addEventListener(type, handler) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(handler);
      },
      async click() {
        if (this.download) downloads.push({ name: this.download, blob: blobs.get(this.href) });
        for (const handler of listeners.get('click') || []) await handler({ target: this });
      },
      appendChild() {}, removeChild() {},
    };
  }
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], element(match[1])]));
  for (const [id, value] of Object.entries({ 'f-shape': 'linear', 'f-cov': 'gl', 'f-proc': '2stage', 'f-method': 'FE' })) {
    elements.get(id).value = value;
  }
  elements.get('f-method').options = ['REML', 'ML', 'MM', 'FE', 'PM', 'DL'].map(value => ({ value }));
  const document = {
    readyState: 'loading', title: 'Dose-Response Meta-Analysis', head: element(), body: element(),
    getElementById: id => elements.get(id) || null,
    querySelector: selector => selector.startsWith('#') ? elements.get(selector.slice(1)) || null : null,
    querySelectorAll: () => [...elements.values()].filter(el => el.id.startsWith('f-')),
    createElement: () => element(),
    addEventListener(type, handler) { if (type === 'DOMContentLoaded') ready.push(handler); },
  };
  const context = vm.createContext({ document, Blob,
    URL: {
      createObjectURL(blob) { const url = `blob:test-${blobs.size}`; blobs.set(url, blob); return url; },
      revokeObjectURL(url) { blobs.delete(url); },
    },
    setTimeout(callback) { callback(); },
    alm: { plotExport() {} },
  });
  context.window = context;
  for (const path of ['shared/ma-core.js', 'shared/dose-response.js', 'hub/shared/analysis-lifecycle.js']) {
    vm.runInContext(read(path), context, { filename: path });
  }
  let fit;
  const fitDR = context.AlmDoseResponse.fitDR;
  context.AlmDoseResponse.fitDR = (...args) => {
    fit = fitDR(...args);
    if (extraWarning) fit.warnings.push(extraWarning);
    Object.freeze(fit.warnings); // Rendering must not append to engine-owned warnings.
    return fit;
  };
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(match => !/\bsrc=/.test(match[1]));
  assert.equal(scripts.length, 1, 'load the full app inline script');
  vm.runInContext(scripts[0][2], context, { filename: 'dose-response-ma/index.html' });
  vm.runInContext(read('hub/shared/results-export.js'), context, { filename: 'hub/shared/results-export.js' });
  ready.forEach(handler => handler());
  elements.get('f-data').value = data;
  return {
    get fit() { return fit; },
    get messages() { return elements.get('msgs').innerHTML; },
    async run(doses) {
      elements.get('f-pdoses').value = doses;
      await elements.get('btn-run').click();
      const result = context._almLastDoseResponse();
      assert.ok(result, this.messages);
      assert.equal(fit.ok, true, fit.error);
      assert.deepEqual(copy(fit.doseRange), [0, 20]);
      return result;
    },
    async export(action, suffix) {
      const before = downloads.length;
      const button = elements.get('alm-export-mount').querySelector(`[data-action="${action}"]`);
      assert.ok(button, `export button ${action}`);
      await button.click();
      assert.equal(downloads.length, before + 1, 'one artifact per click');
      const artifact = downloads.at(-1);
      assert.equal(artifact.name, `dose-response-results${suffix}`);
      return artifact.blob.text();
    },
  };
}

function assertPredictions(result, fit, doses) {
  assert.deepEqual(copy(result.predictions).map(p => p.dose), doses);
  const expected = fit.predict(doses, result.referenceDose, result.covariateValue)
    .map(p => ({ dose: p.dose, rr: p.rr, lo: p.rrLo, hi: p.rrHi, logRR: p.logRR, se: p.se }));
  assert.deepEqual(copy(result.predictions), copy(expected), 'warning handling preserves every prediction value');
  assert.ok(result.predictions.every(p => Object.values(p).every(Number.isFinite)));
}

for (const [action, label, suffix] of formats) {
  test(`plant P02-R2: above-range prediction warning survives ${label} export`, async () => {
    const h = harness(), result = await h.run('10,30');
    assertPredictions(result, h.fit, [10, 30]);
    assert.ok(h.messages.includes(warning), 'page shows the warning before export');
    const artifact = await h.export(action, suffix);
    assert.ok(artifact.includes(warning), `${label} must retain the warning accompanying dose 30`);
    assert.deepEqual(copy(result.warnings), [warning], 'snapshot and page share warning text');
    if (action === 'json') assert.deepEqual(JSON.parse(artifact), copy(result));
    else assert.match(artifact, /predictions[\s\S]*30/, 'export retains the extrapolated prediction');
  });

  test(`control P02-R2: interpolation and boundary doses have no warning in ${label} export`, async () => {
    const h = harness(), result = await h.run('0,10,20');
    assertPredictions(result, h.fit, [0, 10, 20]);
    assert.deepEqual(copy(result.warnings), []);
    assert.equal(h.messages, '');
    const artifact = await h.export(action, suffix);
    assert.doesNotMatch(artifact, /extrapolat|outside the observed range/i);
    if (action === 'json') assert.deepEqual(JSON.parse(artifact), copy(result));
    else assert.match(artifact, /predictions[\s\S]*20/);
  });
}

test('plant P02-R2: below-range and multiple outside doses retain one warning', async () => {
  const h = harness();
  for (const doses of [[-5], [-5, 10, 30]]) {
    const result = await h.run(doses.join(','));
    assertPredictions(result, h.fit, doses);
    assert.deepEqual(copy(result.warnings), [warning]);
    assert.equal(h.messages.split(warning).length - 1, 1);
  }
});

test('plant P02-R2: analysis and prediction warnings coexist without mutating engine warnings', async () => {
  const h = harness(engineWarning), result = await h.run('30');
  assert.deepEqual(copy(h.fit.warnings), [engineWarning]);
  assert.deepEqual(copy(result.warnings), [engineWarning, warning]);
  assert.ok(h.messages.includes('Engine warning control: &lt;limit&gt; &amp; convergence'));
  assert.ok(h.messages.includes(warning));
  for (const [action, , suffix] of formats) {
    const artifact = await h.export(action, suffix);
    assert.ok(artifact.includes(engineWarning));
    assert.ok(artifact.includes(warning));
  }
});

test('control P02-R2: existing analysis warning remains escaped on screen and present in every export', async () => {
  const h = harness(engineWarning), result = await h.run('10');
  assert.deepEqual(copy(result.warnings), [engineWarning]);
  assert.ok(h.messages.includes('Engine warning control: &lt;limit&gt; &amp; convergence'));
  assert.doesNotMatch(h.messages, /extrapolat/);
  for (const [action, , suffix] of formats) assert.ok((await h.export(action, suffix)).includes(engineWarning));
});

test('plant P02-R2: rerunning interpolation clears only the current extrapolation warning', async () => {
  const h = harness(), previous = await h.run('30');
  assert.deepEqual(copy(previous.warnings), [warning]);
  const current = await h.run('10');
  assert.deepEqual(copy(current.warnings), []);
  assert.equal(h.messages, '');
  assert.deepEqual(copy(previous.warnings), [warning], 'previous result snapshot stays intact');
  for (const [action, , suffix] of formats) assert.doesNotMatch(await h.export(action, suffix), /extrapolat/);
});
