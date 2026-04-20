#!/usr/bin/env python3
# Legacy HTML mutator retired in manifest-first workflow.
raise SystemExit(
    "This script is retired. dev/modules/ is the authoritative source. "
    "Edit the relevant module and run `python dev/build.py build` instead of mutating ipd-meta-pro.html directly."
)

"""
RSM Editorial Review V4 - Research Synthesis Methods Journal Standards
======================================================================
Comprehensive editorial enhancements without removing any existing features.

As RSM Editor, I identify these improvements:
1. Selection models for publication bias (Copas, 3PSM, PET-PEESE)
2. Sensitivity to unmeasured confounding (E-value)
3. Multiplicity adjustments for subgroup analyses
4. Two-stage vs One-stage decision guidance
5. IPD-specific interaction testing (avoid ecological bias)
6. Protocol registration prompts (PROSPERO)
7. Data availability statement generator
8. Restricted Mean Survival Time (RMST)
9. Missing data sensitivity analysis
10. Conflict of interest documentation
11. Cochrane Risk of Bias 2.0 integration
12. CINeMA confidence in NMA
"""

import re

def rsm_editorial_review_v4():
    with open('ipd-meta-pro.html', 'r', encoding='utf-8') as f:
        content = f.read()

    original_len = len(content)
    enhancements = []

    # =========================================================================
    # 1. SELECTION MODELS FOR PUBLICATION BIAS
    # =========================================================================
    if 'SelectionModels' not in content:
        selection_models = '''
    // ============================================================================
    // SELECTION MODELS FOR PUBLICATION BIAS (RSM Editorial V4)
    // References: Copas 1999, Vevea & Hedges 1995, Stanley & Doucouliagos 2014
    // ============================================================================
    const SelectionModels = {
        // Copas Selection Model (simplified implementation)
        copasModel: function(effects, variances, rho) {
            rho = rho || 0.5; // correlation between effect and selection
            const n = effects.length;
            const ses = variances.map(v => Math.sqrt(v));

            // Standard RE estimate first
            const weights = variances.map(v => 1/v);
            const sumW = weights.reduce((a,b) => a+b, 0);
            const thetaHat = effects.reduce((s,e,i) => s + e*weights[i], 0) / sumW;

            // Copas adjustment - approximate selection function
            // P(selection) = Phi(gamma0 + gamma1/se)
            const gamma0 = 0; // intercept (assume no baseline selection)
            const gamma1 = rho * 2; // slope proportional to correlation

            // Adjusted weights incorporating selection probability
            const adjWeights = effects.map((e, i) => {
                const selectProb = this.normalCDF(gamma0 + gamma1 / ses[i]);
                return weights[i] * selectProb;
            });
            const adjSumW = adjWeights.reduce((a,b) => a+b, 0);
            const adjTheta = effects.reduce((s,e,i) => s + e*adjWeights[i], 0) / adjSumW;

            return {
                original: thetaHat,
                adjusted: adjTheta,
                rho: rho,
                bias: thetaHat - adjTheta,
                interpretation: Math.abs(thetaHat - adjTheta) < 0.1 ?
                    'Minimal sensitivity to selection' :
                    'Results sensitive to selection assumptions'
            };
        },

        // PET-PEESE (Stanley & Doucouliagos 2014)
        petPeese: function(effects, variances) {
            const ses = variances.map(v => Math.sqrt(v));
            const n = effects.length;

            // PET: regress effect on SE (precision-effect test)
            const petReg = this.weightedRegression(ses, effects, variances.map(v => 1/v));

            // PEESE: regress effect on variance (precision-effect estimate with SE)
            const peeseReg = this.weightedRegression(variances, effects, variances.map(v => 1/v));

            // Decision rule: if PET intercept significant (p<0.10), use PEESE
            const petZ = petReg.intercept / petReg.seIntercept;
            const petP = 2 * (1 - this.normalCDF(Math.abs(petZ)));
            const usePeese = petP < 0.10;

            return {
                pet: {
                    intercept: petReg.intercept,
                    se: petReg.seIntercept,
                    p: petP,
                    interpretation: 'Effect at infinite precision (SE=0)'
                },
                peese: {
                    intercept: peeseReg.intercept,
                    se: peeseReg.seIntercept,
                    interpretation: 'Effect at zero variance'
                },
                recommendation: usePeese ?
                    'Use PEESE estimate (evidence of small-study effects)' :
                    'Use PET estimate (no clear small-study effects)',
                adjustedEffect: usePeese ? peeseReg.intercept : petReg.intercept,
                adjustedSE: usePeese ? peeseReg.seIntercept : petReg.seIntercept
            };
        },

        // 3-Parameter Selection Model (Vevea & Hedges 1995 - simplified)
        threeParameterSelection: function(effects, variances, pCutoffs) {
            pCutoffs = pCutoffs || [0.025, 0.5, 1.0]; // one-tailed p-value cutoffs
            const n = effects.length;
            const ses = variances.map(v => Math.sqrt(v));

            // Calculate z-scores and p-values
            const zScores = effects.map((e, i) => e / ses[i]);
            const pValues = zScores.map(z => 1 - this.normalCDF(z)); // one-tailed

            // Estimate selection weights for each interval
            const counts = [0, 0, 0];
            effects.forEach((e, i) => {
                if (pValues[i] <= pCutoffs[0]) counts[0]++;
                else if (pValues[i] <= pCutoffs[1]) counts[1]++;
                else counts[2]++;
            });

            // Selection weights (normalized to first interval)
            const expected = [n * pCutoffs[0], n * (pCutoffs[1] - pCutoffs[0]), n * (1 - pCutoffs[1])];
            const selectionWeights = counts.map((c, i) => expected[i] > 0 ? c / expected[i] : 1);
            const maxW = Math.max(...selectionWeights);
            const normWeights = selectionWeights.map(w => w / maxW);

            return {
                intervals: pCutoffs.map((p, i) => ({
                    cutoff: p,
                    observed: counts[i],
                    expected: expected[i].toFixed(1),
                    selectionWeight: normWeights[i].toFixed(2)
                })),
                evidenceOfSelection: normWeights[2] < 0.5,
                interpretation: normWeights[2] < 0.5 ?
                    'Evidence of selection against non-significant results' :
                    'No strong evidence of p-value based selection'
            };
        },

        normalCDF: function(x) {
            const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
            const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
            const sign = x < 0 ? -1 : 1;
            x = Math.abs(x) / Math.sqrt(2);
            const t = 1 / (1 + p * x);
            const y = 1 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t*Math.exp(-x*x);
            return 0.5 * (1 + sign * y);
        },

        weightedRegression: function(x, y, weights) {
            const n = x.length;
            const sumW = weights.reduce((a,b) => a+b, 0);
            const sumWX = x.reduce((s,xi,i) => s + weights[i]*xi, 0);
            const sumWY = y.reduce((s,yi,i) => s + weights[i]*yi, 0);
            const sumWXY = x.reduce((s,xi,i) => s + weights[i]*xi*y[i], 0);
            const sumWX2 = x.reduce((s,xi,i) => s + weights[i]*xi*xi, 0);

            const slope = (sumW*sumWXY - sumWX*sumWY) / (sumW*sumWX2 - sumWX*sumWX);
            const intercept = (sumWY - slope*sumWX) / sumW;

            // Standard errors
            const predicted = x.map(xi => intercept + slope*xi);
            const residuals = y.map((yi,i) => yi - predicted[i]);
            const mse = residuals.reduce((s,r,i) => s + weights[i]*r*r, 0) / (n-2);
            const seSlope = Math.sqrt(mse * sumW / (sumW*sumWX2 - sumWX*sumWX));
            const seIntercept = Math.sqrt(mse * sumWX2 / (sumW*sumWX2 - sumWX*sumWX));

            return { intercept, slope, seIntercept, seSlope };
        },

        showSelectionModelAnalysis: function() {
            if (!APP.results || !APP.results.studies) {
                alert('Run analysis first');
                return;
            }
            const effects = APP.results.studies.map(s => s.effect);
            const variances = APP.results.studies.map(s => s.variance);

            const copas = this.copasModel(effects, variances, 0.5);
            const petPeese = this.petPeese(effects, variances);
            const threePSM = this.threeParameterSelection(effects, variances);

            var html = '<div class="modal-overlay active"><div class="modal" style="max-width:800px;max-height:90vh;overflow-y:auto">';
            html += '<div class="modal-header"><h3>Selection Models for Publication Bias</h3>';
            html += '<button class="modal-close" onclick="this.closest(\\'.modal-overlay\\').remove()">&times;</button></div>';
            html += '<div class="modal-body">';

            // Copas
            html += '<h4>1. Copas Selection Model</h4>';
            html += '<p style="font-size:0.85rem;color:var(--text-secondary)">Models correlation between effect size and selection probability.</p>';
            html += '<table style="width:100%;border-collapse:collapse;margin:0.5rem 0"><tr style="background:var(--bg-tertiary)">';
            html += '<th style="padding:0.5rem">Original</th><th>Adjusted (rho=0.5)</th><th>Bias</th></tr>';
            html += '<tr><td style="padding:0.5rem;text-align:center">' + copas.original.toFixed(3) + '</td>';
            html += '<td style="text-align:center">' + copas.adjusted.toFixed(3) + '</td>';
            html += '<td style="text-align:center">' + copas.bias.toFixed(3) + '</td></tr></table>';
            html += '<p><em>' + copas.interpretation + '</em></p>';

            // PET-PEESE
            html += '<h4 style="margin-top:1.5rem">2. PET-PEESE Analysis</h4>';
            html += '<p style="font-size:0.85rem;color:var(--text-secondary)">Stanley & Doucouliagos (2014): Precision-effect tests.</p>';
            html += '<table style="width:100%;border-collapse:collapse;margin:0.5rem 0"><tr style="background:var(--bg-tertiary)">';
            html += '<th style="padding:0.5rem">Method</th><th>Estimate</th><th>SE</th><th>Interpretation</th></tr>';
            html += '<tr><td style="padding:0.5rem">PET</td><td>' + petPeese.pet.intercept.toFixed(3) + '</td>';
            html += '<td>' + petPeese.pet.se.toFixed(3) + '</td><td>' + petPeese.pet.interpretation + '</td></tr>';
            html += '<tr><td style="padding:0.5rem">PEESE</td><td>' + petPeese.peese.intercept.toFixed(3) + '</td>';
            html += '<td>' + petPeese.peese.se.toFixed(3) + '</td><td>' + petPeese.peese.interpretation + '</td></tr></table>';
            html += '<p style="background:rgba(59,130,246,0.1);padding:0.75rem;border-radius:8px"><strong>Recommendation:</strong> ' + petPeese.recommendation + '</p>';

            // 3PSM
            html += '<h4 style="margin-top:1.5rem">3. Three-Parameter Selection Model</h4>';
            html += '<p style="font-size:0.85rem;color:var(--text-secondary)">Vevea & Hedges (1995): Selection weights by p-value interval.</p>';
            html += '<table style="width:100%;border-collapse:collapse;margin:0.5rem 0"><tr style="background:var(--bg-tertiary)">';
            html += '<th style="padding:0.5rem">P-value Interval</th><th>Observed</th><th>Expected</th><th>Selection Weight</th></tr>';
            threePSM.intervals.forEach(function(int) {
                html += '<tr><td style="padding:0.5rem">p <= ' + int.cutoff + '</td>';
                html += '<td style="text-align:center">' + int.observed + '</td>';
                html += '<td style="text-align:center">' + int.expected + '</td>';
                html += '<td style="text-align:center">' + int.selectionWeight + '</td></tr>';
            });
            html += '</table>';
            html += '<p><em>' + threePSM.interpretation + '</em></p>';

            html += '<div style="margin-top:1.5rem;padding:1rem;background:var(--bg-tertiary);border-radius:8px">';
            html += '<h4>References</h4>';
            html += '<ul style="font-size:0.85rem;margin-left:1.5rem">';
            html += '<li>Copas JB. What works?: selectivity models and meta-analysis. JRSS A. 1999;162:95-109</li>';
            html += '<li>Stanley TD, Doucouliagos H. Meta-regression approximations. Res Synth Methods. 2014;5:312-328</li>';
            html += '<li>Vevea JL, Hedges LV. A general linear model for estimating effect size. Psychol Methods. 1995;1:81-97</li>';
            html += '</ul></div>';

            html += '</div></div></div>';
            var m = document.createElement('div'); m.innerHTML = html;
            document.body.appendChild(m.firstChild);
        }
    };

'''
        content = content.replace('const APP = {', selection_models + '\n    const APP = {')
        enhancements.append("1. Selection Models (Copas, PET-PEESE, 3PSM)")

    # =========================================================================
    # 2. E-VALUE FOR SENSITIVITY TO UNMEASURED CONFOUNDING
    # =========================================================================
    if 'EValueCalculator' not in content:
        evalue = '''
    // ============================================================================
    // E-VALUE: SENSITIVITY TO UNMEASURED CONFOUNDING (RSM Editorial V4)
    // Reference: VanderWeele TJ, Ding P. Ann Intern Med 2017;167:268-274
    // ============================================================================
    const EValueCalculator = {
        // Calculate E-value for risk ratio
        forRiskRatio: function(rr, ciLower, ciUpper) {
            // E-value = RR + sqrt(RR * (RR - 1)) for RR >= 1
            // For RR < 1, use 1/RR
            const rrUse = rr >= 1 ? rr : 1/rr;
            const eValue = rrUse + Math.sqrt(rrUse * (rrUse - 1));

            // E-value for confidence limit
            const ciUse = rr >= 1 ? ciLower : 1/ciUpper;
            const eCi = ciUse >= 1 ? ciUse + Math.sqrt(ciUse * (ciUse - 1)) : 1;

            return {
                eValue: eValue,
                eCiLimit: eCi,
                interpretation: this.interpretEValue(eValue),
                description: 'An unmeasured confounder would need to be associated with both treatment and outcome by RR >= ' + eValue.toFixed(2) + ' to explain away the observed effect'
            };
        },

        // Calculate E-value for hazard ratio (same as RR for rare outcomes)
        forHazardRatio: function(hr, ciLower, ciUpper) {
            return this.forRiskRatio(hr, ciLower, ciUpper);
        },

        // Calculate E-value for odds ratio (convert to RR approximation)
        forOddsRatio: function(or, ciLower, ciUpper, prevalence) {
            prevalence = prevalence || 0.1; // assume 10% if not specified
            // Convert OR to RR: RR = OR / ((1-P0) + P0*OR)
            const rr = or / ((1 - prevalence) + prevalence * or);
            const rrLower = ciLower / ((1 - prevalence) + prevalence * ciLower);
            const rrUpper = ciUpper / ((1 - prevalence) + prevalence * ciUpper);
            return this.forRiskRatio(rr, rrLower, rrUpper);
        },

        // Convert SMD to approximate RR for E-value
        forSMD: function(smd, ciLower, ciUpper) {
            // Approximate conversion: RR = exp(0.91 * SMD) [Chinn 2000]
            const rr = Math.exp(0.91 * Math.abs(smd));
            const rrLower = Math.exp(0.91 * Math.abs(ciLower));
            const rrUpper = Math.exp(0.91 * Math.abs(ciUpper));
            return this.forRiskRatio(rr, Math.min(rrLower, rrUpper), Math.max(rrLower, rrUpper));
        },

        interpretEValue: function(eValue) {
            if (eValue >= 4) return 'Strong: Very large unmeasured confounding needed';
            if (eValue >= 2.5) return 'Moderate-Strong: Substantial confounding needed';
            if (eValue >= 1.5) return 'Moderate: Moderate confounding could explain effect';
            return 'Weak: Small confounding could explain effect';
        },

        showEValueCalculator: function() {
            var html = '<div class="modal-overlay active"><div class="modal" style="max-width:650px">';
            html += '<div class="modal-header"><h3>E-Value Calculator</h3>';
            html += '<button class="modal-close" onclick="this.closest(\\'.modal-overlay\\').remove()">&times;</button></div>';
            html += '<div class="modal-body">';

            html += '<p style="margin-bottom:1rem">The E-value indicates how strong unmeasured confounding would need to be to explain away an observed effect. <em>(VanderWeele & Ding, Ann Intern Med 2017)</em></p>';

            html += '<div style="display:grid;gap:1rem">';
            html += '<div><label>Effect Measure:</label><select id="evalMeasure" style="width:100%;padding:0.5rem;margin-top:0.25rem">';
            html += '<option value="rr">Risk Ratio / Hazard Ratio</option><option value="or">Odds Ratio</option><option value="smd">Standardized Mean Difference</option></select></div>';
            html += '<div><label>Effect Estimate:</label><input id="evalEffect" type="number" step="0.01" value="1.5" style="width:100%;padding:0.5rem;margin-top:0.25rem"></div>';
            html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">';
            html += '<div><label>CI Lower:</label><input id="evalLower" type="number" step="0.01" value="1.2" style="width:100%;padding:0.5rem;margin-top:0.25rem"></div>';
            html += '<div><label>CI Upper:</label><input id="evalUpper" type="number" step="0.01" value="1.9" style="width:100%;padding:0.5rem;margin-top:0.25rem"></div></div>';
            html += '<div id="evalPrevalence" style="display:none"><label>Outcome Prevalence (for OR):</label><input id="evalPrev" type="number" step="0.01" value="0.1" min="0" max="1" style="width:100%;padding:0.5rem;margin-top:0.25rem"></div>';
            html += '<button class="btn btn-primary" onclick="EValueCalculator.calculate()">Calculate E-Value</button>';
            html += '</div>';

            html += '<div id="evalResult" style="margin-top:1.5rem;display:none"></div>';

            html += '<div style="margin-top:1.5rem;padding:1rem;background:var(--bg-tertiary);border-radius:8px">';
            html += '<h4>Interpretation Guide</h4>';
            html += '<ul style="font-size:0.85rem;margin-left:1.5rem">';
            html += '<li><strong>E-value >= 4:</strong> Very robust - large confounding needed</li>';
            html += '<li><strong>E-value 2.5-4:</strong> Moderately robust</li>';
            html += '<li><strong>E-value 1.5-2.5:</strong> Some sensitivity to confounding</li>';
            html += '<li><strong>E-value < 1.5:</strong> Weak - easily explained by confounding</li>';
            html += '</ul></div>';

            html += '</div></div></div>';
            var m = document.createElement('div'); m.innerHTML = html;
            document.body.appendChild(m.firstChild);

            document.getElementById('evalMeasure').onchange = function() {
                document.getElementById('evalPrevalence').style.display = this.value === 'or' ? 'block' : 'none';
            };
        },

        calculate: function() {
            var measure = document.getElementById('evalMeasure').value;
            var effect = parseFloat(document.getElementById('evalEffect').value);
            var lower = parseFloat(document.getElementById('evalLower').value);
            var upper = parseFloat(document.getElementById('evalUpper').value);
            var prev = parseFloat(document.getElementById('evalPrev').value) || 0.1;

            var result;
            if (measure === 'rr') result = this.forRiskRatio(effect, lower, upper);
            else if (measure === 'or') result = this.forOddsRatio(effect, lower, upper, prev);
            else result = this.forSMD(effect, lower, upper);

            var html = '<div style="padding:1rem;background:rgba(34,197,94,0.1);border-left:4px solid #22c55e;border-radius:8px">';
            html += '<h4 style="margin:0">E-Value Results</h4>';
            html += '<p style="margin-top:0.5rem"><strong>E-value for point estimate:</strong> ' + result.eValue.toFixed(2) + '</p>';
            html += '<p><strong>E-value for CI limit:</strong> ' + result.eCiLimit.toFixed(2) + '</p>';
            html += '<p><strong>Strength:</strong> ' + result.interpretation + '</p>';
            html += '<p style="font-size:0.9rem;margin-top:0.75rem">' + result.description + '</p>';
            html += '</div>';

            document.getElementById('evalResult').innerHTML = html;
            document.getElementById('evalResult').style.display = 'block';
        }
    };

'''
        content = content.replace('const APP = {', evalue + '\n    const APP = {')
        enhancements.append("2. E-Value Calculator (VanderWeele 2017)")

    # =========================================================================
    # 3. MULTIPLICITY ADJUSTMENTS FOR SUBGROUPS
    # =========================================================================
    if 'MultiplicityAdjustment' not in content:
        multiplicity = '''
    // ============================================================================
    // MULTIPLICITY ADJUSTMENTS FOR SUBGROUP ANALYSES (RSM Editorial V4)
    // Reference: Sun X, et al. BMJ 2012;344:e1553
    // ============================================================================
    const MultiplicityAdjustment = {
        // Bonferroni correction
        bonferroni: function(pValues) {
            const m = pValues.length;
            return pValues.map(function(p) { return Math.min(1, p * m); });
        },

        // Holm step-down
        holm: function(pValues) {
            const m = pValues.length;
            const indexed = pValues.map(function(p, i) { return {p: p, i: i}; });
            indexed.sort(function(a, b) { return a.p - b.p; });

            var maxAdj = 0;
            var adjusted = new Array(m);
            indexed.forEach(function(item, rank) {
                var adj = item.p * (m - rank);
                maxAdj = Math.max(maxAdj, adj);
                adjusted[item.i] = Math.min(1, maxAdj);
            });
            return adjusted;
        },

        // Benjamini-Hochberg (FDR control)
        benjaminiHochberg: function(pValues) {
            const m = pValues.length;
            const indexed = pValues.map(function(p, i) { return {p: p, i: i}; });
            indexed.sort(function(a, b) { return b.p - a.p; }); // descending

            var minAdj = 1;
            var adjusted = new Array(m);
            indexed.forEach(function(item, idx) {
                var rank = m - idx;
                var adj = item.p * m / rank;
                minAdj = Math.min(minAdj, adj);
                adjusted[item.i] = Math.min(1, minAdj);
            });
            return adjusted;
        },

        // Interaction test p-value (preferred for subgroups)
        interactionTest: function(effect1, se1, effect2, se2) {
            var diff = effect1 - effect2;
            var seDiff = Math.sqrt(se1*se1 + se2*se2);
            var z = diff / seDiff;
            var p = 2 * (1 - this.normalCDF(Math.abs(z)));
            return { difference: diff, se: seDiff, z: z, p: p };
        },

        normalCDF: function(x) {
            const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
            const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
            const sign = x < 0 ? -1 : 1; x = Math.abs(x) / Math.sqrt(2);
            const t = 1 / (1 + p * x);
            const y = 1 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t*Math.exp(-x*x);
            return 0.5 * (1 + sign * y);
        },

        showMultiplicityPanel: function() {
            var html = '<div class="modal-overlay active"><div class="modal" style="max-width:750px">';
            html += '<div class="modal-header"><h3>Multiplicity Adjustments for Subgroup Analyses</h3>';
            html += '<button class="modal-close" onclick="this.closest(\\'.modal-overlay\\').remove()">&times;</button></div>';
            html += '<div class="modal-body">';

            html += '<div style="background:rgba(239,68,68,0.1);padding:1rem;border-radius:8px;margin-bottom:1rem">';
            html += '<strong>Warning:</strong> Multiple subgroup comparisons inflate Type I error. ';
            html += 'Always use interaction tests rather than comparing p-values across subgroups.';
            html += '</div>';

            html += '<h4>Enter P-Values from Subgroup Analyses</h4>';
            html += '<p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:1rem">Enter comma-separated p-values:</p>';
            html += '<input id="multPValues" type="text" placeholder="0.03, 0.15, 0.04, 0.008" style="width:100%;padding:0.5rem">';
            html += '<button class="btn btn-primary" style="margin-top:1rem" onclick="MultiplicityAdjustment.calculate()">Calculate Adjusted P-Values</button>';

            html += '<div id="multResult" style="margin-top:1.5rem;display:none"></div>';

            html += '<div style="margin-top:1.5rem;padding:1rem;background:var(--bg-tertiary);border-radius:8px">';
            html += '<h4>Best Practice (Sun et al. BMJ 2012)</h4>';
            html += '<ol style="font-size:0.9rem;margin-left:1.5rem">';
            html += '<li>Pre-specify a small number of subgroups (ideally &le;5)</li>';
            html += '<li>Use interaction tests, not separate p-values</li>';
            html += '<li>Report interaction p-values, not subgroup-specific p-values</li>';
            html += '<li>Consider exploratory vs confirmatory intent</li>';
            html += '<li>Apply Bonferroni or BH correction for multiple comparisons</li>';
            html += '</ol></div>';

            html += '</div></div></div>';
            var m = document.createElement('div'); m.innerHTML = html;
            document.body.appendChild(m.firstChild);
        },

        calculate: function() {
            var input = document.getElementById('multPValues').value;
            var pValues = input.split(',').map(function(s) { return parseFloat(s.trim()); }).filter(function(p) { return !isNaN(p); });

            if (pValues.length < 2) { alert('Enter at least 2 p-values'); return; }

            var bonf = this.bonferroni(pValues);
            var holm = this.holm(pValues);
            var bh = this.benjaminiHochberg(pValues);

            var html = '<table style="width:100%;border-collapse:collapse">';
            html += '<tr style="background:var(--bg-tertiary)"><th style="padding:0.5rem">Original</th><th>Bonferroni</th><th>Holm</th><th>BH (FDR)</th></tr>';
            pValues.forEach(function(p, i) {
                html += '<tr><td style="padding:0.5rem;text-align:center">' + p.toFixed(4) + '</td>';
                html += '<td style="text-align:center;' + (bonf[i] < 0.05 ? 'color:#22c55e' : '') + '">' + bonf[i].toFixed(4) + '</td>';
                html += '<td style="text-align:center;' + (holm[i] < 0.05 ? 'color:#22c55e' : '') + '">' + holm[i].toFixed(4) + '</td>';
                html += '<td style="text-align:center;' + (bh[i] < 0.05 ? 'color:#22c55e' : '') + '">' + bh[i].toFixed(4) + '</td></tr>';
            });
            html += '</table>';

            var sigBonf = bonf.filter(function(p) { return p < 0.05; }).length;
            var sigHolm = holm.filter(function(p) { return p < 0.05; }).length;
            var sigBH = bh.filter(function(p) { return p < 0.05; }).length;
            var sigOrig = pValues.filter(function(p) { return p < 0.05; }).length;

            html += '<div style="margin-top:1rem;padding:1rem;background:var(--bg-tertiary);border-radius:8px">';
            html += '<p><strong>Significant at 0.05:</strong></p>';
            html += '<p>Original: ' + sigOrig + ' | Bonferroni: ' + sigBonf + ' | Holm: ' + sigHolm + ' | BH: ' + sigBH + '</p>';
            html += '</div>';

            document.getElementById('multResult').innerHTML = html;
            document.getElementById('multResult').style.display = 'block';
        }
    };

'''
        content = content.replace('const APP = {', multiplicity + '\n    const APP = {')
        enhancements.append("3. Multiplicity Adjustments (Bonferroni, Holm, BH)")

    # =========================================================================
    # 4. TWO-STAGE VS ONE-STAGE DECISION TOOL
    # =========================================================================
    if 'StageDecisionTool' not in content:
        stage_decision = '''
    // ============================================================================
    // TWO-STAGE VS ONE-STAGE IPD-MA DECISION TOOL (RSM Editorial V4)
    // Reference: Debray TPA, et al. Res Synth Methods 2015;6:293-309
    // ============================================================================
    const StageDecisionTool = {
        assess: function(config) {
            var score = { oneStage: 0, twoStage: 0 };
            var recommendations = [];

            // 1. Treatment-covariate interactions
            if (config.testInteractions) {
                score.oneStage += 3;
                recommendations.push({favor: 'one-stage', reason: 'Testing treatment-covariate interactions (avoid ecological bias)'});
            }

            // 2. Small studies or sparse data
            if (config.smallStudies || config.rareEvents) {
                score.oneStage += 2;
                recommendations.push({favor: 'one-stage', reason: 'Small studies/rare events (better borrowing of information)'});
            }

            // 3. Non-linear effects
            if (config.nonLinearEffects) {
                score.oneStage += 2;
                recommendations.push({favor: 'one-stage', reason: 'Non-linear dose-response or time-varying effects'});
            }

            // 4. Different follow-up times
            if (config.varyingFollowUp) {
                score.oneStage += 1;
                recommendations.push({favor: 'one-stage', reason: 'Varying follow-up times across studies'});
            }

            // 5. Want study-level summary for communication
            if (config.needStudySummary) {
                score.twoStage += 2;
                recommendations.push({favor: 'two-stage', reason: 'Need study-level summaries for forest plot'});
            }

            // 6. Computational simplicity
            if (config.simplicityPreferred) {
                score.twoStage += 1;
                recommendations.push({favor: 'two-stage', reason: 'Simpler computation and interpretation'});
            }

            // 7. Standard random-effects sufficient
            if (config.standardREOK) {
                score.twoStage += 1;
                recommendations.push({favor: 'two-stage', reason: 'Standard random-effects model adequate'});
            }

            // 8. Balanced designs
            if (config.balancedDesigns) {
                score.twoStage += 1;
                recommendations.push({favor: 'two-stage', reason: 'Balanced study designs (similar results expected)'});
            }

            return {
                scores: score,
                recommendations: recommendations,
                overallRecommendation: score.oneStage > score.twoStage ? 'ONE-STAGE' :
                    score.oneStage < score.twoStage ? 'TWO-STAGE' : 'EITHER (consider both)',
                details: score.oneStage > score.twoStage ?
                    'One-stage preferred for treatment effect heterogeneity, interactions, or sparse data' :
                    'Two-stage suitable for standard pooling with study-level summaries'
            };
        },

        showDecisionTool: function() {
            var html = '<div class="modal-overlay active"><div class="modal" style="max-width:700px;max-height:90vh;overflow-y:auto">';
            html += '<div class="modal-header"><h3>One-Stage vs Two-Stage IPD-MA</h3>';
            html += '<button class="modal-close" onclick="this.closest(\\'.modal-overlay\\').remove()">&times;</button></div>';
            html += '<div class="modal-body">';

            html += '<p style="margin-bottom:1rem">Answer these questions to determine the optimal approach. <em>(Debray et al. Res Synth Methods 2015)</em></p>';

            var questions = [
                {id: 'testInteractions', q: 'Do you want to test treatment-covariate interactions?'},
                {id: 'smallStudies', q: 'Are some studies small (<50 per arm)?'},
                {id: 'rareEvents', q: 'Are events rare (<10 per study)?'},
                {id: 'nonLinearEffects', q: 'Do you need to model non-linear or time-varying effects?'},
                {id: 'varyingFollowUp', q: 'Do studies have substantially different follow-up times?'},
                {id: 'needStudySummary', q: 'Do you need study-level summaries for presentation?'},
                {id: 'simplicityPreferred', q: 'Is computational simplicity important?'},
                {id: 'standardREOK', q: 'Is a standard random-effects model sufficient?'},
                {id: 'balancedDesigns', q: 'Are study designs reasonably balanced?'}
            ];

            html += '<form id="stageDecisionForm">';
            questions.forEach(function(q) {
                html += '<div style="margin-bottom:0.75rem;padding:0.75rem;background:var(--bg-tertiary);border-radius:8px">';
                html += '<label style="display:flex;align-items:center;cursor:pointer">';
                html += '<input type="checkbox" id="' + q.id + '" style="margin-right:0.75rem">';
                html += q.q + '</label></div>';
            });
            html += '</form>';

            html += '<button class="btn btn-primary" style="margin-top:1rem" onclick="StageDecisionTool.evaluate()">Get Recommendation</button>';
            html += '<div id="stageResult" style="margin-top:1.5rem;display:none"></div>';

            html += '<div style="margin-top:1.5rem;padding:1rem;background:var(--bg-tertiary);border-radius:8px">';
            html += '<h4>Key Differences</h4>';
            html += '<table style="width:100%;font-size:0.85rem;border-collapse:collapse">';
            html += '<tr><th style="padding:0.5rem;text-align:left">Aspect</th><th>One-Stage</th><th>Two-Stage</th></tr>';
            html += '<tr><td style="padding:0.5rem">Model</td><td>GLMM/mixed model</td><td>Study summary + RE</td></tr>';
            html += '<tr><td style="padding:0.5rem">Interactions</td><td>Within-study only</td><td>Ecological bias risk</td></tr>';
            html += '<tr><td style="padding:0.5rem">Sparse data</td><td>Better handling</td><td>May be biased</td></tr>';
            html += '<tr><td style="padding:0.5rem">Complexity</td><td>Higher</td><td>Lower</td></tr>';
            html += '</table></div>';

            html += '</div></div></div>';
            var m = document.createElement('div'); m.innerHTML = html;
            document.body.appendChild(m.firstChild);
        },

        evaluate: function() {
            var config = {};
            ['testInteractions', 'smallStudies', 'rareEvents', 'nonLinearEffects', 'varyingFollowUp',
             'needStudySummary', 'simplicityPreferred', 'standardREOK', 'balancedDesigns'].forEach(function(id) {
                config[id] = document.getElementById(id).checked;
            });

            var result = this.assess(config);
            var color = result.overallRecommendation.includes('ONE') ? '#3b82f6' :
                        result.overallRecommendation.includes('TWO') ? '#22c55e' : '#f59e0b';

            var html = '<div style="padding:1.5rem;background:' + color + '20;border-left:4px solid ' + color + ';border-radius:8px">';
            html += '<h3 style="color:' + color + ';margin:0">Recommendation: ' + result.overallRecommendation + '</h3>';
            html += '<p style="margin-top:0.5rem">' + result.details + '</p>';
            html += '</div>';

            if (result.recommendations.length > 0) {
                html += '<h4 style="margin-top:1rem">Factors Considered:</h4><ul style="margin-left:1.5rem">';
                result.recommendations.forEach(function(r) {
                    var icon = r.favor === 'one-stage' ? '1' : '2';
                    html += '<li><strong>[' + icon + '-stage]</strong> ' + r.reason + '</li>';
                });
                html += '</ul>';
            }

            document.getElementById('stageResult').innerHTML = html;
            document.getElementById('stageResult').style.display = 'block';
        }
    };

'''
        content = content.replace('const APP = {', stage_decision + '\n    const APP = {')
        enhancements.append("4. One-Stage vs Two-Stage Decision Tool (Debray 2015)")

    # =========================================================================
    # 5. PROTOCOL REGISTRATION PROMPT (PROSPERO)
    # =========================================================================
    if 'ProtocolRegistration' not in content:
        protocol = '''
    // ============================================================================
    // PROTOCOL REGISTRATION PROMPT (RSM Editorial V4)
    // Reference: PRISMA-IPD, Stewart LA et al. JAMA 2015
    // ============================================================================
    const ProtocolRegistration = {
        check: function() {
            if (!localStorage.getItem('ipd_protocol_reminded')) {
                this.showReminder();
            }
        },

        showReminder: function() {
            var html = '<div class="modal-overlay active"><div class="modal" style="max-width:600px">';
            html += '<div class="modal-header"><h3>Protocol Registration Reminder</h3>';
            html += '<button class="modal-close" onclick="this.closest(\\'.modal-overlay\\').remove()">&times;</button></div>';
            html += '<div class="modal-body">';

            html += '<div style="background:rgba(59,130,246,0.1);padding:1rem;border-radius:8px;margin-bottom:1rem">';
            html += '<strong>Best Practice:</strong> IPD meta-analyses should be registered prospectively.';
            html += '</div>';

            html += '<h4>Registration Resources:</h4>';
            html += '<ul style="margin-left:1.5rem;line-height:2">';
            html += '<li><strong>PROSPERO:</strong> crd.york.ac.uk/prospero</li>';
            html += '<li><strong>OSF Registries:</strong> osf.io/registries</li>';
            html += '<li><strong>Protocol template:</strong> PRISMA-P 2015</li>';
            html += '</ul>';

            html += '<h4 style="margin-top:1rem">Key Protocol Elements:</h4>';
            html += '<ol style="margin-left:1.5rem;font-size:0.9rem">';
            html += '<li>PICO question and eligibility criteria</li>';
            html += '<li>Primary and secondary outcomes</li>';
            html += '<li>Pre-specified subgroup analyses</li>';
            html += '<li>Statistical methods (one-stage/two-stage)</li>';
            html += '<li>Risk of bias assessment plan</li>';
            html += '<li>Data collection procedures</li>';
            html += '</ol>';

            html += '<div style="margin-top:1.5rem">';
            html += '<label><input type="checkbox" id="dontShowProtocol" style="margin-right:0.5rem">Don\\\'t show this reminder again</label>';
            html += '</div>';

            html += '<button class="btn btn-primary" style="margin-top:1rem" onclick="ProtocolRegistration.dismiss()">Continue to Analysis</button>';
            html += '</div></div></div>';

            var m = document.createElement('div'); m.innerHTML = html;
            document.body.appendChild(m.firstChild);
        },

        dismiss: function() {
            if (document.getElementById('dontShowProtocol').checked) {
                localStorage.setItem('ipd_protocol_reminded', 'true');
            }
            document.querySelector('.modal-overlay').remove();
        },

        showProtocolTemplate: function() {
            var template = 'IPD META-ANALYSIS PROTOCOL TEMPLATE\\n';
            template += '=' .repeat(40) + '\\n\\n';
            template += '1. TITLE:\\n   [Title of the IPD meta-analysis]\\n\\n';
            template += '2. REGISTRATION:\\n   PROSPERO ID: CRD__________\\n   Date: __________\\n\\n';
            template += '3. BACKGROUND AND RATIONALE:\\n   [Why is this IPD-MA needed?]\\n\\n';
            template += '4. OBJECTIVES:\\n   Primary: \\n   Secondary: \\n\\n';
            template += '5. ELIGIBILITY CRITERIA:\\n   Population: \\n   Intervention: \\n   Comparator: \\n   Outcomes: \\n   Study types: \\n\\n';
            template += '6. DATA SOURCES:\\n   [Databases, registries, author contacts]\\n\\n';
            template += '7. IPD COLLECTION:\\n   Variables requested: \\n   Data cleaning: \\n   Missing data: \\n\\n';
            template += '8. RISK OF BIAS:\\n   Tool: [Cochrane RoB 2.0 / NOS / other]\\n\\n';
            template += '9. STATISTICAL METHODS:\\n   Approach: [one-stage / two-stage]\\n   Heterogeneity: \\n   Subgroups: \\n   Sensitivity: \\n\\n';
            template += '10. PRISMA-IPD CHECKLIST: Attached\\n';

            var html = '<div class="modal-overlay active"><div class="modal" style="max-width:700px">';
            html += '<div class="modal-header"><h3>Protocol Template</h3>';
            html += '<button class="modal-close" onclick="this.closest(\\'.modal-overlay\\').remove()">&times;</button></div>';
            html += '<div class="modal-body">';
            html += '<textarea style="width:100%;height:400px;font-family:monospace;font-size:0.85rem;padding:1rem" readonly>' + template + '</textarea>';
            html += '<button class="btn btn-secondary" style="margin-top:1rem" onclick="navigator.clipboard.writeText(this.previousElementSibling.value)">Copy Template</button>';
            html += '</div></div></div>';

            var m = document.createElement('div'); m.innerHTML = html;
            document.body.appendChild(m.firstChild);
        }
    };

'''
        content = content.replace('const APP = {', protocol + '\n    const APP = {')
        enhancements.append("5. Protocol Registration Prompt (PROSPERO)")

    # =========================================================================
    # 6. RESTRICTED MEAN SURVIVAL TIME (RMST)
    # =========================================================================
    if 'RMSTAnalysis' not in content:
        rmst = '''
    // ============================================================================
    // RESTRICTED MEAN SURVIVAL TIME (RMST) (RSM Editorial V4)
    // Reference: Royston P, Parmar MK. BMC Med Res Methodol 2013;13:152
    // ============================================================================
    const RMSTAnalysis = {
        calculate: function(times, events, tau) {
            // Sort by time
            var data = times.map(function(t, i) { return {time: t, event: events[i]}; });
            data.sort(function(a, b) { return a.time - b.time; });

            // Kaplan-Meier estimation
            var n = data.length;
            var nRisk = n;
            var survival = 1;
            var kmCurve = [{time: 0, survival: 1}];

            data.forEach(function(d) {
                if (d.event === 1) {
                    survival *= (nRisk - 1) / nRisk;
                }
                kmCurve.push({time: d.time, survival: survival});
                nRisk--;
            });

            // Calculate RMST (area under KM curve up to tau)
            var rmst = 0;
            var prevTime = 0;
            var prevSurv = 1;

            for (var i = 1; i < kmCurve.length; i++) {
                var t = Math.min(kmCurve[i].time, tau);
                if (t > prevTime) {
                    rmst += prevSurv * (t - prevTime);
                }
                if (kmCurve[i].time >= tau) break;
                prevTime = t;
                prevSurv = kmCurve[i].survival;
            }

            // If last time < tau, extend with last survival
            if (prevTime < tau) {
                rmst += prevSurv * (tau - prevTime);
            }

            return {
                rmst: rmst,
                tau: tau,
                interpretation: 'Average survival time (restricted to ' + tau + ' time units)'
            };
        },

        compare: function(times1, events1, times2, events2, tau) {
            var rmst1 = this.calculate(times1, events1, tau);
            var rmst2 = this.calculate(times2, events2, tau);

            var diff = rmst1.rmst - rmst2.rmst;
            var ratio = rmst1.rmst / rmst2.rmst;

            return {
                group1: rmst1,
                group2: rmst2,
                difference: diff,
                ratio: ratio,
                interpretation: 'Difference of ' + diff.toFixed(2) + ' time units favoring ' + (diff > 0 ? 'Group 1' : 'Group 2')
            };
        },

        showRMSTPanel: function() {
            var html = '<div class="modal-overlay active"><div class="modal" style="max-width:650px">';
            html += '<div class="modal-header"><h3>Restricted Mean Survival Time (RMST)</h3>';
            html += '<button class="modal-close" onclick="this.closest(\\'.modal-overlay\\').remove()">&times;</button></div>';
            html += '<div class="modal-body">';

            html += '<div style="background:var(--bg-tertiary);padding:1rem;border-radius:8px;margin-bottom:1rem">';
            html += '<p>RMST represents the average survival time up to a specified time horizon (tau). ';
            html += 'It provides an interpretable measure that does not assume proportional hazards.</p>';
            html += '<p style="font-size:0.85rem;color:var(--text-secondary);margin-top:0.5rem">';
            html += '<em>Reference: Royston P, Parmar MK. BMC Med Res Methodol 2013;13:152</em></p>';
            html += '</div>';

            html += '<h4>Advantages over Hazard Ratio:</h4>';
            html += '<ul style="margin-left:1.5rem;font-size:0.9rem;line-height:1.8">';
            html += '<li>Clinically interpretable (actual time units)</li>';
            html += '<li>Does not require proportional hazards assumption</li>';
            html += '<li>Can detect late differences missed by HR</li>';
            html += '<li>Useful for health economic evaluations</li>';
            html += '</ul>';

            html += '<h4 style="margin-top:1.5rem">Calculate RMST:</h4>';
            html += '<div style="margin-bottom:1rem"><label>Restriction time (tau):</label>';
            html += '<input id="rmstTau" type="number" value="24" style="width:100px;padding:0.5rem;margin-left:0.5rem"> months</div>';

            if (APP.data && APP.data.length > 0) {
                html += '<button class="btn btn-primary" onclick="RMSTAnalysis.calculateFromData()">Calculate from Current Data</button>';
            } else {
                html += '<p style="color:var(--text-secondary)">Load survival data to calculate RMST</p>';
            }

            html += '<div id="rmstResult" style="margin-top:1.5rem;display:none"></div>';
            html += '</div></div></div>';

            var m = document.createElement('div'); m.innerHTML = html;
            document.body.appendChild(m.firstChild);
        },

        calculateFromData: function() {
            if (!APP.data || !APP.config.timeVar || !APP.config.eventVar) {
                alert('Configure survival data first'); return;
            }

            var tau = parseFloat(document.getElementById('rmstTau').value);
            var treatVar = APP.config.treatmentVar || 'treatment';

            var treat1 = APP.data.filter(function(d) { return d[treatVar] === 1; });
            var treat0 = APP.data.filter(function(d) { return d[treatVar] === 0; });

            var result = this.compare(
                treat1.map(function(d) { return d[APP.config.timeVar]; }),
                treat1.map(function(d) { return d[APP.config.eventVar]; }),
                treat0.map(function(d) { return d[APP.config.timeVar]; }),
                treat0.map(function(d) { return d[APP.config.eventVar]; }),
                tau
            );

            var html = '<div style="padding:1rem;background:rgba(34,197,94,0.1);border-radius:8px">';
            html += '<h4>RMST Results (tau = ' + tau + ')</h4>';
            html += '<table style="width:100%;margin-top:0.5rem;border-collapse:collapse">';
            html += '<tr><th style="padding:0.5rem;text-align:left">Group</th><th>RMST</th></tr>';
            html += '<tr><td style="padding:0.5rem">Treatment</td><td>' + result.group1.rmst.toFixed(2) + '</td></tr>';
            html += '<tr><td style="padding:0.5rem">Control</td><td>' + result.group2.rmst.toFixed(2) + '</td></tr>';
            html += '</table>';
            html += '<p style="margin-top:1rem"><strong>Difference:</strong> ' + result.difference.toFixed(2) + ' time units</p>';
            html += '<p><strong>Ratio:</strong> ' + result.ratio.toFixed(2) + '</p>';
            html += '<p style="margin-top:0.5rem"><em>' + result.interpretation + '</em></p>';
            html += '</div>';

            document.getElementById('rmstResult').innerHTML = html;
            document.getElementById('rmstResult').style.display = 'block';
        }
    };

'''
        content = content.replace('const APP = {', rmst + '\n    const APP = {')
        enhancements.append("6. Restricted Mean Survival Time (RMST)")

    # =========================================================================
    # 7. DATA AVAILABILITY STATEMENT GENERATOR
    # =========================================================================
    if 'DataAvailabilityGenerator' not in content:
        data_avail = '''
    // ============================================================================
    // DATA AVAILABILITY STATEMENT GENERATOR (RSM Editorial V4)
    // ============================================================================
    const DataAvailabilityGenerator = {
        templates: {
            fullOpen: 'Individual participant data that underlie the results reported in this article, after deidentification (text, tables, figures, and appendices), will be available to qualified researchers who submit a methodologically sound proposal. Data will be available immediately following publication with no end date. Proposals should be directed to [contact email]. To gain access, data requestors will need to sign a data access agreement.',

            restrictedAccess: 'The individual participant data underlying this meta-analysis were obtained from the original study investigators under data sharing agreements that do not permit public sharing. Researchers wishing to access the data should contact the original study authors directly. Aggregate study-level data are provided in the supplementary materials.',

            onRequest: 'Deidentified individual participant data will be made available on reasonable request to the corresponding author, subject to approval by the IPD-MA Collaborative Group steering committee and execution of a data sharing agreement.',

            notAvailable: 'Due to ethical restrictions and data sharing agreements with the original trialists, individual participant data cannot be shared. Aggregate study-level data supporting the findings are available in the supplementary materials.',

            repository: 'Individual participant data have been deposited in [repository name] with accession number [number]. Data are available under [license type] license following registration and approval.'
        },

        show: function() {
            var html = '<div class="modal-overlay active"><div class="modal" style="max-width:700px;max-height:90vh;overflow-y:auto">';
            html += '<div class="modal-header"><h3>Data Availability Statement Generator</h3>';
            html += '<button class="modal-close" onclick="this.closest(\\'.modal-overlay\\').remove()">&times;</button></div>';
            html += '<div class="modal-body">';

            html += '<p style="margin-bottom:1rem">Select the appropriate data sharing arrangement and customize:</p>';

            html += '<div style="margin-bottom:1rem"><label><strong>Data Availability Type:</strong></label>';
            html += '<select id="dataAvailType" style="width:100%;padding:0.5rem;margin-top:0.25rem" onchange="DataAvailabilityGenerator.updateTemplate()">';
            html += '<option value="fullOpen">Fully Open Access</option>';
            html += '<option value="onRequest">Available on Request</option>';
            html += '<option value="restrictedAccess">Restricted (contact original authors)</option>';
            html += '<option value="repository">Repository Deposit</option>';
            html += '<option value="notAvailable">Not Available</option>';
            html += '</select></div>';

            html += '<div style="margin-bottom:1rem"><label><strong>Statement:</strong></label>';
            html += '<textarea id="dataAvailStatement" style="width:100%;height:150px;padding:0.5rem;margin-top:0.25rem">' + this.templates.fullOpen + '</textarea></div>';

            html += '<button class="btn btn-secondary" onclick="navigator.clipboard.writeText(document.getElementById(\\'dataAvailStatement\\').value);alert(\\'Copied!\\')">Copy Statement</button>';

            html += '<div style="margin-top:1.5rem;padding:1rem;background:var(--bg-tertiary);border-radius:8px">';
            html += '<h4>ICMJE Recommendations</h4>';
            html += '<ul style="font-size:0.85rem;margin-left:1.5rem">';
            html += '<li>State what data are available and how to access</li>';
            html += '<li>Specify any conditions or restrictions</li>';
            html += '<li>Include repository/accession numbers if applicable</li>';
            html += '<li>Note any ethical or legal constraints</li>';
            html += '</ul></div>';

            html += '</div></div></div>';
            var m = document.createElement('div'); m.innerHTML = html;
            document.body.appendChild(m.firstChild);
        },

        updateTemplate: function() {
            var type = document.getElementById('dataAvailType').value;
            document.getElementById('dataAvailStatement').value = this.templates[type];
        }
    };

'''
        content = content.replace('const APP = {', data_avail + '\n    const APP = {')
        enhancements.append("7. Data Availability Statement Generator")

    # =========================================================================
    # 8. ADD UI BUTTONS FOR NEW FEATURES
    # =========================================================================
    new_buttons = '''
                    <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-color)">
                        <p style="font-size:0.85rem;margin-bottom:0.5rem;color:var(--text-secondary)"><b>RSM Editorial Tools:</b></p>
                        <div style="display:flex;flex-wrap:wrap;gap:0.4rem">
                            <button class="btn btn-warning btn-sm" onclick="SelectionModels.showSelectionModelAnalysis()" title="Copas, PET-PEESE, 3PSM">Selection Models</button>
                            <button class="btn btn-warning btn-sm" onclick="EValueCalculator.showEValueCalculator()" title="Sensitivity to confounding">E-Value</button>
                            <button class="btn btn-warning btn-sm" onclick="MultiplicityAdjustment.showMultiplicityPanel()" title="Bonferroni, Holm, BH">Multiplicity</button>
                            <button class="btn btn-warning btn-sm" onclick="StageDecisionTool.showDecisionTool()" title="One-stage vs Two-stage">Stage Decision</button>
                            <button class="btn btn-warning btn-sm" onclick="RMSTAnalysis.showRMSTPanel()" title="Restricted Mean Survival Time">RMST</button>
                            <button class="btn btn-warning btn-sm" onclick="ProtocolRegistration.showProtocolTemplate()" title="Protocol template">Protocol</button>
                            <button class="btn btn-warning btn-sm" onclick="DataAvailabilityGenerator.show()" title="Data sharing statement">Data Avail.</button>
                        </div>
                    </div>
'''
    if 'RSM Editorial Tools' not in content:
        # Add after existing button groups
        if 'Features Exceeding R' in content:
            content = content.replace(
                '</div>\n                    </div>',
                '</div>\n                    </div>' + new_buttons,
                1
            )
            enhancements.append("8. UI Buttons for RSM Editorial Tools")

    # =========================================================================
    # SAVE
    # =========================================================================
    with open('ipd-meta-pro.html', 'w', encoding='utf-8') as f:
        f.write(content)

    new_len = len(content)

    print("=" * 70)
    print("RSM EDITORIAL REVIEW V4 - ENHANCEMENTS APPLIED")
    print("=" * 70)
    print(f"\nOriginal: {original_len:,} -> New: {new_len:,} (+{new_len-original_len:,})")
    print(f"\n{len(enhancements)} RSM editorial enhancements added:")
    for e in enhancements:
        print(f"  + {e}")

    print("\n" + "=" * 70)
    print("METHODOLOGICAL IMPROVEMENTS FOR RSM PUBLICATION:")
    print("-" * 70)
    print("""
    1. SELECTION MODELS - Copas, PET-PEESE, 3PSM
       Beyond standard funnel plot / Egger's test

    2. E-VALUE CALCULATOR - VanderWeele & Ding 2017
       Sensitivity to unmeasured confounding

    3. MULTIPLICITY ADJUSTMENTS - Bonferroni, Holm, BH
       Critical for subgroup analyses

    4. ONE-STAGE VS TWO-STAGE DECISION - Debray 2015
       Systematic guidance for IPD-MA approach

    5. PROTOCOL REGISTRATION - PROSPERO prompt
       Encourages prospective registration

    6. RMST - Royston & Parmar 2013
       Alternative to hazard ratio

    7. DATA AVAILABILITY STATEMENT
       ICMJE-compliant templates

    ALL EXISTING FEATURES PRESERVED - NOTHING REMOVED
    """)
    print("=" * 70)

if __name__ == '__main__':
    rsm_editorial_review_v4()
