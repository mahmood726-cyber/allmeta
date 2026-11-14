"""Pages must not offer "Continue with" links that hand over nothing.

shared/app-flow.js attachContinueBar pushes the page's data only through a getStudies /
getComparisons option, falling back to MaStudies.read() / MaComparisons.read(); with no getter
and neither bus module loaded it writes nothing, and the target opens on its own demo data or,
via "Load from bus", on whatever an earlier session left there. The eight pages below take
inputs that neither bus can carry (contrast-level networks, dependent effects per study,
subgroup effects, 2x2 counts handled without continuity correction, cumulative looks), so their
bars were removed as nma-meta-reg's was (PR #531). Same check as test_nma_meta_reg_continue.py.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
PAGES = [
    "cross-network", "everything-model", "multi-outcome-ma", "multi-outcome-nma",
    "personalised-te", "rare-events-glmm", "rve-meta", "sequential-ma",
]


@pytest.mark.parametrize("page", PAGES)
def test_no_continue_bar_without_a_data_source(page: str) -> None:
    html = (ROOT / page / "index.html").read_text(encoding="utf-8")
    # any mention of the bar (direct call, options object, aliased call) needs a data source
    if "attachContinueBar" in html or "alm-flow-mount" in html:
        assert re.search(r"\bget(Studies|Comparisons)\s*:", html), (
            f"{page}: Continue-with bar has no getStudies/getComparisons: it hands over nothing")
        assert re.search(r"ma-(studies|comparisons)-v1\.js", html), (
            f"{page}: Continue-with bar mounted but no study/comparison bus module is loaded")
