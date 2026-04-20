# PowerShell script to update sensitivity analysis

$filePath = "C:\dosehtml\dose-response-pro-v4-light.html"
$content = Get-Content $filePath -Raw

# Find and replace the UI panel first (already done in previous edit)
# Now we need to update the JavaScript functions

# Read the new functions
$newFunctions = @'
    function sensitivityAnalysis(studies, modelType = 'gls') {
      if (studies.length < 3) {
        throw new Error('Need at least 3 studies for sensitivity analysis');
      }

      const settings = getAnalysisSettings();
      const refDose = settings.referenceDose || 0;

      // Fit full model with all studies
      let fullModel;

      switch (modelType) {
        case 'gls':
          fullModel = glsDoseResponse(studies, refDose, settings);
          break;
        case 'linear':
          fullModel = linearDoseResponse(studies, refDose, settings);
          break;
        case 'quadratic':
          fullModel = quadraticDoseResponse(studies, refDose, settings);
          break;
        default:
          fullModel = glsDoseResponse(studies, refDose, settings);
      }

      // Extract original values
      const originalSlope = fullModel.coefficients?.[1]?.estimate || fullModel.slope || 0;
      const originalSE = fullModel.coefficients?.[1]?.se || fullModel.seSlope || 0;
      const originalI2 = fullModel.I2 || 0;

      // Leave-one-out analysis
      const leaveOneOut = [];

      for (let i = 0; i < studies.length; i++) {
        const remainingStudies = studies.filter((_, idx) => idx !== i);

        if (remainingStudies.length < 2) continue;

        try {
          let model;
          switch (modelType) {
            case 'gls':
              model = glsDoseResponse(remainingStudies, refDose, settings);
              break;
            case 'linear':
              model = linearDoseResponse(remainingStudies, refDose, settings);
              break;
            case 'quadratic':
              model = quadraticDoseResponse(remainingStudies, refDose, settings);
              break;
            default:
              model = glsDoseResponse(remainingStudies, refDose, settings);
          }

          const slope = model.coefficients?.[1]?.estimate || model.slope || 0;
          const se = model.coefficients?.[1]?.se || model.seSlope || 0;
          const i2 = model.I2 || 0;

          // Calculate influence metrics
          const slopeChange = originalSlope !== 0 ? ((slope - originalSlope) / originalSlope * 100) : 0;
          const i2Change = i2 - originalI2;

          // Cook's distance (simplified)
          const cookD = originalSE !== 0 ? Math.pow(slope - originalSlope, 2) / (originalSE * originalSE) : 0;

          // DFITS (simplified)
          const dfits = se !== 0 ? (slope - originalSlope) / se : 0;

          leaveOneOut.push({
            omitted: studies[i].name,
            slope: slope,
            se: se,
            i2: i2,
            slopeChange: parseFloat(slopeChange.toFixed(2)),
            i2Change: parseFloat(i2Change.toFixed(1)),
            cookD: cookD,
            dfits: Math.abs(dfits),
            influential: Math.abs(dfits) > 2 || cookD > 4
          });
        } catch (e) {
          console.warn('Study failed in LOO:', studies[i].name, e.message);
        }
      }

      return {
        fullModel: fullModel,
        originalSlope: originalSlope,
        originalSE: originalSE,
        originalI2: originalI2,
        leaveOneOut: leaveOneOut,
        influentialStudies: leaveOneOut.filter(s => s.influential),
        modelType: modelType
      };
    }
'@

Write-Host "Sensitivity analysis update script created"
