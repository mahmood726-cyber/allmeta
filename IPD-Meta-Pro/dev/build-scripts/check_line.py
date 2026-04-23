# sentinel:skip-file — hardcoded paths are fixture/registry/audit-narrative data for this repo's research workflow, not portable application configuration. Same pattern as push_all_repos.py and E156 workbook files.
﻿#!/usr/bin/env python3
"""Check for invisible characters around line 31689"""

import sys
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

with open(str((__import__('pathlib').Path(__file__).resolve().parents[2] / 'ipd-meta-pro.html')), 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Check line 31689 (0-indexed: 31688)
target_line = 31688
print(f"Line {target_line + 1}:")
line = lines[target_line]
print(f"Content: {repr(line)}")
print(f"Length: {len(line)}")

# Check around column 47
print(f"\nCharacters 40-60:")
for i, char in enumerate(line[40:60], start=40):
    print(f"  [{i}] {repr(char)} (ord={ord(char)})")

# Also check the lines before and after
print(f"\nLines {target_line}-{target_line + 4}:")
for i in range(max(0, target_line - 2), min(len(lines), target_line + 5)):
    print(f"  {i+1}: {lines[i].rstrip()[:100]}")

# Search for any unusual characters in the file
print("\nSearching for unusual characters (non-ASCII in JS)...")
in_script = False
script_start = None
for i, line in enumerate(lines):
    if '<script>' in line.lower():
        in_script = True
        script_start = i
    elif '</script>' in line.lower():
        in_script = False

    if in_script:
        for j, char in enumerate(line):
            if ord(char) > 127 and char not in 'â†’â†â†‘â†“â– â—†â—â—‹â˜…â˜†â™ â™£â™¥â™¦':
                # Skip common unicode in strings
                context = line[max(0,j-10):j+10]
                if 'emoji' not in context.lower() and 'icon' not in context.lower():
                    print(f"  Line {i+1}, col {j+1}: {repr(char)} (ord={ord(char)})")

print("\nDone!")

