"""Page-claim wording for umbrella-overlap (P34). Pieper et al. 2014 defines the CCA; the
"GROOVE" tool is a different paper, and this page's band cut-points (<5, <10, <15, >=15 %) are its
own. So the page must not attribute "grooves" to Pieper and must say the cut-points are the
page's. Checked on rendered text and on the meta description (which is not rendered)."""
import html as _html
import re
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def _h():
    return INDEX.read_text(encoding="utf-8")


def _text(h):
    body = re.sub(r"<(script|style)\b.*?</\1>", " ", h, flags=re.S | re.I)
    t = re.sub(r"<[^>]+>", " ", body)
    return re.sub(r"\s+", " ", _html.unescape(t).replace("\u00a0", " "))


def test_no_groove_wording_in_page_copy():
    h = _h()
    m = re.search(r'<meta name="description" content="([^"]*)"', h)
    assert m, "meta description missing"
    assert "groove" not in m.group(1).lower(), m.group(1)
    assert "groove" not in _text(h).lower()


def test_bands_described_as_this_pages_cut_points():
    t = _text(_h())
    assert "an overlap band (slight / moderate / high / very high; this page's cut-points are given below)" in t
    assert "Overlap bands (this page's cut-points): <5% slight, <10% moderate, <15% high, ≥15% very high" in t
