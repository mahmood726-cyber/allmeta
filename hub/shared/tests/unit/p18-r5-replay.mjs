// Read-only numerical replay; stdout is captured by the external job wrapper.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import M from '../../../../shared/multivariate-ma.js';
const source = readFileSync(new URL('../../../../shared/multivariate-ma.js', import.meta.url));
const reference = JSON.parse(readFileSync(new URL('./p18-r5-reference.json', import.meta.url), 'utf8'));
console.log('engine sha256:', createHash('sha256').update(source).digest('hex'));
for (const c of reference.cases.filter(c => c.shape === 'zero')) {
  const objective = M._obj2(c.studies, 0, 0, 0);
  try {
    const f = M.fit(c.studies);
    console.log(JSON.stringify({ scale: c.scale, objective: String(objective), generic: M._objG(c.studies, c.G),
      mu: f.mu, muSE: f.muSE, G: f.G, logLik: f.logLik, boundary: f.optimizer.boundary }));
  } catch (error) {
    console.log(JSON.stringify({ scale: c.scale, objective: String(objective), generic: M._objG(c.studies, c.G), error: error.message }));
  }
}
const fit = M.fit(reference.berkey.studies);
console.log('Berkey:', JSON.stringify({ mu: fit.mu, muSE: fit.muSE, G: fit.G, rho: fit.rho, logLik: fit.logLik }));
