"""Tests for the reference-join identity layer.

Two things must hold, and both are exercised RED as well as GREEN:

1. refjoin must not silently DIVERGE from refmatch. refjoin re-implements the
   surname candidate walk (it needs ref INDICES; refmatch returns a PMID), so the
   two could drift apart in a later edit and nobody would notice until a join
   went wrong in production. `test_agrees_with_refmatch` pins them together.

2. The join must REJECT rather than guess. A matcher that always answers is a
   guesser, and a wrong join silently attaches the wrong trial's data to the row.
   So every ambiguity case asserts `ambiguous`, not a lucky pick.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import refjoin as RJ
import refmatch as RM


def _jats(refs):
    """Minimal JATS <ref-list>. Each ref: (surname, year, pmid, doi, extra)."""
    out = ['<article><back><ref-list>']
    for i, (sn, yr, pmid, doi, extra) in enumerate(refs):
        out.append(f'<ref id="r{i}"><element-citation>')
        out.append(f'<person-group><name><surname>{sn}</surname>'
                   f'<given-names>A</given-names></name></person-group>')
        out.append(f'<article-title>{extra}</article-title>')
        out.append(f'<year>{yr}</year>')
        if pmid:
            out.append(f'<pub-id pub-id-type="pmid">{pmid}</pub-id>')
        if doi:
            out.append(f'<pub-id pub-id-type="doi">{doi}</pub-id>')
        out.append('</element-citation></ref>')
    out.append('</ref-list></back></article>')
    return "".join(out).encode()


# ------------------------------------------------------- pinning to refmatch

def test_agrees_with_refmatch():
    """refjoin's candidate walk must pick the SAME pmid refmatch picks.

    If this fails, the two matchers have drifted and the funnel is no longer
    measuring the thing refmatch ships.
    """
    xml = _jats([("Chiu", "2019", "111", "10.1/a", "Colonoscopy trial"),
                 ("Pots", "2016", "222", "", "Another trial"),
                 ("Wang", "2019", "333", "", "Yet another")])
    refs_full = RJ.ref_entries_full(xml)
    refs_rm = RM.ref_entries(xml)
    for label in ("Chiu 2019", "Pots 2016", "Wang 2019", "Chiu 2020", "Nobody 1999"):
        got_rm = RM.match_label(label, refs_rm)
        c = RJ.surname_candidates(label, refs_full)
        if got_rm["status"] == "matched":
            assert len(c) == 1, label
            assert refs_full[c[0]]["pmid"] == got_rm["pmid"], label
        elif got_rm["status"] == "unmatched":
            assert not c, label


def test_doi_only_ref_is_matched_not_dropped():
    """The reason refjoin exists alongside refmatch.

    refmatch drops a ref with no PMID (its contract is to return one). But a
    DOI-only ref is a RESOLVABLE identity, so the funnel must count it as matched
    -- otherwise the ceiling is understated and the fix is hidden.
    """
    xml = _jats([("Solo", "2018", "", "10.1234/only-a-doi", "DOI-only trial")])
    assert RM.ref_entries(xml) == []                    # refmatch: invisible
    refs = RJ.ref_entries_full(xml)
    assert len(refs) == 1 and refs[0]["doi"] == "10.1234/only-a-doi"
    r = RJ.resolve("Solo 2018", refs)
    assert r["status"] == "matched"


def test_doi_recovered_from_raw_citation_text():
    xml = _jats([("Raw", "2020", "", "", "Trial. doi:10.9999/in-text-only.")])
    refs = RJ.ref_entries_full(xml)
    assert refs[0]["doi"] == "10.9999/in-text-only"


# ------------------------------------------------------- reject, do not guess

def test_same_surname_same_year_is_ambiguous_not_guessed():
    """Smith 2019a / 2019b -- the trap. Must REJECT."""
    xml = _jats([("Smith", "2019", "111", "", "First trial"),
                 ("Smith", "2019", "222", "", "Second trial")])
    refs = RJ.ref_entries_full(xml)
    r = RJ.resolve("Smith 2019", refs)
    assert r["status"] == "ambiguous"
    assert r["n_candidates"] == 2


def test_surname_prefix_does_not_overmatch():
    """'Wang' must NOT match 'Wangchuk' -- bare substring matching would."""
    xml = _jats([("Wangchuk", "2019", "111", "", "Not the same person")])
    refs = RJ.ref_entries_full(xml)
    assert RJ.resolve("Wang 2019", refs)["status"] == "unmatched"


def test_two_word_surname_matches():
    xml = _jats([("Ahmad Othman", "2023", "111", "", "Trial")])
    refs = RJ.ref_entries_full(xml)
    assert RJ.resolve("Ahmad Othman 2023", refs)["status"] == "matched"


# ------------------------------------------------------- the acronym key

def test_acronym_label_matches_trial_name_in_ref():
    """Cardio's gift: 'PARADIGM-HF' is not fuzzy."""
    xml = _jats([("McMurray", "2014", "111", "", "Angiotensin-neprilysin inhibition "
                                                 "in heart failure (PARADIGM-HF)"),
                 ("Pitt", "2014", "222", "", "Spironolactone (TOPCAT) trial")])
    refs = RJ.ref_entries_full(xml)
    r = RJ.resolve("PARADIGM-HF", refs)
    assert r["status"] == "matched" and r["key"] == "acronym"
    assert refs[r["idx"]]["pmid"] == "111"


