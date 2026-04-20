import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the missing closing parenthesis and semicolon
old = '''    dom.exportSummaryCsv.addEventListener("click", () => {
      exportSummaryCsv();
      dom.exportStatus.textContent = "Exported summary CSV.";
    }


    // ========================================================================
    // BEYOND R PUBLICATION BIAS EVENT HANDLERS'''

new = '''    dom.exportSummaryCsv.addEventListener("click", () => {
      exportSummaryCsv();
      dom.exportStatus.textContent = "Exported summary CSV.";
    });


    // ========================================================================
    // BEYOND R PUBLICATION BIAS EVENT HANDLERS'''

if old in content:
    content = content.replace(old, new)
    print('Fixed missing );')
else:
    print('Pattern not found')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done!')
