"""Re-shard safety: completed work must survive a change of N.

The failure this guards against is concrete: moving %2 -> %3 reassigns metas
between nodes, so without a cross-node DONE set a node re-fetches another node's
completed work and the same pmcid lands in two ledgers — which is precisely what
merge.py's overlap guard exists to catch.
"""
import hashlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config as C


def test_three_way_partition_is_disjoint_and_total():
    ids = [f"PMC{i}" for i in range(3000)]
    shards = [[p for p in ids if C.in_shard(p, s, 3)] for s in range(3)]
    assert sum(len(s) for s in shards) == len(ids)          # nothing lost
    assert set(shards[0]).isdisjoint(shards[1])
    assert set(shards[0]).isdisjoint(shards[2])
    assert set(shards[1]).isdisjoint(shards[2])
    for s in shards:
        assert 800 < len(s) < 1200, "3-way split should be roughly balanced"


def test_every_meta_lands_in_exactly_one_shard():
    for i in range(500):
        p = f"PMC{i}"
        assert sum(C.in_shard(p, s, 3) for s in range(3)) == 1


def test_reshard_moves_metas_between_nodes():
    """The premise of the whole done_global mechanism — prove reassignment is real."""
    moved = 0
    for i in range(1000):
        p = f"PMC{i}"
        old = 0 if C.in_shard(p, 0, 2) else 1
        new = next(s for s in range(3) if C.in_shard(p, s, 3))
        if old != new:
            moved += 1
    assert moved > 100, ("if %2->%3 moved nothing, done_global would be pointless; "
                         "it must move a substantial fraction")


def test_assignment_is_stable_across_calls():
    for i in range(50):
        p = f"PMC{i}"
        assert [C.in_shard(p, s, 3) for s in range(3)] == \
               [C.in_shard(p, s, 3) for s in range(3)]


def test_shard_uses_sha256_of_pmcid():
    """Pin the hash so nodes running different builds agree on the partition."""
    p = "PMC12345678"
    expect = int(hashlib.sha256(p.encode()).hexdigest(), 16) % 3
    assert C.in_shard(p, expect, 3)
    for s in range(3):
        if s != expect:
            assert not C.in_shard(p, s, 3)
