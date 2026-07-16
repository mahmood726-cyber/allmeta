"""Reconcile node ledgers to the CURRENT partition after a re-shard.

## What went wrong (recorded so it is not repeated)

`done_global` is a SNAPSHOT. It was built while nodes were still grinding under the
old %2 partition, and those nodes kept harvesting for several minutes before being
relaunched under %3. Metas harvested in that window were absent from the snapshot,
so under %3 their new owner re-fetched them — putting the same pmcid in two node
ledgers and (correctly) tripping merge.py's fail-loud overlap guard: 574 overlaps.

No data was corrupted: the duplicate rows are the same meta fetched twice, and every
reader dedups by pmcid. The cost was ~574 wasted fetches.

## The correct re-shard sequence (do this next time)

  1. STOP every node.
  2. Pull all ledgers.
  3. Build done_global.
  4. Distribute it.
  5. Relaunch under the new N.

Building the snapshot while nodes still run guarantees a gap.

## What this script does

For each pmcid present in more than one node's ledger, keep the row belonging to the
node that OWNS it under the current partition and drop the others, restoring the
"exactly one node per meta" invariant so the guard is meaningful again. Rows are
never deleted from the cache — only the redundant ledger entries go.

Run:  python reconcile.py --shard-count 3 [--apply]
"""
from __future__ import annotations

import argparse
import json
import os
from collections import defaultdict

import config as C

# ledger tag -> shard id under the current partition
NODE_SHARD = {"pc1": 0, "laptop": 1, "baseimage": 2}


def _node_of(path: str) -> str:
    return os.path.basename(path).split(".")[1]


def analyse(shard_count: int) -> dict:
    owners = defaultdict(set)
    for path in C.node_ledgers("harvest"):
        node = _node_of(path)
        with open(path, encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                p = json.loads(line).get("pmcid")
                if p:
                    owners[p].add(node)
    dupes = {p: ns for p, ns in owners.items() if len(ns) > 1}
    return {"distinct": len(owners), "overlaps": len(dupes), "dupes": dupes}


def canonical(pmcid: str, shard_count: int) -> str | None:
    """The node that owns this meta under the current partition."""
    for node, sid in NODE_SHARD.items():
        if C.in_shard(pmcid, sid, shard_count):
            return node
    return None


def apply(shard_count: int, dupes: dict) -> dict:
    removed = defaultdict(int)
    for path in C.node_ledgers("harvest"):
        node = _node_of(path)
        keep, drop = [], 0
        with open(path, encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                p = json.loads(line).get("pmcid")
                if p in dupes and canonical(p, shard_count) != node:
                    drop += 1
                    continue
                keep.append(line)
        if drop:
            tmp = path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                f.writelines(keep)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, path)
            removed[node] = drop
    return dict(removed)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--shard-count", type=int, default=3)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    r = analyse(a.shard_count)
    print(f"[reconcile] distinct={r['distinct']:,} overlaps={r['overlaps']:,}")
    if not r["overlaps"]:
        print("[reconcile] invariant already holds — nothing to do")
        raise SystemExit(0)
    if not a.apply:
        print("[reconcile] dry-run; pass --apply to drop non-canonical rows")
        raise SystemExit(0)
    removed = apply(a.shard_count, r["dupes"])
    print(f"[reconcile] removed non-canonical rows: {removed}")
    after = analyse(a.shard_count)
    print(f"[reconcile] overlaps after: {after['overlaps']}")
    raise SystemExit(0 if after["overlaps"] == 0 else 1)
