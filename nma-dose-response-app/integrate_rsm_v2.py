import re

# Read the RSM v2 file
with open('rsm_editorial_v2.js', 'r', encoding='utf-8') as f:
    rsm_code = f.read()

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    app_content = f.read()

# Insert RSM v2 code before the init() function
# Find the pattern: }  async function init()
pattern = r'(\n  async function init\(\))'
match = re.search(pattern, app_content)

if match:
    insert_pos = match.start()

    header = '''

  // ============================================================================
  // RSM EDITORIAL REVIEW V2: ADDITIONAL PUBLICATION BIAS METHODS
  // Per Research Synthesis Methods editorial requirements
  // ============================================================================

'''

    # Remove header comments and indent all code
    rsm_clean = re.sub(r'^// =+\n// RSM EDITORIAL.*\n// =+\n.*?\n', '', rsm_code, flags=re.DOTALL)
    rsm_clean = re.sub(r'^// =+\n// Per Research.*?\n// =+\n', '', rsm_clean, flags=re.MULTILINE)

    # Indent code with 2 spaces for the IIFE
    indented_lines = []
    for line in rsm_code.split('\n'):
        if line.strip():
            indented_lines.append('  ' + line)
        else:
            indented_lines.append('')
    indented_code = '\n'.join(indented_lines)

    app_content = app_content[:insert_pos] + header + indented_code + '\n' + app_content[insert_pos:]
    print('Inserted RSM v2 classes before init()')
else:
    print('Could not find init() function pattern')
    exit(1)

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(app_content)

print(f'app.js updated. New size: {len(app_content)} chars')
