import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('proportion-ma/index.html');
const app = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(script => script.includes('function parseTable'));
assert.ok(app, 'execute the real proportion-ma engine and export wiring');
const textOf = pattern => html.match(pattern)[1].replace(/<[^>]*>/g, ' ');
const heterogeneous = '2, 100, A\n30, 100, B\n80, 100, C';
const homogeneous = '20, 100, A\n20, 100, B\n20, 100, C';

// Minimal DOM: the real app fits and renders, and the real exporter creates
// downloadable Blobs. Only unrelated UI integrations and DOM plumbing are stubbed.
function harness(method = 'PM', transform = 'logit', src = heterogeneous) {
  const nodes = new Map();
  const downloads = [];
  let pendingBlob;
  function node(id = '') {
    return {
      id, value: '', style: {}, hidden: true, innerHTML: '', textContent: '',
      listeners: new Map(),
      addEventListener(type, callback) { this.listeners.set(type, callback); },
      setAttribute(key, value) { this[key] = value; },
      appendChild() {}, removeChild() {},
      querySelector(selector) { return get(id + ' ' + selector); },
      click() { downloads.push({ name: this.download, blob: pendingBlob }); }
    };
  }
  function get(id) {
    if (!nodes.has(id)) nodes.set(id, node(id));
    return nodes.get(id);
  }
  get('src').value = src;
  get('trans').value = transform;
  get('tau-est').value = method;
  const prose = {
    h1: { textContent: textOf(/<h1>([\s\S]*?)<\/h1>/) },
    'header p': { textContent: textOf(/<header>[\s\S]*?<p>([\s\S]*?)<\/p>/) },
    footer: { textContent: textOf(/<footer>([\s\S]*?)<\/footer>/) }
  };
  const document = {
    title: 'Proportion MA', head: node(), body: node(),
    getElementById: get,
    createElement: () => node(),
    addEventListener() {},
    querySelector: selector => selector.startsWith('#') ? get(selector.slice(1)) : prose[selector] || null,
    querySelectorAll: selectors => selectors.split(',').map(selector => get(selector.trim().slice(1)))
  };
  const noop = () => {};
  const window = { alm: {
    csvUpload: noop, plotExport: noop, axisControls: noop, tooltips: noop,
    resetUndo: Object.assign(() => {}, { snapshot: noop }),
    urlState: Object.assign(() => {}, { read: () => ({}), write: noop })
  } };
  const context = vm.createContext({ window, document, console, Blob,
    URL: { createObjectURL(blob) { pendingBlob = blob; return 'blob:report'; }, revokeObjectURL: noop },
    setTimeout: noop
  });
  for (const path of ['shared/ma-core.js', 'hub/shared/analysis-lifecycle.js', 'hub/shared/results-export.js']) {
    vm.runInContext(read(path), context, { filename: path });
  }
  vm.runInContext(app, context, { filename: 'proportion-ma/index.html' });
  return {
    results: () => window._almLastPropMA(),
    select(nextMethod, nextTransform) {
      get('tau-est').value = nextMethod;
      get('trans').value = nextTransform;
    },
    fit: () => window.__almPropValidation.run(),
    async download(action) {
      await get('alm-export-mount [data-action="' + action + '"]').listeners.get('click')();
      const download = downloads.at(-1);
      assert.ok(download, 'the actual export click handler must download a Blob');
      return { name: download.name, text: await download.blob.text() };
    }
  };
}

async function report(h, action) {
  const download = await h.download(action);
  const plain = action === 'report-txt';
  assert.equal(download.name, 'propma-results-report.' + (plain ? 'txt' : 'md'));
  const methodsHeader = plain ? '\nMETHODS\n' : '\n## Methods\n';
  const resultsHeader = plain ? '\nRESULTS\n' : '\n## Results\n';
  assert.ok(download.text.includes(methodsHeader) && download.text.includes(resultsHeader));
  return {
    methods: download.text.split(methodsHeader)[1].split(resultsHeader)[0],
    results: download.text.split(resultsHeader)[1]
  };
}

const isCommon = text => /(?:common|fixed)[ -]effect/i.test(text);
const isRandom = text => /random[ -]effects/i.test(text);
const estimators = { PM: /Paule[ -]Mandel|\bPM\b/i, DL: /DerSimonian[ -]Laird|\bDL\b/i };
const transforms = { logit: /\blogit\b/i, ft: /Freeman[ -]Tukey/i, raw: /\braw\b/i };

