"""Honest parity coverage disclosure (Phase 1d).

The ledger lists every R-parity-VERIFIED method; silence about the rest would
imply 100% coverage. The generated ledger therefore carries an `uncovered` list
naming the numerical apps with no committed R-parity test and why (usually: a
novel/bespoke method with no standard R oracle). These tests guard that the
disclosure exists and stays honest — if an app later gains a parity test it must
be removed from the list (the generator's drift guard drops it automatically).
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEDGER = ROOT / "parity" / "parity-ledger.js"
SPECS = ROOT / "hub" / "shared" / "tests"


def _ledger() -> dict:
    txt = LEDGER.read_text(encoding="utf-8")
    m = re.search(r"window\.ALM_PARITY_LEDGER\s*=\s*(\{.*\});\s*$", txt, re.S)
    assert m, "could not parse ALM_PARITY_LEDGER from parity-ledger.js"
    return json.loads(m.group(1))


def test_ledger_discloses_uncovered_numerical_apps():
    L = _ledger()
    unc = L.get("uncovered")
    assert isinstance(unc, list) and unc, "ledger must disclose uncovered numerical apps"
    for u in unc:
        assert u.get("app") and u.get("reason"), f"each entry needs app + reason: {u}"
        assert (ROOT / u["app"]).is_dir(), f"uncovered app dir missing: {u['app']}"


def test_uncovered_apps_have_no_parity_test_yet():
    """Drift guard: a disclosed-uncovered app must not already have a parity test."""
    L = _ledger()
    spec_names = " ".join(p.name for p in SPECS.glob("*parity*.spec.mjs")).lower()
    for u in L.get("uncovered", []):
        app = u["app"]
        py = list((ROOT / app / "tests").glob("test_against_*.py")) if (ROOT / app / "tests").is_dir() else []
        assert not py, f"{app} now has a Python R-parity test — drop it from the uncovered list"
        assert f"{app}-parity".lower() not in spec_names, \
            f"{app} now has a parity spec — drop it from the uncovered list"
