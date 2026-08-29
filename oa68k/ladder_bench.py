"""THE HFrEF BENCHMARK -- a known answer established OUTSIDE our own code.

WHY THIS SET. Mahmood: "I have done this with HFrEF where I managed to get the data
for every RCT from open sources." That claim is written down, per trial, with the
LAYER that supplied each value, in `C:\\Projects\\HFrEF-RUNIN-NMA.md` (2026-07-16,
section 1.4 V1, table 'trial | L1 registry | L2 abstract | used'). Eight trials, all
eight obtained, by hand, from open sources.

So the benchmark asks exactly one question:

    OF THE 8 DATA A HUMAN OBTAINED BY HAND FROM OPEN SOURCES, HOW MANY DOES THE
    LADDER OBTAIN UNAIDED, AND FROM WHICH RUNG?

WHAT THE LADDER IS GIVEN, and why -- this decides whether the benchmark means
anything:
  GIVEN     trial name, its aliases, the drug, and the NCT id WHERE ONE EXISTS.
            Per the standing rule "the search defines the set; open sources supply
            the values", the included set is an input. A trial arrives from the
            search already carrying its registry identifier.
  WITHHELD  the PMID, the DOI, the journal, the year, and of course the answer.
            Finding the trial's own report is part of the retrieval job, and handing
            over a PMID would be scoring the ladder on a step it did not take.

THREE BENCHMARK OUTCOMES, never two:
  MATCHED     obtained, same measure, estimate within tolerance of the hand value.
  MISMATCHED  obtained a value that is NOT the hand value. This is its own count.
              Folding a mismatch into "found" would be the exact defect this project
              keeps meeting: a retrieval standing in for an evidence claim.
  NOT_FOUND   the ladder did not obtain it. A statement about the ladder.

Run:  python ladder_bench.py [--out out/hfref_bench.json] [--all-rungs]
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from dataclasses import asdict

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import ladder as L
import ladder_store

GROUND_TRUTH_SOURCE = {
    "file": r"C:\Projects\HFrEF-RUNIN-NMA.md",
    "dated": "2026-07-16",
    "section": "1.4 V1 -- table 'trial | L1 registry | L2 abstract | used'",
    "established_by": "hand retrieval by Mahmood, outside this codebase",
    "field": "all-cause mortality, trial-level treatment effect vs control",
}

# trial, aliases, nct (blank where the trial predates the registry), drug,
# hand-obtained measure/estimate/CI, and the LAYER the human used.
HFREF = [
    dict(trial="PARADIGM-HF", aliases=["PARADIGM HF"], nct="NCT01035255",
         drug="sacubitril", measure="HR", est=0.84, lo=0.76, hi=0.93,
         human_layer="L2 abstract", human_note="registry had counts but no HR"),
    dict(trial="SOLVD", aliases=["Studies of Left Ventricular Dysfunction", "SOLVD-T",
                                 "SOLVD Treatment"], nct="",
         drug="enalapril", measure="RR", est=0.84, lo=0.74, hi=0.95,
         human_layer="L2 abstract", human_note="1991, no registry record; RRR 16% (5-26)"),
    dict(trial="DAPA-HF", aliases=["DAPA HF"], nct="NCT03036124",
         drug="dapagliflozin", measure="HR", est=0.83, lo=0.71, hi=0.97,
         human_layer="L1 registry", human_note=""),
    dict(trial="EMPEROR-Reduced", aliases=["EMPEROR Reduced"], nct="NCT03057977",
         drug="empagliflozin", measure="HR", est=0.92, lo=0.77, hi=1.10,
         human_layer="L1 registry", human_note=""),
    dict(trial="EMPHASIS-HF", aliases=["EMPHASIS HF"], nct="NCT00232180",
         drug="eplerenone", measure="HR", est=0.761, lo=0.622, hi=0.932,
         human_layer="L1 registry", human_note=""),
    dict(trial="RALES", aliases=["Randomized Aldactone Evaluation Study"], nct="",
         drug="spironolactone", measure="RR", est=0.70, lo=0.60, hi=0.82,
         human_layer="L2 abstract", human_note="1999, no registry record"),
    dict(trial="MERIT-HF", aliases=["MERIT HF", "Metoprolol CR/XL Randomised Intervention Trial"],
         nct="", drug="metoprolol", measure="RR", est=0.66, lo=0.53, hi=0.81,
         human_layer="L2 abstract", human_note="1999, no registry record"),
    dict(trial="CIBIS-II", aliases=["CIBIS II", "Cardiac Insufficiency Bisoprolol Study"],
         nct="", drug="bisoprolol", measure="HR", est=0.66, lo=0.54, hi=0.81,
         human_layer="L2 abstract", human_note="1999, no registry record"),
]

# Ratio measures are compared on the LOG scale, because that is the scale they pool
# on and a fixed absolute tolerance would be tighter at 0.66 than at 0.92.
LOG_TOL = 0.03          # about 3% on the ratio
# HR and RR answer different clinical questions (Cochrane 10.4). We do NOT treat a
# measure swap as a match; we count it, separately and by name. The comparison runs
# on L.canon_measure() -- CT.gov writes 'Hazard Ratio (HR)', and comparing that raw
# string to "HR" scored DAPA-HF's exact hit (0.83 vs 0.83) as a MISMATCH.


def score(truth: dict, rec) -> dict:
    st = rec["state"] if isinstance(rec, dict) else rec.state
    val = rec["value"] if isinstance(rec, dict) else rec.value
    if st != L.State.OBTAINED.value or not val:
        return {"verdict": "NOT_FOUND", "why": "ladder state " + st}
    got = val.get("estimate")
    gm = L.canon_measure(val.get("measure")) or L.canon_measure(val.get("measure_raw"))
    want = L.canon_measure(truth["measure"]) or truth["measure"]
    if got in (None, 0):
        return {"verdict": "NOT_FOUND", "why": "obtained with no estimate"}
    d = abs(math.log(got) - math.log(truth["est"])) if got > 0 else 99
    if d <= LOG_TOL and gm == want:
        return {"verdict": "MATCHED", "log_diff": round(d, 4), "got": got, "measure": gm}
    if d <= LOG_TOL and gm != want:
        return {"verdict": "MISMATCHED", "why": "measure differs: got " + str(gm)
                + ", hand value is " + truth["measure"] + " (HR and RR answer "
                "different questions -- not a match)", "log_diff": round(d, 4), "got": got}
    return {"verdict": "MISMATCHED", "why": "estimate differs beyond tolerance",
            "log_diff": round(d, 4), "got": got, "measure": gm,
            "hand_value": truth["est"]}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(L.OUT_DIR, "hfref_bench.json"))
    ap.add_argument("--all-rungs", action="store_true",
                    help="run EVERY rung on EVERY datum -- measures each rung's "
                         "standalone yield instead of the first-hit cascade")
    ap.add_argument("--only", default="", help="comma-separated rung numbers")
    a = ap.parse_args(argv)
    only = [int(x) for x in a.only.split(",") if x.strip()] if a.only else None

    import requests
    s = requests.Session()
    rx = L.extractor()
    print("extractor: " + (("rct-extractor-v2 v" + rx.__version__) if rx else
                           "ABSENT -- " + str(L._EXTRACTOR_INFO.get("why"))))
    if rx is None:
        print("REFUSING to run: without the extractor every rung would report "
              "RETRIEVED_NO_VALUE and the benchmark would measure nothing.")
        return 2

    # THROUGH THE WRITE PATH, not beside it. Every record goes through
    # ladder_store.emit() -- strict=False so a refusal is WRITTEN to the ledger as
    # its own kind rather than vanishing from the denominator. A gate nobody calls
    # is not a gate.
    ledger = os.path.join(os.path.dirname(a.out) or ".", "trial_values.jsonl")
    if os.path.exists(ledger):
        os.remove(ledger)

    recs, rows = [], []
    for t in HFREF:
        req = L.Request(trial=t["trial"], field_path="effect.all_cause_mortality",
                        nct=t["nct"], drug=t["drug"], aliases=t["aliases"],
                        measure_hint="")
        print("\n=== " + t["trial"] + " ===")
        rec = L.climb(req, session=s, stop_at_first_hit=not a.all_rungs, only=only)
        d = asdict(rec)
        sc = score(t, d)
        written = ladder_store.emit({k: v for k, v in d.items()}, ledger, strict=False)
        d["benchmark"] = {"truth": t, "score": sc,
                          "write_path": written.get("state"),
                          "refusal_reasons": written.get("refusal_reasons", [])}
        recs.append(d)
        rows.append({"trial": t["trial"], "human_layer": t["human_layer"],
                     "verdict": sc["verdict"], "rung": d.get("supplying_rung_name") or "-",
                     "tier": d.get("provenance_tier") or "-",
                     "got": sc.get("got"), "hand": t["est"], "measure": t["measure"],
                     "seconds": round(d["total_seconds"], 1),
                     "kb": int(d["total_bytes"] / 1024)})
        for at in d["attempts"]:
            print("   R" + str(at["rung"]) + " " + at["outcome"].ljust(19)
                  + ("%6.1fs " % at["seconds"]) + at["note"][:150])
        print("   -> " + sc["verdict"] + " via " + (d.get("supplying_rung_name") or "-")
              + " (" + (d.get("provenance_tier") or "-") + ")")

    rep = L.yield_report(recs)
    matched = sum(1 for r in rows if r["verdict"] == "MATCHED")
    mism = sum(1 for r in rows if r["verdict"] == "MISMATCHED")
    nf = sum(1 for r in rows if r["verdict"] == "NOT_FOUND")

    print("\n" + "=" * 78)
    print("HFrEF BENCHMARK -- ground truth: " + GROUND_TRUTH_SOURCE["file"]
          + " (" + GROUND_TRUTH_SOURCE["dated"] + ")")
    print("=" * 78)
    print("  trial            human   ladder-verdict   rung             tier               got   hand")
    for r in rows:
        print("  " + r["trial"].ljust(17) + r["human_layer"].split()[0].ljust(8)
              + r["verdict"].ljust(17) + r["rung"].ljust(17)
              + (r["tier"] or "-").ljust(19)
              + str(r["got"]).ljust(6) + str(r["hand"]))
    n = len(rows)
    print("\n  MATCHED    " + str(matched) + "/" + str(n)
          + "   of the 8 data a human obtained by hand from open sources")
    print("  MISMATCHED " + str(mism) + "/" + str(n) + "   obtained a value, but not the hand value")
    print("  NOT_FOUND  " + str(nf) + "/" + str(n) + "   the ladder did not obtain it -- "
          "a statement about THE LADDER, not about the evidence")
    L.print_yield(rep)

    lr = ladder_store.report(ledger)
    print("\nWRITE PATH (ladder_store.emit) -- kinds enumerated before the count:")
    print("  kinds: " + ", ".join(lr["kinds_enumerated_first"]))
    for k, v in sorted(lr["counts"].items()):
        print("  " + k.ljust(26) + str(v) + "/" + str(lr["rows"]))
    print("  ledger " + ledger)

    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump({"ground_truth_source": GROUND_TRUTH_SOURCE,
                   "extractor": L._EXTRACTOR_INFO,
                   "mode": "all_rungs" if a.all_rungs else "first_hit_cascade",
                   "summary": {"matched": matched, "mismatched": mism, "not_found": nf,
                               "n": n},
                   "rows": rows, "yield": rep, "records": recs}, f, indent=1)
    print("\nwrote " + a.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
