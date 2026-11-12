"""On-page claims must match what the validated engine does (P64 validation).

The P64 validation (pre-registered, R 4.6.0 / metafor 5.2.1) scored this page on
23 datasets + 180 simulated datasets, not on a 473-review corpus; the 473-review
figure came from the atlas engine BEFORE its trim-and-fill correction and was not
re-run, so the page must not quote it. On this page's grid the weighted-likelihood
(WL) interval covered the true value in 0.946-0.9975 of datasets across nine
scenarios -- conservative at low heterogeneity, not "calibrated" -- and the naive
pool covered it in 0.1925-0.286.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
INDEX = HERE.parent / "index.html"
PROJECTS = HERE.parent.parent / "hub" / "projects.js"


def _page():
    return INDEX.read_text(encoding="utf-8")


def _hub_entry():
    js = PROJECTS.read_text(encoding="utf-8")
    m = re.search(r'name: "Spec-collapse",.*?\n  \}', js, re.S)
    assert m, "Spec-collapse entry not found in hub/projects.js"
    return m.group(0)


def test_no_unrerun_corpus_figure_on_page_or_hub():
    for text in (_page(), _hub_entry()):
        assert "473" not in text, "the 473-review corpus figure is pre-fix and was not re-run"
        assert "55%" not in text


def test_wl_not_described_as_calibrated():
    for text in (_page(), _hub_entry()):
        assert "coverage-calibrated" not in text


def test_coverage_note_states_validated_ranges():
    page = _page()
    assert "94–99% coverage" not in page
    # validated allmeta-grid ranges (P64 Simulation B, corrected engine)
    assert "0.946" in page and "0.9975" in page
    assert "0.1925" in page and "0.286" in page


def test_footer_states_what_was_validated():
    page = _page()
    assert "31,262 of 31,262" in page
