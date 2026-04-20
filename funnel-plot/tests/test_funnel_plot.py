"""Smoke tests for the funnel plot explorer."""

import re
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"

EXPECTED_IDS = (
    "f-data", "f-center", "f-null", "f-title", "f-effect",
    "btn-svg", "btn-png", "btn-json", "btn-import", "btn-example", "btn-reset",
    "svg-host", "warn-banner",
)

FORBIDDEN = ("{{", "}}", "REPLACE_ME", "__PLACEHOLDER__", "TODO:", "TBD:")


class TagCounter(HTMLParser):
    def __init__(self):
        super().__init__()
        self.counts = {}
        self.self_closing = {"br", "hr", "img", "input", "meta", "link", "source", "area", "base", "col", "embed", "param", "track", "wbr"}

    def handle_starttag(self, tag, attrs):
        if tag in self.self_closing:
            return
        self.counts[tag] = self.counts.get(tag, 0) + 1

    def handle_endtag(self, tag):
        if tag in self.self_closing:
            return
        self.counts[tag] = self.counts.get(tag, 0) - 1


def test_index_exists_and_substantial():
    assert INDEX.is_file()
    assert INDEX.stat().st_size > 8000


def test_html_balance():
    parser = TagCounter()
    parser.feed(INDEX.read_text(encoding="utf-8"))
    unbalanced = {t: n for t, n in parser.counts.items() if n != 0}
    assert not unbalanced, f"Unbalanced tags: {unbalanced}"


def test_required_ids_present():
    text = INDEX.read_text(encoding="utf-8")
    missing = [i for i in EXPECTED_IDS if f'id="{i}"' not in text]
    assert not missing, f"Missing ids: {missing}"


def test_no_forbidden_placeholders():
    text = INDEX.read_text(encoding="utf-8")
    found = [t for t in FORBIDDEN if t in text]
    assert not found, f"Placeholders: {found}"


def test_no_external_runtime_cdn():
    text = INDEX.read_text(encoding="utf-8")
    assert not re.search(r'<script[^>]*src=["\']https?://', text, re.IGNORECASE)
    assert not re.search(r'<link[^>]*rel=["\']stylesheet["\'][^>]*href=["\']https?://', text, re.IGNORECASE)


def test_localstorage_key_unique():
    text = INDEX.read_text(encoding="utf-8")
    assert '"funnel-plot-v1"' in text


def test_egger_function_declared():
    text = INDEX.read_text(encoding="utf-8")
    assert "function egger" in text
    # p-value computation requires t-CDF via incomplete beta
    assert "function betaInc" in text
    assert "function tTwoSidedP" in text
    assert "function lnGamma" in text


def test_low_k_warning_present():
    text = INDEX.read_text(encoding="utf-8")
    # advanced-stats.md: Egger's has low power for k<10
    assert "k<10" in text or "k < 10" in text


def test_script_close_not_in_string():
    text = INDEX.read_text(encoding="utf-8")
    m = re.search(r"<script>\s*(.*?)\s*</script>", text, re.DOTALL)
    assert m
    assert "</script>" not in m.group(1)


def test_funnel_lines_drawn():
    text = INDEX.read_text(encoding="utf-8")
    # Both 95% and 99% pseudo-CI funnel lines should be drawn
    assert "1.96 * maxSE" in text
    assert "2.58 * maxSE" in text