def test_acronym_matches_across_punctuation_variants():
    xml = _jats([("Mc", "2019", "111", "", "The DAPA HF study of dapagliflozin")])
    refs = RJ.ref_entries_full(xml)
    assert RJ.resolve("DAPA-HF", refs)["status"] == "matched"


def test_acronym_named_in_two_refs_is_ambiguous():
    """Main paper + substudy both name the trial. Cannot pick one. REJECT."""
    xml = _jats([("A", "2014", "111", "", "PARADIGM-HF primary results"),
                 ("B", "2016", "222", "", "PARADIGM-HF renal substudy")])
    refs = RJ.ref_entries_full(xml)
    assert RJ.resolve("PARADIGM-HF", refs)["status"] == "ambiguous"


def test_acronym_does_not_fire_on_english_words():
    """'TOTAL'/'STUDY'/'OR' must never be treated as trial acronyms -- they would
    match prose in a ref text and manufacture a join out of nothing."""
    for w in ("TOTAL", "STUDY", "POOLED", "RCT", "SMD"):
        assert not RJ.is_acronym_label(w), w


def test_acronym_not_in_any_ref_is_unmatched():
    xml = _jats([("A", "2014", "111", "", "Some unrelated trial")])
    refs = RJ.ref_entries_full(xml)
    assert RJ.resolve("EMPEROR-Reduced", refs)["status"] == "unmatched"


def test_bare_word_acronym_does_not_substring_match():
    """'AF' would match 'AFFIRM' under a substring rule. Word-boundary required.
    (AF is also in the stoplist, so this asserts the boundary via a non-stop word.)"""
    xml = _jats([("A", "2014", "111", "", "The AFFIRM trial of rate control")])
    refs = RJ.ref_entries_full(xml)
    assert RJ.resolve("AFF", refs)["status"] == "unmatched"


# ------------------------------------------------------- the surname-only key

def test_yearless_label_resolves_when_surname_is_unique():
    """'Dreyfus et al' has no year -- parse_label returns None and refmatch is
    blind to it. It is still resolvable when the surname is unique in the review."""
    xml = _jats([("Dreyfus", "2019", "111", "", "Tricuspid trial"),
                 ("Other", "2019", "222", "", "Unrelated")])
    refs = RJ.ref_entries_full(xml)
    assert RM.parse_label("Dreyfus et al") is None      # refmatch cannot see it
    r = RJ.resolve("Dreyfus et al", refs)
    assert r["status"] == "matched" and r["key"] == "surname_only"
    assert refs[r["idx"]]["pmid"] == "111"


def test_yearless_label_with_duplicate_surname_is_ambiguous():
    """The weak key must REJECT. Two Wang papers -> neither, never a guess."""
    xml = _jats([("Wang", "2015", "111", "", "First"),
                 ("Wang", "2019", "222", "", "Second")])
    refs = RJ.ref_entries_full(xml)
    assert RJ.resolve("Wang et al", refs)["status"] == "ambiguous"


def test_label_surname_strips_superscript_citation_number():
    """'Zhong et al34' -- vision flattened a superscript ref number into the label."""
    assert RJ.label_surname("Zhong et al34") == "zhong"
    assert RJ.label_surname("Dreyfus et al") == "dreyfus"
    assert RJ.label_surname("De Bonis et al") == "de bonis"


def test_yearless_key_does_not_hijack_labels_that_have_a_year():
    """A label WITH a year must go through surname_year, not the weak key --
    otherwise 'Smith 2019a' vs 'Smith 2019b' would silently collapse."""
    xml = _jats([("Smith", "2015", "111", "", "First"),
                 ("Smith", "2019", "222", "", "Second")])
    refs = RJ.ref_entries_full(xml)
    r = RJ.resolve("Smith 2019", refs)
    assert r["key"] == "surname_year"
    assert r["status"] == "matched" and refs[r["idx"]]["pmid"] == "222"


# ---------------------------------------- unstructured refs / the gate hole

