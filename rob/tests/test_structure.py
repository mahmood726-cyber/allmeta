"""Static structure checks for the /rob/ app and shared/rob-core.js."""
from pathlib import Path

ROOT = Path(__file__).parent.parent
INDEX = ROOT / "index.html"
CORE = ROOT.parent / "shared" / "rob-core.js"


def _h():
    return INDEX.read_text(encoding="utf-8")


def test_csp_and_main():
    h = _h()
    assert 'http-equiv="Content-Security-Policy"' in h
    assert "<main" in h.lower()
    assert "frame-ancestors" not in h  # ignored in <meta>, must not be present


def test_no_cdn():
    h = _h()
    # only same-origin scripts/styles; external hosts appear only in connect-src + footer link
    assert 'src="http' not in h
    assert '<script src="../shared/rob-core.js">' in h


def test_hub_back():
    assert 'id="hub-back"' in _h()


def test_test_hook_present():
    assert "__almRob" in _h()


def test_loads_engine_and_bus():
    h = _h()
    assert "../shared/rob-core.js" in h
    assert "../shared/ma-studies-v1.js" in h


def test_reads_extract_envelope():
    h = _h()
    assert "sr-extract-v1" in h


def test_suggestion_not_final_pattern():
    h = _h()
    # judgments are suggested until the reviewer confirms (Screen pattern)
    assert "suggested" in h and "confirmed" in h
    assert "confirm" in h.lower() and "override" in h.lower()


def test_outputs_present():
    h = _h()
    assert 'id="rob-table"' in h
    assert 'id="traffic"' in h  # traffic-light figure
    assert "rob-traffic-light-v1" in h  # feeds the traffic-light app
    assert "rob-assessments-v1" in h    # feeds synthesis/PRISMA


def test_optional_ai_handoff():
    h = _h()
    assert "rob-ai-task.md" in h  # handoff export
    assert "Import AI judgments" in h


def test_no_placeholder_or_hardcoded_key():
    h = _h()
    for bad in ("{{", "REPLACE_ME", "__PLACEHOLDER__", ">None<", "/None", "sk-proj-", "sk-SECRET", "C:\\Users", "/home/"):
        assert bad not in h, f"found {bad!r}"


def test_benchmark_claim_matches_measured():
    """The headline benchmark numbers in the UI must equal the committed
    measured results (no inflated marketing)."""
    import json
    h = _h()
    res = json.loads((ROOT.parent / "benchmark" / "data" / "rob" / "rob-benchmark-results.json").read_text(encoding="utf-8"))
    allmeta = res["head_to_head"]["avgMacroF1"]
    rr = res["head_to_head"]["robotreviewer_avg"]
    assert str(allmeta) in h, f"UI must state measured allmeta score {allmeta}"
    assert str(rr) in h, f"UI must state RobotReviewer score {rr}"


def test_core_module_structure():
    c = CORE.read_text(encoding="utf-8")
    for fn in ("scoreDomain", "canonicalDomain", "suggestRoB2", "suggestRobinsI", "overallRoB2"):
        assert fn in c, f"missing core fn {fn}"
    # negation guard present (lessons.md: negated cues must not flip judgments)
    assert "isNegated" in c and "NEG_RE" in c
    # works in both node and browser
    assert "module.exports" in c and "window.RobCore" in c
