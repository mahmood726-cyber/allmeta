"""Smoke tests for the Bayesian MA app."""

import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"

EXPECTED_IDS = (
    "f-data", "f-mu0", "f-tau0", "f-slider", "slider-val",
    "f-tau-method", "f-tau2-manual", "f-threshold", "f-rope",
    "btn-svg", "btn-png", "btn-json", "btn-import", "btn-example",
    "btn-bus-load", "btn-bus-save", "btn-reset",
    "svg-host", "warn-banner",
)

FORBIDDEN = ("{{", "}}", "REPLACE_ME", "__PLACEHOLDER__", "TODO:", "TBD:")


class TagCounter(HTMLParser):
    def __init__(self):
        super().__init__()
        self.counts = {}
        self.self_closing = {"br","hr","img","input","meta","link","source","area","base","col","embed","param","track","wbr"}
    def handle_starttag(self,tag,attrs):
        if tag in self.self_closing: return
        self.counts[tag] = self.counts.get(tag,0)+1
    def handle_endtag(self,tag):
        if tag in self.self_closing: return
        self.counts[tag] = self.counts.get(tag,0)-1


def test_index_exists(): assert INDEX.is_file() and INDEX.stat().st_size > 8000
def test_html_balance():
    p = TagCounter(); p.feed(INDEX.read_text(encoding="utf-8"))
    assert not {t:n for t,n in p.counts.items() if n != 0}
def test_required_ids():
    text = INDEX.read_text(encoding="utf-8")
    missing = [i for i in EXPECTED_IDS if f'id="{i}"' not in text]
    assert not missing, missing
def test_no_placeholders():
    text = INDEX.read_text(encoding="utf-8")
    assert not [t for t in FORBIDDEN if t in text]
def test_no_cdn():
    text = INDEX.read_text(encoding="utf-8")
    assert not re.search(r'<script[^>]*src=["\']https?://', text, re.IGNORECASE)
    assert not re.search(r'<link[^>]*rel=["\']stylesheet["\'][^>]*href=["\']https?://', text, re.IGNORECASE)
def test_localstorage_keys():
    text = INDEX.read_text(encoding="utf-8")
    assert '"bayesian-ma-v1"' in text
    assert '"ma-studies-v1"' in text
def test_conjugate_posterior_formula():
    """Posterior precision = sum of inverse variances + prior precision."""
    text = INDEX.read_text(encoding="utf-8")
    # precSum starts with prior precision 1/τ₀² and adds study precisions
    assert "1/(tau0*tau0)" in text
    assert "1/vi" in text
    # Posterior mean derived from precision-weighted sum
    assert "mpSum * postVar" in text
def test_normal_cdf_present():
    """P(θ<c) and ROPE probability come from the standard-normal CDF."""
    text = INDEX.read_text(encoding="utf-8")
    assert "function normCDF" in text
def test_prior_slider_is_log_scale():
    """Prior sensitivity slider covers orders of magnitude."""
    text = INDEX.read_text(encoding="utf-8")
    assert "Math.pow(10, raw)" in text
def test_three_tau2_strategies():
    """Fixed, Paule-Mandel empirical Bayes, or manual."""
    text = INDEX.read_text(encoding="utf-8")
    assert 'value="0"' in text
    assert 'value="PM"' in text
    assert 'value="manual"' in text
def test_no_mcmc_claim():
    """Honest description: no MCMC, no stan."""
    text = INDEX.read_text(encoding="utf-8")
    assert "No MCMC" in text or "no MCMC" in text
def test_script_close_not_in_string():
    text = INDEX.read_text(encoding="utf-8")
    m = re.search(r"<script>\s*(.*?)\s*</script>", text, re.DOTALL)
    assert m and "</script>" not in m.group(1)
