import re

# Read the editorial improvements
with open('editorial_improvements.js', 'r', encoding='utf-8') as f:
    editorial_code = f.read()

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find insertion point (after BEYOND R section, before MODEL DIAGNOSTICS)
pattern = r'(// MODEL DIAGNOSTICS\s*// =+)'
match = re.search(pattern, content)
if match:
    insert_pos = match.start()
    header = '\n  // ============================================================================\n  // EDITORIAL REVIEW: RESEARCH SYNTHESIS METHODS STANDARDS\n  // ============================================================================\n\n'
    indented = '\n'.join('  ' + line if line.strip() else '' for line in editorial_code.strip().split('\n'))
    content = content[:insert_pos] + header + indented + '\n\n  ' + content[insert_pos:]
    print('Inserted editorial improvements!')
else:
    print('Could not find MODEL DIAGNOSTICS, inserting at end of classes...')
    # Alternative: find after LivingReviewSimulator
    pattern2 = r'(class LivingReviewSimulator[\s\S]*?estimateStabilityPoint[\s\S]*?\}\s*\})'
    match2 = re.search(pattern2, content)
    if match2:
        insert_pos = match2.end()
        header = '\n\n  // ============================================================================\n  // EDITORIAL REVIEW: RESEARCH SYNTHESIS METHODS STANDARDS\n  // ============================================================================\n\n'
        indented = '\n'.join('  ' + line if line.strip() else '' for line in editorial_code.strip().split('\n'))
        content = content[:insert_pos] + header + indented + content[insert_pos:]
        print('Inserted editorial improvements (alternative)!')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done!')
