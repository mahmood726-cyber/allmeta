"""Regression tests for JATS column-header extraction.

Column headers are the load-bearing part of the JATS tier: a cell can only be
attributed to a column ("events/N" vs "train/test split" vs "dose") if the header
is recovered. A parser that returns headers=[] does not cry wolf — it goes
silently blind, which is worse, because coverage looks fine while recall is zero.

The `<thead>` + `<td>` shape below is not hypothetical: it is exactly how PLOS
(one of the largest OA publishers) marks up header rows. A parser keyed only on
`<th>` returned headers for 1 of 40 tables across the first 12 OA trial papers
harvested; after treating any `<thead>` row as a header row, 37 of 40.

Run:  python -m pytest tests/test_jats_headers.py -v
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import jats


def _wrap(table_xml: str) -> bytes:
    return (f"<article><body><table-wrap><label>Table 1</label>"
            f"<caption><title>Baseline</title></caption>{table_xml}"
            f"</table-wrap></body></article>").encode()


def test_thead_with_td_cells_is_a_header_row():
    """The PLOS shape: header row inside <thead> but built from <td>, not <th>."""
    x = _wrap('<table><thead><tr>'
              '<td>Characteristics</td><td>Vaccine (n = 20)</td>'
              '<td>Control (n = 20)</td></tr></thead>'
              '<tbody><tr><td>Mean age</td><td>26.1</td><td>30.1</td></tr>'
              '</tbody></table>')
    t = jats.parse_tables(x)[0]
    assert t["headers"] == ["Characteristics", "Vaccine (n = 20)", "Control (n = 20)"]
    # and the header must NOT also be emitted as data
    assert t["rows"] == [["Mean age", "26.1", "30.1"]]


def test_thead_with_th_cells_still_works():
    """The classic shape must keep working — the fix widens, never replaces."""
    x = _wrap('<table><thead><tr><th>Study</th><th>Events/Total</th></tr></thead>'
              '<tbody><tr><td>Smith 2020</td><td>12/50</td></tr></tbody></table>')
    t = jats.parse_tables(x)[0]
    assert t["headers"] == ["Study", "Events/Total"]
    assert t["rows"] == [["Smith 2020", "12/50"]]


def test_pure_th_row_without_thead_is_a_header():
    """Some publishers omit <thead> and rely on a leading all-<th> row."""
    x = _wrap('<table><tbody><tr><th>Arm</th><th>N</th></tr>'
              '<tr><td>Placebo</td><td>40</td></tr></tbody></table>')
    t = jats.parse_tables(x)[0]
    assert t["headers"] == ["Arm", "N"]
    assert t["rows"] == [["Placebo", "40"]]


def test_colspan_expands_so_column_indices_line_up():
    """A colspan'd header must occupy both columns, or every later cell shifts
    left by one and gets attributed to the wrong column."""
    x = _wrap('<table><thead><tr><td>Study</td>'
              '<td colspan="2">Events/Total</td></tr></thead>'
              '<tbody><tr><td>A</td><td>1/10</td><td>2/10</td></tr></tbody></table>')
    t = jats.parse_tables(x)[0]
    assert t["headers"] == ["Study", "Events/Total", "Events/Total"]
    assert len(t["headers"]) == len(t["rows"][0]), "header/data column count drift"


def test_data_only_table_yields_no_false_header():
    """No <thead>, no <th> — we must not promote a data row to a header."""
    x = _wrap('<table><tbody><tr><td>A</td><td>1</td></tr>'
              '<tr><td>B</td><td>2</td></tr></tbody></table>')
    t = jats.parse_tables(x)[0]
    assert t["headers"] == []
    assert t["rows"] == [["A", "1"], ["B", "2"]]


def test_malformed_xml_returns_empty_not_raise():
    assert jats.parse_tables(b"<article><body><table-wrap>") == []