def test_unstructured_ref_is_visible_to_the_surname_key():
    """A <mixed-citation> with no <surname> elements must still be matchable.

    Otherwise it is invisible, and an invisible ref cannot be rejected as a
    duplicate -- the ambiguity gate passes and the matcher returns the wrong ref
    with full confidence.
    """
    xml = ('<article><back><ref-list>'
           '<ref id="r1"><mixed-citation>23. Seid G, Ayele M. Undernutrition and '
           'Mortality among adult tuberculosis patients in Addis Ababa, Ethiopia. '
           'Advances in preventive medicine. 2020;2020:5238010.'
           '<pub-id pub-id-type="pmid">32089886</pub-id></mixed-citation></ref>'
           '</ref-list></back></article>').encode()
    refs = RJ.ref_entries_full(xml)
    assert len(refs) == 1
    assert refs[0]["structured"] is False
    assert "seid" in refs[0]["surname_keys"], refs[0]["surname_keys"]


def test_case25_regression_mixed_structured_reflist_is_ambiguous():
    """THE regression: adjudication case 25 (PMC11201327, 'Seid et al').

    ref[23] "Seid G, Ayele M." is UNSTRUCTURED (Seid = first author).
    ref[26] "Hussien B, Hussen MM, Seid A" is STRUCTURED (Seid = third author).

    Before the text-surname fallback the unstructured ref was invisible, the gate
    saw one candidate, and the matcher confidently returned the mid-author paper.
    A label of 'Seid et al' cannot distinguish two Seid papers -- the only correct
    answer is AMBIGUOUS.
    """
    xml = ('<article><back><ref-list>'
           '<ref id="a"><mixed-citation>23. Seid G, Ayele M. Undernutrition and '
           'Mortality among adult tuberculosis patients. Adv Prev Med. 2020.'
           '<pub-id pub-id-type="pmid">32089886</pub-id></mixed-citation></ref>'
           '<ref id="b"><element-citation>'
           '<person-group><name><surname>Hussien</surname></name>'
           '<name><surname>Hussen</surname></name>'
           '<name><surname>Seid</surname></name></person-group>'
           '<article-title>Nutritional deficiency in pulmonary TB</article-title>'
           '<year>2019</year><pub-id pub-id-type="pmid">31744538</pub-id>'
           '</element-citation></ref>'
           '</ref-list></back></article>').encode()
    refs = RJ.ref_entries_full(xml)
    assert refs[0]["structured"] is False and refs[1]["structured"] is True
    r = RJ.resolve("Seid et al", refs)
    assert r["status"] == "ambiguous", (
        f"gate hole reopened: {r} — an invisible duplicate surname must not "
        f"produce a confident match")


def test_text_surnames_does_not_harvest_the_article_title():
    """Scoped to the author block. Harvesting title words would invent surnames."""
    txt = ("12. Xie L, Vance T. Aronia Berry Polyphenol Consumption Reduces Plasma "
           "Total Cholesterol In Former Smokers. J Nutr. 2017.")
    got = [s.lower() for s in RJ._text_surnames(txt)]
    assert "xie" in got and "vance" in got
    for bad in ("aronia", "berry", "polyphenol", "cholesterol", "smokers"):
        assert bad not in got, f"harvested {bad!r} from the title"


def test_text_surnames_ignores_structured_refs():
    """The fallback must not fire when <surname> elements exist -- structured data
    beats a heuristic, always."""
    xml = _jats([("Chiu", "2019", "111", "", "Colonoscopy trial")])
    refs = RJ.ref_entries_full(xml)
    assert refs[0]["structured"] is True
    assert refs[0]["surname_keys"] == ["chiu"]


# ------------------------------------------------------- store hygiene

def test_pmcid_of_strips_figure_qualifier():
    """shard-B writes 'PMC123#fig.jpg'. Joining on the raw string loses every
    shard-B row and looks like missing JATS."""
    assert RJ.pmcid_of("PMC12587632#12879_2025_11977_Fig2_HTML.jpg") == "PMC12587632"
    assert RJ.pmcid_of("PMC12587632") == "PMC12587632"
    assert RJ.pmcid_of("") == ""
    assert RJ.pmcid_of(None) == ""


def test_vision_ledgers_exclude_bak():
    """.bak files are pre-repair snapshots of shard-B. Counting them double-counts
    the same figure under a superseded parse."""
    for p in RJ.vision_ledgers():
        assert not p.endswith(".bak")


def test_wilson_is_not_degenerate_at_the_edges():
    """The whole reason for Wilson over Wald: 0/n and n/n must still carry width.

    The bounds at the edges are mathematically exactly 0 and 1, so they are
    compared with a tolerance rather than `==`: the closed form leaves ~1e-17 of
    float residue, and asserting exact equality would fail on arithmetic, not on
    behaviour. The claim under test is the WIDTH, which is what Wald gets wrong.
    """
    _, lo, hi = RJ.wilson(0, 50)
    assert abs(lo) < 1e-12 and hi > 0.05        # Wald would give hi == 0.0
    _, lo, hi = RJ.wilson(50, 50)
    assert abs(hi - 1.0) < 1e-12 and lo < 0.95  # Wald would give lo == 1.0
    assert RJ.wilson(0, 0) == (0.0, 0.0, 0.0)
