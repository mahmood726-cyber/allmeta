"""Offline duplicate-review guards. DEDUP_ROOT may point to c71c8dc."""
import os
import re
from pathlib import Path

ROOT = Path(os.environ.get("DEDUP_ROOT", Path(__file__).resolve().parents[2]))
HTML = (ROOT / "screen/index.html").read_text(encoding="utf-8")
WORKFLOW = (ROOT / "screen/workflow.js").read_text(encoding="utf-8")


def body(start, end):
    return HTML[HTML.index(start):HTML.index(end, HTML.index(start))]


def test_detection_never_assigns_duplicate_flags_or_status():
    detection = body("function dedupCore", "function doiKey")
    assert not re.search(r"\.dup(?:Manual|Of)?\s*=(?!=)", detection)
    assert "pairs: []" in detection
    assert all(reason in detection for reason in (
        "exact-doi", "exact-pmid", "exact-title",
        "similar-title", "similar-title+author-year"))
    assert "differentDois(a.r, b.r)" in detection


def test_duplicate_flag_assignments_are_only_in_user_decision_or_undo_handlers():
    # Strip each explicitly reviewed user handler, then reject *any* remaining
    # assignment, including computed RHS, indexed properties and bracket syntax.
    source = HTML
    for start, end in (
        ("function applyDuplicateDecision", "function decideDuplicate"),
        ("function undoDuplicateDecision", "function exactRemovalPlan"),
        ("function decide(val)", "function applyReason"),
    ):
        source = source.replace(body(start, end), "")
    assert not re.search(r"""(?:\.dup\b|\[\s*['"]dup['"]\s*\])\s*=(?!=)""", source)
    handler = body("function applyDuplicateDecision", "function decideDuplicate")
    assert 'if(choice==="remove") { drop.dup=true;' in handler
    # Loading is allowed to restore only a persisted user choice, never detection.
    normalizer = body("function normalizeImported", "function parseCSVRecords")
    assert "dup: !!(r.dup && r.dupManual)" in normalizer


def test_visible_warning_says_nothing_removed_and_links_accessible_pair_review():
    assert 'id="duplicate-warning"' in HTML
    assert "Nothing has been removed." in HTML
    assert "suspected duplicate pairs found" in HTML
    assert 'href="#duplicate-review"' in HTML
    assert 'aria-live="polite"' in HTML
    panel = body("function renderDuplicateReview", "function duplicateCandidatesHtml")
    for control in ("Keep both", "Remove", "Swap", "Undo", "Remove all exact matches"):
        assert control in panel
    assert 'aria-label="Remove ' in panel
    assert "duplicateRecordHtml(a" in panel and "duplicateRecordHtml(b" in panel


def test_bulk_confirmation_cannot_touch_similar_pairs_and_decisions_are_audited():
    plan = body("function exactRemovalPlan", "function removeAllExactMatches")
    assert "filter(function(p){return p.exact;})" in plan
    bulk = body("function removeAllExactMatches", "function duplicateExportNote")
    assert 'if(!confirm("Remove "+plan.length+' in bulk
    assert "x.pair.reasonText" in bulk
    assert 'applyDuplicateDecision(x.pair,"remove"' in bulk
    handler = body("function applyDuplicateDecision", "function decideDuplicate")
    for field in ("pairId:", "reason:", "reasonText:", "action:", "actor:", "at:"):
        assert field in handler
    assert "W.audit(" in handler
    assert "duplicateHistory" in handler


def test_prisma_and_exports_separate_unresolved_pairs_from_user_removals():
    assert "unresolvedDuplicatePairs" in WORKFLOW
    assert "if(r.dup && r.dupManual){c.duplicates++" in WORKFLOW
    prisma = body("function pushPrisma", "// ================= collaboration")
    assert "removed:c.duplicates" in prisma
    assert "unresolvedDuplicatePairs:unresolvedPairs().length" in prisma
    assert "User-confirmed duplicate removals" in prisma
    csv = body("function exportCSV", "function exportRIS")
    assert 'filter(function(r){return !r.dup;})' in csv
    assert '"duplicate_review"' in csv
    assert "Duplicate review:" in body("function exportRIS", "function pushPrisma")
