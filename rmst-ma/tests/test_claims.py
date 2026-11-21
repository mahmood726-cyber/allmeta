"""rmst-ma: the page's own wording must not claim more than the code does (P37 limitation sweep).

Static checks on rmst-ma/index.html and rmst-ma/r-check.js; no browser needed.
"""
import re
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
HTML = (APP / "index.html").read_text(encoding="utf-8")
RCHECK = (APP / "r-check.js").read_text(encoding="utf-8")


def _text(html):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))


def test_L11_no_unqualified_identity_with_metafor():
    # Requirement: the parity test checks the example to 4-5 decimals and the PI uses t(k-1),
    # not metafor's predict() normal quantile, so "identical to metafor" overstates it.
    foot = _text(re.search(r"<footer>(.*?)</footer>", HTML, re.S).group(1))
    assert "identical to" not in foot
    assert "t k−1" in foot or "t(k−1)" in foot or "t k-1" in foot
    assert "predict" in foot


def test_L12_r_check_scope_stated():
    # Requirement: the R check compares the pooled estimate, SE, CI, tau^2, I^2, PI and study weights
    # (r-check.js buildScript), not study CIs or plotted geometry -- the button must not claim "every".
    assert "every displayed number" not in RCHECK
    m = re.search(r'id="rcheck-dl"[^>]*title="([^"]*)"', RCHECK)
    assert m and "weights" in m.group(1) and "study CIs" in m.group(1), m and m.group(1)
