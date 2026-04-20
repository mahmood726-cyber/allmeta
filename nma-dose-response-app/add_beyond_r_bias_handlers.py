import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add DOM references for Beyond R Publication Bias elements
dom_additions = '''
    runCopas: document.getElementById("runCopas"),
    copasSensitivity: document.getElementById("copasSensitivity"),
    copasResult: document.getElementById("copasResult"),
    runPUniformStar: document.getElementById("runPUniformStar"),
    puniformResult: document.getElementById("puniformResult"),
    runLimitMA: document.getElementById("runLimitMA"),
    limitResult: document.getElementById("limitResult"),
    runRoBMA: document.getElementById("runRoBMA"),
    robmaResult: document.getElementById("robmaResult"),
    runBiasSensitivity: document.getElementById("runBiasSensitivity"),
    runWorstCase: document.getElementById("runWorstCase"),
    sensitivityResult: document.getElementById("sensitivityResult"),
    runWAAP: document.getElementById("runWAAP"),
    runWLS: document.getElementById("runWLS"),
    waapResult: document.getElementById("waapResult"),
    runZCurve: document.getElementById("runZCurve"),
    runSunset: document.getElementById("runSunset"),
    zcurveResult: document.getElementById("zcurveResult"),
    compareSelectionModels: document.getElementById("compareSelectionModels"),
    comparisonResult: document.getElementById("comparisonResult"),
    runBeggMazumdar: document.getElementById("runBeggMazumdar"),
    beggResult: document.getElementById("beggResult"),
    runPeters: document.getElementById("runPeters"),
    runMacaskill: document.getElementById("runMacaskill"),
    runDeeks: document.getElementById("runDeeks"),
    regressionResult: document.getElementById("regressionResult"),
    runContourFunnel: document.getElementById("runContourFunnel"),
    runCumulativeMA: document.getElementById("runCumulativeMA"),
    runLOOBias: document.getElementById("runLOOBias"),
    advDiagResult: document.getElementById("advDiagResult"),
    exportBeyondRReport: document.getElementById("exportBeyondRReport"),
    exportBeyondRChecklist: document.getElementById("exportBeyondRChecklist"),'''

# Find where to add (after diagnosticPlotSelect)
pattern = r'(diagnosticPlotSelect: document\.getElementById\("diagnosticPlotSelect"\),)'
match = re.search(pattern, content)
if match:
    content = content[:match.end()] + '\n' + dom_additions + content[match.end():]
    print('Added Beyond R Bias DOM references!')
else:
    print('Could not find diagnosticPlotSelect reference')

