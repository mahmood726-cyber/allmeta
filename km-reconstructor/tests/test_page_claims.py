"""Page-claim wording for km-reconstructor (P45). The validation sentence must be scoped to
the single parity fixture, state its tolerances, say the default example misses them, and
never claim IPD-level parity or that total events "hits" the reported value. Rendered text."""
import html as _html
import re
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def _text():
    t = re.sub(r"<[^>]+>", " ", INDEX.read_text(encoding="utf-8"))
    return re.sub(r"\s+", " ", _html.unescape(t).replace("\u00a0", " "))


def test_validation_claim_is_scoped_to_one_fixture():
    t = _text()
    m = re.search(r"Validation:(.*?)(?:IPD-level parity\.)", t, re.S)
    assert m, "Validation sentence not found"
    v = m.group(1)
    assert "on the single test fixture in hub/shared/tests/km-reconstructor-parity.spec.mjs" in v, v
    assert "total events is within 3 of the reported value" in v, v
    assert "median ±3, events ±20" in v, v
    assert "the page's default example misses it" in v, v
    assert "explicitly NOT" in v, v


def test_old_unscoped_claim_absent():
    t = _text()
    assert "total events hits the reported value" not in t
