'use strict';
// Upper-tail p-values in the shipped page (ipd-meta-pro.html), run in Node with the page's own scripts:
//   node dev/tests/upper_tails.test.cjs [path/to/ipd-meta-pro.html]
// `1 - CDF(x)` cancels once CDF(x) rounds to 1 (true tail below ~1e-16) and loses relative accuracy
// long before that; the page's A&S 7.1.26 normal CDF is only good to ~1e-7 absolute, and
// FreemanTukeyTransform.chi2CDF stops its series at an absolute 1e-12. Every upper tail is now computed
// directly by AlmTail (an inlined, byte-identical copy of shared/upper-tail.js; the page is a single
// offline file and the P60 loader does not run <script src>).
// Reference values: upper_tails_reference.R (R 4.6.0, metafor) -> upper_tails_reference.json.
const fs = require('node:fs');
const path = require('node:path');
const { loadPage, scriptsOf } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'upper_tails_reference.json'), 'utf8'));
const html = fs.readFileSync(pageFile, 'utf8');
const page = loadPage(pageFile);
const { run, sandbox } = page;
let failed = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); if (!ok) failed++; }
// relative tolerance: these are tails far below 1e-16, so an absolute tolerance would accept 0
const rel = (a, b, tol) => Number.isFinite(a) && a > 0 && Math.abs(a - b) <= tol * Math.abs(b);
const show = (a, b) => 'page ' + a + ' R ' + b;

// 1. AlmTail is present in the page and is an exact copy of shared/upper-tail.js
{
  const shared = path.join(__dirname, '..', '..', '..', 'shared', 'upper-tail.js');
  const blocks = scriptsOf(html).map(b => b.code);
  const inl = blocks.find(c => c.includes('/* shared/upper-tail.js'));
  check('AlmTail is defined by the page', run('typeof AlmTail') === 'object' && run('typeof AlmTail.pchisqUpper') === 'function');
  if (fs.existsSync(shared)) {
    const want = fs.readFileSync(shared, 'utf8').replace(/\r\n/g, '\n').trim();
    check('inlined AlmTail is byte-identical to shared/upper-tail.js', !!inl && inl.replace(/\r\n/g, '\n').trim() === want);
  } else console.log('SKIP inlined copy comparison (shared/upper-tail.js not checked out)');
}

