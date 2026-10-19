/* NMA Pro only: restricted maximum likelihood for one heterogeneity variance.
 * Assumes fitGLS(tau2) supplies a symmetric positive-definite Sigma, full-rank
 * XtSiX and generalized least-squares residual quadratic Q.
 * No shared engine dependencies, no silent fallback to Paule–Mandel.
 */
(function(root, factory) {
  const solver = factory();
  if (typeof module === 'object' && module.exports) module.exports = solver;
  if (root) root.NmaREML = solver;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function logDetSPD(A) {
    if (!Array.isArray(A) || !A.length || A.some(r => !Array.isArray(r) || r.length !== A.length)) return null;
    const n = A.length, L = Array.from({length:n}, () => Array(n).fill(0));
    let scale = 0;
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(A[i][i]) || !(A[i][i] > 0)) return null;
      scale = Math.max(scale, A[i][i]);
      for (let j = 0; j < i; j++) {
        if (!Number.isFinite(A[i][j]) || !Number.isFinite(A[j][i])) return null;
        if (Math.abs(A[i][j] - A[j][i]) > 1e-9 * Math.max(1e-15, Math.abs(A[i][j]), Math.abs(A[j][i]))) return null;
      }
    }
    let logdet = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let residual = A[i][j];
        for (let k = 0; k < j; k++) residual -= L[i][k]*L[j][k];
        if (i === j) {
          if (!Number.isFinite(residual) || residual <= 1e-13 * scale) return null;
          L[i][j] = Math.sqrt(residual);
          logdet += Math.log(residual);
        } else L[i][j] = residual/L[j][j];
      }
    }
    return Number.isFinite(logdet) ? logdet : null;
  }

  function estimate(matrices, fitGLS) {
    const {n, p, v, y} = matrices || {};
    if (!Number.isSafeInteger(n) || !Number.isSafeInteger(p) || n <= p || p < 1 || !Array.isArray(v) || v.length !== n || !Array.isArray(y) || y.length !== n ||
        v.some(x => !Number.isFinite(x) || x <= 0) || y.some(x => !Number.isFinite(x))) {
      throw new Error('REML requires finite study effects, positive variances and positive residual degrees of freedom.');
    }
    if (typeof fitGLS !== 'function') throw new Error('REML GLS callback not available');
    const objective = t => {
      try {
        const f = fitGLS(t);
        if (!f || !Number.isFinite(f.Q) || f.Q < -1e-7) return Infinity;
        const dSig = logDetSPD(f.Sigma), dXt = logDetSPD(f.XtSiX);
        return dSig === null || dXt === null ? Infinity : dSig + dXt + Math.max(0,f.Q);
      } catch (_) { return Infinity; }
    };
    let hi = Math.max(1e-7, Math.max(...v) * 100, (Math.max(...y)-Math.min(...y))**2 * 100);
    const lo = Math.max(1e-16, Math.min(...v)*1e-9);
    let points = [], scores = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      const nGrid = 64, llo = Math.log(lo), lhi = Math.log(hi);
      points = [0];
      for (let i = 0; i < nGrid; i++) points.push(Math.exp(llo + (lhi-llo)*i/(nGrid-1)));
      scores = points.map(objective);
      if (scores[scores.length-1] < scores[scores.length-2] && scores[scores.length-1] < scores[0]) hi *= 10;
      else break;
      if (attempt === 4) throw new Error('REML likelihood optimum is not bracketed: extend supported variance domain.');
    }
    let bestIndex = -1, bestScore = Infinity;
    for (let i = 0; i < scores.length; i++) if (scores[i] < bestScore) {bestScore = scores[i]; bestIndex = i;}
    if (bestIndex < 0 || !Number.isFinite(bestScore)) throw new Error('REML variance matrix is not positive definite or GLS fit is not identifiable.');
    let bestT = points[bestIndex];
    const gold = (Math.sqrt(5)-1)/2;
    // Refine all detected local minima; REML likelihood need not be globally unimodal.
    for (let i = 2; i < points.length-1; i++) {
      if (!(scores[i] <= scores[i-1] && scores[i] <= scores[i+1])) continue;
      let a = Math.log(points[i-1]), b = Math.log(points[i+1]);
      let c = b-gold*(b-a), d = a+gold*(b-a), fc = objective(Math.exp(c)), fd=objective(Math.exp(d));
      for (let step = 0; step < 72 && b-a > 1e-10; step++) {
        if (fc < fd) {b=d; d=c; fd=fc; c=b-gold*(b-a); fc=objective(Math.exp(c));}
        else {a=c; c=d; fc=fd; d=a+gold*(b-a); fd=objective(Math.exp(d));}
      }
      const t = Math.exp((a+b)/2), sc = objective(t);
      if (sc < bestScore) {bestScore=sc; bestT=t;}
    }
    // Compare exactly with tau²=0; do not infer a positive effect from optimizer floor.
    if (objective(0) <= bestScore + 1e-12) bestT = 0;
    const final = fitGLS(bestT);
    if (!Number.isFinite(final.Q) || logDetSPD(final.Sigma) === null || logDetSPD(final.XtSiX) === null)
      throw new Error('REML solution failed the final finite and positive-definite validation.');
    return {tau2:bestT, converged:true, Q:final.Q, df:n-p, method:'REML-profile', objective:objective(bestT)};
  }
  return Object.freeze({estimate, logDetSPD});
});
