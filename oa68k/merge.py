"""Cross-shard MERGE + reconciliation guard.

Two nodes (pc1, laptop) write node-tagged ledgers. Sharding is disjoint by
sha256(pmcid) % N, so the union cannot double-count — this asserts that invariant
(0 pmcid processed by more than one node) and fails loud if violated, then prints the
merged coverage ledger. Run on pc1 after copying the laptop's ledgers into data/.

Run:  python merge.py
"""
from __future__ import annotations

import json
import os
from collections import defaultdict

import config as C
import ledger


def check_disjoint() -> dict:
    """Map pmcid -> set(nodes) from harvest ledgers; report any overlap."""
    owners = defaultdict(set)
    for path in C.node_ledgers("harvest"):
        node = os.path.basename(path).split(".")[1]  # harvest.<node>.jsonl
        with open(path, encoding="utf-8") as f:
            for ln in f:
                if not ln.strip():
                    continue
                pmcid = json.loads(ln).get("pmcid")
                if pmcid:
                    owners[pmcid].add(node)
    overlaps = {p: sorted(ns) for p, ns in owners.items() if len(ns) > 1}
    return {"nodes": sorted({n for ns in owners.values() for n in ns}),
            "distinct_metas": len(owners), "overlap_count": len(overlaps),
            "overlap_examples": dict(list(overlaps.items())[:5])}


def main() -> None:
    dj = check_disjoint()
    print("=== SHARD DISJOINTNESS ===")
    print(json.dumps(dj, indent=2))
    if dj["overlap_count"] > 0:
        raise SystemExit(
            f"[merge] FAIL-CLOSED: {dj['overlap_count']} metas processed by >1 node — "
            "sharding is not disjoint; do NOT trust merged counts until resolved.")
    print("\n=== MERGED COVERAGE LEDGER (all nodes) ===")
    print(json.dumps(ledger.report(), indent=2))


if __name__ == "__main__":
    main()
