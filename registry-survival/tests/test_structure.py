"""Structural tests for the registry-native survival-IPD app."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
INDEX = ROOT / "registry-survival" / "index.html"


def _h():
    return INDEX.read_text(encoding="utf-8")


def test_csp_and_main():
    h = _h()
    assert 'http-equiv="Content-Security-Policy"' in h and "<main" in h.lower()


def test_no_cdn():
    h = _h()
    assert 'src="http' not in h and 'href="http' not in h


def test_hub_back():
    assert 'id="hub-back"' in _h()


def test_loads_vendored_engine():
    h = _h()
    assert "../shared/vendor/registry-ipd/engine.js" in h
    assert "RIPD.reconstruct" in h


def test_honest_scope_and_tiers():
    h = _h()
    assert "pseudo" in h.lower() and "never true IPD" in h
    for t in ("Tier A", "Tier B", "Tier C"):
        assert t in h
    assert "fail" in h.lower() or "Refused" in h        # Tier C fails closed


def test_vendored_engine_present_with_notice():
    base = ROOT / "shared" / "vendor" / "registry-ipd"
    assert (base / "engine.js").is_file()
    assert (base / "NOTICE.md").is_file()               # attribution / MIT provenance
    notice = (base / "NOTICE.md").read_text(encoding="utf-8")
    assert "MIT" in notice and "registry-ipd" in notice


def test_survival_summary_from_pseudo_ipd():
    # registry-ipd engine primitives surfaced: RMST + median + RMST difference
    h = _h()
    assert 'id="surv-summary"' in h and "function renderSurvivalSummary" in h
    assert "RMST" in h and "RMST difference" in h
    assert "RIPD._" in h and ".rmst" in h and ".kmFromIPD" in h


def test_competing_risks_mode():
    # Aalen-Johansen CIF surfaced (auto-detected from competing_events)
    h = _h()
    assert 'id="cif-panel"' in h and "function renderCIF" in h
    assert "reconstructCompetingRisks" in h and "Aalen-Johansen" in h
    assert "competing_events" in h and "overestimate" in h.lower()


def test_test_hook_present():
    assert "__almRegistryIpd" in _h()
