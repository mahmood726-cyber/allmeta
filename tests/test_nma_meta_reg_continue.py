"""nma-meta-reg must not offer "Continue with" links that hand over nothing.

The page's input is contrast level (study, trtA, trtB, yi, sei, covariate). The study bus
(ma-studies-v1) carries pairwise {label, est, se} rows and the comparison bus
(ma-comparisons-v1) carries arm-level data, so neither can represent this network. A
Continue-with bar mounted without a getStudies/getComparisons source and without either bus
module pushes nothing, and its ?fromBus=1 targets open on whatever an earlier session left
on the bus.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "nma-meta-reg" / "index.html"


def test_no_continue_bar_without_a_data_source() -> None:
    html = PAGE.read_text(encoding="utf-8")
    calls = re.findall(r"attachContinueBar\s*\(\s*\{(.*?)\}\s*\)", html, flags=re.S)
    for body in calls:
        assert re.search(r"\bget(Studies|Comparisons)\s*:", body), (
            "Continue-with bar has no getStudies/getComparisons: it hands over nothing")
    if calls:
        assert re.search(r"ma-(studies|comparisons)-v1\.js", html), (
            "Continue-with bar mounted but no study/comparison bus module is loaded")
