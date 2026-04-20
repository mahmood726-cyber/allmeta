import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the normalQuantile formula - the original has mismatched parentheses
# The formula should be simplified to avoid this complexity
old_code = '''x = q * (((((((a[7] || 0) * r + a[6] || 0) * r + a[5]) * r + a[4]) * r + a[3]) * r + a[2]) * r + a[1]) * r + 1) /
          (((((((b[7] || 0) * r + b[6] || 0) * r + b[5]) * r + b[4]) * r + b[3]) * r + b[2]) * r + b[1]) * r + 1);'''

# Simplified correct version
new_code = '''// Horner's method for polynomial evaluation
        let num = 1;
        for (let i = 1; i <= 5; i++) num = num * r + a[i];
        let den = 1;
        for (let i = 1; i <= 5; i++) den = den * r + b[i];
        x = q * num / den;'''

if old_code in content:
    content = content.replace(old_code, new_code)
    print('Fixed normalQuantile formula!')
else:
    print('Could not find exact pattern, trying alternative fix...')
    # Try to fix by replacing the entire normalQuantile method
    pattern = r"(normalQuantile\(p\) \{[\s\S]*?const q = p - 0\.5;[\s\S]*?let r, x;[\s\S]*?if \(Math\.abs\(q\) <= 0\.425\) \{[\s\S]*?r = 0\.180625 - q \* q;)[\s\S]*?(x = q \* \(\(\(\(\(\(\(a\[7\][\s\S]*?\} else \{)"

    match = re.search(pattern, content)
    if match:
        # Replace with simpler calculation
        simple_calc = '''
        // Horner's method for polynomial evaluation
        let num = 1;
        for (let i = 1; i <= 5; i++) num = num * r + a[i];
        let den = 1;
        for (let i = 1; i <= 5; i++) den = den * r + b[i];
        x = q * num / den;
      '''
        content = content[:match.start(1)] + match.group(1) + simple_calc + match.group(2)[1:] + content[match.end():]
        print('Fixed with alternative method!')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done!')