// 2. no upper tail is computed as 1 - CDF(...) in any page script (inventory pattern of lane "tails")
{
  const CDF = '(?:_pnorm|_ncdf|ncdf|normcdf|stdNormCDF|stdNormalCDF|cdfNormal|normalcdf|pgamma|pbeta|pbinom|ppois|pnorm|normalCDF|normalCdf|normCDF|normCdf|_normalCDF|Phi|_Phi|phi|normal\\.cdf|tcNormalCdf|' +
    'pt|tCDF|_tCDF|tcdf|_tcdf|studentTCDF|studentt\\.cdf|tDistCDF|pchisq|pchi|chiSqCDF|chiSquareCDF|chiSquaredCDF|chi2CDF|_chi2cdf|_chi2CDF|_chiSquareCDF|chisquare\\.cdf|chi2cdf|' +
    'pf|fCDF|centralF\\.cdf|fcdf|_gammaCDF|gammaCDF|gammainc|gammaIncompleteCDF|gammp|_gammp|regularizedGammaP|gammaP|lowerGamma|incGammaP|' +
    'incompleteBeta|betaIncomplete|regularizedBeta|betainc|ibeta|incbeta|binomialCDF|plogis)';
  const site = new RegExp('(?<![\\w.])1(?:\\.0)?\\s*-\\s*((?:[A-Za-z_$][\\w$]*\\.)*' + CDF + ')\\s*\\(', 'g');
  const hits = [];
  html.split('\n').forEach((l, i) => { for (const m of l.matchAll(site)) hits.push((i + 1) + ': ' + m[1]); });
  check('no 1 - CDF(...) upper-tail sites remain', hits.length === 0, hits.length + ' sites' + (hits.length ? ', first ' + hits.slice(0, 3).join('; ') : ''));

  // forms the pattern above cannot see (found by the Codex review of the first version of this test):
  //  (a) 1 - (cond ? CDF(x) : fallback)          the CDF call sits inside a parenthesised group
  //  (b) 1 - name, where name = CDF(...) was assigned within the preceding 80 lines
  const lines = html.split('\n');
  const cdfCall = new RegExp('(?:^|[^\\w$])((?:[A-Za-z_$][\\w$]*\\.)*' + CDF + ')\\s*\\(');
  const group = (s, i) => { let d = 0; for (let k = i; k < s.length; k++) { if (s[k] === '(') d++; else if (s[k] === ')' && --d === 0) return s.slice(i, k + 1); } return s.slice(i); };
  const hidden = [];
  lines.forEach((l, i) => {
    if (l.length > 3000) return;   // vendored minified code
    for (const m of l.matchAll(/(?<![\w.])1(?:\.0)?\s*-\s*\(/g)) {
      if (cdfCall.test(group(l, m.index + m[0].length - 1))) hidden.push((i + 1) + ': 1 - (... CDF ...)');
    }
    for (const m of l.matchAll(/(?<![\w.])1(?:\.0)?\s*-\s*((?:[A-Za-z_$][\w$]*\.)*([A-Za-z_$][\w$]*))(?![\w$.]|\s*\()/g)) {
      const name = m[2].replace(/\$/g, '\\$');
      const assign = new RegExp('(?:^|[^\\w$])' + name + '\\s*=\\s*(?!=)');
      for (let j = i; j >= Math.max(0, i - 80); j--) {
        const a = lines[j].match(assign);
        if (a && (j < i || a.index < m.index)) {
          // right-hand side up to the end of the statement (it may continue over a few lines)
          const rhs = [lines[j].slice(a.index + a[0].length)].concat(lines.slice(j + 1, j + 4)).join(' ').split(';')[0];
          if (cdfCall.test(rhs)) hidden.push((i + 1) + ': 1 - ' + m[1] + ' (assigned from a CDF at line ' + (j + 1) + ')');
          break;
        }
      }
    }
  });
  check('no 1 - (conditional CDF) or 1 - (variable holding a CDF) upper tails remain', hidden.length === 0, hidden.length + ' sites' + (hidden.length ? ': ' + hidden.join('; ') : ''));
}

// 3. the inlined functions in the page context, deep in the tails
if (run('typeof AlmTail') === 'object') {
  for (const g of REF.grid.pnorm) { const a = run('AlmTail.pnormUpper(' + g.z + ')'); check('pnormUpper(' + g.z + ')', rel(a, g.p, 1e-11), show(a, g.p)); }
  for (const g of REF.grid.pchisq) { const a = run('AlmTail.pchisqUpper(' + g.x + ',' + g.df + ')'); check('pchisqUpper(' + g.x + ',' + g.df + ')', rel(a, g.p, 1e-11), show(a, g.p)); }
  for (const g of REF.grid.pt) { const a = run('AlmTail.ptUpper(' + g.t + ',' + g.df + ')'); check('ptUpper(' + g.t + ',' + g.df + ')', rel(a, g.p, 1e-11), show(a, g.p)); }
  // boundary contract (R: pnorm(Inf, lower = FALSE) = 0, pchisq(Inf, 3, lower = FALSE) = 0, pchisq(0, 3, lower = FALSE) = 1,
  // pt(Inf, 4, lower = FALSE) = 0, pt(1, 0) = NaN). With df < 0 (t: df <= 0) the page gets NaN where the legacy
  // t / jStat chi-square CDFs returned 1 (p = 0). IPD-More: chi-square df = 0 is valid in R (the point mass
  // at 0): pchisq(5, 0, lower = FALSE) = 0 and pchisq(0, 0, lower = FALSE) = 1; this check had pinned NaN.
  const bnd = [['AlmTail.pnormUpper(Infinity)', 0], ['AlmTail.pnormUpper(-Infinity)', 1], ['AlmTail.pnormUpper(NaN)', NaN],
    ['AlmTail.pchisqUpper(Infinity, 3)', 0], ['AlmTail.pchisqUpper(0, 3)', 1], ['AlmTail.pchisqUpper(5, 0)', 0], ['AlmTail.pchisqUpper(0, 0)', 1], ['AlmTail.pchisqUpper(5, -1)', NaN], ['AlmTail.pchisqUpper(NaN, 3)', NaN],
    ['AlmTail.ptUpper(Infinity, 4)', 0], ['AlmTail.ptUpper(1, 0)', NaN], ['AlmTail.ptUpper(2, Infinity)', run('AlmTail.pnormUpper(2)')]];
  for (const [e, want] of bnd) { const a = run(e); check('boundary ' + e + ' = ' + want, Number.isNaN(want) ? Number.isNaN(a) : a === want, 'page ' + a); }
}

// 4. exported engine p-values (P60-validated paths and a module with its own chi-square series)
{
  sandbox.__y = REF.fe.y; sandbox.__v = REF.fe.v;
  const r = run('MetaAnalysis.fixedEffect(__y, __v)');
  check('fixedEffect estimate matches metafor (precondition)', Math.abs(r.pooled - REF.fe.est) < 1e-12, show(r.pooled, REF.fe.est));
  check('fixedEffect pooled p = 2 P(Z > |z|)', rel(r.pValue, REF.fe.pval, 1e-9), show(r.pValue, REF.fe.pval));
  check('fixedEffect Q p = P(chi2_{k-1} > Q)', rel(r.pQ, REF.fe.QEp, 1e-9), show(r.pQ, REF.fe.QEp));
}
{
  sandbox.__y = REF.hksj.y; sandbox.__v = REF.hksj.v;
  const r = run('MetaAnalysis.applyHKSJ(MetaAnalysis.randomEffectsDL(__y, __v), __y, __v)');
  check('HKSJ t matches metafor knha (precondition)', Math.abs(r.tHKSJ - REF.hksj.t) <= 1e-9 * REF.hksj.t, show(r.tHKSJ, REF.hksj.t));
  check('HKSJ p = 2 P(T_{k-1} > |t|)', rel(r.pValue, REF.hksj.pval, 1e-8), show(r.pValue, REF.hksj.pval));
}
for (const key of ['ft1', 'ft2']) {
  const ft = REF[key];
  sandbox.__e = ft.events; sandbox.__n = ft.totals;
  const r = run('FreemanTukeyTransform.metaAnalysis(__e, __n, "fixed")');
  const h = r.heterogeneity || {};
  check('Freeman-Tukey ' + key + ' Q matches metafor PFT (precondition)', Math.abs(h.Q - ft.Q) <= 1e-9 * ft.Q, show(h.Q, ft.Q));
  check('Freeman-Tukey ' + key + ' heterogeneity p = P(chi2 > Q)', rel(h.pValue, ft.QEp, 1e-8), show(h.pValue, ft.QEp));
}

console.log(failed ? failed + ' FAILED' : 'ALL PASS');
process.exitCode = failed ? 1 : 0;
