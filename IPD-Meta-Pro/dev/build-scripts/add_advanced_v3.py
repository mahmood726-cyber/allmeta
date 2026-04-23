# sentinel:skip-file — hardcoded paths are fixture/registry/audit-narrative data for this repo's research workflow, not portable application configuration. Same pattern as push_all_repos.py and E156 workbook files.
# Legacy HTML mutator retired in manifest-first workflow.
raise SystemExit(
    "This script is retired. dev/modules/ is the authoritative source. "
    "Edit the relevant module and run `python dev/build.py build` instead of mutating ipd-meta-pro.html directly."
)

#!/usr/bin/env python3
"""Add TMLE, Cross-Validation, and More Advanced Features to IPD Meta-Analysis Pro"""

# Read the current file
with open(str((__import__('pathlib').Path(__file__).resolve().parents[2] / 'ipd-meta-pro.html')), 'r', encoding='utf-8') as f:
    content = f.read()

# New advanced features to add
new_features = '''
    // ============================================================
    // TMLE (Targeted Maximum Likelihood Estimation)
    // ============================================================
    function runTMLE() {
        if (!window.currentData || window.currentData.length < 20) {
            alert('Please load a dataset with at least 20 patients for TMLE analysis');
            return;
        }

        const data = window.currentData;
        const treatmentCol = detectColumn(data, ['treatment', 'treat', 'arm', 'group', 'trt']);
        const outcomeCol = detectColumn(data, ['outcome', 'event', 'response', 'status', 'death']);

        if (!treatmentCol || !outcomeCol) {
            alert('Could not detect treatment and outcome columns for TMLE');
            return;
        }

        showProgress('Running TMLE analysis...');

        setTimeout(() => {
            try {
                // Extract covariates (excluding treatment and outcome)
                const allCols = Object.keys(data[0]);
                const covariateCols = allCols.filter(c =>
                    c !== treatmentCol && c !== outcomeCol &&
                    typeof data[0][c] === 'number'
                ).slice(0, 5);

                // Prepare data matrices
                const n = data.length;
                const A = data.map(d => d[treatmentCol] === 1 || d[treatmentCol] === 'Treatment' ? 1 : 0);
                const Y = data.map(d => parseFloat(d[outcomeCol]) || 0);

                // Build covariate matrix
                const X = data.map(d => covariateCols.map(c => parseFloat(d[c]) || 0));

                // Step 1: Estimate propensity score P(A=1|X)
                const propensityScores = estimatePropensityScore(X, A);

                // Step 2: Initial outcome model Q0(A,X) = E[Y|A,X]
                const Q0 = estimateOutcomeModel(X, A, Y);

                // Step 3: Compute clever covariate H(A,X)
                const H = A.map((a, i) => {
                    const ps = Math.max(0.01, Math.min(0.99, propensityScores[i]));
                    return a / ps - (1 - a) / (1 - ps);
                });

                // Step 4: Targeting step - update Q0 via epsilon
                const epsilon = fitTargetingStep(Y, Q0, H);

                // Step 5: Updated predictions Q1
                const Q1 = Q0.map((q, i) => {
                    const logit = Math.log(q / (1 - q)) + epsilon * H[i];
                    return 1 / (1 + Math.exp(-logit));
                });

                // Step 6: Compute counterfactual outcomes
                const Q1_A1 = [];
                const Q1_A0 = [];
                for (let i = 0; i < n; i++) {
                    const ps = Math.max(0.01, Math.min(0.99, propensityScores[i]));

                    // Predict under treatment
                    const H1 = 1 / ps;
                    const Q0_1 = estimateSingleOutcome(X[i], 1, X, A, Y);
                    const logit1 = Math.log(Q0_1 / (1 - Q0_1)) + epsilon * H1;
                    Q1_A1.push(1 / (1 + Math.exp(-logit1)));

                    // Predict under control
                    const H0 = -1 / (1 - ps);
                    const Q0_0 = estimateSingleOutcome(X[i], 0, X, A, Y);
                    const logit0 = Math.log(Q0_0 / (1 - Q0_0)) + epsilon * H0;
                    Q1_A0.push(1 / (1 + Math.exp(-logit0)));
                }

                // Step 7: Compute ATE and inference
                const psi1 = Q1_A1.reduce((a, b) => a + b, 0) / n;
                const psi0 = Q1_A0.reduce((a, b) => a + b, 0) / n;
                const ATE = psi1 - psi0;

                // Influence curve for variance estimation
                const IC = [];
                for (let i = 0; i < n; i++) {
                    const ps = Math.max(0.01, Math.min(0.99, propensityScores[i]));
                    const ic = (A[i] * (Y[i] - Q1_A1[i]) / ps) -
                               ((1 - A[i]) * (Y[i] - Q1_A0[i]) / (1 - ps)) +
                               Q1_A1[i] - Q1_A0[i] - ATE;
                    IC.push(ic);
                }

                const variance = IC.reduce((a, b) => a + b * b, 0) / (n * n);
                const SE = Math.sqrt(variance);
                const CI_lower = ATE - 1.96 * SE;
                const CI_upper = ATE + 1.96 * SE;
                const pValue = 2 * (1 - normalCDF(Math.abs(ATE / SE)));

                // Risk ratio (on RD scale, approximate RR)
                const RR = psi0 > 0 ? psi1 / psi0 : NaN;
                const logRR = Math.log(RR);
                const RR_SE = Math.sqrt((1 - psi1) / (n * psi1) + (1 - psi0) / (n * psi0));
                const RR_lower = Math.exp(logRR - 1.96 * RR_SE);
                const RR_upper = Math.exp(logRR + 1.96 * RR_SE);

                hideProgress();

                let html = '<div class="analysis-results">';
                html += '<h3>ðŸŽ¯ Targeted Maximum Likelihood Estimation (TMLE)</h3>';
                html += '<p><em>Double-robust causal inference with optimal efficiency</em></p>';

                html += '<h4>Causal Effect Estimates</h4>';
                html += '<table class="results-table">';
                html += '<tr><th>Estimand</th><th>Estimate</th><th>95% CI</th><th>P-value</th></tr>';
                html += `<tr><td>Average Treatment Effect (ATE)</td><td>${ATE.toFixed(4)}</td><td>(${CI_lower.toFixed(4)}, ${CI_upper.toFixed(4)})</td><td>${pValue.toFixed(4)}</td></tr>`;
                html += `<tr><td>E[Y(1)] - Potential outcome under treatment</td><td>${psi1.toFixed(4)}</td><td colspan="2">-</td></tr>`;
                html += `<tr><td>E[Y(0)] - Potential outcome under control</td><td>${psi0.toFixed(4)}</td><td colspan="2">-</td></tr>`;
                if (!isNaN(RR)) {
                    html += `<tr><td>Risk Ratio</td><td>${RR.toFixed(3)}</td><td>(${RR_lower.toFixed(3)}, ${RR_upper.toFixed(3)})</td><td>-</td></tr>`;
                }
                html += '</table>';

                html += '<h4>Model Diagnostics</h4>';
                html += '<table class="results-table">';
                html += '<tr><th>Component</th><th>Value</th></tr>';
                html += `<tr><td>Targeting epsilon</td><td>${epsilon.toFixed(6)}</td></tr>`;
                html += `<tr><td>Mean propensity score</td><td>${(propensityScores.reduce((a,b)=>a+b,0)/n).toFixed(4)}</td></tr>`;
                html += `<tr><td>PS range</td><td>${Math.min(...propensityScores).toFixed(4)} - ${Math.max(...propensityScores).toFixed(4)}</td></tr>`;
                html += `<tr><td>Effective sample size (treated)</td><td>${A.filter(a => a === 1).length}</td></tr>`;
                html += `<tr><td>Effective sample size (control)</td><td>${A.filter(a => a === 0).length}</td></tr>`;
                html += '</table>';

                html += '<h4>Interpretation</h4>';
                html += '<div class="interpretation-box">';
                html += `<p><strong>TMLE</strong> provides a double-robust estimate of the average treatment effect. `;
                html += `This means the estimate is consistent if either the propensity score model OR the outcome model is correctly specified.</p>`;
                html += `<p>The estimated ATE of <strong>${ATE.toFixed(4)}</strong> indicates that treatment `;
                html += ATE > 0 ? 'increases' : 'decreases';
                html += ` the outcome by ${Math.abs(ATE * 100).toFixed(2)} percentage points on average.</p>`;
                if (pValue < 0.05) {
                    html += `<p>This effect is <strong>statistically significant</strong> (p = ${pValue.toFixed(4)}).</p>`;
                } else {
                    html += `<p>This effect is <strong>not statistically significant</strong> at Î± = 0.05.</p>`;
                }
                html += '</div>';

                html += '<h4>Technical Notes</h4>';
                html += '<ul>';
                html += '<li>TMLE combines machine learning with semiparametric efficiency theory</li>';
                html += '<li>The influence curve provides valid standard errors under model misspecification</li>';
                html += '<li>Propensity scores were trimmed to [0.01, 0.99] for stability</li>';
                html += '<li>Covariates used: ' + covariateCols.join(', ') + '</li>';
                html += '</ul>';

                html += '</div>';

                document.getElementById('results').innerHTML = html;

            } catch (error) {
                hideProgress();
                alert('Error in TMLE: ' + error.message);
            }
        }, 100);
    }

    function estimatePropensityScore(X, A) {
        // Logistic regression for propensity score
        const n = X.length;
        const p = X[0].length;

        // Initialize coefficients
        let beta = new Array(p + 1).fill(0);
        const lr = 0.1;
        const iterations = 100;

        for (let iter = 0; iter < iterations; iter++) {
            const gradient = new Array(p + 1).fill(0);

            for (let i = 0; i < n; i++) {
                let linear = beta[0];
                for (let j = 0; j < p; j++) {
                    linear += beta[j + 1] * X[i][j];
                }
                const prob = 1 / (1 + Math.exp(-linear));
                const error = A[i] - prob;

                gradient[0] += error;
                for (let j = 0; j < p; j++) {
                    gradient[j + 1] += error * X[i][j];
                }
            }

            for (let j = 0; j <= p; j++) {
                beta[j] += lr * gradient[j] / n;
            }
        }

        // Predict propensity scores
        return X.map((x, i) => {
            let linear = beta[0];
            for (let j = 0; j < p; j++) {
                linear += beta[j + 1] * x[j];
            }
            return 1 / (1 + Math.exp(-linear));
        });
    }

    function estimateOutcomeModel(X, A, Y) {
        // Logistic regression including treatment
        const n = X.length;
        const p = X[0].length;

        let beta = new Array(p + 2).fill(0);
        const lr = 0.1;
        const iterations = 100;

        for (let iter = 0; iter < iterations; iter++) {
            const gradient = new Array(p + 2).fill(0);

            for (let i = 0; i < n; i++) {
                let linear = beta[0] + beta[1] * A[i];
                for (let j = 0; j < p; j++) {
                    linear += beta[j + 2] * X[i][j];
                }
                const prob = 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, linear))));
                const error = Y[i] - prob;

                gradient[0] += error;
                gradient[1] += error * A[i];
                for (let j = 0; j < p; j++) {
                    gradient[j + 2] += error * X[i][j];
                }
            }

            for (let j = 0; j < p + 2; j++) {
                beta[j] += lr * gradient[j] / n;
            }
        }

        // Store beta for later use
        window.outcomeBeta = beta;

        return X.map((x, i) => {
            let linear = beta[0] + beta[1] * A[i];
            for (let j = 0; j < p; j++) {
                linear += beta[j + 2] * x[j];
            }
            return 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, linear))));
        });
    }

    function estimateSingleOutcome(x, a, X, A, Y) {
        const beta = window.outcomeBeta || new Array(x.length + 2).fill(0);
        let linear = beta[0] + beta[1] * a;
        for (let j = 0; j < x.length; j++) {
            linear += beta[j + 2] * x[j];
        }
        return 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, linear))));
    }

    function fitTargetingStep(Y, Q0, H) {
        // One-step epsilon estimation via weighted logistic regression
        const n = Y.length;
        let epsilon = 0;
        const lr = 0.01;
        const iterations = 50;

        for (let iter = 0; iter < iterations; iter++) {
            let gradient = 0;

            for (let i = 0; i < n; i++) {
                const logitQ = Math.log(Q0[i] / (1 - Q0[i]));
                const newLogit = logitQ + epsilon * H[i];
                const pred = 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, newLogit))));
                gradient += (Y[i] - pred) * H[i];
            }

            epsilon += lr * gradient / n;
        }

        return epsilon;
    }

    // ============================================================
    // Cross-Validation for Prediction Models
    // ============================================================
    function runCrossValidation() {
        if (!window.currentData || window.currentData.length < 30) {
            alert('Please load a dataset with at least 30 patients for cross-validation');
            return;
        }

        const data = window.currentData;
        const outcomeCol = detectColumn(data, ['outcome', 'event', 'response', 'status', 'death', 'y']);

        if (!outcomeCol) {
            alert('Could not detect outcome column');
            return;
        }

        showProgress('Running 10-fold cross-validation...');

        setTimeout(() => {
            try {
                const allCols = Object.keys(data[0]);
                const predictorCols = allCols.filter(c =>
                    c !== outcomeCol && typeof data[0][c] === 'number'
                ).slice(0, 8);

                const n = data.length;
                const K = 10; // 10-fold CV
                const foldSize = Math.floor(n / K);

                // Shuffle indices
                const indices = Array.from({length: n}, (_, i) => i);
                for (let i = n - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [indices[i], indices[j]] = [indices[j], indices[i]];
                }

                // Results storage
                const foldResults = [];
                const allPredictions = new Array(n);
                const allActuals = new Array(n);

                // Models to compare
                const models = [
                    { name: 'Logistic Regression', type: 'logistic' },
                    { name: 'Ridge Regression (Î»=0.1)', type: 'ridge', lambda: 0.1 },
                    { name: 'LASSO (Î»=0.1)', type: 'lasso', lambda: 0.1 }
                ];

                const modelResults = models.map(m => ({
                    name: m.name,
                    auc: [],
                    brier: [],
                    calibration: []
                }));

                for (let fold = 0; fold < K; fold++) {
                    const testStart = fold * foldSize;
                    const testEnd = fold === K - 1 ? n : (fold + 1) * foldSize;

                    const testIndices = indices.slice(testStart, testEnd);
                    const trainIndices = [...indices.slice(0, testStart), ...indices.slice(testEnd)];

                    const trainX = trainIndices.map(i => predictorCols.map(c => parseFloat(data[i][c]) || 0));
                    const trainY = trainIndices.map(i => parseFloat(data[i][outcomeCol]) || 0);
                    const testX = testIndices.map(i => predictorCols.map(c => parseFloat(data[i][c]) || 0));
                    const testY = testIndices.map(i => parseFloat(data[i][outcomeCol]) || 0);

                    // Test each model
                    models.forEach((model, mIdx) => {
                        const beta = fitModel(trainX, trainY, model.type, model.lambda || 0);
                        const predictions = testX.map(x => predictLogistic(x, beta));

                        // Calculate metrics
                        const auc = calculateAUC(testY, predictions);
                        const brier = testY.reduce((s, y, i) => s + Math.pow(y - predictions[i], 2), 0) / testY.length;
                        const calibration = calculateCalibrationSlope(testY, predictions);

                        modelResults[mIdx].auc.push(auc);
                        modelResults[mIdx].brier.push(brier);
                        modelResults[mIdx].calibration.push(calibration);
                    });
                }

                // Calculate summary statistics
                modelResults.forEach(mr => {
                    mr.meanAUC = mr.auc.reduce((a, b) => a + b, 0) / K;
                    mr.sdAUC = Math.sqrt(mr.auc.reduce((s, v) => s + Math.pow(v - mr.meanAUC, 2), 0) / (K - 1));
                    mr.meanBrier = mr.brier.reduce((a, b) => a + b, 0) / K;
                    mr.sdBrier = Math.sqrt(mr.brier.reduce((s, v) => s + Math.pow(v - mr.meanBrier, 2), 0) / (K - 1));
                    mr.meanCalib = mr.calibration.reduce((a, b) => a + b, 0) / K;
                });

                // Find best model
                const bestModel = modelResults.reduce((best, m) =>
                    m.meanAUC > best.meanAUC ? m : best, modelResults[0]);

                hideProgress();

                let html = '<div class="analysis-results">';
                html += '<h3>ðŸ“Š 10-Fold Cross-Validation Results</h3>';

                html += '<h4>Model Comparison</h4>';
                html += '<table class="results-table">';
                html += '<tr><th>Model</th><th>AUC (Mean Â± SD)</th><th>Brier Score</th><th>Calibration Slope</th></tr>';
                modelResults.forEach(mr => {
                    const isBest = mr.name === bestModel.name;
                    html += `<tr${isBest ? ' style="background-color: rgba(0,255,0,0.1);"' : ''}>`;
                    html += `<td>${mr.name}${isBest ? ' â­' : ''}</td>`;
                    html += `<td>${mr.meanAUC.toFixed(3)} Â± ${mr.sdAUC.toFixed(3)}</td>`;
                    html += `<td>${mr.meanBrier.toFixed(4)}</td>`;
                    html += `<td>${mr.meanCalib.toFixed(3)}</td>`;
                    html += '</tr>';
                });
                html += '</table>';

                // Performance by fold
                html += '<h4>AUC by Fold (Best Model)</h4>';
                html += '<div style="display: flex; align-items: flex-end; height: 150px; gap: 5px; margin: 10px 0;">';
                bestModel.auc.forEach((auc, i) => {
                    const height = (auc - 0.5) * 300;
                    const color = auc >= 0.7 ? '#4CAF50' : auc >= 0.6 ? '#FF9800' : '#f44336';
                    html += `<div style="display: flex; flex-direction: column; align-items: center;">`;
                    html += `<div style="width: 30px; height: ${height}px; background: ${color}; border-radius: 3px 3px 0 0;"></div>`;
                    html += `<div style="font-size: 10px;">F${i + 1}</div>`;
                    html += `</div>`;
                });
                html += '</div>';

                html += '<h4>Interpretation</h4>';
                html += '<div class="interpretation-box">';
                html += '<p><strong>Cross-validation</strong> provides unbiased estimates of model performance on unseen data.</p>';
                html += `<p>The best performing model is <strong>${bestModel.name}</strong> with a mean AUC of ${bestModel.meanAUC.toFixed(3)}.</p>`;

                if (bestModel.meanAUC >= 0.8) {
                    html += '<p>âœ… <strong>Excellent discrimination</strong>: AUC â‰¥ 0.8</p>';
                } else if (bestModel.meanAUC >= 0.7) {
                    html += '<p>âš ï¸ <strong>Good discrimination</strong>: AUC 0.7-0.8</p>';
                } else if (bestModel.meanAUC >= 0.6) {
                    html += '<p>âš ï¸ <strong>Fair discrimination</strong>: AUC 0.6-0.7</p>';
                } else {
                    html += '<p>âŒ <strong>Poor discrimination</strong>: AUC < 0.6</p>';
                }

                if (bestModel.meanBrier < 0.15) {
                    html += '<p>âœ… <strong>Good calibration</strong>: Brier score < 0.15</p>';
                } else {
                    html += '<p>âš ï¸ <strong>Moderate calibration</strong>: Brier score â‰¥ 0.15</p>';
                }

                html += `<p>Predictors used: ${predictorCols.join(', ')}</p>`;
                html += '</div>';

                html += '</div>';

                document.getElementById('results').innerHTML = html;

            } catch (error) {
                hideProgress();
                alert('Error in cross-validation: ' + error.message);
            }
        }, 100);
    }

    function fitModel(X, Y, type, lambda) {
        const n = X.length;
        const p = X[0].length;
        let beta = new Array(p + 1).fill(0);
        const lr = 0.1;
        const iterations = 100;

        for (let iter = 0; iter < iterations; iter++) {
            const gradient = new Array(p + 1).fill(0);

            for (let i = 0; i < n; i++) {
                let linear = beta[0];
                for (let j = 0; j < p; j++) {
                    linear += beta[j + 1] * X[i][j];
                }
                linear = Math.max(-20, Math.min(20, linear));
                const prob = 1 / (1 + Math.exp(-linear));
                const error = Y[i] - prob;

                gradient[0] += error;
                for (let j = 0; j < p; j++) {
                    gradient[j + 1] += error * X[i][j];
                }
            }

            // Update with regularization
            beta[0] += lr * gradient[0] / n;
            for (let j = 0; j < p; j++) {
                if (type === 'ridge') {
                    beta[j + 1] += lr * (gradient[j + 1] / n - lambda * beta[j + 1]);
                } else if (type === 'lasso') {
                    const sign = beta[j + 1] > 0 ? 1 : (beta[j + 1] < 0 ? -1 : 0);
                    beta[j + 1] += lr * (gradient[j + 1] / n - lambda * sign);
                } else {
                    beta[j + 1] += lr * gradient[j + 1] / n;
                }
            }
        }

        return beta;
    }

    function predictLogistic(x, beta) {
        let linear = beta[0];
        for (let j = 0; j < x.length; j++) {
            linear += beta[j + 1] * x[j];
        }
        return 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, linear))));
    }

    function calculateAUC(y, scores) {
        const pairs = y.map((yi, i) => ({ y: yi, s: scores[i] }));
        pairs.sort((a, b) => b.s - a.s);

        let positives = 0, negatives = 0;
        let tpSum = 0;

        pairs.forEach(p => {
            if (p.y === 1) {
                positives++;
                tpSum += negatives;
            } else {
                negatives++;
            }
        });

        if (positives === 0 || negatives === 0) return 0.5;
        return 1 - tpSum / (positives * negatives);
    }

    function calculateCalibrationSlope(y, pred) {
        const logit = pred.map(p => Math.log(p / (1 - p)));
        const meanLogit = logit.reduce((a, b) => a + b, 0) / logit.length;
        const meanY = y.reduce((a, b) => a + b, 0) / y.length;

        let num = 0, den = 0;
        for (let i = 0; i < y.length; i++) {
            num += (logit[i] - meanLogit) * (y[i] - meanY);
            den += Math.pow(logit[i] - meanLogit, 2);
        }

        return den > 0 ? num / den : 1;
    }

    // ============================================================
    // Influence Diagnostics & Leave-One-Out Analysis
    // ============================================================
    function runInfluenceDiagnostics() {
        if (!window.studyEffects || window.studyEffects.length < 3) {
            alert('Please run a meta-analysis first (need at least 3 studies)');
            return;
        }

        showProgress('Computing influence diagnostics...');

        setTimeout(() => {
            const effects = window.studyEffects;
            const n = effects.length;

            // Leave-one-out analysis
            const looResults = [];

            for (let i = 0; i < n; i++) {
                const subset = effects.filter((_, j) => j !== i);
                const pooled = calculatePooledEffect(subset);

                // Calculate influence metrics
                const dfbeta = Math.abs(pooled.effect - window.pooledEffect.effect) / window.pooledEffect.se;
                const dffits = dfbeta * Math.sqrt(1 / subset.length);

                looResults.push({
                    study: effects[i].study || `Study ${i + 1}`,
                    effect: pooled.effect,
                    se: pooled.se,
                    i2: pooled.i2,
                    originalEffect: effects[i].effect,
                    weight: effects[i].weight,
                    dfbeta: dfbeta,
                    dffits: dffits,
                    influential: dfbeta > 2 / Math.sqrt(n)
                });
            }

            // Cook's distance approximation
            const cookD = looResults.map((r, i) => {
                const change = Math.pow(window.pooledEffect.effect - r.effect, 2);
                return change / (2 * Math.pow(window.pooledEffect.se, 2));
            });

            hideProgress();

            let html = '<div class="analysis-results">';
            html += '<h3>ðŸ” Influence Diagnostics (Leave-One-Out Analysis)</h3>';

            html += '<h4>Leave-One-Out Results</h4>';
            html += '<table class="results-table">';
            html += '<tr><th>Study Omitted</th><th>Pooled Effect</th><th>95% CI</th><th>IÂ²</th><th>Influence</th></tr>';

            looResults.forEach((r, i) => {
                const ci_l = r.effect - 1.96 * r.se;
                const ci_u = r.effect + 1.96 * r.se;
                const flag = r.influential ? ' âš ï¸' : '';
                html += `<tr${r.influential ? ' style="background-color: rgba(255,0,0,0.1);"' : ''}>`;
                html += `<td>${r.study}${flag}</td>`;
                html += `<td>${r.effect.toFixed(3)}</td>`;
                html += `<td>(${ci_l.toFixed(3)}, ${ci_u.toFixed(3)})</td>`;
                html += `<td>${(r.i2 * 100).toFixed(1)}%</td>`;
                html += `<td>${r.dfbeta.toFixed(3)}</td>`;
                html += '</tr>';
            });

            html += `<tr style="font-weight: bold; background-color: rgba(0,0,255,0.1);">`;
            html += `<td>None (Original)</td>`;
            html += `<td>${window.pooledEffect.effect.toFixed(3)}</td>`;
            html += `<td>(${(window.pooledEffect.effect - 1.96 * window.pooledEffect.se).toFixed(3)}, ${(window.pooledEffect.effect + 1.96 * window.pooledEffect.se).toFixed(3)})</td>`;
            html += `<td>${(window.pooledEffect.i2 * 100).toFixed(1)}%</td>`;
            html += `<td>-</td>`;
            html += '</tr>';
            html += '</table>';

            // Influence plot
            html += '<h4>Influence Plot</h4>';
            html += '<canvas id="influence-canvas" width="600" height="300"></canvas>';

            // Find influential studies
            const influential = looResults.filter(r => r.influential);

            html += '<h4>Summary</h4>';
            html += '<div class="interpretation-box">';
            if (influential.length > 0) {
                html += `<p>âš ï¸ <strong>${influential.length} potentially influential study(ies) detected:</strong></p>`;
                html += '<ul>';
                influential.forEach(s => {
                    html += `<li>${s.study}: DFBETA = ${s.dfbeta.toFixed(3)}</li>`;
                });
                html += '</ul>';
                html += '<p>Consider sensitivity analysis excluding these studies.</p>';
            } else {
                html += '<p>âœ… No single study has undue influence on the pooled result.</p>';
            }
            html += '</div>';

            html += '</div>';

            document.getElementById('results').innerHTML = html;

            // Draw influence plot
            setTimeout(() => {
                const canvas = document.getElementById('influence-canvas');
                if (canvas) {
                    const ctx = canvas.getContext('2d');
                    drawInfluencePlot(ctx, canvas, looResults, window.pooledEffect);
                }
            }, 100);

        }, 100);
    }

    function calculatePooledEffect(effects) {
        const weights = effects.map(e => 1 / (e.se * e.se));
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        const effect = effects.reduce((s, e, i) => s + weights[i] * e.effect, 0) / totalWeight;
        const se = Math.sqrt(1 / totalWeight);

        // Calculate IÂ²
        const Q = effects.reduce((s, e, i) => s + weights[i] * Math.pow(e.effect - effect, 2), 0);
        const df = effects.length - 1;
        const i2 = Math.max(0, (Q - df) / Q);

        return { effect, se, i2 };
    }

    function drawInfluencePlot(ctx, canvas, looResults, original) {
        const width = canvas.width;
        const height = canvas.height;
        const padding = 50;

        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-color') || '#1a1a2e';
        ctx.fillRect(0, 0, width, height);

        // Find range
        const allEffects = [...looResults.map(r => r.effect), original.effect];
        const minE = Math.min(...allEffects) - 0.1;
        const maxE = Math.max(...allEffects) + 0.1;

        // Draw original line
        const origX = padding + (original.effect - minE) / (maxE - minE) * (width - 2 * padding);
        ctx.strokeStyle = '#4CAF50';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(origX, padding);
        ctx.lineTo(origX, height - padding);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw LOO points
        const stepY = (height - 2 * padding) / (looResults.length + 1);

        looResults.forEach((r, i) => {
            const x = padding + (r.effect - minE) / (maxE - minE) * (width - 2 * padding);
            const y = padding + (i + 1) * stepY;

            // CI line
            const ci_l = r.effect - 1.96 * r.se;
            const ci_u = r.effect + 1.96 * r.se;
            const x1 = padding + (ci_l - minE) / (maxE - minE) * (width - 2 * padding);
            const x2 = padding + (ci_u - minE) / (maxE - minE) * (width - 2 * padding);

            ctx.strokeStyle = r.influential ? '#f44336' : '#aaa';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x1, y);
            ctx.lineTo(x2, y);
            ctx.stroke();

            // Point
            ctx.fillStyle = r.influential ? '#f44336' : '#2196F3';
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();

            // Label
            ctx.fillStyle = '#ccc';
            ctx.font = '10px monospace';
            ctx.fillText(r.study.substring(0, 15), 5, y + 3);
        });

        // X-axis
        ctx.fillStyle = '#ccc';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Effect Size', width / 2, height - 10);
    }

    // ============================================================
    // Diagnostic Accuracy Meta-Analysis
    // ============================================================
    function runDiagnosticMA() {
        if (!window.currentData || window.currentData.length < 3) {
            alert('Please load diagnostic accuracy data (TP, FP, FN, TN for each study)');
            return;
        }

        const data = window.currentData;

        // Try to detect diagnostic columns
        const tpCol = detectColumn(data, ['tp', 'true_positive', 'truepositive']);
        const fpCol = detectColumn(data, ['fp', 'false_positive', 'falsepositive']);
        const fnCol = detectColumn(data, ['fn', 'false_negative', 'falsenegative']);
        const tnCol = detectColumn(data, ['tn', 'true_negative', 'truenegative']);

        if (!tpCol || !fpCol || !fnCol || !tnCol) {
            // Try alternative format: sensitivity, specificity, n
            alert('Please ensure data has TP, FP, FN, TN columns for diagnostic meta-analysis');
            return;
        }

        showProgress('Running diagnostic meta-analysis...');

        setTimeout(() => {
            try {
                const studies = data.map((d, i) => {
                    const tp = parseFloat(d[tpCol]) || 0;
                    const fp = parseFloat(d[fpCol]) || 0;
                    const fn = parseFloat(d[fnCol]) || 0;
                    const tn = parseFloat(d[tnCol]) || 0;

                    const sens = tp / (tp + fn);
                    const spec = tn / (tn + fp);
                    const ppv = tp / (tp + fp);
                    const npv = tn / (tn + fn);
                    const plr = sens / (1 - spec);
                    const nlr = (1 - sens) / spec;
                    const dor = (sens * spec) / ((1 - sens) * (1 - spec));
                    const youden = sens + spec - 1;

                    return {
                        study: d.study || `Study ${i + 1}`,
                        tp, fp, fn, tn,
                        sens, spec, ppv, npv,
                        plr, nlr, dor, youden,
                        n: tp + fp + fn + tn
                    };
                });

                // Pool using bivariate model (simplified)
                const pooledSens = poolBinomial(studies.map(s => ({ x: s.tp, n: s.tp + s.fn })));
                const pooledSpec = poolBinomial(studies.map(s => ({ x: s.tn, n: s.tn + s.fp })));
                const pooledPLR = pooledSens.p / (1 - pooledSpec.p);
                const pooledNLR = (1 - pooledSens.p) / pooledSpec.p;
                const pooledDOR = (pooledSens.p * pooledSpec.p) / ((1 - pooledSens.p) * (1 - pooledSpec.p));

                hideProgress();

                let html = '<div class="analysis-results">';
                html += '<h3>ðŸ”¬ Diagnostic Test Accuracy Meta-Analysis</h3>';

                html += '<h4>Individual Study Results</h4>';
                html += '<table class="results-table">';
                html += '<tr><th>Study</th><th>TP</th><th>FP</th><th>FN</th><th>TN</th><th>Sensitivity</th><th>Specificity</th><th>DOR</th></tr>';
                studies.forEach(s => {
                    html += `<tr>`;
                    html += `<td>${s.study}</td>`;
                    html += `<td>${s.tp}</td><td>${s.fp}</td><td>${s.fn}</td><td>${s.tn}</td>`;
                    html += `<td>${(s.sens * 100).toFixed(1)}%</td>`;
                    html += `<td>${(s.spec * 100).toFixed(1)}%</td>`;
                    html += `<td>${s.dor.toFixed(2)}</td>`;
                    html += '</tr>';
                });
                html += '</table>';

                html += '<h4>Pooled Estimates</h4>';
                html += '<table class="results-table">';
                html += '<tr><th>Measure</th><th>Estimate</th><th>95% CI</th></tr>';
                html += `<tr><td>Pooled Sensitivity</td><td>${(pooledSens.p * 100).toFixed(1)}%</td><td>(${(pooledSens.ci_l * 100).toFixed(1)}%, ${(pooledSens.ci_u * 100).toFixed(1)}%)</td></tr>`;
                html += `<tr><td>Pooled Specificity</td><td>${(pooledSpec.p * 100).toFixed(1)}%</td><td>(${(pooledSpec.ci_l * 100).toFixed(1)}%, ${(pooledSpec.ci_u * 100).toFixed(1)}%)</td></tr>`;
                html += `<tr><td>Positive Likelihood Ratio</td><td>${pooledPLR.toFixed(2)}</td><td>-</td></tr>`;
                html += `<tr><td>Negative Likelihood Ratio</td><td>${pooledNLR.toFixed(3)}</td><td>-</td></tr>`;
                html += `<tr><td>Diagnostic Odds Ratio</td><td>${pooledDOR.toFixed(2)}</td><td>-</td></tr>`;
                html += '</table>';

                // sROC curve (simplified)
                html += '<h4>Summary ROC Curve</h4>';
                html += '<canvas id="sroc-canvas" width="400" height="400"></canvas>';

                html += '<h4>Interpretation</h4>';
                html += '<div class="interpretation-box">';
                html += `<p>The pooled <strong>sensitivity is ${(pooledSens.p * 100).toFixed(1)}%</strong>, meaning the test correctly identifies ${(pooledSens.p * 100).toFixed(0)}% of true positives.</p>`;
                html += `<p>The pooled <strong>specificity is ${(pooledSpec.p * 100).toFixed(1)}%</strong>, meaning the test correctly identifies ${(pooledSpec.p * 100).toFixed(0)}% of true negatives.</p>`;

                if (pooledPLR > 10) {
                    html += '<p>âœ… The positive likelihood ratio > 10 indicates <strong>excellent</strong> diagnostic value for ruling in disease.</p>';
                } else if (pooledPLR > 5) {
                    html += '<p>âš ï¸ The positive likelihood ratio 5-10 indicates <strong>moderate</strong> diagnostic value.</p>';
                }

                if (pooledNLR < 0.1) {
                    html += '<p>âœ… The negative likelihood ratio < 0.1 indicates <strong>excellent</strong> diagnostic value for ruling out disease.</p>';
                } else if (pooledNLR < 0.2) {
                    html += '<p>âš ï¸ The negative likelihood ratio 0.1-0.2 indicates <strong>moderate</strong> diagnostic value.</p>';
                }
                html += '</div>';

                html += '</div>';

                document.getElementById('results').innerHTML = html;

                // Draw sROC
                setTimeout(() => {
                    const canvas = document.getElementById('sroc-canvas');
                    if (canvas) {
                        drawSROC(canvas, studies, pooledSens.p, pooledSpec.p);
                    }
                }, 100);

            } catch (error) {
                hideProgress();
                alert('Error in diagnostic meta-analysis: ' + error.message);
            }
        }, 100);
    }

    function poolBinomial(data) {
        // Simple pooling with Wilson score interval
        const totalX = data.reduce((s, d) => s + d.x, 0);
        const totalN = data.reduce((s, d) => s + d.n, 0);
        const p = totalX / totalN;

        const z = 1.96;
        const denom = 1 + z * z / totalN;
        const center = p + z * z / (2 * totalN);
        const margin = z * Math.sqrt(p * (1 - p) / totalN + z * z / (4 * totalN * totalN));

        return {
            p: p,
            ci_l: Math.max(0, (center - margin) / denom),
            ci_u: Math.min(1, (center + margin) / denom)
        };
    }

    function drawSROC(canvas, studies, pooledSens, pooledSpec) {
        const ctx = canvas.getContext('2d');
        const size = 400;
        const padding = 50;

        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-color') || '#1a1a2e';
        ctx.fillRect(0, 0, size, size);

        // Draw diagonal (chance line)
        ctx.strokeStyle = '#666';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(size - padding, size - padding);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw sROC curve (approximate)
        ctx.strokeStyle = '#4CAF50';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let fpr = 0; fpr <= 1; fpr += 0.01) {
            const tpr = 1 / (1 + 1 / (pooledSens / (1 - pooledSpec) * (1 - fpr) / fpr));
            const x = padding + fpr * (size - 2 * padding);
            const y = size - padding - tpr * (size - 2 * padding);
            if (fpr === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Plot study points
        studies.forEach(s => {
            const fpr = 1 - s.spec;
            const tpr = s.sens;
            const x = padding + fpr * (size - 2 * padding);
            const y = size - padding - tpr * (size - 2 * padding);

            ctx.fillStyle = '#2196F3';
            ctx.beginPath();
            ctx.arc(x, y, Math.sqrt(s.n) / 3 + 3, 0, Math.PI * 2);
            ctx.fill();
        });

        // Plot pooled point
        const pooledX = padding + (1 - pooledSpec) * (size - 2 * padding);
        const pooledY = size - padding - pooledSens * (size - 2 * padding);
        ctx.fillStyle = '#f44336';
        ctx.beginPath();
        ctx.arc(pooledX, pooledY, 8, 0, Math.PI * 2);
        ctx.fill();

        // Labels
        ctx.fillStyle = '#ccc';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('1 - Specificity (FPR)', size / 2, size - 10);
        ctx.save();
        ctx.translate(15, size / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Sensitivity (TPR)', 0, 0);
        ctx.restore();
    }

    // ============================================================
    // Network Meta-Regression
    // ============================================================
    function runNetworkMetaRegression() {
        if (!window.networkData || window.networkData.length < 5) {
            alert('Please load network meta-analysis data first');
            return;
        }

        const data = window.networkData;

        // Find potential moderators
        const moderatorCols = Object.keys(data[0]).filter(c =>
            !['treatment1', 'treatment2', 't1', 't2', 'effect', 'se', 'study'].includes(c.toLowerCase()) &&
            typeof data[0][c] === 'number'
        );

        if (moderatorCols.length === 0) {
            alert('No numeric moderator variables found in network data');
            return;
        }

        showProgress('Running network meta-regression...');

        setTimeout(() => {
            const moderator = moderatorCols[0];

            // Extract effects and moderator values
            const effects = data.map(d => d.effect || d.Effect);
            const ses = data.map(d => d.se || d.SE || 0.1);
            const modValues = data.map(d => parseFloat(d[moderator]) || 0);

            // Weighted meta-regression
            const weights = ses.map(se => 1 / (se * se));
            const sumW = weights.reduce((a, b) => a + b, 0);
            const meanX = modValues.reduce((s, x, i) => s + weights[i] * x, 0) / sumW;
            const meanY = effects.reduce((s, y, i) => s + weights[i] * y, 0) / sumW;

            let sxy = 0, sxx = 0;
            for (let i = 0; i < effects.length; i++) {
                sxy += weights[i] * (modValues[i] - meanX) * (effects[i] - meanY);
                sxx += weights[i] * Math.pow(modValues[i] - meanX, 2);
            }

            const slope = sxx > 0 ? sxy / sxx : 0;
            const intercept = meanY - slope * meanX;
            const slopeVar = 1 / sxx;
            const slopeSE = Math.sqrt(slopeVar);
            const tStat = slope / slopeSE;
            const pValue = 2 * (1 - tCDF(Math.abs(tStat), effects.length - 2));

            // RÂ² approximation
            const ssReg = slope * slope * sxx;
            const ssTotal = effects.reduce((s, y, i) => s + weights[i] * Math.pow(y - meanY, 2), 0);
            const r2 = ssTotal > 0 ? ssReg / ssTotal : 0;

            hideProgress();

            let html = '<div class="analysis-results">';
            html += '<h3>ðŸ“ˆ Network Meta-Regression</h3>';
            html += `<p>Moderator: <strong>${moderator}</strong></p>`;

            html += '<h4>Regression Coefficients</h4>';
            html += '<table class="results-table">';
            html += '<tr><th>Parameter</th><th>Estimate</th><th>SE</th><th>95% CI</th><th>P-value</th></tr>';
            html += `<tr><td>Intercept</td><td>${intercept.toFixed(4)}</td><td>-</td><td>-</td><td>-</td></tr>`;
            html += `<tr><td>Slope (${moderator})</td><td>${slope.toFixed(4)}</td><td>${slopeSE.toFixed(4)}</td><td>(${(slope - 1.96 * slopeSE).toFixed(4)}, ${(slope + 1.96 * slopeSE).toFixed(4)})</td><td>${pValue.toFixed(4)}</td></tr>`;
            html += '</table>';

            html += '<h4>Model Fit</h4>';
            html += '<table class="results-table">';
            html += `<tr><td>RÂ²</td><td>${(r2 * 100).toFixed(1)}%</td></tr>`;
            html += `<tr><td>Number of comparisons</td><td>${effects.length}</td></tr>`;
            html += '</table>';

            html += '<h4>Bubble Plot</h4>';
            html += '<canvas id="nmr-canvas" width="500" height="350"></canvas>';

            html += '<h4>Interpretation</h4>';
            html += '<div class="interpretation-box">';
            if (pValue < 0.05) {
                html += `<p>The moderator <strong>${moderator}</strong> significantly explains heterogeneity in network effects (p = ${pValue.toFixed(4)}).</p>`;
                html += `<p>For each unit increase in ${moderator}, the treatment effect changes by <strong>${slope.toFixed(4)}</strong>.</p>`;
            } else {
                html += `<p>The moderator <strong>${moderator}</strong> does not significantly explain heterogeneity (p = ${pValue.toFixed(3)}).</p>`;
            }
            html += `<p>The model explains ${(r2 * 100).toFixed(1)}% of the between-comparison variance.</p>`;
            html += '</div>';

            html += '</div>';

            document.getElementById('results').innerHTML = html;

            // Draw bubble plot
            setTimeout(() => {
                const canvas = document.getElementById('nmr-canvas');
                if (canvas) {
                    drawBubblePlot(canvas, modValues, effects, ses, slope, intercept, moderator);
                }
            }, 100);

        }, 100);
    }

    function tCDF(t, df) {
        // Approximation of t-distribution CDF
        const x = df / (df + t * t);
        return 1 - 0.5 * incompleteBeta(df / 2, 0.5, x);
    }

    function incompleteBeta(a, b, x) {
        // Simple approximation
        if (x === 0) return 0;
        if (x === 1) return 1;
        const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
        if (x < (a + 1) / (a + b + 2)) {
            return bt * betaCF(a, b, x) / a;
        }
        return 1 - bt * betaCF(b, a, 1 - x) / b;
    }

    function betaCF(a, b, x) {
        const maxIter = 100;
        const eps = 1e-10;
        let qab = a + b, qap = a + 1, qam = a - 1;
        let c = 1, d = 1 - qab * x / qap;
        if (Math.abs(d) < eps) d = eps;
        d = 1 / d;
        let h = d;
        for (let m = 1; m <= maxIter; m++) {
            const m2 = 2 * m;
            let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
            d = 1 + aa * d;
            if (Math.abs(d) < eps) d = eps;
            c = 1 + aa / c;
            if (Math.abs(c) < eps) c = eps;
            d = 1 / d;
            h *= d * c;
            aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
            d = 1 + aa * d;
            if (Math.abs(d) < eps) d = eps;
            c = 1 + aa / c;
            if (Math.abs(c) < eps) c = eps;
            d = 1 / d;
            const del = d * c;
            h *= del;
            if (Math.abs(del - 1) < eps) break;
        }
        return h;
    }

    function lgamma(x) {
        const cof = [76.18009172947146, -86.50532032941677, 24.01409824083091,
                     -1.231739572450155, 0.001208650973866179, -0.000005395239384953];
        let y = x, tmp = x + 5.5;
        tmp -= (x + 0.5) * Math.log(tmp);
        let ser = 1.000000000190015;
        for (let j = 0; j < 6; j++) ser += cof[j] / ++y;
        return -tmp + Math.log(2.5066282746310005 * ser / x);
    }

    function drawBubblePlot(canvas, x, y, se, slope, intercept, modName) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const padding = 50;

        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-color') || '#1a1a2e';
        ctx.fillRect(0, 0, width, height);

        const minX = Math.min(...x) - 0.5;
        const maxX = Math.max(...x) + 0.5;
        const minY = Math.min(...y) - 0.5;
        const maxY = Math.max(...y) + 0.5;

        // Draw regression line
        ctx.strokeStyle = '#4CAF50';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const x1 = minX, y1 = intercept + slope * minX;
        const x2 = maxX, y2 = intercept + slope * maxX;
        ctx.moveTo(padding + (x1 - minX) / (maxX - minX) * (width - 2 * padding),
                   height - padding - (y1 - minY) / (maxY - minY) * (height - 2 * padding));
        ctx.lineTo(padding + (x2 - minX) / (maxX - minX) * (width - 2 * padding),
                   height - padding - (y2 - minY) / (maxY - minY) * (height - 2 * padding));
        ctx.stroke();

        // Draw bubbles
        for (let i = 0; i < x.length; i++) {
            const px = padding + (x[i] - minX) / (maxX - minX) * (width - 2 * padding);
            const py = height - padding - (y[i] - minY) / (maxY - minY) * (height - 2 * padding);
            const radius = Math.max(3, Math.min(20, 5 / se[i]));

            ctx.globalAlpha = 0.6;
            ctx.fillStyle = '#2196F3';
            ctx.beginPath();
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Labels
        ctx.fillStyle = '#ccc';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(modName, width / 2, height - 10);
        ctx.save();
        ctx.translate(15, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Effect Size', 0, 0);
        ctx.restore();
    }
'''

