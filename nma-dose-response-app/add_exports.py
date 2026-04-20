"""Add global exports for testing"""

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Add global exports before the closing of IIFE
exports = '''
  // ============================================================================
  // GLOBAL EXPORTS FOR TESTING
  // Expose key classes and utilities to window for validation and testing
  // ============================================================================
  window.NMAStudio = {
    // Statistical utilities
    StatUtils,

    // Validation
    ValidationSuite,
    EdgeCaseHandler,

    // Meta-analysis classes
    TrimAndFill,
    EggerTest,
    BeggMazumdarTest,
    PetersTest,
    PETPEESE,
    REMLEstimator,

    // Advanced methods
    BootstrapCI,
    InfluenceDiagnostics,
    ModelFitStatistics,

    // Publication bias
    ZCurveAnalysis,
    CumulativeMetaAnalysis,
    LeaveOneOutBias,
    SelectionModelComparison,
    ContourFunnelPlot,

    // Dose-response
    GaussianProcessDoseResponse,
    OptimalDoseFinder,

    // NMA specific
    ComponentNMA,
    TransitivityAssessment,
    DesignByTreatmentInteraction,

    // Utilities
    safeFormat,
    numFmt,
    predictionInterval,
    hartungKnappAdjustment
  };

  // Also expose key classes directly for convenience
  window.StatUtils = StatUtils;
  window.ValidationSuite = ValidationSuite;
  window.BootstrapCI = BootstrapCI;
  window.InfluenceDiagnostics = InfluenceDiagnostics;
  window.ModelFitStatistics = ModelFitStatistics;
  window.EdgeCaseHandler = EdgeCaseHandler;
  window.TrimAndFill = TrimAndFill;
  window.EggerTest = EggerTest;
  window.REMLEstimator = REMLEstimator;
  window.BeggMazumdarTest = BeggMazumdarTest;
  window.PetersTest = PetersTest;
  window.PETPEESE = PETPEESE;
  window.ZCurveAnalysis = ZCurveAnalysis;
  window.CumulativeMetaAnalysis = CumulativeMetaAnalysis;
  window.LeaveOneOutBias = LeaveOneOutBias;

'''

# Find the end of the IIFE and insert exports before it
old_end = '''  init();
})();'''

new_end = exports + '''
  init();
})();'''

if old_end in content:
    content = content.replace(old_end, new_end)
    print('Added global exports for testing')
else:
    print('Could not find insertion point')

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'app.js size: {len(content):,} chars')
