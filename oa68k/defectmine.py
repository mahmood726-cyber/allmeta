"""DEFECT MINE — surface published-figure defects the vision readers flagged.

THE POINT OF THE WHOLE RUN, RECOVERED FROM THE RAW. A forest plot is a record of
what the authors DID. You cannot hide an inclusion: every included trial is
named, dated, weighted and printed. So the plot is checkable evidence of conduct
— and when a figure contradicts ITSELF (a column headed OR under a plot headed
Risk Ratio; a Total that does not equal its rows; an axis that cannot carry the
values plotted on it), that is an error IN THE PUBLISHED PAPER, found by reading.

WHY THIS IS A GREP AND NOT A MODEL. Every defect below was already observed and
written down, verbatim, by the reader that saw the pixels. Re-asking a model to
"find defects" would be a NEW, non-reproducible call with a different answer, and
it would launder an observation into an opinion. This script only INDEXES what
was already banked. It adds no judgement of its own; the quote is the evidence
and the record id points back to the raw.

CANDIDATES, NOT CONFIRMED DEFECTS. A hit here is "a reader flagged something",
not "the paper is wrong". Each needs a human look before it is ever called a
finding. Two independent readers flagging the SAME figure (see `--dupes`) is much
stronger — that is the closest thing to confirmation this run can produce.

Usage: python defectmine.py
"""
from __future__ import annotations

import json
import os
import re
from collections import defaultdict

SHARD = os.path.join("data", "visionstore", "calls.shard-B.jsonl")

# Phrases that mark a reader saying "the FIGURE is wrong", not "I could not read
# it". Illegibility is a property of our scan; these are properties of the paper.
PATTERNS = [
    ("internal contradiction",
     r"contradict\w*|conflict\w*|inconsisten\w*|does ?n[o']t reconcile|"
     r"doesn't reconcile|irreconcilable|disagree\w* with the printed"),
    ("checksum mismatch",
     r"(total|sum)\w*[^.]{0,60}(does not|doesn'?t|fails? to)\s*(match|reconcile|equal)|"
     r"shortfall|not reconcile|don'?t reconcile"),
    ("impossible / implausible value",
     r"implausible|impossible|cannot be|not estimable but|"
     r"CI that does ?n[o']t bracket|does not bracket"),
    ("labelling defect",
     r"labelling defect|labeling defect|mislabel\w*|apparent .{0,20}defect|"
     r"typo|misprint"),
    ("unit-of-analysis",
     r"double[- ]count\w*|triple[- ]count\w*|multiple timepoints|"
     r"same (trial|study) entered|as independent units"),
]


def main() -> int:
    recs = [json.loads(l) for l in open(SHARD, encoding="utf-8") if l.strip()]
    # One row per bought call: both role records carry the same parsed doc, so
    # iterating records would report every defect twice.
    seen, hits = set(), defaultdict(list)
    for r in recs:
        g = r.get("call_group") or r["image_sha256"]
        if g in seen:
            continue
        seen.add(g)
        doc = r.get("parsed") or {}
        blobs = [("reading_notes", doc.get("reading_notes") or "")]
        for row in doc.get("rows") or []:
            if isinstance(row, dict) and row.get("notes"):
                blobs.append(("row:%s" % (row.get("label") or "?"), row["notes"]))
        for where, text in blobs:
            for kind, pat in PATTERNS:
                m = re.search(pat, text, re.I)
                if not m:
                    continue
                s = max(0, m.start() - 110)
                hits[kind].append({
                    "src": r.get("source_id"),
                    "where": where,
                    "quote": re.sub(r"\s+", " ", text[s:m.end() + 150]).strip(),
                })
                break

    total = sum(len(v) for v in hits.values())
    print("=== PUBLISHED-FIGURE DEFECT CANDIDATES ===")
    print("figures scanned (calls): %d | flags: %d\n" % (len(seen), total))
    for kind, items in sorted(hits.items(), key=lambda kv: -len(kv[1])):
        print("--- %s  (%d) ---" % (kind.upper(), len(items)))
        for h in items[:8]:
            print("  %s [%s]" % (h["src"], h["where"]))
            print("     “%s”" % h["quote"][:260])
        if len(items) > 8:
            print("  ... %d more" % (len(items) - 8))
        print()
    print("CANDIDATES, NOT CONFIRMED. Each is one reader's flag, quoted verbatim "
          "from the banked raw. A human must look before any of it is called a "
          "finding. Two INDEPENDENT readers flagging the same figure is the "
          "strongest signal this run can emit.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
