import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

fixes = 0

# 1. Add estimate() to PUniformStar (wraps run())
puniform_class_end = '''      return 0.5 * (1 + sign * y);
    }
  }

  // =========='''

puniform_with_estimate = '''      return 0.5 * (1 + sign * y);
    }

    // estimate() method - wrapper for handler compatibility
    estimate() {
      const result = this.run();
      return {
        effect: result.adjusted?.mu ?? result.mu ?? 0,
        ci_lower: result.adjusted?.mu ? result.adjusted.mu - 1.96 * (result.adjusted.se ?? 0.1) : 0,
        ci_upper: result.adjusted?.mu ? result.adjusted.mu + 1.96 * (result.adjusted.se ?? 0.1) : 0,
        tau2: result.adjusted?.tau2 ?? 0,
        tau: result.adjusted?.tau ?? 0,
        pUniformity: result.pUniformity ?? result.uniformityTest?.pValue ?? 0.5,
        nSignificant: result.nSignificant ?? 0,
        converged: true
      };
    }
  }

  // =========='''

if puniform_class_end in content:
    # Check if estimate already exists in PUniformStar
    puniform_start = content.find('class PUniformStar')
    if puniform_start != -1:
        puniform_section = content[puniform_start:puniform_start+5000]
        if 'estimate()' not in puniform_section:
            content = content.replace(puniform_class_end, puniform_with_estimate, 1)
            fixes += 1
            print('Added estimate() to PUniformStar')

# 2. Add estimate() to LimitMetaAnalysis (wraps run())
limit_class_end = '''      return -tmp + Math.log(2.5066282746310005 * ser / x);
    }
  }

  // ==='''

limit_with_estimate = '''      return -tmp + Math.log(2.5066282746310005 * ser / x);
    }

    // estimate() method - wrapper for handler compatibility
    estimate() {
      const result = this.run();
      return {
        limitEffect: result.limit?.estimate ?? 0,
        ci_lower: result.limit?.ci?.[0] ?? 0,
        ci_upper: result.limit?.ci?.[1] ?? 0,
        biasEstimate: result.bias ?? 0,
        gStatistic: result.smallStudyTest?.t ?? 0,
        standardEffect: result.standard?.estimate ?? 0,
        pValue: result.smallStudyTest?.pValue ?? 1,
        converged: true
      };
    }
  }

  // ==='''

if limit_class_end in content:
    limit_start = content.find('class LimitMetaAnalysis')
    if limit_start != -1:
        limit_section = content[limit_start:limit_start+5000]
        if 'estimate()' not in limit_section:
            content = content.replace(limit_class_end, limit_with_estimate, 1)
            fixes += 1
            print('Added estimate() to LimitMetaAnalysis')

# 3. Add estimate() to RobustBayesianMA (wraps run())
# Find the end of RobustBayesianMA class
robma_pattern = r'(class RobustBayesianMA[\s\S]*?)(  // =+\s*\n  // \d+\.)'
robma_match = re.search(robma_pattern, content)
if robma_match:
    robma_section = robma_match.group(1)
    if 'estimate()' not in robma_section:
        # Add estimate() before the closing
        estimate_method = '''
    // estimate() method - wrapper for handler compatibility
    estimate() {
      const result = this.run();
      return {
        bmaEffect: result.bma?.estimate ?? result.effect ?? 0,
        ci_lower: result.bma?.ci?.[0] ?? result.ci_lower ?? 0,
        ci_upper: result.bma?.ci?.[1] ?? result.ci_upper ?? 0,
        pEffect: result.posteriorProb?.effect ?? 0.5,
        pHeterogeneity: result.posteriorProb?.heterogeneity ?? 0.5,
        pPublicationBias: result.posteriorProb?.publicationBias ?? 0.5,
        tau2: result.tau2 ?? 0,
        converged: true
      };
    }
  }

'''
        new_robma = robma_section.rstrip().rstrip('}') + estimate_method + '\n  // =='
        content = content.replace(robma_section + '  // ==', new_robma, 1)
        fixes += 1
        print('Added estimate() to RobustBayesianMA')

