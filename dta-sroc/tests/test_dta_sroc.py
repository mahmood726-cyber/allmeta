"""Smoke tests for the DTA SROC explorer."""

import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"

EXPECTED_IDS = (
    "f-data", "f-title",
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
        self.counts[tag] = self.counts.get(tag,0)+1
    def handle_endtag(self,tag):
        if tag in self.self_closing: return
        self.counts[tag] = self.counts.get(tag,0)-1


def test_index_exists(): assert INDEX.is_file() and INDEX.stat().st_size > 8000
def test_html_balance():
    p = TagCounter(); p.feed(INDEX.read_text(encoding="utf-8"))
    u = {t:n for t,n in p.counts.items() if n != 0}
    assert not u, u
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
    assert '"dta-sroc-v1"' in INDEX.read_text(encoding="utf-8")
def test_moses_regression_present():
    text = INDEX.read_text(encoding="utf-8")
    assert "function regressDS" in text
    # D = logitSe - logitFPR, S = logitSe + logitFPR
    assert "logitSe - logitFPR" in text
    assert "logitSe + logitFPR" in text
def test_spearman_threshold_check():
    """advanced-stats.md: if |Spearman ρ| > 0.6 → report SROC, not pooled Se/Sp."""
    text = INDEX.read_text(encoding="utf-8")
    assert "function spearman" in text
    assert "0.6" in text, "Threshold 0.6 for flagging must be present"
def test_continuity_correction_conditional():
    """advanced-stats.md: add 0.5 only if ANY cell is zero — never unconditionally."""
    text = INDEX.read_text(encoding="utf-8")
    # Correction gated on 'zero' flag
    assert "tp===0 || fp===0 || fn===0 || tn===0" in text or "tp === 0" in text
    assert "zero ? 0.5 : 0" in text
def test_sroc_curve_back_transform():
    """Back-transform from (α,β,S) to (Se, Sp) for curve."""
    text = INDEX.read_text(encoding="utf-8")
    assert "(fit.alpha + (1 + fit.beta) * logitFPR) / (1 - fit.beta)" in text
def test_script_close_not_in_string():
    text = INDEX.read_text(encoding="utf-8")
    m = re.search(r"<script>\s*(.*?)\s*</script>", text, re.DOTALL)
    assert m and "</script>" not in m.group(1)
