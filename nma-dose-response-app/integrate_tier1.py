import re

# Read tier1_features.js
with open('tier1_features.js', 'r', encoding='utf-8') as f:
    tier1_code = f.read()

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find insertion point - after Editorial Review section or after Beyond R section
pattern = r'(// EDITORIAL REVIEW: RESEARCH SYNTHESIS METHODS STANDARDS[\s\S]*?class SensitivityAnalyzer[\s\S]*?\n  \})'
match = re.search(pattern, content)

if not match:
    # Alternative: find after LivingReviewSimulator
    pattern = r'(class LivingReviewSimulator[\s\S]*?estimateStabilityPoint[\s\S]*?\n  \})'
    match = re.search(pattern, content)

if match:
    insert_pos = match.end()
    header = '''

  // ============================================================================
  // TIER 1: HIGH-IMPACT FEATURES BEYOND R
  // ============================================================================
  // 1. Gaussian Process Dose-Response (non-parametric Bayesian)
  // 2. Quantile Meta-Analysis (medians, IQR - not just means)
  // 3. Personalized Dose Optimizer (patient-specific dosing)
  // 4. Interactive 3D Dose-Response (WebGL visualization)
  // 5. GRIME/SPRITE Data Quality Tests (fraud detection)
  // 6. Live Meta-Analysis (auto-update simulation)
  // ============================================================================

'''
    # Indent the tier1 code
    indented = '\n'.join('  ' + line if line.strip() else '' for line in tier1_code.split('\n'))
    # Remove the header comments from tier1 since we're adding our own
    indented = re.sub(r'  // =+\s*\n  // TIER 1: HIGH-IMPACT.*?\n  // =+.*?\n', '', indented)

    content = content[:insert_pos] + header + indented + content[insert_pos:]
    print('Inserted Tier 1 features after classes!')
else:
    print('Could not find insertion point. Appending to end of file...')
    content = content + '\n' + tier1_code

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done integrating tier1_features.js!')
