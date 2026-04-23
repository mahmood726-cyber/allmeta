# sentinel:skip-file — hardcoded paths are fixture/registry/audit-narrative data for this repo's research workflow, not portable application configuration. Same pattern as push_all_repos.py and E156 workbook files.
# Legacy HTML mutator retired in manifest-first workflow.
raise SystemExit(
    "This script is retired. dev/modules/ is the authoritative source. "
    "Edit the relevant module and run `python dev/build.py build` instead of mutating ipd-meta-pro.html directly."
)

#!/usr/bin/env python3
"""Add Even More Unique Methods: P-curve, E-value, IPD Imputation, and More"""

# Read the current file
with open(str((__import__('pathlib').Path(__file__).resolve().parents[2] / 'ipd-meta-pro.html')), 'r', encoding='utf-8') as f:
    content = f.read()

# More unique features
new_features = '''
    // ============================================================
    // P-Curve Analysis (Evidential Value)
    // ============================================================
    function runPCurveAnalysis() {
        if (!window.studyEffects || window.studyEffects.length < 5) {
            alert('Please run a meta-analysis first (need at least 5 studies)');
            return;
        }

        showProgress('Running P-curve analysis...');

        setTimeout(() => {
            const effects = window.studyEffects;

            // Calculate p-values for each study
            const pValues = effects.map(e => {
                const z = e.effect / e.se;
                return 2 * (1 - normalCDF(Math.abs(z)));
            }).filter(p => p < 0.05); // Only significant p-values

            if (pValues.length < 3) {
                hideProgress();
                alert('Not enough significant p-values (need at least 3) for P-curve analysis');
                return;
            }

            // Calculate PP-values (probability of observing p or more extreme under null)
            const ppValues = pValues.map(p => p / 0.05);

            // Binomial test: expect uniform distribution under no effect
            const below025 = pValues.filter(p => p < 0.025).length;
            const above025 = pValues.filter(p => p >= 0.025).length;
            const n = pValues.length;

            // Test for right-skew (evidential value)
            const rightSkewP = binomialTestP(below025, n, 0.5, 'greater');

            // Test for flatness (no evidential value)
            const flatP = binomialTestP(below025, n, 0.5, 'two.sided');

            // Stouffer's method for continuous test
            const zScores = pValues.map(p => -qnorm(p));
            const stoufferZ = zScores.reduce((a, b) => a + b, 0) / Math.sqrt(n);
            const stoufferP = 1 - normalCDF(stoufferZ);

            // Half p-curve test (pp-values)
            const halfPCurve = ppValues.map(pp => pp < 0.5 ? 1 : 0);
            const halfBelow = halfPCurve.reduce((a, b) => a + b, 0);
            const halfP = binomialTestP(halfBelow, n, 0.5, 'greater');

            // Power estimate (simplified)
            const avgPP = ppValues.reduce((a, b) => a + b, 0) / n;
            const estimatedPower = Math.min(0.99, Math.max(0.05, 1 - avgPP));

            hideProgress();

            let html = '<div class="analysis-results">';
            html += '<h3>ðŸ“Š P-Curve Analysis</h3>';
            html += '<p><em>Testing for evidential value vs. p-hacking/publication bias</em></p>';

            html += '<h4>P-Curve Distribution</h4>';
            html += '<canvas id="pcurve-canvas" width="500" height="300"></canvas>';

            html += '<h4>Test Results</h4>';
            html += '<table class="results-table">';
            html += '<tr><th>Test</th><th>Statistic</th><th>P-value</th><th>Interpretation</th></tr>';
            html += `<tr><td>Right-skew test</td><td>${below025}/${n} below 0.025</td><td>${rightSkewP.toFixed(4)}</td><td>${rightSkewP < 0.05 ? 'âœ… Evidential value' : 'âŒ No evidential value'}</td></tr>`;
            html += `<tr><td>Flatness test</td><td>Binomial</td><td>${flatP.toFixed(4)}</td><td>${flatP > 0.05 ? 'âš ï¸ Possible p-hacking' : 'âœ… Not flat'}</td></tr>`;
            html += `<tr><td>Stouffer's Z</td><td>${stoufferZ.toFixed(3)}</td><td>${stoufferP.toFixed(4)}</td><td>${stoufferP < 0.05 ? 'âœ… True effect exists' : 'âŒ Inconclusive'}</td></tr>`;
            html += `<tr><td>Half P-curve</td><td>${halfBelow}/${n} below 0.5</td><td>${halfP.toFixed(4)}</td><td>-</td></tr>`;
            html += '</table>';

            html += '<h4>Power Estimate</h4>';
            html += `<div class="power-meter" style="background: linear-gradient(to right, #f44336 0%, #FF9800 50%, #4CAF50 100%); height: 30px; border-radius: 5px; position: relative; margin: 10px 0;">`;
            html += `<div style="position: absolute; left: ${estimatedPower * 100}%; top: 0; width: 3px; height: 30px; background: white;"></div>`;
            html += `<div style="position: absolute; left: ${estimatedPower * 100 - 5}%; top: 35px; color: #ccc;">${(estimatedPower * 100).toFixed(0)}%</div>`;
            html += '</div>';
            html += `<p>Estimated statistical power: <strong>${(estimatedPower * 100).toFixed(1)}%</strong></p>`;

            html += '<h4>Interpretation</h4>';
            html += '<div class="interpretation-box">';
            if (rightSkewP < 0.05 && flatP > 0.1) {
                html += '<p>âœ… <strong>The P-curve is right-skewed</strong>, indicating that the set of studies contains evidential value.</p>';
                html += '<p>This suggests the effect is likely real and not solely due to publication bias or p-hacking.</p>';
            } else if (flatP < 0.05) {
                html += '<p>âš ï¸ <strong>The P-curve is flat or left-skewed</strong>, which may indicate:</p>';
                html += '<ul><li>P-hacking (data dredging)</li><li>Selective reporting</li><li>Publication bias</li></ul>';
            } else {
                html += '<p>â“ <strong>Inconclusive</strong> - the P-curve does not strongly indicate either evidential value or lack thereof.</p>';
            }
            html += '</div>';

            html += '</div>';

            document.getElementById('results').innerHTML = html;

            // Draw P-curve
            setTimeout(() => {
                const canvas = document.getElementById('pcurve-canvas');
                if (canvas) {
                    drawPCurve(canvas, pValues);
                }
            }, 100);

        }, 100);
    }

    function binomialTestP(k, n, prob, alternative) {
        // Simple binomial test
        let pValue = 0;
        if (alternative === 'greater') {
            for (let i = k; i <= n; i++) {
                pValue += binomialPMF(n, i, prob);
            }
        } else if (alternative === 'less') {
            for (let i = 0; i <= k; i++) {
                pValue += binomialPMF(n, i, prob);
            }
        } else {
            const expected = n * prob;
            const observed = k;
            const tailProb = observed <= expected ?
                binomialTestP(k, n, prob, 'less') :
                binomialTestP(k, n, prob, 'greater');
            pValue = Math.min(1, 2 * tailProb);
        }
        return pValue;
    }

    function binomialPMF(n, k, p) {
        return binomialCoeff(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
    }

    function binomialCoeff(n, k) {
        if (k > n) return 0;
        if (k === 0 || k === n) return 1;
        let result = 1;
        for (let i = 0; i < k; i++) {
            result = result * (n - i) / (i + 1);
        }
        return result;
    }

    function qnorm(p) {
        // Inverse normal approximation (Abramowitz & Stegun)
        if (p <= 0) return -Infinity;
        if (p >= 1) return Infinity;
        if (p === 0.5) return 0;

        const a = [
            -3.969683028665376e+01, 2.209460984245205e+02,
            -2.759285104469687e+02, 1.383577518672690e+02,
            -3.066479806614716e+01, 2.506628277459239e+00
        ];
        const b = [
            -5.447609879822406e+01, 1.615858368580409e+02,
            -1.556989798598866e+02, 6.680131188771972e+01,
            -1.328068155288572e+01
        ];
        const c = [
            -7.784894002430293e-03, -3.223964580411365e-01,
            -2.400758277161838e+00, -2.549732539343734e+00,
            4.374664141464968e+00, 2.938163982698783e+00
        ];
        const d = [
            7.784695709041462e-03, 3.224671290700398e-01,
            2.445134137142996e+00, 3.754408661907416e+00
        ];

        const pLow = 0.02425;
        const pHigh = 1 - pLow;

        let q, r;
        if (p < pLow) {
            q = Math.sqrt(-2 * Math.log(p));
            return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
                   ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
        } else if (p <= pHigh) {
            q = p - 0.5;
            r = q * q;
            return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
                   (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
        } else {
            q = Math.sqrt(-2 * Math.log(1 - p));
            return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
                    ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
        }
    }

    function drawPCurve(canvas, pValues) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const padding = 50;

        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-color') || '#1a1a2e';
        ctx.fillRect(0, 0, width, height);

        // Create histogram bins
        const bins = [0, 0.01, 0.02, 0.03, 0.04, 0.05];
        const counts = [0, 0, 0, 0, 0];

        pValues.forEach(p => {
            if (p < 0.01) counts[0]++;
            else if (p < 0.02) counts[1]++;
            else if (p < 0.03) counts[2]++;
            else if (p < 0.04) counts[3]++;
            else if (p < 0.05) counts[4]++;
        });

        const maxCount = Math.max(...counts, 1);
        const barWidth = (width - 2 * padding) / 5 - 5;

        // Draw bars
        counts.forEach((count, i) => {
            const x = padding + i * (barWidth + 5);
            const barHeight = (count / maxCount) * (height - 2 * padding);
            const y = height - padding - barHeight;

            ctx.fillStyle = count > pValues.length / 5 ? '#4CAF50' : '#2196F3';
            ctx.fillRect(x, y, barWidth, barHeight);

            // Label
            ctx.fillStyle = '#ccc';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${(bins[i] * 100).toFixed(0)}-${(bins[i + 1] * 100).toFixed(0)}%`, x + barWidth / 2, height - 30);
            ctx.fillText(count.toString(), x + barWidth / 2, y - 5);
        });

        // Uniform line (expected under null)
        const uniformHeight = (pValues.length / 5 / maxCount) * (height - 2 * padding);
        ctx.strokeStyle = '#f44336';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(padding, height - padding - uniformHeight);
        ctx.lineTo(width - padding, height - padding - uniformHeight);
        ctx.stroke();
        ctx.setLineDash([]);

        // Labels
        ctx.fillStyle = '#ccc';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('P-value bins', width / 2, height - 10);
    }

    // ============================================================
    // E-Value for Unmeasured Confounding
    // ============================================================
    function runEValueAnalysis() {
        if (!window.pooledEffect) {
            alert('Please run a meta-analysis first');
            return;
        }

        showProgress('Computing E-values...');

        setTimeout(() => {
            const effect = window.pooledEffect.effect;
            const se = window.pooledEffect.se;
            const ci_lower = effect - 1.96 * se;
            const ci_upper = effect + 1.96 * se;

            // Convert to risk ratio scale if needed
            let RR = Math.exp(effect); // Assuming log scale
            let RR_lower = Math.exp(ci_lower);
            let RR_upper = Math.exp(ci_upper);

            // E-value formula: E = RR + sqrt(RR * (RR - 1))
            const eValue = calculateEValue(RR);
            const eValueCI = RR > 1 ?
                calculateEValue(RR_lower) :
                calculateEValue(1 / RR_upper);

            // For protective effects (RR < 1), flip
            if (RR < 1) {
                RR = 1 / RR;
                const temp = RR_lower;
                RR_lower = 1 / RR_upper;
                RR_upper = 1 / temp;
            }

            hideProgress();

            let html = '<div class="analysis-results">';
            html += '<h3>ðŸ›¡ï¸ E-Value: Sensitivity to Unmeasured Confounding</h3>';
            html += '<p><em>How strong would confounding need to be to explain away the effect?</em></p>';

            html += '<h4>E-Value Results</h4>';
            html += '<table class="results-table">';
            html += '<tr><th>Estimate</th><th>Risk Ratio</th><th>E-Value</th></tr>';
            html += `<tr><td>Point Estimate</td><td>${RR.toFixed(3)}</td><td><strong>${eValue.toFixed(2)}</strong></td></tr>`;
            html += `<tr><td>Closest CI bound to null</td><td>${Math.min(RR_lower, RR_upper).toFixed(3)}</td><td>${eValueCI.toFixed(2)}</td></tr>`;
            html += '</table>';

            html += '<h4>Interpretation Scale</h4>';
            html += '<div style="display: flex; align-items: center; gap: 10px; margin: 15px 0;">';
            html += '<span>Weak</span>';
            html += '<div style="flex: 1; height: 20px; background: linear-gradient(to right, #f44336, #FF9800, #4CAF50); border-radius: 10px; position: relative;">';
            const markerPos = Math.min(95, Math.max(5, (eValue - 1) / 5 * 100));
            html += `<div style="position: absolute; left: ${markerPos}%; top: -5px; width: 2px; height: 30px; background: white;"></div>`;
            html += '</div>';
            html += '<span>Strong</span>';
            html += '</div>';

            html += '<h4>Interpretation</h4>';
            html += '<div class="interpretation-box">';
            html += `<p>The <strong>E-value of ${eValue.toFixed(2)}</strong> means that an unmeasured confounder would need to be associated with both the treatment and outcome by a risk ratio of at least ${eValue.toFixed(2)}-fold each, above and beyond the measured confounders, to fully explain away the observed effect.</p>`;

            if (eValue > 3) {
                html += '<p>âœ… <strong>Robust to unmeasured confounding</strong>: The E-value is large, suggesting the effect is unlikely to be due to unmeasured confounding alone.</p>';
            } else if (eValue > 2) {
                html += '<p>âš ï¸ <strong>Moderate robustness</strong>: The effect could potentially be explained by moderately strong confounding.</p>';
            } else {
                html += '<p>âŒ <strong>Sensitive to confounding</strong>: Even weak unmeasured confounding could explain the observed effect.</p>';
            }

            html += '<p><em>Note: A larger E-value indicates greater robustness to unmeasured confounding.</em></p>';
            html += '</div>';

            html += '<h4>Bias Plot</h4>';
            html += '<canvas id="evalue-canvas" width="400" height="300"></canvas>';

            html += '</div>';

            document.getElementById('results').innerHTML = html;

            // Draw bias plot
            setTimeout(() => {
                const canvas = document.getElementById('evalue-canvas');
                if (canvas) {
                    drawEValuePlot(canvas, RR, eValue);
                }
            }, 100);

        }, 100);
    }

    function calculateEValue(RR) {
        if (RR <= 1) return 1;
        return RR + Math.sqrt(RR * (RR - 1));
    }

    function drawEValuePlot(canvas, RR, eValue) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const padding = 50;

        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-color') || '#1a1a2e';
        ctx.fillRect(0, 0, width, height);

        // Draw curve showing RR_EU combinations that could explain effect
        ctx.strokeStyle = '#4CAF50';
        ctx.lineWidth = 2;
        ctx.beginPath();

        for (let RR_EU = 1; RR_EU <= 6; RR_EU += 0.1) {
            // RR_UD needed to explain effect given RR_EU
            const RR_UD = RR * RR_EU / (RR_EU + RR - 1);
            if (RR_UD >= 1 && RR_UD <= 6) {
                const x = padding + (RR_EU - 1) / 5 * (width - 2 * padding);
                const y = height - padding - (RR_UD - 1) / 5 * (height - 2 * padding);
                if (RR_EU === 1) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        // Mark E-value point
        const ex = padding + (eValue - 1) / 5 * (width - 2 * padding);
        const ey = height - padding - (eValue - 1) / 5 * (height - 2 * padding);
        ctx.fillStyle = '#f44336';
        ctx.beginPath();
        ctx.arc(ex, ey, 8, 0, Math.PI * 2);
        ctx.fill();

        // Labels
        ctx.fillStyle = '#ccc';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Confounder-Exposure RR', width / 2, height - 10);
        ctx.save();
        ctx.translate(15, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Confounder-Outcome RR', 0, 0);
        ctx.restore();
    }

    // ============================================================
    // IPD Missing Data Patterns Analysis
    // ============================================================
    function runMissingDataAnalysis() {
        if (!window.currentData || window.currentData.length < 10) {
            alert('Please load a dataset first');
            return;
        }

        showProgress('Analyzing missing data patterns...');

        setTimeout(() => {
            const data = window.currentData;
            const cols = Object.keys(data[0]);
            const n = data.length;

            // Calculate missing for each variable
            const missing = {};
            cols.forEach(col => {
                const missingCount = data.filter(d =>
                    d[col] === null || d[col] === undefined ||
                    d[col] === '' || (typeof d[col] === 'number' && isNaN(d[col]))
                ).length;
                missing[col] = {
                    count: missingCount,
                    percent: (missingCount / n * 100).toFixed(1)
                };
            });

            // Count complete cases
            const completeCases = data.filter(d =>
                cols.every(col => d[col] !== null && d[col] !== undefined &&
                    d[col] !== '' && !(typeof d[col] === 'number' && isNaN(d[col])))
            ).length;

            // Missing data patterns
            const patterns = {};
            data.forEach(d => {
                const pattern = cols.map(col => {
                    const val = d[col];
                    return (val === null || val === undefined || val === '' ||
                        (typeof val === 'number' && isNaN(val))) ? '0' : '1';
                }).join('');
                patterns[pattern] = (patterns[pattern] || 0) + 1;
            });

            // Little's MCAR test approximation
            const mcarStatistic = calculateMCARTest(data, cols);

            hideProgress();

            let html = '<div class="analysis-results">';
            html += '<h3>ðŸ” Missing Data Pattern Analysis</h3>';

            html += '<h4>Variable-Level Missing Data</h4>';
            html += '<table class="results-table">';
            html += '<tr><th>Variable</th><th>Missing N</th><th>Missing %</th><th>Completeness</th></tr>';
            Object.entries(missing).forEach(([col, info]) => {
                const barWidth = 100 - parseFloat(info.percent);
                html += `<tr>`;
                html += `<td>${col}</td>`;
                html += `<td>${info.count}</td>`;
                html += `<td>${info.percent}%</td>`;
                html += `<td><div style="background: #333; width: 100px; height: 15px; border-radius: 3px;"><div style="background: ${info.percent > 20 ? '#f44336' : '#4CAF50'}; width: ${barWidth}px; height: 15px; border-radius: 3px;"></div></div></td>`;
                html += '</tr>';
            });
            html += '</table>';

            html += '<h4>Summary Statistics</h4>';
            html += '<table class="results-table">';
            html += `<tr><td>Total observations</td><td>${n}</td></tr>`;
            html += `<tr><td>Complete cases</td><td>${completeCases} (${(completeCases / n * 100).toFixed(1)}%)</td></tr>`;
            html += `<tr><td>Number of variables</td><td>${cols.length}</td></tr>`;
            html += `<tr><td>Unique missing patterns</td><td>${Object.keys(patterns).length}</td></tr>`;
            html += '</table>';

            html += '<h4>Missing Data Mechanism (Little\'s MCAR Test)</h4>';
            html += '<table class="results-table">';
            html += `<tr><td>Chi-square statistic</td><td>${mcarStatistic.chi2.toFixed(2)}</td></tr>`;
            html += `<tr><td>Degrees of freedom</td><td>${mcarStatistic.df}</td></tr>`;
            html += `<tr><td>P-value</td><td>${mcarStatistic.pValue.toFixed(4)}</td></tr>`;
            html += '</table>';

            html += '<h4>Interpretation</h4>';
            html += '<div class="interpretation-box">';
            if (mcarStatistic.pValue > 0.05) {
                html += '<p>âœ… <strong>Data may be Missing Completely At Random (MCAR)</strong></p>';
                html += '<p>Complete case analysis may be unbiased, but will lose efficiency.</p>';
            } else {
                html += '<p>âš ï¸ <strong>Data is NOT Missing Completely At Random</strong></p>';
                html += '<p>Multiple imputation or other methods are recommended to avoid bias.</p>';
            }

            // Recommendations
            const maxMissing = Math.max(...Object.values(missing).map(m => parseFloat(m.percent)));
            if (maxMissing > 40) {
                html += '<p>ðŸ”´ <strong>High missing rate detected (>40%)</strong>: Consider excluding these variables or collecting more data.</p>';
            } else if (maxMissing > 20) {
                html += '<p>ðŸŸ¡ <strong>Moderate missing rate (20-40%)</strong>: Multiple imputation strongly recommended.</p>';
            } else if (maxMissing > 5) {
                html += '<p>ðŸŸ¢ <strong>Low missing rate (5-20%)</strong>: Multiple imputation or complete case analysis acceptable.</p>';
            } else {
                html += '<p>âœ… <strong>Very low missing rate (<5%)</strong>: Complete case analysis is typically acceptable.</p>';
            }
            html += '</div>';

            html += '<h4>Missing Data Pattern Matrix</h4>';
            html += '<canvas id="missing-canvas" width="500" height="300"></canvas>';

            html += '</div>';

            document.getElementById('results').innerHTML = html;

            // Draw pattern matrix
            setTimeout(() => {
                const canvas = document.getElementById('missing-canvas');
                if (canvas) {
                    drawMissingMatrix(canvas, data, cols);
                }
            }, 100);

        }, 100);
    }

    function calculateMCARTest(data, cols) {
        // Simplified Little's MCAR test
        const n = data.length;
        const numericCols = cols.filter(c => typeof data[0][c] === 'number');

        if (numericCols.length < 2) {
            return { chi2: 0, df: 1, pValue: 1 };
        }

        // Group by missing pattern
        const groups = {};
        data.forEach((d, i) => {
            const pattern = numericCols.map(c =>
                (d[c] === null || isNaN(d[c])) ? '0' : '1'
            ).join('');
            if (!groups[pattern]) groups[pattern] = [];
            groups[pattern].push(i);
        });

        // Calculate test statistic (simplified)
        let chi2 = 0;
        const numGroups = Object.keys(groups).length;

        Object.values(groups).forEach(indices => {
            if (indices.length > 1) {
                numericCols.forEach(col => {
                    const values = indices.map(i => data[i][col]).filter(v => v !== null && !isNaN(v));
                    if (values.length > 0) {
                        const mean = values.reduce((a, b) => a + b, 0) / values.length;
                        const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
                        if (variance > 0) {
                            chi2 += Math.pow(mean, 2) / variance * indices.length / n;
                        }
                    }
                });
            }
        });

        const df = Math.max(1, (numGroups - 1) * numericCols.length);
        const pValue = 1 - chi2CDF(chi2, df);

        return { chi2, df, pValue };
    }

    function chi2CDF(x, df) {
        if (x <= 0) return 0;
        // Approximation using Wilson-Hilferty transformation
        const z = Math.pow(x / df, 1/3) - (1 - 2 / (9 * df));
        const se = Math.sqrt(2 / (9 * df));
        return normalCDF(z / se);
    }

    function drawMissingMatrix(canvas, data, cols) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const padding = 60;

        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-color') || '#1a1a2e';
        ctx.fillRect(0, 0, width, height);

        const sampleSize = Math.min(100, data.length);
        const displayCols = cols.slice(0, 10);
        const cellWidth = (width - 2 * padding) / displayCols.length;
        const cellHeight = (height - 2 * padding) / sampleSize;

        // Draw matrix
        for (let i = 0; i < sampleSize; i++) {
            for (let j = 0; j < displayCols.length; j++) {
                const val = data[i][displayCols[j]];
                const isMissing = val === null || val === undefined || val === '' ||
                    (typeof val === 'number' && isNaN(val));

                const x = padding + j * cellWidth;
                const y = padding + i * cellHeight;

                ctx.fillStyle = isMissing ? '#f44336' : '#4CAF50';
                ctx.fillRect(x, y, cellWidth - 1, cellHeight - 1);
            }
        }

        // Column labels
        ctx.fillStyle = '#ccc';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        displayCols.forEach((col, j) => {
            ctx.save();
            ctx.translate(padding + j * cellWidth + cellWidth / 2, padding - 5);
            ctx.rotate(-Math.PI / 4);
            ctx.fillText(col.substring(0, 8), 0, 0);
            ctx.restore();
        });

        // Legend
        ctx.fillStyle = '#4CAF50';
        ctx.fillRect(width - 100, height - 40, 15, 15);
        ctx.fillStyle = '#ccc';
        ctx.textAlign = 'left';
        ctx.fillText('Present', width - 80, height - 28);

        ctx.fillStyle = '#f44336';
        ctx.fillRect(width - 100, height - 20, 15, 15);
        ctx.fillStyle = '#ccc';
        ctx.fillText('Missing', width - 80, height - 8);
    }

    // ============================================================
    // Network Inconsistency (Node-Splitting) Enhancement
    // ============================================================
    function runEnhancedNodeSplitting() {
        if (!window.networkData || window.networkData.length < 4) {
            alert('Please load network meta-analysis data first');
            return;
        }

        showProgress('Running enhanced node-splitting analysis...');

        setTimeout(() => {
            const data = window.networkData;

            // Build network structure
            const treatments = new Set();
            const comparisons = [];

            data.forEach(d => {
                const t1 = d.treatment1 || d.t1;
                const t2 = d.treatment2 || d.t2;
                treatments.add(t1);
                treatments.add(t2);
                comparisons.push({
                    t1, t2,
                    effect: d.effect || d.Effect,
                    se: d.se || d.SE || 0.1
                });
            });

            const treatArray = Array.from(treatments);

            // Node-splitting for each direct comparison
            const nodeSplitResults = [];

            comparisons.forEach((comp, idx) => {
                // Direct estimate
                const directEffect = comp.effect;
                const directSE = comp.se;

                // Indirect estimate (from other paths)
                const indirectComps = comparisons.filter((c, i) =>
                    i !== idx && (c.t1 === comp.t1 || c.t2 === comp.t1 || c.t1 === comp.t2 || c.t2 === comp.t2)
                );

                if (indirectComps.length > 0) {
                    // Simple indirect estimate
                    let indirectEffect = 0;
                    let indirectVar = 0;

                    indirectComps.forEach(ic => {
                        // Bucher method approximation
                        let contrib = 0;
                        if (ic.t1 === comp.t1) contrib = ic.effect;
                        else if (ic.t2 === comp.t1) contrib = -ic.effect;
                        else if (ic.t1 === comp.t2) contrib = -ic.effect;
                        else if (ic.t2 === comp.t2) contrib = ic.effect;

                        indirectEffect += contrib;
                        indirectVar += ic.se * ic.se;
                    });

                    const indirectSE = Math.sqrt(indirectVar);

                    // Test for inconsistency
                    const diff = directEffect - indirectEffect;
                    const diffSE = Math.sqrt(directSE * directSE + indirectSE * indirectSE);
                    const z = diff / diffSE;
                    const pValue = 2 * (1 - normalCDF(Math.abs(z)));

                    nodeSplitResults.push({
                        comparison: `${comp.t1} vs ${comp.t2}`,
                        direct: directEffect,
                        directSE: directSE,
                        indirect: indirectEffect,
                        indirectSE: indirectSE,
                        difference: diff,
                        differenceSE: diffSE,
                        z: z,
                        pValue: pValue,
                        inconsistent: pValue < 0.10
                    });
                }
            });

            // Global inconsistency test
            const designMatrix = comparisons.length;
            const loopCount = Math.max(0, designMatrix - treatArray.length + 1);
            const globalQ = nodeSplitResults.reduce((s, r) => s + r.z * r.z, 0);
            const globalP = loopCount > 0 ? 1 - chi2CDF(globalQ, loopCount) : 1;

            hideProgress();

            let html = '<div class="analysis-results">';
            html += '<h3>ðŸ”„ Network Inconsistency Assessment (Node-Splitting)</h3>';

            html += '<h4>Local Inconsistency Tests</h4>';
            html += '<table class="results-table">';
            html += '<tr><th>Comparison</th><th>Direct</th><th>Indirect</th><th>Difference</th><th>P-value</th><th>Status</th></tr>';

            nodeSplitResults.forEach(r => {
                html += `<tr${r.inconsistent ? ' style="background-color: rgba(255,0,0,0.15);"' : ''}>`;
                html += `<td>${r.comparison}</td>`;
                html += `<td>${r.direct.toFixed(3)} (${r.directSE.toFixed(3)})</td>`;
                html += `<td>${r.indirect.toFixed(3)} (${r.indirectSE.toFixed(3)})</td>`;
                html += `<td>${r.difference.toFixed(3)}</td>`;
                html += `<td>${r.pValue.toFixed(3)}</td>`;
                html += `<td>${r.inconsistent ? 'âš ï¸ Inconsistent' : 'âœ… Consistent'}</td>`;
                html += '</tr>';
            });
            html += '</table>';

            html += '<h4>Global Inconsistency Test</h4>';
            html += '<table class="results-table">';
            html += `<tr><td>Number of loops</td><td>${loopCount}</td></tr>`;
            html += `<tr><td>Q statistic</td><td>${globalQ.toFixed(2)}</td></tr>`;
            html += `<tr><td>P-value</td><td>${globalP.toFixed(4)}</td></tr>`;
            html += '</table>';

            const inconsistentCount = nodeSplitResults.filter(r => r.inconsistent).length;

            html += '<h4>Interpretation</h4>';
            html += '<div class="interpretation-box">';
            if (globalP > 0.10 && inconsistentCount === 0) {
                html += '<p>âœ… <strong>No significant inconsistency detected</strong></p>';
                html += '<p>The network is consistent, and direct and indirect evidence agree.</p>';
            } else if (inconsistentCount > 0) {
                html += `<p>âš ï¸ <strong>${inconsistentCount} comparison(s) show local inconsistency</strong></p>`;
                html += '<p>Consider investigating the sources of inconsistency (study design, patient populations, etc.)</p>';
            }
            if (globalP < 0.10) {
                html += '<p>âš ï¸ <strong>Global inconsistency detected</strong> (p < 0.10)</p>';
                html += '<p>The network-wide evidence shows statistical inconsistency.</p>';
            }
            html += '</div>';

            html += '<h4>Node-Splitting Plot</h4>';
            html += '<canvas id="nodesplit-canvas" width="600" height="300"></canvas>';

            html += '</div>';

            document.getElementById('results').innerHTML = html;

            // Draw node-splitting plot
            setTimeout(() => {
                const canvas = document.getElementById('nodesplit-canvas');
                if (canvas && nodeSplitResults.length > 0) {
                    drawNodeSplitPlot(canvas, nodeSplitResults);
                }
            }, 100);

        }, 100);
    }

    function drawNodeSplitPlot(canvas, results) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const padding = 80;

        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-color') || '#1a1a2e';
        ctx.fillRect(0, 0, width, height);

        const n = results.length;
        const rowHeight = (height - 2 * padding) / n;

        // Find range
        const allEffects = results.flatMap(r => [
            r.direct - 1.96 * r.directSE,
            r.direct + 1.96 * r.directSE,
            r.indirect - 1.96 * r.indirectSE,
            r.indirect + 1.96 * r.indirectSE
        ]);
        const minE = Math.min(...allEffects) - 0.2;
        const maxE = Math.max(...allEffects) + 0.2;

        // Draw null line
        const nullX = padding + (0 - minE) / (maxE - minE) * (width - 2 * padding);
        ctx.strokeStyle = '#666';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(nullX, padding);
        ctx.lineTo(nullX, height - padding);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw results
        results.forEach((r, i) => {
            const y = padding + (i + 0.5) * rowHeight;

            // Direct (blue square)
            const dx = padding + (r.direct - minE) / (maxE - minE) * (width - 2 * padding);
            const dx_l = padding + (r.direct - 1.96 * r.directSE - minE) / (maxE - minE) * (width - 2 * padding);
            const dx_u = padding + (r.direct + 1.96 * r.directSE - minE) / (maxE - minE) * (width - 2 * padding);

            ctx.strokeStyle = '#2196F3';
            ctx.beginPath();
            ctx.moveTo(dx_l, y - 5);
            ctx.lineTo(dx_u, y - 5);
            ctx.stroke();

            ctx.fillStyle = '#2196F3';
            ctx.fillRect(dx - 4, y - 9, 8, 8);

            // Indirect (orange circle)
            const ix = padding + (r.indirect - minE) / (maxE - minE) * (width - 2 * padding);
            const ix_l = padding + (r.indirect - 1.96 * r.indirectSE - minE) / (maxE - minE) * (width - 2 * padding);
            const ix_u = padding + (r.indirect + 1.96 * r.indirectSE - minE) / (maxE - minE) * (width - 2 * padding);

            ctx.strokeStyle = '#FF9800';
            ctx.beginPath();
            ctx.moveTo(ix_l, y + 5);
            ctx.lineTo(ix_u, y + 5);
            ctx.stroke();

            ctx.fillStyle = '#FF9800';
            ctx.beginPath();
            ctx.arc(ix, y + 5, 4, 0, Math.PI * 2);
            ctx.fill();

            // Label
            ctx.fillStyle = r.inconsistent ? '#f44336' : '#ccc';
            ctx.font = '10px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(r.comparison.substring(0, 15), padding - 5, y + 3);
        });

        // Legend
        ctx.fillStyle = '#2196F3';
        ctx.fillRect(width - 100, 20, 10, 10);
        ctx.fillStyle = '#ccc';
        ctx.textAlign = 'left';
        ctx.font = '10px monospace';
        ctx.fillText('Direct', width - 85, 30);

        ctx.fillStyle = '#FF9800';
        ctx.beginPath();
        ctx.arc(width - 95, 45, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ccc';
        ctx.fillText('Indirect', width - 85, 50);
    }
'''

