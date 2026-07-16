"""Regression tests for bendlink's label->surname parse.

The accent test is the one that matters: it FAILED on bendlink/1.0 (real bug,
found 2026-07-16 by diagnosing why 50.2% of inclusions matched no reference).
'Kyllonen 2018' parsed to surname 'nen' because non-ASCII was stripped BEFORE
tokenising, severing the surname at the accent. Non-Anglophone surnames are
precisely the rows a selection instrument cannot afford to silently drop.

Run: python -m pytest test_bendlink.py -q
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from bendlink import label_key, match_ref, _clean


def test_accented_surname_survives():
    # THE REGRESSION. Pre-fix this returned ('nen', 2018).
    assert label_key("Kyllönen 2018") == ("kyllonen", 2018)
    assert label_key("Guzmán 2011") == ("guzman", 2011)
    assert label_key("Müller 2003") == ("muller", 2003)
    assert label_key("Ångström 1999") == ("angstrom", 1999)


def test_accented_surname_matches_its_ref():
    """End-to-end: the folded label must match a folded JATS surname."""
    refs = [{"surnames": [_clean("Kyllönen")], "year": 2018, "pmid": "1"}]
    sn, yr = label_key("Kyllönen 2018")
    ref, n = match_ref(sn, yr, refs)
    assert ref is not None and ref["pmid"] == "1"


def test_label_templates():
    assert label_key("Koek 2003") == ("koek", 2003)
    assert label_key("G H Koek 2003") == ("koek", 2003)      # given-names prefix
    assert label_key("Koek et al. 2003") == ("koek", 2003)   # 'al' must not win
    assert label_key("Ans Pauwels 2022") == ("pauwels", 2022)


def test_initials_are_not_surnames():
    # single letters are initials; 'G' must never become the surname
    assert label_key("A B C Smith 2010") == ("smith", 2010)


def test_no_year_is_none_not_guessed():
    sn, yr = label_key("Smith")
    assert sn == "smith" and yr is None


def test_non_author_label_yields_no_usable_surname():
    """GEO accessions are not trials. 'GSE80999' must not silently link."""
    sn, yr = label_key("GSE80999")
    assert yr is None          # no year -> cannot be year-matched
    assert sn == "gse"         # and 'gse' matches no real reference


def test_ambiguous_match_is_dropped_not_guessed():
    """Two refs by the same surname+year -> AMBIGUOUS. Must return None, not
    the first. Picking the first fabricates a trial identity."""
    refs = [{"surnames": ["smith"], "year": 2010, "pmid": "1"},
            {"surnames": ["smith"], "year": 2010, "pmid": "2"}]
    ref, n = match_ref("smith", 2010, refs)
    assert ref is None and n == 2


def test_year_slack_one_absorbs_online_first():
    refs = [{"surnames": ["koek"], "year": 2015, "pmid": "9"}]
    ref, n = match_ref("koek", 2016, refs)   # plot 2016, ref 2015
    assert ref is not None


def test_year_slack_does_not_reach_two():
    refs = [{"surnames": ["koek"], "year": 2013, "pmid": "9"}]
    ref, n = match_ref("koek", 2016, refs)
    assert ref is None


def test_no_surname_never_matches():
    ref, n = match_ref(None, 2010, [{"surnames": ["smith"], "year": 2010, "pmid": "1"}])
    assert ref is None
