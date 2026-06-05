"""Fidelity tests for inspect-sr: the tool must match the published INSPECT-SR
(Wilkinson 2025) — 21 checks across 4 domains, the response/judgement scales,
and the trial-handling rule. Guards against silent drift from the real tool.
"""
import re
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"
HTML = INDEX.read_text(encoding="utf-8")

# The 21 check IDs of the final tool, by domain.
EXPECTED_IDS = (
    ["1.1", "1.2", "1.3"]
    + ["2.1", "2.2", "2.3", "2.4", "2.5"]
    + ["3.1", "3.2"]
    + ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9", "4.10", "4.11"]
)


def test_has_all_21_checks_across_4_domains():
    ids = re.findall(r'id:\s*"(\d\.\d+)"', HTML)
    assert ids == EXPECTED_IDS, f"check set drifted from INSPECT-SR: {ids}"
    assert len(ids) == 21
    assert len({i.split('.')[0] for i in ids}) == 4


def test_response_and_judgement_scales():
    # Per-check responses and domain/overall judgements per the tool.
    for r in ("Yes", "No", "Unclear"):
        assert r in HTML
    for j in ("No concerns", "Some concerns", "Serious concerns"):
        assert j in HTML


def test_handling_rule_present():
    # Serious -> exclude; Some -> sensitivity analysis; No -> standard.
    low = HTML.lower()
    assert "exclude" in low and "sensitivity analysis" in low
    assert "not a prescriptive algorithm" in low


def test_attributes_to_wilkinson_and_cochrane():
    assert "Wilkinson" in HTML and "Cochrane" in HTML
    assert "10.1101/2025.09.03.25334905" in HTML
