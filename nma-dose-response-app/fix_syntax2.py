import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the stray );
old = '''        dom.exportStatus.textContent = "Exported bias analysis checklist";
      });
    }
);

    // ========================================================================
    // BEYOND R EVENT HANDLERS'''

new = '''        dom.exportStatus.textContent = "Exported bias analysis checklist";
      });
    }

    // ========================================================================
    // BEYOND R EVENT HANDLERS'''

if old in content:
    content = content.replace(old, new)
    print('Fixed stray );')
else:
    print('Pattern not found, trying alternative...')
    # Try different approach
    content = content.replace('\n);\n\n    // ========================================================================\n    // BEYOND R EVENT HANDLERS', '\n\n    // ========================================================================\n    // BEYOND R EVENT HANDLERS')
    print('Applied alternative fix')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done!')
