# sentinel:skip-file — hardcoded paths are fixture/registry/audit-narrative data for this repo's research workflow, not portable application configuration. Same pattern as push_all_repos.py and E156 workbook files.
﻿#!/usr/bin/env python3
"""Fix canvas size 0 issue in plot functions"""

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

    fixes_made = 0

    # Fix drawFunnel
    old_funnel = """drawFunnel: (canvas, effects, se, pooled, options = {}) => {
 const ctx = canvas.getContext('2d');
 const width = canvas.width = canvas.offsetWidth * 2;
 const height = canvas.height = canvas.offsetHeight * 2;"""

    new_funnel = """drawFunnel: (canvas, effects, se, pooled, options = {}) => {
 const ctx = canvas.getContext('2d');
 const width = canvas.width = Math.max(canvas.offsetWidth * 2, 800);
 const height = canvas.height = Math.max(canvas.offsetHeight * 2, 600);"""

    if old_funnel in content:
        content = content.replace(old_funnel, new_funnel)
        print("[OK] Fixed drawFunnel canvas size check")
        fixes_made += 1
    else:
        print("[WARN] drawFunnel pattern not found")

    # Fix drawForest
    old_forest = """drawForest: (canvas, studies, pooled, options = {}) => {
 const ctx = canvas.getContext('2d');
 const width = canvas.width = canvas.offsetWidth * 2;
 const height = canvas.height = canvas.offsetHeight * 2;"""

    new_forest = """drawForest: (canvas, studies, pooled, options = {}) => {
 const ctx = canvas.getContext('2d');
 const width = canvas.width = Math.max(canvas.offsetWidth * 2, 800);
 const height = canvas.height = Math.max(canvas.offsetHeight * 2, 600);"""

    if old_forest in content:
        content = content.replace(old_forest, new_forest)
        print("[OK] Fixed drawForest canvas size check")
        fixes_made += 1
    else:
        print("[WARN] drawForest pattern not found")

    # Fix any other canvas size patterns
    # Generic pattern: canvas.width = canvas.offsetWidth * 2
    # Replace with: canvas.width = Math.max(canvas.offsetWidth * 2, 800)

    # Find all canvas sizing patterns and add Math.max
    pattern1 = re.compile(r"canvas\.width = canvas\.offsetWidth \* 2(?!.*Math\.max)")
    pattern2 = re.compile(r"canvas\.height = canvas\.offsetHeight \* 2(?!.*Math\.max)")

    count1 = len(pattern1.findall(content))
    count2 = len(pattern2.findall(content))
    print(f"Found {count1} width patterns and {count2} height patterns remaining")

    # Generic fix for all remaining canvas sizing patterns
    content = pattern1.sub("canvas.width = Math.max(canvas.offsetWidth * 2, 800)", content)
    content = pattern2.sub("canvas.height = Math.max(canvas.offsetHeight * 2, 600)", content)

    if count1 > 0 or count2 > 0:
        fixes_made += count1 + count2
        print(f"[OK] Fixed {count1 + count2} additional canvas size patterns")

    if fixes_made > 0:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"New size: {len(content):,} bytes")
    else:
        print("No fixes needed")

    print("Done!")

if __name__ == '__main__':
    main()

