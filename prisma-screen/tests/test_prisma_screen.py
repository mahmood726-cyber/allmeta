"""Smoke tests for the PRISMA screening app."""

import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"

EXPECTED_IDS = (
    "f-data", "f-filter", "f-kw",
    "btn-push-prisma", "btn-json", "btn-csv", "btn-import",
    "btn-example", "btn-reset",
    "agreement-stats", "counts", "records-table", "view-count",
    "warn-banner",
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
    assert '"prisma-screen-v1"' in text
    # Push must target prisma-flow-v1 (the downstream app's key)
    assert '"prisma-flow-v1"' in text
def test_cohens_kappa_formula():
    text = INDEX.read_text(encoding="utf-8")
    assert "function cohensKappa" in text
    # kappa = (po - pe) / (1 - pe)
    assert "(po - pe) / (1 - pe" in text
def test_four_tag_categories():
    text = INDEX.read_text(encoding="utf-8")
    for tag in ('"include"', '"exclude"', '"duplicate"', '"maybe"'):
        assert tag in text, f"Missing tag: {tag}"
def test_push_writes_prisma_flow_shape():
    """Push must write a payload matching prisma-flow/index.html's expected fields."""
    text = INDEX.read_text(encoding="utf-8")
    for k in ("db:", "reg:", "removed:", "screened:", "excludedScreen:",
              "sought:", "notRetrieved:", "assessed:", "excludedEligible:",
              "studies:", "reports:"):
        assert k in text, f"Missing prisma-flow field: {k}"
def test_effective_tag_is_conservative_on_disagreement():
    """Disagreement defaults to 'maybe' (needs resolution) not auto-exclude."""
    text = INDEX.read_text(encoding="utf-8")
    assert "Disagreement: mark as \"maybe\"" in text or "return \"maybe\";" in text
def test_script_close_not_in_string():
    text = INDEX.read_text(encoding="utf-8")
    m = re.search(r"<script>\s*(.*?)\s*</script>", text, re.DOTALL)
    assert m and "</script>" not in m.group(1)
