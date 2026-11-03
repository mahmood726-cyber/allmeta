// Multi-arm parity: the shipped inline engine (loaded exactly as the numerics
// harness loads it) against validate/multiarm-oracle.json (netmeta, see
// validate/multiarm-oracle.R). Run from the repository root:
//   node nma-inconsistency/tests/multiarm-parity.mjs
// Exit status 1 on any mismatch. Tolerance: 1e-6 absolute on every number;
// df, treatment sets and node-split comparison sets exact.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { harness, engine } from './numerics-harness.mjs';

export const TOL = 1e-6;
const oracle = JSON.parse(readFileSync(new URL('../validate/multiarm-oracle.json', import.meta.url), 'utf8'));

// Compare one page fit with one oracle model. Returns a list of mismatch strings
// and records |app-R| per quantity class into `maxDiff`.
export function compareFit(app, ref, maxDiff, label) {
  const bad = [];
  const num = (cls, a, r, what) => {
    if (r === null || r === undefined) { if (a !== null && a !== undefined && Number.isFinite(a)) bad.push(`${label} ${what}: app=${a}, R=NA`); return; }
    if (typeof a !== 'number' || !Number.isFinite(a)) { bad.push(`${label} ${what}: app=${a}, R=${r}`); return; }
    const d = Math.abs(a - r);
    maxDiff[cls] = Math.max(maxDiff[cls] || 0, d);
    if (!(d <= TOL)) bad.push(`${label} ${what}: app=${a}, R=${r}, |diff|=${d.toExponential(3)}`);
  };
  const exact = (a, r, what) => { if (JSON.stringify(a) !== JSON.stringify(r)) bad.push(`${label} ${what}: app=${JSON.stringify(a)}, R=${JSON.stringify(r)}`); };
  exact(app.trts, ref.trts, 'treatments');
  num('tau2', app.tau2, ref.tau2, 'tau2');
  num('Q', app.Q, ref.Q, 'Q total (common)');
  exact(app.df, ref.df, 'Q df');
  num('Q', app.Qrandom, ref.Qrandom, 'Q at model tau2');
  const est = ref.model === 'FE' ? app.estimates : app.estimatesRandom;
  for (const t of ref.trts) {
    if (!est || !est[t]) { bad.push(`${label} estimate ${t}: missing`); continue; }
    num('TE', est[t].est, ref.estimates[t].est, `TE ${t} vs ${ref.reference}`);
    num('seTE', est[t].se, ref.estimates[t].se, `seTE ${t} vs ${ref.reference}`);
  }
  const appSplits = new Map((app.nodeSplit || []).map(s => [s.comparison, s]));
  exact([...appSplits.keys()].sort(), ref.nodeSplit.map(s => s.comparison).sort(), 'node-split comparisons');
  for (const r of ref.nodeSplit) {
    const s = appSplits.get(r.comparison);
    if (!s) continue;
    num('split direct', s.direct.mean, r.direct, `${r.comparison} direct`);
    num('split direct', s.direct.se, r.directSe, `${r.comparison} direct SE`);
    num('split indirect', s.indirect.mean, r.indirect, `${r.comparison} indirect`);
    num('split indirect', s.indirect.se, r.indirectSe, `${r.comparison} indirect SE`);
    num('split diff', s.diff, r.diff, `${r.comparison} difference`);
    num('split diff', s.seDiff, r.seDiff, `${r.comparison} difference SE`);
    num('split z', s.z, r.z, `${r.comparison} z`);
    num('split p', s.p, r.p, `${r.comparison} p`);
  }
  num('dbt Q', app.dbt.Q, ref.dbt.Q, 'design-by-treatment Q');
  exact(app.dbt.df, ref.dbt.df, 'design-by-treatment df');
  num('dbt p', app.dbt.p, ref.dbt.p, 'design-by-treatment p');
  return bad;
}

// Full decomposition (FE Q.decomp, or the tau.preset decomposition for DL/PM)
// straight from the engine's dbt(); the page state carries only "Between designs".
export function compareDecomp(E, rows, ref, maxDiff, label) {
  const bad = [];
  const g = E.dbt(rows, ref.tau2);
  if (ref.model === 'FE') {
    for (const [k, appQ, appDf] of [['total', g.Qtotal, g.dfTotal], ['within', g.Qwithin, g.dfWithin], ['between', g.Q, g.df]]) {
      const r = ref.decomp[k];
      if (typeof appQ !== 'number' || !(Math.abs(appQ - r.Q) <= TOL)) bad.push(`${label} Q.decomp ${k}: app=${appQ}, R=${r.Q}`);
      else maxDiff['decomp Q'] = Math.max(maxDiff['decomp Q'] || 0, Math.abs(appQ - r.Q));
      if (appDf !== r.df) bad.push(`${label} Q.decomp ${k} df: app=${appDf}, R=${r.df}`);
    }
  }
  return bad;
}

function main() {
  const h = harness();
  const E = engine(h.c);
  const maxDiff = {};
  const failures = [];
  let fits = 0, refusalsMatched = 0;
  for (const ds of oracle.datasets) {
    for (const model of ['FE', 'DL', 'PM']) {
      const ref = ds.models[model];
      const label = `[${ds.name} ${model}]`;
      h.elements.get('f-model').value = model;
      h.c.__almIncoLoad(ds.text);
      const state = JSON.parse(JSON.stringify(h.c._almLastInco()));
      if (ref.status !== 'ok') {
        if (state.status === 'refused') refusalsMatched++;
        else failures.push(`${label} netmeta refused (${ref.netmetaError.split('\n')[0]}) but the page accepted`);
        continue;
      }
      if (state.status === 'refused') { failures.push(`${label} page refused: ${state.reason}`); continue; }
      fits++;
      failures.push(...compareFit(state, ref, maxDiff, label));
      failures.push(...compareDecomp(E, h.c.parse(ds.text), ref, maxDiff, label));
    }
  }
  console.log(`multiarm parity: ${oracle.datasets.length} datasets (oracle netmeta ${oracle.versions.netmeta}, R ${oracle.versions.R}); ${fits} accepted fits compared, ${refusalsMatched} netmeta refusals matched by page refusals.`);
  for (const [k, v] of Object.entries(maxDiff).sort()) console.log(`  max |app-R| ${k.padEnd(15)} ${v.toExponential(3)}`);
  if (failures.length) {
    console.log(`FAIL: ${failures.length} mismatches`);
    console.log(failures.slice(0, 40).join('\n'));
    if (failures.length > 40) console.log(`... ${failures.length - 40} more`);
    process.exitCode = 1;
  } else console.log('PASS');
  assert.ok(fits > 0, 'no fit was compared');
  return { failures, maxDiff };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('multiarm-parity.mjs')) main();
