"""Verify-in-R pages must not claim an R package "is not available in WebR".

Requirement: when a page's Verify in R (WebR) cannot check something because an R package is absent,
the message names the package, says nothing was run/checked in the browser, and says WHY in terms that
are true: the package is not in this site's pinned WebR package repository
(r-shiny/shinylive/webr/repo/). "Not available in WebR" is false for EValue and gsDesign, which the
public repo.r-wasm.org repository provides; only this site's pinned copy lacks them.
"""
import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent

# Files whose strings are shown to the user on a page (status lines, panel text).
PAGE_MESSAGE_FILES = [
    "evalue/r-check.js",
    "gsdesign/index.html",
    "gsdesign/rcheck.js",
    "effect-size-converter/r-check.js",
    "median-to-mean/r-check.js",
    "powerma/rcheck.js",
    "sequential-ma/rcheck.js",
    "km-reconstructor/r-verify.js",
    "HTA/src/utils/rCheck.js",
]
FALSE_CLAIM = re.compile(r"(is )?not available in WebR", re.I)
PINNED = "not in this site's pinned WebR package repository"


def _strings(path):
    """User-visible string literals and HTML text only; code comments and # R-script lines are skipped."""
    text = (ROOT / path).read_text(encoding="utf-8")
    if path.endswith(".html"):
        return [text]
    lines = [l for l in text.splitlines() if not l.lstrip().startswith(("*", "//", "/*"))]
    return [l for l in lines if "L.push(" not in l]


@pytest.mark.parametrize("path", PAGE_MESSAGE_FILES)
def test_no_page_message_claims_not_available_in_webr(path):
    hits = [s.strip()[:160] for s in _strings(path) if FALSE_CLAIM.search(s)]
    assert not hits, f"{path} still says 'not available in WebR': {hits}"


def test_pinned_manifest_really_lacks_the_named_packages():
    m = json.loads((ROOT / "r-shiny/shinylive/webr/repo/manifest.json").read_text(encoding="utf-8"))
    have = {p["package"] for p in m["packages"]}
    for pkg in ["EValue", "gsDesign", "metaBLUE", "heemod", "survival"]:
        assert pkg not in have, f"{pkg} is in the pinned repo; the message about it would be false"


def test_evalue_message_names_package_says_nothing_run_and_points_to_script():
    src = (ROOT / "evalue/r-check.js").read_text(encoding="utf-8")
    i = src.index("Verify in R cannot run in this browser")
    msg = src[i:i + 600]
    assert "missing.join" in msg            # names the package(s)
    assert PINNED in msg
    assert "nothing was run" in msg.lower()
    assert "Download R script" in msg


def test_gsdesign_panel_and_status_say_pinned_repo_and_nothing_checked():
    html = (ROOT / "gsdesign/index.html").read_text(encoding="utf-8")
    i = html.index('id="rcheck-panel"')
    panel = html[i:i + 1500]
    assert "gsDesign is " + PINNED in panel
    assert "nothing is checked in the browser" in panel
    js = (ROOT / "gsdesign/rcheck.js").read_text(encoding="utf-8")
    assert "gsDesign is " + PINNED in js
