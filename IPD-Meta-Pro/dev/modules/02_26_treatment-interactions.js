// ═══════════════════════════════════════════════════════════════════
// Treatment-Covariate Interaction Analysis for IPD Meta-Analysis
// Reference: Riley et al. (2020), Hua et al. (2017), Fisher et al. (2017)
// ═══════════════════════════════════════════════════════════════════

var TreatmentInteraction = (function() {
    'use strict';

    // ── Helpers ──────────────────────────────────────────────────

    function toNum(v) {
        var n = Number(v);
        return Number.isFinite(n) ? n : null;
    }

    function toBin(v) {
        if (v === 1 || v === '1' || v === true) return 1;
        if (v === 0 || v === '0' || v === false) return 0;
        if (typeof v === 'string') {
            var s = v.trim().toLowerCase();
            if (['yes', 'true', 'treated', 'treatment', 'active'].indexOf(s) >= 0) return 1;
            if (['no', 'false', 'control', 'placebo'].indexOf(s) >= 0) return 0;
        }
        return null;
    }

    function getZ() {
        return (typeof getConfZ === 'function') ? getConfZ() : 1.96;
    }

    function pFromZ(z) {
        return 2 * (1 - ((typeof Stats !== 'undefined') ? Stats.normalCDF(Math.abs(z)) : 0.5));
    }

    // DerSimonian-Laird random effects for array of {yi, vi}
    function poolRE(studies) {
        if (!studies || studies.length === 0) return null;
        if (studies.length === 1) {
            var s = studies[0];
            var z1 = getZ();
            return {
                estimate: s.yi, se: Math.sqrt(s.vi), tau2: 0, I2: 0, k: 1,
                ci_lower: s.yi - z1 * Math.sqrt(s.vi),
                ci_upper: s.yi + z1 * Math.sqrt(s.vi)
            };
        }
        // Use MetaAnalysis if available, otherwise inline DL
        if (typeof MetaAnalysis !== 'undefined' && MetaAnalysis.randomEffectsDL) {
            var effs = studies.map(function(s) { return s.yi; });
            var vars = studies.map(function(s) { return s.vi; });
            var res = MetaAnalysis.randomEffectsDL(effs, vars);
            return {
                estimate: res.pooled, se: res.se, tau2: res.tau2, I2: res.I2, k: studies.length,
                ci_lower: res.ci_lower, ci_upper: res.ci_upper
            };
        }
        // Inline DL
        var w = studies.map(function(s) { return 1 / s.vi; });
        var sumW = w.reduce(function(a, b) { return a + b; }, 0);
        var est = w.reduce(function(a, wi, i) { return a + wi * studies[i].yi; }, 0) / sumW;
        var Q = w.reduce(function(a, wi, i) { return a + wi * Math.pow(studies[i].yi - est, 2); }, 0);
        var k = studies.length;
        var C = sumW - w.reduce(function(a, wi) { return a + wi * wi; }, 0) / sumW;
        var tau2 = Math.max(0, (Q - (k - 1)) / C);
        var wStar = studies.map(function(s) { return 1 / (s.vi + tau2); });
        var sumWStar = wStar.reduce(function(a, b) { return a + b; }, 0);
        var pooled = wStar.reduce(function(a, wi, i) { return a + wi * studies[i].yi; }, 0) / sumWStar;
        var se = Math.sqrt(1 / sumWStar);
        var I2 = Q > k - 1 ? Math.max(0, Math.min(100, 100 * (Q - (k - 1)) / Q)) : 0;
        var zc = getZ();
        return {
            estimate: pooled, se: se, tau2: tau2, I2: I2, k: k,
            ci_lower: pooled - zc * se, ci_upper: pooled + zc * se
        };
    }

    // ── 1. Subgroup Treatment Effects ───────────────────────────
    // Split patients by a categorical/binary covariate, estimate treatment
    // effect within each subgroup, test for interaction (Q-test)

    function subgroupAnalysis(data, outcomeVar, treatmentVar, studyVar, subgroupVar, options) {
        options = options || {};
        var outcomeBinary = options.binary || false;

        // Clean data
        var cleaned = [];
        (data || []).forEach(function(d) {
            var y = outcomeBinary ? toBin(d[outcomeVar]) : toNum(d[outcomeVar]);
            var t = toBin(d[treatmentVar]);
            var sid = d[studyVar];
            var sg = d[subgroupVar];
            if (y === null || t === null || sid == null || sid === '' || sg == null || sg === '') return;
            cleaned.push({ y: y, t: t, study: String(sid), subgroup: String(sg) });
        });

        if (cleaned.length < 20) return { error: 'Need at least 20 complete cases. Got ' + cleaned.length };

        // Identify subgroups
        var sgLabels = [];
        var sgMap = {};
        cleaned.forEach(function(r) {
            if (!sgMap.hasOwnProperty(r.subgroup)) {
                sgMap[r.subgroup] = sgLabels.length;
                sgLabels.push(r.subgroup);
            }
        });

        if (sgLabels.length < 2) return { error: 'Need at least 2 subgroups. Got ' + sgLabels.length };
        if (sgLabels.length > 20) return { error: 'Too many subgroup levels (' + sgLabels.length + '). Use continuous interaction instead.' };

        // Per-subgroup: estimate treatment effect via two-stage (study-level then pool)
        var subgroupResults = [];
        sgLabels.forEach(function(sgLabel) {
            var sgData = cleaned.filter(function(r) { return r.subgroup === sgLabel; });
            if (sgData.length < 10) {
                subgroupResults.push({ subgroup: sgLabel, n: sgData.length, error: 'too few patients' });
                return;
            }

            // Group by study within this subgroup
            var byStudy = {};
            sgData.forEach(function(r) {
                if (!byStudy[r.study]) byStudy[r.study] = [];
                byStudy[r.study].push(r);
            });

            var studyEffects = [];
            Object.keys(byStudy).forEach(function(sid) {
                var rows = byStudy[sid];
                var treated = rows.filter(function(r) { return r.t === 1; });
                var control = rows.filter(function(r) { return r.t === 0; });
                if (treated.length < 2 || control.length < 2) return;

                if (outcomeBinary) {
                    // Log-OR from 2×2 table
                    var a = treated.filter(function(r) { return r.y === 1; }).length;
                    var b_val = treated.length - a;
                    var c_val = control.filter(function(r) { return r.y === 1; }).length;
                    var d_val = control.length - c_val;
                    // Add 0.5 correction if any zero cell
                    if (a === 0 || b_val === 0 || c_val === 0 || d_val === 0) {
                        a += 0.5; b_val += 0.5; c_val += 0.5; d_val += 0.5;
                    }
                    var logOR = Math.log((a * d_val) / (b_val * c_val));
                    var seLogOR = Math.sqrt(1/a + 1/b_val + 1/c_val + 1/d_val);
                    studyEffects.push({ yi: logOR, vi: seLogOR * seLogOR, study: sid, n: rows.length });
                } else {
                    // Mean difference
                    var meanT = treated.reduce(function(s, r) { return s + r.y; }, 0) / treated.length;
                    var meanC = control.reduce(function(s, r) { return s + r.y; }, 0) / control.length;
                    var varT = treated.reduce(function(s, r) { return s + Math.pow(r.y - meanT, 2); }, 0) / Math.max(1, treated.length - 1);
                    var varC = control.reduce(function(s, r) { return s + Math.pow(r.y - meanC, 2); }, 0) / Math.max(1, control.length - 1);
                    var md = meanT - meanC;
                    var seMD = Math.sqrt(varT / treated.length + varC / control.length);
                    studyEffects.push({ yi: md, vi: seMD * seMD, study: sid, n: rows.length });
                }
            });

            if (studyEffects.length === 0) {
                subgroupResults.push({ subgroup: sgLabel, n: sgData.length, error: 'no valid study-level estimates' });
                return;
            }

            var pooled = poolRE(studyEffects);
            var zc = getZ();
            subgroupResults.push({
                subgroup: sgLabel,
                n: sgData.length,
                nStudies: studyEffects.length,
                estimate: pooled.estimate,
                se: pooled.se,
                ci_lower: pooled.ci_lower,
                ci_upper: pooled.ci_upper,
                tau2: pooled.tau2,
                I2: pooled.I2,
                pValue: pFromZ(pooled.estimate / pooled.se),
                // For forest plot
                OR: outcomeBinary ? Math.exp(pooled.estimate) : undefined,
                OR_ci: outcomeBinary ? [Math.exp(pooled.ci_lower), Math.exp(pooled.ci_upper)] : undefined
            });
        });

        // Interaction test: Q-test for subgroup differences
        var validSGs = subgroupResults.filter(function(sg) { return !sg.error && typeof sg.estimate === 'number'; });
        var Q_interaction = 0;
        if (validSGs.length >= 2) {
            var wSub = validSGs.map(function(sg) { return 1 / (sg.se * sg.se); });
            var sumWSub = wSub.reduce(function(a, b) { return a + b; }, 0);
            var pooledAll = wSub.reduce(function(a, w, i) { return a + w * validSGs[i].estimate; }, 0) / sumWSub;
            Q_interaction = wSub.reduce(function(a, w, i) { return a + w * Math.pow(validSGs[i].estimate - pooledAll, 2); }, 0);
        }
        var df_interaction = Math.max(1, validSGs.length - 1);
        var p_interaction = 1 - ((typeof Stats !== 'undefined') ? Stats.chiSquareCDF(Q_interaction, df_interaction) : 0);

        return {
            method: 'Subgroup Treatment Effect Analysis',
            outcomeType: outcomeBinary ? 'binary' : 'continuous',
            estimand: outcomeBinary ? 'log-OR' : 'mean difference',
            nPatients: cleaned.length,
            subgroupVariable: subgroupVar,
            subgroups: subgroupResults,
            interactionTest: {
                Q: Q_interaction,
                df: df_interaction,
                pValue: p_interaction,
                significant: p_interaction < 0.05,
                interpretation: p_interaction < 0.05
                    ? 'Significant subgroup interaction (p=' + p_interaction.toFixed(4) + '): treatment effect varies across subgroups.'
                    : 'No significant subgroup interaction (p=' + p_interaction.toFixed(4) + '): treatment effect appears consistent across subgroups.'
            },
            // For interaction forest plot
            forestPlotData: validSGs.map(function(sg) {
                return {
                    label: sg.subgroup,
                    estimate: sg.estimate,
                    ci_lower: sg.ci_lower,
                    ci_upper: sg.ci_upper,
                    n: sg.n,
                    weight: 1 / (sg.se * sg.se)
                };
            })
        };
    }

    // ── 2. Within-Study Centered GLMM Interaction ───────────────
    // Separate within-trial and across-trial associations for binary outcomes
    // Model: logit(P(Y=1)) = β₀ + β₁*Trt + β₂*(X_ij - X̄_i) + β₃*Trt*(X_ij - X̄_i) + β₄*X̄_i + b_i
    // β₃ = within-trial interaction (causal), β₄ = ecological association

    function centeredGLMMInteraction(data, outcomeVar, treatmentVar, studyVar, covariateVar, options) {
        options = options || {};

        var cleaned = [];
        (data || []).forEach(function(d) {
            var y = toBin(d[outcomeVar]);
            var t = toBin(d[treatmentVar]);
            var c = toNum(d[covariateVar]);
            var sid = d[studyVar];
            if (y === null || t === null || c === null || sid == null || sid === '') return;
            cleaned.push({ y: y, t: t, c: c, study: String(sid) });
        });

        if (cleaned.length < 30) return { error: 'Need at least 30 complete cases. Got ' + cleaned.length };

        // Compute study-level covariate means
        var byStudy = {};
        cleaned.forEach(function(r) {
            if (!byStudy[r.study]) byStudy[r.study] = [];
            byStudy[r.study].push(r);
        });

        var studyMeans = {};
        Object.keys(byStudy).forEach(function(sid) {
            var rows = byStudy[sid];
            studyMeans[sid] = rows.reduce(function(s, r) { return s + r.c; }, 0) / rows.length;
        });

        if (Object.keys(byStudy).length < 2) return { error: 'Need at least 2 studies' };

        // Build centered design matrix:
        // X = [1, trt, (c - c̄_study), trt*(c - c̄_study), c̄_study]
        var ipdForGLMM = cleaned.map(function(r) {
            var cCentered = r.c - studyMeans[r.study];
            return {
                outcome: r.y,
                treatment: r.t,
                study_id: r.study,
                cov_within: cCentered,
                cov_interaction: r.t * cCentered,
                cov_between: studyMeans[r.study]
            };
        });

        // Fit GLMM with centered covariates
        if (typeof OneStageGLMM !== 'undefined' && OneStageGLMM.fitBinary) {
            var result = OneStageGLMM.fitBinary(
                ipdForGLMM,
                'outcome', 'treatment', 'study_id',
                ['cov_within', 'cov_interaction', 'cov_between'],
                { maxIter: options.maxIter || 50 }
            );

            if (result && !result.error) {
                // β[0]=intercept, β[1]=treatment, β[2]=within, β[3]=interaction, β[4]=between
                var beta = result.fixedEffects.beta;
                var se = result.fixedEffects.se;
                var zc = getZ();

                var withinInt = {
                    estimate: beta[3] || 0,
                    se: se[3] || NaN,
                    OR: Math.exp(beta[3] || 0),
                    ci_lower: (beta[3] || 0) - zc * (se[3] || 0),
                    ci_upper: (beta[3] || 0) + zc * (se[3] || 0),
                    pValue: pFromZ((beta[3] || 0) / (se[3] || 1))
                };

                var betweenAssoc = {
                    estimate: beta[4] || 0,
                    se: se[4] || NaN,
                    pValue: pFromZ((beta[4] || 0) / (se[4] || 1))
                };

                var ecoBias = (beta[4] || 0) - (beta[3] || 0);

                return {
                    method: 'Within-Study Centered GLMM Interaction',
                    family: 'binomial',
                    estimand: 'log-OR interaction per unit covariate',
                    nStudies: result.nStudies,
                    nPatients: result.nPatients,
                    variables: {
                        outcome: outcomeVar,
                        treatment: treatmentVar,
                        covariate: covariateVar,
                        study: studyVar
                    },
                    treatmentEffect: {
                        logOR: beta[1],
                        OR: Math.exp(beta[1]),
                        se: se[1],
                        pValue: result.treatment.pValue
                    },
                    withinTrialInteraction: withinInt,
                    acrossTrialAssociation: betweenAssoc,
                    ecologicalBias: {
                        estimate: ecoBias,
                        interpretation: Math.abs(ecoBias) > Math.abs(withinInt.estimate) * 0.25
                            ? 'Meaningful ecological bias detected; within-trial estimate preferred.'
                            : 'Limited ecological bias detected.'
                    },
                    convergence: result.convergence,
                    tau2: result.randomEffects.tau2,
                    reference: 'Hua H et al. (2017) Statistics in Medicine 36:772-789; ' +
                              'Riley RD et al. (2020) BMJ 370:m3018'
                };
            }
        }

        // Fallback: use existing centeredOneStageInteractionIPD for continuous outcomes
        if (typeof BeyondR40 !== 'undefined' && BeyondR40.centeredOneStageInteractionIPD) {
            return BeyondR40.centeredOneStageInteractionIPD(data, outcomeVar, treatmentVar, covariateVar, studyVar);
        }

        return { error: 'OneStageGLMM module required for binary centered interaction' };
    }

    // ── 3. Multi-Covariate Interaction Screening ────────────────
    // Test multiple covariates for treatment interaction, rank by evidence

    function screenInteractions(data, outcomeVar, treatmentVar, studyVar, covariateVars, options) {
        options = options || {};
        var outcomeBinary = options.binary || false;

        if (!covariateVars || covariateVars.length === 0) {
            return { error: 'Provide at least one covariate to screen' };
        }

        var results = [];
        covariateVars.forEach(function(covVar) {
            // Determine if covariate is categorical or continuous
            var uniqueVals = {};
            var numericCount = 0;
            var total = 0;
            (data || []).forEach(function(d) {
                var v = d[covVar];
                if (v == null || v === '') return;
                total++;
                if (typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(v)))) numericCount++;
                uniqueVals[String(v)] = true;
            });

            var nUnique = Object.keys(uniqueVals).length;
            var isCategorical = nUnique <= 10 || numericCount / Math.max(total, 1) < 0.5;

            if (isCategorical) {
                // Subgroup analysis
                var sgResult = subgroupAnalysis(data, outcomeVar, treatmentVar, studyVar, covVar, { binary: outcomeBinary });
                if (sgResult && !sgResult.error) {
                    results.push({
                        covariate: covVar,
                        type: 'categorical',
                        nLevels: nUnique,
                        interactionP: sgResult.interactionTest.pValue,
                        Q: sgResult.interactionTest.Q,
                        significant: sgResult.interactionTest.significant,
                        details: sgResult
                    });
                } else {
                    results.push({ covariate: covVar, type: 'categorical', error: sgResult ? sgResult.error : 'failed' });
                }
            } else {
                // Continuous interaction via GLMM or centered OLS
                if (outcomeBinary && typeof OneStageGLMM !== 'undefined') {
                    var glmmResult = centeredGLMMInteraction(data, outcomeVar, treatmentVar, studyVar, covVar, options);
                    if (glmmResult && !glmmResult.error) {
                        results.push({
                            covariate: covVar,
                            type: 'continuous',
                            interactionP: glmmResult.withinTrialInteraction.pValue,
                            interactionBeta: glmmResult.withinTrialInteraction.estimate,
                            interactionSE: glmmResult.withinTrialInteraction.se,
                            interactionOR: glmmResult.withinTrialInteraction.OR,
                            significant: glmmResult.withinTrialInteraction.pValue < 0.05,
                            ecologicalBias: glmmResult.ecologicalBias.estimate,
                            details: glmmResult
                        });
                    } else {
                        results.push({ covariate: covVar, type: 'continuous', error: glmmResult ? glmmResult.error : 'failed' });
                    }
                } else if (typeof BeyondR40 !== 'undefined' && BeyondR40.centeredOneStageInteractionIPD) {
                    var centResult = BeyondR40.centeredOneStageInteractionIPD(data, outcomeVar, treatmentVar, covVar, studyVar);
                    if (centResult && !centResult.error) {
                        var withinP = pFromZ(centResult.withinTrialInteraction.estimate / centResult.withinTrialInteraction.se);
                        results.push({
                            covariate: covVar,
                            type: 'continuous',
                            interactionP: withinP,
                            interactionBeta: centResult.withinTrialInteraction.estimate,
                            interactionSE: centResult.withinTrialInteraction.se,
                            significant: withinP < 0.05,
                            ecologicalBias: centResult.ecologicalBias.estimate,
                            details: centResult
                        });
                    } else {
                        results.push({ covariate: covVar, type: 'continuous', error: centResult ? centResult.error : 'failed' });
                    }
                } else {
                    results.push({ covariate: covVar, type: 'continuous', error: 'No interaction engine available' });
                }
            }
        });

        // Sort by p-value (most significant first)
        var validResults = results.filter(function(r) { return !r.error && typeof r.interactionP === 'number'; });
        validResults.sort(function(a, b) { return a.interactionP - b.interactionP; });

        // Bonferroni-corrected significance
        var nTests = validResults.length;
        validResults.forEach(function(r) {
            r.bonferroniP = Math.min(1, r.interactionP * nTests);
            r.bonferroniSignificant = r.bonferroniP < 0.05;
        });

        return {
            method: 'Multi-Covariate Interaction Screening',
            nCovariates: covariateVars.length,
            nTested: validResults.length,
            nSignificant: validResults.filter(function(r) { return r.significant; }).length,
            nBonferroniSignificant: validResults.filter(function(r) { return r.bonferroniSignificant; }).length,
            results: validResults,
            errors: results.filter(function(r) { return r.error; }),
            multipleTesting: {
                method: 'Bonferroni',
                nTests: nTests,
                threshold: nTests > 0 ? 0.05 / nTests : 0.05
            },
            reference: 'Fisher DJ et al. (2017) BMJ 357:j1610 — Treatment-covariate interactions in IPD meta-analysis'
        };
    }

    // ── 4. Predicted Treatment Effect at Covariate Values ───────
    // Given a fitted interaction model, predict treatment effect at specific covariate value

    function predictTreatmentEffect(interactionResult, covariateValue) {
        if (!interactionResult || interactionResult.error) return null;

        var mainEffect, interactionCoef, mainSE, interactionSE;

        if (interactionResult.treatmentEffect) {
            mainEffect = interactionResult.treatmentEffect.logOR || interactionResult.treatmentEffect.effect || 0;
        } else {
            mainEffect = interactionResult.pooled_effect || 0;
        }

        if (interactionResult.withinTrialInteraction) {
            interactionCoef = interactionResult.withinTrialInteraction.estimate || 0;
            interactionSE = interactionResult.withinTrialInteraction.se || 0;
        } else if (interactionResult.interactions && interactionResult.interactions[0]) {
            interactionCoef = interactionResult.interactions[0].beta || 0;
            interactionSE = interactionResult.interactions[0].se || 0;
        } else {
            return null;
        }

        // Treatment effect at covariate value X: β₁ + β₃ * X
        // (assuming X is centered at study mean, so X=0 is "average patient")
        var predicted = mainEffect + interactionCoef * covariateValue;
        // SE via delta method: sqrt(var(β₁) + X²*var(β₃) + 2*X*cov(β₁,β₃))
        // Simplified (ignore covariance): sqrt(mainSE² + X²*intSE²)
        mainSE = interactionResult.treatmentEffect ? (interactionResult.treatmentEffect.se || 0) : (interactionResult.SE || 0);
        var predSE = Math.sqrt(mainSE * mainSE + covariateValue * covariateValue * interactionSE * interactionSE);
        var zc = getZ();

        return {
            covariateValue: covariateValue,
            predictedEffect: predicted,
            se: predSE,
            ci_lower: predicted - zc * predSE,
            ci_upper: predicted + zc * predSE,
            pValue: pFromZ(predicted / predSE),
            OR: interactionResult.family === 'binomial' ? Math.exp(predicted) : undefined,
            OR_ci: interactionResult.family === 'binomial' ?
                [Math.exp(predicted - zc * predSE), Math.exp(predicted + zc * predSE)] : undefined
        };
    }

    // ── Public API ──────────────────────────────────────────────

    return {
        subgroupAnalysis: subgroupAnalysis,
        centeredGLMMInteraction: centeredGLMMInteraction,
        screenInteractions: screenInteractions,
        predictTreatmentEffect: predictTreatmentEffect,
        _poolRE: poolRE
    };
})();

if (typeof window !== 'undefined') {
    window.TreatmentInteraction = TreatmentInteraction;
}
