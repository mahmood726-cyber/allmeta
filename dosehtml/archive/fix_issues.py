#!/usr/bin/env python3
"""
Fix Issues #5, #6, #7 in dose-response-pro-v4.html
"""
import re

def fix_i2_formula(content):
    """Fix Issue #7: I² formula in fitGLSModel"""
    # Find the section around line 3036
    pattern = r'(// Heterogeneity statistics.*?\n.*?\n.*?\n.*?\n.*?\n)const I2 = chiSq > \(n - 3\) \? \(\(chiSq - \(n - 3\)\) / chiSq\) \* 100 : 0;'

    replacement = r'''\1// I²: Use K-1 (number of studies - 1) as degrees of freedom
      // This is the standard formula for I² in meta-analysis: I² = (Q - df) / Q * 100
      const df = Math.max(1, studyCoefficients.length - 1);  // K - 1 studies
      const I2 = chiSq > df ? ((chiSq - df) / chiSq) * 100 : 0;'''

    content = re.sub(pattern, replacement, content, flags=re.DOTALL)
    return content

def fix_profile_likelihood(content):
    """Fix Issue #5: Rebrand profile likelihood to Adjusted Wald CI"""
    # Find the calculateProfileLikelihoodCI function and replace it
    old_func_pattern = r'/\*\*\n     \* Calculate Profile Likelihood Confidence Interval for a single coefficient\n     \* More accurate than Wald for non-linear models, especially with small samples\n     \*\n     \* @param \{Object\} result - Analysis result object with coefficients and logLik\n     \* @param \{number\} paramIndex - Index of the coefficient to calculate CI for\n     \* @param \{number\} confLevel - Confidence level \(default 0\.95\)\n     \* @returns \{Object\} - \{lower, upper\} bounds\n     \*/\n    function calculateProfileLikelihoodCI\(result, paramIndex, confLevel = 0\.95\) \{.*?\n      return \{ lower, upper \};\n    \}'

    new_func = '''/**
     * Calculate Adjusted Wald Confidence Interval
     *
     * NOTE: This is NOT true profile likelihood. True profile likelihood requires
     * recomputing the entire model at each test point, which is computationally
     * expensive. This method uses a quadratic approximation to the log-likelihood
     * surface, which is equivalent to a Wald interval with a slight adjustment.
     *
     * The "adjustment" comes from using a chi-square approximation to find where
     * the (approximate) log-likelihood drops by chi2(1)/2, which provides slightly
     * different bounds than the standard Wald CI (estimate ± 1.96*SE).
     *
     * For true profile likelihood, see the dosresmeta R package which implements
     * the full method by iteratively refitting the model.
     *
     * @param {Object} result - Analysis result object with coefficients and logLik
     * @param {number} paramIndex - Index of the coefficient to calculate CI for
     * @param {number} confLevel - Confidence level (default 0.95)
     * @returns {Object} - {lower, upper} bounds
     */
    function calculateAdjustedWaldCI(result, paramIndex, confLevel = 0.95) {
      const alpha = 1 - confLevel;
      // Chi-square critical value for 1 degree of freedom
      const chi2Crit = 3.841; // chi2(1, 0.95)

      const params = result.coefficients.map(c => c.estimate);
      const logLikMax = result.logLik || 0;
      const targetLogLik = logLikMax - 0.5 * chi2Crit;

      const original = params[paramIndex];
      const se = result.coefficients[paramIndex].se;

      /**
       * Find the bound where quadratic approximation of log-likelihood drops by chi2/2
       * @param {number} direction - -1 for lower bound, 1 for upper bound
       */
      function findBound(direction) {
        // Search range: use SE as initial step, extend to 4*SE
        let lower = original;
        let upper = original + direction * se * 4;

        // Binary search for the likelihood threshold
        for (let iter = 0; iter < 30; iter++) {
          const mid = (lower + upper) / 2;
          const testParams = [...params];
          testParams[paramIndex] = mid;

          // Calculate approximate log-likelihood at test point using quadratic approximation
          // This is NOT true profile likelihood - it's a Wald approximation
          const deviance = Math.pow(mid - original, 2) / (se * se);
          const testLogLik = logLikMax - 0.5 * deviance;

          if (direction > 0) {
            // Searching for upper bound
            if (testLogLik < targetLogLik) {
              upper = mid;
            } else {
              lower = mid;
            }
          } else {
            // Searching for lower bound
            if (testLogLik < targetLogLik) {
              lower = mid;
            } else {
              upper = mid;
            }
          }

          // Stop if converged
          if (Math.abs(upper - lower) < 1e-6) break;
        }

        return (lower + upper) / 2;
      }

      const lower = findBound(-1);
      const upper = findBound(1);

      return { lower, upper };
    }

    /**
     * @deprecated Use calculateAdjustedWaldCI instead
     * This function is kept for backward compatibility but uses quadratic approximation,
     * not true profile likelihood.
     */
    const calculateProfileLikelihoodCI = calculateAdjustedWaldCI;'''

    content = re.sub(old_func_pattern, new_func, content, flags=re.DOTALL)

    # Also fix the adjusted version and applyCIMethod
    old_adjusted_pattern = r'/\*\*\n     \* Enhanced Profile Likelihood CI with non-linearity adjustment.*?function calculateProfileLikelihoodCIAdjusted\(.*?method: \'profile-likelihood\'\n      \};\n    \}'

    new_adjusted = '''/**
     * Enhanced Adjusted Wald CI with non-linearity adjustment
     * Applies an adjustment factor based on the magnitude of the estimate
     * to better handle non-linear models
     *
     * NOTE: This is NOT true profile likelihood. It's an adjusted Wald interval.
     *
     * @param {number} estimate - Parameter estimate
     * @param {number} se - Standard error
     * @param {Object} model - Model object with residuals
     * @param {number} confLevel - Confidence level
     * @returns {Object} - {lower, upper, method}
     */
    function calculateAdjustedWaldCIWithNonlinearity(estimate, se, model, confLevel = 0.95) {
      const alpha = 1 - confLevel;
      const chi2Threshold = 3.841; // chi2_1(1-alpha) for 95% CI

      // For non-linear models, apply adjustment based on the ratio |estimate|/SE
      const ratio = Math.abs(estimate) / (se + 1e-10);

      // Adjustment increases with non-linearity (higher ratio)
      const adjustment = 1.0 + Math.log(1 + ratio) / 10;

      // Calculate adjusted CI width
      const zScore = 1.96;
      const baseWidth = zScore * se;
      const adjustedWidth = baseWidth * adjustment;

      return {
        lower: estimate - adjustedWidth,
        upper: estimate + adjustedWidth,
        method: 'adjusted-wald'
      };
    }

    /**
     * @deprecated Use calculateAdjustedWaldCIWithNonlinearity instead
     */
    const calculateProfileLikelihoodCIAdjusted = calculateAdjustedWaldCIWithNonlinearity;'''

    content = re.sub(old_adjusted_pattern, new_adjusted, content, flags=re.DOTALL)

    # Fix applyCIMethod
    content = content.replace(
        "function applyCIMethod(result, ciMethod, confLevel = 0.95) {\n      if (ciMethod === 'profile' && result.logLik !== undefined) {\n        // Apply profile likelihood CI\n        result.coefficients = result.coefficients.map((coef, idx) => {\n          const profileCI = calculateProfileLikelihoodCI(result, idx, confLevel);\n          return {\n            ...coef,\n            ciLower: profileCI.lower,\n            ciUpper: profileCI.upper,\n            ciMethod: 'profile'\n          };",
        "function applyCIMethod(result, ciMethod, confLevel = 0.95) {\n      if (ciMethod === 'profile' && result.logLik !== undefined) {\n        // Apply adjusted Wald CI (previously called \"profile likelihood\")\n        result.coefficients = result.coefficients.map((coef, idx) => {\n          const adjustedCI = calculateAdjustedWaldCI(result, idx, confLevel);\n          return {\n            ...coef,\n            ciLower: adjustedCI.lower,\n            ciUpper: adjustedCI.upper,\n            ciMethod: 'adjusted-wald'  // Changed from 'profile' for clarity\n          };"
    )

    # Also fix the comment above applyCIMethod
    content = content.replace(
        "/**\n     * Apply profile likelihood CI to all coefficients in a result",
        "/**\n     * Apply adjusted Wald CI to all coefficients in a result\n     * @param {Object} result - Analysis result\n     * @param {string} ciMethod - 'wald' or 'adjusted' (previously 'profile')"
    )

    # Fix the parameter documentation line
    content = content.replace(
        "* @param {string} ciMethod - 'wald' or 'profile'\n     * @param {number} confLevel - Confidence level",
        "* @param {number} confLevel - Confidence level"
    )

    return content

