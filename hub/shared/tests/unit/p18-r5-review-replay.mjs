// Read-only replay of the retained validation populations. No validation files are rewritten.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import M from '../../../../shared/multivariate-ma.js';
import baseline from '../../../../multivariate-ma/validate/diagnostic/baseline-engine.cjs';
import diagnosticReplay from '../../../../multivariate-ma/validate/diagnostic/run.cjs';
import comparison from '../../../../multivariate-ma/validate/diagnostic/compare.cjs';

const corpus = JSON.parse(readFileSync(new URL('../../../../multivariate-ma/validate/plus/corpus.json', import.meta.url), 'utf8'));
let fits = 0, exact = 0, refusals = 0;
function same(s) {
  let before, after, errorBefore, errorAfter;
  try { before = baseline.fit(s); } catch (e) { errorBefore = e.message; }
  try { after = M.fit(s); } catch (e) { errorAfter = e.message; }
  assert.equal(errorAfter, errorBefore);
  if (errorBefore) { refusals++; return; }
  const { diagnostic, ...rest } = after;
  assert.ok(diagnostic);
  fits++;
  try { assert.deepEqual(rest, before); exact++; } catch (e) {
    if (fits - exact === 1) console.log('First changed fit:', JSON.stringify({ before, after: rest }));
  }
}
for (const c of corpus.configurations) {
  for (const rw of [null, ...corpus.grid]) same(c.rows.map(r => {
    const cov = rw === null ? r.cov : rw * Math.sqrt(r.v[0] * r.v[1]);
    return { y: r.y, S: [[r.v[0], cov], [cov, r.v[1]]] };
  }));
  for (const j of [0, 1]) same(c.rows.map(r => ({ y: [r.y[j]], S: [[r.v[j]]] })));
}
console.log(JSON.stringify({ node: process.version, configurations: corpus.configurations.length, fits, exact, refusals }));
const expected = JSON.parse(readFileSync(new URL('../../../../multivariate-ma/validate/diagnostic/oracle-verdicts.json', import.meta.url), 'utf8')).fits;
const result = comparison.compare(expected, diagnosticReplay.fits(M, true));
console.log('Retained R verdict comparison:', JSON.stringify(result));
assert.equal(result.passed, true);
assert.equal(exact, fits, 'every preexisting fit field must remain exactly equal');
