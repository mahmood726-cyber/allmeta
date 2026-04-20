// Example of the new convergence diagnostics structure
// This is what the fitBayesianModel function now returns

{
  type: 'bayesian',
  name: 'Bayesian MCMC',
  description: 'Probabilistic framework with MCMC sampling',
  mcmcSettings: {
    nBurnin: 5000,
    nSamples: 10000,
    thin: 5,
    effectiveSamples: 2000,
    nChains: 3  // NEW: Number of chains run
  },
  convergence: {  // NEW: Convergence diagnostics object
    rhat: {  // Gelman-Rubin statistics
      beta0: 1.002,  // Good: < 1.1
      beta1: 1.005,  // Good: < 1.1
      beta2: 1.008,  // Good: < 1.1
      sigma: 1.001   // Good: < 1.1
    },
    ess: {  // Effective sample sizes
      beta0: 1850,  // Good: > 400
      beta1: 1920,  // Good: > 400
      beta2: 1780,  // Good: > 400
      sigma: 2050   // Good: > 400
    },
    acceptanceRate: 0.35,  // Good: 20-50% range
    chainAcceptanceRates: [0.34, 0.36, 0.35],  // Per-chain rates
    warnings: []  // Empty if all diagnostics pass
  },
  traceData: [  // NEW: Trace plot data for each chain
    {
      iterations: [0, 10, 20, 30, ...],
      beta0: [2.5, 2.51, 2.49, ...],
      beta1: [0.1, 0.09, 0.11, ...],
      beta2: [-0.01, -0.02, -0.01, ...],
      sigma: [0.5, 0.51, 0.49, ...]
    },
    // ... 2 more chains
  ],
  coefficients: [
    { name: 'Intercept', estimate: 2.5, se: 0.2, ciLower: 2.1, ciUpper: 2.9, pValue: 0.05 },
    { name: 'Linear (dose)', estimate: 0.1, se: 0.05, ciLower: 0.01, ciUpper: 0.2, pValue: 0.03 },  // Now using proper Bayesian p-value
    { name: 'Quadratic (dose²)', estimate: -0.01, se: 0.01, ciLower: -0.03, ciUpper: 0.01, pValue: 0.15 }  // Now using proper Bayesian p-value
  ],
  pTrend: 0.03,  // Proper Bayesian p-value
  pNonlinear: 0.15,  // Proper Bayesian p-value
  // ... rest of the return object
}

// Example with convergence issues:
{
  convergence: {
    rhat: {
      beta0: 1.15,  // Warning: > 1.1
      beta1: 1.02,
      beta2: 1.08,
      sigma: 1.01
    },
    ess: {
      beta0: 350,  // Warning: < 400
      beta1: 1920,
      beta2: 1780,
      sigma: 2050
    },
    acceptanceRate: 0.15,  // Warning: < 20%
    chainAcceptanceRates: [0.14, 0.16, 0.15],
    warnings: [
      'R-hat > 1.1: Chains may not have converged. Consider increasing burn-in.',
      'ESS < 400: Low effective sample size. Consider increasing iterations.',
      'Acceptance rate < 20%: Proposal scale may be too large.'
    ]
  }
}
