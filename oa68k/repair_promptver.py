"""ONE-OFF REPAIR — un-lie the prompt_version on shard B.

WHAT HAPPENED. ingest_raw.py computed the right spec version into `pv` and then
stamped `PROMPT_VERSION` anyway (the v2 constant). `pv` was dead code. Result:
76 records from figures read at NATIVE resolution were labelled with the v2
"+mandatory_zoom" spec they were never read under. The comment three lines above
the bug specifically warned against exactly this. Writing a rule down does not
execute it.

WHY REPAIR AND NOT APPEND. The store is append-only EVIDENCE, and normally a
correction is a new record, not an edit. This is different in kind: no observation
is being changed. `raw_response`, `parsed`, the sha, the blob, the timestamps —
every byte the vision call produced — are untouched. What changes is a
PROVENANCE LABEL that this script wrote incorrectly minutes ago and that no
model ever emitted. Leaving it would silently merge native reads into the zoomed
cohort and destroy the one comparison that makes the zoom finding measurable.

THE CORRECTION IS DERIVED FROM EVIDENCE, NOT ASSUMED. A record is v2 iff its
parsed doc carries `read_method` — a field that exists only in the v2 spec, so
the reading testifies to its own method. No read_method => v1. Nothing is guessed.

Every repaired record gets a `repairs` entry saying what changed, when, and why,
so the edit is itself auditable. Run once; idempotent.
"""
from __future__ import annotations

import json
import os
import shutil
from datetime import datetime, timezone

SHARD = os.path.join("data", "visionstore", "calls.shard-B.jsonl")
V2 = ("shardB/forest_full_capture@2026-07-16-v2"
      "+abstain+per_field_conf+mandatory_zoom+no_checksum_backsolve")
V1 = "shardB/forest_full_capture@2026-07-16+abstain+per_field_conf"


def main() -> int:
    if not os.path.exists(SHARD):
        print("no shard")
        return 0
    bak = SHARD + ".pre-promptver-repair.bak"
    if not os.path.exists(bak):
        shutil.copy2(SHARD, bak)          # keep the wrong file; prove the repair
    recs = [json.loads(l) for l in open(SHARD, encoding="utf-8") if l.strip()]
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    fixed = 0
    for r in recs:
        parsed = r.get("parsed") or {}
        truth = V2 if parsed.get("read_method") else V1
        if r.get("prompt_version") != truth:
            r.setdefault("repairs", []).append({
                "ts": now,
                "field": "prompt_version",
                "from": r.get("prompt_version"),
                "to": truth,
                "why": "ingest_raw.py stamped the v2 constant unconditionally "
                       "(computed `pv` was dead code). Corrected from evidence: "
                       "parsed.read_method is absent => the figure was read at "
                       "NATIVE resolution under the v1 spec. No observation "
                       "altered; raw_response/parsed/sha/blob untouched.",
            })
            r["prompt_version"] = truth
            fixed += 1
    tmp = SHARD + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        for r in recs:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    os.replace(tmp, SHARD)
    print("records:", len(recs), "| prompt_version corrected:", fixed)
    print("pre-repair copy kept at:", bak)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
