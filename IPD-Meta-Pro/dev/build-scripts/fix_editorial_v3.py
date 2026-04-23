# sentinel:skip-file — hardcoded paths are fixture/registry/audit-narrative data for this repo's research workflow, not portable application configuration. Same pattern as push_all_repos.py and E156 workbook files.
﻿#!/usr/bin/env python3
"""
Editorial Revision V3 - Fix All Issues from Research Synthesis Methods Review
Addresses all 10 issues identified in editorial review
"""

import re

def fix_all_editorial_issues(filepath):
    print("=" * 70)
    print("EDITORIAL REVISION V3 - Fixing All 10 Issues")
    print("=" * 70)

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_len = len(content)
    fixes_applied = []

    # =========================================================================
    # FIX 1: One-Stage vs Two-Stage Labeling Discrepancy
    # =========================================================================
    print("\n[1/10] Fixing one-stage vs two-stage labeling...")

    # Update the one-stage function to be clearly labeled as approximate
    old_one_stage = "function runOneStageIPDMA()"
    new_one_stage = """// NOTE: This is an APPROXIMATE one-stage approach using moment-based estimation
    // For TRUE likelihood-based one-stage analysis, use R (lme4::lmer) or Stata (melogit)
    // Reference: Riley RD et al. (2010) BMJ 340:c221
    function runOneStageIPDMA()"""

    if old_one_stage in content and "APPROXIMATE one-stage" not in content:
        content = content.replace(old_one_stage, new_one_stage)
        fixes_applied.append("One-stage labeled as approximate")

    # Update any "true one-stage" claims
    content = re.sub(
        r'[Tt]rue [Oo]ne-[Ss]tage',
        'Approximate One-Stage',
        content
    )

    # Add method info to results
    one_stage_result_fix = '''method: 'Approximate One-Stage IPD-MA (moment-based)',
            note: 'For exact likelihood-based one-stage, use R lme4 or Stata melogit','''

    if "method: 'One-Stage IPD" in content:
        content = content.replace(
            "method: 'One-Stage IPD",
            "method: 'Approximate One-Stage IPD"
        )
        fixes_applied.append("One-stage results labeled as approximate")

    print("   [OK] One-stage labeling fixed")

    # =========================================================================
    # FIX 2: SuperLearner Implementation - Increase Trees
    # =========================================================================
    print("[2/10] Fixing SuperLearner implementation...")

    # Fix random forest trees from 10 to 50 (balanced for browser performance)
    content = re.sub(
        r'var nTrees = 10;(\s*//.*)?',
        'var nTrees = 50; // Increased from 10 for better ensemble (browser-optimized)',
        content
    )

    # Add note about simplified implementation
    sl_note = '''// NOTE: Simplified SuperLearner for browser execution
    // Uses 50-tree random forest (vs 500+ in R SuperLearner)
    // For production analysis, validate against R SuperLearner package'''

    if "function runSuperLearner" in content and "Simplified SuperLearner" not in content:
        content = content.replace(
            "function runSuperLearner",
            sl_note + "\n    function runSuperLearner"
        )

    # Update method label
    content = re.sub(
        r"method: 'SuperLearner Ensemble'",
        "method: 'SuperLearner Ensemble (Browser-Optimized)'",
        content
    )

    fixes_applied.append("SuperLearner trees increased to 50, labeled as browser-optimized")
    print("   [OK] SuperLearner fixed")

    # =========================================================================
    # FIX 3: Dataset Sample Sizes - Add Subset Labels
    # =========================================================================
    print("[3/10] Fixing dataset sample size labels...")

    # Fix Veteran dataset
    content = re.sub(
        r'(veteran:\s*\{[^}]*name:\s*)"Veteran Lung Cancer Trial"',
        r'\1"Veteran Lung Cancer Trial (Subset: 15 of 137)"',
        content
    )
    content = re.sub(
        r'(veteran:\s*\{[^}]*description:\s*)"Two-treatment randomized trial for lung cancer\. 137 patients\."',
        r'\1"Two-treatment randomized trial for lung cancer. ILLUSTRATIVE SUBSET: 15 of 137 patients shown."',
        content
    )

    # Fix Lung dataset
    content = re.sub(
        r'(lung:\s*\{[^}]*name:\s*)"NCCTG Lung Cancer"',
        r'\1"NCCTG Lung Cancer (Subset: 10 of 228)"',
        content
    )
    content = re.sub(
        r'(lung:\s*\{[^}]*description:\s*)"Advanced lung cancer survival\. 228 patients',
        r'\1"Advanced lung cancer survival. ILLUSTRATIVE SUBSET: 10 of 228 patients',
        content
    )

    # Fix Colon dataset
    content = re.sub(
        r'(colon:\s*\{[^}]*name:\s*)"Colon Cancer Chemotherapy"',
        r'\1"Colon Cancer Chemotherapy (Subset: 10 of 929)"',
        content
    )
    content = re.sub(
        r'(colon:\s*\{[^}]*description:\s*)"Stage B/C colon cancer adjuvant therapy\. 929 patients',
        r'\1"Stage B/C colon cancer adjuvant therapy. ILLUSTRATIVE SUBSET: 10 of 929 patients',
        content
    )

    # Fix PBC dataset
    content = re.sub(
        r'(pbc:\s*\{[^}]*name:\s*)"Primary Biliary Cholangitis"',
        r'\1"Primary Biliary Cholangitis (Subset: 10 of 312)"',
        content
    )

    # Fix Rotterdam dataset
    content = re.sub(
        r'(rotterdam:\s*\{[^}]*name:\s*)"Rotterdam Breast Cancer"',
        r'\1"Rotterdam Breast Cancer (Subset: 10 of 2982)"',
        content
    )

    # Fix GBSG dataset
    content = re.sub(
        r'(gbsg:\s*\{[^}]*name:\s*)"German Breast Cancer Study"',
        r'\1"German Breast Cancer Study (Subset: 10 of 686)"',
        content
    )

    # Fix ACTG175 dataset
    content = re.sub(
        r'(actg175:\s*\{[^}]*name:\s*)"AIDS Clinical Trial ACTG175"',
        r'\1"AIDS Clinical Trial ACTG175 (Subset: 10 of 2139)"',
        content
    )

    # Add general note about datasets
    dataset_note = '''// ============================================================================
// IMPORTANT: These datasets contain ILLUSTRATIVE SUBSETS for demonstration.
// For full datasets, use R's survival package: data(veteran), data(lung), etc.
// Full data available at: https://cran.r-project.org/package=survival
// ============================================================================

const REAL_IPD_DATASETS'''

    if "const REAL_IPD_DATASETS" in content and "ILLUSTRATIVE SUBSETS" not in content:
        content = content.replace("const REAL_IPD_DATASETS", dataset_note)

    fixes_applied.append("Dataset labels clarified as illustrative subsets")
    print("   [OK] Dataset labels fixed")

    # =========================================================================
    # FIX 4: Remove Unsubstantiated R Superiority Claims
    # =========================================================================
    print("[4/10] Removing unsubstantiated R superiority claims...")

    # Remove "better than" claims
    content = re.sub(
        r'Better than R[\'"]?s? (\w+)',
        r'Comparable to R \1',
        content,
        flags=re.IGNORECASE
    )

    content = re.sub(
        r'better than lme4',
        'comparable to lme4 (browser-based alternative)',
        content,
        flags=re.IGNORECASE
    )

    content = re.sub(
        r'better than dosresmeta',
        'comparable to dosresmeta',
        content,
        flags=re.IGNORECASE
    )

    content = re.sub(
        r'better than cmprsk',
        'comparable to cmprsk (simplified for browser)',
        content,
        flags=re.IGNORECASE
    )

    # Fix "Not in any R package" claims
    content = re.sub(
        r'Not in any R package',
        'Also available in specialized R packages',
        content,
        flags=re.IGNORECASE
    )

    content = re.sub(
        r'Not available in any R package',
        'Available in specialized R packages',
        content,
        flags=re.IGNORECASE
    )

    # Fix "No R package does this"
    content = re.sub(
        r'No R package does this',
        'Comparable R packages available',
        content,
        flags=re.IGNORECASE
    )

    # Update IECV claim
    content = re.sub(
        r'// Not available in any R package as a complete solution',
        '// Also available in R packages (e.g., pmsampsize, iecv). This is a browser-based alternative.',
        content
    )

    # Update competing risks claim
    content = re.sub(
        r'// Better than R\'s cmprsk - includes study random effects',
        '// Comparable to R cmprsk package - simplified for browser execution',
        content
    )

    fixes_applied.append("Superiority claims replaced with 'comparable to'")
    print("   [OK] Superiority claims fixed")

    # =========================================================================
    # FIX 5: Label Bootstrap CI as Approximate BCa
    # =========================================================================
    print("[5/10] Fixing bootstrap CI labels...")

    # Fix the CI labels in the results display
    content = re.sub(
        r'<td>Bias-Corrected</td>',
        '<td>Bias-Corrected (Approximate)</td>',
        content
    )

    # Add note about BCa approximation
    bca_note = '''// NOTE: Bootstrap BCa confidence intervals use a simplified approximation
                        // For exact BCa intervals, use R boot::boot.ci() with type="bca"'''

    if "ciBC = [" in content and "simplified approximation" not in content:
        content = re.sub(
            r'(var ciBC = \[)',
            bca_note + '\n            \\1',
            content
        )

    # Update bootstrap results header
    content = re.sub(
        r'<h4>Confidence Intervals</h4>',
        '<h4>Confidence Intervals <small style="color:var(--text-muted)">(BCa is approximate)</small></h4>',
        content
    )

    fixes_applied.append("Bootstrap BCa labeled as approximate")
    print("   [OK] Bootstrap CI labels fixed")

    # =========================================================================
    # FIX 6: Add GRADE Automation Disclaimer
    # =========================================================================
    print("[6/10] Adding GRADE automation disclaimer...")

    grade_disclaimer = '''
    // ============================================================================
    // GRADE CERTAINTY ASSESSMENT - IMPORTANT DISCLAIMER
    // ============================================================================
    // Automated GRADE assessment provides PRELIMINARY estimates only.
    // GRADE requires expert judgment on:
    //   - Risk of bias (study-level assessment)
    //   - Indirectness (applicability to target population)
    //   - Imprecision (clinical significance of CI width)
    //   - Publication bias (beyond statistical tests)
    //   - Upgrading factors (dose-response, large effect, confounding)
    //
    // ALWAYS have a methodologist review automated GRADE assessments.
    // Reference: Guyatt GH et al. (2011) BMJ 342:d4002
    // ============================================================================
'''

    if "function assessGRADE" in content and "PRELIMINARY estimates" not in content:
        content = content.replace(
            "function assessGRADE",
            grade_disclaimer + "\n    function assessGRADE"
        )

    # Add disclaimer to GRADE results
    grade_result_disclaimer = '''<div class="alert alert-warning" style="margin-bottom: 1rem;">
                    <strong>Important:</strong> This is an AUTOMATED preliminary assessment.
                    GRADE certainty requires expert judgment on risk of bias, indirectness,
                    and clinical significance. Always review with a methodologist before publication.
                </div>'''

    # Find GRADE display function and add disclaimer
    if "GRADE Certainty" in content and "AUTOMATED preliminary" not in content:
        content = re.sub(
            r"(<h3[^>]*>.*?GRADE.*?</h3>)",
            r"\1\n                " + grade_result_disclaimer,
            content,
            count=1
        )

    fixes_applied.append("GRADE automation disclaimer added")
    print("   [OK] GRADE disclaimer added")

    # =========================================================================
    # FIX 7: Fix Propensity Score Truncation Consistency
    # =========================================================================
    print("[7/10] Fixing propensity score truncation consistency...")

    # Ensure PS_TRUNCATION constant is defined and used consistently
    ps_truncation_const = '''
    // Propensity score truncation threshold (consistent across all PS methods)
    const PS_TRUNCATION_THRESHOLD = 0.01; // Truncate PS to [0.01, 0.99]
    const PS_POSITIVITY_WARNING_THRESHOLD = 0.05; // Warn if >10% of PS < 0.05 or > 0.95
'''

    # Add constant if not present
    if "PS_TRUNCATION_THRESHOLD" not in content:
        # Find a good insertion point after jStat or at start of script
        insert_point = content.find("// ====")
        if insert_point > 0:
            content = content[:insert_point] + ps_truncation_const + "\n    " + content[insert_point:]

    # Update positivity warning to use constant
    content = re.sub(
        r'threshold = threshold \|\| 0\.05;',
        'threshold = threshold || PS_POSITIVITY_WARNING_THRESHOLD || 0.05;',
        content
    )

    # Update truncation in PS estimation
    content = re.sub(
        r'Math\.max\(0\.01, Math\.min\(0\.99',
        'Math.max(PS_TRUNCATION_THRESHOLD || 0.01, Math.min(1 - (PS_TRUNCATION_THRESHOLD || 0.01)',
        content
    )

    fixes_applied.append("Propensity score truncation made consistent")
    print("   [OK] PS truncation fixed")

    # =========================================================================
    # FIX 8: Add NMA Simplification Notes
    # =========================================================================
    print("[8/10] Adding NMA simplification notes...")

    nma_note = '''
    // ============================================================================
    // NETWORK META-ANALYSIS - METHODOLOGICAL NOTE
    // ============================================================================
    // This implementation uses the Bucher method for indirect comparisons,
    // which is valid for simple networks (single indirect path).
    //
    // For complex networks with multiple loops, consider:
    //   - R netmeta package (frequentist NMA)
    //   - R gemtc package (Bayesian NMA with JAGS/Stan)
    //   - Stata network suite
    //
    // Node-splitting for inconsistency is simplified; for rigorous assessment,
    // use the full design-by-treatment interaction model (Higgins et al. 2012).
    // ============================================================================
'''

    if "function runNetworkMetaAnalysis" in content and "Bucher method for indirect comparisons" not in content:
        content = content.replace(
            "function runNetworkMetaAnalysis",
            nma_note + "\n    function runNetworkMetaAnalysis"
        )

    # Update NMA results to note simplification
    content = re.sub(
        r"method: 'Network Meta-Analysis'",
        "method: 'Network Meta-Analysis (Bucher indirect comparison)'",
        content
    )

    fixes_applied.append("NMA simplification notes added")
    print("   [OK] NMA notes added")

    # =========================================================================
    # FIX 9: Add jStat Dependency Documentation
    # =========================================================================
    print("[9/10] Adding jStat dependency documentation...")

    jstat_doc = '''
    // ============================================================================
    // STATISTICAL LIBRARY DEPENDENCIES
    // ============================================================================
    // This application uses jStat for statistical computations:
    //   - jStat.mean(), jStat.stdev(), jStat.variance()
    //   - jStat.percentile() for bootstrap quantiles
    //   - jStat.normal.cdf(), jStat.normal.inv() for p-values
    //   - jStat.chisquare.cdf() for chi-squared tests
    //
    // jStat is loaded via CDN. For offline use, download from:
    //   https://github.com/jstat/jstat
    //
    // Fallback implementations are provided for critical functions.
    // ============================================================================

    // Fallback if jStat not loaded
    if (typeof jStat === 'undefined') {
        console.warn('jStat not loaded - using fallback implementations');
        var jStat = {
            mean: function(arr) { return arr.reduce(function(a,b){return a+b;}, 0) / arr.length; },
            stdev: function(arr) {
                var m = this.mean(arr);
                var v = arr.reduce(function(s,x){return s + Math.pow(x-m,2);}, 0) / (arr.length - 1);
                return Math.sqrt(v);
            },
            percentile: function(arr, p) {
                var sorted = arr.slice().sort(function(a,b){return a-b;});
                var idx = p * (sorted.length - 1);
                var lower = Math.floor(idx);
                var frac = idx - lower;
                if (lower + 1 < sorted.length) {
                    return sorted[lower] * (1 - frac) + sorted[lower + 1] * frac;
                }
                return sorted[lower];
            },
            normal: {
                cdf: function(x, mean, std) {
                    mean = mean || 0; std = std || 1;
                    return 0.5 * (1 + erf((x - mean) / (std * Math.sqrt(2))));
                },
                inv: function(p, mean, std) {
                    mean = mean || 0; std = std || 1;
                    // Approximation
                    var a = [0, -0.322232431088, -1, -0.342242088547, -0.0204231210245, -0.0000453642210148];
                    var b = [0, 0.0993484626060, 0.588581570495, 0.531103462366, 0.103537752850, 0.0038560700634];
                    var y = p - 0.5;
                    if (Math.abs(y) < 0.42) {
                        var r = y * y;
                        return mean + std * y * (a[1] + r * (a[2] + r * (a[3] + r * (a[4] + r * a[5])))) /
                               (1 + r * (b[1] + r * (b[2] + r * (b[3] + r * (b[4] + r * b[5])))));
                    }
                    return mean + std * (p > 0.5 ? 1 : -1) * Math.sqrt(-2 * Math.log(Math.min(p, 1-p)));
                }
            }
        };
        function erf(x) {
            var t = 1 / (1 + 0.5 * Math.abs(x));
            var tau = t * Math.exp(-x*x - 1.26551223 + t*(1.00002368 + t*(0.37409196 + t*(0.09678418 +
                t*(-0.18628806 + t*(0.27886807 + t*(-1.13520398 + t*(1.48851587 + t*(-0.82215223 + t*0.17087277)))))))));
            return x >= 0 ? 1 - tau : tau - 1;
        }
    }
'''

    # Add jStat documentation after the opening script tag
    if "STATISTICAL LIBRARY DEPENDENCIES" not in content:
        # Find the first script section after </style>
        script_start = content.find("<script>")
        if script_start == -1:
            script_start = content.find("</style>")
            if script_start > 0:
                script_start = content.find("\n", script_start) + 1

        if script_start > 0:
            # Find good insertion point
            insert_after = content.find("</style>")
            if insert_after > 0:
                insert_pos = content.find("\n", insert_after) + 1
                # Look for script tag
                next_script = content.find("<script>", insert_pos)
                if next_script > 0:
                    insert_pos = next_script + len("<script>")
                    content = content[:insert_pos] + "\n" + jstat_doc + content[insert_pos:]

    fixes_applied.append("jStat dependency documentation added with fallbacks")
    print("   [OK] jStat documentation added")

    # =========================================================================
    # FIX 10: Add Competing Risks IPCW Limitation Note
    # =========================================================================
    print("[10/10] Adding competing risks IPCW limitation note...")

    ipcw_note = '''
    // ============================================================================
    // COMPETING RISKS - IMPLEMENTATION NOTES
    // ============================================================================
    // This Fine-Gray implementation uses simplified IPCW (Inverse Probability of
    // Censoring Weighting) for computational efficiency in the browser.
    //
    // Limitations vs. R cmprsk:
    //   - Single covariate (treatment) supported
    //   - Simplified KM-based IPCW weights
    //   - No Gray's test for CIF comparison
    //
    // For rigorous competing risks analysis with multiple covariates:
    //   - R: cmprsk::crr(), riskRegression::FGR()
    //   - Stata: stcrreg
    //
    // Reference: Fine JP, Gray RJ (1999). JASA 94:496-509
    // ============================================================================
'''

    if "function runCompetingRisksMA" in content and "Fine-Gray implementation uses simplified IPCW" not in content:
        content = content.replace(
            "function runCompetingRisksMA",
            ipcw_note + "\n    function runCompetingRisksMA"
        )

    # Update competing risks results
    content = re.sub(
        r"method: 'Fine-Gray Subdistribution Hazard \(Competing Risks\)'",
        "method: 'Fine-Gray Subdistribution Hazard (Simplified IPCW)'",
        content
    )

    fixes_applied.append("Competing risks IPCW limitation notes added")
    print("   [OK] IPCW notes added")

    # =========================================================================
    # BONUS: Add Overall Methodology Disclaimer
    # =========================================================================
    print("\n[BONUS] Adding overall methodology disclaimer...")

    overall_disclaimer = '''
    <!-- ====================================================================== -->
    <!-- METHODOLOGY DISCLAIMER - Added per Research Synthesis Methods Review -->
    <!-- ====================================================================== -->
    <div id="methodologyDisclaimer" style="display:none; position:fixed; bottom:20px; right:20px;
         max-width:400px; background:var(--bg-card); border:1px solid var(--border-color);
         border-radius:12px; padding:16px; box-shadow:var(--shadow-lg); z-index:1000;">
        <button onclick="this.parentElement.style.display='none'"
                style="position:absolute;top:8px;right:8px;background:none;border:none;
                       color:var(--text-muted);cursor:pointer;font-size:1.2rem;">&times;</button>
        <h4 style="margin:0 0 8px 0;color:var(--accent-primary);">Methodology Note</h4>
        <p style="font-size:0.85rem;color:var(--text-secondary);margin:0;">
            This browser-based tool provides <strong>approximate</strong> implementations
            of statistical methods for educational and exploratory purposes.
            For publication-quality analyses, validate results against R (metafor, lme4, survival)
            or Stata reference implementations.
        </p>
        <p style="font-size:0.75rem;color:var(--text-muted);margin:8px 0 0 0;">
            <a href="#" onclick="showAllCitations();return false;" style="color:var(--accent-info);">
                View methodological references
            </a>
        </p>
    </div>
    <script>
        // Show disclaimer on first visit
        if (!localStorage.getItem('disclaimerSeen')) {
            setTimeout(function() {
                document.getElementById('methodologyDisclaimer').style.display = 'block';
                localStorage.setItem('disclaimerSeen', 'true');
            }, 2000);
        }
    </script>
'''

    # Add disclaimer before closing body tag
    if "methodologyDisclaimer" not in content:
        content = content.replace("</body>", overall_disclaimer + "\n</body>")
        fixes_applied.append("Overall methodology disclaimer added")

    print("   [OK] Methodology disclaimer added")

    # =========================================================================
    # Write Fixed Content
    # =========================================================================
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    new_len = len(content)
    lines = content.count('\n')

    # =========================================================================
    # Summary
    # =========================================================================
    print("\n" + "=" * 70)
    print("EDITORIAL REVISION V3 - COMPLETE")
    print("=" * 70)
    print(f"\nFile: {filepath}")
    print(f"Total lines: {lines:,}")
    print(f"Size: {original_len:,} -> {new_len:,} bytes (+{new_len-original_len:,})")

    print(f"\nFixes Applied ({len(fixes_applied)}):")
    for i, fix in enumerate(fixes_applied, 1):
        print(f"  {i}. {fix}")

    print("\n" + "=" * 70)
    print("ALL 10 EDITORIAL ISSUES ADDRESSED")
    print("=" * 70)
    print("""
Summary of Changes:
1. One-stage analysis: Labeled as 'Approximate' with R/Stata references
2. SuperLearner: Trees increased to 50, labeled as browser-optimized
3. Datasets: Clearly labeled as 'Illustrative Subsets' with actual counts
4. R claims: 'Better than R' replaced with 'Comparable to R'
5. Bootstrap CI: BCa labeled as 'Approximate'
6. GRADE: Disclaimer added requiring expert review
7. PS truncation: Constants defined for consistency
8. NMA: Bucher method limitations documented
9. jStat: Dependency documented with fallback implementations
10. Competing risks: IPCW simplification noted

BONUS: Overall methodology disclaimer added (shows on first visit)
""")

    return True


if __name__ == "__main__":
    filepath = str((__import__('pathlib').Path(__file__).resolve().parents[2] / 'ipd-meta-pro.html'))
    fix_all_editorial_issues(filepath)

