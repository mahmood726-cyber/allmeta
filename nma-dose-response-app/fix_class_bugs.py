import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

fixes = 0

# 1. Fix CopasSelectionModel - ensure fit() returns all expected properties
copas_fit_fix = '''
    fit() {
      const n = this.studies.length;
      if (n < 3) {
        return {
          adjustedEffect: this.studies.reduce((s, st) => s + st.effect, 0) / n,
          ci_lower: -Infinity,
          ci_upper: Infinity,
          gamma0: 0,
          gamma1: 0,
          pValueAdjustment: 0,
          converged: false
        };
      }
'''

old_copas_fit = '''    fit() {
      const n = this.studies.length;'''

if old_copas_fit in content and 'if (n < 3)' not in content[content.find('class CopasSelectionModel'):content.find('class CopasSelectionModel')+2000]:
    content = content.replace(old_copas_fit, copas_fit_fix, 1)
    fixes += 1
    print('Added minimum study check to CopasSelectionModel.fit()')

# 2. Fix PUniformStar - ensure estimate() returns all expected properties
puniform_estimate_fix = '''
    estimate() {
      const n = this.studies.length;
      if (n < 2) {
        const effect = n === 1 ? this.studies[0].effect : 0;
        return {
          effect,
          ci_lower: effect - 1.96 * (n === 1 ? this.studies[0].se : 1),
          ci_upper: effect + 1.96 * (n === 1 ? this.studies[0].se : 1),
          tau2: 0,
          pUniformity: 1,
          converged: false
        };
      }
'''

old_puniform_estimate = '''    estimate() {
      const n = this.studies.length;'''

if old_puniform_estimate in content:
    # Find the PUniformStar class and check if the guard exists
    puniform_start = content.find('class PUniformStar')
    puniform_end = puniform_start + 2000 if puniform_start != -1 else 0
    if puniform_start != -1 and 'if (n < 2)' not in content[puniform_start:puniform_end]:
        # Replace only in PUniformStar context
        idx = content.find(old_puniform_estimate, puniform_start)
        if idx != -1 and idx < puniform_end:
            content = content[:idx] + puniform_estimate_fix + content[idx+len(old_puniform_estimate):]
            fixes += 1
            print('Added minimum study check to PUniformStar.estimate()')

# 3. Fix LimitMetaAnalysis - ensure estimate() returns all expected properties
limit_estimate_fix = '''
    estimate() {
      const n = this.studies.length;
      if (n < 3) {
        const effect = n > 0 ? this.studies.reduce((s, st) => s + st.effect, 0) / n : 0;
        return {
          limitEffect: effect,
          ci_lower: effect - 1.96,
          ci_upper: effect + 1.96,
          biasEstimate: 0,
          gStatistic: 0,
          converged: false
        };
      }
'''

old_limit_estimate = '''    estimate() {
      const n = this.studies.length;'''

if old_limit_estimate in content:
    limit_start = content.find('class LimitMetaAnalysis')
    limit_end = limit_start + 2000 if limit_start != -1 else 0
    if limit_start != -1 and 'limitEffect:' in content[limit_start:limit_end]:
        idx = content.find(old_limit_estimate, limit_start)
        if idx != -1 and idx < limit_end and 'if (n < 3)' not in content[idx:idx+300]:
            content = content[:idx] + limit_estimate_fix + content[idx+len(old_limit_estimate):]
            fixes += 1
            print('Added minimum study check to LimitMetaAnalysis.estimate()')

# 4. Fix RobustBayesianMA - ensure estimate() returns all expected properties
robma_estimate_fix = '''
    estimate() {
      const n = this.studies.length;
      if (n < 2) {
        const effect = n === 1 ? this.studies[0].effect : 0;
        return {
          bmaEffect: effect,
          ci_lower: effect - 1.96,
          ci_upper: effect + 1.96,
          pEffect: 0.5,
          pHeterogeneity: 0.5,
          pPublicationBias: 0.5,
          converged: false
        };
      }
'''

old_robma_estimate = '''    estimate() {
      const n = this.studies.length;'''

if old_robma_estimate in content:
    robma_start = content.find('class RobustBayesianMA')
    robma_end = robma_start + 2000 if robma_start != -1 else 0
    if robma_start != -1:
        idx = content.find(old_robma_estimate, robma_start)
        if idx != -1 and idx < robma_end and 'bmaEffect:' in content[robma_start:robma_end] and 'if (n < 2)' not in content[idx:idx+300]:
            content = content[:idx] + robma_estimate_fix + content[idx+len(old_robma_estimate):]
            fixes += 1
            print('Added minimum study check to RobustBayesianMA.estimate()')

# 5. Fix BeggMazumdarTest - ensure test() returns all expected properties
begg_test_fix = '''
    test() {
      const n = this.studies.length;
      if (n < 3) {
        return {
          tau: 0,
          z: 0,
          pValue: 1,
          concordant: 0,
          discordant: 0
        };
      }
'''

old_begg_test = '''    test() {
      const n = this.studies.length;'''

