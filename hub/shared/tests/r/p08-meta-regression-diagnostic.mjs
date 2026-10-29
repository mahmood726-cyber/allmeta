// Prints evidence only; no engine mutations or fixture writes.
import { readFileSync } from 'node:fs';
import { loadPage, loadLocationScale, differences, pmExpected } from '../unit/p08-meta-regression-harness.mjs';
const fixture = new URL('./p08-meta-regression-reference.json', import.meta.url);
const r = JSON.parse(readFileSync(fixture, 'utf8'));
const page = loadPage(), ls = loadLocationScale();
for (const c of r.input.pm) {
  const ref = r.pm.find(x => x.id === c.id), a = page(c);
  console.log(JSON.stringify({ id: c.id, R: ref, app: a, differences: ref.status === 'ok' ? differences(a.result, pmExpected(ref)).concat(differences(a.pi, ref.pi)) : [] }));
}
for (const c of r.input.ls) {
  const ref = r.ls.find(x => x.id === c.id), a = ls(c);
  const keys = ['beta', 'betaSE', 'betaVcov', 'alpha', 'alphaSE', 'alphaVcov', 'tau2', 'logLik'];
  console.log(JSON.stringify({ id: c.id, R: ref, app: a, differences: differences(a, Object.fromEntries(keys.map(k => [k, ref[k]]))) }));
}
