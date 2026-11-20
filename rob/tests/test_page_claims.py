"""Page-claim wording for /rob/ (P39). These assert the REQUIREMENT, on rendered text:
the header badge must carry the no-superiority qualifier itself (a reader who sees only the
badge must not read 62.6 vs 56.7 as a win), and the footer must not describe the RoB 2 judges
as the full Sterne 2019 algorithm, because shared/rob-core.js reads only a subset of the
signalling questions (D2: 2.1, 2.2, 2.5; D3: 3.1, 3.2; D4: 4.1, 4.3; D5: 5.1, 5.2)."""
import html as _html
import re
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def _text(fragment):
    t = re.sub(r"<[^>]+>", " ", fragment)
    t = _html.unescape(t).replace("\u00a0", " ")
    return re.sub(r"\s+", " ", t).strip()


def _element(h, pattern):
    m = re.search(pattern, h, re.S)
    assert m, f"element not found: {pattern}"
    return _text(m.group(1))


def test_badge_carries_no_superiority_qualifier():
    badge = _element(INDEX.read_text(encoding="utf-8"), r'<span[^>]*id="bench-badge"[^>]*>(.*?)</span>')
    assert "62.6" in badge and "56.7" in badge, badge
    assert "n=99" in badge, badge
    assert "no superiority is claimed" in badge, badge


def test_how_it_works_does_not_claim_full_rob2_algorithm():
    h = INDEX.read_text(encoding="utf-8")
    para = _element(h, r"<p><strong>How it works\.</strong>(.*?)</p>")
    assert "simplified deterministic rules" in para, para
    assert "subset of the Sterne 2019" in para, para
    assert "not the full RoB 2 algorithm" in para, para
    # the old unqualified claim must not return anywhere on the rendered page
    assert "deterministic Sterne 2019 (BMJ 366:l4898) algorithm" not in _text(h)
