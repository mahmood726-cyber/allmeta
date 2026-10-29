// Fresh native-R parity, at absolute 1e-6, for the actual correlation-ma engines.
// No browser, npm dependencies, R process, or output files are needed at replay time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const inputPath = 'hub/shared/tests/r/p17-correlation-input.json';
const scriptPath = 'hub/shared/tests/r/p17-correlation-reference.R';
const input = JSON.parse(read(inputPath));
const reference = JSON.parse(read('hub/shared/tests/r/p17-correlation-reference.json'));
const feScriptPath = 'hub/shared/tests/r/p17-correlation-fe-loo-reference.R';
const feReference = JSON.parse(read('hub/shared/tests/r/p17-correlation-fe-loo-reference.json'));
// The first R run serialized absent leave1out(FE)$tau2 as []. Keep those
// assertions running as explicit TODOs; neither that fixture nor its generator
// is rebased. The additive direct-rma oracle below checks every FE field.
const missingFETau2 = 'P17-ORACLE-1: original leave1out(FE) reference has tau2_z=[]; preserved, with direct-rma parity below';
const html = read('correlation-ma/index.html');
const coreSource = read('shared/ma-core.js');
const plusSource = read('correlation-ma/plus-core.js');
const tolerance = 1e-6; // Absolute, including I2 percentage points. No iterative exception.
const methods = ['REML', 'PM', 'DL', 'FE'];
const tests = ['z', 'knha', 'adhoc'];
const numericFields = ['mu_z', 'se_z', 'tau2_z', 'tau_z', 'Q', 'I2', 'df',
  'ciLo', 'ciHi', 'piLo', 'piHi', 'r', 'r_lo', 'r_hi', 'r_pi_lo', 'r_pi_hi'];
const pageFields = ['mu_z', 'se_z', 'tau2_z', 'I2', 'r', 'r_lo', 'r_hi', 'r_pi_lo', 'r_pi_hi'];
const studies = c => c.r.map((r, i) => ({ label: `S${i + 1}`, r, n: c.n[i] }));
const refCase = id => reference.cases.find(c => c.id === id);
const inputCase = id => input.cases.find(c => c.id === id);
const refFit = (id, method, test = 'z') => refCase(id).fits.find(f => f.method === method && f.test === test);

