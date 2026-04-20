import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find DOM elements section and add new ones
dom_pattern = r'(exportGPCurve: document\.getElementById\("exportGPCurve"\),)'
match = re.search(dom_pattern, content)

if match:
    insert_pos = match.end()
    new_dom = '''

      // RSM Editorial Revisions
      tafEstimator: document.getElementById("tafEstimator"),
      tafSide: document.getElementById("tafSide"),
      runTrimFill: document.getElementById("runTrimFill"),
      trimFillResult: document.getElementById("trimFillResult"),
      runPET: document.getElementById("runPET"),
      runPEESE: document.getElementById("runPEESE"),
      runPETPEESE: document.getElementById("runPETPEESE"),
      petpeeseResult: document.getElementById("petpeeseResult"),
      runDoiPlot: document.getElementById("runDoiPlot"),
      computeLFK: document.getElementById("computeLFK"),
      lfkResult: document.getElementById("lfkResult"),
      runVeveaHedges: document.getElementById("runVeveaHedges"),
      runSelectionSensitivity: document.getElementById("runSelectionSensitivity"),
      selectionResult: document.getElementById("selectionResult"),
      computeCooksD: document.getElementById("computeCooksD"),
      computeDFFITS: document.getElementById("computeDFFITS"),
      computeStudentized: document.getElementById("computeStudentized"),
      outlierResult: document.getElementById("outlierResult"),
      runLOOCV: document.getElementById("runLOOCV"),
      computeRMSE: document.getElementById("computeRMSE"),
      cvResult: document.getElementById("cvResult"),
      runTransitivity: document.getElementById("runTransitivity"),
      exportTransitivity: document.getElementById("exportTransitivity"),
      transitivityResult: document.getElementById("transitivityResult"),
      outcomeCorrelation: document.getElementById("outcomeCorrelation"),
      runMultivariate: document.getElementById("runMultivariate"),
      multivariateResult: document.getElementById("multivariateResult"),
      exportBiasReport: document.getElementById("exportBiasReport"),
      exportDiagnostics: document.getElementById("exportDiagnostics"),
      exportRSMChecklist: document.getElementById("exportRSMChecklist"),'''

    content = content[:insert_pos] + new_dom + content[insert_pos:]
    print('Added RSM DOM elements!')
else:
    print('Could not find DOM section')

# Find end of Tier 1 handlers and add RSM handlers
handler_pattern = r'(dom\.exportGPCurve\?\.addEventListener\("click"[\s\S]*?\}\);)\s*(\})'
match2 = re.search(handler_pattern, content)

if not match2:
    # Try alternative pattern
    handler_pattern = r'(if \(dom\.exportGPCurve\)[\s\S]*?showNotification\("Export failed:[\s\S]*?\}\s*\}\);)\s*(\})'
    match2 = re.search(handler_pattern, content)

