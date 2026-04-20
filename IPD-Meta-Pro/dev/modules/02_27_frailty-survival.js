// ═══════════════════════════════════════════════════════════════════
// Shared Frailty Cox & Stratified Cox Models for IPD Meta-Analysis
// Reference: Therneau & Grambsch (2000), Rondeau et al. (2012)
// Algorithm: Penalized partial likelihood + EM for frailty variance
// Equivalent to R: coxph(Surv(time, event) ~ treatment + frailty(study))
// ═══════════════════════════════════════════════════════════════════

var FrailtySurvival = (function() {
    'use strict';

    function toNum(v) {
        var n = Number(v);
        return Number.isFinite(n) ? n : null;
    }

    function toBin(v) {
        if (v === 1 || v === '1' || v === true) return 1;
        if (v === 0 || v === '0' || v === false) return 0;
        if (typeof v === 'string') {
            var s = v.trim().toLowerCase();
            if (['yes','true','treated','treatment','active'].indexOf(s) >= 0) return 1;
            if (['no','false','control','placebo'].indexOf(s) >= 0) return 0;
        }
        return null;
    }

    function getZ() { return (typeof getConfZ === 'function') ? getConfZ() : 1.96; }
    function normCDF(x) { return (typeof Stats !== 'undefined') ? Stats.normalCDF(x) : 0.5; }
    function pFromZ(z) { return 2 * (1 - normCDF(Math.abs(z))); }

    // ── Shared Frailty Cox Model ────────────────────────────────
    // Model: h_ij(t) = h_0(t) * exp(X_ij'β + b_i)
    //        b_i ~ N(0, θ) [log-normal frailty]
    //
    // Fitted via penalized partial likelihood:
    //   max_{β,b} ℓ_partial(β, b) - (1/2θ) Σ b_i²
    //
    // θ updated via EM: θ_new = (Σ b_i² + Σ var(b_i)) / K

    function fitSharedFrailtyCox(data, timeVar, eventVar, treatmentVar, studyVar, covariateVars, options) {
        options = options || {};
        covariateVars = covariateVars || [];
        var maxIter = options.maxIter || 100;
        var tol = options.tolerance || 1e-7;
        var maxNR = options.maxNR || 30;

        // ── 1. Clean and structure data ──
        var cleaned = [];
        (data || []).forEach(function(d) {
            var time = toNum(d[timeVar]);
            var event = toBin(d[eventVar]);
            var trt = toBin(d[treatmentVar]);
            var sid = d[studyVar];
            if (time === null || time <= 0 || event === null || trt === null || sid == null || sid === '') return;

            var covs = [];
            for (var c = 0; c < covariateVars.length; c++) {
                var cv = toNum(d[covariateVars[c]]);
                if (cv === null) return;
                covs.push(cv);
            }
            cleaned.push({ time: time, event: event, trt: trt, study: String(sid), covs: covs });
        });

        if (cleaned.length < 20) return { error: 'Need at least 20 complete cases. Got ' + cleaned.length };

        // Study indexing
        var studyLabels = [];
        var studyMap = {};
        cleaned.forEach(function(r) {
            if (!studyMap.hasOwnProperty(r.study)) {
                studyMap[r.study] = studyLabels.length;
                studyLabels.push(r.study);
            }
        });
        var K = studyLabels.length;
        if (K < 2) return { error: 'Need at least 2 studies' };

        var N = cleaned.length;
        var p = 1 + covariateVars.length; // treatment + covariates (fixed effects)

        // Sort by time (descending) for risk set computation
        cleaned.sort(function(a, b) { return b.time - a.time; });

        // Build covariate matrix X (N × p) and study membership
        var X = new Array(N);
        var studyOf = new Array(N);
        var times = new Array(N);
        var events = new Array(N);
        for (var i = 0; i < N; i++) {
            var row = [cleaned[i].trt];
            for (var c2 = 0; c2 < covariateVars.length; c2++) row.push(cleaned[i].covs[c2]);
            X[i] = row;
            studyOf[i] = studyMap[cleaned[i].study];
            times[i] = cleaned[i].time;
            events[i] = cleaned[i].event;
        }

        // ── 2. Initialize via stratified Cox ──
        // Use stratified Cox (common β, study-specific baselines) as starting point
        var beta = new Array(p).fill(0);
        var b = new Array(K).fill(0);
        var theta = 0.1;

        // Group data by study for efficient computation
        var studyGroups = new Array(K);
        for (var sg = 0; sg < K; sg++) studyGroups[sg] = [];
        for (var ig = 0; ig < N; ig++) studyGroups[studyOf[ig]].push(ig);

        // Cox partial log-likelihood for a single study given beta, b_k
        function studyPL(studyIndices, betaVec, bk) {
            // Sort by decreasing time
            var sorted = studyIndices.slice().sort(function(a, bb2) { return times[bb2] - times[a]; });
            var logL = 0;
            var riskSum = 0;
            for (var i = 0; i < sorted.length; i++) {
                var idx2 = sorted[i];
                var lp = bk;
                for (var j = 0; j < p; j++) lp += X[idx2][j] * betaVec[j];
                var eLP = Math.exp(Math.min(lp, 500));
                riskSum += eLP;
                if (events[idx2] === 1 && riskSum > 0) {
                    logL += lp - Math.log(riskSum);
                }
            }
            return logL;
        }

        // Score and info for β from all studies (given current b)
        function betaScoreInfo(betaVec) {
            var grad = new Array(p).fill(0);
            var info = new Array(p);
            for (var r = 0; r < p; r++) { info[r] = new Array(p).fill(0); }

            for (var s = 0; s < K; s++) {
                var sorted = studyGroups[s].slice().sort(function(a, bb3) { return times[bb3] - times[a]; });
                var riskSum = 0;
                var s1 = new Array(p).fill(0);
                var s2 = new Array(p);
                for (var r2 = 0; r2 < p; r2++) s2[r2] = new Array(p).fill(0);

                for (var i = 0; i < sorted.length; i++) {
                    var idx2 = sorted[i];
                    var lp = b[s];
                    for (var j = 0; j < p; j++) lp += X[idx2][j] * betaVec[j];
                    var eLP = Math.exp(Math.min(lp, 500));
                    riskSum += eLP;
                    for (var j2 = 0; j2 < p; j2++) {
                        s1[j2] += X[idx2][j2] * eLP;
                        for (var k = 0; k < p; k++) s2[j2][k] += X[idx2][j2] * X[idx2][k] * eLP;
                    }

                    if (events[idx2] === 1 && riskSum > 0) {
                        for (var j3 = 0; j3 < p; j3++) {
                            grad[j3] += X[idx2][j3] - s1[j3] / riskSum;
                            for (var k2 = 0; k2 < p; k2++) {
                                info[j3][k2] += s2[j3][k2] / riskSum - (s1[j3] * s1[k2]) / (riskSum * riskSum);
                            }
                        }
                    }
                }
            }
            return { grad: grad, info: info };
        }

        // Score for b_k (given beta, theta) — scalar
        function bScore(studyIdx2, bk, betaVec, thetaVal) {
            var sorted = studyGroups[studyIdx2].slice().sort(function(a, bb4) { return times[bb4] - times[a]; });
            var grad = 0;
            var info = 0;
            var riskSum = 0;
            var s1b = 0;
            var s2b = 0;

            for (var i = 0; i < sorted.length; i++) {
                var idx2 = sorted[i];
                var lp = bk;
                for (var j = 0; j < p; j++) lp += X[idx2][j] * betaVec[j];
                var eLP = Math.exp(Math.min(lp, 500));
                riskSum += eLP;
                s1b += eLP;
                s2b += eLP;

                if (events[idx2] === 1 && riskSum > 0) {
                    grad += 1 - s1b / riskSum;
                    info += s2b / riskSum - (s1b * s1b) / (riskSum * riskSum);
                }
            }
            // Add penalty
            grad -= bk / Math.max(thetaVal, 1e-10);
            info += 1 / Math.max(thetaVal, 1e-10);
            return { grad: grad, info: info };
        }

        // ── 3. Alternating optimization: β → b → θ ──
        var converged = false;
        var outerIter = 0;

        for (outerIter = 0; outerIter < maxIter; outerIter++) {
            var prevBeta = beta.slice();
            var prevB = b.slice();
            var prevTheta = theta;

            // Step A: Update β via Newton-Raphson (1-3 inner steps)
            for (var nrStep = 0; nrStep < 5; nrStep++) {
                var si = betaScoreInfo(beta);
                // Add small regularization
                for (var d = 0; d < p; d++) si.info[d][d] += 1e-8;
                var delta;
                if (p === 1) {
                    delta = [si.grad[0] / si.info[0][0]];
                } else {
                    delta = gaussSolve(si.info, si.grad);
                }
                if (!delta) break;
                var maxD = 0;
                for (var j = 0; j < p; j++) {
                    var step = Math.max(-2, Math.min(2, delta[j]));
                    beta[j] += step;
                    maxD = Math.max(maxD, Math.abs(step));
                }
                if (maxD < tol * 0.01) break;
            }

            // Step B: Update each b_k via penalized Newton (1-3 steps per study)
            for (var k = 0; k < K; k++) {
                for (var bStep = 0; bStep < 3; bStep++) {
                    var bs = bScore(k, b[k], beta, theta);
                    if (bs.info < 1e-10) break;
                    var bDelta = bs.grad / bs.info;
                    bDelta = Math.max(-1, Math.min(1, bDelta));
                    b[k] += bDelta;
                    if (Math.abs(bDelta) < tol * 0.01) break;
                }
            }

            // Step C: Update θ via EM
            // θ_new = (Σ b_k² + Σ 1/info_kk) / K
            var sumB2 = 0, sumVar = 0;
            for (var k2 = 0; k2 < K; k2++) {
                sumB2 += b[k2] * b[k2];
                var bs2 = bScore(k2, b[k2], beta, theta);
                sumVar += bs2.info > 1e-10 ? 1 / bs2.info : theta;
            }
            theta = Math.max(1e-8, (sumB2 + sumVar) / K);

            // Check convergence
            var maxDelta2 = Math.abs(theta - prevTheta);
            for (var j2 = 0; j2 < p; j2++) maxDelta2 = Math.max(maxDelta2, Math.abs(beta[j2] - prevBeta[j2]));
            for (var k3 = 0; k3 < K; k3++) maxDelta2 = Math.max(maxDelta2, Math.abs(b[k3] - prevB[k3]));

            if (maxDelta2 < tol) { converged = true; break; }
        }

        // ── 4. Compute standard errors from Fisher information ──
        var siFinal = betaScoreInfo(beta);
        for (var d2 = 0; d2 < p; d2++) siFinal.info[d2][d2] += 1e-10;
        var betaSE = new Array(p).fill(NaN);
        if (p === 1) {
            betaSE[0] = siFinal.info[0][0] > 0 ? Math.sqrt(1 / siFinal.info[0][0]) : NaN;
        } else {
            var infoInv = gaussInverse(siFinal.info);
            if (infoInv) {
                for (var d3 = 0; d3 < p; d3++) betaSE[d3] = Math.sqrt(Math.max(0, infoInv[d3][d3]));
            }
        }

        // ── 6. Format results ──
        var zc = getZ();
        var treatBeta = beta[0];
        var treatSE = betaSE[0];
        var HR = Math.exp(treatBeta);

        // Heterogeneity measures
        var studyHRs = studyLabels.map(function(label, k) {
            return {
                study: label,
                frailty: Math.exp(b[k]),
                logFrailty: b[k],
                n: cleaned.filter(function(r) { return r.study === label; }).length,
                events: cleaned.filter(function(r) { return r.study === label && r.event === 1; }).length
            };
        });

        // I² approximation from frailty variance
        // I² ≈ θ / (θ + typical_within_study_variance)
        var typicalVar = treatSE * treatSE;
        var I2 = (theta + typicalVar) > 0 ? Math.max(0, Math.min(100, 100 * theta / (theta + typicalVar))) : 0;

        return {
            method: 'Shared Frailty Cox Model (Penalized PL)',
            equivalent: 'R: coxph(Surv(time, event) ~ treatment + frailty(study))',
            nStudies: K,
            nPatients: N,
            nEvents: events.reduce(function(a, b2) { return a + b2; }, 0),
            studyLabels: studyLabels,

            treatment: {
                beta: treatBeta,
                HR: HR,
                se: treatSE,
                CI: [Math.exp(treatBeta - zc * treatSE), Math.exp(treatBeta + zc * treatSE)],
                CI_logScale: [treatBeta - zc * treatSE, treatBeta + zc * treatSE],
                zStat: treatBeta / treatSE,
                pValue: pFromZ(treatBeta / treatSE)
            },

            covariates: covariateVars.map(function(name, idx) {
                var ci = idx + 1;
                return {
                    name: name,
                    beta: beta[ci],
                    HR: Math.exp(beta[ci]),
                    se: betaSE[ci],
                    pValue: pFromZ(beta[ci] / betaSE[ci])
                };
            }),

            frailty: {
                variance: theta,
                sd: Math.sqrt(theta),
                distribution: 'log-normal',
                studyEffects: studyHRs,
                interpretation: theta < 0.01 ? 'Negligible between-study heterogeneity (θ=' + theta.toFixed(4) + ')'
                    : theta < 0.1 ? 'Low between-study heterogeneity (θ=' + theta.toFixed(4) + ')'
                    : theta < 0.5 ? 'Moderate between-study heterogeneity (θ=' + theta.toFixed(4) + ')'
                    : 'Substantial between-study heterogeneity (θ=' + theta.toFixed(4) + ')'
            },

            heterogeneity: {
                tau_sq: theta,
                tau: Math.sqrt(theta),
                I2: I2
            },

            convergence: {
                converged: converged,
                iterations: outerIter + 1
            },

            // Prediction interval for HR
            predictionInterval: {
                lower: Math.exp(treatBeta - zc * Math.sqrt(treatSE * treatSE + theta)),
                upper: Math.exp(treatBeta + zc * Math.sqrt(treatSE * treatSE + theta))
            },

            // Compatibility fields
            pooled_effect: treatBeta,
            SE: treatSE,
            CI_lower: treatBeta - zc * treatSE,
            CI_upper: treatBeta + zc * treatSE,
            p_value: pFromZ(treatBeta / treatSE),
            tau2: theta,
            I2: I2,

            reference: 'Therneau TM, Grambsch PM (2000). Modeling Survival Data. Springer. ' +
                       'Rondeau V et al. (2012). frailtypack: An R Package for the Analysis of Correlated Survival Data. JSS 47(4).'
        };
    }

    // ── Stratified Cox ──────────────────────────────────────────
    // Separate baseline hazard per stratum, common treatment effect
    // h_ij(t) = h_0s(t) * exp(X_ij'β) where s = stratum

    function fitStratifiedCox(data, timeVar, eventVar, treatmentVar, stratumVar, covariateVars, options) {
        options = options || {};
        covariateVars = covariateVars || [];

        // Clean data
        var cleaned = [];
        (data || []).forEach(function(d) {
            var time = toNum(d[timeVar]);
            var event = toBin(d[eventVar]);
            var trt = toBin(d[treatmentVar]);
            var stratum = d[stratumVar];
            if (time === null || time <= 0 || event === null || trt === null || stratum == null) return;

            var covs = [];
            for (var c = 0; c < covariateVars.length; c++) {
                var cv = toNum(d[covariateVars[c]]);
                if (cv === null) return;
                covs.push(cv);
            }
            cleaned.push({ time: time, event: event, trt: trt, stratum: String(stratum), covs: covs });
        });

        if (cleaned.length < 20) return { error: 'Need at least 20 cases' };

        // Group by stratum
        var strata = {};
        cleaned.forEach(function(r) {
            if (!strata[r.stratum]) strata[r.stratum] = [];
            strata[r.stratum].push(r);
        });
        var stratumLabels = Object.keys(strata);
        if (stratumLabels.length < 2) return { error: 'Need at least 2 strata' };

        var p = 1 + covariateVars.length;
        var beta = new Array(p).fill(0);
        var maxIter = options.maxIter || 50;
        var tol = options.tolerance || 1e-8;

        // Newton-Raphson: sum partial likelihoods across strata
        for (var iter = 0; iter < maxIter; iter++) {
            var grad = new Array(p).fill(0);
            var H = new Array(p);
            for (var r = 0; r < p; r++) { H[r] = new Array(p).fill(0); }

            stratumLabels.forEach(function(sLabel) {
                var sData = strata[sLabel];
                // Sort by decreasing time
                sData.sort(function(a, b2) { return b2.time - a.time; });

                var riskExpSum = 0;
                var s1 = new Array(p).fill(0);
                var s2 = new Array(p);
                for (var r2 = 0; r2 < p; r2++) s2[r2] = new Array(p).fill(0);

                for (var i = 0; i < sData.length; i++) {
                    var xi = [sData[i].trt];
                    for (var c2 = 0; c2 < covariateVars.length; c2++) xi.push(sData[i].covs[c2]);

                    var lp = 0;
                    for (var j = 0; j < p; j++) lp += xi[j] * beta[j];
                    var eHat = Math.exp(Math.min(lp, 500));

                    riskExpSum += eHat;
                    for (var j2 = 0; j2 < p; j2++) {
                        s1[j2] += xi[j2] * eHat;
                        for (var k = 0; k < p; k++) s2[j2][k] += xi[j2] * xi[k] * eHat;
                    }

                    if (sData[i].event === 1 && riskExpSum > 0) {
                        for (var j3 = 0; j3 < p; j3++) {
                            grad[j3] += xi[j3] - s1[j3] / riskExpSum;
                            for (var k2 = 0; k2 < p; k2++) {
                                H[j3][k2] -= s2[j3][k2] / riskExpSum - (s1[j3] * s1[k2]) / (riskExpSum * riskExpSum);
                            }
                        }
                    }
                }
            });

            // Solve -H * delta = grad
            var negH2 = H.map(function(row, r) {
                return row.map(function(v, c) { return -v + (r === c ? 1e-8 : 0); });
            });
            var delta = gaussSolve(negH2, grad);
            if (!delta) break;

            var maxD = 0;
            for (var j4 = 0; j4 < p; j4++) {
                beta[j4] += delta[j4];
                maxD = Math.max(maxD, Math.abs(delta[j4]));
            }
            if (maxD < tol) break;
        }

        // SE from -H^{-1}
        var betaSE = new Array(p).fill(NaN);
        // Recompute final H
        var Hfinal = new Array(p);
        for (var r3 = 0; r3 < p; r3++) Hfinal[r3] = new Array(p).fill(0);

        stratumLabels.forEach(function(sLabel) {
            var sData = strata[sLabel];
            sData.sort(function(a, b2) { return b2.time - a.time; });
            var riskExpSum = 0, s1 = new Array(p).fill(0);
            var s2 = new Array(p);
            for (var r4 = 0; r4 < p; r4++) s2[r4] = new Array(p).fill(0);

            for (var i = 0; i < sData.length; i++) {
                var xi = [sData[i].trt];
                for (var c3 = 0; c3 < covariateVars.length; c3++) xi.push(sData[i].covs[c3]);
                var lp = 0;
                for (var j = 0; j < p; j++) lp += xi[j] * beta[j];
                var eHat = Math.exp(Math.min(lp, 500));
                riskExpSum += eHat;
                for (var j2 = 0; j2 < p; j2++) {
                    s1[j2] += xi[j2] * eHat;
                    for (var k = 0; k < p; k++) s2[j2][k] += xi[j2] * xi[k] * eHat;
                }
                if (sData[i].event === 1 && riskExpSum > 0) {
                    for (var j3 = 0; j3 < p; j3++) {
                        for (var k2 = 0; k2 < p; k2++) {
                            Hfinal[j3][k2] -= s2[j3][k2] / riskExpSum - (s1[j3] * s1[k2]) / (riskExpSum * riskExpSum);
                        }
                    }
                }
            }
        });

        var negHfinal = Hfinal.map(function(row, r) {
            return row.map(function(v, c) { return -v + (r === c ? 1e-10 : 0); });
        });
        var HInv = gaussInverse(negHfinal);
        if (HInv) {
            for (var d = 0; d < p; d++) betaSE[d] = Math.sqrt(Math.max(0, HInv[d][d]));
        }

        var zc = getZ();
        var treatBeta = beta[0];
        var treatSE2 = betaSE[0];

        return {
            method: 'Stratified Cox Proportional Hazards',
            equivalent: 'R: coxph(Surv(time, event) ~ treatment + strata(study))',
            nPatients: cleaned.length,
            nEvents: cleaned.filter(function(r) { return r.event === 1; }).length,
            nStrata: stratumLabels.length,
            strataLabels: stratumLabels,
            strataCounts: stratumLabels.map(function(s) {
                return { stratum: s, n: strata[s].length, events: strata[s].filter(function(r) { return r.event === 1; }).length };
            }),
            treatment: {
                beta: treatBeta,
                HR: Math.exp(treatBeta),
                se: treatSE2,
                CI: [Math.exp(treatBeta - zc * treatSE2), Math.exp(treatBeta + zc * treatSE2)],
                zStat: treatBeta / treatSE2,
                pValue: pFromZ(treatBeta / treatSE2)
            },
            covariates: covariateVars.map(function(name, idx) {
                var ci2 = idx + 1;
                return { name: name, beta: beta[ci2], HR: Math.exp(beta[ci2]), se: betaSE[ci2], pValue: pFromZ(beta[ci2] / betaSE[ci2]) };
            }),
            // Compatibility
            pooled_effect: treatBeta, SE: treatSE2,
            CI_lower: treatBeta - zc * treatSE2, CI_upper: treatBeta + zc * treatSE2,
            p_value: pFromZ(treatBeta / treatSE2)
        };
    }

    // ── Linear algebra helpers ──────────────────────────────────
    function gaussSolve(A, b) {
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
                var factor = aug[row2][col] / aug[col][col];
                for (var j2 = col; j2 <= n; j2++) aug[row2][j2] -= factor * aug[col][j2];
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

    function gaussInverse(A) {
        var n = A.length;
        var inv = new Array(n);
        for (var col = 0; col < n; col++) {
            var e = new Array(n).fill(0);
            e[col] = 1;
            var x = gaussSolve(A, e);
            if (!x) return null;
            inv[col] = x;
        }
        var result = new Array(n);
        for (var r = 0; r < n; r++) {
            result[r] = new Array(n);
            for (var c = 0; c < n; c++) result[r][c] = inv[c][r];
        }
        return result;
    }

    // ── Public API ──────────────────────────────────────────────
    return {
        fitSharedFrailty: fitSharedFrailtyCox,
        fitStratifiedCox: fitStratifiedCox,
        _gaussSolve: gaussSolve
    };
})();

if (typeof window !== 'undefined') {
    window.FrailtySurvival = FrailtySurvival;
}