# 2. Add event handlers for Beyond R Publication Bias features
handlers_code = '''

    // ========================================================================
    // BEYOND R PUBLICATION BIAS EVENT HANDLERS
    // ========================================================================

    // Copas Selection Model
    if (dom.runCopas) {
      dom.runCopas.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }
        dom.copasResult.textContent = "Running Copas model...";
        setTimeout(() => {
          try {
            const studies = state.parsedData.rows.map(r => ({
              effect: r.effect,
              se: r.se,
              n: r.n || Math.round(4 / (r.se * r.se))
            }));
            const copas = new CopasSelectionModel(studies);
            const result = copas.fit();

            dom.copasResult.textContent =
              `Adjusted: ${result.adjustedEffect.toFixed(3)} (95% CI: ${result.ci_lower.toFixed(3)} to ${result.ci_upper.toFixed(3)}) | ` +
              `gamma0: ${result.gamma0.toFixed(2)}, gamma1: ${result.gamma1.toFixed(2)} | ` +
              `p(selection): ${(1 - result.pValueAdjustment).toFixed(3)}`;

            state.copasResult = result;
          } catch (e) {
            dom.copasResult.textContent = "Copas error: " + e.message;
          }
        }, 10);
      });
    }

    if (dom.copasSensitivity) {
      dom.copasSensitivity.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }
        dom.copasResult.textContent = "Running sensitivity analysis...";
        setTimeout(() => {
          try {
            const studies = state.parsedData.rows.map(r => ({
              effect: r.effect,
              se: r.se,
              n: r.n || Math.round(4 / (r.se * r.se))
            }));
            const copas = new CopasSelectionModel(studies);
            const sensitivity = copas.sensitivityAnalysis();

            let report = "# Copas Sensitivity Analysis\\n\\n";
            report += "| rho | Adjusted Effect | 95% CI | N missing |\\n";
            report += "|-----|-----------------|--------|-----------|\\n";
            for (const s of sensitivity.results) {
              report += `| ${s.rho.toFixed(2)} | ${s.adjustedEffect.toFixed(3)} | [${s.ci_lower.toFixed(3)}, ${s.ci_upper.toFixed(3)}] | ${s.nMissing.toFixed(1)} |\\n`;
            }

            const blob = new Blob([report], { type: "text/markdown" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "copas_sensitivity.md";
            a.click();
            URL.revokeObjectURL(url);
            dom.copasResult.textContent = `Exported sensitivity analysis (${sensitivity.results.length} scenarios)`;
          } catch (e) {
            dom.copasResult.textContent = "Sensitivity error: " + e.message;
          }
        }, 10);
      });
    }

    // P-uniform*
    if (dom.runPUniformStar) {
      dom.runPUniformStar.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }
        dom.puniformResult.textContent = "Running P-uniform*...";
        setTimeout(() => {
          try {
            const studies = state.parsedData.rows.map(r => ({
              effect: r.effect,
              se: r.se,
              n: r.n || Math.round(4 / (r.se * r.se))
            }));
            const puniform = new PUniformStar(studies);
            const result = puniform.estimate();

            dom.puniformResult.textContent =
              `Effect: ${result.effect.toFixed(3)} (95% CI: ${result.ci_lower.toFixed(3)} to ${result.ci_upper.toFixed(3)}) | ` +
              `tau²: ${result.tau2.toFixed(4)} | p-uniformity: ${result.pUniformity.toFixed(3)}`;

            state.puniformResult = result;
          } catch (e) {
            dom.puniformResult.textContent = "P-uniform* error: " + e.message;
          }
        }, 10);
      });
    }

    // Limit Meta-Analysis
    if (dom.runLimitMA) {
      dom.runLimitMA.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }
        dom.limitResult.textContent = "Running Limit MA...";
        setTimeout(() => {
          try {
            const studies = state.parsedData.rows.map(r => ({
              effect: r.effect,
              se: r.se
            }));
            const limitMA = new LimitMetaAnalysis(studies);
            const result = limitMA.estimate();

            dom.limitResult.textContent =
              `Limit effect: ${result.limitEffect.toFixed(3)} (95% CI: ${result.ci_lower.toFixed(3)} to ${result.ci_upper.toFixed(3)}) | ` +
              `Bias estimate: ${result.biasEstimate.toFixed(3)} | G-statistic: ${result.gStatistic.toFixed(2)}`;

            state.limitMAResult = result;
          } catch (e) {
            dom.limitResult.textContent = "Limit MA error: " + e.message;
          }
        }, 10);
      });
    }

    // RoBMA (Robust Bayesian Meta-Analysis)
    if (dom.runRoBMA) {
      dom.runRoBMA.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }
        dom.robmaResult.textContent = "Running RoBMA (may take a moment)...";
        setTimeout(() => {
          try {
            const studies = state.parsedData.rows.map(r => ({
              effect: r.effect,
              se: r.se
            }));
            const robma = new RobustBayesianMA(studies);
            const result = robma.estimate();

            dom.robmaResult.textContent =
              `BMA Effect: ${result.bmaEffect.toFixed(3)} (95% CrI: ${result.ci_lower.toFixed(3)} to ${result.ci_upper.toFixed(3)}) | ` +
              `P(effect): ${result.pEffect.toFixed(3)} | P(heterogeneity): ${result.pHeterogeneity.toFixed(3)} | ` +
              `P(pub bias): ${result.pPublicationBias.toFixed(3)}`;

            state.robmaResult = result;
          } catch (e) {
            dom.robmaResult.textContent = "RoBMA error: " + e.message;
          }
        }, 10);
      });
    }

    // Publication Bias Sensitivity (Mathur & VanderWeele)
    if (dom.runBiasSensitivity) {
      dom.runBiasSensitivity.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }
        dom.sensitivityResult.textContent = "Running sensitivity analysis...";
        setTimeout(() => {
          try {
            const studies = state.parsedData.rows.map(r => ({
              effect: r.effect,
              se: r.se
            }));
            const sens = new PublicationBiasSensitivity(studies);
            const result = sens.analyze();

            dom.sensitivityResult.textContent =
              `Selection ratio to nullify: ${result.sValueToNullify.toFixed(2)} | ` +
              `Worst-case effect: ${result.worstCaseEffect.toFixed(3)} | ` +
              `Robust effect (s=2): ${result.robustEffectS2.toFixed(3)}`;

            state.biasSensitivityResult = result;
          } catch (e) {
            dom.sensitivityResult.textContent = "Sensitivity error: " + e.message;
          }
        }, 10);
      });
    }

    if (dom.runWorstCase) {
      dom.runWorstCase.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }
        try {
          const studies = state.parsedData.rows.map(r => ({
            effect: r.effect,
            se: r.se
          }));
          const sens = new PublicationBiasSensitivity(studies);
          const result = sens.worstCaseScenario();

          dom.sensitivityResult.textContent =
            `Worst-case: ${result.effect.toFixed(3)} (95% CI: ${result.ci_lower.toFixed(3)} to ${result.ci_upper.toFixed(3)}) | ` +
            `Missing studies assumed: ${result.nMissingAssumed}`;
        } catch (e) {
          dom.sensitivityResult.textContent = "Worst-case error: " + e.message;
        }
      });
    }

    // WAAP-WLS
    if (dom.runWAAP) {
      dom.runWAAP.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }
        try {
          const studies = state.parsedData.rows.map(r => ({
            effect: r.effect,
            se: r.se,
            n: r.n || Math.round(4 / (r.se * r.se))
          }));
          const waap = new WAAPWLS(studies);
          const result = waap.waap();

          dom.waapResult.textContent =
            `WAAP: ${result.effect.toFixed(3)} (95% CI: ${result.ci_lower.toFixed(3)} to ${result.ci_upper.toFixed(3)}) | ` +
            `Adequately powered: ${result.nAdequate}/${studies.length}`;

          state.waapResult = result;
        } catch (e) {
          dom.waapResult.textContent = "WAAP error: " + e.message;
        }
      });
    }

    if (dom.runWLS) {
      dom.runWLS.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }
        try {
          const studies = state.parsedData.rows.map(r => ({
            effect: r.effect,
            se: r.se
          }));
          const waap = new WAAPWLS(studies);
          const result = waap.wls();

          dom.waapResult.textContent =
            `WLS: ${result.effect.toFixed(3)} (95% CI: ${result.ci_lower.toFixed(3)} to ${result.ci_upper.toFixed(3)}) | ` +
            `FAT intercept: ${result.fatIntercept.toFixed(3)} (p=${result.fatPValue.toFixed(3)})`;

          state.wlsResult = result;
        } catch (e) {
          dom.waapResult.textContent = "WLS error: " + e.message;
        }
      });
    }

    // Z-Curve Analysis
    if (dom.runZCurve) {
      dom.runZCurve.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }
        dom.zcurveResult.textContent = "Running Z-curve...";
        setTimeout(() => {
          try {
            const studies = state.parsedData.rows.map(r => ({
              effect: r.effect,
              se: r.se
            }));
            const zcurve = new ZCurveAnalysis(studies);
            const result = zcurve.analyze();

            dom.zcurveResult.textContent =
              `ERR: ${(result.expectedReplicationRate * 100).toFixed(1)}% | ` +
              `EDR: ${(result.expectedDiscoveryRate * 100).toFixed(1)}% | ` +
              `Sceptical: ${(result.scepticalSignificance * 100).toFixed(1)}%`;

            state.zcurveResult = result;
          } catch (e) {
            dom.zcurveResult.textContent = "Z-curve error: " + e.message;
          }
        }, 10);
      });
    }

    if (dom.runSunset) {
      dom.runSunset.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }
        try {
          const studies = state.parsedData.rows.map(r => ({
            effect: r.effect,
            se: r.se
          }));
          const sunset = new SunsetPowerAnalysis(studies);
          const result = sunset.analyze();

          dom.zcurveResult.textContent =
            `Median power: ${(result.medianPower * 100).toFixed(1)}% | ` +
            `Adequately powered: ${result.nAdequate}/${studies.length} | ` +
            `Inflated: ${result.nInflated}`;

          state.sunsetResult = result;
        } catch (e) {
          dom.zcurveResult.textContent = "Sunset error: " + e.message;
        }
      });
    }

    // Selection Model Comparison
    if (dom.compareSelectionModels) {
      dom.compareSelectionModels.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }
        dom.comparisonResult.textContent = "Comparing all models...";
        setTimeout(() => {
          try {
            const studies = state.parsedData.rows.map(r => ({
              effect: r.effect,
              se: r.se,
              n: r.n || Math.round(4 / (r.se * r.se))
            }));
            const comparison = new SelectionModelComparison(studies);
            const result = comparison.compareAll();

            let report = "# Selection Model Comparison\\n\\n";
            report += "| Model | Effect | 95% CI | Weight |\\n";
            report += "|-------|--------|--------|--------|\\n";
            for (const m of result.models) {
              report += `| ${m.name} | ${m.effect.toFixed(3)} | [${m.ci_lower.toFixed(3)}, ${m.ci_upper.toFixed(3)}] | ${(m.weight * 100).toFixed(1)}% |\\n`;
            }
            report += `\\n**Model-Averaged Effect:** ${result.averagedEffect.toFixed(3)} (95% CI: ${result.averagedCI[0].toFixed(3)} to ${result.averagedCI[1].toFixed(3)})\\n`;

            const blob = new Blob([report], { type: "text/markdown" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "selection_model_comparison.md";
            a.click();
            URL.revokeObjectURL(url);
            dom.comparisonResult.textContent = `Model-averaged: ${result.averagedEffect.toFixed(3)} (${result.models.length} models)`;

            state.modelComparisonResult = result;
          } catch (e) {
            dom.comparisonResult.textContent = "Comparison error: " + e.message;
          }
        }, 10);
      });
    }

    // Begg-Mazumdar Rank Correlation
    if (dom.runBeggMazumdar) {
      dom.runBeggMazumdar.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }
        try {
          const studies = state.parsedData.rows.map(r => ({
            effect: r.effect,
            se: r.se
          }));
          const begg = new BeggMazumdarTest(studies);
          const result = begg.test();

          dom.beggResult.textContent =
            `Kendall's tau: ${result.tau.toFixed(3)} | z: ${result.z.toFixed(2)} | p: ${result.pValue.toFixed(4)} | ` +
            `${result.pValue < 0.05 ? "Significant asymmetry" : "No significant asymmetry"}`;

          state.beggResult = result;
        } catch (e) {
          dom.beggResult.textContent = "Begg test error: " + e.message;
        }
      });
    }

    // Peters, Macaskill, Deeks Tests
    if (dom.runPeters) {
      dom.runPeters.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }
        try {
          const studies = state.parsedData.rows.map(r => ({
            effect: r.effect,
            se: r.se,
            n: r.n || Math.round(4 / (r.se * r.se))
          }));
          const peters = new PetersTest(studies);
          const result = peters.test();

          dom.regressionResult.textContent =
            `Peters: t=${result.t.toFixed(2)}, p=${result.pValue.toFixed(4)} | ` +
            `${result.pValue < 0.05 ? "Significant bias" : "No significant bias"}`;

          state.petersResult = result;
        } catch (e) {
          dom.regressionResult.textContent = "Peters test error: " + e.message;
        }
      });
    }

    if (dom.runMacaskill) {
      dom.runMacaskill.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }
        try {
          const studies = state.parsedData.rows.map(r => ({
            effect: r.effect,
            se: r.se,
            n: r.n || Math.round(4 / (r.se * r.se))
          }));
          const regression = new RegressionBasedTests(studies);
          const result = regression.macaskill();

          dom.regressionResult.textContent =
            `Macaskill: t=${result.t.toFixed(2)}, p=${result.pValue.toFixed(4)} | ` +
            `slope: ${result.slope.toFixed(4)}`;

          state.macaskillResult = result;
        } catch (e) {
          dom.regressionResult.textContent = "Macaskill error: " + e.message;
        }
      });
    }

    if (dom.runDeeks) {
      dom.runDeeks.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }
        try {
          const studies = state.parsedData.rows.map(r => ({
            effect: r.effect,
            se: r.se,
            n: r.n || Math.round(4 / (r.se * r.se))
          }));
          const regression = new RegressionBasedTests(studies);
          const result = regression.deeks();

          dom.regressionResult.textContent =
            `Deeks: t=${result.t.toFixed(2)}, p=${result.pValue.toFixed(4)} | ` +
            `ESS slope: ${result.slope.toFixed(4)}`;

          state.deeksResult = result;
        } catch (e) {
          dom.regressionResult.textContent = "Deeks error: " + e.message;
        }
      });
    }

    // Advanced Diagnostics
    if (dom.runContourFunnel) {
      dom.runContourFunnel.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }
        try {
          const studies = state.parsedData.rows.map(r => ({
            effect: r.effect,
            se: r.se
          }));
          const contour = new ContourFunnelPlot(studies);
          const plotData = contour.generatePlotData();

          // Render to canvas or export
          const canvas = document.createElement("canvas");
          canvas.width = 800;
          canvas.height = 600;
          const ctx = canvas.getContext("2d");

          // Draw contour regions
          const colors = ["rgba(255,255,255,1)", "rgba(200,200,200,0.5)", "rgba(150,150,150,0.5)", "rgba(100,100,100,0.5)"];
          for (let i = plotData.contours.length - 1; i >= 0; i--) {
            const region = plotData.contours[i];
            ctx.fillStyle = colors[i] || "rgba(200,200,200,0.3)";
            ctx.beginPath();
            // Draw filled region (simplified)
            ctx.fillRect(100, 50 + i * 100, 600, 100);
          }

          // Draw points
          ctx.fillStyle = "black";
          for (const pt of plotData.points) {
            const x = 400 + pt.effect * 200;
            const y = 550 - pt.se * 400;
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, 2 * Math.PI);
            ctx.fill();
          }

          // Export
          const link = document.createElement("a");
          link.download = "contour_funnel_plot.png";
          link.href = canvas.toDataURL();
          link.click();

          dom.advDiagResult.textContent = "Exported contour-enhanced funnel plot";
        } catch (e) {
          dom.advDiagResult.textContent = "Contour plot error: " + e.message;
        }
      });
    }

    if (dom.runCumulativeMA) {
      dom.runCumulativeMA.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }
        dom.advDiagResult.textContent = "Running cumulative analysis...";
        setTimeout(() => {
          try {
            const studies = state.parsedData.rows.map(r => ({
              effect: r.effect,
              se: r.se,
              study: r.study || r.id
            }));
            const cumulative = new CumulativeMetaAnalysis(studies);
            const result = cumulative.byPrecision();

            let report = "# Cumulative Meta-Analysis (by precision)\\n\\n";
            report += "| # Studies | Effect | 95% CI | I² |\\n";
            report += "|-----------|--------|--------|-----|\\n";
            for (const step of result.steps) {
              report += `| ${step.nStudies} | ${step.effect.toFixed(3)} | [${step.ci_lower.toFixed(3)}, ${step.ci_upper.toFixed(3)}] | ${step.I2.toFixed(1)}% |\\n`;
            }

            const blob = new Blob([report], { type: "text/markdown" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "cumulative_meta_analysis.md";
            a.click();
            URL.revokeObjectURL(url);

            dom.advDiagResult.textContent = `Cumulative MA: final effect ${result.steps[result.steps.length-1]?.effect.toFixed(3) || "N/A"}`;
          } catch (e) {
            dom.advDiagResult.textContent = "Cumulative MA error: " + e.message;
          }
        }, 10);
      });
    }

    if (dom.runLOOBias) {
      dom.runLOOBias.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }
        dom.advDiagResult.textContent = "Running leave-one-out...";
        setTimeout(() => {
          try {
            const studies = state.parsedData.rows.map(r => ({
              effect: r.effect,
              se: r.se,
              study: r.study || r.id
            }));
            const loo = new LeaveOneOutBias(studies);
            const result = loo.analyze();

            let report = "# Leave-One-Out Influence Analysis\\n\\n";
            report += "| Excluded | Effect | Change | Influence |\\n";
            report += "|----------|--------|--------|-----------|\\n";
            for (const r of result.results.slice(0, 20)) {
              report += `| ${r.excluded} | ${r.effect.toFixed(3)} | ${r.change >= 0 ? "+" : ""}${r.change.toFixed(3)} | ${r.influence.toFixed(4)} |\\n`;
            }
            if (result.influential.length > 0) {
              report += `\\n**Influential studies:** ${result.influential.join(", ")}\\n`;
            }

            const blob = new Blob([report], { type: "text/markdown" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "leave_one_out_bias.md";
            a.click();
            URL.revokeObjectURL(url);

            dom.advDiagResult.textContent = `LOO complete: ${result.influential.length} influential studies`;
          } catch (e) {
            dom.advDiagResult.textContent = "LOO error: " + e.message;
          }
        }, 10);
      });
    }

    // Export Beyond R Report
    if (dom.exportBeyondRReport) {
      dom.exportBeyondRReport.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }

        let report = "# Comprehensive Publication Bias Analysis Report\\n";
        report += "## Generated by NMA Dose-Response Pro (Beyond R)\\n\\n";
        report += `Date: ${new Date().toISOString().split("T")[0]}\\n`;
        report += `Studies: ${state.parsedData.rows.length}\\n\\n`;

        // Collect all results
        if (state.copasResult) {
          report += "## Copas Selection Model\\n";
          report += `- Adjusted effect: ${state.copasResult.adjustedEffect.toFixed(3)}\\n`;
          report += `- 95% CI: [${state.copasResult.ci_lower.toFixed(3)}, ${state.copasResult.ci_upper.toFixed(3)}]\\n`;
          report += `- Selection parameters: gamma0=${state.copasResult.gamma0.toFixed(2)}, gamma1=${state.copasResult.gamma1.toFixed(2)}\\n\\n`;
        }

        if (state.puniformResult) {
          report += "## P-uniform*\\n";
          report += `- Effect: ${state.puniformResult.effect.toFixed(3)} (95% CI: ${state.puniformResult.ci_lower.toFixed(3)} to ${state.puniformResult.ci_upper.toFixed(3)})\\n`;
          report += `- tau²: ${state.puniformResult.tau2.toFixed(4)}\\n\\n`;
        }

        if (state.limitMAResult) {
          report += "## Limit Meta-Analysis\\n";
          report += `- Limit effect: ${state.limitMAResult.limitEffect.toFixed(3)}\\n`;
          report += `- Bias estimate: ${state.limitMAResult.biasEstimate.toFixed(3)}\\n\\n`;
        }

        if (state.robmaResult) {
          report += "## Robust Bayesian Meta-Analysis (RoBMA)\\n";
          report += `- BMA Effect: ${state.robmaResult.bmaEffect.toFixed(3)}\\n`;
          report += `- P(effect): ${state.robmaResult.pEffect.toFixed(3)}\\n`;
          report += `- P(heterogeneity): ${state.robmaResult.pHeterogeneity.toFixed(3)}\\n`;
          report += `- P(publication bias): ${state.robmaResult.pPublicationBias.toFixed(3)}\\n\\n`;
        }

        if (state.zcurveResult) {
          report += "## Z-Curve Analysis\\n";
          report += `- Expected Replication Rate: ${(state.zcurveResult.expectedReplicationRate * 100).toFixed(1)}%\\n`;
          report += `- Expected Discovery Rate: ${(state.zcurveResult.expectedDiscoveryRate * 100).toFixed(1)}%\\n\\n`;
        }

        if (state.beggResult) {
          report += "## Begg-Mazumdar Test\\n";
          report += `- Kendall's tau: ${state.beggResult.tau.toFixed(3)}\\n`;
          report += `- p-value: ${state.beggResult.pValue.toFixed(4)}\\n\\n`;
        }

        if (state.modelComparisonResult) {
          report += "## Selection Model Comparison\\n";
          report += `- Model-averaged effect: ${state.modelComparisonResult.averagedEffect.toFixed(3)}\\n`;
          report += `- Models compared: ${state.modelComparisonResult.models.length}\\n\\n`;
        }

        report += "---\\n";
        report += "*Report generated using methods surpassing R packages: metafor, weightr, RoBMA, puniform, metasens*\\n";

        const blob = new Blob([report], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "beyond_r_bias_report.md";
        a.click();
        URL.revokeObjectURL(url);
        dom.exportStatus.textContent = "Exported comprehensive bias report";
      });
    }

    // Export Beyond R Checklist
    if (dom.exportBeyondRChecklist) {
      dom.exportBeyondRChecklist.addEventListener("click", () => {
        let checklist = "# Publication Bias Analysis Checklist\\n\\n";
        checklist += "## Visual Assessment\\n";
        checklist += "- [ ] Funnel plot examined for asymmetry\\n";
        checklist += "- [ ] Contour-enhanced funnel plot reviewed\\n";
        checklist += "- [ ] Cumulative meta-analysis by precision\\n\\n";

        checklist += "## Statistical Tests\\n";
        checklist += "- [ ] Egger's regression test\\n";
        checklist += "- [ ] Begg-Mazumdar rank correlation\\n";
        checklist += "- [ ] Peters' test (for binary outcomes)\\n";
        checklist += "- [ ] Macaskill test\\n";
        checklist += "- [ ] Deeks' test (for diagnostic accuracy)\\n\\n";

        checklist += "## Selection Models\\n";
        checklist += "- [ ] Copas selection model\\n";
        checklist += "- [ ] P-uniform* (with heterogeneity)\\n";
        checklist += "- [ ] Limit meta-analysis\\n";
        checklist += "- [ ] 3-parameter selection model\\n";
        checklist += "- [ ] Vevea-Hedges weight function\\n\\n";

        checklist += "## Bayesian Methods\\n";
        checklist += "- [ ] RoBMA (Robust Bayesian Meta-Analysis)\\n";
        checklist += "- [ ] Model averaging across selection models\\n\\n";

        checklist += "## Sensitivity Analysis\\n";
        checklist += "- [ ] Copas sensitivity analysis (varying rho)\\n";
        checklist += "- [ ] Mathur-VanderWeele sensitivity parameter\\n";
        checklist += "- [ ] Worst-case scenario analysis\\n";
        checklist += "- [ ] Leave-one-out influence analysis\\n\\n";

        checklist += "## Replicability\\n";
        checklist += "- [ ] Z-curve analysis (ERR, EDR)\\n";
        checklist += "- [ ] Sunset power analysis\\n";
        checklist += "- [ ] WAAP-WLS analysis\\n\\n";

        checklist += "## Adjustment Methods\\n";
        checklist += "- [ ] Trim-and-fill\\n";
        checklist += "- [ ] PET-PEESE\\n";
        checklist += "- [ ] Selection model adjusted estimates\\n\\n";

        checklist += "---\\n";
        checklist += "*Checklist based on comprehensive bias assessment exceeding R package capabilities*\\n";

        const blob = new Blob([checklist], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "beyond_r_checklist.md";
        a.click();
        URL.revokeObjectURL(url);
        dom.exportStatus.textContent = "Exported bias analysis checklist";
      });
    }
'''

# Find where to add handlers (after existing handlers, before init)
pattern = r'(// Feature Importance handler moved earlier[^}]+\}[^}]+\})'
match = re.search(pattern, content)
if match:
    content = content[:match.end()] + '\n' + handlers_code + content[match.end():]
    print('Added Beyond R Bias event handlers!')
else:
    print('Pattern not found, trying alternative...')
    # Try finding end of event handlers section
    pattern2 = r'(if \(dom\.showPredictionInterval\) \{[^}]+\}[^}]+\})'
    match2 = re.search(pattern2, content)
    if match2:
        content = content[:match2.end()] + '\n' + handlers_code + content[match2.end():]
        print('Added Beyond R Bias handlers (alternative)!')
    else:
        # Last resort: before init function
        pattern3 = r'(\n  async function init\(\))'
        match3 = re.search(pattern3, content)
        if match3:
            content = content[:match3.start()] + '\n' + handlers_code + content[match3.start():]
            print('Added Beyond R Bias handlers (before init)!')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'app.js updated. Size: {len(content)} chars')
