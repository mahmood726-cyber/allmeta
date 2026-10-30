# Screen persona fixes

Review input: C:\h2h\fix6\screen_review.md. Baseline: 31e48df21ba12b1d69618417387714e5d897811b. Findings were checked against the local source before editing. No network, classifier retraining, commit, push or branch change was performed.

“Confirmed” below means the code supports the reported defect. It does not certify every numerical probe or screenshot in the review. In particular, the repository does not contain the training corpus needed to establish that a particular design never appeared in it.

## Findings S01–S18

### S01 — Confirmed: RCT score is presented too confidently

Evidence: baseline screen/index.html:330 described a study-design likelihood, and :957 rendered “RCT n%”. The training query at screen/tools/train_rct_classifier.py:35 selects RCT publication types against reviews, observational studies, case reports and comparative studies; it does not explicitly sample non-randomised interventions as a negative class.

Changed: screen/index.html:329 explains the negative classes, approximately balanced sampling, and lack of established performance for non-randomised interventions. screen/index.html:1007 renders “RCT model score n/100” with a limitation tooltip. The score is no longer described as a calibrated probability.

Guard: screen/tests/test_persona_fixes.py:99; screen/tests/persona_fixes.test.cjs:156.
Not done: no changes to scores, weights, tokenisation, calibration or classifier training. The stronger claim that the corpus contained *zero* non-randomised interventional studies cannot be confirmed from the query: comparative studies can overlap those designs. The panel therefore says they were absent **as an explicit negative class**, rather than inventing a corpus audit.

### S02 — Confirmed: wrong denominator beside held-out metrics

Evidence: baseline screen/index.html:2256 added n_train and n_test. Shipped metadata contains n_train=2395 and n_test=799.
Changed: screen/index.html:2364 uses rm.n_test and explicitly labels “held-out n=799”.
Guard: screen/tests/test_persona_fixes.py:86; screen/tests/persona_fixes.test.cjs:152.
Not done: no new classifier metric intervals or re-evaluation of the pruned shipped model.

### S03 — Confirmed: hardcoded fold label and no small-sample caveat

Evidence: baseline screen/index.html:1819 clamps folds to available class sizes, but :1923 always says “5-fold”.
Changed: screen/index.html:1927 counts completed folds; screen/index.html:2043 supplies both ML displays with that count and evaluated n. A caveat appears for n<100 or fewer than 20 labels in either class; those thresholds are disclosure rules, not validated reliability cutoffs.
Guard: screen/tests/test_persona_fixes.py:91; screen/tests/persona_fixes.test.cjs:164; Node coverage exercises 2, 3, 4 and 5 folds.
Not done: no AUC confidence interval, change to model fitting or change to the existing transductive vocabulary construction.

### S04 — Confirmed: unknown CSV title headers become data

Evidence: baseline screen/index.html:716 starts at row zero when title/ti is missing; :728 maps columns positionally.
Changed: screen/index.html:729 requires a named title column and always skips the header. Case-insensitive aliases cover title/ti/Article Title, abstract/ab, authors/au, year/py, doi/di and journal/so/Source Title, retaining existing aliases. Failure names the missing title column, expected names and observed headers.
Guard: screen/tests/test_persona_fixes.py:17; screen/tests/persona_fixes.test.cjs:58.
Not done: no positional fallback or interactive column mapper; headerless CSV is deliberately refused.

### S05 — Confirmed: substring scoring makes rat match ratio

Evidence: baseline screen/index.html:490 counts indexOf hits.
Changed: screen/index.html:488 defines Unicode letter/number/mark/underscore boundaries. Both scoring and screen/index.html:666 use that matcher. Highlighting escapes original text fragments after matching, preserving HTML safety.
Guard: screen/tests/test_persona_fixes.py:49; screen/tests/persona_fixes.test.cjs:98.
Not done: no stemming, substring option or language-specific word segmentation. Existing title and exclusion weights remain unchanged.

### S06 — Owner decision implemented: warn and ask for every suspected pair

