// Cross-check of the mh-peto v2 additions against native R (validate/generate-plus.R -> plus-corpus/reference-plus.json).
// The engine is extracted verbatim from mh-peto/index.html (the code the browser runs) and analyse() /
// leaveOneOut() are called on every configuration of the archive corpus.
// Run from the repository root: node mh-peto/validate/check-plus.mjs [--plant <name>] [--json out.json] [--index <html>]
// Planted defects (each must produce unexpected failures): tarone, cmh-continuity-correction, loo-omits-wrong-table,
// i2-uses-k, metamh-keeps-double-zero; claim plants q-drops-double-zero, mh-rr-variance (fail the claim checks).
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
  // claim plants (text claims, claims-plus.json): Q leaves out double-zero / all-event tables (as drop00 = TRUE would);
  // MH RR variance x (1 + 1e-7)
  'q-drops-double-zero': ['if (a === 0 || b === 0 || c === 0 || d === 0) { a += 0.5; b += 0.5; c += 0.5; d += 0.5; }',
    'if ((a === 0 && c === 0) || (b === 0 && d === 0)) { yi.push(NaN); vi.push(NaN); return; } if (a === 0 || b === 0 || c === 0 || d === 0) { a += 0.5; b += 0.5; c += 0.5; d += 0.5; }'],
  'mh-rr-variance': ['var varLogRR = varNum / (num * denom);', 'var varLogRR = varNum / (num * denom) * (1 + 1e-7);'],
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

