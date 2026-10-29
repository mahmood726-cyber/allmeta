// Investigation only: preserves native R results separately from stable arithmetic.
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import harness from './input-harness.cjs';
const app = new URL('../', import.meta.url);
const fixture = new URL('fixtures/p12-conditioning-reference.json', import.meta.url);
const ref = JSON.parse(readFileSync(existsSync(fixture) ? fixture : join(tmpdir(), 'p12-conditioning-reference.json'), 'utf8'));
const h = harness.load(fileURLToPath(new URL('index.html', app)), fileURLToPath(new URL('plus-ui.js', app)));
for (const [name, r] of Object.entries(ref.cases)) {
  const c = r.input;
  let result, error;
  try { result = h.run(c.te.map((te, i) => `${te}, ${c.se[i]}`).join('\n')); }
  catch (e) { error = e.message; }
  console.log(JSON.stringify({name, native: r.native, diagnostic: r.diagnostic,
    actual: result && {estimate: result.limit_est, se: result.limit_se, ci: [result.limit_ci_lo, result.limit_ci_hi], tau2: result.tau2_dl},
    error: error || h.nodes['limit-error'].textContent}));
}
