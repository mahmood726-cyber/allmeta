"""Display-text regressions for the PairwisePro engine (app.js) and the page that inlines it
(TruthCert-PairwisePro-v1.0-bundle.html, the page main-screen.html opens).

1. After the BCG demo the "Conformal (Distribution-free)" card printed a bare "undefined":
   runAnalysis() stores a stub {lower, upper, skipped} for pi.conformal (the jackknife+
   function is never called) and the renderer, seeing no `valid`, prints `.warning`, which
   the stub did not have.
2. tau-squared rendered as the mojibake "Ã\\x8f”žÂ²" (a lossy multi-pass cp1252 misread of
   UTF-8 "τ²"; 9ddac278 repaired one layer only). A stray "Â" before "²" / "±" is the same
   damage one layer down ("IÂ²", "Â±").
"""
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
FILES = [ROOT / "app.js", ROOT / "TruthCert-PairwisePro-v1.0-bundle.html"]
TAU_MOJIBAKE = "Ã\u008f”ž"  # what "τ" became


def _text(path):
    return path.read_text(encoding="utf-8-sig")


def test_tau_is_not_mojibake():
    for f in FILES:
        s = _text(f)
        assert s.count(TAU_MOJIBAKE) == 0, f"{f.name}: {s.count(TAU_MOJIBAKE)} mojibake tau"
        assert "τ²" in s, f"{f.name}: no tau-squared label left at all"


def test_no_stray_a_circumflex_before_superscript_or_plusminus():
    for f in FILES:
        s = _text(f)
        assert s.count("Â²") == 0 and s.count("Â±") == 0, f"{f.name}: stray Â before ² / ±"


def test_conformal_stub_renders_a_message_not_undefined():
    for f in FILES:
        s = _text(f)
        # The stub assigned to `w` just before `pi: { ..., conformal: w }` in runAnalysis().
        m = re.search(r"predictionInterval_Noma\(h\.theta, h\.se, p, m, c\),\s*w = \{(.*?)\}", s, re.S)
        assert m, f"{f.name}: conformal stub not found"
        stub = m.group(1)
        assert re.search(r"valid:\s*!1", stub), f"{f.name}: stub must say valid: false"
        w = re.search(r'warning:\s*"([^"]+)"', stub)
        assert w and "undefined" not in w.group(1), f"{f.name}: stub needs a warning string"
        # The renderer prints .warning whenever .valid is falsy.
        assert "e.pi.conformal.valid?" in s and "${e.pi.conformal.warning}" in s
