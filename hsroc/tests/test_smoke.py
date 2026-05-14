"""Smoke tests for hsroc (Cycle 2.7 retrofit)."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_index_exists():
    assert INDEX.is_file()


def test_index_has_expected_content():
    html = INDEX.read_text(encoding="utf-8", errors="replace")
    assert "HSROC" in html


def test_index_size():
    """Retrofitted app should be >8 KB."""
    assert INDEX.stat().st_size > 8000


def test_has_shared_modules():
    """All 7 shared UX modules referenced."""
    html = INDEX.read_text(encoding="utf-8")
    for module in ["csv-upload.js", "chart-download.js", "axis-controls.js",
                   "results-export.js", "url-state.js", "reset-undo.js", "tooltips.js"]:
        assert module in html, f"Missing shared module reference: {module}"


def test_has_mount_points():
    """All module mount divs present."""
    html = INDEX.read_text(encoding="utf-8")
    for mount_id in ["alm-csv-mount", "alm-chart-mount", "alm-axis-mount",
                     "alm-export-mount", "alm-undo-mount"]:
        assert f'id="{mount_id}"' in html, f"Missing mount point: {mount_id}"


def test_hsroc_results_schema():
    """results-export schema key present in __almResults accessor."""
    html = INDEX.read_text(encoding="utf-8")
    assert "hsroc-results-v1" in html


def test_localstorage_key():
    """localStorage key is app-specific (hsroc-v1)."""
    html = INDEX.read_text(encoding="utf-8")
    assert '"hsroc-v1"' in html


def test_no_placeholders():
    """No unpopulated template tokens."""
    html = INDEX.read_text(encoding="utf-8")
    for bad in ("{{", "}}", "REPLACE_ME", "__PLACEHOLDER__", "TODO:", "TBD:"):
        assert bad not in html, f"Found placeholder token: {bad!r}"


def test_no_cdn():
    """No external CDN references (must be fully offline)."""
    import re
    html = INDEX.read_text(encoding="utf-8")
    assert not re.search(r'<script[^>]*src=["\']https?://', html, re.IGNORECASE)
    assert not re.search(r'<link[^>]*href=["\']https?://', html, re.IGNORECASE)


def test_engine_uses_logit_fpr():
    """JS engine uses logit(FPR) = log(fpr/(1-fpr)), matching mada parameterisation."""
    html = INDEX.read_text(encoding="utf-8")
    assert "logitFPR" in html


def test_dl_pool_function_present():
    """DL approximation pool() function present in JS engine."""
    html = INDEX.read_text(encoding="utf-8")
    assert "function pool(" in html or "function uniPool(" in html


def test_continuity_correction_conditional():
    """Continuity correction gated on zero-cell check (advanced-stats.md)."""
    html = INDEX.read_text(encoding="utf-8")
    # Must check for zero before applying correction
    assert "tp === 0 || fp === 0 || fn === 0 || tn === 0" in html or \
           "tp===0 || fp===0 || fn===0 || tn===0" in html


def test_sroc_curve_rendered():
    """SROC curve drawing code present (polyline from parametric curve)."""
    html = INDEX.read_text(encoding="utf-8")
    assert "polyline" in html or "curvePts" in html


def test_alm_results_has_bivariate_fields():
    """__almResults exposes bivariate summary fields (mu_se, mu_fpr, rho)."""
    html = INDEX.read_text(encoding="utf-8")
    assert "mu_se" in html
    assert "mu_fpr" in html
    assert '"rho"' in html or "rho:" in html
