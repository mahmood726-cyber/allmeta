"""One-shot migration: add `course:` and `featured:` fields to hub/projects.js
entries based on the v4 review crosswalk.

Run from repo root:  python scripts/add_course_and_featured.py
Idempotent (skips entries that already have the field).
Delete after commit.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECTS = ROOT / "hub" / "projects.js"

COURSE_BASE = "https://mahmood726-cyber.github.io/synthesis-courses/"

# Project name → companion course slug (relative to COURSE_BASE).
# Sources: review-findings-v4.md crosswalk + COURSE_MASTER_PLAN.md.
COURSE_MAP = {
    "Forest Plot Viewer":            "synthesis-course.html",
    "Heterogeneity Explorer":        "synthesis-course.html",
    "MA Workbench":                  "synthesis-course.html",
    "Meta-Regression":               "meta-analysis-methods-course.html",
    "MH / Peto pooling":             "meta-analysis-methods-course.html",
    "PICO Formulator":               "meta-analysis-topic-selection-course.html",
    "Citation Chaser":               "meta-analysis-topic-selection-course.html",
    "PRISMA Flow":                   "meta-analysis-writing-course.html",
    "PRISMA 2020 Checklist":         "meta-analysis-writing-course.html",
    "GRADE SoF Builder":             "grade-certainty-course.html",
    "GRADE-CERQual":                 "grade-certainty-course.html",
    "CINeMA (NMA confidence)":       "grade-certainty-course.html",
    "RoB 2":                         "risk-of-bias-mastery-course.html",
    "ROBINS-I":                      "risk-of-bias-mastery-course.html",
    "ROBINS-E":                      "risk-of-bias-mastery-course.html",
    "RoB Traffic Light":             "risk-of-bias-mastery-course.html",
    "QUADAS-2":                      "risk-of-bias-mastery-course.html",
    "Bayesian MA":                   "advanced-meta-analysis-course.html",
    "Bayesian MA — MCMC":            "advanced-meta-analysis-course.html",
    "Multi-level MA":                "advanced-meta-analysis-course.html",
    "GOSH Plot":                     "advanced-meta-analysis-course.html",
    "GOSH Meta-Regression":          "advanced-meta-analysis-course.html",
    "Network MA (SUCRA)":            "advanced-meta-analysis-course.html",
    "NMA Pro v8":                    "advanced-meta-analysis-course.html",
    "Component NMA":                 "advanced-meta-analysis-course.html",
    "NMA Inconsistency":             "advanced-meta-analysis-course.html",
    "NMA Global Inconsistency":      "advanced-meta-analysis-course.html",
    "Bucher Indirect":               "advanced-meta-analysis-course.html",
    "IPD Meta-Pro":                  "ipd-meta-analysis-course.html",
    "K-M IPD Reconstructor":         "ipd-meta-analysis-course.html",
    "PET-PEESE + Trim-and-Fill":     "publication-bias-detective.html",
    "p-curve / p-uniform":           "publication-bias-detective.html",
    "Copas selection":               "publication-bias-detective.html",
    "Limit meta-analysis":           "publication-bias-detective.html",
    "Pub-bias Tests":                "publication-bias-detective.html",
    "Funnel Plot Explorer":          "publication-bias-detective.html",
    "DTA SROC Explorer":             "dta-course-when-the-test-lies-v4.html",
    "HSROC / Bivariate DTA":         "dta-course-when-the-test-lies-v4.html",
    "Thematic Synthesis":            "qualitative-evidence-synthesis-course.html",
    "AMSTAR-2":                      "umbrella-reviews-course.html",
    "Living Meta":                   "living-reviews-course.html",
    "HTA Pro":                       "hta-oman-course.html",
    "MCID & NI margin":              "hta-oman-course.html",
    "Dose Response Pro":             "hta-oman-course.html",
    "TruthCert Pairwise Pro":        "truthcert-course.html",
    "TSA Calculator":                "cast-when-certainty-kills.html",
    "PowerMA / RIS":                 "cast-when-certainty-kills.html",
    "Local AI setup":                "ai-meta-analysis-course.html",
    "RCT Extractor":                 "ai-meta-analysis-course.html",
    "Citation Dedup":                "meta-sprint-course.html",
    "PRISMA Screening":              "meta-sprint-course.html",
    "Focus Studio":                  "meta-sprint-course.html",
    "WebR Studio":                   "becoming-methodologist.html",
    "WebR Validator":                "becoming-methodologist.html",
    "Pairwise AI":                   "meta-analysis-methods-course.html",
    "Influence Diagnostics":         "advanced-meta-analysis-course.html",
    "NMA Dose-Response":             "advanced-meta-analysis-course.html",
    "Cumulative + Subgroup":         "meta-analysis-methods-course.html",
    "Effect-Size Converter":         "meta-analysis-methods-course.html",
    "Median → Mean/SD":              "meta-analysis-methods-course.html",
    "Median → Mean/SD":         "meta-analysis-methods-course.html",  # alt unicode
    "Proportion MA":                 "meta-analysis-methods-course.html",
    "Search Strategy Translator":    "meta-analysis-topic-selection-course.html",
}

# Anchor tools — surfaced in the "Start here" featured strip above the grid.
# Six concrete entry points for the most common workflows.
FEATURED = {
    "Forest Plot Viewer",
    "PRISMA Flow",
    "RoB 2",
    "GRADE SoF Builder",
    "Network MA (SUCRA)",
    "RCT Extractor",
}


def main() -> int:
    src = PROJECTS.read_text(encoding="utf-8")

    # Find each `name: "<name>"` line and inject the new fields after the
    # entry's closing `}`. Cheaper: insert directly after the `name: "..."` line
    # so the entry stays readable.

    # Match a single entry's name line and capture indentation + line ending.
    # We append fields right after the name line (not after closing brace).
    name_re = re.compile(r'^(\s+)name:\s*"([^"]+)"(,)?\s*$', re.MULTILINE)

    course_added = 0
    featured_added = 0
    skipped = 0

    out_lines: list[str] = []
    pos = 0

    for m in name_re.finditer(src):
        out_lines.append(src[pos:m.end()])
        pos = m.end()

        indent = m.group(1)
        name = m.group(2)

        # Look ahead in the source up to the next entry boundary to see what's
        # already present — guard against duplicate inserts.
        # We pick the next 1500 chars (entries are ~10-15 lines).
        lookahead = src[m.end():m.end() + 1500]
        # Find the closing `}` of THIS entry. Naive: first `}` at or before next `name:`
        next_name = name_re.search(src, pos=m.end())
        end_pos = next_name.start() if next_name else len(src)
        entry_body = src[m.end():end_pos]

        has_course = "course:" in entry_body
        has_featured = "featured:" in entry_body

        course_url = None
        if not has_course and name in COURSE_MAP:
            course_url = COURSE_BASE + COURSE_MAP[name]

        featured_flag = (not has_featured) and (name in FEATURED)

        if course_url or featured_flag:
            # Inject after the name line (which ends at m.end()).
            additions = []
            if featured_flag:
                additions.append(f'{indent}featured: true,')
                featured_added += 1
            if course_url:
                additions.append(f'{indent}course: "{course_url}",')
                course_added += 1
            insertion = "\n" + "\n".join(additions)
            out_lines.append(insertion)
        else:
            skipped += 1

    out_lines.append(src[pos:])
    new_src = "".join(out_lines)

    if new_src == src:
        print("No changes (all entries already have fields, or no matches).")
        return 0

    PROJECTS.write_text(new_src, encoding="utf-8")
    print(f"Updated hub/projects.js")
    print(f"  course: added on {course_added} entries")
    print(f"  featured: added on {featured_added} entries")
    print(f"  skipped (no change): {skipped} entries")
    return 0


if __name__ == "__main__":
    sys.exit(main())
