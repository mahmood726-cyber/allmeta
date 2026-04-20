import re

# Read the PRISMA/CINeMA code
with open('prisma_cinema_code.js', 'r', encoding='utf-8') as f:
    new_code = f.read()

# Remove the window export part since we're inside an IIFE
new_code = re.sub(r'// Export functions by adding.*', '', new_code, flags=re.DOTALL)

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the ERROR HANDLING section header as insertion point
# Insert before ERROR HANDLING section
pattern = r'(\n  // =+\n  // ERROR HANDLING)'
match = re.search(pattern, content)
if match:
    insert_pos = match.start()
    header = '\n\n  // ============================================================================\n  // PRISMA-NMA & CINeMA FRAMEWORK\n  // ============================================================================\n\n'
    indented_code = '\n'.join('  ' + line if line.strip() else '' for line in new_code.strip().split('\n'))
    new_content = content[:insert_pos] + header + indented_code + content[insert_pos:]

    with open('app.js', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('Successfully inserted PRISMA-NMA and CINeMA code!')
else:
    print('Could not find insertion point, trying alternative...')
    # Alternative: find after SAMPLE_CSV
    lines = content.split('\n')
    insert_idx = None
    for i, line in enumerate(lines):
        if 'DrugC,35,1.02,0.16' in line:
            insert_idx = i + 1
            break

    if insert_idx:
        header = '\n  // ============================================================================\n  // PRISMA-NMA & CINeMA FRAMEWORK\n  // ============================================================================\n'
        indented_code = '\n'.join('  ' + line if line.strip() else '' for line in new_code.strip().split('\n'))
        lines.insert(insert_idx, header + indented_code)
        with open('app.js', 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines))
        print('Inserted using alternative method!')
    else:
        print('Failed to find insertion point')
