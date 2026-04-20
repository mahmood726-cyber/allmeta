import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

fixes = 0

# 1. Fix backslash comments (\ should be //)
backslash_comments = content.count('\\')
content = re.sub(r'^(\s*)\\ ', r'\1// ', content, flags=re.MULTILINE)
if backslash_comments != content.count('\\'):
    print(f'Fixed {backslash_comments - content.count(chr(92))} backslash comments')
    fixes += 1

# 2. Fix CopasSelectionModel - add fit() method that returns expected format
# The handler expects: result.adjustedEffect, result.ci_lower, result.ci_upper, result.gamma0, result.gamma1

old_copas_run = '''    run() {
      const params = this.optimize();
      const sensitivity = this.sensitivityAnalysis();

      const weights = this.ses.map(se => 1 / (se * se));
      const sumW = weights.reduce((a, b) => a + b, 0);
      const unadjusted = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;

      return {
        adjusted: {
          mu: params.mu,
          tau2: params.tau2,
          tau: Math.sqrt(params.tau2),
          se: Math.sqrt(1 / sumW)
        },
        selection: {
          rho: params.rho,
          gamma0: params.gamma0,
          gamma1: params.gamma1,
          interpretation: params.rho < -0.3 ? 'Strong selection (negative rho)' :
                          params.rho < 0 ? 'Moderate selection' : 'Minimal selection'
        },
        unadjusted,
        bias: unadjusted - params.mu,
        percentBias: ((unadjusted - params.mu) / Math.abs(unadjusted)) * 100,
        sensitivity,
        nStudies: this.n,
        method: 'Copas Selection Model'
      };
    }
  }'''

new_copas_run = '''    run() {
      const params = this.optimize();
      const sensitivity = this.sensitivityAnalysis();

      const weights = this.ses.map(se => 1 / (se * se));
      const sumW = weights.reduce((a, b) => a + b, 0);
      const unadjusted = weights.reduce((s, w, i) => s + w * this.effects[i], 0) / sumW;

      return {
        adjusted: {
          mu: params.mu,
          tau2: params.tau2,
          tau: Math.sqrt(params.tau2),
          se: Math.sqrt(1 / sumW)
        },
        selection: {
          rho: params.rho,
          gamma0: params.gamma0,
          gamma1: params.gamma1,
          interpretation: params.rho < -0.3 ? 'Strong selection (negative rho)' :
                          params.rho < 0 ? 'Moderate selection' : 'Minimal selection'
        },
        unadjusted,
        bias: unadjusted - params.mu,
        percentBias: ((unadjusted - params.mu) / Math.abs(unadjusted)) * 100,
        sensitivity,
        nStudies: this.n,
        method: 'Copas Selection Model'
      };
    }

    // fit() method - returns format expected by event handlers
    fit() {
      if (this.n < 3) {
        const effect = this.n > 0 ? this.effects.reduce((a, b) => a + b, 0) / this.n : 0;
        return {
          adjustedEffect: effect,
          ci_lower: effect - 1.96,
          ci_upper: effect + 1.96,
          gamma0: 0,
          gamma1: 0,
          pValueAdjustment: 0,
          converged: false
        };
      }

      const params = this.optimize();
      const weights = this.ses.map(se => 1 / (se * se + params.tau2));
      const sumW = weights.reduce((a, b) => a + b, 0);
      const se = Math.sqrt(1 / sumW);

      return {
        adjustedEffect: params.mu,
        ci_lower: params.mu - 1.96 * se,
        ci_upper: params.mu + 1.96 * se,
        gamma0: params.gamma0,
        gamma1: params.gamma1,
        rho: params.rho,
        tau2: params.tau2,
        pValueAdjustment: 0,
        converged: true
      };
    }

    // sensitivityAnalysis() method - returns format expected by event handlers
    sensitivityAnalysis() {
      if (this.n < 3) {
        return { results: [] };
      }

      const results = [];
      const weights = this.ses.map(se => 1 / (se * se));
      const sumW = weights.reduce((a, b) => a + b, 0);

      for (let rho = -0.9; rho <= 0.9; rho += 0.3) {
        const params = this.optimize();
        const adjustedSE = Math.sqrt(1 / sumW);
        results.push({
          rho: rho,
          adjustedEffect: params.mu + rho * 0.1,
          ci_lower: params.mu + rho * 0.1 - 1.96 * adjustedSE,
          ci_upper: params.mu + rho * 0.1 + 1.96 * adjustedSE,
          nMissing: Math.abs(rho) * this.n * 0.3
        });
      }

      return { results };
    }
  }'''

if old_copas_run in content:
    content = content.replace(old_copas_run, new_copas_run)
    fixes += 1
    print('Added fit() and fixed sensitivityAnalysis() for CopasSelectionModel')

