// RapidMeta engine on the canonical Hasselblad smoking-cessation NMA.
// Routes through the real bus path (canonical-datasets → arm-level →
// ma-comparisons buildEnvelope → toContrasts → nma-multiarm fit) and dumps
// both the arm-level data (for netmeta) and the RapidMeta league/SUCRA.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const DS = require('../../shared/canonical-datasets.js');
const MC = require('../../shared/ma-comparisons-v1.js');
const NM = require('../../shared/nma-multiarm-v1.js');

const ds = DS.get('smoking');
// Build arm-level studies from the 2-arm binary_contrasts.
const studies = ds.binary_contrasts.map((r) => ({
  id: r.studyId,
  arms: [
    { treatment: r.trtA, events: r.events_T, n: r.n_T },
    { treatment: r.trtB, events: r.events_C, n: r.n_C },
  ],
}));
writeFileSync(new URL('./hasselblad_arms.json', import.meta.url),
  JSON.stringify({ reference: ds.reference, measure: ds.measure, studies }, null, 2));

const env = MC.buildEnvelope(studies, 'OR');
const rows = MC.toContrasts(env).map((c) => ({ study: c.study, t1: c.treatment2, t2: c.treatment1, est: c.te, se: c.se }));
const out = {};
for (const model of ['fe', 're']) {
  const fit = NM.fit(rows, { ref: ds.reference, model });
  const eff = {};
  fit.nonref.forEach((t, k) => { eff[t] = { TE: fit.d[k], se: Math.sqrt(fit.cov[k][k]) }; });
  out[model] = { tau2: fit.tau2, Q: fit.Q, df: fit.df, ref: fit.refTreat, eff, multiArm: fit.multiArmStudies };
}
writeFileSync(new URL('./hasselblad_rapidmeta.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('RapidMeta Hasselblad: ref =', out.fe.ref, '| treatments =', Object.keys(out.fe.eff).join(', '));
console.log('FE tau2=0 by construction; RE tau2 =', out.re.tau2.toFixed(6), 'Q=', out.re.Q.toFixed(4), 'df=', out.re.df);
for (const t of Object.keys(out.fe.eff)) {
  console.log(`  ${t}: FE logOR=${out.fe.eff[t].TE.toFixed(6)} (se ${out.fe.eff[t].se.toFixed(6)}) | RE logOR=${out.re.eff[t].TE.toFixed(6)} (se ${out.re.eff[t].se.toFixed(6)})`);
}
