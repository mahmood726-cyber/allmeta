"""ONE-OFF REPAIR — rebuild `confidence_emitted` across ALL rows.

WHAT WAS WRONG. `_confidences()` counted only `row_type=="study"`. A reader that
abstained on 93 rows of a 545x268 figure — all typed `subtotal`, because they
were pooled per-assay estimates — emitted a gradient containing ZERO abstentions.
The shard-level rate read 2.5% when the true all-row rate was 8.7%.

A reject-option metric that cannot see the rows most likely to be rejected will
always report the number you were hoping for. That is not a rounding problem, it
is the measurement pointing away from its own subject.

WHY THIS IS SAFE TO REWRITE. `confidence_emitted` is a DERIVED INDEX over
`parsed` — the store computes it at write time purely for queryability. It is not
an observation. Recomputing it from the untouched `parsed` changes no evidence:
raw_response, parsed, sha, blob, timestamps are all read-only here. Contrast with
a re-read, which would buy a different answer and destroy comparability.

Idempotent. Keeps a pre-repair copy. Run: python repair_gradient.py
"""
from __future__ import annotations

import json
import os
import shutil

import shardwrite as S

SHARD = S.SHARD


def main() -> int:
    if not os.path.exists(SHARD):
        print("no shard")
        return 0
    bak = SHARD + ".pre-gradient-repair.bak"
    if not os.path.exists(bak):
        shutil.copy2(SHARD, bak)
    recs = [json.loads(l) for l in open(SHARD, encoding="utf-8") if l.strip()]
    changed = 0
    for r in recs:
        new = S._confidences(r.get("parsed"))
        if new != r.get("confidence_emitted"):
            r["confidence_emitted"] = new
            changed += 1
    tmp = SHARD + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        for r in recs:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    os.replace(tmp, SHARD)
    print("records:", len(recs), "| confidence_emitted rebuilt:", changed)
    print("pre-repair copy:", bak)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