Owner decision (T7, superseding the earlier S06 behaviour): **Screen never removes a record automatically, including exact identifier matches.** It warns, shows both records and the reason, and offers **Keep both** / **Remove**, a swap control, and **Remove all exact matches (N)** with explicit confirmation.

Evidence: c71c8dc's shared detector reset duplicate flags and automatically removed exact DOI matches. Earlier similarity-only confirmation did not cover that path. The shared blocked/brute detector now returns suspected pairs with machine/readable reasons and never changes records. Exact reasons are DOI, PubMed ID and case/accent/punctuation-normalised title; other reasons are trigram title similarity and title similarity assisted by first author/year. Conflicting nonempty DOIs prohibit every kind of pair, including identical PMID/title.

Changed: imports and project loads show the unresolved pair warning and a link to side-by-side review. Screening remains available. Progress and PRISMA report unresolved pairs separately; only user-confirmed removals count as duplicates removed. Keep/Remove/bulk decisions persist with project records and audit history in localStorage, project JSON and bundles. Each decision has Undo, and removed records keep their own screening decisions and history. CSV and final-includes RIS retain unresolved candidates, exclude user-removed duplicates, and annotate duplicate decisions.

Load/restore releases all legacy automatic removals, including exact DOI removals, audits the release, marks ranking stale and returns to title screening when necessary. Existing explicit manual duplicate choices remain user decisions. Duplicate decisions in backups are validated; editing unsigned backup JSON is not authentication.

Guard: screen/tests/dedup_review.test.cjs, screen/tests/test_dedup_review.py and tests/playwright/screen-dedup-review.spec.mjs. Existing S06 persona/core/upgrade/demo assertions were updated only where their dedup behaviour changed. See [DEDUP-REVIEW.md](DEDUP-REVIEW.md) for the complete assertion inventory, data model, validation and host commands.

Limits: fuzzy blocking is still a candidate-generation heuristic, not a completeness guarantee. Linked pairs stay unresolved until explicitly reviewed; bulk counts only currently safe removals and never silently decides overlapping pairs. Undo linked removals before reviewing those pairs. No study linking, DOI authority lookup or classifier changes.

### S07 — Confirmed: exports use the wrong stage population

Evidence: baseline screen/index.html:1057 uses stageRecords for the screen; :1255 and :1397 compute export counts/agreement over all records.
Changed: screen/index.html:1328 uses the same stage population and labels counts and agreement with stage and scope. Candidate counts are included. Single-reviewer exports mark agreement unavailable, matching the hidden agreement display.
Guard: screen/tests/test_persona_fixes.py:56; screen/tests/persona_fixes.test.cjs:106; the synthetic two-stage case includes a title-stage exclusion and a not-retrieved report.
Not done: exports contain the selected stage summary, not two summary blocks. Both stages’ underlying decisions are still in records.

### S08 — Confirmed: blind exports mislabel reviewer counts as project counts

Evidence: baseline computeCounts uses visibleDecision, which returns the active reviewer’s decision in blind mode; JSON and bundle exports had no blind guard.
Changed: screen/index.html:1334 refuses combined JSON/bundle exports in blind mode, with a visible instruction to unblind or export the active reviewer’s file.
Guard: screen/tests/test_persona_fixes.py:65; screen/tests/persona_fixes.test.cjs:126 for both reviewer slots.
Not done: no new blind project-backup format. Browser persistence and reviewer-only export remain available.

### S09 — Confirmed: title normalisation deletes non-Latin letters

Evidence: baseline screen/index.html:497 uses [^a-z0-9 ], collapsing the review’s two CJK titles to “sglt2”.
Changed: screen/index.html:498 applies NFKC and keeps Unicode letters, numbers and combining marks. Conflicting DOIs also block fuzzy matching.
Guard: screen/tests/test_persona_fixes.py:42; screen/tests/persona_fixes.test.cjs:92 checks CJK, Cyrillic and compatibility-width Latin text.
Not done: no translation or transliteration; author-assist tokenisation remains unchanged.

