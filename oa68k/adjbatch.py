"""Emit BLIND re-identification batches for the label->ref precision gate.

WHY BLIND. The obvious adjudication -- "here is the label, here is the ref we
chose, is it right?" -- measures agreement with a suggestion, not precision. An
adjudicator shown a plausible answer confirms it. So the batches here never say
which ref the matcher picked: they give the label, the review's title, and the
review's FULL numbered ref-list, and ask the adjudicator to identify the row
independently. Precision is then agreement between two parties that could
genuinely disagree, and a disagreement is informative rather than embarrassing.

The adjudicator can also answer NONE (the study is not in this ref-list at all) --
that is the failure mode a distractor-only view cannot see, and the one that
produces a silent wrong join: the matcher latches onto the nearest same-surname
citation when the true trial was never cited in a resolvable form.

Run: python adjbatch.py --n 40 --batches 4 --out <dir>
"""
from __future__ import annotations

import argparse
import json
import os

import refjoin as RJ

HEADER = """You are adjudicating an IDENTITY question for a meta-analysis audit.

A forest plot in a systematic review names each row in the authors' own shorthand
("Chiu 2019", "Dreyfus et al"). The review's reference list cites the same studies
in full. Your job: for each CASE below, decide WHICH numbered reference in that
review's reference list the forest-plot row refers to.

Rules — read them, they decide the number this feeds:
* Answer with the reference NUMBER, or "NONE" if the study the row names is not
  present in the reference list at all, or "TIE" if two or more references fit
  equally well and nothing in the evidence separates them.
* NONE and TIE are FIRST-CLASS answers, not failures. A wrong identification is
  far more damaging than an abstention: it silently attaches one trial's data to
  another trial's row. If you are not confident, say TIE or NONE.
* A forest-plot row is a PRIMARY TRIAL REPORT. If the best surname/year match is
  a review, editorial, methods paper, or guideline, that is evidence it is NOT
  the right reference — consider NONE.
* Do not assume the row must be in the list. Some are genuinely absent.

Return STRICT JSON, one object per case, no prose:
[{"case": <int>, "answer": <int|"NONE"|"TIE">, "confidence": "high"|"medium"|"low",
  "why": "<= 15 words"}]
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=40)
    ap.add_argument("--batches", type=int, default=4)
    ap.add_argument("--out", required=True)
    ap.add_argument("--reflen", type=int, default=170)
    a = ap.parse_args()

    import random
    res = RJ.run_funnel(verbose=False, keep_all_matched=True)
    rows = res["matched_rows"]
    rng = random.Random(20260717)          # pinned: the sample must be re-quotable
    pick = rng.sample(rows, min(a.n, len(rows)))

    os.makedirs(a.out, exist_ok=True)
    truth = []
    cases = []
    for i, r in enumerate(pick, 1):
        refs = RJ.load_refs(r["pmcid"]) or []
        lines = [f"CASE {i}",
                 f"  Review: {RJ.jats_title(r['pmcid'])[:160]}",
                 f"  Forest-plot row label: {r['label']!r}",
                 f"  Reference list ({len(refs)} refs):"]
        for j, x in enumerate(refs, 1):
            lines.append(f"    [{j}] {x['text'][:a.reflen]}")
        cases.append("\n".join(lines))
        truth.append({"case": i, "pmcid": r["pmcid"], "label": r["label"],
                      "key": r["key"],
                      "matcher_answer": r["idx"] + 1,     # 1-based to match prompt
                      "matcher_pmid": r["pmid"],
                      "n_refs": len(refs)})

    per = -(-len(cases) // a.batches)
    for b in range(a.batches):
        chunk = cases[b * per:(b + 1) * per]
        if not chunk:
            continue
        p = os.path.join(a.out, f"batch{b + 1}.txt")
        with open(p, "w", encoding="utf-8") as fh:
            fh.write(HEADER + "\n" + ("\n\n" + "=" * 70 + "\n\n").join(chunk))
        print("wrote", p, f"({len(chunk)} cases)")

    tp = os.path.join(a.out, "truth.json")
    with open(tp, "w", encoding="utf-8") as fh:
        json.dump(truth, fh, indent=2, ensure_ascii=False)
    print("wrote", tp)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
