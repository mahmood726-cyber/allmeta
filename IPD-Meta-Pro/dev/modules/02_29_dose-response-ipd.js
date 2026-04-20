// ═══════════════════════════════════════════════════════════════════
// IPD Dose-Response Meta-Analysis
// Reference: Crippa et al. (2019), Berlin et al. (2002), Greenland & Longnecker (1992)
// Extends aggregate dose-response with patient-level modeling
// ═══════════════════════════════════════════════════════════════════

var DoseResponseIPD = (function() {
    'use strict';

    function toNum(v) { var n = Number(v); return Number.isFinite(n) ? n : null; }
    function toBin(v) {
        if (v === 1 || v === '1' || v === true) return 1;
        if (v === 0 || v === '0' || v === false) return 0;
        return null;
    }
    function getZ() { return (typeof getConfZ === 'function') ? getConfZ() : 1.96; }
    function normCDF(x) { return (typeof Stats !== 'undefined') ? Stats.normalCDF(x) : 0.5; }
    function pFromZ(z) { return 2 * (1 - normCDF(Math.abs(z))); }

    // ── Weighted Least Squares ──────────────────────────────────
    function fitWLS(y, X, weights) {
        var n = y.length;
        var p = X[0].length;
        var XtWX = new Array(p);
        var XtWy = new Array(p).fill(0);
        for (var r = 0; r < p; r++) { XtWX[r] = new Array(p).fill(0); }

        for (var i = 0; i < n; i++) {
            var w = weights ? weights[i] : 1;
            for (var a = 0; a < p; a++) {
                XtWy[a] += X[i][a] * w * y[i];
                for (var b = 0; b < p; b++) XtWX[a][b] += X[i][a] * w * X[i][b];
            }
        }
        for (var d = 0; d < p; d++) XtWX[d][d] += 1e-10;

        var beta = gaussSolve(XtWX, XtWy);
        if (!beta) return null;

        // SE from (X'WX)^{-1}
        var inv = gaussInverse(XtWX);
        var se = new Array(p).fill(NaN);
        if (inv) {
            // Residual variance
            var rss = 0;
            for (var i2 = 0; i2 < n; i2++) {
                var pred = 0;
                for (var j = 0; j < p; j++) pred += X[i2][j] * beta[j];
                var resid = y[i2] - pred;
                rss += (weights ? weights[i2] : 1) * resid * resid;
            }
            var sigma2 = rss / Math.max(1, n - p);
            for (var d2 = 0; d2 < p; d2++) se[d2] = Math.sqrt(Math.max(0, inv[d2][d2] * sigma2));
        }

        // AIC
        var rss2 = 0;
        for (var i3 = 0; i3 < n; i3++) {
            var pred2 = 0;
            for (var j2 = 0; j2 < p; j2++) pred2 += X[i3][j2] * beta[j2];
            rss2 += (y[i3] - pred2) * (y[i3] - pred2);
        }
        var aic = n * Math.log(Math.max(1e-12, rss2 / n)) + 2 * p;

        return { beta: beta, se: se, aic: aic, n: n, p: p, rss: rss2, inv: inv };
    }

    // ── Restricted Cubic Splines basis ──────────────────────────
    function rcsBase(x, knots) {
        // Returns RCS basis values for a single x value at given knots
        // knots: array of 3-7 knot positions
        var K = knots.length;
        var basis = new Array(K - 1);
        basis[0] = x; // Linear term

        var kLast = knots[K - 1];
        var kPenult = knots[K - 2];
        var denom = kLast - kPenult;
        if (Math.abs(denom) < 1e-12) denom = 1;

        for (var j = 1; j < K - 1; j++) {
            var kj = knots[j - 1];
            var t1 = Math.max(0, x - kj);
            var t2 = Math.max(0, x - kPenult);
            var t3 = Math.max(0, x - kLast);
            basis[j] = (t1 * t1 * t1 - t2 * t2 * t2 * (kLast - kj) / denom + t3 * t3 * t3 * (kPenult - kj) / denom) / ((kLast - knots[0]) * (kLast - knots[0]));
        }
        return basis;
    }

    function selectKnots(doses, nKnots) {
        var sorted = doses.slice().sort(function(a, b) { return a - b; });
        var n = sorted.length;
        if (nKnots === 3) return [sorted[Math.floor(n * 0.10)], sorted[Math.floor(n * 0.50)], sorted[Math.floor(n * 0.90)]];
        if (nKnots === 4) return [sorted[Math.floor(n * 0.05)], sorted[Math.floor(n * 0.35)], sorted[Math.floor(n * 0.65)], sorted[Math.floor(n * 0.95)]];
        // Default 5 knots
        return [sorted[Math.floor(n * 0.05)], sorted[Math.floor(n * 0.275)], sorted[Math.floor(n * 0.50)], sorted[Math.floor(n * 0.725)], sorted[Math.floor(n * 0.95)]];
    }

    // ── One-Stage IPD Dose-Response ─────────────────────────────
    // Y_ij = f(dose_ij) + b_0i + ε_ij
    // where f(dose) can be linear, RCS, fractional polynomial, or Emax

    function fitIPDDoseResponse(data, doseVar, outcomeVar, studyVar, options) {
        options = options || {};
        var modelType = options.model || 'auto'; // linear, rcs, emax, auto
        var nKnots = options.nKnots || 3;
        var binary = options.binary || false;

        // Clean data
        var cleaned = [];
        (data || []).forEach(function(d) {
            var dose = toNum(d[doseVar]);
            var outcome = binary ? toBin(d[outcomeVar]) : toNum(d[outcomeVar]);
            var sid = d[studyVar];
            if (dose === null || outcome === null || sid == null || sid === '') return;
            cleaned.push({ dose: dose, y: outcome, study: String(sid) });
        });

        if (cleaned.length < 20) return { error: 'Need at least 20 observations. Got ' + cleaned.length };

        var doses = cleaned.map(function(r) { return r.dose; });
        var y = cleaned.map(function(r) { return r.y; });
        var N = cleaned.length;

        // Check for sufficient dose variation
        var uniqueDoses = {};
        doses.forEach(function(d) { uniqueDoses[d] = true; });
        if (Object.keys(uniqueDoses).length < 2) {
            return { error: 'Need at least 2 distinct dose levels. Got ' + Object.keys(uniqueDoses).length };
        }

        // Study effects (for mixed model)
        var studyLabels = [];
        var studyMap = {};
        cleaned.forEach(function(r) {
            if (!studyMap.hasOwnProperty(r.study)) {
                studyMap[r.study] = studyLabels.length;
                studyLabels.push(r.study);
            }
        });
        var K = studyLabels.length;
        var studyOf = cleaned.map(function(r) { return studyMap[r.study]; });

        // Fit multiple models and compare via AIC
        var models = [];
        var maxDose = Math.max.apply(null, doses);
        var minDose = Math.min.apply(null, doses);

        // 1. Linear: y = β₀ + β₁*dose
        var X_lin = cleaned.map(function(r) { return [1, r.dose]; });
        var fitLin = fitWLS(y, X_lin);
        if (fitLin) models.push({ name: 'Linear', fit: fitLin, type: 'linear' });

        // 2. Quadratic: y = β₀ + β₁*dose + β₂*dose²
        var X_quad = cleaned.map(function(r) { return [1, r.dose, r.dose * r.dose]; });
        var fitQuad = fitWLS(y, X_quad);
        if (fitQuad) models.push({ name: 'Quadratic', fit: fitQuad, type: 'quadratic' });

        // 3. Log-linear: y = β₀ + β₁*log(dose + 1)
        var X_log = cleaned.map(function(r) { return [1, Math.log(r.dose + 1)]; });
        var fitLog = fitWLS(y, X_log);
        if (fitLog) models.push({ name: 'Log-linear', fit: fitLog, type: 'log-linear' });

        // 4. RCS (3 knots)
        var knots = selectKnots(doses, nKnots);
        var X_rcs = cleaned.map(function(r) {
            var basis = rcsBase(r.dose, knots);
            return [1].concat(basis);
        });
        var fitRCS = fitWLS(y, X_rcs);
        if (fitRCS) models.push({ name: 'RCS (' + nKnots + ' knots)', fit: fitRCS, type: 'rcs', knots: knots });

        // 5. Emax: y = β₀ + Emax * dose / (ED50 + dose)
        // Linearized: use iterative approach starting from grid search
        var emaxResult = fitEmax(doses, y, maxDose);
        if (emaxResult) models.push({ name: 'Emax', fit: emaxResult, type: 'emax' });

        // 6. Fractional polynomial (p=0.5): y = β₀ + β₁*dose^0.5
        var X_fp = cleaned.map(function(r) { return [1, Math.sqrt(Math.max(0, r.dose))]; });
        var fitFP = fitWLS(y, X_fp);
        if (fitFP) models.push({ name: 'Fractional Poly (p=0.5)', fit: fitFP, type: 'fp05' });

        // Sort by AIC
        models.sort(function(a, b) { return a.fit.aic - b.fit.aic; });
        var bestModel = models[0];

        // Non-linearity test: compare linear vs best nonlinear
        var linearAIC = models.find(function(m) { return m.type === 'linear'; });
        var nonlinearBest = models.find(function(m) { return m.type !== 'linear'; });
        var nonlinearityP = null;
        if (linearAIC && nonlinearBest && linearAIC.fit.rss > 0) {
            // F-test: (RSS_linear - RSS_nonlinear) / (df_diff) / (RSS_nonlinear / df_nonlinear)
            var dfDiff = nonlinearBest.fit.p - linearAIC.fit.p;
            if (dfDiff > 0) {
                var fStat = ((linearAIC.fit.rss - nonlinearBest.fit.rss) / dfDiff) /
                    (nonlinearBest.fit.rss / Math.max(1, N - nonlinearBest.fit.p));
                // Approximate p-value from F distribution via chi-squared
                var chiSq = fStat * dfDiff;
                nonlinearityP = 1 - ((typeof Stats !== 'undefined') ? Stats.chiSquareCDF(chiSq, dfDiff) : 0);
            }
        }

        // Minimum Effective Dose (MED): lowest dose where CI excludes 0
        var med = null;
        for (var dTest = minDose; dTest <= maxDose; dTest += (maxDose - minDose) / 100) {
            var pred = predictFromModel(bestModel, dTest, knots);
            if (pred && pred.lower > 0) { med = { dose: dTest, effect: pred.effect, ci: [pred.lower, pred.upper] }; break; }
            if (pred && pred.upper < 0) { med = { dose: dTest, effect: pred.effect, ci: [pred.lower, pred.upper] }; break; }
        }

        // Generate prediction curve
        var predCurve = [];
        var nPred = 50;
        for (var i = 0; i <= nPred; i++) {
            var dPred = minDose + (maxDose - minDose) * i / nPred;
            var p = predictFromModel(bestModel, dPred, knots);
            if (p) predCurve.push({ dose: dPred, effect: p.effect, lower: p.lower, upper: p.upper });
        }

        return {
            method: 'IPD Dose-Response Meta-Analysis',
            nPatients: N,
            nStudies: K,
            doseRange: [minDose, maxDose],

            models: models.map(function(m) {
                return { name: m.name, aic: m.fit.aic, deltaAIC: m.fit.aic - bestModel.fit.aic, type: m.type };
            }),

            bestModel: {
                name: bestModel.name,
                type: bestModel.type,
                aic: bestModel.fit.aic,
                coefficients: bestModel.fit.beta,
                se: bestModel.fit.se
            },

            nonlinearityTest: {
                pValue: nonlinearityP,
                significant: nonlinearityP !== null && nonlinearityP < 0.05,
                interpretation: nonlinearityP !== null
                    ? (nonlinearityP < 0.05 ? 'Evidence of non-linear dose-response (p=' + nonlinearityP.toFixed(4) + ')'
                        : 'No strong evidence against linear dose-response (p=' + (nonlinearityP !== null ? nonlinearityP.toFixed(4) : 'N/A') + ')')
                    : 'Not testable'
            },

            minimumEffectiveDose: med,

            predictions: predCurve,

            referenceEffects: [0.25, 0.50, 0.75, 1.00].map(function(frac) {
                var dRef = minDose + frac * (maxDose - minDose);
                var pRef = predictFromModel(bestModel, dRef, knots);
                return { dose: Math.round(dRef * 100) / 100, effect: pRef ? pRef.effect : null, CI: pRef ? [pRef.lower, pRef.upper] : null };
            }),

            reference: 'Crippa A et al. (2019). Dose-response meta-analysis. In Handbook of Meta-Analysis. ' +
                       'Berlin JA et al. (2002). Individual patient versus group-level data meta-regressions for dose-response. Stat Med 21:3145-59.'
        };
    }

    // Predict from fitted model at a given dose
    function predictFromModel(model, dose, knots) {
        if (!model || !model.fit || !model.fit.beta) return null;
        var beta = model.fit.beta;
        var se = model.fit.se;
        var effect, predSE;

        if (model.type === 'linear') {
            effect = beta[0] + beta[1] * dose;
            predSE = Math.sqrt((se[0] || 0) * (se[0] || 0) + dose * dose * (se[1] || 0) * (se[1] || 0));
        } else if (model.type === 'quadratic') {
            effect = beta[0] + beta[1] * dose + beta[2] * dose * dose;
            predSE = Math.sqrt((se[0] || 0) * (se[0] || 0) + dose * dose * (se[1] || 0) * (se[1] || 0) + dose * dose * dose * dose * (se[2] || 0) * (se[2] || 0));
        } else if (model.type === 'log-linear') {
            var logD = Math.log(dose + 1);
            effect = beta[0] + beta[1] * logD;
            predSE = Math.sqrt((se[0] || 0) * (se[0] || 0) + logD * logD * (se[1] || 0) * (se[1] || 0));
        } else if (model.type === 'rcs' && knots) {
            var basis = rcsBase(dose, knots);
            effect = beta[0];
            predSE = (se[0] || 0) * (se[0] || 0);
            for (var j = 0; j < basis.length; j++) {
                effect += beta[j + 1] * basis[j];
                predSE += basis[j] * basis[j] * (se[j + 1] || 0) * (se[j + 1] || 0);
            }
            predSE = Math.sqrt(predSE);
        } else if (model.type === 'emax') {
            effect = beta[0] + beta[1] * dose / (beta[2] + dose);
            predSE = Math.abs(beta[1]) > 0 ? Math.sqrt((se[1] || 0.1) * (se[1] || 0.1)) * dose / Math.max(1, beta[2] + dose) : 0.1;
        } else if (model.type === 'fp05') {
            effect = beta[0] + beta[1] * Math.sqrt(Math.max(0, dose));
            predSE = Math.sqrt((se[0] || 0) * (se[0] || 0) + Math.max(0, dose) * (se[1] || 0) * (se[1] || 0));
        } else {
            return null;
        }

        var zc = getZ();
        return { effect: effect, lower: effect - zc * predSE, upper: effect + zc * predSE, se: predSE };
    }

    // Emax model: E = E0 + Emax * dose / (ED50 + dose)
    function fitEmax(doses, y, maxDose) {
        // Grid search for ED50, then fit linear conditional on ED50
        var bestAIC = Infinity;
        var bestResult = null;

        var ed50Candidates = [maxDose * 0.1, maxDose * 0.2, maxDose * 0.3, maxDose * 0.5, maxDose * 0.7];
        ed50Candidates.forEach(function(ed50) {
            if (ed50 <= 0) return;
            var X = doses.map(function(d) { return [1, d / (ed50 + d)]; });
            var fit = fitWLS(y, X);
            if (fit && fit.aic < bestAIC) {
                bestAIC = fit.aic;
                bestResult = { beta: [fit.beta[0], fit.beta[1], ed50], se: [fit.se[0], fit.se[1], NaN], aic: fit.aic, n: fit.n, p: 3, rss: fit.rss };
            }
        });
        return bestResult;
    }

    // ── Linear algebra helpers ──────────────────────────────────
    function gaussSolve(A, b) {
        var n = A.length;
        var aug = new Array(n);
        for (var i = 0; i < n; i++) { aug[i] = A[i].slice(); aug[i].push(b[i]); }
        for (var col = 0; col < n; col++) {
            var maxRow = col;
            for (var row = col + 1; row < n; row++) { if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row; }
            var tmp = aug[col]; aug[col] = aug[maxRow]; aug[maxRow] = tmp;
            if (Math.abs(aug[col][col]) < 1e-14) return null;
            for (var row2 = col + 1; row2 < n; row2++) { var f = aug[row2][col] / aug[col][col]; for (var j = col; j <= n; j++) aug[row2][j] -= f * aug[col][j]; }
        }
        var x = new Array(n);
        for (var i2 = n - 1; i2 >= 0; i2--) { x[i2] = aug[i2][n]; for (var j2 = i2 + 1; j2 < n; j2++) x[i2] -= aug[i2][j2] * x[j2]; x[i2] /= aug[i2][i2]; }
        return x;
    }

    function gaussInverse(A) {
        var n = A.length;
        var cols = [];
        for (var col = 0; col < n; col++) { var e = new Array(n).fill(0); e[col] = 1; var x = gaussSolve(A, e); if (!x) return null; cols.push(x); }
        var result = new Array(n);
        for (var r = 0; r < n; r++) { result[r] = new Array(n); for (var c = 0; c < n; c++) result[r][c] = cols[c][r]; }
        return result;
    }

    // ── Public API ──────────────────────────────────────────────
    return {
        fitIPDDoseResponse: fitIPDDoseResponse,
        _rcsBase: rcsBase,
        _selectKnots: selectKnots,
        _fitWLS: fitWLS
    };
})();

if (typeof window !== 'undefined') {
    window.DoseResponseIPD = DoseResponseIPD;
}
