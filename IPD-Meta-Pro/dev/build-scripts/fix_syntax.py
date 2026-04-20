#!/usr/bin/env python3
"""Fix the JavaScript syntax error by combining split return statements"""

import sys
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def main():
    filepath = str((__import__('pathlib').Path(__file__).resolve().parents[2] / 'ipd-meta-pro.html'))

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_size = len(content)
    print(f"Original size: {original_size:,} bytes")

    # The problematic pattern - return statement split across two lines
    old_pattern = """ return q * (((((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*r+1) /
 (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);"""

    new_pattern = """ return q * (((((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*r+1) / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);"""

    count = content.count(old_pattern)
    print(f"Found {count} occurrences of the pattern")

    if count > 0:
        content = content.replace(old_pattern, new_pattern)
        print(f"[OK] Replaced all {count} occurrences")

        # Write the fixed content
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

        new_size = len(content)
        print(f"New size: {new_size:,} bytes")
    else:
        print("Pattern not found - maybe already fixed?")

    print("Done!")

if __name__ == '__main__':
    main()

