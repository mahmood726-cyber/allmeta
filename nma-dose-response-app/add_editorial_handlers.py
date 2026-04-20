import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add DOM references for editorial elements
dom_additions = '''
    tau2Estimator: document.getElementById("tau2Estimator"),
    showTau2CI: document.getElementById("showTau2CI"),
    tau2Result: document.getElementById("tau2Result"),
    useRobustSE: document.getElementById("useRobustSE"),
    smallSampleCorrection: document.getElementById("smallSampleCorrection"),
    runDesignByTreatment: document.getElementById("runDesignByTreatment"),
    computeContribution: document.getElementById("computeContribution"),
    runNetHeat: document.getElementById("runNetHeat"),
    inconsistencyResult: document.getElementById("inconsistencyResult"),
    compareModels: document.getElementById("compareModels"),
    runMultivariate: document.getElementById("runMultivariate"),
    runLeaveOneOut: document.getElementById("runLeaveOneOut"),
    runCumulative: document.getElementById("runCumulative"),
    runInfluence: document.getElementById("runInfluence"),
    sensitivityResult: document.getElementById("sensitivityResult"),
    exportREMLReport: document.getElementById("exportREMLReport"),
    exportSensitivity: document.getElementById("exportSensitivity"),
    exportFullAudit: document.getElementById("exportFullAudit"),'''

# Find where to add (after powerResult)
pattern = r'(powerResult: document\.getElementById\("powerResult"\),)'
match = re.search(pattern, content)
if match:
    content = content[:match.end()] + '\n' + dom_additions + content[match.end():]
    print('Added editorial DOM references!')
else:
    print('Could not find powerResult reference')

