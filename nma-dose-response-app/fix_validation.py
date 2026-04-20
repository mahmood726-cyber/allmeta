"""Add input validation to key classes"""

import re

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

fixes = 0

# Common validation code for classes that accept (effects, ses)
validation_code = '''
      // Input validation
      if (!Array.isArray(this.effects) || !Array.isArray(this.ses)) {
        this.error = 'Effects and SEs must be arrays';
        this.effects = [];
        this.ses = [];
        this.n = 0;
        return;
      }
      if (this.effects.length !== this.ses.length) {
        this.error = 'Effects and SEs must have same length';
      }
      if (this.effects.length < 2) {
        this.error = 'At least 2 studies required';
      }
      // Filter out invalid values
      const validIndices = [];
      for (let i = 0; i < this.effects.length; i++) {
        if (Number.isFinite(this.effects[i]) && Number.isFinite(this.ses[i]) && this.ses[i] > 0) {
          validIndices.push(i);
        }
      }
      if (validIndices.length < this.effects.length) {
        this.effects = validIndices.map(i => this.effects[i]);
        this.ses = validIndices.map(i => this.ses[i]);
        this.n = this.effects.length;
      }'''

# Pattern for adding validation after constructor assignment
classes_to_fix = [
    'TrimAndFill',
    'PETandPEESE',
    'BeggMazumdarTest',
    'ZCurveAnalysis',
    'SunsetPowerAnalysis',
    'PublicationBiasSensitivity',
    'SelectionModelComparison',
]

for class_name in classes_to_fix:
    # Pattern: after this.n = this.effects.length;
    pattern = rf'(class {class_name} \{{[\s\S]*?this\.n = this\.effects\.length;)'
    match = re.search(pattern, content)
    if match:
        # Check if validation already exists
        class_section = match.group(1)
        if 'Input validation' not in class_section:
            # Add validation after this.n = ...
            insert_point = match.end()
            content = content[:insert_point] + validation_code + content[insert_point:]
            fixes += 1
            print(f'Added input validation to {class_name}')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'\nTotal validation fixes: {fixes}')
print(f'app.js size: {len(content)} chars')