if old_begg_test in content:
    begg_start = content.find('class BeggMazumdarTest')
    begg_end = begg_start + 1500 if begg_start != -1 else 0
    if begg_start != -1:
        idx = content.find(old_begg_test, begg_start)
        if idx != -1 and idx < begg_end and 'if (n < 3)' not in content[idx:idx+200]:
            content = content[:idx] + begg_test_fix + content[idx+len(old_begg_test):]
            fixes += 1
            print('Added minimum study check to BeggMazumdarTest.test()')

# 6. Fix PetersTest - ensure test() returns all expected properties
peters_test_fix = '''
    test() {
      const n = this.studies.length;
      if (n < 4) {
        return {
          t: 0,
          pValue: 1,
          intercept: 0,
          se: Infinity,
          df: 0
        };
      }
'''

old_peters_test = '''    test() {
      const n = this.studies.length;'''

if old_peters_test in content:
    peters_start = content.find('class PetersTest')
    peters_end = peters_start + 1500 if peters_start != -1 else 0
    if peters_start != -1:
        idx = content.find(old_peters_test, peters_start)
        if idx != -1 and idx < peters_end and 'if (n < 4)' not in content[idx:idx+200]:
            content = content[:idx] + peters_test_fix + content[idx+len(old_peters_test):]
            fixes += 1
            print('Added minimum study check to PetersTest.test()')

# 7. Fix ZCurveAnalysis - ensure analyze() returns all expected properties
zcurve_analyze_fix = '''
    analyze() {
      const n = this.studies.length;
      if (n < 2) {
        return {
          expectedReplicationRate: 0,
          expectedDiscoveryRate: 0,
          scepticalSignificance: 0,
          observed: n,
          significant: 0,
          converged: false
        };
      }
'''

old_zcurve_analyze = '''    analyze() {
      const n = this.studies.length;'''

if old_zcurve_analyze in content:
    zcurve_start = content.find('class ZCurveAnalysis')
    zcurve_end = zcurve_start + 2000 if zcurve_start != -1 else 0
    if zcurve_start != -1:
        idx = content.find(old_zcurve_analyze, zcurve_start)
        if idx != -1 and idx < zcurve_end and 'if (n < 2)' not in content[idx:idx+200]:
            content = content[:idx] + zcurve_analyze_fix + content[idx+len(old_zcurve_analyze):]
            fixes += 1
            print('Added minimum study check to ZCurveAnalysis.analyze()')

# 8. Fix SunsetPowerAnalysis - ensure analyze() returns all expected properties
sunset_analyze_fix = '''
    analyze() {
      const n = this.studies.length;
      if (n < 1) {
        return {
          medianPower: 0,
          nAdequate: 0,
          nInflated: 0,
          powers: [],
          converged: false
        };
      }
'''

old_sunset_analyze = '''    analyze() {
      const n = this.studies.length;'''

if old_sunset_analyze in content:
    sunset_start = content.find('class SunsetPowerAnalysis')
    sunset_end = sunset_start + 2000 if sunset_start != -1 else 0
    if sunset_start != -1:
        idx = content.find(old_sunset_analyze, sunset_start)
        if idx != -1 and idx < sunset_end and 'if (n < 1)' not in content[idx:idx+200]:
            content = content[:idx] + sunset_analyze_fix + content[idx+len(old_sunset_analyze):]
            fixes += 1
            print('Added minimum study check to SunsetPowerAnalysis.analyze()')

# 9. Fix SelectionModelComparison - ensure compareAll() returns expected structure
comparison_fix = '''
    compareAll() {
      const n = this.studies.length;
      if (n < 3) {
        return {
          models: [],
          averagedEffect: n > 0 ? this.studies.reduce((s, st) => s + st.effect, 0) / n : 0,
          averagedCI: [0, 0]
        };
      }
'''

old_comparison = '''    compareAll() {
      const n = this.studies.length;'''

if old_comparison in content:
    comp_start = content.find('class SelectionModelComparison')
    comp_end = comp_start + 2000 if comp_start != -1 else 0
    if comp_start != -1:
        idx = content.find(old_comparison, comp_start)
        if idx != -1 and idx < comp_end and 'if (n < 3)' not in content[idx:idx+200]:
            content = content[:idx] + comparison_fix + content[idx+len(old_comparison):]
            fixes += 1
            print('Added minimum study check to SelectionModelComparison.compareAll()')

# 10. Fix WAAPWLS - ensure waap() and wls() return expected properties
waap_fix = '''
    waap() {
      const n = this.studies.length;
      if (n < 2) {
        const effect = n === 1 ? this.studies[0].effect : 0;
        return {
          effect,
          ci_lower: effect - 1.96,
          ci_upper: effect + 1.96,
          nAdequate: n
        };
      }
'''

old_waap = '''    waap() {
      const n = this.studies.length;'''

