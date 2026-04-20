#!/usr/bin/env python3
"""Add software comparison table to editorial review"""

import sys
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def main():
    filepath = str((__import__('pathlib').Path(__file__).resolve().parents[2] / 'ipd-meta-pro.html'))

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the references section and add comparison table before it
    old_refs = '''<div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                        <h5 style="color: var(--accent-info); margin-bottom: 0.5rem;">5. References</h5>'''

    comparison_table = '''<div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                        <h5 style="color: var(--accent-primary); margin-bottom: 0.75rem;">5. Software Comparison</h5>
                        <div style="overflow-x: auto;">
                            <table style="width: 100%; font-size: 0.75rem; border-collapse: collapse;">
                                <thead>
                                    <tr style="background: var(--bg-secondary);">
                                        <th style="padding: 0.5rem; text-align: left; border-bottom: 1px solid var(--border-color);">Feature</th>
                                        <th style="padding: 0.5rem; text-align: center; border-bottom: 1px solid var(--border-color);">IPD Meta Pro</th>
                                        <th style="padding: 0.5rem; text-align: center; border-bottom: 1px solid var(--border-color);">R metafor</th>
                                        <th style="padding: 0.5rem; text-align: center; border-bottom: 1px solid var(--border-color);">RevMan</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr><td style="padding: 0.4rem;">Installation</td><td style="text-align:center; color: var(--accent-success);">None</td><td style="text-align:center;">R required</td><td style="text-align:center;">Download</td></tr>
                                    <tr><td style="padding: 0.4rem;">Native IPD</td><td style="text-align:center; color: var(--accent-success);">Yes</td><td style="text-align:center;">Via code</td><td style="text-align:center; color: var(--accent-danger);">No</td></tr>
                                    <tr><td style="padding: 0.4rem;">Survival</td><td style="text-align:center; color: var(--accent-success);">Yes</td><td style="text-align:center;">Limited</td><td style="text-align:center; color: var(--accent-danger);">No</td></tr>
                                    <tr><td style="padding: 0.4rem;">Bayesian</td><td style="text-align:center; color: var(--accent-success);">Yes</td><td style="text-align:center;">Package</td><td style="text-align:center; color: var(--accent-danger);">No</td></tr>
                                    <tr><td style="padding: 0.4rem;">Pub Bias</td><td style="text-align:center; color: var(--accent-success);">8 methods</td><td style="text-align:center;">5</td><td style="text-align:center;">2</td></tr>
                                    <tr><td style="padding: 0.4rem;">Browser</td><td style="text-align:center; color: var(--accent-success);">Yes</td><td style="text-align:center; color: var(--accent-danger);">No</td><td style="text-align:center; color: var(--accent-danger);">No</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                        <h5 style="color: var(--accent-info); margin-bottom: 0.5rem;">6. References</h5>'''

    if old_refs in content:
        content = content.replace(old_refs, comparison_table)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print("[OK] Added software comparison table")
        print(f"New size: {len(content):,} bytes")
    else:
        print("[WARN] References section not found")

    print("Done!")

if __name__ == '__main__':
    main()

