import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find where DOM elements are defined and add new ones
dom_pattern = r'(exportFullAudit: document\.getElementById\("exportFullAudit"\),?)'
match = re.search(dom_pattern, content)

if match:
    insert_pos = match.end()
    new_dom = '''

      // Tier 1: Beyond R
      gpKernel: document.getElementById("gpKernel"),
      fitGP: document.getElementById("fitGP"),
      sampleGPPosterior: document.getElementById("sampleGPPosterior"),
      gpResult: document.getElementById("gpResult"),
      poolMedians: document.getElementById("poolMedians"),
      poolIQRs: document.getElementById("poolIQRs"),
      estimateMeanSD: document.getElementById("estimateMeanSD"),
      quantileResult: document.getElementById("quantileResult"),
      patientAge: document.getElementById("patientAge"),
      patientWeight: document.getElementById("patientWeight"),
      patientRenal: document.getElementById("patientRenal"),
      optimizeDose: document.getElementById("optimizeDose"),
      personalizedResult: document.getElementById("personalizedResult"),
      generate3DSurface: document.getElementById("generate3DSurface"),
      export3DData: document.getElementById("export3DData"),
      show3DWireframe: document.getElementById("show3DWireframe"),
      runGRIME: document.getElementById("runGRIME"),
      runSPRITE: document.getElementById("runSPRITE"),
      runRIVETS: document.getElementById("runRIVETS"),
      runBenford: document.getElementById("runBenford"),
      dataQualityResult: document.getElementById("dataQualityResult"),
      startLiveMA: document.getElementById("startLiveMA"),
      stopLiveMA: document.getElementById("stopLiveMA"),
      exportLiveReport: document.getElementById("exportLiveReport"),
      liveMAStatus: document.getElementById("liveMAStatus"),
      exportTier1Report: document.getElementById("exportTier1Report"),
      exportGPCurve: document.getElementById("exportGPCurve"),'''

    content = content[:insert_pos] + new_dom + content[insert_pos:]
    print('Added Tier 1 DOM elements!')
else:
    print('Could not find DOM elements section')

# Now add event handlers
# Find the end of existing event handlers (after exportFullAudit click handler)
handler_pattern = r'(dom\.exportFullAudit\?\.addEventListener\([^)]+\)[^}]*\}[^}]*\}[^)]*\);)'
match2 = re.search(handler_pattern, content)

if not match2:
    # Alternative: find any addEventListener pattern near end
    handler_pattern = r'(dom\.runInfluence\?\.addEventListener\([^)]+\)[^}]*\}[^}]*\}[^)]*\);)'
    match2 = re.search(handler_pattern, content)

