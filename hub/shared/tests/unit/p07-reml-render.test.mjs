import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app = new URL('../../../../multilevel-ma/', import.meta.url);
const adapterSource = readFileSync(new URL('validate/adapter.js', app), 'utf8');
const pageSource = readFileSync(new URL('index.html', app), 'utf8');
// Deliberately distinct synthetic display values, not R-parity references.
const result = {mu: 0.246812, se: 0.123456, ciLo: -0.13579, ciHi: 0.62941,
  sigma2Between: 0.03567, sigma2Within: 0.01432, logLik: -12.345678};
const labelledRows = () => [
  ['Pooled estimate', '0.247', 'SE = 0.123'],
  ['95% CI (z)', '[-0.136, 0.629]'],
  ['σ²_study (between)', '0.0357'],
  ['σ²_within', '0.0143'],
  ['REML log-likelihood', '-12.346']
];
const cell = text => ({innerText: text, textContent: text});
function table(data, extra = false) {
  const rows = data.map(values => ({cells: values.map(cell)}));
  return {
    rows,
    get innerText() { return rows.map(r => r.cells.map(c => c.innerText).join('\t')).join('\n'); },
    querySelectorAll(selector) {
      assert.equal(selector, 'tr');
      return rows;
    },
    closest(selector) { assert.equal(selector, '#alm-plus'); return extra ? {} : null; }
  };
}

function harness(tables = [table([]), table(labelledRows())], values = result, source = adapterSource) {
  const input = {value: 'original input'};
  let runs = 0;
  const document = {
    querySelectorAll(selector) {
      if (selector === '#summary table') return tables;
      assert.equal(selector, '#body tr');
      return Array(4).fill({}); // Three effects and the pooled row.
    },
    getElementById(id) { return id === 'src' ? input : {}; }
  };
  const window = {alm: {urlState: {withoutWrites: callback => callback()}},
    __almMlmaParse: () => Array(3).fill({study: 'A', te: 0, se: 1}),
    __almMlmaRun: () => { runs++; },
    __almReml: () => values,
    _almLastMlma: () => ({tau2_study: 0, tau2_within: 0, I2_study: 0, I2_within: 0, I2_sampling: 1})};
  const context = vm.createContext({document, window, alm: window.alm,
    setTimeout: callback => callback(),
    AlmValidate: {
      mount: () => ({}),
      compare(a, b, kind, tolerance) {
        assert.equal(kind, 'rel');
        const diff = Math.abs(a - b) / Math.max(1, Math.abs(b));
        return {diff, pass: Number.isFinite(diff) && diff <= tolerance};
      }
    }
  });
  // Expose the private production predicate only inside this VM. Replay still
  // executes the complete adapter, including its original check accounting.
  const marker = '  async function replay(';
  assert.ok(source.includes(marker));
  vm.runInContext(source.replace(marker,
    '  window.testRenderMatches = renderMatches;\n' + marker), context);
  return {matches: () => window.testRenderMatches(values), input,
    get runs() { return runs; }, adapter: window.AlmMultilevelValidationAdapter};
}

test('P07-R3 control: correctly labelled rounded REML table passes', () => {
  assert.equal(harness().matches(), true);
});

const plants = [
  ['estimate and SE swapped', rows => { rows[0][1] = '0.123'; rows[0][2] = 'SE = 0.247'; }],
  ['CI endpoints reversed', rows => { rows[1][1] = '[0.629, -0.136]'; }],
  ['estimate/SE swapped and CI reversed', rows => {
    rows[0][1] = '0.123'; rows[0][2] = 'SE = 0.247'; rows[1][1] = '[0.629, -0.136]';
  }],
  ['between and within variances swapped', rows => { [rows[2][1], rows[3][1]] = [rows[3][1], rows[2][1]]; }],
  ['log likelihood and estimate swapped', rows => { [rows[0][1], rows[4][1]] = [rows[4][1], rows[0][1]]; }],
  ['wrong estimate label', rows => { rows[0][0] = 'Other estimate'; }],
  ['wrong SE label', rows => { rows[0][2] = 'Other = 0.123'; }],
  ['estimate only a substring', rows => { rows[0][1] = '10.247'; }],
  ['missing estimate cell with its value in a note', rows => { rows[0].splice(1, 1); rows.push(['Note', '0.247']); }],
  ['ambiguous duplicate labelled row', rows => { rows.push(['REML log-likelihood', '-99.000']); }]
];
for (const [name, plant] of plants) {
  test('P07-R3 plant: rejects ' + name, () => {
    const rows = labelledRows();
    plant(rows);
    assert.equal(harness([table([]), table(rows)]).matches(), false);
  });
}

test('P07-R3 control: absent estimate and absent REML table fail', () => {
  const rows = labelledRows(); rows[0][1] = 'missing';
  assert.equal(harness([table([]), table(rows)]).matches(), false);
  assert.equal(harness([table([])]).matches(), false);
});

test('P07-R3 control: extras cannot supply REML text or shift the summary table', () => {
  const good = table(labelledRows());
  assert.equal(harness([table([]), table(labelledRows(), true), good]).matches(), true);
  assert.equal(harness([table([]), table([]), table(labelledRows(), true)]).matches(), false);
});

