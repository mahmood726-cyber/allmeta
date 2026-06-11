/* Engine handoff demo: drive allmeta/HTA's VALIDATED evppi.js with OUR registry-native posteriors.
 *
 * Builds a minimal lifetime cost-effectiveness PSA (tirzepatide vs semaglutide) from our transported
 * efficacy + survival-HR + nausea posteriors, then computes monetary EVPPI per parameter at NICE WTP.
 *
 * EVERY cost/utility coefficient below is a TRANSPARENT PLACEHOLDER (UK-list-price-ish, illustrative
 * utilities) — NOT a real CEA input. Cost/utility data are NOT in AACT/CT.gov/PubMed (the data policy),
 * so they are labelled, fixed, and not claimed as evidence. The point is the HANDOFF + that the engine
 * reproduces our registry-native VOI direction (CV evidence dominates) in monetary units.
 */
'use strict';
const fs = require('fs');
const HTA = 'C:/Projects/allmeta/HTA/src';
const { KahanSum } = require(HTA + '/utils/kahan');   // canonical; mathUtils uses it as a global
global.KahanSum = KahanSum;
const { StatUtils } = require(HTA + '/utils/mathUtils');
global.StatUtils = StatUtils;
const { EVPPICalculator } = require(HTA + '/engine/evppi');

const ROOT = 'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma';
const v2 = JSON.parse(fs.readFileSync(ROOT + '/transport_v2.json'))
  .nodes.reduce((m, n) => (m[n.node] = n, m), {});
const surv = JSON.parse(fs.readFileSync(ROOT + '/survival_nma.json'))
  .survival_nma_by_agent.reduce((m, r) => (m[r.agent] = r, m), {});
const br = JSON.parse(fs.readFileSync(ROOT + '/benefit_risk.json'))
  .nodes.reduce((m, n) => (m[n.node] = n, m), {});

// seeded RNG (mulberry32) + Box-Muller
let s = 20260610 >>> 0;
const u = () => (s = (s + 0x6D2B79F5) >>> 0, (((s ^ s >>> 15) * (1 | s)) ^ ((s ^ s >>> 15) * (1 | s)) + ((s ^ s >>> 15) >>> 7)) >>> 0) / 4294967296 || 1e-10;
const norm = (m, sd) => m + sd * Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());

// ---- PLACEHOLDER cost/utility model (illustrative, UK-flavoured) ----
const P = {
  horizonYr: 10, disc: 0.035,
  utilPerPpWeight: 0.0028,          // QALY/yr per pp body-weight lost (illustrative)
  baseMACErisk: 0.028,             // annual MACE risk in this population (illustrative)
  qalyPerMACE: 0.55,               // QALY lost per MACE event (illustrative)
  costPerMACE: 9000,               // £ per MACE event (illustrative)
  // placeholder prices chosen so the better agent carries a PREMIUM -> ICER near the NICE threshold
  // (the only regime where EVPPI is informative; real list prices would be supplied by the jurisdiction)
  drugCostYr: { tirzepatide: 2050, semaglutide: 1600 }, // £/yr, illustrative
  nauseaDisutil: 0.012,            // first-year transient disutility if nausea (illustrative)
};
const disc = t => 1 / Math.pow(1 + P.disc, t);
const dsum = (fn) => { let a = 0; for (let t = 0; t < P.horizonYr; t++) a += fn(t) * disc(t); return a; };

function draw(agent) {
  const effNode = agent === 'semaglutide' ? v2['semaglutide-sc-weekly'] : v2[agent];
  const [elo, ehi] = effNode.target_cri;
  const eff = norm(effNode.eff_target, (ehi - elo) / 3.92);          // transported weight loss (pp)
  const sv = surv[agent];
  const [clo, chi] = sv.ci;
  const hr = Math.exp(norm(Math.log(sv.pooled_hr), (Math.log(chi) - Math.log(clo)) / 3.92)); // CV HR
  const nNode = br[effNode.node] || br[agent] || Object.values(br).find(x => x.node.startsWith(agent));
  const nausea = (nNode ? nNode.nausea_pct : 20) / 100;
  return { eff, hr, nausea };
}
function model(d, agent) {
  const qWeight = dsum(() => P.utilPerPpWeight * d.eff);
  const maceAverted = P.baseMACErisk * (1 - d.hr);                   // vs HR=1 reference
  const qMACE = dsum(() => maceAverted * P.qalyPerMACE);
  const qNausea = -P.nauseaDisutil * d.nausea;                       // first year only
  const qaly = qWeight + qMACE + qNausea;
  const cost = dsum(() => P.drugCostYr[agent]) - dsum(() => maceAverted * P.costPerMACE);
  return { qaly, cost };
}

const N = 4000;
const inc_q = [], inc_c = [], pEff = [], pCV = [], pNaus = [];
for (let i = 0; i < N; i++) {
  const dt = draw('tirzepatide'), ds = draw('semaglutide');
  const mt = model(dt, 'tirzepatide'), ms = model(ds, 'semaglutide');
  inc_q.push(mt.qaly - ms.qaly); inc_c.push(mt.cost - ms.cost);
  pEff.push(dt.eff - ds.eff); pCV.push(dt.hr - ds.hr); pNaus.push(dt.nausea - ds.nausea);
}
const psaResults = { scatter: { incremental_qalys: inc_q, incremental_costs: inc_c } };
const parameterSamples = { efficacy: pEff, cv: pCV, nausea: pNaus };

console.log('Engine handoff: OUR posteriors -> allmeta/HTA evppi.js  (tirzepatide vs semaglutide, N=' + N + ')');
console.log('** cost/utility inputs are PLACEHOLDER/illustrative — not in the data policy, not claimed as evidence **\n');
const meanQ = inc_q.reduce((a, b) => a + b) / N, meanC = inc_c.reduce((a, b) => a + b) / N;
console.log('incremental (tirz - sema): dQALY ' + meanQ.toFixed(3) + ', dCost £' + meanC.toFixed(0) +
  '  -> ICER £' + (meanC / meanQ).toFixed(0) + '/QALY (placeholder)\n');

const calc = new EVPPICalculator();
const out = { incremental: { dQALY: +meanQ.toFixed(3), dCost: Math.round(meanC) }, wtp: {} };
for (const wtp of [20000, 30000]) {
  const res = calc.calculateAll(psaResults, wtp, parameterSamples);
  console.log('--- WTP £' + wtp + '/QALY (NICE range) ---');
  console.log('  total EVPI = £' + res.totalEVPI.toFixed(0) + ' / patient');
  for (const r of res.parameters)
    console.log('  EVPPI(' + r.parameter.padEnd(8) + ') = £' + r.evppi.toFixed(0) +
      '  (' + r.percentOfEVPI.toFixed(0) + '% of EVPI)');
  console.log('  -> highest-EVPPI parameter = where resolving uncertainty is most valuable\n');
  out.wtp[wtp] = { totalEVPI: Math.round(res.totalEVPI),
    parameters: res.parameters.map(r => ({ parameter: r.parameter, evppi: Math.round(r.evppi), percentOfEVPI: Math.round(r.percentOfEVPI) })) };
}
fs.writeFileSync(ROOT + '/hta_evppi.json', JSON.stringify(out, null, 1));
console.log('Confirms the registry-native VOI proxy in monetary units via the validated TreeAge-benchmarked engine.');
console.log('(all cost/utility inputs PLACEHOLDER — the result demonstrates the handoff + VOI direction, not a real CEA)');
console.log('wrote hta_evppi.json');