if match2:
    insert_pos = match2.end()
    new_handlers = '''

    // =========================================================================
    // TIER 1: BEYOND R EVENT HANDLERS
    // =========================================================================

    // Gaussian Process Dose-Response
    dom.fitGP?.addEventListener("click", () => {
      if (!state.studies.length) return showNotification("No data loaded", "error");
      try {
        const kernel = dom.gpKernel?.value || 'rbf';
        const doses = state.studies.map(s => s.dose);
        const effects = state.studies.map(s => s.effect);
        const ses = state.studies.map(s => s.se);

        const gp = new GaussianProcessDoseResponse({ kernel });
        gp.fit(doses, effects, ses);

        // Predict on fine grid
        const minDose = Math.min(...doses);
        const maxDose = Math.max(...doses);
        const predDoses = [];
        for (let d = minDose; d <= maxDose; d += (maxDose - minDose) / 100) {
          predDoses.push(d);
        }

        const predictions = gp.predict(predDoses);
        state.gpPredictions = { doses: predDoses, ...predictions };
        state.gpModel = gp;

        dom.gpResult.textContent = `GP fitted: l=${predictions.hyperparameters.lengthScale.toFixed(2)}, sigma=${predictions.hyperparameters.signalVariance.toFixed(3)}`;
        showNotification("Gaussian Process model fitted successfully", "success");
        renderPlots();
      } catch (e) {
        showNotification("GP fitting failed: " + e.message, "error");
      }
    });

    dom.sampleGPPosterior?.addEventListener("click", () => {
      if (!state.gpModel) return showNotification("Fit GP model first", "error");
      try {
        const doses = state.gpPredictions?.doses || [];
        if (!doses.length) return;

        const samples = state.gpModel.samplePosterior(doses, 50);
        state.gpSamples = samples;

        showNotification("Drew 50 posterior samples", "success");
        renderPlots();
      } catch (e) {
        showNotification("Sampling failed: " + e.message, "error");
      }
    });

    // Quantile Meta-Analysis
    dom.poolMedians?.addEventListener("click", () => {
      if (!state.studies.length) return showNotification("No data loaded", "error");
      try {
        // Check if studies have median data
        const medianStudies = state.studies.filter(s => s.median !== undefined || s.effect !== undefined);
        if (!medianStudies.length) return showNotification("No median data found", "error");

        const qa = new QuantileMetaAnalysis();
        const studies = medianStudies.map(s => ({
          median: s.median ?? s.effect,
          q1: s.q1,
          q3: s.q3,
          n: s.n || 100,
          se_median: s.se_median || s.se
        }));

        const result = qa.poolQuantiles(studies);
        state.quantileResult = result;

        dom.quantileResult.textContent = `Pooled median: ${result.pooledMedian.toFixed(3)} (95% CI: ${result.ci95[0].toFixed(3)}, ${result.ci95[1].toFixed(3)}), I²=${result.I2.toFixed(1)}%`;
        showNotification("Quantile meta-analysis complete", "success");
      } catch (e) {
        showNotification("Quantile MA failed: " + e.message, "error");
      }
    });

    dom.poolIQRs?.addEventListener("click", () => {
      if (!state.studies.length) return showNotification("No data loaded", "error");
      try {
        const qa = new QuantileMetaAnalysis();
        const studies = state.studies.filter(s => s.q1 !== undefined && s.q3 !== undefined).map(s => ({
          iqr: s.q3 - s.q1,
          n: s.n || 100
        }));

        if (!studies.length) {
          // Estimate IQR from SD if available
          const sdStudies = state.studies.filter(s => s.sd !== undefined || s.se !== undefined).map(s => ({
            iqr: (s.sd || s.se * Math.sqrt(s.n || 100)) * 1.35,
            n: s.n || 100
          }));
          if (!sdStudies.length) return showNotification("No IQR or SD data found", "error");
          studies.push(...sdStudies);
        }

        const result = qa.poolIQRs(studies);
        dom.quantileResult.textContent = `Pooled IQR: ${result.pooledIQR.toFixed(3)} (95% CI: ${result.ci95[0].toFixed(3)}, ${result.ci95[1].toFixed(3)})`;
        showNotification("IQR pooling complete", "success");
      } catch (e) {
        showNotification("IQR pooling failed: " + e.message, "error");
      }
    });

    dom.estimateMeanSD?.addEventListener("click", () => {
      if (!state.studies.length) return showNotification("No data loaded", "error");
      try {
        const qa = new QuantileMetaAnalysis();
        let converted = 0;

        state.studies.forEach(s => {
          if (s.median !== undefined && (s.q1 !== undefined || s.q3 !== undefined)) {
            const result = qa.estimateMeanSDFromMedianIQR(
              s.median,
              s.q1 ?? s.median - 0.675 * (s.sd || 1),
              s.q3 ?? s.median + 0.675 * (s.sd || 1),
              s.n || 100
            );
            s.estimatedMean = result.mean;
            s.estimatedSD = result.sd;
            s.estimatedSE = result.se;
            converted++;
          }
        });

        showNotification(`Converted ${converted} studies from median/IQR to mean/SD`, "success");
        renderTable();
      } catch (e) {
        showNotification("Conversion failed: " + e.message, "error");
      }
    });

    // Personalized Dose Optimizer
    dom.optimizeDose?.addEventListener("click", () => {
      if (!state.modelParams) return showNotification("Fit a dose-response model first", "error");
      try {
        const age = parseFloat(dom.patientAge?.value) || 50;
        const weight = parseFloat(dom.patientWeight?.value) || 70;
        const renalFunction = parseFloat(dom.patientRenal?.value) || 90;

        const patientProfile = {
          age,
          weight,
          renalFunction,
          hepaticFunction: 'normal',
          geneticStatus: 'extensive'
        };

        const optimizer = new PersonalizedDoseOptimizer(null, PersonalizedDoseOptimizer.getDefaultCovariateEffects());

        const baseParams = {
          e0: state.modelParams.e0 || 0,
          emax: state.modelParams.emax || 1,
          ed50: state.modelParams.ed50 || 10,
          hill: state.modelParams.hill || 1,
          targetEffect: state.modelParams.emax * 0.8, // 80% of max
          maxDose: Math.max(...state.studies.map(s => s.dose)) * 1.5
        };

        const result = optimizer.findOptimalDose(patientProfile, baseParams);
        state.personalizedDose = result;

        dom.personalizedResult.textContent = result.optimalDose ?
          `Optimal dose: ${result.optimalDose.toFixed(2)} (expected effect: ${result.effect.toFixed(3)})` :
          result.message;

        showNotification("Personalized dose optimization complete", "success");
      } catch (e) {
        showNotification("Optimization failed: " + e.message, "error");
      }
    });

    // 3D Surface
    dom.generate3DSurface?.addEventListener("click", () => {
      if (!state.modelParams) return showNotification("Fit a dose-response model first", "error");
      try {
        const viz = new Interactive3DDoseResponse('plot');
        const doses = state.studies.map(s => s.dose);
        const minDose = Math.min(...doses);
        const maxDose = Math.max(...doses);

        const surface = viz.generateSurface(
          state.selectedModel || 'emax',
          state.modelParams,
          [minDose, maxDose],
          [20, 80], // Age range
          40
        );

        state.surface3D = surface;
        viz.render2DFallback(surface);

        showNotification("3D surface generated (2D projection shown)", "success");
      } catch (e) {
        showNotification("3D generation failed: " + e.message, "error");
      }
    });

    dom.export3DData?.addEventListener("click", () => {
      if (!state.surface3D) return showNotification("Generate 3D surface first", "error");
      try {
        const viz = new Interactive3DDoseResponse(null);
        const exportData = viz.exportForThreeJS(state.surface3D);
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "dose_response_3d_threejs.json";
        a.click();
        URL.revokeObjectURL(url);
        showNotification("3D data exported for Three.js", "success");
      } catch (e) {
        showNotification("Export failed: " + e.message, "error");
      }
    });

    // Data Quality Tests
    dom.runGRIME?.addEventListener("click", () => {
      if (!state.studies.length) return showNotification("No data loaded", "error");
      try {
        const dq = new DataQualityTests();
        const results = [];

        state.studies.forEach(s => {
          if (s.mean !== undefined || s.effect !== undefined) {
            const result = dq.grimeTest(s.mean ?? s.effect, s.n || 100, 1);
            results.push({ study: s.study, ...result });
          }
        });

        state.grimeResults = results;
        const failed = results.filter(r => !r.passed);
        dom.dataQualityResult.textContent = failed.length ?
          `GRIME: ${failed.length}/${results.length} studies flagged` :
          `GRIME: All ${results.length} studies pass`;

        showNotification(`GRIME test complete: ${failed.length} concerns`, failed.length ? "warning" : "success");
      } catch (e) {
        showNotification("GRIME test failed: " + e.message, "error");
      }
    });

    dom.runSPRITE?.addEventListener("click", () => {
      if (!state.studies.length) return showNotification("No data loaded", "error");
      try {
        const dq = new DataQualityTests();
        const results = [];

        state.studies.forEach(s => {
          if ((s.mean !== undefined || s.effect !== undefined) && (s.sd !== undefined || s.se !== undefined)) {
            const mean = s.mean ?? s.effect;
            const sd = s.sd ?? s.se * Math.sqrt(s.n || 100);
            const result = dq.spriteTest(mean, sd, s.n || 100, mean - 3*sd, mean + 3*sd, 1);
            results.push({ study: s.study, ...result });
          }
        });

        state.spriteResults = results;
        const failed = results.filter(r => !r.passed);
        dom.dataQualityResult.textContent = failed.length ?
          `SPRITE: ${failed.length}/${results.length} could not reconstruct` :
          `SPRITE: All ${results.length} studies reconstructible`;

        showNotification(`SPRITE test complete: ${failed.length} concerns`, failed.length ? "warning" : "success");
      } catch (e) {
        showNotification("SPRITE test failed: " + e.message, "error");
      }
    });

    dom.runRIVETS?.addEventListener("click", () => {
      if (!state.studies.length) return showNotification("No data loaded", "error");
      try {
        const dq = new DataQualityTests();
        const values = state.studies.map(s => s.effect).filter(v => v !== undefined);

        if (values.length < 10) return showNotification("Need at least 10 values for RIVETS", "error");

        const result = dq.rivetsTest(values);
        state.rivetsResult = result;

        dom.dataQualityResult.textContent = result.passed ?
          `RIVETS: No suspicious rounding (p=${result.pValue.toFixed(3)})` :
          `RIVETS: Suspicious rounding detected! (p=${result.pValue.toFixed(3)})`;

        showNotification(result.interpretation, result.passed ? "success" : "warning");
      } catch (e) {
        showNotification("RIVETS test failed: " + e.message, "error");
      }
    });

    dom.runBenford?.addEventListener("click", () => {
      if (!state.studies.length) return showNotification("No data loaded", "error");
      try {
        const dq = new DataQualityTests();
        const values = state.studies.map(s => s.effect).filter(v => v !== undefined && v > 0);

        if (values.length < 30) return showNotification("Need at least 30 positive values for Benford", "error");

        const result = dq.benfordTest(values);
        state.benfordResult = result;

        dom.dataQualityResult.textContent = result.passed ?
          `Benford: Consistent with natural data (p=${result.pValue.toFixed(3)})` :
          `Benford: Deviates from expected distribution (p=${result.pValue.toFixed(3)})`;

        showNotification(result.interpretation, result.passed ? "success" : "warning");
      } catch (e) {
        showNotification("Benford test failed: " + e.message, "error");
      }
    });

    // Live Meta-Analysis
    let liveMA = null;

    dom.startLiveMA?.addEventListener("click", () => {
      if (!state.studies.length) return showNotification("No data loaded", "error");
      try {
        liveMA = new LiveMetaAnalysis(state.studies.map(s => ({
          id: s.study,
          study: s.study,
          effect: s.effect,
          se: s.se,
          treatment: s.treatment,
          dose: s.dose
        })), {
          updateInterval: 5000, // 5 seconds for demo
          clinicalThreshold: 0.2
        });

        liveMA.subscribe(event => {
          if (event.type === 'ALERTS') {
            event.alerts.forEach(a => showNotification(a.message, a.severity === 'high' ? 'error' : 'warning'));
          } else if (event.type === 'STUDY_ADDED') {
            dom.liveMAStatus.textContent = `Added: ${event.study.study}, Effect now: ${event.newResult.effect.toFixed(3)}`;
          } else if (event.type === 'NEW_STUDY_DETECTED') {
            showNotification(`New study detected: ${event.study.study}`, "info");
          }
        });

        liveMA.start();
        dom.startLiveMA.disabled = true;
        dom.stopLiveMA.disabled = false;
        dom.liveMAStatus.textContent = "Live monitoring active...";
        showNotification("Live meta-analysis monitoring started", "success");
      } catch (e) {
        showNotification("Failed to start live MA: " + e.message, "error");
      }
    });

    dom.stopLiveMA?.addEventListener("click", () => {
      if (liveMA) {
        liveMA.stop();
        dom.startLiveMA.disabled = false;
        dom.stopLiveMA.disabled = true;
        dom.liveMAStatus.textContent = "Monitoring stopped";
        showNotification("Live monitoring stopped", "info");
      }
    });

    dom.exportLiveReport?.addEventListener("click", () => {
      if (!liveMA) return showNotification("Start live monitoring first", "error");
      try {
        const report = liveMA.exportUpdateReport();
        const blob = new Blob([report], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "living_meta_analysis_report.md";
        a.click();
        URL.revokeObjectURL(url);
        showNotification("Live MA report exported", "success");
      } catch (e) {
        showNotification("Export failed: " + e.message, "error");
      }
    });

    // Export Tier 1 Report
    dom.exportTier1Report?.addEventListener("click", () => {
      try {
        let report = "# Tier 1: Beyond R Analysis Report\\n\\n";
        report += `Generated: ${new Date().toISOString()}\\n\\n`;

        // GP Results
        if (state.gpPredictions) {
          report += "## Gaussian Process Dose-Response\\n\\n";
          report += `- Kernel: ${state.gpPredictions.hyperparameters.kernel}\\n`;
          report += `- Length scale: ${state.gpPredictions.hyperparameters.lengthScale.toFixed(3)}\\n`;
          report += `- Signal variance: ${state.gpPredictions.hyperparameters.signalVariance.toFixed(4)}\\n\\n`;
        }

        // Quantile Results
        if (state.quantileResult) {
          report += "## Quantile Meta-Analysis\\n\\n";
          report += `- Pooled median: ${state.quantileResult.pooledMedian.toFixed(4)}\\n`;
          report += `- 95% CI: [${state.quantileResult.ci95[0].toFixed(4)}, ${state.quantileResult.ci95[1].toFixed(4)}]\\n`;
          report += `- I²: ${state.quantileResult.I2.toFixed(1)}%\\n\\n`;
        }

        // Personalized Dose
        if (state.personalizedDose) {
          report += "## Personalized Dosing\\n\\n";
          report += `- Optimal dose: ${state.personalizedDose.optimalDose?.toFixed(2) || 'N/A'}\\n`;
          report += `- Expected effect: ${state.personalizedDose.effect?.toFixed(4) || 'N/A'}\\n\\n`;
        }

        // Data Quality
        if (state.grimeResults) {
          const failed = state.grimeResults.filter(r => !r.passed);
          report += "## Data Quality Tests\\n\\n";
          report += `### GRIME Test\\n`;
          report += `- Studies tested: ${state.grimeResults.length}\\n`;
          report += `- Studies flagged: ${failed.length}\\n`;
          if (failed.length) {
            report += `- Flagged studies: ${failed.map(f => f.study).join(', ')}\\n`;
          }
          report += "\\n";
        }

        const blob = new Blob([report], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "tier1_beyond_r_report.md";
        a.click();
        URL.revokeObjectURL(url);
        showNotification("Tier 1 report exported", "success");
      } catch (e) {
        showNotification("Export failed: " + e.message, "error");
      }
    });

    // Export GP Curve CSV
    dom.exportGPCurve?.addEventListener("click", () => {
      if (!state.gpPredictions) return showNotification("Fit GP model first", "error");
      try {
        let csv = "dose,mean,std,ci95_lower,ci95_upper\\n";
        const pred = state.gpPredictions;
        for (let i = 0; i < pred.doses.length; i++) {
          csv += `${pred.doses[i]},${pred.mean[i]},${pred.std[i]},${pred.ci95Lower[i]},${pred.ci95Upper[i]}\\n`;
        }

        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "gp_dose_response_curve.csv";
        a.click();
        URL.revokeObjectURL(url);
        showNotification("GP curve exported", "success");
      } catch (e) {
        showNotification("Export failed: " + e.message, "error");
      }
    });'''

    content = content[:insert_pos] + new_handlers + content[insert_pos:]
    print('Added Tier 1 event handlers!')
else:
    print('Could not find event handlers section. Trying alternative...')
    # Append before the closing of the init function
    pattern3 = r'(// === END OF MAIN INITIALIZATION ===)'
    match3 = re.search(pattern3, content)
    if match3:
        content = content[:match3.start()] + new_handlers + '\n\n    ' + content[match3.start():]
        print('Added handlers at end of init')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done adding Tier 1 handlers!')