function renderedTable(values) {
  const start = pageSource.indexOf("        document.getElementById('summary').innerHTML +=");
  const end = pageSource.indexOf("'</tbody></table>';", start) + "'</tbody></table>';".length;
  assert.ok(start >= 0 && end > start);
  const summary = {innerHTML: ''};
  vm.runInNewContext(pageSource.slice(start, end), {
    document: {getElementById: () => summary}, reml: values,
    fmt: (x, digits = 3) => Number.isFinite(x) ? x.toFixed(digits) : '—'
  });
  const text = html => html.replace(/<[^>]*>/g, '').replace(/&sigma;/g, 'σ').replace(/&sup2;/g, '²');
  return table([...summary.innerHTML.matchAll(/<tr>(.*?)<\/tr>/g)].map(row =>
    [...row[1].matchAll(/<td\b[^>]*>(.*?)<\/td>/g)].map(c => text(c[1]))));
}

test('P07-R3 control: actual page render template passes, including rounded zero and equal values', () => {
  for (const values of [result, {mu: -0.0001, se: 0, ciLo: -0.0001, ciHi: 0,
    sigma2Between: 0, sigma2Within: 0, logLik: -0.0001}]) {
    assert.equal(harness([table([]), renderedTable(values)], values).matches(), true);
  }
});

function syntheticCorpus() {
  const corpus = {}, references = {};
  for (let i = 0; i < 44; i++) {
    const name = 'synthetic_' + i;
    corpus[name] = [1, 2, 3].map(id => ({id, cluster: 'A', y: 0, v: 1}));
    references[name] = {rows: 3, clusters: 1, values: result};
  }
  return {'validate/corpus/corpus.json': corpus, 'validate/corpus/reference.json': references};
}

test('P07-R3 plant: full replay reports mislabelled rendering as failed checks', async () => {
  const rows = labelledRows(); plants[2][1](rows);
  const h = harness([table([]), table(rows)]);
  const replay = await h.adapter.corpus.run(syntheticCorpus(), () => {});
  assert.equal(replay.checks, 528);
  assert.equal(replay.passed, 484);
  assert.equal(replay.failed.length, 44);
  assert.ok(replay.failed.every(f => f.quantity === 'UI_REML_render'));
  assert.equal(h.input.value, 'original input');
  assert.equal(h.runs, 45);
});

test('P07-R3 control: full replay retains 528 checks and restores inputs', async () => {
  const h = harness();
  const replay = await h.adapter.corpus.run(syntheticCorpus(), () => {});
  assert.equal(h.adapter.paper.checks, 528);
  assert.equal(replay.checks, 528);
  assert.equal(replay.passed, 528);
  assert.equal(replay.failed.length, 0);
  assert.equal(h.input.value, 'original input');
  assert.equal(h.runs, 45);
});

// Reconstruct only the documented historical defect (validate/README.md): all
// seven rounded values occurring anywhere in the REML table. This is a mutation
// of the current adapter in memory, not execution of a historical checkout.
function valuePresenceAdapter() {
  const start = adapterSource.indexOf('  function renderMatches(r) {');
  const end = adapterSource.indexOf('  async function replay(', start);
  assert.ok(start >= 0 && end > start);
  return adapterSource.slice(0, start) + `  function renderMatches(r) {
    const table = [...document.querySelectorAll('#summary table')].filter(t => !t.closest('#alm-plus'))[1];
    if (!table) return false;
    return keys.every(key => table.innerText.includes(r[key].toFixed(
      key === 'sigma2Between' || key === 'sigma2Within' ? 4 : 3)));
  }
` + adapterSource.slice(end);
}

test('P07-R3 mutation: each labelled-cell assertion rejects the value-presence-only adapter', () => {
  const loose = valuePresenceAdapter();
  // A correctly rendered table passes both implementations.
  assert.equal(harness(undefined, result, loose).matches(), true);
  assert.equal(harness().matches(), true);
  for (const [name, plant] of plants) {
    const rows = labelledRows();
    plant(rows);
    const tables = [table([]), table(rows)];
    const rejectsCorruption = source => assert.equal(harness(tables, result, source).matches(), false, name);
    assert.throws(() => rejectsCorruption(loose), assert.AssertionError, name);
    rejectsCorruption(adapterSource);
  }
});

test('P07-R3 mutation: full-replay failure assertion rejects the value-presence-only adapter', async () => {
  const rows = labelledRows(); plants[2][1](rows);
  const rejectsCorruption = replay => {
    assert.equal(replay.checks, 528);
    assert.equal(replay.passed, 484);
    assert.equal(replay.failed.length, 44);
    assert.ok(replay.failed.every(f => f.quantity === 'UI_REML_render'));
  };
  for (const source of [valuePresenceAdapter(), adapterSource]) {
    const h = harness([table([]), table(rows)], result, source);
    const replay = await h.adapter.corpus.run(syntheticCorpus(), () => {});
    if (source === adapterSource) rejectsCorruption(replay);
    else assert.throws(() => rejectsCorruption(replay), assert.AssertionError);
    assert.equal(h.input.value, 'original input');
    assert.equal(h.runs, 45);
  }
});
