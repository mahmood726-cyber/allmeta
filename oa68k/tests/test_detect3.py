"""Tests for the column-semantic detector — the FP classes we actually measured.

Each negative test is a real false positive observed in the v2 adjudication sample
(train/test splits, case/control counts, dosing). If any of these ever flags again,
the precision-first contract is broken.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import detect3
import jats


def table(headers, rows, caption="Table 1 Characteristics"):
    th = "".join(f"<th>{h}</th>" for h in headers)
    trs = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return (f'<article><body><table-wrap><label>Table 1</label>'
            f'<caption><p>{caption}</p></caption><table>'
            f'<thead><tr>{th}</tr></thead><tbody>{trs}</tbody>'
            f'</table></table-wrap></body></article>').encode()


# ---------- real FPs from the v2 adjudication sample: must NOT flag ----------

def test_train_test_split_not_flagged():
    x = table(["Study", "Train/Test split"], [["Liu 2020", "80/20"]])
    r = detect3.analyse(x)
    assert r["n_e5"] == 0 and r["n_e1"] == 0
    assert r["cells_skipped_excluded_col"] == 1


def test_male_female_counts_not_flagged():
    x = table(["Study", "Male/Female"], [["Yan 2023", "5405/3395"]])
    assert detect3.analyse(x)["n_e5"] == 0


def test_dosing_column_not_flagged():
    x = table(["Study", "Dose (mg)"], [["Trial A", "400/100"]])
    assert detect3.analyse(x)["n_e5"] == 0


def test_unknown_column_is_skipped_not_flagged():
    # precision-first: no positive evidence -> do not test the cell
    x = table(["Study", "Whatever"], [["A", "101/100"]])
    r = detect3.analyse(x)
    assert r["n_e5"] == 0
    assert r["cells_skipped_unknown_col"] == 1


# ---------- true positives: must flag ----------

def test_events_over_total_impossible_cell_flagged():
    x = table(["Study", "Events/Total"], [["A", "101/100"]])
    r = detect3.analyse(x)
    assert r["n_e5"] == 1, r
    assert r["e5"][0]["column"] == "Events/Total"


def test_events_eq_denominator_flagged():
    x = table(["Study", "n/N"], [["SCD trial", "152/152"]])
    r = detect3.analyse(x)
    assert r["n_e1"] == 1
    assert r["cells_tested"] == 1


def test_seroconversion_allowlisted_even_in_events_column():
    x = table(["Study", "n/N"], [["HepA", "60/60"]],
              caption="Table 2 Seroconversion at week 4")
    assert detect3.analyse(x)["n_e1"] == 0


def test_small_denominator_below_threshold():
    x = table(["Study", "Events/Total"], [["A", "5/5"]])
    assert detect3.analyse(x)["n_e1"] == 0


def test_partial_cell_not_treated_as_fraction():
    # "400/100 mg twice daily" is not a bare cell -> not a 2x2 candidate
    x = table(["Study", "Events/Total"], [["A", "400/100 mg twice daily"]])
    assert detect3.analyse(x)["cells_tested"] == 0


# ---------- structure ----------

def test_colspan_expanded_so_columns_align():
    x = ('<article><body><table-wrap><table><thead><tr>'
         '<th>Study</th><th colspan="2">Events/Total</th></tr></thead>'
         '<tbody><tr><td>A</td><td>1/10</td><td>101/100</td></tr></tbody>'
         '</table></table-wrap></body></article>').encode()
    r = detect3.analyse(x)
    assert r["n_e5"] == 1, "colspan must expand or column indices misalign"


def test_ref_pmids_from_jats():
    x = (b'<article><back><ref-list><ref><element-citation>'
         b'<pub-id pub-id-type="pmid">12345678</pub-id>'
         b'<pub-id pub-id-type="doi">10.1/x</pub-id>'
         b'</element-citation></ref></ref-list></back></article>')
    assert jats.ref_pmids(x) == {"12345678"}


def test_malformed_jats_does_not_crash():
    r = detect3.analyse(b"<article><body>truncated")
    assert r["n_tables"] == 0 and r["n_e1"] == 0


def test_case_control_column_not_flagged():
    """The detector's 1-of-1 real-world FP: `Case/Control 183/150` in a genetic
    association meta = 183 cases vs 150 controls, not events over participants."""
    x = table(["Population", "Case/Control"], [["Africa", "183/150"]],
              caption="Table 3 Results of the meta-analysis from genetic models.")
    r = detect3.analyse(x)
    assert r["n_e5"] == 0, "case/control counts must not read as an impossible cell"
    assert r["cells_skipped_excluded_col"] == 1


def test_sample_size_tc_column_not_flagged():
    x = table(["Study", "Sample size (T/C)"], [["A", "150/183"]])
    assert detect3.analyse(x)["n_e5"] == 0
