"""Accessibility hygiene tests for median-to-mean: WCAG-aligned minimums."""
import re
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_has_lang_attribute():
    """WCAG 3.1.1 — primary language must be declared on <html>."""
    html = INDEX.read_text(encoding="utf-8")
    assert 'lang="' in html or "lang='" in html, "no lang attribute on <html>"


def test_has_title_or_h1():
    """WCAG 2.4.2 — page has a programmatic title (or an h1 as fallback)."""
    html = INDEX.read_text(encoding="utf-8")
    has_title = "<title>" in html
    has_h1 = "<h1" in html
    assert has_title or has_h1, "no <title> and no <h1>"


def test_input_aria_labels_match_visible_labels():
    """WCAG 2.5.3 (Label in Name) + data integrity: the value inputs are wrapped
    as <label><span class="lbl">VISIBLE</span><input aria-label="ARIA"></label>.
    aria-label overrides the wrapping label in the accessible-name computation, so
    a shifted aria-label makes a screen-reader user enter the wrong five-number-
    summary value (e.g. min into 'Q1'). Each aria-label must equal its visible label.
    Regression for the 2026-05-28 off-by-one aria-label shift."""
    html = INDEX.read_text(encoding="utf-8")
    pairs = re.findall(
        r'<span class="lbl">([^<]+)</span>\s*<input[^>]*\baria-label="([^"]*)"',
        html,
    )
    assert len(pairs) >= 6, f"expected >=6 labelled value inputs, found {len(pairs)}"
    mismatched = [(vis, aria) for vis, aria in pairs if vis.strip() != aria.strip()]
    assert not mismatched, f"aria-label != visible label for: {mismatched}"
