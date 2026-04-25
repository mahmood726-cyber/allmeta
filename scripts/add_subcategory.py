"""One-shot migration: add `subcategory:` field to projects.js entries in
the over-broad "Evidence Synthesis" bucket so users can find tools within it.

Run: python scripts/add_subcategory.py
Idempotent. Delete after commit.
"""
from __future__ import annotations
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECTS = ROOT / "hub" / "projects.js"

# Subcategory mapping for entries currently in `category: "Evidence Synthesis"`.
# Five buckets calibrated to what a reviewer asks: "I want to pool", "I want to
# explore heterogeneity", "I'm checking publication bias", "I need an effect
# size in the right form", "I'm running sensitivity / robustness checks".
SUB_MAP = {
    # Pooling — the basic estimator + IPD/Bayesian/multi-level variants
    "Forest Plot Viewer":       "Pooling",
    "MA Workbench":             "Pooling",
    "MH / Peto pooling":        "Pooling",
    "Multi-level MA":           "Pooling",
    "Bayesian MA":              "Pooling",
    "Bayesian MA — MCMC":       "Pooling",
    "TruthCert Pairwise Pro":   "Pooling",
    "Pairwise AI":              "Pooling",
    "Proportion MA":            "Pooling",
    "IPD Meta-Pro":             "Pooling",

    # Heterogeneity — explore τ² / I² / per-study influence on the result
    "Heterogeneity Explorer":   "Heterogeneity",
    "GOSH Plot":                "Heterogeneity",
    "GOSH Meta-Regression":     "Heterogeneity",
    "Meta-Regression":          "Heterogeneity",
    "Influence Diagnostics":    "Heterogeneity",

    # Publication bias / small-study effects
    "PET-PEESE + Trim-and-Fill": "Publication bias",
    "p-curve / p-uniform":       "Publication bias",
    "Copas selection":           "Publication bias",
    "Limit meta-analysis":       "Publication bias",
    "Pub-bias Tests":            "Publication bias",
    "Funnel Plot Explorer":      "Publication bias",

    # Effect-size handling / data prep
    "Effect-Size Converter":     "Effect-size tools",
    "Median → Mean/SD":          "Effect-size tools",
    "Dose Response Pro":         "Effect-size tools",
    "K-M IPD Reconstructor":     "Effect-size tools",
    "Al-Mizan":                  "Effect-size tools",

    # Sensitivity / robustness
    "Cumulative + Subgroup":     "Sensitivity",
    "TSA Calculator":            "Sensitivity",
    "WebR Validator":            "Sensitivity",

    # Reporting / quality artefacts that landed in Evidence Synthesis
    "PRISMA Flow":               "Reporting",
    "PRISMA Screening":          "Reporting",
    "RoB Traffic Light":         "Reporting",
    "GRADE SoF Builder":         "Reporting",
    "DTA SROC Explorer":         "Reporting",
}


def main() -> int:
    src = PROJECTS.read_text(encoding="utf-8")
    name_re = re.compile(r'^(\s+)name:\s*"([^"]+)"(,)?\s*$', re.MULTILINE)

    out: list[str] = []
    pos = 0
    added = 0
    skipped = 0

    for m in name_re.finditer(src):
        out.append(src[pos:m.end()])
        pos = m.end()

        indent = m.group(1)
        name = m.group(2)

        # Look ahead at the entry body to check for existing subcategory.
        next_name = name_re.search(src, pos=m.end())
        end_pos = next_name.start() if next_name else len(src)
        body = src[m.end():end_pos]

        if "subcategory:" in body:
            skipped += 1
            continue

        # Only add when we have a mapping AND the entry is in Evidence Synthesis.
        if name not in SUB_MAP:
            continue
        if 'category: "Evidence Synthesis"' not in body:
            continue

        sub = SUB_MAP[name]
        out.append(f'\n{indent}subcategory: "{sub}",')
        added += 1

    out.append(src[pos:])
    new_src = "".join(out)
    if new_src == src:
        print("No changes.")
        return 0

    PROJECTS.write_text(new_src, encoding="utf-8")
    print(f"Subcategory added to {added} entries; {skipped} already had it.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
