#!/usr/bin/env python3
"""Add missing JavaScript functions to IPD Meta-Analysis Pro"""

import sys
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def main():
    filepath = str((__import__('pathlib').Path(__file__).resolve().parents[2] / 'ipd-meta-pro.html'))

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_size = len(content)
    print(f"Original size: {original_size:,} bytes")

    # Check if functions already exist
    if 'function switchHelpTab' in content:
        print("switchHelpTab already exists")
        return

    # The JavaScript functions to add
    new_js = '''
// Help tab switching functions
function switchHelpTab(tab) {
    document.querySelectorAll('#helpTabs .inner-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('[id^="helpTab-"]').forEach(p => p.style.display = 'none');

    if (event && event.target) {
        event.target.classList.add('active');
    }
    const tabElement = document.getElementById('helpTab-' + tab);
    if (tabElement) {
        tabElement.style.display = 'block';
    }
}

function copyValidationCode() {
    const codeBlock = document.getElementById('rValidationCode');
    if (codeBlock) {
        navigator.clipboard.writeText(codeBlock.textContent).then(() => {
            showNotification('R validation code copied to clipboard!', 'success');
        }).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = codeBlock.textContent;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showNotification('R validation code copied to clipboard!', 'success');
        });
    }
}

'''

    # Find the closing script tag and add before it
    marker = "console.log('[Bug Fix] All wrapper functions loaded successfully');"
    if marker in content:
        content = content.replace(marker, marker + new_js)
        print("[OK] Added JavaScript functions after bug fix marker")
    else:
        # Fallback: add before </script>
        content = content.replace('</script>', new_js + '</script>', 1)
        print("[OK] Added JavaScript functions before first </script>")

    # Write the updated content
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    new_size = len(content)
    print(f"New size: {new_size:,} bytes (added {new_size - original_size:,} bytes)")
    print("Done!")

if __name__ == '__main__':
    main()

