import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import NM from '../../../../shared/nma-multiarm-v1.js';
import MC from '../../../../shared/ma-comparisons-v1.js';

export const TOL = 1e-6; // Absolute, including Q and interval bounds. No iterative exception.
export const fixtureURL = new URL('./nma-edge-parity-reference.json', import.meta.url);
export function readOracle(fresh = false) {
  const file = !fresh && existsSync(fixtureURL) ? fixtureURL : join(tmpdir(), 'nma-edge-parity-reference.json');
  return JSON.parse(readFileSync(file, 'utf8'));
}
export function appRows(c) {
  if (!c.arms) return c.rows;
  const studies = new Map();
  for (const a of c.arms) {
    if (!studies.has(a.study)) studies.set(a.study, { id: a.study, arms: [] });
    studies.get(a.study).arms.push({ treatment: a.treatment, events: a.events, n: a.n });
  }
  return MC.toContrasts(MC.buildEnvelope([...studies.values()], c.sm)).map(r => ({
    study: r.study, t1: r.treatment2, t2: r.treatment1, est: r.te, se: r.se,
  }));
}
export function runCase(c, ci) {
  const rows = appRows(c);
  return Object.fromEntries(['desirable', 'undesirable'].map(smallValues => [smallValues,
    NM.analyse(rows, { randomCi: ci, smallValues })]));
}
// Each cell retains both numbers, so the replay documents discrepancies rather than just a maximum.
export function comparisons(c, ref, results) {
  const checks = [];
  const put = (group, path, actual, expected) => {
    const numeric = typeof expected === 'number';
    const delta = numeric && Number.isFinite(actual) ? Math.abs(actual - expected) : null;
    checks.push({ group, path, actual: actual === undefined ? '<undefined>' : actual, expected,
      delta, pass: numeric ? delta !== null && delta <= TOL : actual === expected });
  };
  const a = results.desirable;
  put('acceptance', 'ok', a.ok, ref.ok);
  if (!ref.ok || !a.ok) return checks;
  const perm = ref.treatments.map(t => a.treatments.indexOf(t));
  put('acceptance', 'treatments.length', a.treatments.length, ref.treatments.length);
  ref.treatments.forEach((t, i) => put('acceptance', `treatments.${t}`, a.treatments[perm[i]], t));
  const matrix = (group, path, actual, expected, diagonal = false) => {
    for (let i = 0; i < perm.length; i++) for (let j = 0; j < perm.length; j++) {
      if (i === j && !diagonal) continue; // CIs, p and PIs of self-comparisons are not defined.
      put(group, `${path}.${ref.treatments[i]}:${ref.treatments[j]}`, actual === null ? null : actual?.[perm[i]]?.[perm[j]], expected[i][j]);
    }
  };
  for (const model of ['common', 'random']) for (const field of ['TE', 'seTE', 'lower', 'upper', 'pval']) {
    matrix(['TE', 'seTE'].includes(field) ? 'effects' : 'inference', `${model}.${field}`,
      a[model][field], ref[model][field], ['TE', 'seTE'].includes(field));
  }
  for (const field of ['k', 'm', 'n', 'Q', 'df', 'pvalQ', 'tau2', 'tau', 'I2', 'lowerI2', 'upperI2']) {
    put('heterogeneity', field, a[field], ref[field]);
  }
  // netmeta retains an all-NA matrix when df.Q < 2; the app uses one null.
  // Keep the raw R matrix in the fixture and compare every absent bound to null.
  const predictionAvailable = ref.predict !== null && ref.predict.lower.some((row, i) =>
    row.some((v, j) => i !== j && typeof v === 'number' && Number.isFinite(v)));
  put('prediction', 'predict.available', a.predict !== null, predictionAvailable);
  if (ref.predict) for (const field of ['lower', 'upper']) matrix('prediction', `predict.${field}`, a.predict === null ? null : a.predict?.[field], ref.predict[field]);
  put('decomposition', 'decomp.available', a.decomp !== null, ref.decomp !== null);
  if (ref.decomp) for (const field of ['Q', 'df', 'pval']) ref.decomp[field].forEach((v, i) => put('decomposition', `decomp.${field}.${i}`, a.decomp?.[field]?.[i], v));
  for (const direction of ['desirable', 'undesirable']) for (const model of ['common', 'random']) {
    ref.pscore[direction][model].forEach((v, i) => put('ranking', `${direction}.${model}.${ref.treatments[i]}`, results[direction].pscore[model][perm[i]], v));
  }
  if (c.arms) {
    const rows = appRows(c);
    put('contrasts', 'rows.length', rows.length, c.rows.length);
    for (const r of c.rows) {
      const got = rows.find(x => x.study === r.study && x.t1 === r.t1 && x.t2 === r.t2);
      for (const field of ['est', 'se']) put('contrasts', `${r.study}.${r.t2}:${r.t1}.${field}`, got?.[field], r[field]);
    }
  }
  return checks;
}
export function assertChecks(checks) {
  assert.ok(checks.length > 0, 'no comparisons executed');
  const bad = checks.filter(x => !x.pass);
  assert.equal(bad.length, 0, JSON.stringify(bad, null, 2));
}
