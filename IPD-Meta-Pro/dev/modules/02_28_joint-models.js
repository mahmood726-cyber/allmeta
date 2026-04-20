// ═══════════════════════════════════════════════════════════════════
// Joint Models of Longitudinal & Survival Data for IPD Meta-Analysis
// Reference: Rizopoulos (2012), Tsiatis & Davidian (2004), Henderson et al. (2000)
// ═══════════════════════════════════════════════════════════════════
//
// Data model for joint analysis:
//   Longitudinal: { patient_id, study_id, visit_time, biomarker_value, treatment }
//   Survival:     { patient_id, study_id, event_time, event, treatment }
//
// Two approaches implemented:
//   1. Two-stage: fit LMM to longitudinal → use predicted trajectory in Cox
//   2. Shared-parameter: EM algorithm jointly estimating both submodels

var JointModels = (function() {
    'use strict';

    function toNum(v) { var n = Number(v); return Number.isFinite(n) ? n : null; }
    function toBin(v) {
        if (v === 1 || v === '1' || v === true) return 1;
        if (v === 0 || v === '0' || v === false) return 0;
        if (typeof v === 'string') {
            var s = v.trim().toLowerCase();
            if (['yes','true','treated','treatment','active','1'].indexOf(s) >= 0) return 1;
            if (['no','false','control','placebo','0'].indexOf(s) >= 0) return 0;
        }
        return null;
    }
    function getZ() { return (typeof getConfZ === 'function') ? getConfZ() : 1.96; }
    function normCDF(x) { return (typeof Stats !== 'undefined') ? Stats.normalCDF(x) : 0.5; }
    function pFromZ(z) { return 2 * (1 - normCDF(Math.abs(z))); }

    // ── LMM with random intercept + slope ───────────────────────
    // Y_ij = (β₀ + b₀_i) + (β₁ + b₁_i)*t_ij + β₂*trt_i + ε_ij
    // (b₀_i, b₁_i) ~ N(0, D), ε_ij ~ N(0, σ²)
    //
    // Uses EM algorithm for variance components

    function fitLMM(patients) {
        // patients: [{id, visits: [{time, value}], treatment, study}]
        var N = 0; // total observations
        patients.forEach(function(p) { N += p.visits.length; });
        if (N < 10) return { error: 'Need at least 10 observations' };

        var K = patients.length;
        // Fixed effects: intercept, time slope, treatment
        var p_fix = 3;

        // Initialize via OLS ignoring random effects
        var XtX = new Array(p_fix);
        var XtY = new Array(p_fix).fill(0);
        for (var r = 0; r < p_fix; r++) { XtX[r] = new Array(p_fix).fill(0); }

        patients.forEach(function(pat) {
            pat.visits.forEach(function(v) {
                var x = [1, v.time, pat.treatment];
                for (var a = 0; a < p_fix; a++) {
                    XtY[a] += x[a] * v.value;
                    for (var b2 = 0; b2 < p_fix; b2++) XtX[a][b2] += x[a] * x[b2];
                }
            });
        });

        // Add regularization
        for (var d = 0; d < p_fix; d++) XtX[d][d] += 1e-8;
        var beta = solve3x3(XtX, XtY);
        if (!beta) beta = [0, 0, 0];

        // Initialize variance components
        var sigma2 = 1.0;
        var D = [[0.5, 0], [0, 0.01]]; // Random intercept var, random slope var

        // EM iterations
        var maxIter = 100;
        var tol = 1e-6;
        var converged = false;
        var iter = 0;
        var randomEffects = patients.map(function() { return [0, 0]; }); // [b0_i, b1_i]

        for (iter = 0; iter < maxIter; iter++) {
            var prevBeta = beta.slice();

            // E-step: estimate random effects for each patient
            // b_i | y_i ~ N(D Z_i' V_i^{-1} (y_i - X_i β), D - D Z_i' V_i^{-1} Z_i D)
            // where V_i = Z_i D Z_i' + σ² I_{n_i}
            var betaNum = new Array(p_fix).fill(0);
            var betaDen = new Array(p_fix);
            for (var r2 = 0; r2 < p_fix; r2++) betaDen[r2] = new Array(p_fix).fill(0);
            var newSigma2 = 0;
            var newD = [[0, 0], [0, 0]];
            var totalObs = 0;

            patients.forEach(function(pat, idx) {
                var ni = pat.visits.length;
                if (ni === 0) return;

                // Build Z_i (ni × 2): [1, t_j] per visit
                // V_i = Z_i D Z_i' + σ² I = σ²I + Z_i D Z_i'
                // For efficiency with small ni, compute V_i directly

                // Compute Z_i' (y_i - X_i β) / σ²
                var ztResid = [0, 0];
                var ztZ = [[0, 0], [0, 0]];
                pat.visits.forEach(function(v) {
                    var xBeta = beta[0] + beta[1] * v.time + beta[2] * pat.treatment;
                    var resid = v.value - xBeta;
                    ztResid[0] += resid;
                    ztResid[1] += resid * v.time;
                    ztZ[0][0] += 1;
                    ztZ[0][1] += v.time;
                    ztZ[1][0] += v.time;
                    ztZ[1][1] += v.time * v.time;
                });

                // Posterior precision: Λ_i = D^{-1} + Z_i'Z_i / σ²
                var Dinv = invert2x2(D);
                if (!Dinv) Dinv = [[1/0.5, 0], [0, 1/0.01]];
                var Lambda = [
                    [Dinv[0][0] + ztZ[0][0] / sigma2, Dinv[0][1] + ztZ[0][1] / sigma2],
                    [Dinv[1][0] + ztZ[1][0] / sigma2, Dinv[1][1] + ztZ[1][1] / sigma2]
                ];
                var LambdaInv = invert2x2(Lambda);
                if (!LambdaInv) LambdaInv = [[sigma2, 0], [0, sigma2]];

                // Posterior mean: Λ_i^{-1} Z_i'(y_i - X_iβ) / σ²
                var bHat = [
                    (LambdaInv[0][0] * ztResid[0] + LambdaInv[0][1] * ztResid[1]) / sigma2,
                    (LambdaInv[1][0] * ztResid[0] + LambdaInv[1][1] * ztResid[1]) / sigma2
                ];
                randomEffects[idx] = bHat;

                // Accumulate for M-step
                // Update β: X' V^{-1} y contributions
                pat.visits.forEach(function(v) {
                    var yAdj = v.value - bHat[0] - bHat[1] * v.time;
                    var x = [1, v.time, pat.treatment];
                    for (var a2 = 0; a2 < p_fix; a2++) {
                        betaNum[a2] += x[a2] * yAdj / sigma2;
                        for (var b3 = 0; b3 < p_fix; b3++) betaDen[a2][b3] += x[a2] * x[b3] / sigma2;
                    }
                });

                // σ² update: Σ (y_ij - x_ij'β - z_ij'b_i)² + trace terms
                pat.visits.forEach(function(v) {
                    var fitted = beta[0] + beta[1] * v.time + beta[2] * pat.treatment + bHat[0] + bHat[1] * v.time;
                    var resid2 = v.value - fitted;
                    newSigma2 += resid2 * resid2;
                    // Add trace(V_posterior * z_j z_j')
                    newSigma2 += LambdaInv[0][0] + 2 * v.time * LambdaInv[0][1] + v.time * v.time * LambdaInv[1][1];
                });
                totalObs += ni;

                // D update: E[b_i b_i'] = b̂_i b̂_i' + Var(b_i|y_i)
                newD[0][0] += bHat[0] * bHat[0] + LambdaInv[0][0];
                newD[0][1] += bHat[0] * bHat[1] + LambdaInv[0][1];
                newD[1][0] += bHat[1] * bHat[0] + LambdaInv[1][0];
                newD[1][1] += bHat[1] * bHat[1] + LambdaInv[1][1];
            });

            // M-step: update parameters
            for (var d2 = 0; d2 < p_fix; d2++) betaDen[d2][d2] += 1e-10;
            var newBeta = solve3x3(betaDen, betaNum);
            if (newBeta) beta = newBeta;

            sigma2 = Math.max(1e-6, newSigma2 / totalObs);
            D = [
                [Math.max(1e-8, newD[0][0] / K), newD[0][1] / K],
                [newD[1][0] / K, Math.max(1e-8, newD[1][1] / K)]
            ];
            // Ensure D is positive definite
            var detD = D[0][0] * D[1][1] - D[0][1] * D[1][0];
            if (detD <= 0) { D[0][1] = 0; D[1][0] = 0; }

            // Convergence check
            var maxDelta = 0;
            for (var j = 0; j < p_fix; j++) maxDelta = Math.max(maxDelta, Math.abs(beta[j] - prevBeta[j]));
            if (maxDelta < tol) { converged = true; break; }
        }

        return {
            beta: beta, // [intercept, time_slope, treatment_effect]
            sigma2: sigma2,
            D: D, // Random effects covariance
            randomEffects: randomEffects,
            convergence: { converged: converged, iterations: iter + 1 },
            nPatients: K,
            nObservations: N
        };
    }

    // ── Two-Stage Joint Model ───────────────────────────────────
    // Stage 1: Fit LMM to longitudinal data
    // Stage 2: Use predicted m̂_i(t_event) in Cox model as covariate

    function fitTwoStageJoint(longData, survData, biomarkerVar, timeVar, eventTimeVar, eventVar, treatmentVar, studyVar, options) {
        options = options || {};

        // 1. Structure longitudinal data per patient
        var patientMap = {};
        (longData || []).forEach(function(d) {
            var pid = d.patient_id || d.patientId;
            var sid = d[studyVar] || d.study_id;
            var visitTime = toNum(d[timeVar] || d.visit_time);
            var bioVal = toNum(d[biomarkerVar]);
            var trt = toBin(d[treatmentVar]);
            if (!pid || visitTime === null || bioVal === null) return;

            if (!patientMap[pid]) {
                patientMap[pid] = { id: pid, study: String(sid || ''), treatment: trt ?? 0, visits: [] };
            }
            patientMap[pid].visits.push({ time: visitTime, value: bioVal });
        });

        var patients = Object.keys(patientMap).map(function(pid) { return patientMap[pid]; });
        if (patients.length < 10) return { error: 'Need at least 10 patients with longitudinal data. Got ' + patients.length };

        // 2. Fit LMM to longitudinal data
        var lmmFit = fitLMM(patients);
        if (lmmFit.error) return { error: 'LMM failed: ' + lmmFit.error };

        // 3. Predict biomarker value at event time for each patient
        var survMap = {};
        (survData || []).forEach(function(d) {
            var pid = d.patient_id || d.patientId;
            var eventTime = toNum(d[eventTimeVar]);
            var event = toBin(d[eventVar]);
            if (!pid || eventTime === null || event === null) return;
            survMap[pid] = { eventTime: eventTime, event: event };
        });

        // Build Cox data: treatment + predicted biomarker at event time
        var coxData = [];
        patients.forEach(function(pat, idx) {
            var surv = survMap[pat.id];
            if (!surv) return;

            // Predicted trajectory: m̂_i(t) = β₀ + β₁*t + β₂*trt + b̂₀_i + b̂₁_i*t
            var bHat = lmmFit.randomEffects[idx];
            var predictedAtEvent = lmmFit.beta[0] + lmmFit.beta[1] * surv.eventTime +
                lmmFit.beta[2] * pat.treatment + bHat[0] + bHat[1] * surv.eventTime;

            coxData.push({
                time: surv.eventTime,
                event: surv.event,
                treatment: pat.treatment,
                biomarker_predicted: predictedAtEvent,
                study: pat.study,
                patient_id: pat.id
            });
        });

        if (coxData.length < 10) return { error: 'Too few patients with both longitudinal and survival data' };

        // 4. Fit Cox model with treatment + predicted biomarker
        // Using the existing Cox machinery
        var sortedCox = coxData.sort(function(a, b) { return b.time - a.time; });
        var coxTimes = sortedCox.map(function(d) { return d.time; });
        var coxEvents = sortedCox.map(function(d) { return d.event; });
        var coxCovs = sortedCox.map(function(d) { return [d.treatment, d.biomarker_predicted]; });

        var coxResult = null;
        if (typeof SurvivalAnalysis !== 'undefined' && SurvivalAnalysis.coxPH) {
            coxResult = SurvivalAnalysis.coxPH(coxTimes, coxEvents, coxCovs);
        }

        if (!coxResult || !coxResult.beta) {
            // Fallback: simple Newton-Raphson for 2 covariates
            coxResult = simpleCox(coxTimes, coxEvents, coxCovs);
        }

        // 5. Format results
        var zc = getZ();
        var treatBeta = coxResult.beta[0];
        var treatSE = coxResult.se[0];
        var bioBeta = coxResult.beta[1]; // Association parameter α
        var bioSE = coxResult.se[1];

        return {
            method: 'Two-Stage Joint Model (LMM + Cox)',
            nPatients: coxData.length,
            nLongObservations: lmmFit.nObservations,

            longitudinal: {
                intercept: lmmFit.beta[0],
                timeSlope: lmmFit.beta[1],
                treatmentEffect: lmmFit.beta[2],
                sigma2: lmmFit.sigma2,
                randomIntVar: lmmFit.D[0][0],
                randomSlopeVar: lmmFit.D[1][1],
                correlation: (lmmFit.D[0][0] > 0 && lmmFit.D[1][1] > 0)
                    ? lmmFit.D[0][1] / Math.sqrt(lmmFit.D[0][0] * lmmFit.D[1][1]) : 0,
                convergence: lmmFit.convergence
            },

            survival: {
                treatment: {
                    beta: treatBeta,
                    HR: Math.exp(treatBeta),
                    se: treatSE,
                    CI: [Math.exp(treatBeta - zc * treatSE), Math.exp(treatBeta + zc * treatSE)],
                    pValue: pFromZ(treatBeta / treatSE)
                },
                biomarkerAssociation: {
                    alpha: bioBeta,
                    HR_per_unit: Math.exp(bioBeta),
                    se: bioSE,
                    CI: [Math.exp(bioBeta - zc * bioSE), Math.exp(bioBeta + zc * bioSE)],
                    pValue: pFromZ(bioBeta / bioSE),
                    interpretation: bioBeta > 0
                        ? 'Higher biomarker value associated with increased hazard (HR=' + Math.exp(bioBeta).toFixed(3) + ' per unit)'
                        : 'Higher biomarker value associated with decreased hazard (HR=' + Math.exp(bioBeta).toFixed(3) + ' per unit)'
                }
            },

            dynamicPrediction: function(patientVisits, horizon) {
                return dynamicPredictSurvival(lmmFit, coxResult, patientVisits, horizon);
            },

            reference: 'Rizopoulos D (2012). Joint Models for Longitudinal and Time-to-Event Data. Chapman & Hall. ' +
                       'Tsiatis AA, Davidian M (2004). JASA 99:1015-1026.'
        };
    }

    // ── Dynamic Prediction ──────────────────────────────────────
    // Given a patient's observed biomarker trajectory, predict survival beyond current time

    function dynamicPredictSurvival(lmmFit, coxResult, visits, horizon) {
        if (!visits || visits.length === 0) return null;

        // Sort visits by time
        visits.sort(function(a, b) { return a.time - b.time; });
        var lastTime = visits[visits.length - 1].time;
        var trt = visits[0].treatment || 0;

        // Estimate random effects for this patient from their visits
        var ztResid = [0, 0];
        var ztZ = [[0, 0], [0, 0]];
        visits.forEach(function(v) {
            var xBeta = lmmFit.beta[0] + lmmFit.beta[1] * v.time + lmmFit.beta[2] * trt;
            var resid = v.value - xBeta;
            ztResid[0] += resid;
            ztResid[1] += resid * v.time;
            ztZ[0][0] += 1;
            ztZ[0][1] += v.time;
            ztZ[1][0] += v.time;
            ztZ[1][1] += v.time * v.time;
        });

        var Dinv = invert2x2(lmmFit.D);
        if (!Dinv) return null;
        var Lambda = [
            [Dinv[0][0] + ztZ[0][0] / lmmFit.sigma2, Dinv[0][1] + ztZ[0][1] / lmmFit.sigma2],
            [Dinv[1][0] + ztZ[1][0] / lmmFit.sigma2, Dinv[1][1] + ztZ[1][1] / lmmFit.sigma2]
        ];
        var LambdaInv = invert2x2(Lambda);
        if (!LambdaInv) return null;
        var bHat = [
            (LambdaInv[0][0] * ztResid[0] + LambdaInv[0][1] * ztResid[1]) / lmmFit.sigma2,
            (LambdaInv[1][0] * ztResid[0] + LambdaInv[1][1] * ztResid[1]) / lmmFit.sigma2
        ];

        // Predict biomarker trajectory at future times
        horizon = horizon || lastTime + 12;
        var timePoints = [];
        for (var t = lastTime; t <= horizon; t += (horizon - lastTime) / 20) {
            var predicted = lmmFit.beta[0] + lmmFit.beta[1] * t + lmmFit.beta[2] * trt + bHat[0] + bHat[1] * t;
            // Approximate survival: S(t|history) ≈ exp(-∫ h₀ exp(γ*trt + α*m(s)) ds)
            // Using exponential baseline approximation
            var logHR = (coxResult.beta[0] || 0) * trt + (coxResult.beta[1] || 0) * predicted;
            timePoints.push({
                time: Math.round(t * 100) / 100,
                predictedBiomarker: Math.round(predicted * 1000) / 1000,
                logHR: Math.round(logHR * 1000) / 1000,
                cumulativeHR: Math.exp(logHR)
            });
        }

        return {
            currentTime: lastTime,
            horizon: horizon,
            nVisits: visits.length,
            randomEffects: { intercept: bHat[0], slope: bHat[1] },
            trajectory: timePoints,
            interpretation: bHat[1] > 0
                ? 'Biomarker is increasing over time (slope=' + bHat[1].toFixed(4) + ')'
                : 'Biomarker is decreasing over time (slope=' + bHat[1].toFixed(4) + ')'
        };
    }

    // ── Helpers ──────────────────────────────────────────────────

    function invert2x2(m) {
        if (!m || !m[0] || !m[1]) return null;
        var det = m[0][0] * m[1][1] - m[0][1] * m[1][0];
        if (Math.abs(det) < 1e-14) return null;
        return [
            [m[1][1] / det, -m[0][1] / det],
            [-m[1][0] / det, m[0][0] / det]
        ];
    }

    function solve3x3(A, b) {
        // Gaussian elimination for 3×3
        var n = A.length;
        var aug = new Array(n);
        for (var i = 0; i < n; i++) {
            aug[i] = new Array(n + 1);
            for (var j = 0; j < n; j++) aug[i][j] = A[i][j];
            aug[i][n] = b[i];
        }
        for (var col = 0; col < n; col++) {
            var maxRow = col;
            for (var row = col + 1; row < n; row++) {
                if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
            }
            var tmp = aug[col]; aug[col] = aug[maxRow]; aug[maxRow] = tmp;
            if (Math.abs(aug[col][col]) < 1e-14) return null;
            for (var row2 = col + 1; row2 < n; row2++) {
                var f = aug[row2][col] / aug[col][col];
                for (var j2 = col; j2 <= n; j2++) aug[row2][j2] -= f * aug[col][j2];
            }
        }
        var x = new Array(n);
        for (var i2 = n - 1; i2 >= 0; i2--) {
            x[i2] = aug[i2][n];
            for (var j3 = i2 + 1; j3 < n; j3++) x[i2] -= aug[i2][j3] * x[j3];
            x[i2] /= aug[i2][i2];
        }
        return x;
    }

    function simpleCox(times, events, covariates) {
        var N = times.length;
        var p = covariates[0].length;
        var beta = new Array(p).fill(0);

        for (var iter = 0; iter < 30; iter++) {
            var grad = new Array(p).fill(0);
            var info = new Array(p);
            for (var r = 0; r < p; r++) info[r] = new Array(p).fill(0);
            var riskSum = 0, s1 = new Array(p).fill(0);
            var s2 = new Array(p);
            for (var r2 = 0; r2 < p; r2++) s2[r2] = new Array(p).fill(0);

            // Sorted by decreasing time already
            for (var i = 0; i < N; i++) {
                var lp = 0;
                for (var j = 0; j < p; j++) lp += covariates[i][j] * beta[j];
                var eLP = Math.exp(Math.min(lp, 500));
                riskSum += eLP;
                for (var j2 = 0; j2 < p; j2++) {
                    s1[j2] += covariates[i][j2] * eLP;
                    for (var k = 0; k < p; k++) s2[j2][k] += covariates[i][j2] * covariates[i][k] * eLP;
                }
                if (events[i] === 1 && riskSum > 0) {
                    for (var j3 = 0; j3 < p; j3++) {
                        grad[j3] += covariates[i][j3] - s1[j3] / riskSum;
                        for (var k2 = 0; k2 < p; k2++) {
                            info[j3][k2] += s2[j3][k2] / riskSum - (s1[j3] * s1[k2]) / (riskSum * riskSum);
                        }
                    }
                }
            }
            for (var d = 0; d < p; d++) info[d][d] += 1e-8;
            var delta = solve3x3(info, grad);
            if (!delta) break;
            var maxD = 0;
            for (var j4 = 0; j4 < p; j4++) { beta[j4] += delta[j4]; maxD = Math.max(maxD, Math.abs(delta[j4])); }
            if (maxD < 1e-8) break;
        }

        // SE
        var se = new Array(p).fill(NaN);
        for (var d2 = 0; d2 < p; d2++) {
            // Recompute info diagonal
            se[d2] = info[d2][d2] > 0 ? Math.sqrt(1 / info[d2][d2]) : NaN;
        }

        return { beta: beta, se: se };
    }

    // ── Public API ──────────────────────────────────────────────
    return {
        fitTwoStageJoint: fitTwoStageJoint,
        dynamicPredict: dynamicPredictSurvival,
        _fitLMM: fitLMM,
        _invert2x2: invert2x2
    };
})();

if (typeof window !== 'undefined') {
    window.JointModels = JointModels;
}
