"""Tests for the table-scoped detector + reference link layer (Phase 2).

The whole point of v2 is that a fraction in PROSE is not an error candidate but a
fraction in a TABLE CELL is. These tests pin that distinction — the E5=2,929 FP
blowup in v1 is the regression they exist to prevent.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import detect2


def bioc(passages: str) -> bytes:
    return (b'<?xml version="1.0"?><collection><document><id>PMC1</id>'
            + passages.encode() + b'</document></collection>')


def passage(section: str, typ: str, text: str, extra: str = "") -> str:
    return (f'<passage><infon key="section_type">{section}</infon>'
            f'<infon key="type">{typ}</infon>{extra}'
            f'<offset>0</offset><text>{text}</text></passage>')


def test_prose_dosing_ratio_is_NOT_an_error_candidate():
    # the v1 FP that produced 2,929 bogus E5s
    x = bioc(passage("METHODS", "paragraph", "lopinavir/ritonavir 400/100 mg twice daily"))
    r = detect2.analyse(x)
    assert r["n_e5"] == 0 and r["n_e1"] == 0
    assert r["n_prose_fraction_cells"] == 1      # counted, but not an error


def test_table_cell_events_eq_n_IS_flagged():
    x = bioc(passage("TABLE", "table", "Arm A 152/152 events"))
    r = detect2.analyse(x)
    assert r["n_e1"] == 1, r


def test_table_cell_impossible_is_flagged():
    x = bioc(passage("TABLE", "table", "events 101/100"))
    assert detect2.analyse(x)["n_e5"] == 1


def test_table_seroconversion_allowlist():
    x = bioc(passage("TABLE", "table", "seroconversion 60/60 at week 4"))
    assert detect2.analyse(x)["n_e1"] == 0


def test_ref_pmids_extracted_and_linked():
    refs = (passage("REF", "ref", "Smith 2019",
                    '<infon key="pub-id_pmid">12345678</infon>')
            + passage("REF", "ref", "Jones 2020",
                      '<infon key="pub-id_pmid">87654321</infon>')
            + passage("TABLE", "table", "included studies"))

    class FakeLM:
        def ncts_for(self, pmids):
            return {"NCT00000001"} if "12345678" in set(pmids) else set()

    r = detect2.analyse(bioc(refs), FakeLM())
    assert r["n_ref_pmids"] == 2
    assert r["ncts_linked"] == ["NCT00000001"]
    assert r["cites_registry_linked_trial"] is True     # table + a linked trial


def test_link_layer_lifts_mirror_usability_over_direct_only():
    # no NCT printed in text; only reachable via the reference link layer
    x = bioc(passage("TABLE", "table", "study table")
             + passage("REF", "ref", "Trial", '<infon key="pub-id_pmid">111</infon>'))

    class LM:
        def ncts_for(self, p):
            return {"NCT09999999"}

    assert detect2.analyse(x, None)["cites_registry_linked_trial"] is False   # direct-only floor
    assert detect2.analyse(x, LM())["cites_registry_linked_trial"] is True    # lifted by links


def test_direct_and_linked_ncts_deduped():
    x = bioc(passage("RESULTS", "paragraph", "registered NCT01234567")
             + passage("TABLE", "table", "t"))

    class LM:
        def ncts_for(self, p):
            return {"NCT01234567"}     # same trial, both routes

    r = detect2.analyse(x, LM())
    assert r["ncts"] == ["NCT01234567"]
    assert r["ncts_linked"] == []      # not double-listed
    assert r["n_nct"] == 1


def test_malformed_xml_does_not_crash():
    r = detect2.analyse(b"<collection><document>truncated")
    assert r["n_nct"] == 0 and r["n_tables"] == 0
