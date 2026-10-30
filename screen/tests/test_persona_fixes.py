"""Offline source guards. Run: python -m pytest screen/tests/test_persona_fixes.py.
PERSONA_ROOT can point at a baseline checkout to demonstrate regression failures.
Behavioral tests in persona_fixes.test.cjs use only synthetic __control_* records.
"""
import os
from pathlib import Path

ROOT = Path(os.environ.get("PERSONA_ROOT", Path(__file__).resolve().parents[2]))
HTML = (ROOT / "screen/index.html").read_text(encoding="utf-8")
WORKFLOW = (ROOT / "screen/workflow.js").read_text(encoding="utf-8")


def section(start, end):
    return HTML[HTML.index(start):HTML.index(end, HTML.index(start))]


def test_s04_csv_requires_named_title_and_never_imports_header():
    body = section("function parseCSVRecords", "function parseRIS")
    assert "Missing title column" in body
    assert 'start = 1' in body
    assert 'title: c[1]' not in body
    for alias in ('"article title"', '"ti"', '"ab"', '"au"', '"py"', '"di"', '"so"', '"source title"'):
        assert alias in body


def test_s16_csv_detects_delimiter_outside_quotes():
    assert "function csvDelimiter" in WORKFLOW
    assert "counts[';']>counts[',']" in WORKFLOW
    assert "var delimiter=csvDelimiter(text)" in WORKFLOW
    assert "else if(ch===delimiter)" in WORKFLOW


def test_s06_different_dois_block_fuzzy_removal_and_candidates_are_visible():
    body = section("function tryMerge", "if (bruteOnly ||")
    assert "differentDois(a.r, b.r)" in body
    assert "drop.r.dup = true" not in body
    assert "info.pairs.push" in body
    assert "Possible duplicate" in HTML and "data-review-duplicates" in HTML
    assert 'W.audit(S,"duplicate-"+(choice==="remove" ? "confirmed":"kept")' in HTML


def test_s09_title_normalisation_preserves_unicode():
    body = section("function normTitle", "function trigrams")
    assert '.normalize("NFKC")' in body
    assert r"\p{L}\p{N}" in body
    assert "[^a-z0-9" not in body


def test_s05_score_and_highlight_share_unicode_boundaries():
    assert "function termRegex" in HTML
    assert r"\p{L}" in section("function termRegex", "// ---- dedup")
    assert "termRegex(escapeRe(needle))" in HTML
    assert "re = termRegex(pat)" in HTML


def test_s07_exports_use_the_progress_population_and_label_stage():
    assert "function projectExport" in HTML
    body = section("function projectExport", "function allowProjectExport")
    assert "records=stageRecords()" in body
    assert "computeCounts(records)" in body and "cohensKappa(records)" in body
    assert body.count("stage:S.stage") == 2
    assert "screen: projectExport()" in HTML


def test_s08_blind_project_exports_fail_closed():
    for start, end in [("function exportJSON", "function exportCSV"),
                       ("function exportBundle", "// ---- shared-folder")]:
        assert "if(!allowProjectExport())return" in section(start, end)
    assert 'S.mode==="dual" && S.blind' in section("function allowProjectExport", "function exportJSON")


def test_s14_every_export_route_has_provenance():
    assert "window.AlmBuildInfo" in HTML
    assert '"app_version", "build_commit"' in HTML
    assert '"N1  - Exported by " + exportStamp()' in HTML
    for start, end in [("function projectExport", "function allowProjectExport"),
                       ("function reviewerEnvelope", "function exportReviewerState"),
                       ("function exportBundle", "// ---- shared-folder"),
                       ("function pushPrisma", "// ================= collaboration"),
                       ("function aiExportTask", "function applyAiResults")]:
        assert "exportProvenance()" in section(start, end)
    assert 'exportStamp() + "\\n\\n" + aiPromptText(batch)' in HTML
    assert "screen-unreadable-backup.provenance.json" in HTML


def test_s02_held_out_n_is_not_the_total_corpus():
    assert '" (held-out n=" + rm.n_test' in HTML
    assert "(rm.n_train + rm.n_test)" not in HTML


def test_s03_cv_uses_actual_completed_folds_and_flags_small_samples():
    assert 'folds: foldsRun' in HTML
    assert "foldsRun++" in HTML
    assert 'cv.folds+"-fold CV AUC "' in HTML
    assert "Small sample: AUC is unstable" in HTML
    assert '"; 5-fold CV AUC "' not in HTML


def test_s01_rct_panel_discloses_negative_class_and_score_limits():
    assert "Negatives were reviews, observational studies, case reports and comparative studies" in HTML
    assert "Non-randomised interventional designs were absent as an explicit negative class" in HTML
    assert "not a calibrated probability" in HTML
    assert ">RCT model score " in HTML


def test_s15_language_limit_does_not_invent_english_only_training():
    assert "non-English performance is not validated" in HTML
    assert "trained and validated on English PubMed abstracts only" not in HTML


def test_s10_toast_matches_the_shared_export():
    assert "global.Toast = { show }" in (ROOT / "shared/toast.js").read_text(encoding="utf-8")
    assert "window.Toast.show(m)" in HTML
    assert "AlmToast" not in HTML


def test_s11_kappa_has_named_uncertainty_and_small_n_warning():
    assert "Fleiss-Cohen-Everitt" in HTML
    assert "ci95:ci" in HTML and "se:se" in HTML
    assert "95% CI [" in HTML
    assert "Small sample (n<30)" in HTML


def test_s12_maybe_is_omitted_and_policy_is_disclosed():
    assert '["include","exclude"].includes(r.r1.d)' in HTML
    assert '["include","exclude"].includes(r.r2.d)' in HTML
    assert "Maybe is not a final decision" in HTML
    assert "maybePolicy:KAPPA_POLICY" in HTML


def test_s17_global_shortcuts_leave_controls_and_handled_events_alone():
    body = section("function onKey", "function openHelp")
    assert "e.defaultPrevented" in body
    # text fields keep every key
    assert 'closest("input, textarea, select, [contenteditable=true]")' in body
    # a focused control keeps only its own activation keys (Enter, Space); letter shortcuts still work there
    assert '(e.key === "Enter" || e.key === " ") && e.target && e.target.closest && e.target.closest("button, a, summary, [role=button]")' in body
    # regression guard: the all-keys early return must not list buttons (that disabled 'i' after clicking Focus mode)
    assert 'closest("button, a, summary, input' not in body


def test_s18_focus_follows_decision_without_a_live_card():
    assert 'id="card-host" aria-live' not in HTML
    assert '<h2 class="ctitle" tabindex="-1">' in HTML
    assert "focusCardHeading();" in section("function advanceAfterDecision", "function toggleLabel")
    assert "(heading || cardHost).focus()" in HTML
