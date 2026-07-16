"""Stamp the v1 (native-resolution) cohort with its quarantine status.

WHY THE FLAG GOES IN THE STORE AND NOT ONLY IN A MARKDOWN FILE. The merge will be
done by a script or by someone who never read our checkpoint. A caveat that lives
in prose beside the data is a caveat that will be lost the first time the data is
copied. If a record is not safe to pool, the record must say so.

WHAT v1 IS. Figures read at NATIVE resolution on a corpus that is 92.6% sub-800px.
Demonstrated failure modes, all at self-reported "high" confidence:
  * a mean of 12 transcribed as 7.7 (that is the SD)   [PMC12560356]
  * a dropped minus sign on a CI bound — reverses the effect  [PMC12619315]
  * ⚠ a COMPLETE FABRICATED FIGURE: a 34-study proportion meta-analysis with
    pooled 0.529 [0.442; 0.616], I²=99.6%, τ²=0.0688, read off an image that
    actually holds a 37-study OR forest. Same bytes, md5-verified. Internally
    self-consistent, so no checksum or downstream validator could ever flag it.
    Only more pixels caught it.                          [PMC12709776 Fig5]

That last one is why this is `quarantined` and not `provisional`. We cannot tell
WHICH v1 figures are affected without re-reading them, and confabulation does not
announce itself in the gradient — the reader was confident and coherent.

NOT A DELETION. The v1 records stay: they are real observations, they are the
control arm of the native-vs-zoomed comparison, and deleting evidence because it
is inconvenient is the disease. They are marked so nobody pools them by accident.

Idempotent; keeps a pre-repair copy. Run: python quarantine_v1.py
"""
from __future__ import annotations

import json
import os
import shutil
from datetime import datetime, timezone

import shardwrite as S

NOTE = ("v1 = NATIVE-RESOLUTION read on a corpus that is 92.6% sub-800px. "
        "DO NOT POOL WITH v2 AND DO NOT USE AS AN ANSWER KEY WITHOUT A v2 "
        "RE-READ. Demonstrated v1 failures, all at self-reported high "
        "confidence: mean 12 read as the SD 7.7; a dropped minus sign on a CI "
        "bound; and a COMPLETE CONFABULATED FIGURE (a 34-study proportion "
        "meta-analysis, pooled 0.529 [0.442;0.616], I2=99.6%, tau2=0.0688, read "
        "off an image that holds a 37-study OR forest — same bytes, md5 "
        "verified). The fabrication was internally self-consistent, so no "
        "checksum or downstream validator could detect it; only higher "
        "effective resolution did. Retained deliberately: real observations and "
        "the control arm of the native-vs-zoomed comparison.")


def main() -> int:
    if not os.path.exists(S.SHARD):
        print("no shard")
        return 0
    bak = S.SHARD + ".pre-quarantine.bak"
    if not os.path.exists(bak):
        shutil.copy2(S.SHARD, bak)
    recs = [json.loads(l) for l in open(S.SHARD, encoding="utf-8") if l.strip()]
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    n = 0
    for r in recs:
        is_v1 = "v2" not in (r.get("prompt_version") or "")
        want = "quarantined_native_resolution" if is_v1 else "ok_zoomed"
        if r.get("cohort_status") != want:
            r["cohort_status"] = want
            if is_v1:
                r["cohort_warning"] = NOTE
                r["quarantined_ts"] = now
            else:
                r.pop("cohort_warning", None)
            n += 1
    tmp = S.SHARD + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        for r in recs:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    os.replace(tmp, S.SHARD)
    from collections import Counter
    print("records:", len(recs), "| stamped:", n)
    print("cohort_status:", dict(Counter(r.get("cohort_status") for r in recs)))
    print("pre-repair copy:", bak)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
