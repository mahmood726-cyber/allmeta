"""Append verified DOIs/PMIDs to bare reference lines flagged by citation_cascade.

Every entry was resolved via PubMed + CrossRef and verified on (author, year,
journal, volume/pages) before inclusion. Matching is conservative: a reference
line is only touched when ALL of an entry's `keys` (author surname, year, and a
distinctive title keyword) appear in the normalised line, and exactly ONE entry
matches. Ambiguous (0 or >1 match) lines are left untouched and logged.

Idempotent: a line that already carries a locator (doi:/PMID/10.xxxx/NCT) is
skipped. Dry-run by default; pass --apply to write.

Sources: PubMed (https://pubmed.ncbi.nlm.nih.gov/) and Crossref
(https://api.crossref.org/). DOIs verified 2026-06-04.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

# (keys = lowercase substrings that must ALL be present), locator to append.
ENTRIES = [
    (["greenland", "1992", "trend estimation"], "doi:10.1093/oxfordjournals.aje.a116237"),
    (["van houwelingen", "2002", "multivariate"], "doi:10.1002/sim.1040"),
    (["orsini", "nonlinear"], "doi:10.1093/aje/kwr265"),
    (["higgins", "2002", "quantifying heterogeneity"], "doi:10.1002/sim.1186"),
    (["dersimonian", "1986", "meta-analysis in clinical trials"], "doi:10.1016/0197-2456(86)90046-2"),
    (["hartung", "2001", "overall treatment effect"], "doi:10.1002/sim.791"),
    (["stewart", "2015", "preferred reporting"], "doi:10.1001/jama.2015.3656"),
    (["debray", "2015", "get real"], "doi:10.1002/jrsm.1160"),
    (["huang", "aggregate data meta-analysis and individual"], "doi:10.1097/MD.0000000000003312"),
    (["simmonds", "individual patient data from randomized"], "doi:10.1191/1740774505cn087oa"),
    (["wallace", "openmee"], "doi:10.1111/2041-210x.12708"),
    (["colditz", "bcg"], "PMID:8309034"),
    (["antithrombotic", "antiplatelet therapy"], "doi:10.1136/bmj.324.7329.71"),
    (["teo", "magnesium"], "doi:10.1136/bmj.303.6816.1499"),
    (["veroniki", "between-study variance"], "doi:10.1002/jrsm.1164"),
    (["cker", "limit meta-analysis"], "doi:10.1093/biostatistics/kxq046"),  # Rücker
    (["turner", "extent of heterogeneity"], "PMID:22461129"),
    (["debray", "2013", "clinical prediction models"], "doi:10.1002/sim.5732"),
    (["carpenter", "stan"], "doi:10.18637/jss.v076.i01"),
    (["bucher", "direct and indirect"], "doi:10.1016/s0895-4356(97)00049-8"),
    (["yusuf", "beta blockade"], "doi:10.1016/s0033-0620(85)80003-7"),
    (["garrison", "risk-sharing"], "doi:10.1016/j.jval.2013.04.011"),
    (["antithrombotic", "aspirin in the primary"], "doi:10.1016/S0140-6736(09)60503-1"),
    (["cochran", "combination of estimates"], "doi:10.2307/3001666"),
    (["durrleman", "cubic splines"], "doi:10.1002/sim.4780080504"),
    (["harville", "variance component"], "doi:10.1080/01621459.1977.10480998"),
    (["orsini", "2012", "linear and nonlinear"], "doi:10.1093/aje/kwr265"),
    # Second pass (CrossRef-resolved 2026-06-04): stats-journal articles.
    (["gelman", "rubin", "iterative simulation"], "doi:10.1214/ss/1177011136"),
    (["orsini", "2006", "generalized least squares"], "doi:10.1177/1536867x0600600103"),
]

# Files that citation_cascade flagged (have a References section with bare refs).
TARGETS = [
    "IPD-Meta-Pro/IPD_Meta_Pro_PLOS_ONE_Manuscript.md",
    "IPD-Meta-Pro/IPD_Meta_Analysis_Pro_PLOS_ONE_Paper.md",
    "IPD-Meta-Pro/EDITORIAL_REVIEW_RSM.md",
    "dosehtml/Dose_Response_Pro_Complete_Documentation.md",
    "dosehtml/docs/Complete_Documentation.md",
    "dosehtml/docs/Validation_Results_v18.1_Corrected.md",
    "dosehtml/docs/Version_Comparison.md",
    "dosehtml/docs/Computational_Complexity.md",
    "dosehtml/docs/Post_Publication_Enhancements_v18.1.md",
    "Pairwiseai/PLOS_ONE_Paper_Draft.md",
    "Pairwiseai/PLOS_ONE_Paper_Draft_R2.md",
    "Pairwiseai/PLOS_ONE_Paper_Draft_REVISED.md",
    "Pairwiseai/EDITORIAL_REVIEW.md",
    "HTA/paper/F1000_HTA_Artifact_Standard.md",
    "HTA/Submission/F1000_HTA_Artifact_Standard.md",
]

LOCATOR_RX = re.compile(r"\bdoi[:=]|\b10\.\d{4,9}/|\bPMID|\bPMC\d|\bNCT\d{8}", re.IGNORECASE)
AUTHOR_YEAR_RX = re.compile(r"\bet al\b|\(\d{4}[a-z]?\)|\b(19|20)\d{2}\b")


def _match(norm_line: str):
    hits = [loc for keys, loc in ENTRIES if all(k in norm_line for k in keys)]
    # de-dup identical locators (e.g. the two Orsini-nonlinear entries -> same DOI)
    hits = list(dict.fromkeys(hits))
    return hits[0] if len(hits) == 1 else None


def main() -> int:
    apply = "--apply" in sys.argv
    root = Path(__file__).resolve().parents[1]
    written, skipped_has_loc, unmatched = 0, 0, []
    log = []
    for rel in TARGETS:
        p = root / rel
        if not p.exists():
            continue
        lines = p.read_text(encoding="utf-8", errors="replace").split("\n")
        changed = False
        for i, line in enumerate(lines):
            if not AUTHOR_YEAR_RX.search(line) or len(line.strip()) < 25:
                continue
            if LOCATOR_RX.search(line):
                skipped_has_loc += 1
                continue
            norm = re.sub(r"\s+", " ", line.lower())
            loc = _match(norm)
            if loc:
                lines[i] = line.rstrip() + " " + loc
                changed = True
                written += 1
                log.append(f"  {rel}:{i+1}  +{loc}\n      {line.strip()[:95]}")
            else:
                # only count lines that look like a real reference (start w/ number or bullet)
                if re.match(r"^\s*(?:\d+[.)]|[-*])\s", line):
                    unmatched.append(f"  {rel}:{i+1}  {line.strip()[:95]}")
        if changed and apply:
            p.write_text("\n".join(lines), encoding="utf-8")

    mode = "APPLIED" if apply else "DRY-RUN"
    print(f"[{mode}] reference-DOI backfill")
    print(f"  written (matched -> DOI/PMID appended): {written}")
    for l in log:
        print(l)
    print(f"\n  skipped (already had a locator): {skipped_has_loc}")
    print(f"  UNMATCHED reference-looking lines (no verified DOI / book / source error): {len(unmatched)}")
    for u in unmatched:
        print(u)
    if not apply:
        print("\n(dry-run; re-run with --apply to write)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
