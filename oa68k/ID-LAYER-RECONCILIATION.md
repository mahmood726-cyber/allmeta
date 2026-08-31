# Where the registration ids live — the contradiction resolved

**Nothing scored.** Artefacts: `F:\claude-temp\pend\codexjob\id_layer_reconciliation.json`
· `codex_run2.log` · `SERVED_*.html` (cached served bytes) · `JOB.md` (the delegated spec).

---

## The answer: we read different files, and both of us were right

| ref | full sha | what it is |
|---|---|---|
| `origin/main` | `bca61dd312cd1ef7ead30c465df849ad4a4bf2bf` | **what GitHub Pages serves** |
| `delivery/prune-and-panels-20260826` | `4f5ae25fbce9791aa7448bbfb0101622434c6c8d` | a pruning branch, **not served** |

**SERVED bytes are byte-identical to `origin/main` on all four pages** — same sha256, same
size. So the peer read the served artefact. **I read the pruning branch's working tree.**

| page | source | bytes | ids total | visible | script-only | state |
|---|---|---|---|---|---|---|
| ARNI_HF_REVIEW | **SERVED = MAIN** | 6,100,652 | 93 | **93** | 0 | `VISIBLE_TEXT` |
| IV_IRON_HF_REVIEW | **SERVED = MAIN** | 7,084,981 | 14 | 12 | 2 | `MIXED` |
| SGLT2_HF_REVIEW | **SERVED = MAIN** | 3,862,693 | 49 | **49** | 0 | `VISIBLE_TEXT` |
| SOTAGLIFLOZIN_HF_REVIEW | **SERVED = MAIN** | 3,640,156 | 3 | **3** | 0 | `VISIBLE_TEXT` |
| ARNI_HF_REVIEW | PRUNED | 912,140 | 6 | **0** | 6 | `SCRIPT_ONLY` |
| IV_IRON_HF_REVIEW | PRUNED | 905,921 | 6 | **0** | 6 | `SCRIPT_ONLY` |
| SGLT2_HF_REVIEW | PRUNED | 795,535 | 5 | **0** | 5 | `SCRIPT_ONLY` |
| SOTAGLIFLOZIN_HF_REVIEW | PRUNED | 904,657 | 8 | **0** | 8 | `SCRIPT_ONLY` |

### My exact reading, as asked

- **Path:** `F:\rapidmeta-finerenone\ARNI_HF_REVIEW.html`, the **working tree of
  `delivery/prune-and-panels-20260826`** (`4f5ae25fb`).
- **Bytes:** **912,140** — the small one.
- **Test:** remove `<script>…</script>` and `<style>…</style>` (case-insensitive,
  dot-matches-newline), remove remaining `<…>` tags, then match `NCT\d{8}`.
- **Result:** 6 ids in raw bytes, **0 in visible text.** Correct — about that file.

The peer read `git show bca61dd3…:<page>` — 6,100,652 bytes — and found all ids in visible
text. **Correct about that file.** Two right answers to two different questions about two
different builds.

### ⚠️ One refinement, not a contradiction

The peer's *"zero in `<script>`"* holds for three of four on main. **`IV_IRON_HF_REVIEW`
carries 2 ids in script only** — `NCT07467668`, `NCT07686692`. Checked: **neither is a
declared included trial** (the store pools `NCT01453608`, `NCT02642562`, `NCT02937454`,
`NCT03036462`, `NCT03037931`). So **every DECLARED id is in visible text on all four**, and
their statement stands. My `MIXED` state counts *all* ids on the page, theirs counts
*declared included* ids. Different denominators, both true — which is the same lesson
again, one level down.

---

## ⭐ The reader's guarantee, both readings

**Static, no JavaScript:** every declared id is in the served text on all four pages.

**With JavaScript, measured in a browser on the served SGLT2 page:**
`document.body.textContent` → **49 distinct ids, identical to the static 49**, and
`window.RapidMeta.outcomeKeys` is **absent**. The `in_rapidmeta_outcomekeys` field is
`None` for every SERVED and MAIN row — **that object does not exist on the served build at
all.** JavaScript adds nothing and is not required.

⚠️ `innerText` timed out at 30 s four times on a 3.9 MB DOM; `textContent` succeeded
because it does not force layout. Recorded because the first four failures were mine, not
the page's.

⛔ **So the moat sentence holds on the deployed artefact — and would NOT hold on the
pruning branch.** Merging `delivery/prune-and-panels-20260826` would move **every**
registration id out of served visible text and into a `window.RapidMeta.outcomeKeys`
constant, making a reader's check conditional on their runtime. That is the finding, and
it is pending in a branch.

⭐ Even there the ids remain **recoverable from the served bytes without executing script**
— they sit in a `<script>` block as *data*. That is materially different from "not
present", and different again from "in the rendered text". `ids_found_in` now records
which of the three, per page.

---

## How this was run — first delegation under the quota ruling

One Codex job, not ten: the goal, the three sources, the exact tests, a 7-line
**known-answer control**, a 5-line **acceptance test**, and "iterate until it passes and
report every error you hit".

**All 7 controls passed. All 12 rows returned. A4 (`visible + script == total`) holds on
every row.** I verified the numbers against the artefacts myself: the served sizes and
sha256 match measurements I had taken independently earlier, and the browser's 49 matches
the static 49.

**13 errors reported by Codex, all environmental and all disclosed by it:**
- 12 × `WinError 10013` — its sandbox blocks sockets, so the served fetch failed and it
  used the cached served bytes, recording `served_route` per row as instructed;
- 1 × `Permission denied` writing the output JSON — it printed the JSON to stdout instead,
  and I extracted it from the log.

Two harness lessons for future delegation: **`codex exec` needs `--skip-git-repo-check`
outside a git repo** (the first invocation refused and never ran), and **its sandbox has
neither network nor write access outside its own tree** — so cache inputs beside the job
and expect the result on stdout.

⭐ The known-answer control did exactly what it is for: I could accept 12 rows from a
delegated sweep without re-deriving them, because 7 values I already knew independently
came back right.
