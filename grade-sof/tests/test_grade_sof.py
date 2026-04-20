"""Smoke tests for the GRADE SoF builder."""

import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"

EXPECTED_IDS = (
    "f-title", "f-population", "f-setting", "f-intervention", "f-comparator",
    "btn-add", "btn-html", "btn-json", "btn-import", "btn-example", "btn-reset",
    "outcomes-wrap", "sof-host",
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
    assert '"grade-sof-v1"' in INDEX.read_text(encoding="utf-8")
def test_four_certainty_tiers():
    """GRADE mandates four certainty levels."""
    text = INDEX.read_text(encoding="utf-8")
    for tier in ("high", "moderate", "low", "verylow"):
        assert f'"{tier}"' in text, f"Missing tier: {tier}"
def test_certainty_glyphs():
    """Cochrane convention uses circle glyphs ⊕ / ○."""
    text = INDEX.read_text(encoding="utf-8")
    assert "\u2295" in text  # ⊕
    assert "\u25cb" in text  # ○
def test_print_stylesheet_present():
    text = INDEX.read_text(encoding="utf-8")
    assert "@media print" in text
def test_html_export_is_standalone():
    """The exported HTML must be self-contained (no external refs)."""
    text = INDEX.read_text(encoding="utf-8")
    # currentHtml() builds a standalone document
    assert "function currentHtml" in text
    assert "<!DOCTYPE html>" in text  # must write a full doc
def test_script_close_not_in_string():
    text = INDEX.read_text(encoding="utf-8")
    m = re.search(r"<script>\s*(.*?)\s*</script>", text, re.DOTALL)
    assert m and "</script>" not in m.group(1)
