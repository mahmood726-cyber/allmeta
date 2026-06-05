"""Citation grounding gate tests (Phase 1c).

The offline gate must pass on the committed cache: every DOI claimed in
shared/citation.js resolves to a paper whose title matches the claim. This is
network-free (reads shared/citations.cache.json), so it runs in CI and guards
against a future citation/DOI swap silently shipping.
"""
import importlib.util
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "ground_citations.py"


def _load():
    spec = importlib.util.spec_from_file_location("ground_citations", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_offline_gate_passes_on_committed_cache():
    """Every claimed DOI is grounded with a matching title (no network)."""
    r = subprocess.run([sys.executable, str(SCRIPT)],
                       capture_output=True, text=True, cwd=str(ROOT), timeout=60)
    assert r.returncode == 0, f"gate failed:\n{r.stdout}\n{r.stderr}"


def test_every_claimed_doi_has_valid_syntax():
    m = _load()
    claimed = m.extract_claimed()
    assert len(claimed) >= 10, "expected the citation registry to carry DOIs"
    for c in claimed:
        assert m.DOI_VALID.match(c["doi"]), f"malformed DOI: {c['doi']}"


def test_title_overlap_separates_match_from_swap():
    m = _load()
    # Resolved title fully contained in the claim → high overlap.
    high = m.title_overlap(
        "Robust variance estimation in meta-regression with dependent effect sizes",
        "Hedges LV, Tipton E. Robust variance estimation in meta-regression with "
        "dependent effect size estimates. Res Synth Methods. 2010. doi:10.1002/jrsm.5")
    assert high >= 0.6
    # Unrelated paper (the kxl018 swap the gate caught) → low overlap.
    low = m.title_overlap(
        "Incorporating monotonicity into the evaluation of a biomarker",
        "Riley RD, Thompson JR, Abrams KR. An alternative model for bivariate "
        "random-effects meta-analysis when the within-study correlations are unknown.")
    assert low < 0.6


def test_sici_doi_is_captured_whole():
    """Old Wiley SICI DOIs contain angle brackets; they must not be truncated."""
    m = _load()
    dois = {c["doi"] for c in m.extract_claimed()}
    sici = [d for d in dois if "(SICI)" in d]
    assert sici, "expected the Higgins-Whitehead 1996 SICI DOI in the registry"
    assert sici[0].endswith("3.0.CO;2-0"), f"SICI DOI truncated: {sici[0]}"
