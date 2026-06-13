"""
merge_results.py — Merge the new-method metrics (results_new.json) into the
incumbent results (results_full.json), producing results_merged.json with all
13 methods per cell. Asserts data parity (mean_sel_frac, n_degenerate) before
merging so a seed mismatch can never silently corrupt the leaderboard.
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
FULL = os.path.join(HERE, "results_full.json")
NEW = os.path.join(HERE, "results_new.json")
OUT = os.path.join(HERE, "results_merged.json")

full = json.load(open(FULL))
new = json.load(open(NEW))
fmap = {r["cell_id"]: r for r in full["results"]}
nmap = {r["cell_id"]: r for r in new["results"]}

missing = set(fmap) - set(nmap)
if missing:
    print(f"[merge] FATAL: {len(missing)} cells missing from results_new.json: "
          f"{sorted(missing)[:5]}...")
    sys.exit(1)

NEW_METHODS = ["NPE", "PVS", "PartialID", "Unified"]
bad_parity = []
for cid, f in fmap.items():
    n = nmap[cid]
    sf_f = f["mean_sel_frac"] if f["mean_sel_frac"] is not None else 0.0
    sf_n = n["mean_sel_frac"] if n["mean_sel_frac"] is not None else 0.0
    if abs(sf_f - sf_n) > 1e-9 or f["n_degenerate"] != n["n_degenerate"]:
        bad_parity.append((cid, sf_f, sf_n, f["n_degenerate"], n["n_degenerate"]))
    # graft new-method metrics into the incumbent cell
    for m in NEW_METHODS:
        f["methods"][m] = n["methods"][m]

if bad_parity:
    print(f"[merge] FATAL: data parity broken in {len(bad_parity)} cells "
          f"(seed streams diverged). Sample:")
    for row in bad_parity[:5]:
        print("   ", row)
    sys.exit(1)

full["meta"]["methods"] = list(full["meta"]["methods"]) + NEW_METHODS
full["meta"]["new_methods_reps"] = new["meta"]["reps"]
with open(OUT, "w") as f:
    json.dump(full, f, indent=1)
print(f"[merge] parity OK on all {len(fmap)} cells; "
      f"wrote {OUT} with methods={full['meta']['methods']}")
