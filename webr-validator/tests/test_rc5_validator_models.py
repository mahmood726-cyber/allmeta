"""Lane rc5 (2026-11-12): the validator can re-fit the headline model of every app whose
headline is an inverse-variance pool. forest-plot uses PM + Knapp-Hartung with the
variance factor floored at 1 (metafor test="adhoc"); funnel-plot a fixed-effect pool.
Before, the validator offered neither, so both were re-fitted as PM/z."""
import re
from pathlib import Path

PAGE = (Path(__file__).resolve().parent.parent / "index.html").read_text(encoding="utf-8")


def test_fe_and_adhoc_are_offered_and_accepted():
    sel_m = re.search(r'<select id="f-method".*?</select>', PAGE, re.S).group(0)
    sel_t = re.search(r'<select id="f-test".*?</select>', PAGE, re.S).group(0)
    assert 'value="FE"' in sel_m and 'value="adhoc"' in sel_t
    assert '"FE"' in re.search(r'if \(m && \[([^\]]+)\]\.includes\(m\)\)', PAGE).group(1)
    assert '"adhoc"' in re.search(r'if \(t && \[([^\]]+)\]\.includes\(t\)\)', PAGE).group(1)


def test_adhoc_floors_and_knha_does_not():
    # "knha" must stay the raw metafor statistic (reml-validator-parity golden).
    assert 'knhaFloor: test === "adhoc"' in PAGE
    assert 'const knha = test === "knha" || test === "adhoc";' in PAGE


def test_fe_banner_does_not_call_it_random_effects():
    assert 'meth === "FE" ? "a fixed-effect inverse-variance pool' in PAGE


def test_fe_is_held_to_test_z():
    # Codex review (rc5): ma-core's FE pool ignores knha, metafor applies it, so FE with
    # knha/adhoc would compare two different models. The page holds FE to test z, both in
    # the state every path reads and in the visible selector.
    assert 'if (o.method === "FE") o.test = "z"; return o; }' in PAGE
    assert 'document.getElementById("f-method").value === "FE" && document.getElementById("f-test").value !== "z"' in PAGE
