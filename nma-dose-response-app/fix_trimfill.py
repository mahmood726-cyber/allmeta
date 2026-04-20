"""Fix Trim-and-Fill convergence bug"""

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the Trim-and-Fill convergence bug
old_line = "const { k0, side } = this.estimateMissing(this.effects, this.ses, pooled.effect);"
new_line = "const { k0, side } = this.estimateMissing(currentEffects, currentSEs, pooled.effect);"

if old_line in content:
    content = content.replace(old_line, new_line)
    print('Fixed Trim-and-Fill convergence bug: now uses current data instead of original')
else:
    print('Trim-and-Fill pattern not found (may already be fixed)')

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'app.js size: {len(content)} chars')
