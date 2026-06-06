"""Fidelity to the ROB-ME framework (Page 2023) + honest paraphrase disclosure."""
import re
from pathlib import Path
HTML = (Path(__file__).parent.parent / "index.html").read_text(encoding="utf-8")
def test_eight_signalling_questions_two_sections():
    within = re.findall(r'SQ_WITHIN\s*=\s*\[(.*?)\]', HTML, re.S)
    across = re.findall(r'SQ_ACROSS\s*=\s*\[(.*?)\]', HTML, re.S)
    assert within and across
    assert within[0].count('"') // 2 == 4, "4 within-study signalling questions"
    assert across[0].count('"') // 2 == 4, "4 across-study signalling questions"
def test_exact_response_and_judgement_scales():
    # ROB-ME response options and the three judgement categories (verbatim).
    for r in ("Yes", "Probably yes", "Probably no", "No information"):
        assert r in HTML
    for j in ("Low risk of bias", "Some concerns", "High risk of bias"):
        assert j in HTML
def test_honest_paraphrase_disclaimer():
    low = HTML.lower()
    assert "paraphrased" in low and "riskofbias.info" in low
    assert "official" in low
def test_attribution_and_doi():
    assert "Page" in HTML and "10.1136/bmj-2023-076754" in HTML
def test_benchmarks_present():
    # the missing-evidence denominator + outcome-switching benchmarks
    assert "63.6%" in HTML and "24%" in HTML
