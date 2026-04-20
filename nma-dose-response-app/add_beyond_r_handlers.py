import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add DOM references for Beyond R elements
dom_additions = '''
    bmaMCMC: document.getElementById("bmaMCMC"),
    runBMA: document.getElementById("runBMA"),
    exportPosteriors: document.getElementById("exportPosteriors"),
    bmaStatus: document.getElementById("bmaStatus"),
    targetEffectInput: document.getElementById("targetEffectInput"),
    safetyThreshold: document.getElementById("safetyThreshold"),
    findOptimalDose: document.getElementById("findOptimalDose"),
    findMED: document.getElementById("findMED"),
    optimalDoseResult: document.getElementById("optimalDoseResult"),
    runClustering: document.getElementById("runClustering"),
    detectOutliers: document.getElementById("detectOutliers"),
    featureImportance: document.getElementById("featureImportance"),
    goshSubsets: document.getElementById("goshSubsets"),
    runGOSH: document.getElementById("runGOSH"),
    studiesPerYear: document.getElementById("studiesPerYear"),
    simulationYears: document.getElementById("simulationYears"),
    runLivingReview: document.getElementById("runLivingReview"),
    findStability: document.getElementById("findStability"),
    livingReviewStatus: document.getElementById("livingReviewStatus"),
    componentList: document.getElementById("componentList"),
    runComponentNMA: document.getElementById("runComponentNMA"),
    targetPower: document.getElementById("targetPower"),
    expectedEffect: document.getElementById("expectedEffect"),
    calcSampleSize: document.getElementById("calcSampleSize"),
    suggestDesign: document.getElementById("suggestDesign"),
    powerResult: document.getElementById("powerResult"),'''

# Find where to add (after diagnosticPlotSelect)
pattern = r'(diagnosticPlotSelect: document\.getElementById\("diagnosticPlotSelect"\),)'
match = re.search(pattern, content)
if match:
    content = content[:match.end()] + '\n' + dom_additions + content[match.end():]
    print('Added Beyond R DOM references!')
else:
    print('Could not find diagnosticPlotSelect reference')

