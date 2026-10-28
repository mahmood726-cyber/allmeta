import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Node replay of the header requirement in usability-nma.spec.mjs: accept the
// header without dropping studies, and preserve results for equivalent data.
// Native estimates and netmeta TE have opposite directions.
const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('nma/index.html', root), 'utf8');
const engine = readFileSync(new URL('shared/nma-multiarm-v1.js', root), 'utf8');
const browserSpec = readFileSync(new URL('hub/shared/tests/usability-nma.spec.mjs', root), 'utf8');
const expectedDisplay = vm.runInNewContext(browserSpec.match(/const VS_REFERENCE = (\[[\s\S]*?\]);/)[1]);
// Captured verbatim from the requested R run in pass-1 FEEDBACK.md. The fixture
// records the generator and R/package versions; no existing reference is replaced.
const rReference = JSON.parse(readFileSync(new URL('./fixtures/nma-header-convention.json', import.meta.url), 'utf8'));
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).find(code => code.includes('function parseContrasts'));
assert.ok(script);
const source = script.slice(0, script.indexOf('    const loaded = loadSaved();')) +
  'window.headerTest = { parseContrasts, render, example: EXAMPLE }; })();';
const netmetaHeader = 'studlab, treat1, treat2, TE, seTE';
const plain = value => JSON.parse(JSON.stringify(value));

function harness(plantMissingConversion = false) {
  const elements = new Map();
  const element = () => ({ value: '', innerHTML: '', textContent: '', children: [],
    classList: { add() {}, remove() {} }, appendChild(child) { this.children.push(child); } });
  const document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  }, createElement: element };
  const window = { alm: { analysisLifecycle: fn => fn } };
  const context = vm.createContext({ window, document, localStorage: { setItem() {} } });
  vm.runInContext(engine, context);
  let page = source;
  if (plantMissingConversion) {
    const conversion = '(netmetaHeader ? -1 : 1) * Number(parts[3])';
    assert.ok(page.includes(conversion), 'plant must replace the actual conversion');
    page = page.replace(conversion, 'Number(parts[3])');
  }
  vm.runInContext(page, context);
  return {
    example: window.headerTest.example.split('\n').filter(line => !line.startsWith('#')).join('\n'),
    parse: text => plain(window.headerTest.parseContrasts(text)),
    compute: text => plain(window.__almNmaCompute(text, 'DrugA')),
    render(data) {
      for (const [key, value] of Object.entries({ data, model: 'fe', ref: 'DrugA',
        ci: 'classic', dir: 'desirable', scale: 'log' })) {
        document.getElementById('f-' + key).value = value;
      }
      window.headerTest.render();
      const table = document.getElementById('ref-host').innerHTML.split('<tbody>')[1];
      assert.ok(table, 'valid input must render the reference table');
      return [...table.matchAll(/<tr>(.*?)<\/tr>/g)].map(row =>
        [...row[1].matchAll(/<td>(.*?)<\/td>/g)].map(cell => cell[1]).join(' | '));
    }
  };
}

function asNetmeta(native) {
  return netmetaHeader + '\n' + native.split('\n').map(line => {
    const cells = line.split(',').map(cell => cell.trim());
    cells[3] = String(-Number(cells[3]));
    return cells.join(',');
  }).join('\n');
}

test('CI-267 control: native header aliases preserve the built-in example', () => {
  const h = harness(), baseline = h.parse(h.example);
  assert.equal(baseline.rows.length, 10);
  for (const header of ['', 'study, treatment1, treatment2, est, SE',
    'study,treatment1,treatment2,estimate,se', 'trial\tt1\tt2\tyi\tse']) {
    const input = header ? header + '\n' + h.example : h.example;
    assert.deepEqual(h.parse(input).rows, baseline.rows);
    assert.deepEqual(h.parse(input).warnings, []);
    assert.deepEqual(h.render(input), plain(expectedDisplay));
  }
});

function assertEquivalentNetmeta(h) {
  const input = asNetmeta(h.example), parsed = h.parse(input);
  assert.equal(parsed.netmetaHeader, true);
  assert.deepEqual(parsed.warnings, []);
  assert.deepEqual(parsed.rows, h.parse(h.example).rows);
  assert.deepEqual(h.render(input), plain(expectedDisplay));
}

test('CI-267: equivalent netmeta input skips the header and preserves the displayed analysis', () => {
  assertEquivalentNetmeta(harness());
});

test('CI-267 diagnosis: the legacy header-only substitution asserts opposite effect directions are equal', () => {
  const h = harness(), native = h.parse(h.example).rows;
  const input = netmetaHeader + '\n' + h.example;
  assert.deepEqual(h.parse(input).warnings, []);
  assert.deepEqual(h.parse(input).rows, native.map(row => ({ ...row, est: -row.est })));
  assert.deepEqual(h.render(h.example), plain(expectedDisplay));
  // This is the unchanged browser assertion on the exact same built-in data.
  // It must disagree once a netmeta header correctly declares the TE direction.
  assert.throws(() => assert.deepEqual(h.render(input), plain(expectedDisplay)),
    { code: 'ERR_ASSERTION' });
});

test('CI-267 planted defect: omitting netmeta conversion breaks equivalence while the native control survives', () => {
  const mutant = harness(true);
  assert.deepEqual(mutant.render(mutant.example), plain(expectedDisplay));
  assert.throws(() => assertEquivalentNetmeta(mutant), { code: 'ERR_ASSERTION' });
  assertEquivalentNetmeta(harness());
});

function assertRReference(h, input, reference) {
  const result = h.compute(input);
  assert.equal(result.error, undefined);
  const a = result.analysis, ref = a.treatments.indexOf('DrugA');
  assert.deepEqual(a.treatments.filter(t => t !== 'DrugA'), reference.map(row => row.treatment));
  for (const row of reference) {
    const i = a.treatments.indexOf(row.treatment);
    for (const [field, matrix] of [['estimate', 'TE'], ['se', 'seTE'],
      ['lower', 'lower'], ['upper', 'upper'], ['p', 'pval']]) {
      const actual = a.common[matrix][i][ref];
      // Same numerical tolerance as the existing P0-2 netmeta unit test;
      // the rendered rows below must additionally match R exactly.
      assert.ok(Math.abs(actual - row[field]) < 1e-6,
        `${row.treatment} ${field}: ${actual} vs R ${row[field]}`);
    }
  }
  assert.deepEqual(h.render(input), reference.map(row => row.display));
}

test('CI-267 R control: native and equivalent netmeta input match the recorded R analysis', () => {
  const h = harness();
  assert.deepEqual(h.parse(h.example).rows.map(({ study, t1, t2, est, se }) =>
    ({ study, treat1: t1, treat2: t2, est, se })), rReference.native_rows);
  assertRReference(h, h.example, rReference.native_as_netmeta);
  assertRReference(h, asNetmeta(h.example), rReference.native_as_netmeta);
});

test('CI-267 R diagnosis: unchanged rows under a netmeta header match the opposite R contrasts', () => {
  const h = harness();
  assertRReference(h, netmetaHeader + '\n' + h.example,
    rReference.unchanged_rows_under_netmeta_header);
});

test('CI-267 R planted defect: missing conversion fails R parity while the native control survives', () => {
  const mutant = harness(true);
  assertRReference(mutant, mutant.example, rReference.native_as_netmeta);
  assert.throws(() => assertRReference(mutant, asNetmeta(mutant.example), rReference.native_as_netmeta),
    { code: 'ERR_ASSERTION' });
  const current = harness();
  assertRReference(current, asNetmeta(current.example), rReference.native_as_netmeta);
});
