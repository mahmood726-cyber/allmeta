"""Score the blind adjudication against the matcher -> MEASURED PRECISION.

precision = P(matcher's ref == adjudicator's ref | matcher matched)

The denominator is deliberate. It is every case the matcher MATCHED, including
the ones the adjudicator answered NONE or TIE. Dropping those would be scoring
the join on the cases it found easy: a NONE means the adjudicator believes the
study is not in the ref-list at all, which -- if right -- is precisely a WRONG
join, the failure mode that silently attaches one trial's data to another's row.
Excluding it would inflate precision by hiding the errors we came to count.

Run: python adjscore.py --truth <truth.json> --verdicts <verdicts.json>
"""
from __future__ import annotations

import argparse
import json

from refjoin import wilson


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--truth", required=True)
    ap.add_argument("--verdicts", required=True)
    ap.add_argument("--recheck", action="store_true",
                    help="recompute the matcher's answer LIVE for the same cases "
                         "instead of using the stored one")
    a = ap.parse_args()

    truth = {t["case"]: t for t in json.load(open(a.truth, encoding="utf-8"))}
    verd = {v["case"]: v for v in json.load(open(a.verdicts, encoding="utf-8"))}

    if a.recheck:
        # Re-score the SAME blind verdicts against the CURRENT matcher.
        #
        # This is legitimate precisely because the adjudicators never saw the
        # matcher's answer: their verdicts are a fixed, independent reference, so
        # re-scoring against a changed matcher measures the change rather than
        # re-fitting to it. Re-drawing a fresh sample after a fix would instead
        # measure a different population and invite shopping for a better number.
        import refjoin as RJ
        for c, t in truth.items():
            refs = RJ.load_refs(t["pmcid"]) or []
            r = RJ.resolve(t["label"], refs)
            t["key"] = r.get("key", t["key"])
            t["matcher_answer"] = (r["idx"] + 1) if r["status"] == "matched" else None
            t["matcher_status"] = r["status"]

    agree = disagree = abstain = rejected = 0
    rows = []
    by_key = {}
    for c, t in sorted(truth.items()):
        v = verd.get(c)
        if v is None:
            continue
        ans = v["answer"]
        k = t["key"]
        if t.get("matcher_answer") is None:
            # The matcher now REJECTS this row (ambiguous/unmatched). It is not a
            # match, so it cannot be a wrong match: it leaves the precision
            # numerator AND denominator. Counted separately so the reject option's
            # cost stays visible instead of quietly flattering precision.
            rejected += 1
            rows.append((c, k, t["label"], "REJECTED", ans,
                         "MATCHER-REJECT", v["confidence"], v["why"]))
            continue
        by_key.setdefault(k, [0, 0])
        if isinstance(ans, int):
            ok = (ans == t["matcher_answer"])
            if ok:
                agree += 1
                by_key[k][0] += 1
            else:
                disagree += 1
            by_key[k][1] += 1
            rows.append((c, k, t["label"], t["matcher_answer"], ans,
                         "AGREE" if ok else "DISAGREE", v["confidence"], v["why"]))
        else:
            abstain += 1
            by_key[k][1] += 1
            rows.append((c, k, t["label"], t["matcher_answer"], ans,
                         "ABSTAIN", v["confidence"], v["why"]))

    n = agree + disagree + abstain
    print("=== MEASURED PRECISION — blind re-identification ===")
    print(f"cases adjudicated : {n + rejected}")
    if rejected:
        print(f"  matcher now REJECTS (not a match; excluded from precision): {rejected}")
    print(f"precision denominator (matcher MATCHED): {n}")
    p, lo, hi = wilson(agree, n)
    print(f"  matcher == adjudicator : {agree}/{n}  {p:.1%}  [{lo:.1%},{hi:.1%}]")
    p2, lo2, hi2 = wilson(disagree, n)
    print(f"  DISAGREE (wrong join)  : {disagree}/{n}  {p2:.1%}  [{lo2:.1%},{hi2:.1%}]")
    p3, lo3, hi3 = wilson(abstain, n)
    print(f"  adjudicator NONE/TIE   : {abstain}/{n}  {p3:.1%}  [{lo3:.1%},{hi3:.1%}]")
    print("\n  by key:")
    for k, (ok, tot) in sorted(by_key.items()):
        pp, ll, hh = wilson(ok, tot)
        print(f"    {k:<14} {ok:>3}/{tot:<3} {pp:6.1%}  [{ll:5.1%},{hh:5.1%}]")

    print("\n  non-agreeing cases:")
    any_bad = False
    for r in rows:
        if r[5] != "AGREE":
            any_bad = True
            print(f"    case {r[0]:>2} [{r[1]}] {r[2]!r} matcher={r[3]} adj={r[4]} "
                  f"({r[6]}) {r[7]}")
    if not any_bad:
        print("    none")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
