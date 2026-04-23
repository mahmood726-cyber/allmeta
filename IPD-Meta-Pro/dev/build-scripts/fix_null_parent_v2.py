# sentinel:skip-file — hardcoded paths are fixture/registry/audit-narrative data for this repo's research workflow, not portable application configuration. Same pattern as push_all_repos.py and E156 workbook files.
#!/usr/bin/env python3
"""Fix null parent error in inner-tab click handler - v2"""

import sys
import re
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def main():
    filepath = str((__import__('pathlib').Path(__file__).resolve().parents[2] / 'ipd-meta-pro.html'))

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_size = len(content)
    print(f"Original size: {original_size:,} bytes")

    # Use regex to match flexible whitespace
    # Pattern: const parent = tab.closest('.card');
    #          parent.querySelectorAll('.inner-tab')...
    #          tab.classList.add('active');

    pattern = re.compile(
        r"(const parent = tab\.closest\('\.card'\);)\s*\n(\s*)(parent\.querySelectorAll\('\.inner-tab'\)\.forEach\(t => t\.classList\.remove\('active'\)\);)\s*\n(\s*)(tab\.classList\.add\('active'\);)"
    )

    def replacement(m):
        line1 = m.group(1)
        indent1 = m.group(2)
        line2 = m.group(3)
        indent2 = m.group(4)
        line3 = m.group(5)
        return f"{line1}\n{indent1}if (parent) {{\n{indent1}{line2}\n{indent2}{line3}\n{indent1}}}"

    new_content, count = pattern.subn(replacement, content)

    if count > 0:
        print(f"[OK] Fixed {count} occurrence(s)")
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"New size: {len(new_content):,} bytes")
    else:
        print("[WARN] Pattern not found")
        # Debug: show what we're looking for
        if "const parent = tab.closest('.card')" in content:
            idx = content.find("const parent = tab.closest('.card')")
            print(f"Found const parent at position {idx}")
            print(f"Context:\n{repr(content[idx:idx+200])}")

    print("Done!")

if __name__ == '__main__':
    main()