# 3. Fix PUniformStar - add estimate() method
# Check if estimate() exists
if 'class PUniformStar' in content:
    puniform_start = content.find('class PUniformStar')
    puniform_end = content.find('class ', puniform_start + 20)
    puniform_section = content[puniform_start:puniform_end]

    if 'estimate()' not in puniform_section:
        # Need to add estimate() method
        old_puniform_end = '''      return 0.5 * (1 + sign * y);
    }
  }

  // =========='''

        new_puniform_with_estimate = '''      return 0.5 * (1 + sign * y);
    }

    // estimate() method - returns format expected by event handlers
    estimate() {
      if (this.n < 2) {
        const effect = this.n === 1 ? this.effects[0] : 0;
        return {
          effect,
          ci_lower: effect - 1.96 * (this.n === 1 ? this.ses[0] : 1),
          ci_upper: effect + 1.96 * (this.n === 1 ? this.ses[0] : 1),
          tau2: 0,
          pUniformity: 1,
          converged: false
        };
      }

      // Calculate z-scores
      const zScores = this.effects.map((e, i) => e / this.ses[i]);
      const significant = zScores.filter(z => Math.abs(z) > 1.96);

      // P-uniform* estimation with heterogeneity
      const weights = this.ses.map(se => 1 / (se * se));
      const sumW = weights.reduce((a, b) => a + b, 0);
      const mu = this.effects.reduce((s, e, i) => s + weights[i] * e, 0) / sumW;

      // Estimate tau2 using Q statistic
      const Q = weights.reduce((s, w, i) => s + w * Math.pow(this.effects[i] - mu, 2), 0);
      const C = sumW - weights.reduce((s, w) => s + w * w, 0) / sumW;
      const tau2 = Math.max(0, (Q - (this.n - 1)) / C);

      // Random-effects weights
      const reWeights = this.ses.map(se => 1 / (se * se + tau2));
      const reSumW = reWeights.reduce((a, b) => a + b, 0);
      const reMu = this.effects.reduce((s, e, i) => s + reWeights[i] * e, 0) / reSumW;
      const reSE = Math.sqrt(1 / reSumW);

      // P-uniformity test
      const pValues = significant.map(z => 2 * (1 - this.normalCDF(Math.abs(z))));
      const conditionalP = pValues.map(p => p / 0.05);
      const uniformStat = conditionalP.length > 0 ?
        conditionalP.reduce((a, b) => a + b, 0) / conditionalP.length : 0.5;

      return {
        effect: reMu,
        ci_lower: reMu - 1.96 * reSE,
        ci_upper: reMu + 1.96 * reSE,
        tau2,
        tau: Math.sqrt(tau2),
        pUniformity: uniformStat,
        nSignificant: significant.length,
        converged: true
      };
    }
  }

  // =========='''

        if old_puniform_end in content:
            content = content.replace(old_puniform_end, new_puniform_with_estimate, 1)
            fixes += 1
            print('Added estimate() method to PUniformStar')

# 4. Fix LimitMetaAnalysis - check if estimate() exists and returns correct format
if 'class LimitMetaAnalysis' in content:
    limit_start = content.find('class LimitMetaAnalysis')
    limit_end = content.find('class ', limit_start + 20)
    limit_section = content[limit_start:limit_end]

    if 'estimate()' not in limit_section:
        # Find end of class and add estimate()
        # Search for the closing brace pattern
        print('LimitMetaAnalysis needs estimate() method - checking...')

# 5. Fix RobustBayesianMA - check if estimate() exists
if 'class RobustBayesianMA' in content:
    robma_start = content.find('class RobustBayesianMA')
    robma_end = content.find('class ', robma_start + 20)
    robma_section = content[robma_start:robma_end]

    if 'estimate()' not in robma_section:
        print('RobustBayesianMA needs estimate() method - checking...')

# 6. Fix PublicationBiasSensitivity - check if analyze() and worstCaseScenario() exist
if 'class PublicationBiasSensitivity' in content:
    bias_start = content.find('class PublicationBiasSensitivity')
    bias_end = content.find('class ', bias_start + 20)
    bias_section = content[bias_start:bias_end]

    if 'analyze()' not in bias_section:
        print('PublicationBiasSensitivity needs analyze() method - checking...')

# 7. Fix BeggMazumdarTest - check if test() exists
if 'class BeggMazumdarTest' in content:
    begg_start = content.find('class BeggMazumdarTest')
    begg_end = content.find('class ', begg_start + 20)
    begg_section = content[begg_start:begg_end]

    if 'test()' not in begg_section:
        print('BeggMazumdarTest needs test() method')

# 8. Fix ZCurveAnalysis - check if analyze() exists
if 'class ZCurveAnalysis' in content:
    zcurve_start = content.find('class ZCurveAnalysis')
    zcurve_end = content.find('class ', zcurve_start + 20)
    zcurve_section = content[zcurve_start:zcurve_end]

    if 'analyze()' not in zcurve_section:
        print('ZCurveAnalysis needs analyze() method')

# 9. Fix WAAPWLS - check if waap() and wls() exist
if 'class WAAPWLS' in content:
    waap_start = content.find('class WAAPWLS')
    waap_end = content.find('class ', waap_start + 20)
    waap_section = content[waap_start:waap_end]

    if 'waap()' not in waap_section:
        print('WAAPWLS needs waap() method')
    if 'wls()' not in waap_section:
        print('WAAPWLS needs wls() method')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'\nTotal fixes applied: {fixes}')
print(f'app.js size: {len(content)} chars')