if old_waap in content:
    waap_start = content.find('class WAAPWLS')
    waap_end = waap_start + 2000 if waap_start != -1 else 0
    if waap_start != -1:
        idx = content.find(old_waap, waap_start)
        if idx != -1 and idx < waap_end and 'if (n < 2)' not in content[idx:idx+200]:
            content = content[:idx] + waap_fix + content[idx+len(old_waap):]
            fixes += 1
            print('Added minimum study check to WAAPWLS.waap()')

# 11. Fix PublicationBiasSensitivity - ensure analyze() and worstCaseScenario() return expected properties
bias_sens_analyze_fix = '''
    analyze() {
      const n = this.studies.length;
      if (n < 2) {
        return {
          sValueToNullify: Infinity,
          worstCaseEffect: n === 1 ? this.studies[0].effect : 0,
          robustEffectS2: n === 1 ? this.studies[0].effect : 0
        };
      }
'''

old_bias_sens_analyze = '''    analyze() {
      const n = this.studies.length;'''

if old_bias_sens_analyze in content:
    bias_start = content.find('class PublicationBiasSensitivity')
    bias_end = bias_start + 2000 if bias_start != -1 else 0
    if bias_start != -1:
        idx = content.find(old_bias_sens_analyze, bias_start)
        if idx != -1 and idx < bias_end and 'sValueToNullify' in content[bias_start:bias_end] and 'if (n < 2)' not in content[idx:idx+200]:
            content = content[:idx] + bias_sens_analyze_fix + content[idx+len(old_bias_sens_analyze):]
            fixes += 1
            print('Added minimum study check to PublicationBiasSensitivity.analyze()')

# 12. Add worstCaseScenario fix
worst_case_fix = '''
    worstCaseScenario() {
      const n = this.studies.length;
      if (n < 1) {
        return {
          effect: 0,
          ci_lower: 0,
          ci_upper: 0,
          nMissingAssumed: 0
        };
      }
'''

old_worst_case = '''    worstCaseScenario() {
      const n = this.studies.length;'''

if old_worst_case in content:
    bias_start = content.find('class PublicationBiasSensitivity')
    bias_end = bias_start + 3000 if bias_start != -1 else 0
    if bias_start != -1:
        idx = content.find(old_worst_case, bias_start)
        if idx != -1 and idx < bias_end and 'if (n < 1)' not in content[idx:idx+200]:
            content = content[:idx] + worst_case_fix + content[idx+len(old_worst_case):]
            fixes += 1
            print('Added minimum study check to PublicationBiasSensitivity.worstCaseScenario()')

# 13. Fix CumulativeMetaAnalysis - ensure byPrecision() returns expected structure
cumulative_fix = '''
    byPrecision() {
      const n = this.studies.length;
      if (n < 1) {
        return { steps: [] };
      }
'''

old_cumulative = '''    byPrecision() {
      const n = this.studies.length;'''

if old_cumulative in content:
    cum_start = content.find('class CumulativeMetaAnalysis')
    cum_end = cum_start + 2000 if cum_start != -1 else 0
    if cum_start != -1:
        idx = content.find(old_cumulative, cum_start)
        if idx != -1 and idx < cum_end and 'if (n < 1)' not in content[idx:idx+200]:
            content = content[:idx] + cumulative_fix + content[idx+len(old_cumulative):]
            fixes += 1
            print('Added minimum study check to CumulativeMetaAnalysis.byPrecision()')

# 14. Fix LeaveOneOutBias - ensure analyze() returns expected structure
loo_fix = '''
    analyze() {
      const n = this.studies.length;
      if (n < 2) {
        return { results: [], influential: [] };
      }
'''

old_loo = '''    analyze() {
      const n = this.studies.length;'''

if old_loo in content:
    loo_start = content.find('class LeaveOneOutBias')
    loo_end = loo_start + 2000 if loo_start != -1 else 0
    if loo_start != -1:
        idx = content.find(old_loo, loo_start)
        if idx != -1 and idx < loo_end and 'if (n < 2)' not in content[idx:idx+200]:
            content = content[:idx] + loo_fix + content[idx+len(old_loo):]
            fixes += 1
            print('Added minimum study check to LeaveOneOutBias.analyze()')

# 15. Fix RegressionBasedTests - ensure methods return expected properties
regression_fix = '''
    macaskill() {
      const n = this.studies.length;
      if (n < 4) {
        return { t: 0, pValue: 1, slope: 0 };
      }
'''

old_regression = '''    macaskill() {
      const n = this.studies.length;'''

if old_regression in content:
    reg_start = content.find('class RegressionBasedTests')
    reg_end = reg_start + 2000 if reg_start != -1 else 0
    if reg_start != -1:
        idx = content.find(old_regression, reg_start)
        if idx != -1 and idx < reg_end and 'if (n < 4)' not in content[idx:idx+200]:
            content = content[:idx] + regression_fix + content[idx+len(old_regression):]
            fixes += 1
            print('Added minimum study check to RegressionBasedTests.macaskill()')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'\nTotal class fixes applied: {fixes}')
print(f'app.js size: {len(content)} chars')