for (const action of ['report-md', 'report-txt']) {
  for (const method of ['FE', 'PM', 'DL']) {
    test(`plant P09-R4: ${action} Methods identifies only the fitted ${method} model`, async () => {
      const h = harness(method);
      assert.equal(h.results().tauEstimator, method);
      if (method === 'FE') assert.equal(h.results().tau2, 0);
      else assert.ok(h.results().tau2 > 0, 'heterogeneous random-effects control must fit positive tau2');
      const { methods } = await report(h, action);
      if (method === 'FE') {
        assert.ok(isCommon(methods), 'FE Methods must identify the common/fixed-effect fit');
        assert.ok(!isRandom(methods), 'FE Methods must not describe a random-effects fit');
        assert.ok(!estimators.PM.test(methods) && !estimators.DL.test(methods), 'FE Methods must not claim a fitted DL or PM estimator');
      } else {
        assert.ok(isRandom(methods), 'random-effects Methods must retain the fitted model');
        assert.ok(estimators[method].test(methods), 'Methods must name the fitted tau2 estimator');
        const other = method === 'PM' ? 'DL' : 'PM';
        assert.ok(!estimators[other].test(methods), 'Methods must not claim the other tau2 estimator');
      }
    });
  }

  for (const transform of ['logit', 'ft', 'raw']) {
    test(`plant P09-R4: ${action} Methods describes the fitted ${transform} transformation`, async () => {
      const h = harness('PM', transform);
      assert.equal(h.results().transform, transform);
      const { methods } = await report(h, action);
      assert.ok(transforms[transform].test(methods), 'Methods must name the fitted transformation');
      for (const other of Object.keys(transforms).filter(key => key !== transform)) {
        assert.ok(!transforms[other].test(methods), 'Methods must not describe the unused ' + other + ' transformation');
      }
      assert.ok(/Clopper[ -]Pearson/i.test(methods), 'retain the per-study CI method');
      if (transform === 'ft') {
        assert.ok(/harmonic mean/i.test(methods), 'FT back-transformation must document the chosen study size');
        assert.ok(/misleading|caution|caveat/i.test(methods), 'retain the FT back-transformation caveat');
      }
    });
  }

  test(`plant P09-R4: ${action} Methods follows fitted results through edits and refits`, async () => {
    const h = harness('FE', 'raw');
    h.select('PM', 'logit'); // Pending control edits are not the exported fit.
    const before = await report(h, action);
    assert.equal(h.results().tauEstimator, 'FE');
    assert.equal(h.results().transform, 'raw');
    assert.ok(isCommon(before.methods) && !isRandom(before.methods), 'describe the saved FE fit, not pending PM');
    assert.ok(transforms.raw.test(before.methods) && !transforms.logit.test(before.methods), 'describe the saved raw fit');
    h.fit();
    const after = await report(h, action);
    assert.ok(isRandom(after.methods) && estimators.PM.test(after.methods), 'Methods must update after refitting');
    assert.ok(transforms.logit.test(after.methods) && !transforms.raw.test(after.methods), 'Methods must update the fitted transform');
  });

  test(`control P09-R4: ${action} PM with zero tau2 stays random effects and preserves results`, async () => {
    const h = harness('PM', 'logit', homogeneous);
    assert.equal(h.results().tau2, 0);
    const before = JSON.stringify(h.results());
    const exported = await report(h, action);
    assert.ok(isRandom(exported.methods), 'zero fitted tau2 does not change the selected random-effects model');
    assert.ok(estimators.PM.test(exported.methods));
    assert.ok(/Clopper[ -]Pearson/i.test(exported.methods));
    for (const key of ['tauEstimator', 'transform', 'poolP', 'poolLo', 'poolHi', 'tau2']) {
      assert.ok(exported.results.includes(key), 'retain the results key ' + key);
      assert.ok(exported.results.includes(String(h.results()[key])), 'retain the fitted value for ' + key);
    }
    assert.equal(JSON.stringify(h.results()), before, 'report generation must not mutate fitted results');
    assert.deepEqual(JSON.parse((await h.download('json')).text), JSON.parse(before), 'JSON export remains the fitted results');
  });
}
