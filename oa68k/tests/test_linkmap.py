"""Tests for the reference_type-filtered link layer.

The BACKGROUND edge is the whole point: including it manufactures hundreds of false
trial links per meta (Huang 2020 COVID → 301-way fan-out). These tests pin that
BACKGROUND is excluded by default and that a contaminated source self-declares.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import duckdb
import pytest

import linkmap


@pytest.fixture
def fake_refs(tmp_path):
    """A study_references parquet with one real link and one background trap."""
    p = tmp_path / "study_references.parquet"
    con = duckdb.connect()
    con.execute(f"""
        COPY (SELECT * FROM (VALUES
            ('NCT00000001','111','DERIVED'),
            ('NCT00000002','222','RESULT'),
            ('NCT00000003','999','BACKGROUND'),
            ('NCT00000004','999','BACKGROUND'),
            ('NCT00000005','999','BACKGROUND')
        ) t(nct_id,pmid,reference_type)) TO '{str(p).replace(os.sep,'/')}' (FORMAT PARQUET)
    """)
    return str(p)


def test_background_edges_excluded_by_default(fake_refs):
    lm = linkmap.LinkMap.__new__(linkmap.LinkMap)
    lm.map = {}
    lm.contaminated = False
    lm._load_aact(fake_refs, strict=True)
    # PMID 999 is BACKGROUND-only -> must NOT link to any trial
    assert lm.ncts_for(["999"]) == set(), "BACKGROUND edge leaked into the link layer"
    assert lm.ncts_for(["111"]) == {"NCT00000001"}
    assert lm.ncts_for(["222"]) == {"NCT00000002"}
    assert lm.contaminated is False


def test_nonstrict_includes_background_and_self_declares(fake_refs):
    lm = linkmap.LinkMap.__new__(linkmap.LinkMap)
    lm.map = {}
    lm.contaminated = False
    lm._load_aact(fake_refs, strict=False)
    # the 3-way fan-out the filter is designed to kill
    assert lm.ncts_for(["999"]) == {"NCT00000003", "NCT00000004", "NCT00000005"}
    assert lm.contaminated is True, "a contaminated map must declare itself"


def test_real_link_types_are_exactly_derived_and_result():
    assert set(linkmap.REAL_LINK_TYPES) == {"DERIVED", "RESULT"}


def test_missing_source_fails_closed(monkeypatch):
    monkeypatch.setattr(linkmap.C, "ext_table", lambda name: None)
    monkeypatch.setattr(linkmap, "find_sqlite_index", lambda: None)
    with pytest.raises(FileNotFoundError):
        linkmap.LinkMap()
