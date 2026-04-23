# sentinel:skip-file — hardcoded paths are fixture/registry/audit-narrative data for this repo's research workflow, not portable application configuration. Same pattern as push_all_repos.py and E156 workbook files.
# Legacy HTML mutator retired in manifest-first workflow.
raise SystemExit(
    "This script is retired. dev/modules/ is the authoritative source. "
    "Edit the relevant module and run `python dev/build.py build` instead of mutating ipd-meta-pro.html directly."
)

import re

with open(str((__import__('pathlib').Path(__file__).resolve().parents[2] / 'ipd-meta-pro.html')), 'r', encoding='utf-8') as f:
    content = f.read()

# Add more advanced features
old_marker = '''        function estimateCATEs() {'''

advanced_v2 = '''        // ============================================================
        // EVEN MORE ADVANCED METHODS - WORLD CLASS
        // ============================================================

        // ===========================================
        // 10. G-COMPUTATION (STANDARDIZATION)
        // ===========================================
        function runGComputation() {
            if (!APP.data) {
                alert('Please load data first');
                return;
            }

            console.log('Running G-computation (parametric standardization)...');
            showLoadingOverlay('Estimating causal effects via G-computation...');

            const treatmentVar = APP.config.treatmentVar || 'treatment';
            const eventVar = APP.config.eventVar || 'event';

            // Get covariates
            const covariates = Object.keys(APP.data[0]).filter(k =>
                !['study', 'study_id', 'patient_id', 'treatment', 'treatment_name', 'time', 'event'].includes(k) &&
                typeof APP.data[0][k] === 'number'
            ).slice(0, 5);

            // Step 1: Fit outcome model (logistic regression)
            const outcomeModel = fitLogisticRegression(APP.data, eventVar, [treatmentVar, ...covariates]);

            // Step 2: Predict counterfactual outcomes for all patients under both treatments
            const predictions = {
                observed: [],
                underTreatment: [],
                underControl: []
            };

            APP.data.forEach(patient => {
                // Observed prediction
                predictions.observed.push(predictOutcome(patient, outcomeModel, treatmentVar, covariates));

                // Counterfactual: if treated
                const treatedPatient = { ...patient, [treatmentVar]: 1 };
                predictions.underTreatment.push(predictOutcome(treatedPatient, outcomeModel, treatmentVar, covariates));

                // Counterfactual: if control
                const controlPatient = { ...patient, [treatmentVar]: 0 };
                predictions.underControl.push(predictOutcome(controlPatient, outcomeModel, treatmentVar, covariates));
            });

            // Step 3: Calculate average treatment effect (ATE)
            const meanY1 = jStat.mean(predictions.underTreatment);
            const meanY0 = jStat.mean(predictions.underControl);
            const ate = meanY1 - meanY0;

            // Bootstrap confidence intervals
            const nBoot = 200;
            const bootATEs = [];
            for (let b = 0; b < nBoot; b++) {
                const bootIndices = Array(APP.data.length).fill(0).map(() => Math.floor(Math.random() * APP.data.length));
                const bootY1 = jStat.mean(bootIndices.map(i => predictions.underTreatment[i]));
                const bootY0 = jStat.mean(bootIndices.map(i => predictions.underControl[i]));
                bootATEs.push(bootY1 - bootY0);
            }

            const seATE = jStat.stdev(bootATEs);
            const ciLower = jStat.percentile(bootATEs, 0.025);
            const ciUpper = jStat.percentile(bootATEs, 0.975);

            // Risk ratio and odds ratio
            const rr = meanY1 / Math.max(meanY0, 0.001);
            const or = (meanY1 / (1 - meanY1)) / (meanY0 / (1 - meanY0 + 0.001));

            hideLoadingOverlay();
            displayGComputationResults({
                ate, seATE, ciLower, ciUpper,
                meanY1, meanY0, rr, or,
                covariates, nBoot
            });
        }

        function fitLogisticRegression(data, outcome, predictors) {
            // Simplified logistic regression via gradient descent
            const n = data.length;
            const p = predictors.length;
            let beta = new Array(p + 1).fill(0); // +1 for intercept

            // Standardize predictors
            const means = {};
            const sds = {};
            predictors.forEach(pred => {
                const values = data.map(d => d[pred]).filter(v => !isNaN(v));
                means[pred] = jStat.mean(values);
                sds[pred] = jStat.stdev(values) || 1;
            });

            // Gradient descent
            const lr = 0.1;
            const maxIter = 100;

            for (let iter = 0; iter < maxIter; iter++) {
                const gradient = new Array(p + 1).fill(0);

                data.forEach(d => {
                    let logit = beta[0]; // intercept
                    predictors.forEach((pred, j) => {
                        const x = (d[pred] - means[pred]) / sds[pred];
                        logit += beta[j + 1] * x;
                    });

                    const prob = 1 / (1 + Math.exp(-logit));
                    const error = d[outcome] - prob;

                    gradient[0] += error;
                    predictors.forEach((pred, j) => {
                        const x = (d[pred] - means[pred]) / sds[pred];
                        gradient[j + 1] += error * x;
                    });
                });

                // Update
                beta = beta.map((b, i) => b + lr * gradient[i] / n);
            }

            return { beta, means, sds, predictors };
        }

        function predictOutcome(patient, model, treatmentVar, covariates) {
            let logit = model.beta[0];
            model.predictors.forEach((pred, j) => {
                const x = (patient[pred] - model.means[pred]) / model.sds[pred];
                logit += model.beta[j + 1] * x;
            });
            return 1 / (1 + Math.exp(-logit));
        }

        function displayGComputationResults(results) {
            const modal = document.createElement('div');
            modal.className = 'modal-overlay active';
            modal.innerHTML = `
                <div class="modal" style="max-width: 800px;">
                    <div class="modal-header">
                        <h3>G-Computation (Parametric Standardization)</h3>
                        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p style="margin-bottom: 1rem; color: var(--text-secondary);">
                            Causal effect estimation using outcome model-based standardization.
                            Covariates adjusted: ${results.covariates.join(', ')}
                        </p>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                            <div class="stat-card">
                                <h4>If All Treated</h4>
                                <p style="font-size: 1.3rem;"><strong>E[Y(1)] = ${(results.meanY1 * 100).toFixed(1)}%</strong></p>
                                <p>Expected outcome probability</p>
                            </div>
                            <div class="stat-card">
                                <h4>If All Control</h4>
                                <p style="font-size: 1.3rem;"><strong>E[Y(0)] = ${(results.meanY0 * 100).toFixed(1)}%</strong></p>
                                <p>Expected outcome probability</p>
                            </div>
                        </div>

                        <div class="stat-card" style="background: linear-gradient(135deg, #6366f122, #10b98122);">
                            <h4>Average Treatment Effect (ATE)</h4>
                            <p style="font-size: 1.4rem;"><strong>${(results.ate * 100).toFixed(2)} percentage points</strong></p>
                            <p>95% Bootstrap CI: ${(results.ciLower * 100).toFixed(2)}% to ${(results.ciUpper * 100).toFixed(2)}%</p>
                            <p>SE: ${(results.seATE * 100).toFixed(2)}% (${results.nBoot} bootstrap samples)</p>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">
                            <div class="stat-card">
                                <h4>Risk Ratio</h4>
                                <p style="font-size: 1.2rem;"><strong>${results.rr.toFixed(3)}</strong></p>
                            </div>
                            <div class="stat-card">
                                <h4>Odds Ratio</h4>
                                <p style="font-size: 1.2rem;"><strong>${results.or.toFixed(3)}</strong></p>
                            </div>
                        </div>

                        <div style="margin-top: 1.5rem; padding: 1rem; background: var(--bg-tertiary); border-radius: 8px; font-size: 0.9rem;">
                            <strong>Interpretation:</strong>
                            If everyone in the population had been treated, the outcome probability would be
                            ${results.ate > 0 ? 'higher' : 'lower'} by ${Math.abs(results.ate * 100).toFixed(1)} percentage points
                            compared to if no one had been treated.
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">Close</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        // ===========================================
        // 11. BOOTSTRAP & PERMUTATION INFERENCE
        // ===========================================
        function runBootstrapInference() {
            if (!APP.results) {
                alert('Please run the main analysis first');
                return;
            }

            console.log('Running bootstrap and permutation inference...');
            showLoadingOverlay('Running 1000 bootstrap & 500 permutation samples...');

            const studies = APP.results.studies;
            const observedEffect = APP.results.pooled.effect;

            // Bootstrap confidence intervals
            const nBoot = 1000;
            const bootEffects = [];

            for (let b = 0; b < nBoot; b++) {
                // Resample studies with replacement
                const bootStudies = Array(studies.length).fill(0).map(() =>
                    studies[Math.floor(Math.random() * studies.length)]
                );

                // Calculate pooled effect
                let sumW = 0, sumWE = 0;
                bootStudies.forEach(s => {
                    const w = 1 / (s.se * s.se);
                    sumW += w;
                    sumWE += w * s.effect;
                });
                bootEffects.push(sumWE / sumW);
            }

            // Bootstrap statistics
            const bootMean = jStat.mean(bootEffects);
            const bootSE = jStat.stdev(bootEffects);
            const bootBias = bootMean - observedEffect;

            // Confidence intervals
            const ciPercentile = [jStat.percentile(bootEffects, 0.025), jStat.percentile(bootEffects, 0.975)];
            const ciBC = [
                jStat.percentile(bootEffects, jStat.normal.cdf(2 * jStat.normal.inv(bootEffects.filter(e => e < observedEffect).length / nBoot, 0, 1) - 1.96, 0, 1)),
                jStat.percentile(bootEffects, jStat.normal.cdf(2 * jStat.normal.inv(bootEffects.filter(e => e < observedEffect).length / nBoot, 0, 1) + 1.96, 0, 1))
            ];

            // Permutation test
            const nPerm = 500;
            const permEffects = [];

            for (let p = 0; p < nPerm; p++) {
                // Randomly flip signs of effects (under null hypothesis)
                const permStudies = studies.map(s => ({
                    ...s,
                    effect: s.effect * (Math.random() < 0.5 ? 1 : -1)
                }));

                let sumW = 0, sumWE = 0;
                permStudies.forEach(s => {
                    const w = 1 / (s.se * s.se);
                    sumW += w;
                    sumWE += w * s.effect;
                });
                permEffects.push(sumWE / sumW);
            }

            // Permutation p-value
            const permPValue = permEffects.filter(e => Math.abs(e) >= Math.abs(observedEffect)).length / nPerm;

            hideLoadingOverlay();
            displayBootstrapResults({
                observedEffect, nBoot, nPerm,
                bootMean, bootSE, bootBias,
                bootEffects, permEffects,
                ciPercentile, ciBC, permPValue
            });
        }

        function displayBootstrapResults(results) {
            const isLogScale = APP.config.outcomeType !== 'continuous';

            const modal = document.createElement('div');
            modal.className = 'modal-overlay active';
            modal.innerHTML = `
                <div class="modal" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header">
                        <h3>Bootstrap & Permutation Inference</h3>
                        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <h4>Bootstrap Analysis (${results.nBoot} samples)</h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                            <div class="stat-card">
                                <p style="color: var(--text-muted); font-size: 0.85rem;">Bootstrap Mean</p>
                                <p style="font-size: 1.2rem;"><strong>${(isLogScale ? Math.exp(results.bootMean) : results.bootMean).toFixed(4)}</strong></p>
                            </div>
                            <div class="stat-card">
                                <p style="color: var(--text-muted); font-size: 0.85rem;">Bootstrap SE</p>
                                <p style="font-size: 1.2rem;"><strong>${results.bootSE.toFixed(4)}</strong></p>
                            </div>
                            <div class="stat-card">
                                <p style="color: var(--text-muted); font-size: 0.85rem;">Bias</p>
                                <p style="font-size: 1.2rem;"><strong>${results.bootBias.toFixed(4)}</strong></p>
                            </div>
                        </div>

                        <h4>Confidence Intervals</h4>
                        <table class="data-table" style="font-size: 0.85rem; margin-bottom: 1.5rem;">
                            <thead>
                                <tr><th>Method</th><th>Lower</th><th>Upper</th><th>Width</th></tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>Normal (Wald)</td>
                                    <td>${(isLogScale ? Math.exp(results.observedEffect - 1.96 * results.bootSE) : results.observedEffect - 1.96 * results.bootSE).toFixed(4)}</td>
                                    <td>${(isLogScale ? Math.exp(results.observedEffect + 1.96 * results.bootSE) : results.observedEffect + 1.96 * results.bootSE).toFixed(4)}</td>
                                    <td>${(3.92 * results.bootSE).toFixed(4)}</td>
                                </tr>
                                <tr>
                                    <td>Percentile</td>
                                    <td>${(isLogScale ? Math.exp(results.ciPercentile[0]) : results.ciPercentile[0]).toFixed(4)}</td>
                                    <td>${(isLogScale ? Math.exp(results.ciPercentile[1]) : results.ciPercentile[1]).toFixed(4)}</td>
                                    <td>${(results.ciPercentile[1] - results.ciPercentile[0]).toFixed(4)}</td>
                                </tr>
                                <tr>
                                    <td>Bias-Corrected</td>
                                    <td>${(isLogScale ? Math.exp(results.ciBC[0]) : results.ciBC[0]).toFixed(4)}</td>
                                    <td>${(isLogScale ? Math.exp(results.ciBC[1]) : results.ciBC[1]).toFixed(4)}</td>
                                    <td>${(results.ciBC[1] - results.ciBC[0]).toFixed(4)}</td>
                                </tr>
                            </tbody>
                        </table>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                            <div>
                                <h4>Bootstrap Distribution</h4>
                                <canvas id="bootHist" width="350" height="200" style="width: 100%;"></canvas>
                            </div>
                            <div>
                                <h4>Permutation Distribution</h4>
                                <canvas id="permHist" width="350" height="200" style="width: 100%;"></canvas>
                            </div>
                        </div>

                        <div class="stat-card" style="background: ${results.permPValue < 0.05 ? '#10b98122' : '#f59e0b22'};">
                            <h4>Permutation Test (${results.nPerm} permutations)</h4>
                            <p><strong>P-value: ${results.permPValue.toFixed(4)}</strong></p>
                            <p style="color: var(--text-secondary);">
                                ${results.permPValue < 0.05 ?
                                    'The observed effect is unlikely under the null hypothesis of no treatment effect.' :
                                    'The observed effect is consistent with the null hypothesis.'
                                }
                            </p>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">Close</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            setTimeout(() => {
                drawHistogram('bootHist', results.bootEffects, results.observedEffect, '#6366f1');
                drawHistogram('permHist', results.permEffects, results.observedEffect, '#10b981');
            }, 100);
        }

        function drawHistogram(canvasId, data, observed, color) {
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            const width = canvas.width;
            const height = canvas.height;
            const margin = { top: 20, right: 20, bottom: 30, left: 40 };

            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-card');
            ctx.fillRect(0, 0, width, height);

            const plotWidth = width - margin.left - margin.right;
            const plotHeight = height - margin.top - margin.bottom;

            // Create bins
            const nBins = 30;
            const min = Math.min(...data);
            const max = Math.max(...data);
            const binWidth = (max - min) / nBins;

            const bins = Array(nBins).fill(0);
            data.forEach(d => {
                const bin = Math.min(Math.floor((d - min) / binWidth), nBins - 1);
                bins[bin]++;
            });

            const maxCount = Math.max(...bins);

            // Draw bars
            ctx.fillStyle = color + '88';
            bins.forEach((count, i) => {
                const x = margin.left + i * (plotWidth / nBins);
                const barHeight = (count / maxCount) * plotHeight;
                ctx.fillRect(x, margin.top + plotHeight - barHeight, plotWidth / nBins - 1, barHeight);
            });

            // Observed line
            const obsX = margin.left + ((observed - min) / (max - min)) * plotWidth;
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 3]);
            ctx.beginPath();
            ctx.moveTo(obsX, margin.top);
            ctx.lineTo(obsX, height - margin.bottom);
            ctx.stroke();
            ctx.setLineDash([]);

            // Label
            ctx.fillStyle = '#ef4444';
            ctx.font = '10px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText('Observed', obsX, margin.top - 5);
        }

        // ===========================================
        // 12. RANDOM FOREST VARIABLE IMPORTANCE
        // ===========================================
        function runRandomForestImportance() {
            if (!APP.data) {
                alert('Please load data first');
                return;
            }

            console.log('Running Random Forest variable importance...');
            showLoadingOverlay('Training random forest (100 trees)...');

            const eventVar = APP.config.eventVar || 'event';
            const covariates = Object.keys(APP.data[0]).filter(k =>
                !['study', 'study_id', 'patient_id', 'treatment', 'treatment_name', 'time', 'event'].includes(k) &&
                typeof APP.data[0][k] === 'number'
            );

            if (covariates.length < 2) {
                hideLoadingOverlay();
                alert('Need at least 2 numeric covariates');
                return;
            }

            // Simple random forest implementation
            const nTrees = 100;
            const maxDepth = 5;
            const minSamples = 10;

            const importance = {};
            covariates.forEach(c => importance[c] = 0);

            // Train trees
            for (let t = 0; t < nTrees; t++) {
                // Bootstrap sample
                const bootData = Array(APP.data.length).fill(0).map(() =>
                    APP.data[Math.floor(Math.random() * APP.data.length)]
                );

                // Build tree and track feature usage
                const treeImportance = buildTreeAndGetImportance(bootData, eventVar, covariates, maxDepth, minSamples);
                Object.keys(treeImportance).forEach(k => {
                    importance[k] += treeImportance[k];
                });
            }

            // Normalize importance
            const totalImportance = Object.values(importance).reduce((a, b) => a + b, 0);
            Object.keys(importance).forEach(k => {
                importance[k] = importance[k] / totalImportance * 100;
            });

            // Sort by importance
            const sortedImportance = Object.entries(importance)
                .sort((a, b) => b[1] - a[1])
                .map(([variable, imp]) => ({ variable, importance: imp }));

            hideLoadingOverlay();
            displayRFImportance(sortedImportance, nTrees);
        }

        function buildTreeAndGetImportance(data, outcome, covariates, maxDepth, minSamples) {
            const importance = {};
            covariates.forEach(c => importance[c] = 0);

            function buildNode(nodeData, depth) {
                if (depth >= maxDepth || nodeData.length < minSamples) return;

                // Find best split
                let bestGain = 0;
                let bestVar = null;

                covariates.forEach(cov => {
                    const values = nodeData.map(d => d[cov]).filter(v => !isNaN(v));
                    if (values.length === 0) return;

                    const median = jStat.median(values);
                    const left = nodeData.filter(d => d[cov] <= median);
                    const right = nodeData.filter(d => d[cov] > median);

                    if (left.length < minSamples / 2 || right.length < minSamples / 2) return;

                    // Gini impurity reduction
                    const pParent = nodeData.filter(d => d[outcome] === 1).length / nodeData.length;
                    const giniParent = 2 * pParent * (1 - pParent);

                    const pLeft = left.filter(d => d[outcome] === 1).length / left.length;
                    const giniLeft = 2 * pLeft * (1 - pLeft);

                    const pRight = right.filter(d => d[outcome] === 1).length / right.length;
                    const giniRight = 2 * pRight * (1 - pRight);

                    const gain = giniParent - (left.length / nodeData.length * giniLeft + right.length / nodeData.length * giniRight);

                    if (gain > bestGain) {
                        bestGain = gain;
                        bestVar = cov;
                    }
                });

                if (bestVar) {
                    importance[bestVar] += bestGain * nodeData.length;

                    const median = jStat.median(nodeData.map(d => d[bestVar]));
                    buildNode(nodeData.filter(d => d[bestVar] <= median), depth + 1);
                    buildNode(nodeData.filter(d => d[bestVar] > median), depth + 1);
                }
            }

            buildNode(data, 0);
            return importance;
        }

        function displayRFImportance(importance, nTrees) {
            const modal = document.createElement('div');
            modal.className = 'modal-overlay active';
            modal.innerHTML = `
                <div class="modal" style="max-width: 700px;">
                    <div class="modal-header">
                        <h3>Random Forest Variable Importance</h3>
                        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p style="margin-bottom: 1rem; color: var(--text-secondary);">
                            Variable importance based on ${nTrees} trees. Higher values indicate stronger predictors.
                        </p>

                        <canvas id="rfImportancePlot" width="600" height="${50 + importance.length * 35}" style="width: 100%;"></canvas>

                        <table class="data-table" style="font-size: 0.85rem; margin-top: 1.5rem;">
                            <thead>
                                <tr><th>Rank</th><th>Variable</th><th>Importance (%)</th></tr>
                            </thead>
                            <tbody>
                                ${importance.map((v, i) => `
                                    <tr>
                                        <td>${i + 1}</td>
                                        <td><strong>${v.variable}</strong></td>
                                        <td>${v.importance.toFixed(1)}%</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">Close</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            setTimeout(() => drawImportancePlot(importance), 100);
        }

        function drawImportancePlot(importance) {
            const canvas = document.getElementById('rfImportancePlot');
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            const width = canvas.width;
            const height = canvas.height;
            const margin = { top: 30, right: 60, bottom: 20, left: 120 };

            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-card');
            ctx.fillRect(0, 0, width, height);

            const plotWidth = width - margin.left - margin.right;
            const plotHeight = height - margin.top - margin.bottom;
            const barHeight = plotHeight / importance.length - 5;

            const maxImp = Math.max(...importance.map(v => v.importance));

            // Title
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-primary');
            ctx.font = 'bold 14px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText('Variable Importance (Mean Decrease in Gini)', width / 2, 15);

            importance.forEach((v, i) => {
                const y = margin.top + i * (barHeight + 5);
                const barWidth = (v.importance / maxImp) * plotWidth;

                // Gradient bar
                const gradient = ctx.createLinearGradient(margin.left, 0, margin.left + barWidth, 0);
                gradient.addColorStop(0, '#6366f1');
                gradient.addColorStop(1, '#10b981');
                ctx.fillStyle = gradient;
                ctx.fillRect(margin.left, y, barWidth, barHeight);

                // Label
                ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-secondary');
                ctx.font = '11px system-ui';
                ctx.textAlign = 'right';
                ctx.fillText(v.variable, margin.left - 10, y + barHeight / 2 + 4);

                // Value
                ctx.textAlign = 'left';
                ctx.fillText(`${v.importance.toFixed(1)}%`, margin.left + barWidth + 5, y + barHeight / 2 + 4);
            });
        }

        // ===========================================
        // 13. PATIENT CLUSTERING / PHENOTYPING
        // ===========================================
        function runPatientClustering() {
            if (!APP.data) {
                alert('Please load data first');
                return;
            }

            console.log('Running patient clustering...');
            showLoadingOverlay('Clustering patients using k-means...');

            const covariates = Object.keys(APP.data[0]).filter(k =>
                !['study', 'study_id', 'patient_id', 'treatment', 'treatment_name', 'time', 'event'].includes(k) &&
                typeof APP.data[0][k] === 'number'
            ).slice(0, 5);

            if (covariates.length < 2) {
                hideLoadingOverlay();
                alert('Need at least 2 numeric covariates for clustering');
                return;
            }

            // Standardize data
            const standardized = [];
            const means = {};
            const sds = {};

            covariates.forEach(cov => {
                const values = APP.data.map(d => d[cov]).filter(v => !isNaN(v));
                means[cov] = jStat.mean(values);
                sds[cov] = jStat.stdev(values) || 1;
            });

            APP.data.forEach(d => {
                const point = covariates.map(cov => (d[cov] - means[cov]) / sds[cov]);
                standardized.push(point);
            });

            // K-means clustering (k = 3)
            const k = 3;
            const clusters = kMeans(standardized, k);

            // Analyze clusters
            const clusterStats = [];
            for (let c = 0; c < k; c++) {
                const clusterIndices = clusters.map((cl, i) => cl === c ? i : -1).filter(i => i >= 0);
                const clusterData = clusterIndices.map(i => APP.data[i]);

                const eventVar = APP.config.eventVar || 'event';
                const treatmentVar = APP.config.treatmentVar || 'treatment';

                const treated = clusterData.filter(d => d[treatmentVar] === 1);
                const control = clusterData.filter(d => d[treatmentVar] === 0);

                const effectTreated = treated.length > 0 ? jStat.mean(treated.map(d => d[eventVar])) : 0;
                const effectControl = control.length > 0 ? jStat.mean(control.map(d => d[eventVar])) : 0;

                // Cluster characteristics
                const characteristics = {};
                covariates.forEach(cov => {
                    characteristics[cov] = jStat.mean(clusterData.map(d => d[cov]));
                });

                clusterStats.push({
                    cluster: c + 1,
                    n: clusterData.length,
                    eventRate: clusterData.filter(d => d[eventVar] === 1).length / clusterData.length,
                    treatmentEffect: effectTreated - effectControl,
                    characteristics: characteristics
                });
            }

            hideLoadingOverlay();
            displayClusteringResults(clusterStats, covariates, clusters);
        }

        function kMeans(data, k) {
            const n = data.length;
            const dim = data[0].length;

            // Initialize centroids randomly
            let centroids = [];
            const indices = [];
            while (indices.length < k) {
                const idx = Math.floor(Math.random() * n);
                if (!indices.includes(idx)) {
                    indices.push(idx);
                    centroids.push([...data[idx]]);
                }
            }

            let clusters = new Array(n).fill(0);
            const maxIter = 50;

            for (let iter = 0; iter < maxIter; iter++) {
                // Assign points to nearest centroid
                const newClusters = data.map(point => {
                    let minDist = Infinity;
                    let cluster = 0;
                    centroids.forEach((centroid, c) => {
                        const dist = Math.sqrt(point.reduce((sum, val, d) => sum + Math.pow(val - centroid[d], 2), 0));
                        if (dist < minDist) {
                            minDist = dist;
                            cluster = c;
                        }
                    });
                    return cluster;
                });

                // Check convergence
                if (JSON.stringify(newClusters) === JSON.stringify(clusters)) break;
                clusters = newClusters;

                // Update centroids
                centroids = centroids.map((_, c) => {
                    const clusterPoints = data.filter((_, i) => clusters[i] === c);
                    if (clusterPoints.length === 0) return centroids[c];
                    return Array(dim).fill(0).map((_, d) =>
                        jStat.mean(clusterPoints.map(p => p[d]))
                    );
                });
            }

            return clusters;
        }

        function displayClusteringResults(clusterStats, covariates, clusters) {
            const modal = document.createElement('div');
            modal.className = 'modal-overlay active';
            modal.innerHTML = `
                <div class="modal" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header">
                        <h3>Patient Clustering / Phenotyping</h3>
                        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p style="margin-bottom: 1rem; color: var(--text-secondary);">
                            K-means clustering identified ${clusterStats.length} distinct patient phenotypes.
                        </p>

                        <div style="display: grid; grid-template-columns: repeat(${clusterStats.length}, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
                            ${clusterStats.map((c, i) => `
                                <div class="stat-card" style="border-top: 4px solid ${['#6366f1', '#10b981', '#f59e0b'][i]};">
                                    <h4>Cluster ${c.cluster}</h4>
                                    <p><strong>N = ${c.n}</strong> (${(c.n / APP.data.length * 100).toFixed(1)}%)</p>
                                    <p>Event rate: ${(c.eventRate * 100).toFixed(1)}%</p>
                                    <p>Treatment effect: ${(c.treatmentEffect * 100).toFixed(1)}%</p>
                                </div>
                            `).join('')}
                        </div>

                        <h4>Cluster Characteristics</h4>
                        <table class="data-table" style="font-size: 0.85rem; margin-bottom: 1.5rem;">
                            <thead>
                                <tr>
                                    <th>Variable</th>
                                    ${clusterStats.map(c => `<th>Cluster ${c.cluster}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${covariates.map(cov => `
                                    <tr>
                                        <td><strong>${cov}</strong></td>
                                        ${clusterStats.map(c => `<td>${c.characteristics[cov].toFixed(2)}</td>`).join('')}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>

                        <canvas id="clusterPlot" width="700" height="350" style="width: 100%;"></canvas>

                        ${clusterStats.some(c => Math.abs(c.treatmentEffect) > 0.1) ? `
                            <div style="margin-top: 1rem; padding: 1rem; background: #f59e0b22; border-radius: 8px; border-left: 4px solid #f59e0b;">
                                <strong>Treatment effect heterogeneity detected!</strong><br>
                                Clusters show different treatment effects, suggesting personalized treatment approaches.
                            </div>
                        ` : ''}
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">Close</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            APP.clusters = clusters;
            setTimeout(() => drawClusterPlot(clusterStats, covariates, clusters), 100);
        }

        function drawClusterPlot(clusterStats, covariates, clusters) {
            const canvas = document.getElementById('clusterPlot');
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            const width = canvas.width;
            const height = canvas.height;
            const margin = { top: 40, right: 40, bottom: 50, left: 60 };

            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-card');
            ctx.fillRect(0, 0, width, height);

            const plotWidth = width - margin.left - margin.right;
            const plotHeight = height - margin.top - margin.bottom;

            // Use first two covariates for 2D plot
            const xVar = covariates[0];
            const yVar = covariates[1] || covariates[0];

            const xValues = APP.data.map(d => d[xVar]);
            const yValues = APP.data.map(d => d[yVar]);

            const xMin = Math.min(...xValues);
            const xMax = Math.max(...xValues);
            const yMin = Math.min(...yValues);
            const yMax = Math.max(...yValues);

            const xScale = (v) => margin.left + ((v - xMin) / (xMax - xMin)) * plotWidth;
            const yScale = (v) => margin.top + plotHeight - ((v - yMin) / (yMax - yMin)) * plotHeight;

            // Title
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-primary');
            ctx.font = 'bold 14px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText('Patient Clusters (2D Projection)', width / 2, 20);

            // Draw points
            const colors = ['#6366f1', '#10b981', '#f59e0b'];
            APP.data.forEach((d, i) => {
                const cluster = clusters[i];
                ctx.fillStyle = colors[cluster] + '88';
                ctx.beginPath();
                ctx.arc(xScale(d[xVar]), yScale(d[yVar]), 4, 0, 2 * Math.PI);
                ctx.fill();
            });

            // Axes
            ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-muted');
            ctx.beginPath();
            ctx.moveTo(margin.left, margin.top);
            ctx.lineTo(margin.left, height - margin.bottom);
            ctx.lineTo(width - margin.right, height - margin.bottom);
            ctx.stroke();

            // Labels
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-secondary');
            ctx.font = '12px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText(xVar, width / 2, height - 10);

            ctx.save();
            ctx.translate(15, height / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(yVar, 0, 0);
            ctx.restore();

            // Legend
            ctx.font = '11px system-ui';
            colors.forEach((c, i) => {
                ctx.fillStyle = c;
                ctx.beginPath();
                ctx.arc(width - 80, margin.top + 10 + i * 20, 6, 0, 2 * Math.PI);
                ctx.fill();
                ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-secondary');
                ctx.textAlign = 'left';
                ctx.fillText(`Cluster ${i + 1}`, width - 70, margin.top + 14 + i * 20);
            });
        }

        // ===========================================
        // 14. CONTOUR-ENHANCED FUNNEL PLOT
        // ===========================================
        function drawContourFunnelPlot() {
            if (!APP.results || !APP.results.studies) {
                alert('Please run the main analysis first');
                return;
            }

            const modal = document.createElement('div');
            modal.className = 'modal-overlay active';
            modal.innerHTML = `
                <div class="modal" style="max-width: 800px;">
                    <div class="modal-header">
                        <h3>Contour-Enhanced Funnel Plot</h3>
                        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p style="margin-bottom: 1rem; color: var(--text-secondary);">
                            Contours show regions of statistical significance. Studies in white region: p < 0.01;
                            light gray: 0.01 < p < 0.05; dark gray: 0.05 < p < 0.10.
                        </p>
                        <canvas id="contourFunnel" width="700" height="500" style="width: 100%;"></canvas>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">Close</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            setTimeout(() => renderContourFunnel(), 100);
        }

        function renderContourFunnel() {
            const canvas = document.getElementById('contourFunnel');
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            const width = canvas.width;
            const height = canvas.height;
            const margin = { top: 40, right: 40, bottom: 60, left: 70 };

            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-card');
            ctx.fillRect(0, 0, width, height);

            const plotWidth = width - margin.left - margin.right;
            const plotHeight = height - margin.top - margin.bottom;

            const studies = APP.results.studies;
            const pooledEffect = APP.results.pooled.effect;
            const isLogScale = APP.config.outcomeType !== 'continuous';

            const effects = studies.map(s => s.effect);
            const ses = studies.map(s => s.se);

            const minEffect = Math.min(...effects, pooledEffect) - 0.5;
            const maxEffect = Math.max(...effects, pooledEffect) + 0.5;
            const maxSE = Math.max(...ses) * 1.2;

            const xScale = (e) => margin.left + ((e - minEffect) / (maxEffect - minEffect)) * plotWidth;
            const yScale = (se) => margin.top + (se / maxSE) * plotHeight;

            // Title
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-primary');
            ctx.font = 'bold 14px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText('Contour-Enhanced Funnel Plot', width / 2, 20);

            // Draw significance contours
            const contours = [
                { z: 2.576, color: '#ffffff' },  // p < 0.01
                { z: 1.96, color: '#e5e7eb' },   // p < 0.05
                { z: 1.645, color: '#d1d5db' }   // p < 0.10
            ];

            contours.reverse().forEach(contour => {
                ctx.fillStyle = contour.color;
                ctx.beginPath();

                // Left boundary
                for (let se = 0; se <= maxSE; se += maxSE / 50) {
                    const effectBound = pooledEffect - contour.z * se;
                    if (se === 0) ctx.moveTo(xScale(pooledEffect), yScale(0));
                    else ctx.lineTo(xScale(effectBound), yScale(se));
                }

                // Right boundary
                for (let se = maxSE; se >= 0; se -= maxSE / 50) {
                    const effectBound = pooledEffect + contour.z * se;
                    ctx.lineTo(xScale(effectBound), yScale(se));
                }

                ctx.closePath();
                ctx.fill();
            });

            // Non-significant region (gray)
            ctx.fillStyle = '#9ca3af88';
            ctx.beginPath();
            ctx.moveTo(xScale(pooledEffect), yScale(0));
            for (let se = 0; se <= maxSE; se += maxSE / 50) {
                ctx.lineTo(xScale(pooledEffect - 1.645 * se), yScale(se));
            }
            ctx.lineTo(xScale(minEffect), yScale(maxSE));
            ctx.lineTo(xScale(minEffect), yScale(0));
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(xScale(pooledEffect), yScale(0));
            for (let se = 0; se <= maxSE; se += maxSE / 50) {
                ctx.lineTo(xScale(pooledEffect + 1.645 * se), yScale(se));
            }
            ctx.lineTo(xScale(maxEffect), yScale(maxSE));
            ctx.lineTo(xScale(maxEffect), yScale(0));
            ctx.closePath();
            ctx.fill();

            // Pooled effect line
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(xScale(pooledEffect), yScale(0));
            ctx.lineTo(xScale(pooledEffect), yScale(maxSE));
            ctx.stroke();
            ctx.setLineDash([]);

            // Null line
            if (minEffect < 0 && maxEffect > 0) {
                ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-muted');
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(xScale(0), yScale(0));
                ctx.lineTo(xScale(0), yScale(maxSE));
                ctx.stroke();
            }

            // Plot studies
            studies.forEach(s => {
                ctx.fillStyle = '#1f2937';
                ctx.beginPath();
                ctx.arc(xScale(s.effect), yScale(s.se), 5, 0, 2 * Math.PI);
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1;
                ctx.stroke();
            });

            // Axes
            ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-muted');
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(margin.left, margin.top);
            ctx.lineTo(margin.left, height - margin.bottom);
            ctx.lineTo(width - margin.right, height - margin.bottom);
            ctx.stroke();

            // Labels
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-secondary');
            ctx.font = '12px system-ui';
            ctx.textAlign = 'center';
            const effectLabel = isLogScale ? 'log(Effect)' : 'Effect Size';
            ctx.fillText(effectLabel, width / 2, height - 15);

            ctx.save();
            ctx.translate(20, height / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText('Standard Error', 0, 0);
            ctx.restore();

            // Legend
            ctx.font = '10px system-ui';
            const legendY = height - margin.bottom + 25;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(margin.left, legendY, 15, 12);
            ctx.strokeRect(margin.left, legendY, 15, 12);
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-secondary');
            ctx.textAlign = 'left';
            ctx.fillText('p<0.01', margin.left + 20, legendY + 10);

            ctx.fillStyle = '#e5e7eb';
            ctx.fillRect(margin.left + 80, legendY, 15, 12);
            ctx.strokeRect(margin.left + 80, legendY, 15, 12);
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-secondary');
            ctx.fillText('p<0.05', margin.left + 100, legendY + 10);

            ctx.fillStyle = '#d1d5db';
            ctx.fillRect(margin.left + 160, legendY, 15, 12);
            ctx.strokeRect(margin.left + 160, legendY, 15, 12);
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-secondary');
            ctx.fillText('p<0.10', margin.left + 180, legendY + 10);

            ctx.fillStyle = '#9ca3af88';
            ctx.fillRect(margin.left + 240, legendY, 15, 12);
            ctx.strokeRect(margin.left + 240, legendY, 15, 12);
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-secondary');
            ctx.fillText('p>0.10', margin.left + 260, legendY + 10);
        }

        function estimateCATEs() {'''

