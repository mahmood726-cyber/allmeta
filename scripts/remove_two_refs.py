"""Remove the two unresolvable (fabricated) references from the IPD manuscript
and renumber the reference list + in-text markers.

Removes:
  - Fisher DJ ... Stat Med. 2017;36:331-349  (no such record resolves)
  - White IR ... Stata J. 2017;17(3):588-605 (no such record resolves)

The body cites only refs 1-10, in three groups: [1-4], [5,6], [7-10].
After removing #6 (Fisher) and #9 (White) and renumbering 7..25 -> 6..23:
  [1-4] -> [1-4]   (unchanged)
  [5,6] -> [5]     (Fisher dropped)
  [7-10] -> [6-8]  (White dropped; old 7,8,10 -> new 6,7,8)

Dry-run by default; --apply to write.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

FILE = "IPD-Meta-Pro/IPD_Meta_Pro_PLOS_ONE_Manuscript.md"
DROP_MARKERS = (
    "Fisher DJ, et al. Meta-analysis of individual participant data by treatment-covariate",
    "White IR, et al. Meta-analysis with individual participant data. Stata J. 2017",
)
INTEXT_FIXES = [("[5,6]", "[5]"), ("[7-10]", "[6-8]")]
REF_HEADER = "# REFERENCES"
REF_LINE = re.compile(r"^(\d+)\.\s")


def main() -> int:
    apply = "--apply" in sys.argv
    root = Path(__file__).resolve().parents[1]
    p = root / FILE
    lines = p.read_text(encoding="utf-8").split("\n")

    # locate references section
    try:
        h = next(i for i, l in enumerate(lines) if l.strip() == REF_HEADER)
    except StopIteration:
        print("ERROR: REFERENCES header not found")
        return 1

    dropped, renumbered = [], 0
    counter = 0
    out = lines[: h + 1]
    for l in lines[h + 1 :]:
        m = REF_LINE.match(l)
        if not m:
            out.append(l)
            continue
        if any(mk in l for mk in DROP_MARKERS):
            dropped.append(l.strip()[:80])
            continue
        counter += 1
        new = REF_LINE.sub(f"{counter}. ", l, count=1)
        if new != l:
            renumbered += 1
        out.append(new)

    # in-text marker fixes (body only, before the header)
    intext_log = []
    for i in range(h):
        for old, new in INTEXT_FIXES:
            if old in out[i]:
                out[i] = out[i].replace(old, new)
                intext_log.append(f"  L{i+1}: {old} -> {new}")

    mode = "APPLIED" if apply else "DRY-RUN"
    print(f"[{mode}] remove 2 refs + renumber in {FILE}")
    print(f"  dropped references: {len(dropped)}")
    for d in dropped:
        print(f"      - {d}")
    print(f"  reference entries after renumber: {counter}")
    print(f"  in-text marker fixes: {len(intext_log)}")
    for x in intext_log:
        print(x)
    if apply:
        p.write_text("\n".join(out), encoding="utf-8")
    else:
        print("\n(dry-run; re-run with --apply to write)")
    return 0 if len(dropped) == 2 else 1


if __name__ == "__main__":
    raise SystemExit(main())
