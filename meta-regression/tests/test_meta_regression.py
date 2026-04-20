"""Smoke tests for the meta-regression app."""

import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"

EXPECTED_IDS = (
    "f-data", "f-title", "f-modlabel", "f-effectlabel",
    "btn-svg", "btn-png", "btn-json", "btn-import", "btn-example",
    "btn-reset", "btn-rscript", "btn-bus-load", "btn-bus-save",
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
def test_localstorage_keys():
    text = INDEX.read_text(encoding="utf-8")
    assert '"meta-regression-v1"' in text
    assert '"ma-studies-v1"' in text  # bus participant
def test_hksj_floor_applied():
    """advanced-stats.md: HKSJ q must be floored at 1 to avoid under-covering CIs."""
    text = INDEX.read_text(encoding="utf-8")
    assert "Math.max(1, " in text, "HKSJ q floor at max(1, ...) missing"
def test_t_quantile_with_k_minus_p():
    """CIs must use t(k-p) not z — Knapp-Hartung."""
    text = INDEX.read_text(encoding="utf-8")
    assert "tQuantile975" in text
    # df = k-p for p=2 (intercept + slope)
    assert "k - p" in text or "hk.df" in text
def test_rma_script_template_present():
    """Exported R script must use metafor's rma() with PM + knha."""
    text = INDEX.read_text(encoding="utf-8")
    assert 'method = "PM"' in text or "method = \\\"PM\\\"" in text
    assert 'test = "knha"' in text or "test = \\\"knha\\\"" in text
def test_script_close_not_in_string():
    text = INDEX.read_text(encoding="utf-8")
    m = re.search(r"<script>\s*(.*?)\s*</script>", text, re.DOTALL)
    assert m and "</script>" not in m.group(1)