### S10 — Confirmed: wrong toast global

Evidence: baseline screen/index.html:458 calls AlmToast; shared/toast.js exports global.Toast.
Changed: screen/index.html:457 calls window.Toast.show. The shared module keeps its one existing name.
Guard: screen/tests/test_persona_fixes.py:111; screen/tests/persona_fixes.test.cjs:178 invokes the real toast module and checks notification creation in the DOM stub.
Not done: no second alias or changes to other apps.

### S11 — Confirmed: kappa lacks uncertainty and a small-n note

Evidence: baseline screen/index.html:870 returns only n, agreement, po, pe, kappa and the degeneracy flag.
Changed: screen/index.html:871 computes the multinomial delta-method variance equivalent to the Fleiss-Cohen-Everitt non-null asymptotic SE. The UI and export include SE and a Wald 95% CI clipped to [-1,1], with the method named. n<30 gets a warning; zero SE at a boundary is explicitly not certainty. Degenerate kappa and its interval remain unavailable.
Guard: screen/tests/test_persona_fixes.py:117; screen/tests/persona_fixes.test.cjs:189 and “S11 asymmetric kappa…” compare against analytic tables: balanced SE=0.08; asymmetric variance=252/3125.
Not done: no p-value, bootstrap, alternative agreement statistic or claim that the asymptotic interval is reliable for sparse tables.

### S12 — Confirmed: maybe silently enters the kappa categories

Evidence: baseline screen/index.html:853 accepts any nonempty pair, then derives categories from observed decisions. workflow.js:flow treats maybe as pending.
Changed: screen/index.html:870 discloses unweighted include/exclude agreement using original reviewer decisions. Pairs with maybe or missing decisions are omitted. UI and export carry the same policy, including when too few pairs remain.
Guard: screen/tests/test_persona_fixes.py:124; screen/tests/persona_fixes.test.cjs:202 checks the denominator, categories, displayed policy and pending workflow counts.
Not done: maybe is not collapsed into include, and adjudicated outcomes do not replace original ratings in kappa.

### S13 — Confirmed; not changed in this task

Evidence: screen/index.html:1385 still sets studies equal to reports. The warning to reconcile reports does not derive a study count.
Changed: none to this behaviour; PRISMA received provenance only under S14.
Guard: none for a fix, because study/report reconciliation is not in the requested implementation list.
Not done: a study-link field, an unknown study count and downstream PRISMA/SoF reconciliation. This remains a known issue.

### S14 — Confirmed: exports omit the loaded build identity

Evidence: baseline project/bundle/reviewer export builders omit AlmBuildInfo despite loading shared/build-info.js.
Changed: screen/index.html:1321 copies version, buildCommit and builtAt. JSON, bundle, reviewer files (including folder publication), AI JSON and PRISMA payloads carry provenance. CSV has app_version/build_commit columns; RIS has an N1 stamp; the AI prompt has a stamp. Empty CSV export is refused. Local persistence also carries provenance for the Extract handoff. Raw unreadable-backup recovery stays intact and downloads a separate provenance receipt.
Guard: screen/tests/test_persona_fixes.py:72; screen/tests/persona_fixes.test.cjs:135 checks generated JSON, bundle, reviewer, CSV, RIS, AI and PRISMA output; the static guard covers the recovery receipt.
Not done: no build regeneration. The loaded stamp remains v1.8.0 / 42a94da2110a02200d0b5bff4c56f636b9cbffa9, as supplied by this checkout; it is not a hash of these uncommitted edits.

### S15 — Confirmed: no warning about non-English performance

Evidence: shared/rct-classifier-v1.js:21 uses JavaScript \w, which omits CJK/Cyrillic words. The baseline panel/badge has no language warning.
Changed: screen/index.html:329 and the badge state that the model is English-oriented and non-English performance is not validated.
Guard: screen/tests/test_persona_fixes.py:106; screen/tests/persona_fixes.test.cjs:156 and the shared “S01 and S15…” Node case.
Not done: no language detector or score suppression. The suggested wording “trained and validated on English abstracts only” is refuted as a code-established fact: the training queries have no language restriction and the corpus is not shipped. That unsupported claim was not added.

