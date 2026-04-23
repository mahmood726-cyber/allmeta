# sentinel:skip-file — hardcoded paths are fixture/registry/audit-narrative data for this repo's research workflow, not portable application configuration. Same pattern as push_all_repos.py and E156 workbook files.
﻿#!/usr/bin/env python3
"""Extract JavaScript from HTML and check for syntax errors"""

import re
import subprocess
import sys
import tempfile
import os
from pathlib import Path

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

had_error = False
app_path = Path(__file__).resolve().parents[2] / 'ipd-meta-pro.html'

with open(str(app_path), 'r', encoding='utf-8') as f:
    content = f.read()

# Find all script sections
script_pattern = r'<script[^>]*>(.*?)</script>'
scripts = re.findall(script_pattern, content, re.DOTALL)

print(f"Found {len(scripts)} script section(s)")

for i, js in enumerate(scripts):
    if len(js.strip()) > 100:  # Only check substantial scripts
        print(f"\nChecking script {i+1} ({len(js)} chars)...")

        temp_file = None
        try:
            with tempfile.NamedTemporaryFile(
                mode='w',
                encoding='utf-8',
                suffix='.js',
                prefix=f'ipd_meta_temp_check_{i}_',
                delete=False,
            ) as temp_handle:
                temp_handle.write(js)
                temp_file = temp_handle.name

            try:
                result = subprocess.run(
                    ['node', '--check', temp_file],
                    capture_output=True,
                    text=True
                )
            except FileNotFoundError:
                print("  [ERROR] node is not available on PATH")
                had_error = True
                continue

            if result.returncode == 0:
                print(f"  [OK] No syntax errors")
            else:
                had_error = True
                print(f"  [ERROR] Syntax errors found:")
                # Parse error to find line number
                error_lines = result.stderr.split('\n')
                for line in error_lines[:10]:
                    if line.strip():
                        print(f"    {line}")

                # Show the problematic code
                if 'SyntaxError' in result.stderr:
                    # Try to extract line number
                    match = re.search(r':(\d+)', result.stderr)
                    if match:
                        line_num = int(match.group(1))
                        lines = js.split('\n')
                        print(f"\n  Context around line {line_num}:")
                        for j in range(max(0, line_num-3), min(len(lines), line_num+3)):
                            marker = ">>>" if j == line_num - 1 else "   "
                            print(f"    {marker} {j+1}: {lines[j][:100]}")
        finally:
            if temp_file:
                try:
                    os.remove(temp_file)
                except OSError:
                    pass

print("\nDone!")
if had_error:
    raise SystemExit(1)

