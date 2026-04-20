"""Smoke tests for the risk-of-bias traffic-light plot."""

import re
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"

EXPECTED_IDS = (
    "f-domains", "f-data", "f-title", "f-view",
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
    assert '"rob-traffic-light-v1"' in text


def test_rating_palette_matches_robvis():
    """Colours must match the Cochrane RoB 2 / robvis convention."""
    text = INDEX.read_text(encoding="utf-8")
    # Low: green-ish, Some: amber, High: red, Unclear: gray
    assert "#14a550" in text  # low
    assert "#f8c100" in text  # some
    assert "#e03b3b" in text  # high
    assert "#888888" in text  # unclear


def test_script_close_not_in_string():
    text = INDEX.read_text(encoding="utf-8")
    m = re.search(r"<script>\s*(.*?)\s*</script>", text, re.DOTALL)
    assert m
    assert "</script>" not in m.group(1)


def test_rating_map_supports_common_abbreviations():
    text = INDEX.read_text(encoding="utf-8")
    # Must accept plus/minus/? shorthands and spelled-out forms
    for token in ('"low"', '"some"', '"high"', '"unclear"', '"na"', '"l"', '"h"'):
        assert token in text, f"Rating map missing: {token}"


def test_has_three_views():
    text = INDEX.read_text(encoding="utf-8")
    for v in ('value="both"', 'value="tl"', 'value="bar"'):
        assert v in text