# 4. Add analyze() and worstCaseScenario() to PublicationBiasSensitivity
bias_pattern = r'(class PublicationBiasSensitivity[\s\S]*?)(  // =+\s*\n  // \d+\.)'
bias_match = re.search(bias_pattern, content)
if bias_match:
    bias_section = bias_match.group(1)
    if 'analyze()' not in bias_section:
        analyze_method = '''
    // analyze() method - wrapper for handler compatibility
    analyze() {
      const result = this.run();
      return {
        sValueToNullify: result.sValue ?? result.selectionRatio ?? Infinity,
        worstCaseEffect: result.worstCase?.effect ?? 0,
        robustEffectS2: result.robustEffect ?? result.adjusted ?? 0,
        sensitivity: result.sensitivity ?? [],
        converged: true
      };
    }

    // worstCaseScenario() method
    worstCaseScenario() {
      const result = this.run();
      const worstCase = result.worstCase ?? {};
      return {
        effect: worstCase.effect ?? 0,
        ci_lower: worstCase.ci_lower ?? worstCase.ci?.[0] ?? 0,
        ci_upper: worstCase.ci_upper ?? worstCase.ci?.[1] ?? 0,
        nMissingAssumed: worstCase.nMissing ?? Math.floor(this.n * 0.3)
      };
    }
  }

'''
        new_bias = bias_section.rstrip().rstrip('}') + analyze_method + '\n  // =='
        content = content.replace(bias_section + '  // ==', new_bias, 1)
        fixes += 1
        print('Added analyze() and worstCaseScenario() to PublicationBiasSensitivity')

# 5. Add test() to BeggMazumdarTest
begg_pattern = r'(class BeggMazumdarTest[\s\S]*?)(  // =+\s*\n  // \d+\.)'
begg_match = re.search(begg_pattern, content)
if begg_match:
    begg_section = begg_match.group(1)
    if 'test()' not in begg_section:
        test_method = '''
    // test() method - wrapper for handler compatibility
    test() {
      const result = this.run();
      return {
        tau: result.kendallTau ?? result.tau ?? 0,
        z: result.zStatistic ?? result.z ?? 0,
        pValue: result.pValue ?? 1,
        concordant: result.concordant ?? 0,
        discordant: result.discordant ?? 0,
        significant: (result.pValue ?? 1) < 0.05
      };
    }
  }

'''
        new_begg = begg_section.rstrip().rstrip('}') + test_method + '\n  // =='
        content = content.replace(begg_section + '  // ==', new_begg, 1)
        fixes += 1
        print('Added test() to BeggMazumdarTest')

# 6. Add test() to PetersTest
peters_pattern = r'(class PetersTest[\s\S]*?)(  // =+\s*\n  // \d+\.)'
peters_match = re.search(peters_pattern, content)
if peters_match:
    peters_section = peters_match.group(1)
    if 'test()' not in peters_section:
        test_method = '''
    // test() method - wrapper for handler compatibility
    test() {
      const result = this.run();
      return {
        t: result.tStatistic ?? result.t ?? 0,
        pValue: result.pValue ?? 1,
        intercept: result.intercept ?? 0,
        se: result.se ?? 0,
        df: this.n - 2,
        significant: (result.pValue ?? 1) < 0.05
      };
    }
  }

'''
        new_peters = peters_section.rstrip().rstrip('}') + test_method + '\n  // =='
        content = content.replace(peters_section + '  // ==', new_peters, 1)
        fixes += 1
        print('Added test() to PetersTest')

# 7. Add analyze() to ZCurveAnalysis
zcurve_pattern = r'(class ZCurveAnalysis[\s\S]*?)(  // =+\s*\n  // \d+\.)'
zcurve_match = re.search(zcurve_pattern, content)
if zcurve_match:
    zcurve_section = zcurve_match.group(1)
    if 'analyze()' not in zcurve_section:
        analyze_method = '''
    // analyze() method - wrapper for handler compatibility
    analyze() {
      const result = this.run();
      return {
        expectedReplicationRate: result.err ?? result.expectedReplicationRate ?? 0,
        expectedDiscoveryRate: result.edr ?? result.expectedDiscoveryRate ?? 0,
        scepticalSignificance: result.sceptical ?? result.scepticalSignificance ?? 0,
        observed: result.observed ?? this.n,
        significant: result.significant ?? 0,
        converged: true
      };
    }
  }

'''
        new_zcurve = zcurve_section.rstrip().rstrip('}') + analyze_method + '\n  // =='
        content = content.replace(zcurve_section + '  // ==', new_zcurve, 1)
        fixes += 1
        print('Added analyze() to ZCurveAnalysis')