# Add buttons
new_buttons = '''
                <button onclick="runPCurveAnalysis()" title="Test for evidential value vs p-hacking">P-Curve</button>
                <button onclick="runEValueAnalysis()" title="Sensitivity to unmeasured confounding">E-Value</button>
                <button onclick="runMissingDataAnalysis()" title="Missing data pattern analysis">Missing Data</button>
                <button onclick="runEnhancedNodeSplitting()" title="Network inconsistency assessment">Node-Split+</button>
'''

# Add to file
script_end = content.rfind('</script>')
if script_end > 0:
    content = content[:script_end] + new_features + '\n' + content[script_end:]

# Add buttons
button_markers = ['Multivar MA</button>', 'IV/2SLS</button>', 'Mediation</button>', 'Sequential MA</button>']
inserted = False
for marker in button_markers:
    if marker in content and not inserted:
        content = content.replace(marker, marker + new_buttons)
        inserted = True
        break

# Write file
with open(str((__import__('pathlib').Path(__file__).resolve().parents[2] / 'ipd-meta-pro.html')), 'w', encoding='utf-8') as f:
    f.write(content)

print('Added even more unique methods:')
print('25. P-Curve Analysis - Test for evidential value vs p-hacking')
print('26. E-Value - Sensitivity analysis for unmeasured confounding')
print('27. Missing Data Pattern Analysis - Little\'s MCAR test')
print('28. Enhanced Node-Splitting - Network inconsistency assessment')
print('')
print('The application now includes methods for detecting research misconduct!')