content = content.replace(old_marker, advanced_v2)

# Add new buttons
old_cate_btn = '''<button class="btn btn-secondary" onclick="estimateCATEs()">CATE/HTE</button>'''

new_buttons = '''<button class="btn btn-secondary" onclick="estimateCATEs()">CATE/HTE</button>
                        <button class="btn btn-secondary" onclick="runGComputation()">G-Computation</button>
                        <button class="btn btn-secondary" onclick="runBootstrapInference()">Bootstrap</button>
                        <button class="btn btn-secondary" onclick="runRandomForestImportance()">RF Importance</button>
                        <button class="btn btn-secondary" onclick="runPatientClustering()">Clustering</button>
                        <button class="btn btn-secondary" onclick="drawContourFunnelPlot()">Contour Funnel</button>'''

content = content.replace(old_cate_btn, new_buttons)

with open(str((__import__('pathlib').Path(__file__).resolve().parents[2] / 'ipd-meta-pro.html')), 'w', encoding='utf-8') as f:
    f.write(content)

print('Added more advanced features:')
print('10. G-Computation (parametric standardization for causal inference)')
print('11. Bootstrap & Permutation Inference (with multiple CI methods)')
print('12. Random Forest Variable Importance')
print('13. Patient Clustering / Phenotyping (k-means)')
print('14. Contour-Enhanced Funnel Plot')
print('')
print('File now has world-class statistical capabilities!')