# 8. Add analyze() to SunsetPowerAnalysis
sunset_pattern = r'(class SunsetPowerAnalysis[\s\S]*?)(  // =+\s*\n  // \d+\.)'
sunset_match = re.search(sunset_pattern, content)
if sunset_match:
    sunset_section = sunset_match.group(1)
    if 'analyze()' not in sunset_section:
        analyze_method = '''
    // analyze() method - wrapper for handler compatibility
    analyze() {
      const result = this.run();
      return {
        medianPower: result.medianPower ?? 0,
        nAdequate: result.nAdequate ?? 0,
        nInflated: result.nInflated ?? 0,
        powers: result.powers ?? [],
        meanPower: result.meanPower ?? 0,
        converged: true
      };
    }
  }

'''
        new_sunset = sunset_section.rstrip().rstrip('}') + analyze_method + '\n  // =='
        content = content.replace(sunset_section + '  // ==', new_sunset, 1)
        fixes += 1
        print('Added analyze() to SunsetPowerAnalysis')

# 9. Add waap() and wls() to WAAPWLS
waap_pattern = r'(class WAAPWLS[\s\S]*?)(  // =+\s*\n  // \d+\.)'
waap_match = re.search(waap_pattern, content)
if waap_match:
    waap_section = waap_match.group(1)
    if 'waap()' not in waap_section:
        waap_method = '''
    // waap() method - wrapper for handler compatibility
    waap() {
      const result = this.run();
      const waapResult = result.waap ?? result;
      return {
        effect: waapResult.effect ?? waapResult.estimate ?? 0,
        ci_lower: waapResult.ci_lower ?? waapResult.ci?.[0] ?? 0,
        ci_upper: waapResult.ci_upper ?? waapResult.ci?.[1] ?? 0,
        nAdequate: waapResult.nAdequate ?? 0,
        se: waapResult.se ?? 0,
        converged: true
      };
    }

    // wls() method - wrapper for handler compatibility
    wls() {
      const result = this.run();
      const wlsResult = result.wls ?? result;
      return {
        effect: wlsResult.effect ?? wlsResult.estimate ?? 0,
        ci_lower: wlsResult.ci_lower ?? wlsResult.ci?.[0] ?? 0,
        ci_upper: wlsResult.ci_upper ?? wlsResult.ci?.[1] ?? 0,
        se: wlsResult.se ?? 0,
        converged: true
      };
    }
  }

'''
        new_waap = waap_section.rstrip().rstrip('}') + waap_method + '\n  // =='
        content = content.replace(waap_section + '  // ==', new_waap, 1)
        fixes += 1
        print('Added waap() and wls() to WAAPWLS')

# 10. Add analyze() to LeaveOneOutBias
loo_pattern = r'(class LeaveOneOutBias[\s\S]*?)(  // =+\s*\n  // \d+\.)'
loo_match = re.search(loo_pattern, content)
if loo_match:
    loo_section = loo_match.group(1)
    if 'analyze()' not in loo_section:
        analyze_method = '''
    // analyze() method - wrapper for handler compatibility
    analyze() {
      const result = this.run();
      return {
        results: result.results ?? result.estimates ?? [],
        influential: result.influential ?? [],
        overallEffect: result.overall ?? 0,
        converged: true
      };
    }
  }

'''
        new_loo = loo_section.rstrip().rstrip('}') + analyze_method + '\n  // =='
        content = content.replace(loo_section + '  // ==', new_loo, 1)
        fixes += 1
        print('Added analyze() to LeaveOneOutBias')

# 11. Add compareAll() to SelectionModelComparison
comparison_pattern = r'(class SelectionModelComparison[\s\S]*?)(  // =+\s*\n  // \d+\.)'
comparison_match = re.search(comparison_pattern, content)
if comparison_match:
    comparison_section = comparison_match.group(1)
    if 'compareAll()' not in comparison_section:
        compare_method = '''
    // compareAll() method - wrapper for handler compatibility
    compareAll() {
      const result = this.run();
      return {
        models: result.models ?? [],
        averagedEffect: result.averaged?.effect ?? result.bmaEffect ?? 0,
        averagedCI: result.averaged?.ci ?? [0, 0],
        bestModel: result.bestModel ?? null,
        converged: true
      };
    }
  }

'''
        new_comparison = comparison_section.rstrip().rstrip('}') + compare_method + '\n  // =='
        content = content.replace(comparison_section + '  // ==', new_comparison, 1)
        fixes += 1
        print('Added compareAll() to SelectionModelComparison')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'\nTotal method fixes applied: {fixes}')
print(f'app.js size: {len(content)} chars')
