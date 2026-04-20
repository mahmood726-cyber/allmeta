import re

# Read RSM revisions
with open('rsm_editorial_revisions.js', 'r', encoding='utf-8') as f:
    rsm_code = f.read()

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find insertion point - after Tier 1 features section
pattern = r'(class LiveMetaAnalysis[\s\S]*?exportUpdateReport\(\)[\s\S]*?\n  \})'
match = re.search(pattern, content)

if match:
    insert_pos = match.end()
    header = '''

  // ============================================================================
  // RSM EDITORIAL REVISIONS: RESEARCH SYNTHESIS METHODS STANDARDS
  // ============================================================================

'''
    # Remove the leading comments from rsm_code and indent
    rsm_clean = re.sub(r'^// =+\n// RSM EDITORIAL.*?\n// =+\n', '', rsm_code)
    indented = '\n'.join('  ' + line if line.strip() else '' for line in rsm_clean.split('\n'))

    content = content[:insert_pos] + header + indented + content[insert_pos:]
    print('Inserted RSM editorial revisions after Tier 1 features!')
else:
    print('Could not find insertion point, trying alternative...')
    # Try after DataQualityTests
    pattern2 = r'(class DataQualityTests[\s\S]*?runAllTests[\s\S]*?\n  \})'
    match2 = re.search(pattern2, content)
    if match2:
        insert_pos = match2.end()
        header = '''

  // ============================================================================
  // RSM EDITORIAL REVISIONS: RESEARCH SYNTHESIS METHODS STANDARDS
  // ============================================================================

'''
        rsm_clean = re.sub(r'^// =+\n// RSM EDITORIAL.*?\n// =+\n', '', rsm_code)
        indented = '\n'.join('  ' + line if line.strip() else '' for line in rsm_clean.split('\n'))
        content = content[:insert_pos] + header + indented + content[insert_pos:]
        print('Inserted after DataQualityTests!')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done integrating RSM revisions!')