// ---- Text claims shown on the page (plus-corpus/claims-plus.json, written by generate-plus.R). Counted separately
// from the 120,010 checks above, with their own pinned contract (MANIFEST-plus.json "claims").
//  (1) zero-note: "for OR and RR, metabin(MH.exact = TRUE) matches": beta, SE and p equal the page's MH at 1e-9;
//      for RD the estimate matches but meta's MH variance differs (the SE differs on every configuration).
//  (2) het-note / captions: the page's call is not rma.mh's default. With the default (drop00 = TRUE, correct = TRUE)
//      the pooled estimate is the same, Q differs exactly on the configurations with a double-zero or all-event
//      table (where Q is defined), and the CMH statistic differs except where |O - E| = 0.25.
//  (3) one pinned double-zero example (rv610 review, 102_struct_k4): page values equal R's stated call, and the
//      default call gives a different Q, I2 and (OR) CMH.
{
  const C = JSON.parse(readFileSync(join(here, 'plus-corpus', 'claims-plus.json'), 'utf8'));
  let cn = 0, cp = 0; const cby = {}, cfails = [];
  const c2 = (id, fam, ok, detail) => { cby[fam] = cby[fam] || [0, 0]; cby[fam][0]++; cn++; if (ok) { cp++; cby[fam][1]++; } else cfails.push({ id, family: fam, detail }); };
  const near = (x, r, kind) => { x = x === undefined ? null : x; r = r === undefined ? null : r; if (x === null || r === null) return x === null && r === null; return Math.abs(x - r) / (kind === 'abs' ? 1 : Math.max(1, Math.abs(r))) <= 1e-9; };
  const differs = (x, r) => !near(x, r);
  let rdSeDiff = 0, rdPDiff = 0, rdN = 0, qDiff = 0, qNA = 0, cmhNA = 0, cmhQuarter = 0;
  for (const cfg of corpus) {
    if (cfg.rows.length < 2) continue;
    const rows = cfg.rows.map(s => ({ e1: s.ai, n1: s.ai + s.bi, e2: s.ci, n2: s.ci + s.di }));
    const dzae = rows.some(r => (r.e1 === 0 && r.e2 === 0) || (r.e1 === r.n1 && r.e2 === r.n2));
    for (const m of ['OR', 'RR', 'RD']) {
      const id = cfg.id + '|' + m, c = C.configurations[id];
      if (!c) throw Error('missing claims record ' + id);
      const A = E.analyse(rows, m), f = A.mhFit, x = c.mhexact, d = c.mh_default;
      if (x.error || d.error) { c2(id, 'claim.R-error', false, x.error || d.error); continue; }
      c2(id, `claim.mhexact.${m}.beta`, near(f.beta, x.beta), [f.beta, x.beta]);
      if (m !== 'RD') { c2(id, `claim.mhexact.${m}.se`, near(f.se, x.se), [f.se, x.se]); c2(id, `claim.mhexact.${m}.p`, near(f.p, x.pval, 'abs'), [f.p, x.pval]); }
      else { rdN++; if (differs(f.se, x.se)) rdSeDiff++; if (!near(f.p, x.pval, 'abs')) rdPDiff++; c2(id, 'claim.mhexact.RD.se-differs', differs(f.se, x.se), [f.se, x.se]); }
      c2(id, 'claim.default.beta', near(f.beta, d.beta), [f.beta, d.beta]);
      // Q is compared where at least one side defines it (both null: MH not estimable, no Q under either call).
      if (A.het.mh.QE === null && d.QE === null) qNA++;
      else { const qd = differs(A.het.mh.QE, d.QE); if (qd) qDiff++; c2(id, 'claim.default.Q-differs-iff-double-zero-or-all-event', qd === dzae, { qd, dzae, app: A.het.mh.QE, def: d.QE }); }
      // (|O-E| - 0.5)^2 equals (O-E)^2 only when |O-E| = 0.25, where O-E = sum(a - n1 xt / N); otherwise the
      // corrected default CMH differs from the page's uncorrected one.
      if (m === 'OR') {
        const s = A.het.assoc, oe = Math.abs(rows.reduce((t, r) => t + r.e1 - r.n1 / (r.n1 + r.n2) * (r.e1 + r.e2), 0)), same = Math.abs(oe - 0.25) < 1e-12;
        if (same) cmhQuarter++;
        if (s.MH === null && d.MH === null) cmhNA++; else c2(id, 'claim.default.CMH-differs-unless-|O-E|=0.25', differs(s.MH, d.MH) === !same, [s.MH, d.MH, oe]);
      }
    }
  }
  const P = C.pinned.data, prow = P.e1.map((e, i) => ({ e1: e, n1: P.n1[i], e2: P.e2[i], n2: P.n2[i] }));
  for (const m of ['OR', 'RR']) {
    const A = E.analyse(prow, m), h = Object.assign({}, A.het.mh, m === 'OR' ? { MH: A.het.assoc.MH, MHp: A.het.assoc.MHp } : {}), pg = P[m].page, df = P[m].default;
    const qs = [['QE'], ['QEp', 'abs'], ['I2'], ['H2']].concat(m === 'OR' ? [['MH'], ['MHp', 'abs']] : []);
    for (const [q, kind] of qs) c2(C.pinned.id + '|' + m, `claim.pin.page.${q}`, near(h[q], pg[q], kind), [h[q], pg[q]]);
    for (const q of ['QE', 'I2'].concat(m === 'OR' ? ['MH'] : [])) c2(C.pinned.id + '|' + m, `claim.pin.default-differs.${q}`, Math.abs(h[q] - df[q]) > 1e-6, [h[q], df[q]]);
  }
  console.log(`text claims vs R (claims-plus.json)${mut ? ' [PLANTED ' + mut + ']' : ''}: ${cp}/${cn} claim checks pass; RD with MH.exact = TRUE: SE differs in ${rdSeDiff}/${rdN}, p in ${rdPDiff}/${rdN}; default rma.mh: Q differs in ${qDiff} configuration-measures, Q undefined under both calls in ${qNA}; CMH: |O-E| = 0.25 in ${cmhQuarter}, undefined in ${cmhNA}`);
  for (const [k, v] of Object.entries(cby).sort()) console.log('  ' + k.padEnd(58), (v[1] + '/' + v[0]).padStart(9));
  for (const f of cfails.slice(0, 12)) console.log('CLAIM FAIL', JSON.stringify(f));
  if (cfails.length) process.exitCode = 1;
  if (!mut) {
    const { createHash } = await import('node:crypto');
    const cm = JSON.parse(readFileSync(join(here, 'MANIFEST-plus.json'), 'utf8')).claims, cpr = [];
    if (!cm) cpr.push('no claims entry in MANIFEST-plus.json');
    else {
      const b = readFileSync(join(here, cm.file.path));
      if (createHash('sha256').update(b).digest('hex') !== cm.file.sha256 || b.length !== cm.file.bytes) cpr.push('SHA-256 mismatch: ' + cm.file.path);
      if (cn !== cm.checks) cpr.push(`claim check count ${cn} != ${cm.checks}`);
      if (cp !== cm.expectedPassed) cpr.push(`claims passed ${cp} != ${cm.expectedPassed}`);
    }
    console.log(cpr.length ? 'CLAIMS CONTRACT FAIL: ' + cpr.join('; ') : `CLAIMS CONTRACT PASS: ${cp}/${cn} as pinned; claims-plus.json matches its SHA-256 pin`);
    if (cpr.length) process.exitCode = 1;
  }
}
