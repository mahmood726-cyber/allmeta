# sentinel:skip-file — hardcoded paths are fixture/registry/audit-narrative data for this repo's research workflow, not portable application configuration. Same pattern as push_all_repos.py and E156 workbook files.
#!/usr/bin/env python3
"""Fix unescaped quotes in JavaScript strings"""

import sys
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def main():
    filepath = str((__import__('pathlib').Path(__file__).resolve().parents[2] / 'ipd-meta-pro.html'))

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_size = len(content)
    print(f"Original size: {original_size:,} bytes")

    fixes = [
        ("Cook's D", "Cook\\'s D"),
        ("Fisher's z", "Fisher\\'s z"),
        ("Egger's", "Egger\\'s"),
        ("Begg's", "Begg\\'s"),
    ]

    total_fixed = 0
    for old, new in fixes:
        # Only fix within single-quoted strings (where it would break)
        # Look for pattern: '<...[old]...'
        count = 0
        # Simple approach - just fix common patterns
        if old in content:
            # Check if it appears in a single-quoted context
            import re
            # Find cases where old appears inside single quotes
            pattern = f"'[^']*{re.escape(old)}[^']*'"
            matches = re.findall(pattern, content)
            if matches:
                content = content.replace(old, new)
                count = len(matches)
                total_fixed += count
                print(f"[OK] Fixed {count} occurrences of '{old}'")

    if total_fixed > 0:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"\nNew size: {len(content):,} bytes")
        print(f"Total fixes: {total_fixed}")
    else:
        print("No fixes needed")

    print("Done!")

if __name__ == '__main__':
    main()