# 2. Add event handlers
handlers_code = '''
    // ========================================================================
    // BEYOND R EVENT HANDLERS
    // ========================================================================

    // Bayesian Model Averaging
    if (dom.runBMA) {
      dom.runBMA.addEventListener("click", () => {
        if (!state.parsedData || !state.lastStats?.length) {
          alert("Load data and run analysis first.");
          return;
        }
        dom.bmaStatus.textContent = "Running MCMC...";
        setTimeout(() => {
          try {
            const nIter = parseInt(dom.bmaMCMC?.value) || 5000;
            const models = [
              { type: "emax" },
              { type: "hill" },
              { type: "linear" },
              { type: "quadratic" }
            ];
            const data = {
              maxDose: Math.max(...state.parsedData.rows.map(r => r.dose))
            };
            const bma = new BayesianModelAveraging(models, data, { nIter });

            // Run MCMC for each model
            for (const model of models) {
              const likelihood = (params) => {
                let ll = 0;
                for (const row of state.parsedData.rows) {
                  const pred = bma.predictModel(model.type, params, row.dose);
                  const residual = row.effect - pred;
                  ll -= 0.5 * (residual * residual) / (row.se * row.se + (params.tau2 || 0.01));
                }
                return ll;
              };
              bma.posteriors[model.type] = bma.samplePosterior(model, likelihood);
            }

            const weights = bma.computeModelWeights();
            state.bmaResults = { bma, weights };

            let report = "Model Weights:\\n";
            for (const [type, w] of Object.entries(weights)) {
              report += `  ${type}: ${(w * 100).toFixed(1)}%\\n`;
            }
            dom.bmaStatus.textContent = report;
          } catch (e) {
            dom.bmaStatus.textContent = "BMA error: " + e.message;
          }
        }, 10);
      });
    }

    if (dom.exportPosteriors) {
      dom.exportPosteriors.addEventListener("click", () => {
        if (!state.bmaResults) {
          alert("Run BMA first.");
          return;
        }
        const doses = [];
        const maxDose = Math.max(...state.parsedData.rows.map(r => r.dose));
        for (let i = 0; i <= 50; i++) doses.push(maxDose * i / 50);

        const predictions = state.bmaResults.bma.predictWithUncertainty(doses);
        let csv = "dose,mean,median,ci_2.5,ci_97.5,ci_10,ci_90\\n";
        for (const p of predictions) {
          csv += `${p.dose.toFixed(3)},${p.mean.toFixed(4)},${p.median.toFixed(4)},${p.ci_2_5.toFixed(4)},${p.ci_97_5.toFixed(4)},${p.ci_10.toFixed(4)},${p.ci_90.toFixed(4)}\\n`;
        }

        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "bma_posteriors.csv";
        a.click();
        URL.revokeObjectURL(url);
        dom.exportStatus.textContent = "Exported BMA posteriors.";
      });
    }

    // Optimal Dose Finding
    if (dom.findOptimalDose) {
      dom.findOptimalDose.addEventListener("click", () => {
        if (!state.lastStats?.length) {
          alert("Run analysis first.");
          return;
        }
        const stat = state.lastStats[0];
        const maxDose = Math.max(...state.parsedData.rows.map(r => r.dose));
        const targetEffect = parseFloat(dom.targetEffectInput?.value) || null;
        const safetyThreshold = parseFloat(dom.safetyThreshold?.value) || null;

        const finder = new OptimalDoseFinder(stat.selectedModel || "emax", {
          e0: stat.e0 || 0,
          emax: stat.emax || 1,
          ed50: stat.ed50 || maxDose / 2,
          hill: stat.hill || 1,
          se: stat.pooledSE || 0.1
        }, {
          minDose: 0,
          maxDose,
          targetEffect,
          safetyThreshold
        });

        const result = finder.findOptimalDose();
        dom.optimalDoseResult.textContent =
          `Optimal dose: ${result.optimalDose?.toFixed(2)} (95% CI: ${result.prediction?.ci_2_5?.toFixed(2)} to ${result.prediction?.ci_97_5?.toFixed(2)})` +
          (result.riskProbability !== null ? ` | Risk: ${(result.riskProbability * 100).toFixed(1)}%` : "");
      });
    }

    if (dom.findMED) {
      dom.findMED.addEventListener("click", () => {
        if (!state.lastStats?.length) {
          alert("Run analysis first.");
          return;
        }
        const minEffect = parseFloat(dom.targetEffectInput?.value) || 0.2;
        const stat = state.lastStats[0];
        const maxDose = Math.max(...state.parsedData.rows.map(r => r.dose));

        const finder = new OptimalDoseFinder(stat.selectedModel || "emax", {
          e0: stat.e0 || 0,
          emax: stat.emax || 1,
          ed50: stat.ed50 || maxDose / 2,
          hill: stat.hill || 1,
          se: stat.pooledSE || 0.1
        }, { minDose: 0, maxDose });

        const result = finder.findMED(minEffect);
        dom.optimalDoseResult.textContent =
          `MED (effect >= ${minEffect}): ${result.med?.toFixed(2)} (95% CI: ${result.prediction?.ci_2_5?.toFixed(2)} to ${result.prediction?.ci_97_5?.toFixed(2)})`;
      });
    }

    // Heterogeneity Detection
    if (dom.runClustering) {
      dom.runClustering.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }
        const detector = new HeterogeneityDetector(state.parsedData.rows);
        const result = detector.clusterStudies(3);

        let report = "# Study Clusters\\n\\n";
        for (const cluster of result.clusters) {
          report += `## Cluster ${cluster.id + 1} (n=${cluster.n})\\n`;
          report += `Mean effect: ${cluster.meanEffect.toFixed(3)} (SD: ${cluster.sdEffect.toFixed(3)})\\n`;
          report += `Mean dose: ${cluster.meanDose.toFixed(1)}\\n`;
          report += `Characteristics: ${cluster.characteristics.join(", ")}\\n`;
          report += `Studies: ${cluster.studies.join(", ")}\\n\\n`;
        }

        const blob = new Blob([report], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "study_clusters.md";
        a.click();
        URL.revokeObjectURL(url);
        dom.exportStatus.textContent = "Exported study clusters.";
      });
    }

    if (dom.detectOutliers) {
      dom.detectOutliers.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length || !state.lastStats?.length) {
          alert("Run analysis first.");
          return;
        }
        const detector = new HeterogeneityDetector(state.parsedData.rows);
        const pooledEffect = state.lastStats[0].pooledEffect || 0;
        const tau2 = state.lastStats[0].tau2 || 0;
        const outliers = detector.detectOutliers(pooledEffect, tau2);

        if (outliers.length === 0) {
          alert("No outliers detected.");
          return;
        }

        let report = "# Outlier Detection Results\\n\\n";
        report += "| Study | Effect | Std Residual | Influence | Reason |\\n";
        report += "|-------|--------|--------------|-----------|--------|\\n";
        for (const o of outliers) {
          report += `| ${o.study} | ${o.effect.toFixed(3)} | ${o.stdResidual.toFixed(2)} | ${o.influence.toFixed(4)} | ${o.reason} |\\n`;
        }

        const blob = new Blob([report], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "outlier_detection.md";
        a.click();
        URL.revokeObjectURL(url);
        dom.exportStatus.textContent = `Detected ${outliers.length} potential outliers.`;
      });
    }

    // GOSH Analysis
    if (dom.runGOSH) {
      dom.runGOSH.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }
        const nSubsets = parseInt(dom.goshSubsets?.value) || 1000;
        dom.exportStatus.textContent = "Running GOSH analysis...";

        setTimeout(() => {
          const gosh = new GOSHAnalysis(state.parsedData.rows, { nSubsets });
          const result = gosh.run();

          let report = "# GOSH Analysis Results\\n\\n";
          report += `## Summary (${result.subsets.length} subsets)\\n\\n`;
          report += `Effect range: [${result.summary.effectRange[0].toFixed(3)}, ${result.summary.effectRange[1].toFixed(3)}]\\n`;
          report += `Effect mean: ${result.summary.effectMean.toFixed(3)} (SD: ${result.summary.effectSD.toFixed(3)})\\n`;
          report += `I² range: [${result.summary.I2Range[0].toFixed(1)}%, ${result.summary.I2Range[1].toFixed(1)}%]\\n`;
          report += `I² mean: ${result.summary.I2Mean.toFixed(1)}%\\n\\n`;

          if (result.outlierCandidates.length > 0) {
            report += "## Outlier Candidates\\n\\n";
            report += "| Study | I² when included | I² when excluded | Impact |\\n";
            report += "|-------|------------------|------------------|--------|\\n";
            for (const c of result.outlierCandidates) {
              report += `| ${c.study} | ${c.I2WhenIncluded.toFixed(1)}% | ${c.I2WhenExcluded.toFixed(1)}% | +${c.impact.toFixed(1)}% |\\n`;
            }
          }

          const blob = new Blob([report], { type: "text/markdown" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "gosh_analysis.md";
          a.click();
          URL.revokeObjectURL(url);
          dom.exportStatus.textContent = `GOSH complete: ${result.outlierCandidates.length} outlier candidates.`;
        }, 10);
      });
    }

    // Living Review Simulation
    if (dom.runLivingReview) {
      dom.runLivingReview.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }
        const studiesPerYear = parseInt(dom.studiesPerYear?.value) || 3;
        const years = parseInt(dom.simulationYears?.value) || 5;

        dom.livingReviewStatus.textContent = "Simulating...";
        setTimeout(() => {
          const simulator = new LivingReviewSimulator(state.parsedData.rows, {
            studiesPerYear,
            years
          });
          const result = simulator.simulate(100);

          let report = "# Living Review Simulation\\n\\n";
          report += `Simulated ${years} years with ~${studiesPerYear} studies/year\\n\\n`;
          report += "| Year | Studies | Effect | 95% CI Width | CI Reduction |\\n";
          report += "|------|---------|--------|--------------|--------------|\\n";
          for (const s of result.summary) {
            report += `| ${s.year} | ${s.nStudies} | ${s.effectMean.toFixed(3)} | ${s.ciWidthMean.toFixed(3)} | ${(s.ciWidthReduction * 100).toFixed(1)}% |\\n`;
          }

          const blob = new Blob([report], { type: "text/markdown" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "living_review_simulation.md";
          a.click();
          URL.revokeObjectURL(url);
          dom.livingReviewStatus.textContent = `Simulated ${years} years of evidence accumulation.`;
        }, 10);
      });
    }

    if (dom.findStability) {
      dom.findStability.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }
        const studiesPerYear = parseInt(dom.studiesPerYear?.value) || 3;

        const simulator = new LivingReviewSimulator(state.parsedData.rows, {
          studiesPerYear,
          years: 10
        });
        const stability = simulator.estimateStabilityPoint();
        dom.livingReviewStatus.textContent = stability.message;
      });
    }

    // Component NMA
    if (dom.runComponentNMA) {
      dom.runComponentNMA.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }
        const componentStr = dom.componentList?.value || "";
        if (!componentStr.trim()) {
          alert("Enter component names (comma-separated).");
          return;
        }
        const components = componentStr.split(",").map(c => c.trim());

        try {
          const cnma = new ComponentNMA(state.parsedData.rows, components);
          const effects = cnma.estimateComponentEffects();

          let report = "# Component NMA Results\\n\\n";
          report += "| Component | Effect | SE | 95% CI | p-value |\\n";
          report += "|-----------|--------|-----|--------|---------|\\n";
          for (const e of effects) {
            report += `| ${e.component} | ${e.effect.toFixed(3)} | ${e.se.toFixed(3)} | [${e.ci_lower.toFixed(3)}, ${e.ci_upper.toFixed(3)}] | ${e.pValue.toFixed(4)} |\\n`;
          }

          const blob = new Blob([report], { type: "text/markdown" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "component_nma.md";
          a.click();
          URL.revokeObjectURL(url);
          dom.exportStatus.textContent = "Exported component NMA results.";
        } catch (e) {
          alert("Component NMA error: " + e.message);
        }
      });
    }

    // Power Analysis
    if (dom.calcSampleSize) {
      dom.calcSampleSize.addEventListener("click", () => {
        const power = parseFloat(dom.targetPower?.value) || 0.8;
        const effect = parseFloat(dom.expectedEffect?.value);
        if (!effect || isNaN(effect)) {
          alert("Enter expected effect size.");
          return;
        }
        const se = state.lastStats?.[0]?.pooledSE || 0.2;
        const tau2 = state.lastStats?.[0]?.tau2 || 0.05;

        const calc = new NMAPowerCalculator({ power, tau2 });
        const result = calc.calculateSampleSize(effect, se);

        dom.powerResult.textContent = `Required: ${result.perArm} per arm (${result.total} total) for ${(power * 100).toFixed(0)}% power`;
      });
    }

    if (dom.suggestDesign) {
      dom.suggestDesign.addEventListener("click", () => {
        if (!state.parsedData?.treatments?.length) {
          alert("Load data first.");
          return;
        }
        const treatments = state.parsedData.treatments;
        const budget = 10; // Example: 10 studies budget

        const calc = new NMAPowerCalculator({});
        const design = calc.suggestOptimalDesign(treatments, budget * 50000, 50000);

        let report = "# NMA Design Recommendations\\n\\n";
        report += `Treatments: ${design.treatments}\\n`;
        report += `Possible comparisons: ${design.possibleComparisons}\\n`;
        report += `Budget allows: ${design.maxStudies} studies\\n\\n`;
        report += "## Recommended Design\\n\\n";
        report += `Type: ${design.recommendedDesign.type}\\n`;
        report += `Studies: ${design.recommendedDesign.nStudies}\\n`;
        report += `Direct comparisons: ${design.recommendedDesign.directComparisons}\\n`;
        report += `Efficiency: ${(design.recommendedDesign.efficiency * 100).toFixed(0)}%\\n`;

        const blob = new Blob([report], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "nma_design.md";
        a.click();
        URL.revokeObjectURL(url);
        dom.powerResult.textContent = `Recommended: ${design.recommendedDesign.type} network`;
      });
    }
'''

# Find where to add (after diagnosticPlotSelect handler)
pattern = r'(if \(dom\.showPredictionInterval\) \{[^}]+\}[^}]+\})'
match = re.search(pattern, content)
if match:
    content = content[:match.end()] + '\n' + handlers_code + content[match.end():]
    print('Added Beyond R event handlers!')
else:
    print('Could not find showPredictionInterval handler, trying alternative...')
    # Try after diagnosticPlotSelect handler
    pattern2 = r'(if \(dom\.diagnosticPlotSelect\) \{[^}]+\}[^}]+\})'
    match2 = re.search(pattern2, content)
    if match2:
        content = content[:match2.end()] + '\n' + handlers_code + content[match2.end():]
        print('Added Beyond R event handlers (alternative)!')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done!')
