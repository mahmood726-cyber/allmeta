// Parity of shared/sensitivity-v1.js against the metafor 5.2-1 reference, and the manifest
// builder. Tolerances below were fixed BEFORE the first comparison was run (PLAN.md):
//   REL = |js - R| / max(1, |R|)   (the repository convention, heterogeneity/validate/adapter.js)
//   closed-form estimators (DL, HE, HS, SJ, FE): tau2, mu, se, Q            REL <= 1e-9
//   iterative estimators (PM, EB, REML, ML):     tau2, mu, se               REL <= 1e-6; Q REL <= 1e-9
//   derived (all): ciLo, ciHi, piLo, piHi                                   REL <= 1e-6
//   I2                                                                      ABS <= 1e-6
//   refusal, k, df, null-ness                                               exact
// Leave-one-out rows use the same classes. Never loosen these after looking: a combination
// that fails is left out of the manifest instead.
//
// CLI: node hub/shared/tests/addons-a5-parity.mjs --write   (rewrites shared/sensitivity-v1.manifest.json)
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const REFERENCE = 'hub/shared/tests/fixtures/sensitivity/reference.json';
export const MANIFEST = 'shared/sensitivity-v1.manifest.json';
const require = createRequire(import.meta.url);
export const TOL = Object.freeze({closed: 1e-9, iterative: 1e-6, derived: 1e-6, I2: 1e-6});
export const CLOSED = new Set(['DL', 'HE', 'HS', 'SJ', 'FE']);

