"""Smoke tests for the NMA app."""

import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"

EXPECTED_IDS = (
    "f-data", "f-ref", "f-model", "f-title",
    "btn-svg", "btn-league", "btn-json", "btn-import", "btn-example", "btn-reset",
    "svg-host", "stats-wrap", "sucra-host", "league-host", "warn-banner",
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


def test_index_exists(): assert INDEX.is_file() and INDEX.stat().st_size > 10000
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
def test_no_cdn_runtime_scripts():
    text = INDEX.read_text(encoding="utf-8")
    assert not re.search(r'<script[^>]*src=["\']https?://', text, re.IGNORECASE)
def test_localstorage_key():
    assert '"nma-v1"' in INDEX.read_text(encoding="utf-8")
def test_connectivity_check_present():
    """advanced-stats.md: Disconnected networks cannot do NMA. Check connectivity first."""
    text = INDEX.read_text(encoding="utf-8")
    assert "function isConnected" in text
    assert "DISCONNECTED" in text or "disconnected" in text
def test_league_and_sucra():
    text = INDEX.read_text(encoding="utf-8")
    assert "function mcSucra" in text
    assert "function relEffect" in text
def test_sucra_warning_present():
    """advanced-stats.md: SUCRA != effect size."""
    text = INDEX.read_text(encoding="utf-8")
    assert "not" in text.lower() and "effect size" in text.lower()
def test_matrix_helpers():
    text = INDEX.read_text(encoding="utf-8")
    for fn in ("function matmul", "function invert", "function cholesky"):
        assert fn in text, f"Missing: {fn}"
def test_design_matrix_signs():
    """y = d_t2 - d_t1 => +1 at t2's column, -1 at t1's column."""
    text = INDEX.read_text(encoding="utf-8")
    assert "X[i][idx[r.t2]] += 1" in text
    assert "X[i][idx[r.t1]] -= 1" in text
def test_script_close_not_in_string():
    text = INDEX.read_text(encoding="utf-8")
    m = re.search(r"<script>\s*(.*?)\s*</script>", text, re.DOTALL)
    assert m and "</script>" not in m.group(1)
