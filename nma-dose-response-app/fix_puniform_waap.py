import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

fixes = 0

# Add estimate() to PUniformStar
old_puniform = """      return {
        pUniformStar: pUniformResult,
        publicationBiasTest: biasTest,
        naive,
        bias: pUniformResult.error ? null : naive - pUniformResult.estimate,
        method: 'P-uniform*'
      };
    }
  }

  // ============================================================================
  // 3. LIMIT META-ANALYSIS"""

new_puniform = """      return {
        pUniformStar: pUniformResult,
        publicationBiasTest: biasTest,
        naive,
        bias: pUniformResult.error ? null : naive - pUniformResult.estimate,
        method: 'P-uniform*'
      };
    }

    // estimate() method - wrapper for handler compatibility
    estimate() {
      const result = this.run();
      const pUniform = result.pUniformStar || {};
      return {
        effect: pUniform.estimate ?? result.naive ?? 0,
        ci_lower: pUniform.ci?.[0] ?? (pUniform.estimate ?? 0) - 1.96 * (pUniform.se ?? 0.1),
        ci_upper: pUniform.ci?.[1] ?? (pUniform.estimate ?? 0) + 1.96 * (pUniform.se ?? 0.1),
        tau2: 0,
        tau: 0,
        pUniformity: result.publicationBiasTest?.pValue ?? 0.5,
        nSignificant: pUniform.nSignificant ?? 0,
        converged: !pUniform.error
      };
    }
  }

  // ============================================================================
  // 3. LIMIT META-ANALYSIS"""

if old_puniform in content:
    content = content.replace(old_puniform, new_puniform, 1)
    fixes += 1
    print('Added estimate() to PUniformStar')
else:
    print('PUniformStar pattern not found - may already have estimate()')

# Check WAAPWLS class and add waap()/wls() methods
waap_class_match = re.search(r'class WAAPWLS \{[\s\S]*?run\(\) \{[\s\S]*?return \{[\s\S]*?\};[\s\n]*\}[\s\n]*\}', content)
if waap_class_match:
    waap_section = waap_class_match.group(0)
    if 'waap()' not in waap_section:
        # Find the closing brace of the class
        old_waap_end = waap_section[-50:]  # Get last 50 chars
        new_methods = """
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
  }"""
        # Find the run() method closing and add after it
        run_end = waap_section.rfind('    }')
        if run_end > 0:
            new_waap_section = waap_section[:run_end] + "    }" + new_methods
            content = content.replace(waap_section, new_waap_section, 1)
            fixes += 1
            print('Added waap() and wls() to WAAPWLS')
else:
    print('WAAPWLS class not found or pattern mismatch')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'\nTotal fixes applied: {fixes}')
print(f'app.js size: {len(content)} chars')
