'use strict';
// Exact verdict comparison against the R oracle (oracle-verdicts.json): one expected verdict per fit, no alternatives.
// Passes only if every disagreement is in the named allowance below.
const verdicts = new Set(['interior maximum', 'boundary maximum', 'multiple near-equal optima']);
const N = 297;
// Named allowance (REVIEW_209 round 2, MAJOR 3). Exactly these two fits may disagree with R, and only with exactly
// these verdicts; any other disagreement fails. Both are the same rank-one fit (craft2003, rhoW=-0.3). The engine's
// rank-one polish reaches rho = -1 exactly, and its logLik exceeds R's best by 5.4e-10 (x1) and 3.1e-9 (x0.1).
// mvmeta and rma.mv parametrise G by an unconstrained Cholesky factor, in which |rho| = 1 is at infinity, so R's
// optimizers stop short of the boundary (rho -0.999864 at x1, -0.999234 at x0.1) and R calls it "multiple near-equal
// optima" at x1 and "interior maximum" at x0.1. At x10 R reaches the boundary and agrees.
const ALLOWED = new Map([
  ['metadat::dat.craft2003::acog.asom+asom.conf::REML::rcalc#rhoW=-0.3@x1', { expected: 'multiple near-equal optima', actual: 'boundary maximum' }],
  ['metadat::dat.craft2003::acog.asom+asom.conf::REML::rcalc#rhoW=-0.3@x0.1', { expected: 'interior maximum', actual: 'boundary maximum' }]
]);
const allowed = f => { const a = ALLOWED.get(f.id); return !!a && f.reason === 'wrong verdict' && f.expected === a.expected && f.actual === a.actual; };
function compare(expected, actual) {
  if (expected.length !== N || new Set(expected.map(f => f.id)).size !== N) throw Error(`Expected population must contain exactly ${N} unique IDs`);
  if (!expected.every(f => verdicts.has(f.verdict))) throw Error('Every expected record needs exactly one known verdict');
  const counts = new Map(), byId = new Map(), failures = [];
  for (const f of actual) { counts.set(f.id, (counts.get(f.id) || 0) + 1); byId.set(f.id, f); }
  const ids = new Set(expected.map(f => f.id));
  for (const f of actual) if (!ids.has(f.id)) failures.push({ id: f.id, reason: 'unexpected ID' });
  let agreement = 0;
  for (const f of expected) {
    const observed = byId.get(f.id);
    if (counts.get(f.id) !== 1) failures.push({ id: f.id, reason: observed ? 'duplicate ID' : 'missing ID' });
    else if (!observed.diagnostic || observed.diagnostic.verdict !== f.verdict)
      failures.push({ id: f.id, reason: 'wrong verdict', expected: f.verdict, actual: observed.diagnostic && observed.diagnostic.verdict });
    else agreement++;
  }
  for (const f of failures) f.allowed = allowed(f);
  const unexplained = failures.filter(f => !f.allowed).length;
  return { expected: N, actual: actual.length, agreement, passed: unexplained === 0 && actual.length === N, allowedDisagreements: failures.length - unexplained, unexplained, failures };
}
module.exports = { compare, N, ALLOWED };
if (require.main === module) {
  const fs = require('node:fs'), path = require('node:path');
  const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
  const expected = read(path.join(__dirname, 'oracle-verdicts.json')).fits;
  const actual = read(process.argv[2]).fits;
  const result = compare(expected, actual);
  console.log(`${result.agreement}/${result.expected} agreement; ${result.failures.length} failures (${result.allowedDisagreements} named allowance, ${result.unexplained} unexplained)`);
  if (!result.passed) console.log(JSON.stringify(result.failures.filter(f => !f.allowed), null, 2));
  process.exitCode = result.passed ? 0 : 1;
}
