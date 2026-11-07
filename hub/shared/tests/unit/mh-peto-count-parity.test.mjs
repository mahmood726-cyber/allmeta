import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { input, loadEngine, near, tolerance } from '../r/mh-peto-edge-harness.mjs';

// Supplement the original fixture and TODOs; never replace their expected values.
const diagnostic = JSON.parse(readFileSync(new URL('../r/mh-peto-count-diagnostic.json', import.meta.url), 'utf8'));
const engine = loadEngine();
const cases = input.cases.flatMap(cfg => [
  { id: `${cfg.id}|full`, rows: cfg.rows },
  ...(cfg.rows.length < 3 ? [] : cfg.rows.map((_, i) => ({
    id: `${cfg.id}|omit${i + 1}`, rows: cfg.rows.filter((_, j) => j !== i),
    originalRows: cfg.rows, omit: i,
  }))),
]);

test('P10 control: native Peto count diagnostic matches inputs, generator and versions', () => {
  assert.equal(diagnostic.schema, 'mh-peto-count-diagnostic-v1');
  assert.deepEqual(Object.keys(diagnostic.fits).sort(), cases.map(c => c.id).sort());
  for (const [key, file] of [['input', 'mh-peto-edge-input.json'], ['script', 'mh-peto-count-diagnostic.R']]) {
    const bytes = readFileSync(new URL(`../r/${file}`, import.meta.url));
    assert.equal(createHash('md5').update(bytes).digest('hex'), diagnostic.provenance[`${key}_md5`]);
  }
  assert.match(diagnostic.provenance.R, /^R version /);
  for (const pkg of ['metafor', 'jsonlite']) assert.match(diagnostic.provenance[pkg], /^\d+\./);
  // The installed canonical function body is retained alongside its output.
  assert.match(diagnostic.rma_peto_body.join('\n'), /QEp <- pchisq\(QE, df = k\.yi - 1/);
});

function compareCounts(actual, ref, label) {
  // rma.peto uses k.yi - 1 for Q; k.pos controls its <=1 special case.
  assert.equal(ref.counts['k.yi'], ref.counts['k.pos'], `${label}: diagnostic informative counts`);
  near(actual.k, ref.counts['k.yi'], `${label}.k versus R k.yi`);
  near(actual.df, ref.counts['k.pos'] > 1 ? ref.counts['k.yi'] - 1 : 0, `${label}.df`);
  for (const field of ['QE', 'QEp', 'I2', 'H2']) near(actual[field], ref[field], `${label}.${field}`);
}

for (const cfg of cases) test(`P10 Peto count parity: ${cfg.id}`, () => {
  const ref = diagnostic.fits[cfg.id];
  const analysis = engine.analyse(cfg.rows, 'OR');
  if (ref.error) {
    assert.equal(typeof ref.error, 'string');
    assert.ok(ref.error.length > 0);
    assert.equal(analysis.petoFit, null, `${cfg.id}: R refuses the non-estimable fit`);
  } else {
    compareCounts(analysis.het.peto, ref, cfg.id);
    if (cfg.originalRows) {
      const omitted = engine.leaveOneOut(cfg.originalRows, 'OR').rows[cfg.omit].peto;
      compareCounts(omitted, ref, `${cfg.id}: actual leaveOneOut output`);
    }
  }
});

test('P10 control: Peto total-row df differs from the canonical Q calculation', () => {
  const regular = diagnostic.fits['regular_control|full'];
  assert.equal(regular.counts.k, regular.counts['k.yi']);
  near(regular.p_using_k_minus_1, regular.QEp, 'ordinary count control');
  const boundary = diagnostic.fits['loo_boundary|full'];
  assert.ok(boundary.counts.k > boundary.counts['k.yi']);
  assert.ok(Math.abs(boundary.p_using_k_minus_1 - boundary.QEp) > tolerance);
  compareCounts(engine.analyse(input.cases.find(c => c.id === 'loo_boundary').rows, 'OR').het.peto,
    boundary, 'unchanged-engine informative-count control');
});

test('P10 planted defect: Peto includes uninformative tables in Q degrees of freedom', () => {
  const rows = input.cases.find(c => c.id === 'loo_boundary').rows;
  const ref = diagnostic.fits['loo_boundary|full'];
  compareCounts(engine.analyse(rows, 'OR').het.peto, ref, 'unchanged-engine control');
  const mutant = loadEngine([
    'if ((a === 0 && c === 0) || (b === 0 && d === 0)) { yi.push(NaN); vi.push(NaN); return; }',
    'if ((a === 0 && c === 0) || (b === 0 && d === 0)) { yi.push(0); vi.push(Infinity); return; }',
  ]).analyse(rows, 'OR').het.peto;
  assert.throws(() => compareCounts(mutant, ref, 'planted total-row count'), { code: 'ERR_ASSERTION' });
  assert.throws(() => near(mutant.QEp, ref.QEp, 'planted wrong Q p-value'), { code: 'ERR_ASSERTION' });
});
