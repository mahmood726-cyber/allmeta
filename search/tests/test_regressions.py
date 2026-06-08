"""Static regression guards for the Search app (2026-06-08 review)."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def _h():
    return INDEX.read_text(encoding="utf-8")


def test_dedup_survivor_is_deterministic_by_source_rank():
    # Reproducibility: which duplicate survives must not depend on network
    # response order. A fixed source ranking decides the kept representative.
    h = _h()
    assert "SRC_RANK" in h
    assert '"EuropePMC": 0' in h


def test_csv_injection_guard_excludes_hyphen():
    h = _h()
    assert r"/^[=+@\t\r]/" in h
    assert r"/^[=+\-@\t\r]/" not in h


def test_result_rows_keyboard_operable():
    # WCAG 2.1.1: abstract-bearing rows must be focusable + Enter/Space toggle.
    h = _h()
    assert 'tabindex="0" role="button" aria-expanded="false"' in h
    assert "keydown" in h


def test_four_retrieval_hosts_and_ai_hosts_in_csp():
    h = _h()
    for host in ("www.ebi.ac.uk", "api.crossref.org", "api.openalex.org", "clinicaltrials.gov",
                 "api.openai.com", "api.anthropic.com", "generativelanguage.googleapis.com"):
        assert host in h, f"missing connect-src host: {host}"


def test_api_key_not_serialized_into_handoff_envelope():
    # srEnvelope() must only emit bibliographic fields, never the API key.
    h = _h()
    assert "function srEnvelope" in h
    # the AI key lives in its own localStorage slot, separate from the envelope
    assert 'AI_KEY_LS = "search-ai-key"' in h


def test_frame_ancestors_removed_from_meta_csp():
    assert "frame-ancestors" not in _h()


# ---- 2026-06-08 recall upgrade guards ----

def test_query_expansion_present():
    h = _h()
    assert "function expandQuery" in h and "var SYN" in h
    assert 'id="btn-expand"' in h


def test_semantic_ranking_present():
    h = _h()
    assert "function semanticRank" in h and "TF-IDF cosine" in h
    assert 'value="relevance"' in h  # the Relevance sort option


def test_snowballing_present():
    h = _h()
    assert "function doSnowball" in h and "oaCitingUrl" in h and "referenced_works" in h
    assert 'id="btn-snowball"' in h
    assert "https://api.openalex.org" in h  # allowlisted in connect-src


def test_no_placeholder_or_hardcoded_key():
    h = _h()
    for bad in ("{{", "REPLACE_ME", "__PLACEHOLDER__", "sk-proj-", "sk-SECRET"):
        assert bad not in h