### S16 — Confirmed: semicolon CSV fails

Evidence: baseline workflow.js:csvRows recognises only commas as field separators.
Changed: screen/workflow.js:127 counts comma/semicolon separators outside quoted cells in the first logical row, then the existing quoted/multiline parser uses the detected delimiter.
Guard: screen/tests/test_persona_fixes.py:26; screen/tests/persona_fixes.test.cjs:70 includes BOM, quoted comma, quoted semicolon, embedded newline and doubled quotes.
Not done: no TSV support.

### S17 — Confirmed: Enter hijacks focused buttons

Evidence: baseline screen/index.html:1471 ignores only inputs/textareas/selects, while :1483 consumes Enter.
Changed: screen/index.html:1560 ignores already-handled events, modifier combinations, editable content and focused buttons/links/summary/role=button controls. Native activation is left to the browser; chip handlers no longer trigger a second global advance.
Guard: screen/tests/test_persona_fixes.py:131; screen/tests/persona_fixes.test.cjs:211 and optional Node-hosted Playwright “S17/S18 browser…” case.
Not done: no shortcut remapping or help-dialog focus trap.

### S18 — Confirmed: decision render discards focus and announces the full card

Evidence: baseline screen/index.html:398 puts aria-live on card-host; renderCard replaces its HTML and advanceAfterDecision never restores focus.
Changed: screen/index.html:1157 focuses the successor heading, with a focusable empty-view fallback. Headings have tabindex=-1; decision advance calls the helper and subsequent rerenders preserve heading focus. The card host is no longer live. The existing short workflow status remains live.
Guard: screen/tests/test_persona_fixes.py:137; screen/tests/persona_fixes.test.cjs:221 and the optional real-browser case checking native Enter, one chip advance, heading focus and CSV export.
Not done: no screen-reader manual session in this sandbox.

## Verification and remaining host checks

- Python: 41 passed across test_persona_fixes.py, test_structure.py and test_regressions.py. All 17 new static tests fail against the extracted 31e48df baseline.
- Supplementary V8 execution: all 19 behavioural cases pass on the working source and fail on the baseline. This ran the same test bodies with small substitutes for Node modules, Blob and the DOM; it is not a Node or browser result.
- The classifier module, weight artifact and loaded build-info content are unchanged from baseline.
- Node, npx and PowerShell were not started. Git also failed to start (0xC0000142); baseline files and branch identity were read directly from Git objects/index with a temporary Python helper. No Git metadata was written.
- Host command: node --test screen/tests/persona_fixes.test.cjs.
- For real browser coverage, set PERSONA_BROWSER=1 and run the same command with the host’s existing Playwright/Chromium. This adds one browser case and blocks all non-file requests. No package/browser installation is attempted.
- Existing Playwright tests remain host-run. No browser or assistive-technology result is claimed here.

Existing assertions changed because they encoded the defects:

- tests/playwright/alm-screen-core.spec.mjs: fuzzy/diacritic matches now assert retained records plus candidates, rather than automatic removal. Malformed/headerless CSV now expects a missing-title error instead of accepting positional parsing.
- tests/playwright/alm-screen-upgrade.spec.mjs: blocking parity compares candidate records; different-DOI author/year matches now assert no removal.
- tests/playwright/screen-rct.spec.mjs: the badge assertion expects the model-score label rather than “RCT n%”. Classifier numeric assertions were not changed.

## Files changed

- screen/index.html
- screen/workflow.js
- screen/tests/test_persona_fixes.py
- screen/tests/persona_fixes.test.cjs
- screen/PERSONA-FIXES.md
- tests/playwright/alm-screen-core.spec.mjs
- tests/playwright/alm-screen-upgrade.spec.mjs
- tests/playwright/screen-rct.spec.mjs

CODEX_T6_DONE
