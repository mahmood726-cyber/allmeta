import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the closing of bindEvents function - just before "async function init()"
pattern = r'(window\.addEventListener\("resize", \(\) => \{[^}]+\}\);)\s*(\})\s*(async function init\(\))'
match = re.search(pattern, content)

if match:
    insert_pos = match.end(1)

    tier1_handlers = '''

    // =========================================================================
    // TIER 1: BEYOND R EVENT HANDLERS
    // =========================================================================

    // Gaussian Process Dose-Response
    if (dom.fitGP) {
      dom.fitGP.addEventListener("click", () => {
        if (!state.studies || !state.studies.length) {
          if (state.rawData && state.rawData.length) {
            state.studies = state.rawData;
          } else {
            showNotification("No data loaded", "error");
            return;
          }
        }
        try {
          const kernel = dom.gpKernel?.value || 'rbf';
          const doses = state.studies.map(s => s.dose);
          const effects = state.studies.map(s => s.effect);
          const ses = state.studies.map(s => s.se);

          const gp = new GaussianProcessDoseResponse({ kernel });
          gp.fit(doses, effects, ses);

          const minDose = Math.min(...doses);
          const maxDose = Math.max(...doses);
          const predDoses = [];
          for (let d = minDose; d <= maxDose; d += (maxDose - minDose) / 100) {
            predDoses.push(d);
          }

          const predictions = gp.predict(predDoses);
          state.gpPredictions = { doses: predDoses, ...predictions };
          state.gpModel = gp;

          if (dom.gpResult) {
            dom.gpResult.textContent = "GP fitted: l=" + predictions.hyperparameters.lengthScale.toFixed(2) + ", sigma=" + predictions.hyperparameters.signalVariance.toFixed(3);
          }
          showNotification("Gaussian Process model fitted successfully", "success");
        } catch (e) {
          showNotification("GP fitting failed: " + e.message, "error");
        }
      });
    }

    if (dom.sampleGPPosterior) {
      dom.sampleGPPosterior.addEventListener("click", () => {
        if (!state.gpModel) {
          showNotification("Fit GP model first", "error");
          return;
        }
        try {
          const doses = state.gpPredictions?.doses || [];
          if (!doses.length) return;

          const samples = state.gpModel.samplePosterior(doses, 50);
          state.gpSamples = samples;
          showNotification("Drew 50 posterior samples", "success");
        } catch (e) {
          showNotification("Sampling failed: " + e.message, "error");
        }
      });
    }

    // Quantile Meta-Analysis
    if (dom.poolMedians) {
      dom.poolMedians.addEventListener("click", () => {
        if (!state.rawData || !state.rawData.length) {
          showNotification("No data loaded", "error");
          return;
        }
        try {
          const qa = new QuantileMetaAnalysis();
          const studies = state.rawData.map(s => ({
            median: s.median ?? s.effect,
            q1: s.q1,
            q3: s.q3,
            n: s.n || 100,
            se_median: s.se_median || s.se
          }));

          const result = qa.poolQuantiles(studies);
          state.quantileResult = result;

          if (dom.quantileResult) {
            dom.quantileResult.textContent = "Pooled median: " + result.pooledMedian.toFixed(3) + " (95% CI: " + result.ci95[0].toFixed(3) + ", " + result.ci95[1].toFixed(3) + "), I^2=" + result.I2.toFixed(1) + "%";
          }
          showNotification("Quantile meta-analysis complete", "success");
        } catch (e) {
          showNotification("Quantile MA failed: " + e.message, "error");
        }
      });
    }

    if (dom.poolIQRs) {
      dom.poolIQRs.addEventListener("click", () => {
        if (!state.rawData || !state.rawData.length) {
          showNotification("No data loaded", "error");
          return;
        }
        try {
          const qa = new QuantileMetaAnalysis();
          const studies = state.rawData.map(s => ({
            iqr: s.q3 && s.q1 ? s.q3 - s.q1 : (s.sd || s.se * Math.sqrt(s.n || 100)) * 1.35,
            n: s.n || 100
          }));

          const result = qa.poolIQRs(studies);
          if (dom.quantileResult) {
            dom.quantileResult.textContent = "Pooled IQR: " + result.pooledIQR.toFixed(3) + " (95% CI: " + result.ci95[0].toFixed(3) + ", " + result.ci95[1].toFixed(3) + ")";
          }
          showNotification("IQR pooling complete", "success");
        } catch (e) {
          showNotification("IQR pooling failed: " + e.message, "error");
        }
      });
    }

    if (dom.estimateMeanSD) {
      dom.estimateMeanSD.addEventListener("click", () => {
        if (!state.rawData || !state.rawData.length) {
          showNotification("No data loaded", "error");
          return;
        }
        try {
          const qa = new QuantileMetaAnalysis();
          let converted = 0;

          state.rawData.forEach(s => {
            if (s.median !== undefined) {
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

          showNotification("Converted " + converted + " studies from median/IQR to mean/SD", "success");
        } catch (e) {
          showNotification("Conversion failed: " + e.message, "error");
        }
      });
    }

    // Personalized Dose Optimizer
    if (dom.optimizeDose) {
      dom.optimizeDose.addEventListener("click", () => {
        if (!state.currentModel) {
          showNotification("Fit a dose-response model first", "error");
          return;
        }
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

          const params = state.currentModel.params || state.currentModel;
          const baseParams = {
            e0: params.e0 || 0,
            emax: params.emax || 1,
            ed50: params.ed50 || 10,
            hill: params.hill || 1,
            targetEffect: (params.emax || 1) * 0.8,
            maxDose: 100
          };

          const result = optimizer.findOptimalDose(patientProfile, baseParams);
          state.personalizedDose = result;

          if (dom.personalizedResult) {
            dom.personalizedResult.textContent = result.optimalDose ?
              "Optimal dose: " + result.optimalDose.toFixed(2) + " (expected effect: " + result.effect.toFixed(3) + ")" :
              result.message || "Could not optimize";
          }

          showNotification("Personalized dose optimization complete", "success");
        } catch (e) {
          showNotification("Optimization failed: " + e.message, "error");
        }
      });
    }

    // 3D Surface
    if (dom.generate3DSurface) {
      dom.generate3DSurface.addEventListener("click", () => {
        if (!state.currentModel) {
          showNotification("Fit a dose-response model first", "error");
          return;
        }
        try {
          const viz = new Interactive3DDoseResponse('doseChart');
          const doses = state.rawData.map(s => s.dose);
          const minDose = Math.min(...doses);
          const maxDose = Math.max(...doses);

          const params = state.currentModel.params || state.currentModel;
          const surface = viz.generateSurface(
            state.selectedModel || 'emax',
            params,
            [minDose, maxDose],
            [20, 80],
            40
          );

          state.surface3D = surface;
          viz.render2DFallback(surface);

          showNotification("3D surface generated (2D projection shown)", "success");
        } catch (e) {
          showNotification("3D generation failed: " + e.message, "error");
        }
      });
    }

    if (dom.export3DData) {
      dom.export3DData.addEventListener("click", () => {
        if (!state.surface3D) {
          showNotification("Generate 3D surface first", "error");
          return;
        }
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
    }

    // Data Quality Tests
    if (dom.runGRIME) {
      dom.runGRIME.addEventListener("click", () => {
        if (!state.rawData || !state.rawData.length) {
          showNotification("No data loaded", "error");
          return;
        }
        try {
          const dq = new DataQualityTests();
          const results = [];

          state.rawData.forEach(s => {
            const mean = s.mean ?? s.effect;
            if (mean !== undefined) {
              const result = dq.grimeTest(mean, s.n || 100, 1);
              results.push({ study: s.study, ...result });
            }
          });

          state.grimeResults = results;
          const failed = results.filter(r => !r.passed);
          if (dom.dataQualityResult) {
            dom.dataQualityResult.textContent = failed.length ?
              "GRIME: " + failed.length + "/" + results.length + " studies flagged" :
              "GRIME: All " + results.length + " studies pass";
          }

          showNotification("GRIME test complete: " + failed.length + " concerns", failed.length ? "warning" : "success");
        } catch (e) {
          showNotification("GRIME test failed: " + e.message, "error");
        }
      });
    }

    if (dom.runSPRITE) {
      dom.runSPRITE.addEventListener("click", () => {
        if (!state.rawData || !state.rawData.length) {
          showNotification("No data loaded", "error");
          return;
        }
        try {
          const dq = new DataQualityTests();
          const results = [];

          state.rawData.forEach(s => {
            const mean = s.mean ?? s.effect;
            const sd = s.sd ?? (s.se ? s.se * Math.sqrt(s.n || 100) : null);
            if (mean !== undefined && sd !== undefined) {
              const result = dq.spriteTest(mean, sd, s.n || 100, mean - 3*sd, mean + 3*sd, 1);
              results.push({ study: s.study, ...result });
            }
          });

          state.spriteResults = results;
          const failed = results.filter(r => !r.passed);
          if (dom.dataQualityResult) {
            dom.dataQualityResult.textContent = failed.length ?
              "SPRITE: " + failed.length + "/" + results.length + " could not reconstruct" :
              "SPRITE: All " + results.length + " studies reconstructible";
          }

          showNotification("SPRITE test complete: " + failed.length + " concerns", failed.length ? "warning" : "success");
        } catch (e) {
          showNotification("SPRITE test failed: " + e.message, "error");
        }
      });
    }

    if (dom.runRIVETS) {
      dom.runRIVETS.addEventListener("click", () => {
        if (!state.rawData || !state.rawData.length) {
          showNotification("No data loaded", "error");
          return;
        }
        try {
          const dq = new DataQualityTests();
          const values = state.rawData.map(s => s.effect).filter(v => v !== undefined);

          if (values.length < 10) {
            showNotification("Need at least 10 values for RIVETS", "error");
            return;
          }

          const result = dq.rivetsTest(values);
          state.rivetsResult = result;

          if (dom.dataQualityResult) {
            dom.dataQualityResult.textContent = result.passed ?
              "RIVETS: No suspicious rounding (p=" + result.pValue.toFixed(3) + ")" :
              "RIVETS: Suspicious rounding detected! (p=" + result.pValue.toFixed(3) + ")";
          }

          showNotification(result.interpretation, result.passed ? "success" : "warning");
        } catch (e) {
          showNotification("RIVETS test failed: " + e.message, "error");
        }
      });
    }

    if (dom.runBenford) {
      dom.runBenford.addEventListener("click", () => {
        if (!state.rawData || !state.rawData.length) {
          showNotification("No data loaded", "error");
          return;
        }
        try {
          const dq = new DataQualityTests();
          const values = state.rawData.map(s => s.effect).filter(v => v !== undefined && v > 0);

          if (values.length < 30) {
            showNotification("Need at least 30 positive values for Benford", "error");
            return;
          }

          const result = dq.benfordTest(values);
          state.benfordResult = result;

          if (dom.dataQualityResult) {
            dom.dataQualityResult.textContent = result.passed ?
              "Benford: Consistent with natural data (p=" + result.pValue.toFixed(3) + ")" :
              "Benford: Deviates from expected distribution (p=" + result.pValue.toFixed(3) + ")";
          }

          showNotification(result.interpretation, result.passed ? "success" : "warning");
        } catch (e) {
          showNotification("Benford test failed: " + e.message, "error");
        }
      });
    }

    // Live Meta-Analysis
    let liveMA = null;

    if (dom.startLiveMA) {
      dom.startLiveMA.addEventListener("click", () => {
        if (!state.rawData || !state.rawData.length) {
          showNotification("No data loaded", "error");
          return;
        }
        try {
          liveMA = new LiveMetaAnalysis(state.rawData.map(s => ({
            id: s.study,
            study: s.study,
            effect: s.effect,
            se: s.se,
            treatment: s.treatment,
            dose: s.dose
          })), {
            updateInterval: 5000,
            clinicalThreshold: 0.2
          });

          liveMA.subscribe(event => {
            if (event.type === 'ALERTS') {
              event.alerts.forEach(a => showNotification(a.message, a.severity === 'high' ? 'error' : 'warning'));
            } else if (event.type === 'STUDY_ADDED') {
              if (dom.liveMAStatus) {
                dom.liveMAStatus.textContent = "Added: " + event.study.study + ", Effect now: " + event.newResult.effect.toFixed(3);
              }
            } else if (event.type === 'NEW_STUDY_DETECTED') {
              showNotification("New study detected: " + event.study.study, "info");
            }
          });

          liveMA.start();
          dom.startLiveMA.disabled = true;
          if (dom.stopLiveMA) dom.stopLiveMA.disabled = false;
          if (dom.liveMAStatus) dom.liveMAStatus.textContent = "Live monitoring active...";
          showNotification("Live meta-analysis monitoring started", "success");
        } catch (e) {
          showNotification("Failed to start live MA: " + e.message, "error");
        }
      });
    }

    if (dom.stopLiveMA) {
      dom.stopLiveMA.addEventListener("click", () => {
        if (liveMA) {
          liveMA.stop();
          dom.startLiveMA.disabled = false;
          dom.stopLiveMA.disabled = true;
          if (dom.liveMAStatus) dom.liveMAStatus.textContent = "Monitoring stopped";
          showNotification("Live monitoring stopped", "info");
        }
      });
    }

    if (dom.exportLiveReport) {
      dom.exportLiveReport.addEventListener("click", () => {
        if (!liveMA) {
          showNotification("Start live monitoring first", "error");
          return;
        }
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
    }

    // Export Tier 1 Report
    if (dom.exportTier1Report) {
      dom.exportTier1Report.addEventListener("click", () => {
        try {
          let report = "# Tier 1: Beyond R Analysis Report\\n\\n";
          report += "Generated: " + new Date().toISOString() + "\\n\\n";

          if (state.gpPredictions) {
            report += "## Gaussian Process Dose-Response\\n\\n";
            report += "- Kernel: " + state.gpPredictions.hyperparameters.kernel + "\\n";
            report += "- Length scale: " + state.gpPredictions.hyperparameters.lengthScale.toFixed(3) + "\\n";
            report += "- Signal variance: " + state.gpPredictions.hyperparameters.signalVariance.toFixed(4) + "\\n\\n";
          }

          if (state.quantileResult) {
            report += "## Quantile Meta-Analysis\\n\\n";
            report += "- Pooled median: " + state.quantileResult.pooledMedian.toFixed(4) + "\\n";
            report += "- 95% CI: [" + state.quantileResult.ci95[0].toFixed(4) + ", " + state.quantileResult.ci95[1].toFixed(4) + "]\\n";
            report += "- I2: " + state.quantileResult.I2.toFixed(1) + "%\\n\\n";
          }

          if (state.personalizedDose) {
            report += "## Personalized Dosing\\n\\n";
            report += "- Optimal dose: " + (state.personalizedDose.optimalDose?.toFixed(2) || 'N/A') + "\\n";
            report += "- Expected effect: " + (state.personalizedDose.effect?.toFixed(4) || 'N/A') + "\\n\\n";
          }

          if (state.grimeResults) {
            const failed = state.grimeResults.filter(r => !r.passed);
            report += "## Data Quality Tests\\n\\n";
            report += "### GRIME Test\\n";
            report += "- Studies tested: " + state.grimeResults.length + "\\n";
            report += "- Studies flagged: " + failed.length + "\\n";
            if (failed.length) {
              report += "- Flagged studies: " + failed.map(f => f.study).join(', ') + "\\n";
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
    }

    // Export GP Curve CSV
    if (dom.exportGPCurve) {
      dom.exportGPCurve.addEventListener("click", () => {
        if (!state.gpPredictions) {
          showNotification("Fit GP model first", "error");
          return;
        }
        try {
          let csv = "dose,mean,std,ci95_lower,ci95_upper\\n";
          const pred = state.gpPredictions;
          for (let i = 0; i < pred.doses.length; i++) {
            csv += pred.doses[i] + "," + pred.mean[i] + "," + pred.std[i] + "," + pred.ci95Lower[i] + "," + pred.ci95Upper[i] + "\\n";
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
      });
    }
'''

    content = content[:insert_pos] + tier1_handlers + content[insert_pos:]
    print('Added Tier 1 event handlers!')
else:
    print('Could not find bindEvents closing')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done!')
