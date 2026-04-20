import re

# Read the diagnostics code
with open('diagnostics_code.js', 'r', encoding='utf-8') as f:
    diagnostics_code = f.read()

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the PRISMA section and insert diagnostics after it
pattern = r'(// Comparison-adjusted funnel plot data preparation\s*function prepareComparisonAdjustedFunnel[^}]+\{[^}]+return plotData;\s*\})'
match = re.search(pattern, content, re.DOTALL)
if match:
    insert_pos = match.end()
    header = '\n\n  // ============================================================================\n  // MODEL DIAGNOSTICS\n  // ============================================================================\n\n'
    indented = '\n'.join('  ' + line if line.strip() else '' for line in diagnostics_code.strip().split('\n'))
    content = content[:insert_pos] + header + indented + content[insert_pos:]
    print('Added diagnostics code!')
else:
    print('Could not find insertion point, trying alternative...')
    # Alternative: find after computePredictionInterval
    pattern2 = r'(function computePredictionInterval[^}]+\{[\s\S]*?return \{[\s\S]*?\};\s*\})'
    match2 = re.search(pattern2, content)
    if match2:
        insert_pos = match2.end()
        header = '\n\n  // ============================================================================\n  // MODEL DIAGNOSTICS\n  // ============================================================================\n\n'
        indented = '\n'.join('  ' + line if line.strip() else '' for line in diagnostics_code.strip().split('\n'))
        content = content[:insert_pos] + header + indented + content[insert_pos:]
        print('Added diagnostics code (alternative)!')

# Save
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done!')
