// Cross-check of the mh-peto v2 additions against native R (validate/generate-plus.R -> plus-corpus/reference-plus.json).
// The engine is extracted verbatim from mh-peto/index.html (the code the browser runs) and analyse() /
// leaveOneOut() are called on every configuration of the archive corpus.
// Run from the repository root: node mh-peto/validate/check-plus.mjs [--plant <name>] [--json out.json] [--index <html>]
// Planted defects (each must produce unexpected failures): tarone, cmh-continuity-correction, loo-omits-wrong-table,
// i2-uses-k, metamh-keeps-double-zero.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import vm from 'node:vm';
const here = fileURLToPath(new URL('.', import.meta.url));
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const htmlPath = arg('--index') || join(here, '..', 'index.html'), corpusPath = join(here, 'corpus', 'corpus.json'), refPath = join(here, 'plus-corpus', 'reference-plus.json');
let html = readFileSync(htmlPath, 'utf8');
const a = html.indexOf('// ---- engine (unchanged from pre-retrofit) ----'), b = html.indexOf('// ---- axis state');
if (a < 0 || b < a) throw Error('engine markers not found');
let src = html.slice(a, b);
const MUT = { // planted defects: each must make the comparison fail
  tarone: ['out.TA = finOrNull(Math.max(0, bd - s1 * s1 / s2));', 'out.TA = finOrNull(Math.max(0, bd - s1 * s1 / s2) * (1 + 1e-7));'],
  'cmh-continuity-correction': ['var MH = Math.abs(num) * Math.abs(num) / den;', 'var MH = (Math.abs(num) - 0.5) * (Math.abs(num) - 0.5) / den;'],
  'loo-omits-wrong-table': ['return j !== i; }), measure)), flags = {};', 'return j !== (i + 1) % rows.length; }), measure)), flags = {};'],
  'i2-uses-k': ['var df = k - 1, I2 = Math.max(0, 100 * (Q - df) / Q);', 'var df = k - 1, I2 = Math.max(0, 100 * (Q - k) / Q);'],
  'metamh-keeps-double-zero': ["if (measure === 'OR' && ((a === 0 && c === 0) || (c === n2 && a === n1))) incl = 0;", ''],
};
const mut = arg('--plant');
if (mut) { const [x, y] = MUT[mut]; if (!src.includes(x)) throw Error('mutation site not found: ' + mut); src = src.replace(x, y); }
const E = vm.runInThisContext('(function(){' + src + '\nreturn {analyse, leaveOneOut};})')();
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')), R = JSON.parse(readFileSync(refPath, 'utf8'));
const ref = R.configurations;
let n = 0, pass = 0; const by = {}, fails = [];
function chk(id, fam, x, r, kind, cls) {
  x = x === undefined ? null : x; r = r === undefined ? null : r;
  let ok, d;
  if (kind === 'exact') { ok = x === r; d = ok ? 0 : 1; }
  else if (x === null || r === null) { ok = x === null && r === null; d = ok ? 0 : Infinity; }
  else { d = Math.abs(x - r) / (kind === 'abs' ? 1 : Math.max(1, Math.abs(r))); ok = Number.isFinite(d) && d <= 1e-9; }
  by[fam] = by[fam] || [0, 0, 0]; by[fam][0]++; if (ok) by[fam][1]++; if (Number.isFinite(d)) by[fam][2] = Math.max(by[fam][2], d); else if (!ok) by[fam][2] = Infinity;
  n++; if (ok) pass++; else fails.push({ id, family: fam, app: x, ref: r, documented: cls || null });
}
const Q = [['beta', 'beta'], ['se', 'se'], ['z', 'zval'], ['p', 'pval', 'abs'], ['lo', 'ci.lb'], ['hi', 'ci.ub'], ['QE', 'QE'], ['QEp', 'QEp', 'abs'], ['I2', 'I2'], ['H2', 'H2']];
const fitOf = (fit, het) => Object.assign({}, fit, het);
const refOr = r => (!r || r.error) ? {} : r;
for (const cfg of corpus) {
  const rows = cfg.rows.map((s, j) => ({ e1: s.ai, n1: s.ai + s.bi, e2: s.ci, n2: s.ci + s.di, label: 'source-row-' + s.source_row }));
  for (const m of ['OR', 'RR', 'RD']) {
    const id = cfg.id + '|' + m, r = ref[id];
    if (!r) throw Error('missing oracle record ' + id);
    if (rows.length < 2) { chk(id, 'skip.k<2', r.skip, 'k<2', 'exact'); continue; }
    const A = E.analyse(rows, m), methods = m === 'OR' ? [['mh', A.mhFit, A.het.mh, 'MH'], ['peto', A.petoFit || {}, A.het.peto, 'PETO']] : [['mh', A.mhFit, A.het.mh, 'MH']];
    for (const [key, fit, het, lab] of methods) {
      const x = fitOf(fit, het), rr = refOr(r[key]);
      for (const [qa, qr, kind] of Q) chk(id, `full.${lab}.${qa}`, x[qa], rr[qr], kind || 'rel');
    }
    if (m === 'OR') {
      const s = A.het.assoc, rr = refOr(r.mh);
      for (const [qa, qr, kind] of [['MH', 'MH'], ['MHp', 'MHp', 'abs'], ['TA', 'TA'], ['TAp', 'TAp', 'abs'], ['BD', 'BD'], ['BDp', 'BDp', 'abs']]) chk(id, 'full.OR.' + qa, s[qa], rr[qr], kind || 'rel');
    }
    // Documented class (generic rule, no identifiers): R refused because metabin's REML tau2 fit (computed even
    // with random = FALSE) did not converge, and metabin with method.tau = 'DL' (tau2 does not enter the
    // common-effect MH estimate) agrees with the app on every quantity. The checks stay FAIL.
    const CQ = [['beta', 'beta'], ['se', 'se'], ['p', 'pval', 'abs'], ['lo', 'lo'], ['hi', 'hi']];
    for (const [key, rk] of [['metaDefault', 'metamh'], ['iv', 'ivfe']]) {
      const c = A.conv[key], raw = r[rk], rr = refOr(raw);
      const fb = raw && raw.error && /^Fisher scoring algorithm did not converge/.test(raw.error) && raw.fallback_dl && !raw.fallback_dl.error ? raw.fallback_dl : null;
      const cls = fb && CQ.every(([qa, qr, kind]) => c[qa] !== null && Math.abs(c[qa] - fb[qr]) / (kind ? 1 : Math.max(1, Math.abs(fb[qr]))) <= 1e-9) ? 'metabin-reml-refusal' : null;
      for (const [qa, qr, kind] of CQ) chk(id, `conv.${rk}.${qa}`, c[qa], rr[qr], kind || 'rel', cls);
    }
    const L = E.leaveOneOut(rows, m);
    if (rows.length < 3) { chk(id, 'loo.refusal', !!L.refused, true, 'exact'); chk(id, 'loo.refusal.R', r.mh_loo === undefined, true, 'exact'); continue; }
    if (L.refused || L.rows.length !== rows.length || r.mh_loo.length !== rows.length) throw Error('loo coverage ' + id);
    for (const [key, lab] of (m === 'OR' ? [['mh', 'MH'], ['peto', 'PETO']] : [['mh', 'MH']])) {
      const rl = r[key + '_loo'], rfull = refOr(r[key]);
      L.rows.forEach((row, i) => {
        if (row.omit !== i + 1) throw Error('omission order ' + id);
        const x = row[key], rr = refOr(rl[i]);
        for (const [qa, qr, kind] of Q) chk(id + '|omit' + (i + 1), `loo.${lab}.${qa}`, x[qa], rr[qr], kind || 'rel');
        const sig = p => (p === null || p === undefined) ? null : p < 0.05;
        const fa = sig(rfull.pval), fb = sig(rr.pval), rflag = fa === null || fb === null ? null : fa !== fb;
        chk(id + '|omit' + (i + 1), `loo.${lab}.flag`, row.flags[key + '_flip'], rflag, 'exact');
      });
    }
  }
}
const configs = corpus.length * 3;
const documented = fails.filter(f => f.documented).length;
console.log(`mh-peto v2 vs R oracle (${R.versions.R}; metafor ${R.versions.metafor}; meta ${R.versions.meta})${mut ? ' [PLANTED ' + mut + ']' : ''}: ${pass}/${n} checks pass over ${configs} configuration-measures; ${documented} documented failures, ${fails.length - documented} unexpected`);
const fam = {};
for (const [k, v] of Object.entries(by)) { const g = k.split('.').slice(0, 2).join('.'); fam[g] = fam[g] || [0, 0]; fam[g][0] += v[0]; fam[g][1] += v[1]; }
for (const [k, v] of Object.entries(by).sort()) console.log('  ' + k.padEnd(22), (v[1] + '/' + v[0]).padStart(13), 'max', v[2].toExponential(2));
for (const f of fails.filter(f => !f.documented).slice(0, 12)) console.log('FAIL', JSON.stringify(f));
for (const f of fails.filter(f => f.documented)) console.log('DOCUMENTED FAIL', f.id, f.family, f.documented);
if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify({ oracle: R.versions, mutation: mut || null, checks: n, passed: pass, documented, unexpected: fails.length - documented, families: by, failures: fails.slice(0, 200) }, null, 1));
process.exitCode = fails.length - documented ? 1 : 0;
// Contract: pinned inputs (SHA-256 of the LF bytes), exact check count, exact pass count and the exact set of
// documented failures in MANIFEST-plus.json. Any difference fails (exit code 1).
if (!mut) {
  const { createHash } = await import('node:crypto');
  const man = JSON.parse(readFileSync(join(here, 'MANIFEST-plus.json'), 'utf8')), problems = [];
  for (const f of man.files) { const b = readFileSync(join(here, f.path)); if (createHash('sha256').update(b).digest('hex') !== f.sha256 || b.length !== f.bytes) problems.push('SHA-256 mismatch: ' + f.path); }
  if (n !== man.checks) problems.push(`check count ${n} != ${man.checks}`);
  if (pass !== man.expectedPassed) problems.push(`passed ${pass} != ${man.expectedPassed}`);
  const got = fails.filter(f => f.documented).map(f => f.id + ' | ' + f.family).sort(), want = [...man.documentedFailures].sort();
  if (JSON.stringify(got) !== JSON.stringify(want)) problems.push('documented failure identities differ from MANIFEST-plus.json');
  console.log(problems.length ? 'CONTRACT FAIL: ' + problems.join('; ') : `CONTRACT PASS: ${pass}/${n} as pinned; ${got.length} documented failures as pinned; inputs match SHA-256 pins`);
  if (problems.length) process.exitCode = 1;
}
