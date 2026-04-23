# sentinel:skip-file — hardcoded paths are fixture/registry/audit-narrative data for this repo's research workflow, not portable application configuration. Same pattern as push_all_repos.py and E156 workbook files.
#!/usr/bin/env python3
"""Update editorial review copy without implying current independent acceptance."""

import sys
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def main():
    filepath = str((__import__('pathlib').Path(__file__).resolve().parents[2] / 'ipd-meta-pro.html'))

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    content = content.replace('Overall Score: 92/100', 'Historical review text only')
    content = content.replace('Overall Score: 94/100', 'Historical review text only')
    content = content.replace(
        'Reviewed January 2025 | Research Synthesis Methods Standards',
        'Archived January 2025 review draft | Not a current independent acceptance'
    )

    # Update the alert box at the end
    old_alert = '''<div class="alert alert-success">
                        <strong>Editorial Recommendation:</strong> IPD Meta-Analysis Pro meets Research Synthesis Methods standards
                        for statistical accuracy and methodological rigor. Suitable for systematic reviews requiring IPD analysis.
                    </div>'''

    new_alert = '''<div class="alert alert-warning">
                        <strong>Editorial Note:</strong><br>
                        This section is retained as archived drafting material. It is not evidence of current journal acceptance,
                        live Selenium status, or current parity with R.
                    </div>

                    <div style="background: var(--bg-tertiary); padding: 0.75rem; border-radius: 8px; margin-top: 1rem;">
                        <p style="margin: 0; font-size: 0.8rem; color: var(--text-muted);">
                            <strong>Archived Snapshot:</strong> January 2025 |
                            <strong>Current Build:</strong> rerun Selenium and R benchmark scripts before using validation claims
                        </p>
                    </div>'''

    if old_alert in content:
        content = content.replace(old_alert, new_alert)
        print("[OK] Updated editorial alert box")
    else:
        print("[WARN] Alert box pattern not found")

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"Final size: {len(content):,} bytes")
    print("Done!")

if __name__ == '__main__':
    main()

