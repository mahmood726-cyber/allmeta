// Read-only supplemental audit: print every discrepancy, including later rows
// that a failing test's first assertion would otherwise conceal. No artifacts.
import { read, loadInfluence, compare, TOL } from './influence-p11-harness.mjs';

const input = JSON.parse(read('hub/shared/tests/r/influence-p11-input.json'));
const reference = JSON.parse(read('hub/shared/tests/r/influence-p11-reference.json'));
const discrepancies = [];
let comparisons = 0, maxAbsoluteDifference = 0;
function audit(actual, expected, label) {
  for (const key of Object.keys(expected)) {
    comparisons++;
    if (typeof actual?.[key] === 'number' && typeof expected[key] === 'number') {
      maxAbsoluteDifference = Math.max(maxAbsoluteDifference, Math.abs(actual[key] - expected[key]));
    }
    try { compare(actual, expected, [key], label); }
    catch (error) {
      if (error.code !== 'ERR_ASSERTION' || !Array.isArray(error.actual)) throw error;
      discrepancies.push(...error.actual);
    }
  }
}
for (const c of input.cases) {
  const r = reference.cases.find(x => x.id === c.id), app = loadInfluence();
  const a = app.analyze(c);
  audit(a.full, r.full, `${c.id}.full`);
  r.diag.forEach((d, i) => audit({ ...a.diag[i], tau2_del: a.diag[i]?.loo_tau2, QE_del: a.diag[i]?.loo_Q }, d, `${c.id}.diag[${i}]`));
  for (const e of r.exclusions) audit(app.exclude(e.excluded).kept, e.kept, `${c.id}.exclusion[${e.excluded}]`);
}
console.log(JSON.stringify({ tolerance: TOL, comparisons, maxAbsoluteDifference, discrepancies }, null, 2));
if (discrepancies.length) process.exitCode = 1;