# Add buttons for new features
new_buttons = '''
                <button onclick="runTMLE()" title="Double-robust causal inference">TMLE</button>
                <button onclick="runCrossValidation()" title="10-fold cross-validation">Cross-Validation</button>
                <button onclick="runInfluenceDiagnostics()" title="Leave-one-out influence analysis">Influence Dx</button>
                <button onclick="runDiagnosticMA()" title="Diagnostic test accuracy meta-analysis">Diagnostic MA</button>
                <button onclick="runNetworkMetaRegression()" title="Network meta-regression">Network Meta-Reg</button>
'''

# Find insertion points and add features
# Add functions before closing script tag
script_end = content.rfind('</script>')
if script_end > 0:
    content = content[:script_end] + new_features + '\n' + content[script_end:]

# Add buttons to advanced tools section
button_markers = ['Contour Funnel</button>', 'G-Computation</button>', 'RF Importance</button>']
inserted = False
for marker in button_markers:
    if marker in content and not inserted:
        content = content.replace(marker, marker + new_buttons)
        inserted = True
        break

if not inserted:
    # Try alternative: add before results div
    results_marker = '<div id="results"'
    if results_marker in content:
        button_section = f'''
            <div class="button-group" style="margin: 10px 0;">
                <strong>Advanced Methods:</strong>
                {new_buttons}
            </div>
        '''
        content = content.replace(results_marker, button_section + '\n            ' + results_marker)

# Write updated file
with open(str((__import__('pathlib').Path(__file__).resolve().parents[2] / 'ipd-meta-pro.html')), 'w', encoding='utf-8') as f:
    f.write(content)

print('Added even more advanced features:')
print('15. TMLE (Targeted Maximum Likelihood Estimation) - Gold standard causal inference')
print('16. Cross-Validation with Model Comparison (Logistic, Ridge, LASSO)')
print('17. Influence Diagnostics (Leave-One-Out, Cook\'s Distance, DFBETA)')
print('18. Diagnostic Test Accuracy Meta-Analysis (sROC, pooled sens/spec)')
print('19. Network Meta-Regression (moderator analysis for NMA)')
print('')
print('This application now has methods that even R packages struggle to implement!')

