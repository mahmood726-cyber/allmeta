import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the exportRSMChecklist handler and add new handlers after it
pattern = r'(if \(dom\.exportRSMChecklist\) \{[\s\S]*?showNotification\("RSM checklist exported", "success"\);[\s\S]*?\}\s*\}\s*\})'

match = re.search(pattern, content)

if match:
    insert_pos = match.end()

    new_handlers = '''

    // =========================================================================
    // RSM EDITORIAL V2 EVENT HANDLERS
    // =========================================================================

    // P-Curve Analysis
    if (document.getElementById("runPCurve")) {
      document.getElementById("runPCurve").addEventListener("click", () => {
        try {
          if (!state.rawData || state.rawData.length < 3) {
            showNotification("Need at least 3 studies", "warn");
            return;
          }
          const effects = state.rawData.map(d => d.effect);
          const ses = state.rawData.map(d => d.se);
          const pcurve = new PCurveAnalysis(effects, ses);
          const result = pcurve.run();
          state.pcurveResult = result;

          if (result.error) {
            document.getElementById("pcurveResult").textContent = result.error;
            showNotification(result.error, "warn");
          } else {
            const hint = `P-curve: ${result.conclusion} (n=${result.nSignificant}/${result.nTotal} sig)`;
            document.getElementById("pcurveResult").textContent = hint;
            showNotification("P-curve analysis complete", "success");
          }
        } catch (e) {
          showNotification("P-curve failed: " + e.message, "error");
        }
      });
    }

    if (document.getElementById("exportPCurve")) {
      document.getElementById("exportPCurve").addEventListener("click", () => {
        if (!state.pcurveResult) {
          showNotification("Run P-curve analysis first", "warn");
          return;
        }
        const blob = new Blob([JSON.stringify(state.pcurveResult, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "pcurve_analysis.json";
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    // Failsafe N - Rosenthal
    if (document.getElementById("runRosenthal")) {
      document.getElementById("runRosenthal").addEventListener("click", () => {
        try {
          if (!state.rawData || state.rawData.length < 2) {
            showNotification("Need at least 2 studies", "warn");
            return;
          }
          const effects = state.rawData.map(d => d.effect);
          const ses = state.rawData.map(d => d.se);
          const fsn = new FailsafeN(effects, ses);
          const result = fsn.rosenthal();
          state.failsafeResult = state.failsafeResult || {};
          state.failsafeResult.rosenthal = result;

          document.getElementById("failsafeResult").textContent =
            `Rosenthal N=${result.failsafeN} (${result.robust ? "robust" : "fragile"})`;
          showNotification(`Failsafe N (Rosenthal): ${result.failsafeN}`, "success");
        } catch (e) {
          showNotification("Rosenthal failed: " + e.message, "error");
        }
      });
    }

    // Failsafe N - Orwin
    if (document.getElementById("runOrwin")) {
      document.getElementById("runOrwin").addEventListener("click", () => {
        try {
          if (!state.rawData || state.rawData.length < 2) {
            showNotification("Need at least 2 studies", "warn");
            return;
          }
          const effects = state.rawData.map(d => d.effect);
          const ses = state.rawData.map(d => d.se);
          const fsn = new FailsafeN(effects, ses);
          const result = fsn.orwin(0.1);
          state.failsafeResult = state.failsafeResult || {};
          state.failsafeResult.orwin = result;

          document.getElementById("failsafeResult").textContent =
            `Orwin N=${result.failsafeN} to reach criterion ${result.criterion}`;
          showNotification(`Failsafe N (Orwin): ${result.failsafeN}`, "success");
        } catch (e) {
          showNotification("Orwin failed: " + e.message, "error");
        }
      });
    }

    // Failsafe N - Rosenberg
    if (document.getElementById("runRosenberg")) {
      document.getElementById("runRosenberg").addEventListener("click", () => {
        try {
          if (!state.rawData || state.rawData.length < 2) {
            showNotification("Need at least 2 studies", "warn");
            return;
          }
          const effects = state.rawData.map(d => d.effect);
          const ses = state.rawData.map(d => d.se);
          const fsn = new FailsafeN(effects, ses);
          const result = fsn.rosenberg();
          state.failsafeResult = state.failsafeResult || {};
          state.failsafeResult.rosenberg = result;

          document.getElementById("failsafeResult").textContent =
            `Rosenberg weighted N=${result.failsafeN}`;
          showNotification(`Failsafe N (Rosenberg): ${result.failsafeN}`, "success");
        } catch (e) {
          showNotification("Rosenberg failed: " + e.message, "error");
        }
      });
    }

    // Excess Significance Test
    if (document.getElementById("runExcessSig")) {
      document.getElementById("runExcessSig").addEventListener("click", () => {
        try {
          if (!state.rawData || state.rawData.length < 3) {
            showNotification("Need at least 3 studies", "warn");
            return;
          }
          const effects = state.rawData.map(d => d.effect);
          const ses = state.rawData.map(d => d.se);
          const test = new ExcessSignificanceTest(effects, ses);
          const result = test.run();
          state.excessSigResult = result;

          document.getElementById("excessSigResult").textContent =
            `O=${result.observed}, E=${result.expected.toFixed(1)}, p=${result.pValue.toFixed(3)}`;
          showNotification(result.interpretation, result.significant ? "warn" : "success");
        } catch (e) {
          showNotification("Excess sig test failed: " + e.message, "error");
        }
      });
    }

    // Permutation Test
    if (document.getElementById("runPermutation")) {
      document.getElementById("runPermutation").addEventListener("click", () => {
        try {
          if (!state.rawData || state.rawData.length < 5) {
            showNotification("Need at least 5 studies for permutation", "warn");
            return;
          }
          const effects = state.rawData.map(d => d.effect);
          const ses = state.rawData.map(d => d.se);
          const nPerm = parseInt(document.getElementById("permutations").value) || 5000;
          const test = new PermutationBiasTest(effects, ses, { nPerm });
          const result = test.run();
          state.permutationResult = result;

          document.getElementById("permutationResult").textContent =
            `tau=${result.observedTau.toFixed(3)}, p=${result.pValue.toFixed(3)}`;
          showNotification(result.interpretation, result.significant ? "warn" : "success");
        } catch (e) {
          showNotification("Permutation test failed: " + e.message, "error");
        }
      });
    }

    // 3PSM Selection Model
    if (document.getElementById("run3PSM")) {
      document.getElementById("run3PSM").addEventListener("click", () => {
        try {
          if (!state.rawData || state.rawData.length < 5) {
            showNotification("Need at least 5 studies for 3PSM", "warn");
            return;
          }
          const effects = state.rawData.map(d => d.effect);
          const ses = state.rawData.map(d => d.se);
          const model = new ThreeParameterSelectionModel(effects, ses);
          const result = model.run();
          state.threepsmResult = result;

          document.getElementById("threepsmResult").textContent =
            `Adj: ${result.adjusted.mu.toFixed(3)}, eta=${result.selection.eta.toFixed(2)} (${result.selection.severity})`;
          showNotification(`3PSM: ${result.percentBias.toFixed(1)}% bias correction`, "success");
        } catch (e) {
          showNotification("3PSM failed: " + e.message, "error");
        }
      });
    }

    // Radial/Galbraith Plot
    if (document.getElementById("runRadialPlot")) {
      document.getElementById("runRadialPlot").addEventListener("click", () => {
        try {
          if (!state.rawData || state.rawData.length < 3) {
            showNotification("Need at least 3 studies", "warn");
            return;
          }
          const effects = state.rawData.map(d => d.effect);
          const ses = state.rawData.map(d => d.se);
          const names = state.rawData.map((d, i) => d.study || `Study ${i+1}`);
          const radial = new RadialPlot(effects, ses, names);
          const result = radial.run();
          state.radialResult = result;

          document.getElementById("radialResult").textContent =
            `Galbraith plot: ${result.outliers.length} outliers detected`;
          showNotification("Radial plot generated", "success");

          // Render the plot on canvas
          renderRadialPlot(result.plotData);
        } catch (e) {
          showNotification("Radial plot failed: " + e.message, "error");
        }
      });
    }

    if (document.getElementById("identifyOutliers")) {
      document.getElementById("identifyOutliers").addEventListener("click", () => {
        if (!state.radialResult) {
          showNotification("Run Galbraith plot first", "warn");
          return;
        }
        const outliers = state.radialResult.outliers;
        if (outliers.length === 0) {
          showNotification("No outliers detected", "success");
        } else {
          const names = outliers.map(o => o.study).join(", ");
          showNotification(`Outliers: ${names}`, "warn");
        }
      });
    }

    // Harbord's Test
    if (document.getElementById("runHarbord")) {
      document.getElementById("runHarbord").addEventListener("click", () => {
        try {
          if (!state.rawData || state.rawData.length < 5) {
            showNotification("Need at least 5 studies", "warn");
            return;
          }
          // Check if we have binary outcome data
          const hasBinary = state.rawData[0].a !== undefined && state.rawData[0].c !== undefined;
          if (!hasBinary) {
            showNotification("Harbord test requires binary outcome data (2x2 tables)", "warn");
            return;
          }

          const logORs = state.rawData.map(d => d.effect);
          const ses = state.rawData.map(d => d.se);
          const events = state.rawData.map(d => [d.a, d.c]);
          const nonEvents = state.rawData.map(d => [d.b, d.d]);

          const test = new HarbordTest(logORs, ses, events, nonEvents);
          const result = test.run();
          state.harbordResult = result;

          document.getElementById("harbordResult").textContent =
            `Harbord: t=${result.t.toFixed(2)}, p=${result.pValue.toFixed(3)}`;
          showNotification(result.interpretation, result.significant ? "warn" : "success");
        } catch (e) {
          showNotification("Harbord test failed: " + e.message, "error");
        }
      });
    }

    // I2 Confidence Interval - Q-Profile
    if (document.getElementById("runQProfile")) {
      document.getElementById("runQProfile").addEventListener("click", () => {
        try {
          if (!state.rawData || state.rawData.length < 3) {
            showNotification("Need at least 3 studies", "warn");
            return;
          }
          const effects = state.rawData.map(d => d.effect);
          const ses = state.rawData.map(d => d.se);
          const i2ci = new I2ConfidenceInterval(effects, ses);
          const result = i2ci.qProfile();
          state.i2ciResult = state.i2ciResult || {};
          state.i2ciResult.qProfile = result;

          document.getElementById("i2ciResult").textContent =
            `I2=${(result.I2*100).toFixed(1)}% [${(result.lower*100).toFixed(1)}, ${(result.upper*100).toFixed(1)}]`;
          showNotification("Q-profile I2 CI computed", "success");
        } catch (e) {
          showNotification("Q-profile failed: " + e.message, "error");
        }
      });
    }

    // I2 Confidence Interval - Bootstrap
    if (document.getElementById("runBootstrapI2")) {
      document.getElementById("runBootstrapI2").addEventListener("click", () => {
        try {
          if (!state.rawData || state.rawData.length < 3) {
            showNotification("Need at least 3 studies", "warn");
            return;
          }
          const effects = state.rawData.map(d => d.effect);
          const ses = state.rawData.map(d => d.se);
          const i2ci = new I2ConfidenceInterval(effects, ses);
          const result = i2ci.bootstrap(500);
          state.i2ciResult = state.i2ciResult || {};
          state.i2ciResult.bootstrap = result;

          document.getElementById("i2ciResult").textContent =
            `I2 Bootstrap: [${(result.lower*100).toFixed(1)}, ${(result.upper*100).toFixed(1)}]%`;
          showNotification("Bootstrap I2 CI computed", "success");
        } catch (e) {
          showNotification("Bootstrap failed: " + e.message, "error");
        }
      });
    }

    // Finite-Sample - Satterthwaite
    if (document.getElementById("runSatterthwaite")) {
      document.getElementById("runSatterthwaite").addEventListener("click", () => {
        try {
          if (!state.rawData || state.rawData.length < 3) {
            showNotification("Need at least 3 studies", "warn");
            return;
          }
          const effects = state.rawData.map(d => d.effect);
          const ses = state.rawData.map(d => d.se);
          const fsc = new FiniteSampleCorrections(effects, ses);
          const result = fsc.satterthwaite();
          state.finiteSampleResult = state.finiteSampleResult || {};
          state.finiteSampleResult.satterthwaite = result;

          document.getElementById("finiteSampleResult").textContent =
            `Satterthwaite df=${result.df.toFixed(1)}, CI=[${result.ci[0].toFixed(3)}, ${result.ci[1].toFixed(3)}]`;
          showNotification("Satterthwaite correction applied", "success");
        } catch (e) {
          showNotification("Satterthwaite failed: " + e.message, "error");
        }
      });
    }

    // Finite-Sample - Kenward-Roger
    if (document.getElementById("runKenwardRoger")) {
      document.getElementById("runKenwardRoger").addEventListener("click", () => {
        try {
          if (!state.rawData || state.rawData.length < 3) {
            showNotification("Need at least 3 studies", "warn");
            return;
          }
          const effects = state.rawData.map(d => d.effect);
          const ses = state.rawData.map(d => d.se);
          const fsc = new FiniteSampleCorrections(effects, ses);
          const result = fsc.kenwardRoger();
          state.finiteSampleResult = state.finiteSampleResult || {};
          state.finiteSampleResult.kenwardRoger = result;

          document.getElementById("finiteSampleResult").textContent =
            `KR df=${result.df.toFixed(1)}, lambda=${result.lambda.toFixed(2)}`;
          showNotification("Kenward-Roger correction applied", "success");
        } catch (e) {
          showNotification("Kenward-Roger failed: " + e.message, "error");
        }
      });
    }

    // Meta-Regression VIF
    if (document.getElementById("runVIF")) {
      document.getElementById("runVIF").addEventListener("click", () => {
        try {
          if (!state.rawData || state.rawData.length < 5) {
            showNotification("Need at least 5 studies", "warn");
            return;
          }
          // Check for covariates
          const hasCovariates = state.rawData[0].x1 !== undefined || state.rawData[0].covariate !== undefined;
          if (!hasCovariates) {
            showNotification("VIF requires covariates in data", "warn");
            return;
          }

          const effects = state.rawData.map(d => d.effect);
          const ses = state.rawData.map(d => d.se);
          const covariates = [state.rawData.map(d => d.x1 || d.covariate || 0)];

          const diag = new MetaRegressionDiagnostics(effects, ses, covariates);
          const result = diag.run();
          state.mrDiagResult = result;

          const maxVIF = result.multicollinearity.maxVIF;
          document.getElementById("mrDiagResult").textContent =
            maxVIF ? `Max VIF=${maxVIF.toFixed(2)}` : "VIF computed";
          showNotification(result.multicollinearity.interpretation, "success");
        } catch (e) {
          showNotification("VIF computation failed: " + e.message, "error");
        }
      });
    }

    // Meta-Regression Residuals
    if (document.getElementById("runMRResiduals")) {
      document.getElementById("runMRResiduals").addEventListener("click", () => {
        try {
          if (!state.rawData || state.rawData.length < 5) {
            showNotification("Need at least 5 studies", "warn");
            return;
          }

          const effects = state.rawData.map(d => d.effect);
          const ses = state.rawData.map(d => d.se);
          const covariates = [state.rawData.map(d => d.x1 || d.covariate || d.dose || 1)];

          const diag = new MetaRegressionDiagnostics(effects, ses, covariates);
          const result = diag.run();
          state.mrDiagResult = result;

          document.getElementById("mrDiagResult").textContent =
            `${result.outliers.count} residual outliers detected`;
          showNotification(result.outliers.interpretation, result.outliers.count > 0 ? "warn" : "success");
        } catch (e) {
          showNotification("Residual analysis failed: " + e.message, "error");
        }
      });
    }

    // Export RSM v2 Report
    if (document.getElementById("exportRSMv2Report")) {
      document.getElementById("exportRSMv2Report").addEventListener("click", () => {
        try {
          let report = "# RSM Editorial V2 - Publication Bias Report\\n\\n";
          report += "Generated: " + new Date().toISOString() + "\\n\\n";

          if (state.pcurveResult) {
            report += "## P-Curve Analysis\\n";
            report += JSON.stringify(state.pcurveResult, null, 2) + "\\n\\n";
          }
          if (state.failsafeResult) {
            report += "## Failsafe N\\n";
            report += JSON.stringify(state.failsafeResult, null, 2) + "\\n\\n";
          }
          if (state.excessSigResult) {
            report += "## Excess Significance Test\\n";
            report += JSON.stringify(state.excessSigResult, null, 2) + "\\n\\n";
          }
          if (state.threepsmResult) {
            report += "## 3PSM Selection Model\\n";
            report += JSON.stringify(state.threepsmResult, null, 2) + "\\n\\n";
          }
          if (state.permutationResult) {
            report += "## Permutation Test\\n";
            report += JSON.stringify(state.permutationResult, null, 2) + "\\n\\n";
          }
          if (state.i2ciResult) {
            report += "## I2 Confidence Intervals\\n";
            report += JSON.stringify(state.i2ciResult, null, 2) + "\\n\\n";
          }
          if (state.finiteSampleResult) {
            report += "## Finite-Sample Corrections\\n";
            report += JSON.stringify(state.finiteSampleResult, null, 2) + "\\n\\n";
          }

          const blob = new Blob([report], { type: "text/markdown" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "rsm_v2_bias_report.md";
          a.click();
          URL.revokeObjectURL(url);
          showNotification("RSM v2 report exported", "success");
        } catch (e) {
          showNotification("Export failed: " + e.message, "error");
        }
      });
    }

    // Export RSM v2 Checklist
    if (document.getElementById("exportRSMv2Checklist")) {
      document.getElementById("exportRSMv2Checklist").addEventListener("click", () => {
        try {
          let checklist = "# RSM Editorial V2 Compliance Checklist\\n\\n";
          checklist += "## Evidential Value Assessment\\n\\n";
          checklist += "- [" + (state.pcurveResult ? "x" : " ") + "] P-curve Analysis (Simonsohn et al., 2014)\\n";
          checklist += "- [" + (state.failsafeResult ? "x" : " ") + "] Failsafe N (Rosenthal/Orwin/Rosenberg)\\n";
          checklist += "- [" + (state.excessSigResult ? "x" : " ") + "] Excess Significance Test (Ioannidis & Trikalinos)\\n";
          checklist += "- [" + (state.permutationResult ? "x" : " ") + "] Permutation Test\\n\\n";

          checklist += "## Advanced Selection Models\\n\\n";
          checklist += "- [" + (state.threepsmResult ? "x" : " ") + "] 3PSM Selection Model (McShane et al.)\\n";
          checklist += "- [" + (state.radialResult ? "x" : " ") + "] Radial/Galbraith Plot\\n";
          checklist += "- [" + (state.harbordResult ? "x" : " ") + "] Harbord's Test (for binary outcomes)\\n\\n";

          checklist += "## Statistical Inference\\n\\n";
          checklist += "- [" + (state.i2ciResult ? "x" : " ") + "] I2 Confidence Interval\\n";
          checklist += "- [" + (state.finiteSampleResult ? "x" : " ") + "] Finite-Sample Corrections\\n";
          checklist += "- [" + (state.mrDiagResult ? "x" : " ") + "] Meta-Regression Diagnostics\\n\\n";

          let count = 0;
          if (state.pcurveResult) count++;
          if (state.failsafeResult) count++;
          if (state.excessSigResult) count++;
          if (state.permutationResult) count++;
          if (state.threepsmResult) count++;
          if (state.radialResult) count++;
          if (state.harbordResult) count++;
          if (state.i2ciResult) count++;
          if (state.finiteSampleResult) count++;
          if (state.mrDiagResult) count++;

          checklist += "## RSM V2 Methods Completed: " + count + "/10\\n";

          const blob = new Blob([checklist], { type: "text/markdown" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "rsm_v2_checklist.md";
          a.click();
          URL.revokeObjectURL(url);
          showNotification("RSM v2 checklist exported", "success");
        } catch (e) {
          showNotification("Export failed: " + e.message, "error");
        }
      });
    }

    // Helper function to render Radial/Galbraith plot
    function renderRadialPlot(plotData) {
      const canvas = document.getElementById("mainChart");
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      const W = canvas.width, H = canvas.height;
      const margin = { top: 40, right: 40, bottom: 60, left: 60 };
      const plotW = W - margin.left - margin.right;
      const plotH = H - margin.top - margin.bottom;

      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, W, H);

      // Get data bounds
      const xs = plotData.points.map(p => p.x);
      const ys = plotData.points.map(p => p.y);
      const xMin = 0, xMax = Math.max(...xs) * 1.1;
      const yMin = Math.min(...ys, -2) * 1.1, yMax = Math.max(...ys, 2) * 1.1;

      const scaleX = x => margin.left + (x - xMin) / (xMax - xMin) * plotW;
      const scaleY = y => margin.top + (yMax - y) / (yMax - yMin) * plotH;

      // Draw axes
      ctx.strokeStyle = "#555";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(margin.left, margin.top);
      ctx.lineTo(margin.left, H - margin.bottom);
      ctx.lineTo(W - margin.right, H - margin.bottom);
      ctx.stroke();

      // Zero line
      ctx.strokeStyle = "#666";
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(margin.left, scaleY(0));
      ctx.lineTo(W - margin.right, scaleY(0));
      ctx.stroke();
      ctx.setLineDash([]);

      // Reference line (pooled effect)
      ctx.strokeStyle = "#e74c3c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const refY0 = plotData.pooled.effect * 0;
      const refY1 = plotData.pooled.effect * xMax;
      ctx.moveTo(scaleX(0), scaleY(refY0));
      ctx.lineTo(scaleX(xMax), scaleY(refY1));
      ctx.stroke();

      // Draw points
      plotData.points.forEach((pt, i) => {
        const cx = scaleX(pt.x);
        const cy = scaleY(pt.y);

        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
        ctx.fillStyle = Math.abs(pt.y - plotData.pooled.effect * pt.x) > 2 ? "#f1c40f" : "#3498db";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Labels
      ctx.fillStyle = "#fff";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("1/SE (Precision)", W / 2, H - 15);

      ctx.save();
      ctx.translate(20, H / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("Effect/SE (Standardized)", 0, 0);
      ctx.restore();

      ctx.fillText("Radial (Galbraith) Plot", W / 2, 25);
    }'''

    content = content[:insert_pos] + new_handlers + content[insert_pos:]
    print('Added RSM v2 event handlers!')
else:
    print('Could not find insertion point for handlers')
    print('Trying alternative pattern...')

    # Try a simpler pattern
    pattern2 = r'(showNotification\("RSM checklist exported", "success"\);\s*\} catch \(e\) \{[\s\S]*?showNotification\("Export failed: " \+ e\.message, "error"\);\s*\}\s*\}\);?\s*\})'
    match2 = re.search(pattern2, content)
    if match2:
        insert_pos = match2.end()
        content = content[:insert_pos] + new_handlers + content[insert_pos:]
        print('Added handlers using alternative pattern!')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'app.js updated. New size: {len(content)} chars')
