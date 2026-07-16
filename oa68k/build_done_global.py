"""Build the cross-node DONE set — the thing that makes re-sharding safe.

## The problem re-sharding creates

Shard assignment is `sha256(pmcid) % N`. Change N (2 -> 3) and metas move between
nodes. A meta pc2 already harvested under %2 may belong to baseimage under %3.
Each node only skips what is in ITS OWN ledger, so after a re-shard baseimage would
re-fetch work pc2 already did — wasted bandwidth, and worse, the same pmcid would
then sit in TWO node ledgers, which is exactly what `merge.py`'s fail-loud overlap
guard is there to catch. The guard would (correctly) start screaming.

## The fix

The shard function governs only NEW work. "Done" is global: a snapshot union of
every node's ledger, distributed to every node, which each harvest skips in addition
to its own ledger. Completed rows are therefore carried forward across a re-shard —
never re-fetched, never duplicated, and each pmcid stays in exactly one ledger.

This is a snapshot, not live sync: nodes diverge again as they grind, but that is
safe because new work is disjoint by construction (%N). Rebuild + redistribute this
file whenever N changes.

Run:  python build_done_global.py        # writes data/done_global.txt
"""
from __future__ import annotations

import json
import os

import config as C


def collect() -> set[str]:
    done: set[str] = set()
    for path in C.node_ledgers("harvest"):
        with open(path, encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                try:
                    p = json.loads(line).get("pmcid")
                except Exception:
                    continue
                if p:
                    done.add(p)
    return done


def write(done: set[str]) -> str:
    path = os.path.join(C.DATA, "done_global.txt")
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        for p in sorted(done):
            f.write(p + "\n")
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)
    return path


if __name__ == "__main__":
    d = collect()
    p = write(d)
    print(f"[done_global] {len(d):,} pmcids -> {p}")
    print("  distribute this file to every node's data/ before re-sharding, "
          "so completed work is never re-fetched")