function near(actual, expected, label) {
  if (expected === null) return assert.equal(actual, null, label);
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected), `${label}: nonfinite ${actual}, ${expected}`);
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${label}: app=${actual}, R=${expected}, abs_diff=${Math.abs(actual - expected)}, tolerance=${tolerance}`);
}
function compare(actual, expected, fields, label) {
  // Report every discrepancy in a configuration, not just the first mismatch.
  const errors = [];
  for (const field of fields) {
    try { near(actual[field], expected[field], `${label}.${field}`); }
    catch (e) { errors.push(e.message); }
  }
  assert.deepEqual(errors, [], label);
}

function load({ page = html, core = coreSource, plus = plusSource } = {}) {
  // Only form values and output sinks are stubbed. Execute the complete original
  // inline parser/run/forest script; never reproduce its numerical calculations.
  const elements = Object.fromEntries(['f-data', 'f-method', 'headline', 'res-body', 'forest-host'].map(id =>
    [id, { value: id === 'f-method' ? 'REML' : '', innerHTML: '', textContent: '', addEventListener() {} }]));
  const document = { readyState: 'loading', getElementById: id => elements[id], addEventListener() {} };
  const context = vm.createContext({ document, matchMedia: () => ({ matches: false }) });
  context.window = context;
  vm.runInContext(core, context, { filename: 'shared/ma-core.js' });
  let lastCall;
  const pool = context.AlmMaCore.pool;
  context.AlmMaCore.pool = (z, v, options) => {
    const result = pool(z, v, options);
    lastCall = { z: Array.from(z), v: Array.from(v), result };
    return result;
  };
  const inline = [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).filter(s => s.includes('var EXAMPLE'));
  assert.equal(inline.length, 1, 'exactly one real analysis script');
  vm.runInContext(inline[0], context, { filename: 'correlation-ma/index.html:inline' });
  vm.runInContext(plus, context, { filename: 'correlation-ma/plus-core.js' });
  return {
    plus: context.AlmCorrPlus,
    run(c, method) {
      elements['f-data'].value = studies(c).map(s => `${s.label},${s.r},${s.n}`).join('\n');
      elements['f-method'].value = method;
      lastCall = null;
      context.__almCorrValidationRun();
      return { output: context._almLastCorrMA(), call: lastCall, elements };
    }
  };
}
const engine = load();

test('P17 provenance control: native R versions, exact inputs and generator hashes', () => {
  assert.equal(reference.schema, 'p17-correlation-reference-v1');
  assert.deepEqual(reference.input, input);
  assert.match(reference.provenance.R, /^R version /);
  for (const name of ['metafor', 'metadat', 'Matrix', 'nlme', 'numDeriv', 'jsonlite']) {
    assert.match(reference.provenance.packages.find(p => p.package === name)?.version || '', /^\d/);
  }
  const md5 = path => createHash('md5').update(readFileSync(new URL(path, root))).digest('hex');
  assert.equal(reference.provenance.input_md5, md5(inputPath));
  assert.equal(reference.provenance.script_md5, md5(scriptPath));
  assert.equal(reference.provenance.serialization, 'base R; 17 significant digits');
  assert.deepEqual(reference.cases.map(c => c.id), input.cases.map(c => c.id));
  assert.deepEqual(Array.from(engine.plus.METHODS), methods);
  assert.deepEqual(Array.from(engine.plus.TESTS), tests);
  const select = html.match(/<select id="f-method"[^>]*>([\s\S]*?)<\/select>/)[1];
  assert.deepEqual([...select.matchAll(/<option value="([^"]+)"/g)].map(m => m[1]), methods);
  for (const c of reference.cases) {
    const expected = c.k < 2 ? [] : methods.flatMap(m => (m === 'FE' ? ['z'] : tests).map(t => `${m}/${t}`));
    assert.deepEqual(c.fits.map(f => `${f.method}/${f.test}`), expected, c.id);
  }
});

for (const c of input.cases) {
  const r = refCase(c.id);
  test(`P17 transform ${c.id}: actual prepare matches metafor escalc ZCOR`, () => {
    const actual = engine.plus.prepare(studies(c));
    assert.equal(actual.k, r.k);
    assert.equal(actual.z.length, r.z.length);
    assert.equal(actual.v.length, r.v.length);
    for (let i = 0; i < r.k; i++) {
      near(actual.z[i], r.z[i], `${c.id}.z[${i}]`);
      near(actual.v[i], r.v[i], `${c.id}.v[${i}]`);
    }
  });
  if (c.r.length < 2) {
    test(`P17 policy control ${c.id}: refuse instead of displaying a pooled fit`, () => {
      for (const method of methods) {
        const result = engine.run(c, method);
        assert.equal(result.output, null);
        assert.equal(result.call, null, 'refuse before pooling');
        assert.equal(result.elements.headline.textContent, 'Enter at least 2 studies (label, r, n).');
        assert.equal(result.elements['res-body'].innerHTML, '');
        assert.equal(result.elements['forest-host'].innerHTML, '');
      }
      assert.equal(engine.plus.sensitivity(studies(c)).refused, true);
      assert.equal(engine.plus.leaveOneOut(studies(c), 'REML', 'z').refused, true);
    });
    continue;
  }
  for (const method of methods) {
    test(`P17 main ${c.id}/${method}: parser, pool, CI, PI, forest versus R`, () => {
      const { output, call, elements } = engine.run(c, method);
      const fit = refFit(c.id, method);
      assert.equal(output.k, r.k);
      assert.equal(output.method, method);
      compare(output, fit.values, pageFields, `${c.id}/${method}/page`);
      compare(call.result, {
        mu: fit.values.mu_z, se: fit.values.se_z, tau2: fit.values.tau2_z,
        Q: fit.values.Q, I2: fit.values.I2, ciLo: fit.values.ciLo, ciHi: fit.values.ciHi
      }, ['mu', 'se', 'tau2', 'Q', 'I2', 'ciLo', 'ciHi'], `${c.id}/${method}/pool`);
      for (let i = 0; i < r.k; i++) {
        near(call.z[i], r.z[i], `${c.id}/parser.z[${i}]`);
        near(call.v[i], r.v[i], `${c.id}/parser.v[${i}]`);
      }
      // Recover study CI coordinates from the real forest output on its r scale.
      const lines = [...elements['forest-host'].innerHTML.matchAll(/<line x1='([^']+)'[^>]*x2='([^']+)'[^>]*stroke-width='1.5'/g)];
      assert.equal(lines.length, r.k);
      lines.forEach((m, i) => {
        near((Number(m[1]) - 150) / 190 - 1, r.study_lo[i], `${c.id}/forest.lo[${i}]`);
        near((Number(m[2]) - 150) / 190 - 1, r.study_hi[i], `${c.id}/forest.hi[${i}]`);
      });
    });
  }
  const sensitivity = engine.plus.sensitivity(studies(c));
  for (const f of r.fits) {
    test(`P17 plus ${c.id}/${f.method}/${f.test}: all numerical outputs versus R`, () => {
      const actual = engine.plus.find(sensitivity.cells, f.method, f.test);
      assert.equal(actual.applicable, true);
      assert.equal(actual.k, f.k);
      compare(actual, f.values, numericFields, `${c.id}/${f.method}/${f.test}`);
    });
  }
  test(`P17 PI and applicability control ${c.id}: t(k-1), Wald negative control, FE exclusions`, () => {
    assert.equal(sensitivity.cells.length, 12);
    for (const t of ['knha', 'adhoc']) assert.equal(engine.plus.find(sensitivity.cells, 'FE', t).applicable, false);
    for (const f of r.fits.filter(f => f.method !== 'FE')) {
      const actual = engine.plus.find(sensitivity.cells, f.method, f.test);
      if (f.test === 'z') {
        // R predict(z) uses qnorm; the app explicitly promises a t(k-1) PI.
        assert.ok(Math.abs(f.values.piHi - f.predict_pi[1]) > tolerance);
        assert.ok(Math.abs(actual.piHi - f.predict_pi[1]) > tolerance);
      } else {
        near(actual.piLo, f.predict_pi[0], `${c.id}/${f.method}/${f.test}/predict.lo`);
        near(actual.piHi, f.predict_pi[1], `${c.id}/${f.method}/${f.test}/predict.hi`);
      }
    }
    if (r.k === 2) assert.equal(engine.plus.leaveOneOut(studies(c), 'REML', 'z').refused, true);
  });
  for (const l of r.loo) {
    test(`P17 leave1out ${c.id}/${l.method}/${l.test}: k=2 refits and t(k-2) PIs versus R`, { todo: l.method === 'FE' ? missingFETau2 : false }, () => {
      const actual = engine.plus.leaveOneOut(studies(c), l.method, l.test);
      assert.equal(actual.refused, false);
      assert.equal(actual.rows.length, c.r.length);
      l.rows.forEach((expected, i) => {
        assert.equal(actual.rows[i].omitted_index, i + 1);
        assert.equal(actual.rows[i].omitted, `S${i + 1}`);
        assert.equal(actual.rows[i].k, 2);
        compare(actual.rows[i], expected, Object.keys(expected), `${c.id}/${l.method}/${l.test}/omit${i + 1}`);
      });
    });
  }
}

test('P17 zero-tau controls: identical zero effects, unfloored HKSJ and opt-in ad-hoc floor', () => {
  for (const id of ['homogeneous-q-lt-1', 'identical-zero']) {
    const cells = engine.plus.sensitivity(studies(inputCase(id))).cells;
    for (const method of methods.filter(m => m !== 'FE')) {
      const z = engine.plus.find(cells, method, 'z');
      const kh = engine.plus.find(cells, method, 'knha');
      const adhoc = engine.plus.find(cells, method, 'adhoc');
      assert.equal(z.tau2_z, 0);
      assert.ok(kh.se_z < z.se_z);
      near(adhoc.se_z, z.se_z, `${id}/${method}/floor`);
      near(kh.piLo, kh.ciLo, `${id}/${method}/zero-tau PI equals CI`);
      near(kh.piHi, kh.ciHi, `${id}/${method}/zero-tau PI equals CI`);
      if (id === 'identical-zero') {
        assert.equal(kh.se_z, 0);
        assert.equal(kh.ciLo, 0);
        assert.equal(kh.ciHi, 0);
      }
    }
  }
});

function replaceOnce(source, from, to) {
  assert.equal(source.split(from).length - 1, 1, `mutation anchor: ${from}`);
  return source.replace(from, to);
}

// Isolated, in-memory planted defects demonstrate that the same R assertions
// reject wrong implementations. Production files and oracle values are untouched.
const mutations = [
  {
    name: 'wrong estimator dispatch', id: 'mixed-sign-zero',
    make: () => load({ core: replaceOnce(coreSource, 'var method = opts.method || "PM";', 'var method = "FE";') }),
    check: e => compare(e.run(inputCase('mixed-sign-zero'), 'DL').output,
      refFit('mixed-sign-zero', 'DL').values, pageFields, 'dispatch mutant')
  },
  {
    name: 'normal PI substituted for t(k-1)', id: 'two-studies',
    make: () => load({ core: replaceOnce(coreSource, 'var t = _qt(1 - alpha / 2, df);', 'var t = _qnorm(1 - alpha / 2);') }),
    check: e => compare(e.run(inputCase('two-studies'), 'DL').output,
      refFit('two-studies', 'DL').values, pageFields, 'PI mutant')
  },
  {
    name: 'HKSJ floor enabled without opt-in', id: 'homogeneous-q-lt-1',
    make: () => load({ core: replaceOnce(coreSource, 'if (opts.knhaFloor) q = Math.max(1, q);', 'q = Math.max(1, q);') }),
    check: e => compare(e.plus.find(e.plus.sensitivity(studies(inputCase('homogeneous-q-lt-1'))).cells, 'DL', 'knha'),
      refFit('homogeneous-q-lt-1', 'DL', 'knha').values, numericFields, 'floor mutant')
  },
  {
    name: 'Fisher variance n-1 substituted for n-3', id: 'near-three-n',
    make: () => load({ page: replaceOnce(html, 'v: 1 / (n - 3)', 'v: 1 / (n - 1)') }),
    check: e => compare(e.run(inputCase('near-three-n'), 'FE').output,
      refFit('near-three-n', 'FE').values, pageFields, 'variance mutant')
  },
  {
    name: 'leave-one-out drops wrong variance', id: 'three-studies-loo',
    todo: missingFETau2,
    make: () => load({ plus: replaceOnce(plusSource, 'v = d.v.slice(0, i).concat(d.v.slice(i + 1))', 'v = d.v.slice(1)') }),
    check: e => {
      const actual = e.plus.leaveOneOut(studies(inputCase('three-studies-loo')), 'FE', 'z');
      const expected = refCase('three-studies-loo').loo.find(l => l.method === 'FE' && l.test === 'z');
      compare(actual.rows[1], expected.rows[1], Object.keys(expected.rows[1]), 'LOO mutant');
    }
  }
];
for (const m of mutations) {
  test(`P17 planted defect: rejects ${m.name}; unmodified ${m.id} control passes`, { todo: m.todo || false }, () => {
    m.check(engine);
    assert.throws(() => m.check(m.make()), { code: 'ERR_ASSERTION' });
  });
}

test('P17 FE oracle contract: native-R direct refits fill no values in the preserved original fixture', () => {
  assert.equal(feReference.schema, 'p17-correlation-fe-loo-reference-v1');
  assert.match(feReference.provenance.R, /^R version /);
  for (const name of ['metafor', 'metadat', 'Matrix', 'nlme', 'numDeriv', 'jsonlite']) {
    assert.match(feReference.provenance.packages.find(p => p.package === name)?.version || '', /^\d/);
  }
  const md5 = path => createHash('md5').update(readFileSync(new URL(path, root))).digest('hex');
  assert.equal(feReference.provenance.script_md5, md5(feScriptPath));
  assert.equal(feReference.provenance.input_md5, md5(inputPath));
  assert.equal(feReference.provenance.original_reference_md5,
    md5('hub/shared/tests/r/p17-correlation-reference.json'));
  assert.equal(feReference.provenance.serialization, 'base R; 17 significant digits');
  assert.deepEqual(feReference.cases.map(c => c.id), input.cases.filter(c => c.loo).map(c => c.id));
  for (const c of feReference.cases) {
    assert.equal(c.method, 'FE');
    assert.equal(c.test, 'z');
    assert.equal(c.rows.length, c.k);
    assert.equal(c.package_contract.fe_tau2_present, false);
    assert.equal(c.package_contract.fe_tau2_length, 0);
    assert.equal(c.package_contract.dl_tau2_present, true);
    assert.equal(c.package_contract.dl_tau2_length, c.k);
    const original = refCase(c.id).loo.find(l => l.method === 'FE' && l.test === 'z');
    const dl = refCase(c.id).loo.find(l => l.method === 'DL' && l.test === 'z');
    c.rows.forEach((row, i) => {
      assert.deepEqual(Object.keys(row), Object.keys(original.rows[i]));
      assert.deepEqual(original.rows[i].tau2_z, [], 'retain the original malformed value as evidence');
      assert.equal(row.tau2_z, 0, 'native R direct FE refit reports zero');
      const otherFields = Object.keys(row).filter(key => key !== 'tau2_z');
      compare(row, original.rows[i], otherFields, `${c.id}/original-FE/omit${i + 1}`);
      near(c.package_contract.dl_tau2[i], dl.rows[i].tau2_z, `${c.id}/DL-contract/omit${i + 1}`);
    });
  }
});

function compareDirectFE(e, c) {
  const actual = e.plus.leaveOneOut(studies(inputCase(c.id)), 'FE', 'z');
  assert.equal(actual.refused, false);
  assert.equal(actual.rows.length, c.k);
  c.rows.forEach((expected, i) => {
    assert.equal(actual.rows[i].omitted, `S${i + 1}`);
    assert.equal(actual.rows[i].k, c.k - 1);
    compare(actual.rows[i], expected, Object.keys(expected), `${c.id}/direct-FE/omit${i + 1}`);
  });
}

for (const c of feReference.cases) {
  test(`P17 direct FE leave1out ${c.id}: every output versus native R refits`, () => {
    compareDirectFE(engine, c);
  });
  test(`P17 direct FE planted defect: rejects wrong omitted variance; unmodified ${c.id} control passes`, () => {
    compareDirectFE(engine, c);
    const mutant = mutations.find(m => m.name === 'leave-one-out drops wrong variance').make();
    assert.throws(() => compareDirectFE(mutant, c), { code: 'ERR_ASSERTION' });
  });
}
