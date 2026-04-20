#!/usr/bin/env python3
"""Fix null parent error in inner-tab click handler"""

import sys
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def main():
    filepath = str((__import__('pathlib').Path(__file__).resolve().parents[2] / 'ipd-meta-pro.html'))

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_size = len(content)
    print(f"Original size: {original_size:,} bytes")

    # The problematic pattern with single space indentation
    old_pattern = """ const parent = tab.closest('.card');
 parent.querySelectorAll('.inner-tab').forEach(t => t.classList.remove('active'));
 tab.classList.add('active');"""

    new_pattern = """ const parent = tab.closest('.card');
 if (parent) {
 parent.querySelectorAll('.inner-tab').forEach(t => t.classList.remove('active'));
 tab.classList.add('active');
 }"""

    if old_pattern in content:
        content = content.replace(old_pattern, new_pattern)
        print("[OK] Added null check for parent")

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

        print(f"New size: {len(content):,} bytes")
    else:
        print("[WARN] Pattern not found, trying without leading space...")

        # Try alternative pattern
        old_pattern2 = """const parent = tab.closest('.card');
 parent.querySelectorAll('.inner-tab').forEach(t => t.classList.remove('active'));
 tab.classList.add('active');"""

        if old_pattern2 in content:
            new_pattern2 = """const parent = tab.closest('.card');
 if (parent) {
 parent.querySelectorAll('.inner-tab').forEach(t => t.classList.remove('active'));
 tab.classList.add('active');
 }"""
            content = content.replace(old_pattern2, new_pattern2)
            print("[OK] Added null check for parent (alt pattern)")
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"New size: {len(content):,} bytes")
        else:
            print("[WARN] Alt pattern not found either")

    print("Done!")

if __name__ == '__main__':
    main()

