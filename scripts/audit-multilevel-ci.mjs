// Read-only reproduction of the numeric assertion in multilevel-ma-features.spec.mjs.
// No new reference values: replay the existing protected R fixture and tolerance.
// Exit nonzero on disagreement. This diagnostic must not turn a known failure green.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPageFunctions } from '../hub/shared/tests/features-helpers.mjs';

const root = new URL('../', import.meta.url);
const path = name => fileURLToPath(new URL(name, root));
const reference = JSON.parse(readFileSync(path(
  'hub/shared/tests/fixtures/features/multilevel-ma/mom-reference.json'), 'utf8'));
const { fit } = loadPageFunctions(path('multilevel-ma/index.html'), ['fit'], {},
  ['shared/stats-qt.js', 'shared/ma-core.js'].map(path));
const keys = ['mu', 'seMu', 'seMuHK', 'tau2_study', 'tau2_within',
  'ci_lb_hk', 'ci_ub_hk', 'pi_lb', 'pi_ub'];
const tally = Object.fromEntries(keys.map(key => [key, { pass: 0, fail: 0, max: 0 }]));
let firstFailure;
for (const cfg of reference.configs) {
  const ids = new Map();
  const rows = cfg.rows.map(([cluster, te, variance]) => {
    if (!ids.has(cluster)) ids.set(cluster, 'C' + (ids.size + 1));
    return { study: ids.get(cluster), te, se: Math.sqrt(variance), label: '' };
  });
  const f = fit(rows);
  const actual = { ...f, ci_lb_hk: f.mu - f.tCrit * f.seMuHK,
    ci_ub_hk: f.mu + f.tCrit * f.seMuHK, pi_lb: f.piLo, pi_ub: f.piHi };
  for (const key of keys) {
    const difference = Math.abs(actual[key] - cfg.ref[key]) / Math.max(1, Math.abs(cfg.ref[key]));
    tally[key].max = Math.max(tally[key].max, difference);
    if (Number.isFinite(actual[key]) && Number.isFinite(cfg.ref[key]) && difference < 1e-6) {
      tally[key].pass++;
    } else {
      tally[key].fail++;
      firstFailure ??= { configuration: cfg.id, key, actual: actual[key], reference: cfg.ref[key] };
    }
  }
}
console.log(JSON.stringify({ configurations: reference.configs.length,
  sourceR: reference.R, tolerance: 1e-6, tally, firstFailure }, null, 2));
process.exitCode = Object.values(tally).some(row => row.fail) ? 1 : 0;