if match2:
    insert_pos = match2.start(2)

    rsm_handlers = '''

    // =========================================================================
    // RSM EDITORIAL REVISIONS EVENT HANDLERS
    // =========================================================================

    // Trim-and-Fill
    if (dom.runTrimFill) {
      dom.runTrimFill.addEventListener("click", () => {
        if (!state.rawData || !state.rawData.length) {
          showNotification("No data loaded", "error");
          return;
        }
        try {
          const effects = state.rawData.map(s => s.effect);
          const ses = state.rawData.map(s => s.se);
          const estimator = dom.tafEstimator?.value || 'L0';
          const side = dom.tafSide?.value || 'auto';

          const taf = new TrimAndFill(effects, ses, { estimator, side });
          const result = taf.run();
          state.trimFillResult = result;

          if (dom.trimFillResult) {
            dom.trimFillResult.textContent = "Missing: " + result.missingStudies +
              " | Original: " + result.original.effect.toFixed(3) +
              " -> Adjusted: " + result.adjusted.effect.toFixed(3) +
              " (" + (result.percentChange >= 0 ? "+" : "") + result.percentChange.toFixed(1) + "%)";
          }

          showNotification("Trim-and-fill: " + result.missingStudies + " imputed studies", "success");
        } catch (e) {
          showNotification("Trim-and-fill failed: " + e.message, "error");
        }
      });
    }

    // PET
    if (dom.runPET) {
      dom.runPET.addEventListener("click", () => {
        if (!state.rawData || !state.rawData.length) {
          showNotification("No data loaded", "error");
          return;
        }
        try {
          const effects = state.rawData.map(s => s.effect);
          const ses = state.rawData.map(s => s.se);

          const pp = new PETPEESE(effects, ses);
          const result = pp.runPET();
          state.petResult = result;

          if (dom.petpeeseResult) {
            dom.petpeeseResult.textContent = "PET: " + result.adjustedEffect.toFixed(3) +
              " (95% CI: " + result.ci[0].toFixed(3) + ", " + result.ci[1].toFixed(3) + ")" +
              " | Bias p=" + result.biasP.toFixed(3);
          }

          showNotification(result.interpretation, result.hasBias ? "warning" : "success");
        } catch (e) {
          showNotification("PET failed: " + e.message, "error");
        }
      });
    }

    // PEESE
    if (dom.runPEESE) {
      dom.runPEESE.addEventListener("click", () => {
        if (!state.rawData || !state.rawData.length) {
          showNotification("No data loaded", "error");
          return;
        }
        try {
          const effects = state.rawData.map(s => s.effect);
          const ses = state.rawData.map(s => s.se);

          const pp = new PETPEESE(effects, ses);
          const result = pp.runPEESE();
          state.peeseResult = result;

          if (dom.petpeeseResult) {
            dom.petpeeseResult.textContent = "PEESE: " + result.adjustedEffect.toFixed(3) +
              " (95% CI: " + result.ci[0].toFixed(3) + ", " + result.ci[1].toFixed(3) + ")";
          }

          showNotification("PEESE estimate computed", "success");
        } catch (e) {
          showNotification("PEESE failed: " + e.message, "error");
        }
      });
    }

    // Combined PET-PEESE
    if (dom.runPETPEESE) {
      dom.runPETPEESE.addEventListener("click", () => {
        if (!state.rawData || !state.rawData.length) {
          showNotification("No data loaded", "error");
          return;
        }
        try {
          const effects = state.rawData.map(s => s.effect);
          const ses = state.rawData.map(s => s.se);

          const pp = new PETPEESE(effects, ses);
          const result = pp.run();
          state.petpeeseResult = result;

          if (dom.petpeeseResult) {
            dom.petpeeseResult.textContent = result.recommended.method + ": " +
              result.recommended.adjustedEffect.toFixed(3) +
              " (95% CI: " + result.recommended.ci[0].toFixed(3) + ", " +
              result.recommended.ci[1].toFixed(3) + ") - " + result.recommended.reason;
          }

          showNotification("PET-PEESE analysis complete", "success");
        } catch (e) {
          showNotification("PET-PEESE failed: " + e.message, "error");
        }
      });
    }

    // LFK Index
    if (dom.computeLFK) {
      dom.computeLFK.addEventListener("click", () => {
        if (!state.rawData || !state.rawData.length) {
          showNotification("No data loaded", "error");
          return;
        }
        try {
          const effects = state.rawData.map(s => s.effect);
          const ses = state.rawData.map(s => s.se);

          const doi = new DoiPlot(effects, ses);
          const result = doi.computeLFKIndex();
          state.lfkResult = result;

          if (dom.lfkResult) {
            dom.lfkResult.textContent = "LFK = " + result.lfk.toFixed(2) + ": " + result.interpretation;
          }

          const severity = result.severity === 'major' ? 'error' : result.severity === 'minor' ? 'warning' : 'success';
          showNotification("LFK Index: " + result.interpretation, severity);
        } catch (e) {
          showNotification("LFK computation failed: " + e.message, "error");
        }
      });
    }

    // Doi Plot
    if (dom.runDoiPlot) {
      dom.runDoiPlot.addEventListener("click", () => {
        if (!state.rawData || !state.rawData.length) {
          showNotification("No data loaded", "error");
          return;
        }
        try {
          const effects = state.rawData.map(s => s.effect);
          const ses = state.rawData.map(s => s.se);

          const doi = new DoiPlot(effects, ses);
          const result = doi.run();
          state.doiPlotData = result;

          if (dom.lfkResult) {
            dom.lfkResult.textContent = "Doi plot generated | LFK = " + result.lfk.lfk.toFixed(2);
          }

          showNotification("Doi plot data generated", "success");
        } catch (e) {
          showNotification("Doi plot failed: " + e.message, "error");
        }
      });
    }

    // Vevea-Hedges Selection Model
    if (dom.runVeveaHedges) {
      dom.runVeveaHedges.addEventListener("click", () => {
        if (!state.rawData || !state.rawData.length) {
          showNotification("No data loaded", "error");
          return;
        }
        try {
          const effects = state.rawData.map(s => s.effect);
          const ses = state.rawData.map(s => s.se);

          const vh = new VeveaHedgesSelectionModel(effects, ses);
          const result = vh.run();
          state.veveaHedgesResult = result;

          if (dom.selectionResult) {
            dom.selectionResult.textContent =
              "Unadj: " + result.unadjusted.effect.toFixed(3) +
              " | Moderate: " + result.moderateSelection.effect.toFixed(3) +
              " | Severe: " + result.severeSelection.effect.toFixed(3);
          }

          showNotification("Vevea-Hedges selection model complete", "success");
        } catch (e) {
          showNotification("Selection model failed: " + e.message, "error");
        }
      });
    }

    // Cook's D
    if (dom.computeCooksD) {
      dom.computeCooksD.addEventListener("click", () => {
        if (!state.rawData || !state.rawData.length) {
          showNotification("No data loaded", "error");
          return;
        }
        try {
          const effects = state.rawData.map(s => s.effect);
          const ses = state.rawData.map(s => s.se);
          const names = state.rawData.map(s => s.study);

          const diag = new OutlierDiagnostics(effects, ses, names);
          const result = diag.run();
          state.outlierDiagnostics = result;

          if (dom.outlierResult) {
            dom.outlierResult.textContent = "Outliers: " + result.nOutliers + "/" + result.diagnostics.length +
              (result.outliers.length ? " (" + result.outliers.map(o => o.study).join(", ") + ")" : "");
          }

          showNotification("Outlier diagnostics: " + result.nOutliers + " influential studies", result.nOutliers ? "warning" : "success");
        } catch (e) {
          showNotification("Diagnostics failed: " + e.message, "error");
        }
      });
    }

    // DFFITS
    if (dom.computeDFFITS) {
      dom.computeDFFITS.addEventListener("click", () => {
        if (!state.rawData || !state.rawData.length) {
          showNotification("No data loaded", "error");
          return;
        }
        try {
          const effects = state.rawData.map(s => s.effect);
          const ses = state.rawData.map(s => s.se);
          const names = state.rawData.map(s => s.study);

          const diag = new OutlierDiagnostics(effects, ses, names);
          const dffits = diag.computeDFFITS();

          const threshold = 2 * Math.sqrt(1 / effects.length);
          const flagged = dffits.filter(d => Math.abs(d) > threshold).length;

          if (dom.outlierResult) {
            dom.outlierResult.textContent = "DFFITS: " + flagged + "/" + effects.length +
              " exceed threshold (|DFFITS| > " + threshold.toFixed(2) + ")";
          }

          showNotification("DFFITS computed: " + flagged + " flagged", flagged ? "warning" : "success");
        } catch (e) {
          showNotification("DFFITS failed: " + e.message, "error");
        }
      });
    }

    // Studentized Residuals
    if (dom.computeStudentized) {
      dom.computeStudentized.addEventListener("click", () => {
        if (!state.rawData || !state.rawData.length) {
          showNotification("No data loaded", "error");
          return;
        }
        try {
          const effects = state.rawData.map(s => s.effect);
          const ses = state.rawData.map(s => s.se);
          const names = state.rawData.map(s => s.study);

          const diag = new OutlierDiagnostics(effects, ses, names);
          const resids = diag.computeStudentizedResiduals();

          const flagged = resids.filter(r => Math.abs(r) > 2.5).length;

          if (dom.outlierResult) {
            dom.outlierResult.textContent = "Studentized residuals: " + flagged + "/" + effects.length +
              " exceed |2.5|";
          }

          showNotification("Studentized residuals: " + flagged + " outliers", flagged ? "warning" : "success");
        } catch (e) {
          showNotification("Studentized residuals failed: " + e.message, "error");
        }
      });
    }

    // Transitivity Assessment
    if (dom.runTransitivity) {
      dom.runTransitivity.addEventListener("click", () => {
        if (!state.rawData || !state.rawData.length) {
          showNotification("No data loaded", "error");
          return;
        }
        try {
          // Transform data for transitivity assessment
          const studies = state.rawData.map(s => ({
            id: s.study,
            treatment: s.treatment,
            comparator: 'Placebo', // Default comparator
            covariates: {
              dose: s.dose,
              n: s.n || 100,
              year: s.year || 2020
            }
          }));

          const ta = new TransitivityAssessment(studies);
          const result = ta.run(['dose', 'n', 'year']);
          state.transitivityResult = result;

          if (dom.transitivityResult) {
            dom.transitivityResult.textContent = result.overallJudgment +
              " (Concerns: " + result.nConcerns + "/" + result.nCovariates + ")";
          }

          const severity = result.nConcerns > 1 ? 'error' : result.nConcerns === 1 ? 'warning' : 'success';
          showNotification(result.overallJudgment, severity);
        } catch (e) {
          showNotification("Transitivity assessment failed: " + e.message, "error");
        }
      });
    }

    // Export Bias Report
    if (dom.exportBiasReport) {
      dom.exportBiasReport.addEventListener("click", () => {
        try {
          let report = "# Publication Bias Assessment Report\\n\\n";
          report += "Generated: " + new Date().toISOString() + "\\n\\n";

          if (state.trimFillResult) {
            report += "## Trim-and-Fill (Duval & Tweedie)\\n\\n";
            report += "- Original effect: " + state.trimFillResult.original.effect.toFixed(4) + "\\n";
            report += "- Adjusted effect: " + state.trimFillResult.adjusted.effect.toFixed(4) + "\\n";
            report += "- Missing studies: " + state.trimFillResult.missingStudies + "\\n";
            report += "- Change: " + state.trimFillResult.percentChange.toFixed(1) + "%\\n\\n";
          }

          if (state.petpeeseResult) {
            report += "## PET-PEESE\\n\\n";
            report += "- PET estimate: " + state.petpeeseResult.pet.adjustedEffect.toFixed(4) + "\\n";
            report += "- PEESE estimate: " + state.petpeeseResult.peese.adjustedEffect.toFixed(4) + "\\n";
            report += "- Recommended: " + state.petpeeseResult.recommended.method + "\\n";
            report += "- Reason: " + state.petpeeseResult.recommended.reason + "\\n\\n";
          }

          if (state.lfkResult) {
            report += "## LFK Index (Furuya-Kanamori)\\n\\n";
            report += "- LFK index: " + state.lfkResult.lfk.toFixed(2) + "\\n";
            report += "- Interpretation: " + state.lfkResult.interpretation + "\\n\\n";
          }

          if (state.veveaHedgesResult) {
            report += "## Vevea-Hedges Selection Model\\n\\n";
            report += "- Unadjusted: " + state.veveaHedgesResult.unadjusted.effect.toFixed(4) + "\\n";
            report += "- Moderate selection: " + state.veveaHedgesResult.moderateSelection.effect.toFixed(4) + "\\n";
            report += "- Severe selection: " + state.veveaHedgesResult.severeSelection.effect.toFixed(4) + "\\n\\n";
          }

          const blob = new Blob([report], { type: "text/markdown" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "publication_bias_report.md";
          a.click();
          URL.revokeObjectURL(url);
          showNotification("Bias report exported", "success");
        } catch (e) {
          showNotification("Export failed: " + e.message, "error");
        }
      });
    }

    // Export Diagnostics
    if (dom.exportDiagnostics) {
      dom.exportDiagnostics.addEventListener("click", () => {
        if (!state.outlierDiagnostics) {
          showNotification("Run outlier diagnostics first", "error");
          return;
        }
        try {
          let csv = "study,effect,se,studentized,external,dffits,cooksD,hatValue,isOutlier,isInfluential\\n";

          for (const d of state.outlierDiagnostics.diagnostics) {
            csv += d.study + "," + d.effect + "," + d.se + "," +
              d.studentized.toFixed(4) + "," + d.external.toFixed(4) + "," +
              d.dffits.toFixed(4) + "," + d.cooksD.toFixed(4) + "," +
              d.hatValue.toFixed(4) + "," + d.isOutlier + "," + d.isInfluential + "\\n";
          }

          const blob = new Blob([csv], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "outlier_diagnostics.csv";
          a.click();
          URL.revokeObjectURL(url);
          showNotification("Diagnostics exported", "success");
        } catch (e) {
          showNotification("Export failed: " + e.message, "error");
        }
      });
    }

    // RSM Checklist Export
    if (dom.exportRSMChecklist) {
      dom.exportRSMChecklist.addEventListener("click", () => {
        try {
          let checklist = "# Research Synthesis Methods Checklist\\n\\n";
          checklist += "Generated: " + new Date().toISOString() + "\\n\\n";

          checklist += "## Publication Bias Methods\\n\\n";
          checklist += "- [" + (state.trimFillResult ? "x" : " ") + "] Trim-and-Fill (Duval & Tweedie)\\n";
          checklist += "- [" + (state.petpeeseResult ? "x" : " ") + "] PET-PEESE (Stanley & Doucouliagos)\\n";
          checklist += "- [" + (state.lfkResult ? "x" : " ") + "] Doi Plot / LFK Index (Furuya-Kanamori)\\n";
          checklist += "- [" + (state.veveaHedgesResult ? "x" : " ") + "] Selection Model (Vevea-Hedges)\\n\\n";

          checklist += "## Diagnostics\\n\\n";
          checklist += "- [" + (state.outlierDiagnostics ? "x" : " ") + "] Outlier Diagnostics (Cook's D, DFFITS)\\n";
          checklist += "- [" + (state.transitivityResult ? "x" : " ") + "] Transitivity Assessment\\n\\n";

          checklist += "## RSM Editorial Standards Met: ";
          let count = 0;
          if (state.trimFillResult) count++;
          if (state.petpeeseResult) count++;
          if (state.lfkResult) count++;
          if (state.veveaHedgesResult) count++;
          if (state.outlierDiagnostics) count++;
          if (state.transitivityResult) count++;
          checklist += count + "/6\\n";

          const blob = new Blob([checklist], { type: "text/markdown" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "rsm_checklist.md";
          a.click();
          URL.revokeObjectURL(url);
          showNotification("RSM checklist exported", "success");
        } catch (e) {
          showNotification("Export failed: " + e.message, "error");
        }
      });
    }

  '''

    content = content[:insert_pos] + rsm_handlers + content[insert_pos:]
    print('Added RSM event handlers!')
else:
    print('Could not find handler section')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done!')
