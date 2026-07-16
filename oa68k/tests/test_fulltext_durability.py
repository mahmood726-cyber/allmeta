"""Durability + concurrency contracts for the OA full-text stage.

Both contracts here encode bugs that actually bit, not hypotheticals.

1. **Tables before ledger.** Resume is a set-difference on the ledger, so a paper
   whose ledger row is written before its tables are durable is skipped forever
   if the process dies in between. Observed live: 521 papers marked done, 8 table
   rows on disk, ~1,500 parsed tables lost in a killed process's buffer. The
   ledger must never claim a paper whose tables are not on disk.

2. **One harvester per corpus.** Two `fulltext.py --all` processes ran
   concurrently and re-fetched the same 427 papers while both appended to one
   ledger, doubling the NCBI rate. Git Bash `ps` shows no command arguments, so
   grepping for the script name reported 0 and hid it.

Run:  python -m pytest tests/test_fulltext_durability.py -v
"""
from __future__ import annotations

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config as C
import fulltext


# ------------------------------------------------------------------- locking
def test_second_harvester_on_a_corpus_fails_loudly(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "DATA", str(tmp_path))
    lock = fulltext._acquire_lock("dta")
    try:
        with pytest.raises(RuntimeError, match="another fulltext harvester"):
            fulltext._acquire_lock("dta")
    finally:
        os.remove(lock)


def test_lock_is_released_so_the_next_run_can_start(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "DATA", str(tmp_path))
    os.remove(fulltext._acquire_lock("dta"))
    os.remove(fulltext._acquire_lock("dta"))     # must not raise


def test_different_corpora_do_not_block_each_other(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "DATA", str(tmp_path))
    a = fulltext._acquire_lock("dta")
    b = fulltext._acquire_lock("oa_rct")         # different corpus => allowed
    os.remove(a)
    os.remove(b)


# --------------------------------------------------------------- cache-first
def test_cached_xml_is_reused_without_touching_the_network(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "CACHE", str(tmp_path))
    p = tmp_path / "PMC123.xml"
    p.write_bytes(b"<article><body>" + b"x" * 600 + b"</body></article>")

    def _boom(*a, **kw):
        raise AssertionError("network was called despite a warm cache")

    monkeypatch.setattr(fulltext.harvest, "fetch_fulltext", _boom)
    rec = fulltext.fetch_or_cached(None, {"pmcid": "PMC123", "pmid": "1"})
    assert rec["status"] == "XML" and rec["tier"] == "cache"


def test_truncated_cache_file_is_not_trusted(tmp_path, monkeypatch):
    """A tiny file is a failed write, not a document — re-fetch it."""
    monkeypatch.setattr(C, "CACHE", str(tmp_path))
    (tmp_path / "PMC404.xml").write_bytes(b"<html>error</html>")
    called = {"n": 0}

    def _fetch(sess, row):
        called["n"] += 1
        return {"pmcid": row["pmcid"], "status": "UNOBTAINABLE"}

    monkeypatch.setattr(fulltext.harvest, "fetch_fulltext", _fetch)
    fulltext.fetch_or_cached(None, {"pmcid": "PMC404", "pmid": "1"})
    assert called["n"] == 1, "a truncated cache file must not satisfy the fetch"


# ---------------------------------------------- the durability contract itself
def _store_ready():
    d = os.path.join(C.STORE, "paper_tables")
    return os.path.isdir(d) and any(f.endswith(".parquet") for f in os.listdir(d))


@pytest.mark.skipif(not _store_ready(), reason="no harvested tables yet")
def test_ledger_never_claims_tables_that_are_not_on_disk():
    """The invariant that the tables-then-ledger commit order buys us."""
    import duckdb
    ledger = fulltext.ft_ledger("linked_rct")
    if not os.path.exists(ledger):
        pytest.skip("linked_rct not harvested on this node")
    claimed = set()
    with open(ledger, encoding="utf-8") as f:
        for ln in f:
            if not ln.strip():
                continue
            r = json.loads(ln)
            if (r.get("n_tables") or 0) > 0:
                claimed.add(r["pmcid"])
    if not claimed:
        pytest.skip("no papers with tables yet")
    con = duckdb.connect()
    g = os.path.join(C.STORE, "paper_tables", "*.parquet").replace(os.sep, "/")
    on_disk = {r[0] for r in con.execute(
        f"SELECT DISTINCT pmcid FROM read_parquet('{g}')").fetchall()}
    missing = claimed - on_disk
    assert not missing, (
        f"{len(missing)} papers are marked done with n_tables>0 but have no rows "
        f"in the table store — resume will skip them forever. e.g. "
        f"{sorted(missing)[:5]}")
