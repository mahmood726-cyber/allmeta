"""Page-claim wording for HTA (P43): the header subtitle must not claim to exceed all
existing software -- no comparison supports it. Checked on rendered text of the page."""
import html as _html
import re
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def _text():
    t = re.sub(r"<[^>]+>", " ", INDEX.read_text(encoding="utf-8"))
    return re.sub(r"\s+", " ", _html.unescape(t).replace("\u00a0", " "))


def test_header_subtitle_has_no_unsupported_ranking_claim():
    t = _text()
    assert "Version 0.5 - Frontier Edition" in t
    assert not re.search(r"exceeds\s+all\s+existing\s+software", t, re.I)
