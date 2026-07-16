"""Credential-hygiene + rate-budget tests.

The API key is a secret: it must reach NCBI E-utilities and NOTHING else, must come
only from the environment, and must never be committed. These tests pin all three,
plus the per-key (not per-IP) rate split that two nodes sharing one key require.
"""
import importlib
import os
import pathlib
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config as C
import net


class FakeResp:
    status_code = 200
    content = b"<x/>"
    headers: dict = {}


def _session_capturing(monkeypatch):
    """A PoliteSession whose GET records (url, params) instead of hitting network."""
    seen = {}
    s = net.PoliteSession(min_interval=0.0)

    def fake_get(url, params=None, timeout=None):
        seen["url"] = url
        seen["params"] = params or {}
        return FakeResp()

    monkeypatch.setattr(s.s, "get", fake_get)
    return s, seen


def test_api_key_sent_to_eutils(monkeypatch):
    monkeypatch.setattr(C, "NCBI_API_KEY", "SECRET123")
    monkeypatch.setattr(net.C, "NCBI_API_KEY", "SECRET123")
    s, seen = _session_capturing(monkeypatch)
    s.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi",
          params={"db": "pmc"})
    assert seen["params"].get("api_key") == "SECRET123"


def test_api_key_NOT_leaked_to_non_ncbi_hosts(monkeypatch):
    """A secret must never be sent to a host that did not issue it."""
    monkeypatch.setattr(C, "NCBI_API_KEY", "SECRET123")
    monkeypatch.setattr(net.C, "NCBI_API_KEY", "SECRET123")
    for url in ("https://www.ebi.ac.uk/europepmc/webservices/rest/search",
                "https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi/x"):
        s, seen = _session_capturing(monkeypatch)
        s.get(url, params={"q": "1"})
        assert "api_key" not in seen["params"], f"key leaked to {url}"


def test_no_key_means_no_param(monkeypatch):
    monkeypatch.setattr(net.C, "NCBI_API_KEY", "")
    s, seen = _session_capturing(monkeypatch)
    s.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi", params={})
    assert "api_key" not in seen["params"]


def test_rate_budget_is_split_across_nodes_sharing_the_key(monkeypatch):
    """10 req/s is per-KEY. Two nodes must not each take 10."""
    monkeypatch.setenv("OA68K_NODES_SHARING_KEY", "2")
    monkeypatch.delenv("OA68K_RPS", raising=False)
    monkeypatch.setenv("NCBI_API_KEY", "x")
    importlib.reload(C)
    assert C.reqs_per_sec() <= 5.0, "two nodes sharing one key must split the budget"
    assert C.reqs_per_sec() > 3.0, "with a key we should still beat the keyless rate"


def test_keyless_rate_is_conservative(monkeypatch):
    monkeypatch.delenv("NCBI_API_KEY", raising=False)
    monkeypatch.delenv("OA68K_RPS", raising=False)
    monkeypatch.setenv("OA68K_NODES_SHARING_KEY", "2")
    importlib.reload(C)
    assert C.reqs_per_sec() <= 1.5
    importlib.reload(C)


def test_key_is_not_hardcoded_anywhere_in_source():
    """The real key must live in the environment, never in a tracked file.

    Skips if the env var is unset (nothing to look for); otherwise scans every
    tracked source/doc for the literal value.
    """
    real = os.environ.get("NCBI_API_KEY", "")
    if not real:
        import pytest
        pytest.skip("NCBI_API_KEY not set in this environment")
    root = pathlib.Path(__file__).resolve().parent.parent
    scanned = 0
    for pat in ("*.py", "*.md", "*.ps1", "*.json", "tests/*.py"):
        for p in root.glob(pat):
            txt = p.read_text(encoding="utf-8", errors="replace")
            assert real not in txt, f"SECRET HARDCODED in {p}"
            scanned += 1
    assert scanned > 0, "leak scan matched no files — the glob is wrong"


def test_config_reads_key_from_env_not_a_literal():
    """config must source the key from os.environ, not carry a default value."""
    root = pathlib.Path(__file__).resolve().parent.parent
    txt = (root / "config.py").read_text(encoding="utf-8")
    assert 'os.environ.get("NCBI_API_KEY", "")' in txt

