"""Own-vs-cited zoning for full-text registry keys.

THE FAILURE THIS ENCODES, in order, because both halves nearly shipped:

1. A raw accession scan cannot tell "this paper is registered as X" from "this
   paper CITES X". Measured: 284 of 336 hits (85%) in the DTA corpus were
   citations or included-study table rows, not the paper's own registration.
   Shipping those attaches other people's trials to a paper with full confidence
   — the METHODS-CONTRACT §15 fabrication.

2. **The first fix was INERT and looked fine.** Depth-counting per tag name
   returned "own" for all three known cases, because a preceding sibling's
   </td> cancels the current <td> opener (+1 -1 = 0) — so a match inside a cell
   reads as outside it. A guard that cannot fire is worse than no guard: it
   launders the same fabrication under a safety label. Hence these tests assert
   the guard FIRES, not merely that it exists.

The PACTR consequence is the reason this matters: raw scan said PACTR 17 (DTA
sample) and 507 (oa_rct), which would have contradicted two independent prior
scans reporting PACTR ~= 0. With working zoning it is 2. The prior work was
right; our instrument was wrong.

Run:  python -m pytest tests/test_keyscan.py -v
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import keyscan


def _at(xml: str, needle: str) -> str:
    return keyscan._zone(xml, xml.index(needle))


# ------------------------------------------------------------ the OWN cases
def test_funding_statement_registration_is_own():
    """The real shape from PMC4498609."""
    x = ('<article><back><funding-group><funding-statement>Pan Africa Clinical '
         'Trial registration number PACTR201011000262218.</funding-statement>'
         '</funding-group></back></article>')
    assert _at(x, "PACTR201011000262218") == "own"


def test_abstract_trial_registration_is_own():
    x = ('<article><front><article-meta><abstract><p>Trial registration: '
         'NCT01234567</p></abstract></article-meta></front></article>')
    assert _at(x, "NCT01234567") == "own"


def test_body_prose_registration_is_own():
    x = ('<article><body><sec><p>This trial was registered as ISRCTN12345678 '
         'before enrolment.</p></sec></body></article>')
    assert _at(x, "ISRCTN12345678") == "own"


# ----------------------------------------------------------- the CITED cases
def test_accession_in_a_citation_is_cited():
    """The real shape from PMC6575156."""
    x = ('<article><back><ref-list><ref><mixed-citation publication-type="other">'
         '<name><surname>PACTR201706002322546</surname></name>. Early initiation '
         'ART adherence</mixed-citation></ref></ref-list></article>')
    assert _at(x, "PACTR201706002322546") == "cited"


def test_accession_in_an_included_study_table_is_cited():
    """The real shape from PMC9309033 — a review's included-study row. This is
    the case depth-counting got WRONG: the preceding </td> cancelled the opener."""
    x = ('<article><body><table-wrap><table><tbody>'
         '<tr><td>Trials 2018;19(1):77</td></tr>'
         '<tr><td valign="bottom" colspan="1" rowspan="1">PACTR201611001858240'
         '<break/>Kadoma cellphone study</td></tr>'
         '</tbody></table></table-wrap></body></article>')
    assert _at(x, "PACTR201611001858240") == "cited", (
        "a preceding sibling's </td> must not cancel the current <td> — this is "
        "exactly the inert-guard bug")


def test_many_preceding_sibling_cells_do_not_break_the_stack():
    """Depth counting fails progressively as siblings accumulate; a stack does not."""
    cells = "".join(f"<tr><td>row {i}</td></tr>" for i in range(40))
    x = (f'<article><body><table-wrap><table><tbody>{cells}'
         f'<tr><td>NCT09876543</td></tr></tbody></table></table-wrap></body></article>')
    assert _at(x, "NCT09876543") == "cited"


def test_element_citation_is_cited():
    x = ('<article><back><ref-list><ref><element-citation publication-type="journal">'
         '<pub-id>NCT05555555</pub-id></element-citation></ref></ref-list></article>')
    assert _at(x, "NCT05555555") == "cited"


# ------------------------------------------------ the guard must actually fire
def test_the_guard_is_not_inert():
    """Regression for the real defect: the first implementation returned 'own'
    for EVERY input, so the guard existed and did nothing."""
    own = ('<article><front><article-meta><abstract><p>Registered NCT01111111</p>'
           '</abstract></article-meta></front></article>')
    cited = ('<article><back><ref-list><ref><mixed-citation>NCT02222222'
             '</mixed-citation></ref></ref-list></article>')
    verdicts = {_at(own, "NCT01111111"), _at(cited, "NCT02222222")}
    assert verdicts == {"own", "cited"}, (
        f"the guard returned {verdicts} — it cannot distinguish own from cited "
        f"and is therefore inert")


# ------------------------------------------------------- accession normalising
def test_nct_is_zero_padded_consistently():
    assert keyscan._norm("ClinicalTrials.gov", "NCT 1234567") == "NCT01234567"
    assert keyscan._norm("ClinicalTrials.gov", "NCT01234567") == "NCT01234567"


def test_patterns_are_shape_anchored_not_greedy():
    """A pattern that matches loose digits would key trials off page numbers."""
    assert not keyscan.REGISTRY_PATTERNS["PACTR"].search("PACTR 123")
    assert keyscan.REGISTRY_PATTERNS["PACTR"].search("PACTR201011000262218")
    assert not keyscan.REGISTRY_PATTERNS["ISRCTN"].search("ISRCTN 123")
    assert keyscan.REGISTRY_PATTERNS["ISRCTN"].search("ISRCTN12345678")
