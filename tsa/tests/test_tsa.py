"""Smoke tests for the TSA calculator."""

import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"

EXPECTED_IDS = (
    "f-data", "f-ris-mode", "f-delta", "f-alpha", "f-power",
    "f-ris-manual", "f-diversity", "f-title",
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
def test_localstorage_key():
    assert '"tsa-v1"' in INDEX.read_text(encoding="utf-8")
def test_obrien_fleming_formula():
    """advanced-stats.md TSA: z_k = z_α/√t_k."""
    text = INDEX.read_text(encoding="utf-8")
    assert "za / Math.sqrt" in text, "O'Brien-Fleming boundary formula missing"
def test_diversity_adjustment_present():
    text = INDEX.read_text(encoding="utf-8")
    assert "f-diversity" in text
    assert "baseRIS * D" in text or "baseRIS*D" in text
def test_ris_auto_formula():
    """Auto-RIS uses (z_{α/2} + z_β)² / δ²."""
    text = INDEX.read_text(encoding="utf-8")
    assert "za + zb" in text and "delta * delta" in text
def test_normal_quantile_present():
    text = INDEX.read_text(encoding="utf-8")
    assert "function normQuantile" in text
def test_script_close_not_in_string():
    text = INDEX.read_text(encoding="utf-8")
    m = re.search(r"<script>\s*(.*?)\s*</script>", text, re.DOTALL)
    assert m and "</script>" not in m.group(1)