export function loadApi() { return require('../../../shared/sensitivity-v1.js'); }
export function readText(rel) { return readFileSync(ROOT + rel, 'utf8'); }
// Hash git-stored (LF) bytes, so a CRLF Windows working copy hashes the same as CI.
export function sha256Lf(text) { return createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex'); }

function rel(a, b) { return Math.abs(a - b) / Math.max(1, Math.abs(b)); }
export function baseKey(key) { const m = /^loo (\w+)\[/.exec(key); return m ? m[1] : key; }
function classOf(method, fullKey) {
  const key = baseKey(fullKey);
  if (key === 'I2') return ['abs', TOL.I2];
  if (['ciLo', 'ciHi', 'piLo', 'piHi'].includes(key)) return ['rel', TOL.derived];
  if (key === 'Q') return ['rel', TOL.closed];
  return ['rel', CLOSED.has(method) ? TOL.closed : TOL.iterative];
}
// Returns null on pass, otherwise a failure description. Null on both sides passes; null on one side fails.
export function compareValue(method, key, js, r, tolOverride) {
  if (r === null || r === undefined || js === null || js === undefined) {
    const same = (r === null || r === undefined) === (js === null || js === undefined);
    return same ? null : {key, js, r, reason: 'null mismatch'};
  }
  if (typeof js !== 'number' || !Number.isFinite(js)) return {key, js, r, reason: 'non-finite'};
  const [kind, tol0] = classOf(method, key), tol = tolOverride ?? tol0;
  const d = kind === 'abs' ? Math.abs(js - r) : rel(js, r);
  return d <= tol ? null : {key, js, r, diff: d, tol, kind};
}

const FIT_KEYS = ['tau2', 'mu', 'se', 'ciLo', 'ciHi', 'Q', 'I2', 'piLo', 'piHi'];
const LOO_KEYS = ['mu', 'se', 'ciLo', 'ciHi', 'tau2', 'I2'];

// Compare one analysis x combination. Returns {checks, failures:[...], maxima}.
export function compareCombo(api, analysis, method, test, opts = {}) {
  const ref = analysis.combos[method + '/' + test];
  const out = {checks: 0, failures: [], maxRel: 0, maxAbs: 0};
  const fail = f => out.failures.push({id: analysis.id, combo: method + '/' + test, ...f});
  const track = (key, js, r) => {
    out.checks++;
    const f = compareValue(method, key, js, r, opts.tol);
    if (typeof js === 'number' && typeof r === 'number') {
      if (baseKey(key) === 'I2') out.maxAbs = Math.max(out.maxAbs, Math.abs(js - r)); else out.maxRel = Math.max(out.maxRel, rel(js, r));
    }
    if (f) fail(f);
  };
  const exact = (key, js, r) => { out.checks++; if (js !== r) fail({key, js, r, reason: 'exact mismatch'}); };
  const row = api.fit(analysis.yi, analysis.vi, {method, test});
  exact('refused', row.refused, ref.fit.refused);
  if (!row.refused && !ref.fit.refused) {
    exact('k', row.k, ref.fit.k); exact('df', row.df, ref.fit.df);
    for (const key of FIT_KEYS) track(key, row[key], ref.fit[key]);
  }
  if (analysis.loo && ref.loo) {
    const loo = api.leaveOneOut(analysis.yi, analysis.vi, {method, test});
    const jsRefused = loo.refused || loo.rows.some(r => r.refused);
    exact('loo refused', jsRefused, ref.loo.refused);
    if (!jsRefused && !ref.loo.refused) {
      exact('loo rows', loo.rows.length, ref.loo.mu.length);
      // A quantity leave1out() does not report (tau2/I2 of a common-effect model) is not compared.
      loo.rows.forEach((r, i) => { for (const key of LOO_KEYS) if (ref.loo[key] !== null) track('loo ' + key + '[' + i + ']', r[key], ref.loo[key] === null ? null : ref.loo[key][i]); });
    }
  }
  return out;
}

export function runParity(api, reference, opts = {}) {
  const combos = {};
  for (const method of reference.methods) for (const test of reference.tests) combos[method + '/' + test] = {method, test, checks: 0, failures: [], maxRel: 0, maxAbs: 0, byMeasure: {}};
  for (const analysis of reference.analyses) {
    for (const c of Object.values(combos)) {
      const r = compareCombo(api, analysis, c.method, c.test, opts);
      c.checks += r.checks; c.failures.push(...r.failures);
      c.maxRel = Math.max(c.maxRel, r.maxRel); c.maxAbs = Math.max(c.maxAbs, r.maxAbs);
      const m = c.byMeasure[analysis.measure] ??= {analyses: 0, failed: 0};
      m.analyses++; if (r.failures.length) m.failed++;
    }
  }
  return combos;
}

export function buildManifest(reference, parity, referenceSha256) {
  const combos = [], excluded = [];
  for (const c of Object.values(parity)) {
    const measures = Object.entries(c.byMeasure).filter(([, m]) => m.analyses > 0 && m.failed === 0).map(([k]) => k).sort();
    const failedMeasures = Object.entries(c.byMeasure).filter(([, m]) => m.failed > 0).map(([k]) => k).sort();
    if (measures.length) combos.push({method: c.method, test: c.test, measures, checks: c.checks - c.failures.length});
    if (failedMeasures.length) {
      const f = c.failures[0];
      excluded.push({method: c.method, test: c.test, measures: failedMeasures, failedChecks: c.failures.length,
        firstFailure: f.id + ' ' + f.key + ': ' + (f.reason || ('diff ' + f.diff.toExponential(3) + ' > ' + f.tol))});
    }
  }
  return {schemaVersion: 1, module: 'sensitivity-v1', reference: REFERENCE, referenceSha256,
    versions: reference.versions, tolerances: {...TOL, definition: 'REL=|js-R|/max(1,|R|); closed form DL/HE/HS/SJ/FE, iterative PM/EB/REML/ML'},
    analyses: reference.analyses.length, combos, excluded};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const text = readText(REFERENCE), reference = JSON.parse(text);
  const parity = runParity(loadApi(), reference);
  const manifest = buildManifest(reference, parity, sha256Lf(text));
  for (const c of Object.values(parity)) console.log(c.method + '/' + c.test, 'checks', c.checks, 'failures', c.failures.length, 'maxRel', c.maxRel.toExponential(2), 'maxAbsI2', c.maxAbs.toExponential(2), c.failures.slice(0, 2).map(f => f.id + ' ' + f.key + ' ' + (f.reason || f.diff)).join(' | '));
  if (process.argv.includes('--write')) { writeFileSync(ROOT + MANIFEST, JSON.stringify(manifest, null, 2) + '\n'); console.log('wrote', MANIFEST); }
}
export {classOf};
