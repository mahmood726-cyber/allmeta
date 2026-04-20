#!/usr/bin/env python3
"""Fix the unbalanced parentheses in normQuantile function"""

import sys
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def main():
    filepath = str((__import__('pathlib').Path(__file__).resolve().parents[2] / 'ipd-meta-pro.html'))

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_size = len(content)
    print(f"Original size: {original_size:,} bytes")

    # The buggy pattern - 7 opening parens but only 6 closing in numerator
    # Current: (((((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*r+1)
    # Fixed:   ((((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*r+1)

    old_pattern = "(((((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*r+1)"
    new_pattern = "((((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*r+1)"

    count = content.count(old_pattern)
    print(f"Found {count} occurrences of the buggy pattern")

    # Verify paren counts
    print(f"\nOld pattern: opens={old_pattern.count('(')}, closes={old_pattern.count(')')}")
    print(f"New pattern: opens={new_pattern.count('(')}, closes={new_pattern.count(')')}")

    if count > 0:
        content = content.replace(old_pattern, new_pattern)
        print(f"[OK] Replaced all {count} occurrences")

        # Write the fixed content
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

        new_size = len(content)
        print(f"New size: {new_size:,} bytes")
    else:
        print("Pattern not found - checking variants...")

        # Try with NORM_A instead of a
        old_pattern2 = "(((((((NORM_A[0]*r+NORM_A[1])*r+NORM_A[2])*r+NORM_A[3])*r+NORM_A[4])*r+NORM_A[5])*r+1)"
        count2 = content.count(old_pattern2)
        print(f"Found {count2} occurrences with NORM_A")

    print("Done!")

if __name__ == '__main__':
    main()

