"""Offline resolver controls: test metadata and DOI strings are synthetic test doubles."""
import importlib.util
from pathlib import Path
import pytest
ROOT = Path(__file__).resolve().parents[3]

def load():
    spec = importlib.util.spec_from_file_location("ground", ROOT / "scripts/ground_citations.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m

@pytest.fixture
def registry(tmp_path):
    m = load()
    m.METHOD_REFS_JS = tmp_path / "refs.js"
    m.METHOD_REFS_JS.write_text((ROOT / "shared/method-refs.js").read_text(encoding="utf-8"), encoding="utf-8")
    m.CACHE = tmp_path / "cache.json"
    return m

def test_pending_is_explicit_and_completeness_gate_refuses(registry, monkeypatch):
    monkeypatch.setattr(registry, "extract_claimed", lambda: [])
    assert registry.main([]) == 0
    assert registry.main(["--require-complete"]) == 1

def test_candidate_requires_resolve_and_matching_metadata(registry, monkeypatch):
    candidate = "--method-doi=metafor=10.1234/test-fixture"
    original = registry.METHOD_REFS_JS.read_bytes()
    with pytest.raises(ValueError):
        registry.resolve_method_candidates([candidate], {})
    monkeypatch.setattr(registry, "resolve_crossref", lambda doi: {"title":"Unrelated biomarker investigation"})
    with pytest.raises(ValueError):
        registry.resolve_method_candidates(["--resolve", candidate], {})
    assert registry.METHOD_REFS_JS.read_bytes() == original
    monkeypatch.setattr(registry, "resolve_crossref", lambda doi: {"title":registry.method_refs()[0]["title"], "source":"test-double"})
    cache = {}
    registry.resolve_method_candidates(["--resolve", candidate], cache)
    assert registry.method_refs()[0]["doi"] == "10.1234/test-fixture"
    assert any(c["doi"] == "10.1234/test-fixture" for c in registry.extract_claimed())
    assert "10.1234/test-fixture" in registry.load_cache()

def test_unresolved_candidate_does_not_write(registry, monkeypatch):
    original = registry.METHOD_REFS_JS.read_bytes()
    monkeypatch.setattr(registry, "resolve_crossref", lambda doi: None)
    with pytest.raises(ValueError):
        registry.resolve_method_candidates(["--resolve", "--method-doi=metafor=10.1234/test-fixture"], {})
    assert registry.METHOD_REFS_JS.read_bytes() == original

def test_missing_or_malformed_registry_refuses(registry):
    registry.METHOD_REFS_JS.write_text("broken",encoding="utf-8")
    with pytest.raises((ValueError, IndexError)):
        registry.extract_claimed()

def test_gate_checks_every_claim_even_when_doi_reused(registry, monkeypatch):
    monkeypatch.setattr(registry,"load_cache",lambda:{"10.1234/test-fixture":{"title":"Conducting meta analyses with metafor package"}})
    monkeypatch.setattr(registry,"extract_claimed",lambda:[
        {"doi":"10.1234/test-fixture","vancouver":"Conducting meta analyses with metafor package"},
        {"doi":"10.1234/test-fixture","vancouver":"Unrelated biomarker investigation"}])
    assert registry.main([]) == 1
