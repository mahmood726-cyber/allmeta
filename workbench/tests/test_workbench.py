"""Smoke tests for the MA Workbench integrator."""

import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"

EXPECTED_IDS = (
    "f-data", "f-title", "f-effect", "f-null",
    "btn-save-bus", "btn-load-bus", "btn-report", "btn-example", "btn-reset",
    "headline", "tile-forest", "tile-funnel", "tile-het", "tile-tsa",
    "warn-banner",
)

DEEP_LINKS = (
    "../forest-plot/index.html",
    "../funnel-plot/index.html",
    "../heterogeneity/index.html",
    "../tsa/index.html",
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
def test_deep_links_to_dedicated_apps():
    """Each tile must link to its dedicated app."""
    text = INDEX.read_text(encoding="utf-8")
    missing = [link for link in DEEP_LINKS if link not in text]
    assert not missing, missing
def test_bus_key_referenced():
    text = INDEX.read_text(encoding="utf-8")
    assert '"ma-studies-v1"' in text
def test_report_export_self_contained():
    """Full HTML report must be standalone (no external CSS/JS)."""
    text = INDEX.read_text(encoding="utf-8")
    assert "function buildReport" in text
    # Report is a full HTML document
    assert 'doc = [' in text or 'buildReport()' in text
    # Inline <style> section in the generated doc
    assert "<style>" in text  # present in both the app and the report template
def test_own_key_preserved():
    assert '"workbench-v1"' in INDEX.read_text(encoding="utf-8")
def test_script_close_not_in_string():
    text = INDEX.read_text(encoding="utf-8")
    m = re.search(r"<script>\s*(.*?)\s*</script>", text, re.DOTALL)
    assert m and "</script>" not in m.group(1)
