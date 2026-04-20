import re

# Read both beyond_r files
with open('beyond_r_comprehensive.js', 'r', encoding='utf-8') as f:
    beyond_r1 = f.read()

with open('beyond_r_part2.js', 'r', encoding='utf-8') as f:
    beyond_r2 = f.read()

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find insertion point before init()
pattern = r'(\n  async function init\(\))'
match = re.search(pattern, content)

if match:
    insert_pos = match.start()

    header = '''

  // ============================================================================
  // BEYOND R: COMPREHENSIVE PUBLICATION BIAS METHODS
  // Surpassing metafor, weightr, RoBMA, puniform, metasens
  // ============================================================================

'''

    # Indent all code with 2 spaces
    def indent_code(code):
        lines = []
        for line in code.split('\n'):
            if line.strip():
                lines.append('  ' + line)
            else:
                lines.append('')
        return '\n'.join(lines)

    indented1 = indent_code(beyond_r1)
    indented2 = indent_code(beyond_r2)

    content = content[:insert_pos] + header + indented1 + '\n\n' + indented2 + '\n' + content[insert_pos:]
    print('Inserted Beyond R classes!')
else:
    print('Could not find insertion point')
    exit(1)

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'app.js updated. Size: {len(content)} chars')
