"""Unit tests for oa68k — offline, deterministic (no network, no AACT needed).

Covers the two things most likely to silently corrupt the ledger: the error-pattern
detector's classification (E1/E5/allow-list/zero-denominator) and the resume
key-loading. Run: python -m pytest tests/ -q
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import parse_detect as pd
from net import load_done_keys, append_jsonl


def test_e1_events_eq_n_flagged():
    xml = b"<p>pain crises 152/152 in the treatment arm</p>"
    r = pd.analyse(xml)
    assert r["n_e1"] == 1, r
    assert r["e1_candidates"][0]["kind"] == "E1_events_eq_N"


def test_seroconversion_100pct_allowed():
    xml = b"<p>seroconversion was 60/60 at week 4</p>"
    r = pd.analyse(xml)
    assert r["n_e1"] == 0, "100% seroconversion must NOT flag as E1"


def test_e5_impossible_cell():
    xml = b"<p>events 101/100 observed</p>"
    r = pd.analyse(xml)
    assert r["n_e5"] == 1, r


def test_zero_denominator_not_counted():
    xml = b"<p>ratio 5/0 nonsense</p>"
    r = pd.analyse(xml)
    assert r["n_fraction_cells"] == 0
    assert r["n_e1"] == 0 and r["n_e5"] == 0


def test_small_n_100pct_not_flagged():
    # N < 20 is below the E1 threshold (avoids noise on tiny arms)
    xml = b"<p>cure 5/5</p>"
    assert pd.analyse(xml)["n_e1"] == 0


def test_nct_extraction_and_mirror_usability():
    xml = b"<table-wrap><td>NCT01234567</td><td>NCT01234567</td><td>NCT07654321</td></table-wrap>"
    r = pd.analyse(xml)
    assert r["ncts"] == ["NCT01234567", "NCT07654321"]
    assert r["usable_for_mirror"] is True  # has table AND >=1 NCT


def test_no_table_not_mirror_usable():
    xml = b"<p>NCT01234567 mentioned in prose only</p>"
    r = pd.analyse(xml)
    assert r["n_nct"] == 1 and r["usable_for_mirror"] is False


def test_resume_key_loading(tmp_path):
    p = tmp_path / "led.jsonl"
    append_jsonl(str(p), {"pmcid": "PMC1"})
    append_jsonl(str(p), {"pmcid": "PMC2"})
    assert load_done_keys(str(p), "pmcid") == {"PMC1", "PMC2"}


def test_shard_partition_is_disjoint_and_total():
    import config as C
    ids = [f"PMC{i}" for i in range(2000)]
    s0 = [p for p in ids if C.in_shard(p, 0, 2)]
    s1 = [p for p in ids if C.in_shard(p, 1, 2)]
    assert set(s0).isdisjoint(s1)             # no meta in both shards
    assert len(s0) + len(s1) == len(ids)      # every meta in exactly one
    assert 800 < len(s0) < 1200               # roughly balanced


def test_shard_count_one_takes_all():
    import config as C
    assert all(C.in_shard(f"PMC{i}", 0, 1) for i in range(100))


def test_shard_assignment_stable():
    import config as C
    # same pmcid always lands on the same shard (deterministic hash)
    assert C.in_shard("PMC123456", 0, 2) == C.in_shard("PMC123456", 0, 2)