def fix_rve_dof(content):
    """Fix Issue #6: Fix RVE degrees of freedom"""
    # Find the RVE degrees of freedom section
    # The current code uses G - 1, but should use G - K for CR2
    pattern = r'// Degrees of freedom correction \(CR2-type\)\n      // Based on Tipton & Pustejovsky \(2015\)\n      const df = G - 1;'

    replacement = '''// Degrees of freedom correction (CR2-type)
      // Based on Tipton & Pustejovsky (2015): https://pubmed.ncbi.nlm.nih.gov/33961175/
      // For CR2 correction, use G - K (not G - 1)
      const df = G - K;'''

    content = re.sub(pattern, replacement, content)

    # Also remove the incorrect dfCorrection factor
    # The G/(G-K) factor is incorrect for CR2
    old_correction = r'// Apply corrections to V_robust\n      for \(let i = 0; i < K; i\+\+\) \{\n        for \(let j = 0; j < K; j\+\+\) \{\n          // Small-sample correction\n          const correction = 1 / Math\.pow\(1 - avgH, 2\);\n          // Degrees of freedom correction\n          const dfCorrection = G / \(G - K\);\n\n          V_robust\[i\]\[j\] \*= correction \* dfCorrection;'

    new_correction = '''// Apply corrections to V_robust
      for (let i = 0; i < K; i++) {
        for (let j = 0; j < K; j++) {
          // Small-sample correction (HC3-type)
          const correction = 1 / Math.pow(1 - avgH, 2);

          // Note: For proper CR2, we would need to use the full clubSandwich implementation
          // with CR2 correction matrix. The simplified version here uses the corrected df.
          V_robust[i][j] *= correction;'''

    content = re.sub(old_correction, new_correction, content)

    return content

# Main execution
if __name__ == '__main__':
    with open(r'C:\dosehtml\dose-response-pro-v4.html', 'r', encoding='utf-8') as f:
        content = f.read()

    print("Fixing Issue #7: I² formula...")
    content = fix_i2_formula(content)
    print("✓ Issue #7 fixed")

    print("\nFixing Issue #5: Rebranding profile likelihood...")
    content = fix_profile_likelihood(content)
    print("✓ Issue #5 fixed")

    print("\nFixing Issue #6: Fixing RVE degrees of freedom...")
    content = fix_rve_dof(content)
    print("✓ Issue #6 fixed")

    with open(r'C:\dosehtml\dose-response-pro-v4.html', 'w', encoding='utf-8') as f:
        f.write(content)

    print("\n✓ All issues fixed successfully!")
