"""Append a Zenodo 'Code & Data Availability' citation to claim-grounding files.

Grounds the allmeta toolkit's own docs/manuscripts with the concept DOI (always
resolves to the latest version). Idempotent: skips any file already carrying the
DOI. Run with --apply to write; default is dry-run.

Usage:
    python scripts/add_zenodo_grounding.py            # dry-run, prints plan
    python scripts/add_zenodo_grounding.py --apply    # write the blocks
"""
from __future__ import annotations

import sys
from pathlib import Path

CONCEPT_DOI = "10.5281/zenodo.20516880"
DOI_URL = f"https://doi.org/{CONCEPT_DOI}"

# The 19 claim-grounding files (relative to repo root).
TARGETS = [
    "bucher/README.md",
    "dosehtml/PLOS_ONE_Manuscript_DoseResponsePro.txt",
    "HTA/EDITORIAL_REVIEW_RESEARCH_SYNTHESIS_METHODS.md",
    "HTA/WORLD_CLASS_ENHANCEMENTS.md",
    "IPD-Meta-Pro/RSM_EDITOR_DECISION_LETTER.md",
    "nma-dose-response-app/CHANGELOG.md",
    "nma-dose-response-app/README.md",
    "Pairwiseai/DOCUMENTATION.md",
    "Pairwiseai/METAFOR_COMPARISON.md",
    "Pairwiseai/S1_Technical_Documentation.md",
    "Pairwiseai/S3_R_Reference_Values.txt",
    "Pairwiseai/S3_R_Reference_Values_Paper.txt",
    "Pairwiseai/S3_TruthCert_R_Reference.txt",
    "Pairwiseai/S4_HTA_Validation.md",
    "Pairwiseai/Supplement_S3_R_Validation.md",
    "shared/ma-studies-v1.md",
    "IPD-Meta-Pro/docs/superpowers/specs/2026-03-17-phase1-foundation-design.md",
    "dosehtml/docs/Getting_Started_Guide.md",
    "docs/superpowers/plans/2026-05-13-cycle-2.1-flagship-hardening.md",
]

CITATION = (
    "Ahmad, Mahmood. *allmeta — open browser-only tools for evidence synthesis.* "
    f"Zenodo. {DOI_URL}"
)


def _block(is_md: bool) -> str:
    if is_md:
        return (
            "\n\n---\n\n## Code & Data Availability\n\n"
            "The allmeta evidence-synthesis toolkit described here is openly archived "
            "on Zenodo and citable via its concept DOI, which always resolves to the "
            "latest released version:\n\n"
            f"> {CITATION}\n"
        )
    # plain-text (.txt) variant
    return (
        "\n\nCode & Data Availability\n"
        "------------------------\n"
        "The allmeta evidence-synthesis toolkit described here is openly archived on "
        "Zenodo and citable via its concept DOI (resolves to the latest version):\n"
        f"  {CITATION}\n"
    )


def main() -> int:
    apply = "--apply" in sys.argv
    root = Path(__file__).resolve().parents[1]
    added, skipped, missing = [], [], []
    for rel in TARGETS:
        p = root / rel
        if not p.exists():
            missing.append(rel)
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        if CONCEPT_DOI in text:
            skipped.append(rel)
            continue
        block = _block(p.suffix.lower() == ".md")
        if apply:
            p.write_text(text.rstrip("\n") + block, encoding="utf-8")
        added.append(rel)

    mode = "APPLIED" if apply else "DRY-RUN"
    print(f"[{mode}] add Zenodo grounding ({CONCEPT_DOI})")
    print(f"  would-add : {len(added)}")
    for r in added:
        print(f"      + {r}")
    if skipped:
        print(f"  skipped (already present): {len(skipped)}")
        for r in skipped:
            print(f"      = {r}")
    if missing:
        print(f"  MISSING (path not found): {len(missing)}")
        for r in missing:
            print(f"      ? {r}")
    if not apply:
        print("\n(dry-run; re-run with --apply to write)")
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
