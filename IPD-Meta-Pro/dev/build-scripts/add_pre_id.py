# sentinel:skip-file — hardcoded paths are fixture/registry/audit-narrative data for this repo's research workflow, not portable application configuration. Same pattern as push_all_repos.py and E156 workbook files.
#!/usr/bin/env python3
"""Add id to pre element for R code copy functionality"""

import sys
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def main():
    filepath = str((__import__('pathlib').Path(__file__).resolve().parents[2] / 'ipd-meta-pro.html'))

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    old = '<pre style="margin: 0; white-space: pre-wrap;">#!/usr/bin/env Rscript'
    new = '<pre id="rValidationCode" style="margin: 0; white-space: pre-wrap;">#!/usr/bin/env Rscript'

    if old in content:
        content = content.replace(old, new, 1)  # Only replace first occurrence
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print("[OK] Added id='rValidationCode' to pre element")
    else:
        if 'id="rValidationCode"' in content:
            print("[OK] id already exists")
        else:
            print("[WARN] Pattern not found")

if __name__ == '__main__':
    main()

