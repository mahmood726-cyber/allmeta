"""Smoke tests for the cumulative + subgroup MA app."""

import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"

EXPECTED_IDS = (
    "f-data", "f-view", "f-title",
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
    assert '"cumulative-subgroup-v1"' in text
    assert '"ma-studies-v1"' in text
def test_two_views_supported():
    text = INDEX.read_text(encoding="utf-8")
    assert 'value="cumulative"' in text
    assert 'value="subgroup"' in text
def test_between_group_q_formula():
    """Q_bw = Σ w_g·(μ_g − μ_all)² per Borenstein."""
    text = INDEX.read_text(encoding="utf-8")
    assert "Q_bw += w * (g.mu - overall.mu) * (g.mu - overall.mu)" in text
def test_chi_sq_cdf_for_pvalue():
    text = INDEX.read_text(encoding="utf-8")
    assert "function chiSqCDF" in text
def test_cumul_order_by_year():
    """Cumulative view must sort by year when all studies have a year."""
    text = INDEX.read_text(encoding="utf-8")
    assert "sorted.every(s => s.year != null)" in text
def test_r_script_uses_cumul_and_rma():
    text = INDEX.read_text(encoding="utf-8")
    assert "cumul(res" in text
    assert 'method = "PM"' in text or "method = \\\"PM\\\"" in text
def test_script_close_not_in_string():
    text = INDEX.read_text(encoding="utf-8")
    m = re.search(r"<script>\s*(.*?)\s*</script>", text, re.DOTALL)
    assert m and "</script>" not in m.group(1)
