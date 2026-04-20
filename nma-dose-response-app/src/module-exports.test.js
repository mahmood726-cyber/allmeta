import * as meta from './meta-analysis/index.js';
import * as imputation from './imputation/index.js';
import * as nma from './network-meta-analysis/index.js';
import * as doseResponse from './dose-response/index.js';
import * as publicationBias from './publication-bias/index.js';
import * as bayesianNonparametric from './bayesian-nonparametric/index.js';
import * as multivariate from './multivariate/index.js';
import * as simulation from './simulation/index.js';

describe('Module Index Exports', () => {
  test('meta-analysis exports are available', () => {
    expect(meta.RobustTMetaAnalysis).toBeDefined();
    expect(meta.ARFISMetaAnalysis).toBeDefined();
    expect(meta.ComprehensivePIEvaluation).toBeDefined();
    expect(meta.EdgingtonMethod).toBeDefined();
    expect(meta.NonNormalRandomEffects).toBeDefined();
  });

  test('imputation exports are available', () => {
    expect(imputation.CrossSiteImputation).toBeDefined();
    expect(imputation.SystematicMissingImputation).toBeDefined();
    expect(imputation.MetaImputationBalanced).toBeDefined();
  });

  test('network meta-analysis exports are available', () => {
    expect(nma.OneStepExactLikelihoodNMA).toBeDefined();
    expect(nma.CompositeLikelihoodNMA).toBeDefined();
    expect(nma.BayesianOutlierDetectionNMA).toBeDefined();
  });

  test('dose-response exports are available', () => {
    expect(doseResponse.SemiParametricBMD).toBeDefined();
    expect(doseResponse.BayesianModelAveragedBMD).toBeDefined();
    expect(doseResponse.BMDUncertaintyReduction).toBeDefined();
  });

  test('publication bias exports are available', () => {
    expect(publicationBias.IPWPublicationBiasAdjustment).toBeDefined();
  });

  test('bayesian nonparametric exports are available', () => {
    expect(bayesianNonparametric.DependentTailFreeClustering).toBeDefined();
    expect(bayesianNonparametric.NonparametricDynamicBorrowing).toBeDefined();
    expect(bayesianNonparametric.PriorSensitivityAnalysis).toBeDefined();
    expect(bayesianNonparametric.BiasCorrectedBNP).toBeDefined();
  });

  test('multivariate exports are available', () => {
    expect(multivariate.DanielsHughesSurrogateEvaluation).toBeDefined();
    expect(multivariate.fastMETA).toBeDefined();
  });

  test('simulation exports are available', () => {
    expect(simulation.SimulationPowerAnalysis).toBeDefined();
  });
});
