"""Smoke tests for the heterogeneity explorer."""

import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"

EXPECTED_IDS = (
    "f-data", "f-tau2",
    "btn-svg", "btn-png", "btn-json", "btn-import", "btn-example", "btn-reset",
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
        self.counts[tag]=self.counts.get(tag,0)+1
    def handle_endtag(self,tag):
        if tag in self.self_closing: return
        self.counts[tag]=self.counts.get(tag,0)-1


def test_index_exists(): assert INDEX.is_file() and INDEX.stat().st_size > 8000
def test_html_balance():
    p = TagCounter(); p.feed(INDEX.read_text(encoding="utf-8"))
    u = {t:n for t,n in p.counts.items() if n != 0}
    assert not u, f"Unbalanced: {u}"

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

def test_localstorage_key():
    assert '"heterogeneity-v1"' in INDEX.read_text(encoding="utf-8")

def test_three_tau2_estimators():
    text = INDEX.read_text(encoding="utf-8")
    for fn in ("function tau2_DL", "function tau2_REML", "function tau2_PM"):
        assert fn in text, f"Missing: {fn}"

def test_dl_gated_for_k_lt_10():
    """advanced-stats.md requires DL only for k ≥ 10."""
    text = INDEX.read_text(encoding="utf-8")
    assert "k >= 10" in text or "k ≥ 10" in text or "k >= 10" in text

def test_prediction_interval_uses_k_minus_2():
    """advanced-stats.md: PI uses t_{k-2}, not t_{k-1}; undefined for k<3."""
    text = INDEX.read_text(encoding="utf-8")
    assert "tQuantile975(k-2)" in text
    assert "k >= 3" in text or "k < 3" in text

def test_numerical_helpers_present():
    text = INDEX.read_text(encoding="utf-8")
    assert "function chiSqCDF" in text
    assert "function tTwoSidedP" in text
    assert "function lnGamma" in text

def test_script_close_not_in_string():
    text = INDEX.read_text(encoding="utf-8")
    m = re.search(r"<script>\s*(.*?)\s*</script>", text, re.DOTALL)
    assert m and "</script>" not in m.group(1)
