// Validated-engine cross-check: run the allmeta MBNMA Emax/BMA engine on the
// extracted obesity contrasts. Reuses allmeta nma-dose-response-app/src/dose-response/bma-bmd.js
// (no re-implementation). Reads contrasts.csv produced by fit.py.
//
// Per agent we build {dose, response, n, responseVar} with a dose=0 control of
// response 0 (placebo contrast), so the engine fits the weight-LOSS surface.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { BayesianModelAveragedBMD } = await import(
  pathToFileURL('C:/Projects/allmeta/nma-dose-response-app/src/dose-response/bma-bmd.js').href);

const csv = readFileSync('C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/contrasts.csv', 'utf8')
  .trim().split(/\r?\n/);
const head = csv[0].split(',');
const rows = csv.slice(1).map(l => {
  const c = l.split(','); const o = {}; head.forEach((h, i) => o[h] = c[i]); return o;
});

const byAgent = {};
for (const r of rows) (byAgent[r.agent] ??= []).push(r);

for (const [agent, rs] of Object.entries(byAgent)) {
  // pool to one point per dose (inverse-variance mean) so the engine sees a clean curve
  const byDose = {};
  for (const r of rs) {
    const d = +r.dose, loss = +r.loss, v = +r.var;
    (byDose[d] ??= []).push({ loss, w: 1 / Math.max(v, 1e-6) });
  }
  const data = [{ dose: 0, response: 0, n: 100, responseVar: 0.1 }];
  for (const [d, pts] of Object.entries(byDose)) {
    const W = pts.reduce((s, p) => s + p.w, 0);
    const mean = pts.reduce((s, p) => s + p.loss * p.w, 0) / W;
    data.push({ dose: +d, response: mean, n: 100, responseVar: 1 / W });
  }
  data.sort((a, b) => a.dose - b.dose);
  if (data.length < 3) { console.log(`${agent}: ${data.length} dose pts (<3) — engine needs >=3; skip`); continue; }
  try {
    const res = BayesianModelAveragedBMD(data, { bmr: 0.1, bmrType: 'absolute', nBootstrap: 200, nSamples: 2000 });
    const doseStr = data.map(d => `${d.dose}:${d.response.toFixed(1)}`).join(' ');
    console.log(`\n${agent}  [${doseStr}]`);
    console.log('  model weights:', Object.entries(res.modelWeights || res.weights || {})
      .map(([m, w]) => `${m}=${(+w).toFixed(2)}`).join(' '));
    if (res.bmd != null) console.log(`  BMA-BMD=${(+res.bmd).toFixed(2)}mg  CI[${(+res.bmdLower).toFixed(2)}, ${(+res.bmdUpper).toFixed(2)}]`);
  } catch (e) {
    console.log(`${agent}: engine error — ${e.message}`);
  }
}