# 2. Add event handlers
handlers_code = '''
    // ========================================================================
    // EDITORIAL STANDARDS EVENT HANDLERS
    // ========================================================================

    // Tau² estimator change
    if (dom.tau2Estimator) {
      dom.tau2Estimator.addEventListener("change", () => {
        if (!state.parsedData?.rows?.length) return;

        const effects = state.parsedData.rows.map(r => r.effect);
        const variances = state.parsedData.rows.map(r => r.se * r.se);
        const method = dom.tau2Estimator.value;

        let result;
        if (method === "REML") {
          const reml = new REMLEstimator(effects, variances);
          result = reml.estimate();
          state.remlResult = result;

          let text = `REML: tau²=${result.tau2.toFixed(4)}, I²=${result.I2.toFixed(1)}%`;
          if (dom.showTau2CI?.checked && result.tau2CI) {
            text += ` [${result.tau2CI[0].toFixed(4)}, ${result.tau2CI[1].toFixed(4)}]`;
          }
          dom.tau2Result.textContent = text;
        } else {
          dom.tau2Result.textContent = `Using ${method} estimator`;
        }
        updateAnalysis();
      });
    }

    // Robust SE toggle
    if (dom.useRobustSE) {
      dom.useRobustSE.addEventListener("change", updateAnalysis);
    }

    // Design-by-treatment interaction
    if (dom.runDesignByTreatment) {
      dom.runDesignByTreatment.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }

        // Group by study
        const studyMap = {};
        for (const row of state.parsedData.rows) {
          if (!studyMap[row.study]) {
            studyMap[row.study] = { study: row.study, treatments: [], effect: row.effect, se: row.se };
          }
          studyMap[row.study].treatments.push(row.treatment);
        }

        const studies = Object.values(studyMap);
        const treatments = [...new Set(state.parsedData.rows.map(r => r.treatment))];

        const dbt = new DesignByTreatmentInteraction(studies, treatments);
        const result = dbt.test();

        let report = "# Design-by-Treatment Interaction Test\\n\\n";
        report += `Q_inconsistency = ${result.Q_inconsistency.toFixed(3)}\\n`;
        report += `df = ${result.df}\\n`;
        report += `p-value = ${result.pValue.toFixed(4)}\\n\\n`;
        report += `**Interpretation:** ${result.interpretation}\\n\\n`;

        if (result.designEstimates) {
          report += "## Design-Specific Estimates\\n\\n";
          report += "| Design | Effect | SE | N studies |\\n";
          report += "|--------|--------|-----|-----------|\\n";
          for (const [design, est] of Object.entries(result.designEstimates)) {
            report += `| ${design} | ${est.effect.toFixed(3)} | ${Math.sqrt(est.var).toFixed(3)} | ${est.n} |\\n`;
          }
        }

        const blob = new Blob([report], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "design_by_treatment.md";
        a.click();
        URL.revokeObjectURL(url);
        dom.inconsistencyResult.textContent = `Q=${result.Q_inconsistency.toFixed(2)}, p=${result.pValue.toFixed(3)}`;
      });
    }

    // Contribution matrix
    if (dom.computeContribution) {
      dom.computeContribution.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }

        const studyMap = {};
        for (const row of state.parsedData.rows) {
          if (!studyMap[row.study]) {
            studyMap[row.study] = { study: row.study, treatments: [], effect: row.effect, se: row.se };
          }
          studyMap[row.study].treatments.push(row.treatment);
        }
        const network = Object.values(studyMap);

        const cm = new ContributionMatrix(network);
        const result = cm.compute();
        const flow = cm.generateFlowData();

        let report = "# Contribution Matrix\\n\\n";
        report += "## Percent Direct Evidence\\n\\n";
        report += "| Comparison | % Direct |\\n";
        report += "|------------|----------|\\n";
        for (const [comp, pct] of Object.entries(result.percentDirect)) {
          report += `| ${comp} | ${pct}% |\\n`;
        }

        report += "\\n## Evidence Flow\\n\\n";
        report += "| From | To | N Studies | Precision |\\n";
        report += "|------|-----|-----------|-----------|\\n";
        for (const edge of flow.edges) {
          report += `| ${edge.from} | ${edge.to} | ${edge.weight} | ${edge.precision.toFixed(2)} |\\n`;
        }

        const blob = new Blob([report], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "contribution_matrix.md";
        a.click();
        URL.revokeObjectURL(url);
        dom.exportStatus.textContent = "Exported contribution matrix.";
      });
    }

    // Net heat plot
    if (dom.runNetHeat) {
      dom.runNetHeat.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }

        const studyMap = {};
        for (const row of state.parsedData.rows) {
          if (!studyMap[row.study]) {
            studyMap[row.study] = { study: row.study, treatments: [], effect: row.effect, se: row.se };
          }
          studyMap[row.study].treatments.push(row.treatment);
        }
        const network = Object.values(studyMap);
        const treatments = [...new Set(state.parsedData.rows.map(r => r.treatment))];

        const comparisons = [];
        for (let i = 0; i < treatments.length; i++) {
          for (let j = i + 1; j < treatments.length; j++) {
            comparisons.push([treatments[i], treatments[j]]);
          }
        }

        const nhp = new NetHeatPlot(network, comparisons);
        const result = nhp.compute();

        let report = "# Net Heat Plot Analysis\\n\\n";
        report += `Overall inconsistency index: ${result.overallInconsistency.toFixed(3)}\\n\\n`;

        if (result.hotSpots.length > 0) {
          report += "## Hot Spots (High Inconsistency)\\n\\n";
          report += "| Comparison 1 | Comparison 2 | Value |\\n";
          report += "|--------------|--------------|-------|\\n";
          for (const hs of result.hotSpots.slice(0, 10)) {
            report += `| ${hs.comparison1} | ${hs.comparison2} | ${hs.value.toFixed(3)} |\\n`;
          }
        }

        report += "\\n## Heat Matrix (CSV format)\\n\\n";
        const labels = comparisons.map(c => c.join(" vs "));
        report += "," + labels.join(",") + "\\n";
        for (let i = 0; i < result.matrix.length; i++) {
          report += labels[i] + "," + result.matrix[i].map(v => v.toFixed(3)).join(",") + "\\n";
        }

        const blob = new Blob([report], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "net_heat_plot.md";
        a.click();
        URL.revokeObjectURL(url);
        dom.inconsistencyResult.textContent = `Overall inconsistency: ${result.overallInconsistency.toFixed(3)}`;
      });
    }

    // Model comparison
    if (dom.compareModels) {
      dom.compareModels.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }

        // Format data for model comparison
        const studyMap = {};
        for (const row of state.parsedData.rows) {
          if (!studyMap[row.study]) {
            studyMap[row.study] = { study: row.study, arms: [] };
          }
          studyMap[row.study].arms.push({
            treatment: row.treatment,
            effect: row.effect,
            se: row.se
          });
        }
        const studies = Object.values(studyMap);

        const mc = new ModelComparison(studies);
        const result = mc.compare();

        let report = "# Model Comparison: Contrast-based vs Arm-based\\n\\n";
        report += "Reference: Hong et al. (2016) Research Synthesis Methods\\n\\n";

        report += "## Contrast-based Model\\n";
        report += `AIC: ${result.contrastBased.aic.toFixed(2)}\\n\\n`;

        report += "## Arm-based Model\\n";
        report += `AIC: ${result.armBased.aic.toFixed(2)}\\n\\n`;

        report += "## Comparison\\n";
        report += `AIC difference: ${result.comparison.aicDifference.toFixed(2)}\\n`;
        report += `Preferred model: ${result.comparison.preferred}\\n`;
        report += `Evidence strength: ${result.comparison.evidenceStrength}\\n\\n`;
        report += `**Recommendation:** ${result.comparison.recommendation}\\n`;

        const blob = new Blob([report], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "model_comparison.md";
        a.click();
        URL.revokeObjectURL(url);
        dom.exportStatus.textContent = `Preferred: ${result.comparison.preferred} (ΔAIC=${result.comparison.aicDifference.toFixed(1)})`;
      });
    }

    // Leave-one-out analysis
    if (dom.runLeaveOneOut) {
      dom.runLeaveOneOut.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }

        const effects = state.parsedData.rows.map(r => r.effect);
        const variances = state.parsedData.rows.map(r => r.se * r.se);
        const studies = state.parsedData.rows.map(r => r.study);

        const sa = new SensitivityAnalysis(effects, variances, studies);
        const result = sa.leaveOneOut();

        let report = "# Leave-One-Out Sensitivity Analysis\\n\\n";
        report += `Full estimate: ${result.full.effect.toFixed(4)} (95% CI: ${result.full.ci[0].toFixed(4)} to ${result.full.ci[1].toFixed(4)})\\n\\n`;
        report += `Results stable: ${result.stable ? "Yes" : "No"}\\n\\n`;

        report += "## Results\\n\\n";
        report += "| Excluded | Effect | 95% CI | Change | % Change | I² |\\n";
        report += "|----------|--------|--------|--------|----------|-----|\\n";
        for (const r of result.leaveOneOut) {
          report += `| ${r.excluded} | ${r.effect.toFixed(4)} | [${r.ci[0].toFixed(4)}, ${r.ci[1].toFixed(4)}] | ${r.change.toFixed(4)} | ${r.percentChange.toFixed(1)}% | ${r.I2.toFixed(1)}% |\\n`;
        }

        report += `\\n**Most influential study:** ${result.mostInfluential.excluded} (${result.mostInfluential.percentChange.toFixed(1)}% change)\\n`;

        const blob = new Blob([report], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "leave_one_out.md";
        a.click();
        URL.revokeObjectURL(url);
        dom.sensitivityResult.textContent = `Most influential: ${result.mostInfluential.excluded} (${result.mostInfluential.percentChange.toFixed(1)}%)`;
      });
    }

    // Cumulative meta-analysis
    if (dom.runCumulative) {
      dom.runCumulative.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }

        const effects = state.parsedData.rows.map(r => r.effect);
        const variances = state.parsedData.rows.map(r => r.se * r.se);
        const studies = state.parsedData.rows.map(r => ({ name: r.study, year: r.year }));

        const sa = new SensitivityAnalysis(effects, variances, studies);
        const result = sa.cumulative("precision");

        let report = "# Cumulative Meta-Analysis\\n\\n";
        report += `Ordered by: precision (most precise first)\\n\\n`;
        report += `Trend: ${result.trend.direction}${result.trend.significant ? " (significant)" : ""}\\n\\n`;

        report += "## Accumulation\\n\\n";
        report += "| Studies | Added | Effect | 95% CI | I² |\\n";
        report += "|---------|-------|--------|--------|-----|\\n";
        for (const r of result.cumulative) {
          report += `| ${r.nStudies} | ${r.added.name || r.added} | ${r.effect.toFixed(4)} | [${r.ci[0].toFixed(4)}, ${r.ci[1].toFixed(4)}] | ${r.I2.toFixed(1)}% |\\n`;
        }

        const blob = new Blob([report], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "cumulative_ma.md";
        a.click();
        URL.revokeObjectURL(url);
        dom.sensitivityResult.textContent = `Trend: ${result.trend.direction}`;
      });
    }

    // Influence diagnostics
    if (dom.runInfluence) {
      dom.runInfluence.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }

        const effects = state.parsedData.rows.map(r => r.effect);
        const variances = state.parsedData.rows.map(r => r.se * r.se);
        const studies = state.parsedData.rows.map(r => r.study);

        const sa = new SensitivityAnalysis(effects, variances, studies);
        const result = sa.influenceDiagnostics();

        let report = "# Influence Diagnostics\\n\\n";
        report += "Reference: Viechtbauer & Cheung (2010) Research Synthesis Methods\\n\\n";

        report += "## Summary\\n";
        report += `Influential studies: ${result.summary.nInfluential}\\n`;
        report += `Max |DFBETAS|: ${result.summary.maxDFBETAS.toFixed(3)}\\n`;
        report += `Max Cook's D: ${result.summary.maxCooksD.toFixed(3)}\\n`;
        report += `Max |Std Residual|: ${result.summary.maxStdResidual.toFixed(3)}\\n\\n`;

        report += "## All Studies\\n\\n";
        report += "| Study | Std Resid | DFBETAS | Cook's D | Hat | Influential |\\n";
        report += "|-------|-----------|---------|----------|-----|-------------|\\n";
        for (const d of result.diagnostics) {
          report += `| ${d.study} | ${d.stdResidual.toFixed(3)} | ${d.dfbetas.toFixed(3)} | ${d.cooksD.toFixed(3)} | ${d.hat.toFixed(3)} | ${d.influential ? "Yes" : "No"} |\\n`;
        }

        if (result.influential.length > 0) {
          report += "\\n## Influential Studies\\n\\n";
          for (const d of result.influential) {
            report += `- **${d.study}**: DFBETAS=${d.dfbetas.toFixed(3)}, Cook's D=${d.cooksD.toFixed(3)}\\n`;
          }
        }

        const blob = new Blob([report], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "influence_diagnostics.md";
        a.click();
        URL.revokeObjectURL(url);
        dom.sensitivityResult.textContent = `${result.summary.nInfluential} influential studies detected`;
      });
    }

    // Export REML report
    if (dom.exportREMLReport) {
      dom.exportREMLReport.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }

        const effects = state.parsedData.rows.map(r => r.effect);
        const variances = state.parsedData.rows.map(r => r.se * r.se);

        const reml = new REMLEstimator(effects, variances);
        const result = reml.estimate();

        let report = "# REML Meta-Analysis Report\\n\\n";
        report += "## Method\\n";
        report += "Restricted Maximum Likelihood (REML) estimation\\n";
        report += "Reference: Veroniki et al. (2016) Research Synthesis Methods\\n\\n";

        report += "## Results\\n\\n";
        report += `| Parameter | Estimate | 95% CI |\\n`;
        report += `|-----------|----------|--------|\\n`;
        report += `| Pooled effect | ${result.effect.toFixed(4)} | [${result.ci[0].toFixed(4)}, ${result.ci[1].toFixed(4)}] |\\n`;
        report += `| tau² | ${result.tau2.toFixed(4)} | [${result.tau2CI[0].toFixed(4)}, ${result.tau2CI[1].toFixed(4)}] |\\n`;
        report += `| tau | ${result.tau.toFixed(4)} | - |\\n`;
        report += `| I² | ${result.I2.toFixed(1)}% | - |\\n`;
        report += `| H² | ${result.H2.toFixed(2)} | - |\\n`;
        report += `| Q | ${result.Q.toFixed(2)} | - |\\n`;

        const blob = new Blob([report], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "reml_report.md";
        a.click();
        URL.revokeObjectURL(url);
        dom.exportStatus.textContent = "Exported REML report.";
      });
    }

    // Export full audit trail
    if (dom.exportFullAudit) {
      dom.exportFullAudit.addEventListener("click", () => {
        if (!state.parsedData?.rows?.length) {
          alert("Load data first.");
          return;
        }

        const effects = state.parsedData.rows.map(r => r.effect);
        const variances = state.parsedData.rows.map(r => r.se * r.se);
        const studies = state.parsedData.rows.map(r => r.study);

        let report = "# Complete Analysis Audit Trail\\n\\n";
        report += `Generated: ${new Date().toISOString()}\\n\\n`;

        // Data summary
        report += "## Data Summary\\n\\n";
        report += `- Studies: ${new Set(studies).size}\\n`;
        report += `- Observations: ${effects.length}\\n`;
        report += `- Treatments: ${new Set(state.parsedData.rows.map(r => r.treatment)).size}\\n\\n`;

        // REML analysis
        const reml = new REMLEstimator(effects, variances);
        const remlResult = reml.estimate();
        report += "## REML Analysis\\n\\n";
        report += `Pooled effect: ${remlResult.effect.toFixed(4)} [${remlResult.ci[0].toFixed(4)}, ${remlResult.ci[1].toFixed(4)}]\\n`;
        report += `tau²: ${remlResult.tau2.toFixed(4)}, I²: ${remlResult.I2.toFixed(1)}%\\n\\n`;

        // Sensitivity analysis
        const sa = new SensitivityAnalysis(effects, variances, studies);
        const loo = sa.leaveOneOut();
        report += "## Sensitivity Summary\\n\\n";
        report += `Results stable: ${loo.stable ? "Yes" : "No"}\\n`;
        report += `Most influential: ${loo.mostInfluential.excluded} (${loo.mostInfluential.percentChange.toFixed(1)}% change)\\n\\n`;

        const influence = sa.influenceDiagnostics();
        report += `Influential studies: ${influence.summary.nInfluential}\\n`;

        report += "\\n## Reproducibility\\n\\n";
        report += `Software: NMA Dose-Response App\\n`;
        report += `Seed: ${dom.bootstrapSeed?.value || "Not set"}\\n`;

        const blob = new Blob([report], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "analysis_audit_trail.md";
        a.click();
        URL.revokeObjectURL(url);
        dom.exportStatus.textContent = "Exported full audit trail.";
      });
    }
'''

# Find where to add (after suggestDesign handler)
pattern = r'(if \(dom\.suggestDesign\) \{[\s\S]*?dom\.powerResult\.textContent = .*?;\s*\}\);?\s*\})'
match = re.search(pattern, content)
if match:
    content = content[:match.end()] + '\n' + handlers_code + content[match.end():]
    print('Added editorial event handlers!')
else:
    print('Could not find suggestDesign handler')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done!')
