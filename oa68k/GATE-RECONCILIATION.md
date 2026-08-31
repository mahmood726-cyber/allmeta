# Two gates, reconciled — and the run currently has ZERO clean pairs

**Nothing scored.** Artefacts: `F:\claude-temp\pend\estimate_axis.json`,
`served_hashes.json`.

---

## 1. Which gate is right about which axis

| | my gate | the peer gate |
|---|---|---|
| surfaces read | store object `inputs.trials` · the **served** page's trial ids · participant denominators across store objects | `index.html` ↔ `dashboard.html` ↔ `portfolio_pools.html` |
| what it treats as "our estimate" | **nothing — it reads no estimate and no effect measure on any surface** | the published pooled value, its **measure**, and **k** |
| detects | a trial pooled but absent from its page; two objects disagreeing on a randomised denominator | one surface publishing a different measure or k from another |

⭐ **A gate that reads one surface cannot detect a disagreement between two.** Mine reads
estimates on **zero** surfaces, so it could not have detected this and did not. **Both are
right about their own axis and neither covers the other's.**

⛔ **So my `12 of 13 scoreable` was a claim about a narrower question than its name
suggested.** The state is renamed to what it tests —
**`NOT_SCOREABLE_TRIALSET_OR_DENOMINATOR_DISAGREEMENT`** — and the missing axis gets its
own state, **`NOT_SCOREABLE_MEASURE_OR_K_DISAGREEMENT`**.

## 2. The widened check: 0 of 4 clean

| topic | k: store / indicators / pools | measure: store / pools | verdict |
|---|---|---|---|
| `sglt2-hf` | 4 / **5** / **5** | HR / **OR** | ⛔ `MEASURE_OR_K_DISAGREEMENT` |
| `iv-iron-hf` | 5 / **4** / **4** | HR,MD,OR,RATE_RATIO,WIN_RATIO / OR | ⛔ `MEASURE_OR_K_DISAGREEMENT` |
| `sotagliflozin-hf` | 2 / 2 / 2 | HR / **OR** | ⛔ `MEASURE_OR_K_DISAGREEMENT` (k agrees, measure does not) |
| `arni-hfref` | 4 / — / — | HR,OR,RD,RR / — | ⚠️ `NOT_COMPARABLE_SURFACE_ABSENT` |

**The peer lane is right on this axis and the honest headline is: zero pairs are currently
clean, not twelve.** I would rather report that than a twelve that does not survive a
reader opening the dashboard.

⚠️ **Do not inflate it.** Their three "2"s are **one** disagreement seen against **two**
surfaces, because dashboard and pools render the same source; `arni-hfref` shows 1 only
because it has no pools row. **Four topics, one index-versus-sidecar-family mismatch each
— not seven defects.**

### ⛔ A bug in my own widened check, caught before reporting

The first run returned **AGREE for `arni-hfref` and `sotagliflozin-hf`** — `arni-hfref`
because *no* other surface carries a row for it, so it declared agreement from a **single
observation**. That is "absent" reported as "not shown", **inside the check written to
catch exactly that**. Fixed: fewer than two surfaces is now
`NOT_COMPARABLE_SURFACE_ABSENT`, never `AGREE`. `sotagliflozin-hf` was also wrong for a
second reason — I compared measures only *within* pools, never store-versus-pools.

⚠️ **My check remains under-powered relative to theirs**: it does not parse
`dashboard.html`, so `arni-hfref`'s index-HR-0.8715-k4 versus dashboard-OR-0.851294-k3 is
**their** finding, not one I reproduced. Recorded as not covered, not as absent.

---

## 3. ⭐ SCORE THE SERVED BYTES — applied, and it settles the two-tree problem

Both directories are **the same repository**. `F:\claude-temp\wt\rob-lane` is a worktree on
`lane/rob-retrieval-2026-08-26`; `F:\rapidmeta-finerenone` is checked out on
`delivery/prune-and-panels-20260826`. **GitHub Pages serves branch `main`, path `/`.**

| page | served | rob-lane | delivery branch | served matches |
|---|---|---|---|---|
| `ARNI_HF_REVIEW.html` | **6,100,652 B** | 6,100,652 | 912,140 | **rob-lane** ✅ |
| `IV_IRON_HF_REVIEW.html` | **7,084,981 B** | 7,084,981 | 905,921 | **rob-lane** ✅ |
| `SGLT2_HF_REVIEW.html` | **3,862,693 B** | 3,862,693 | 795,535 | **rob-lane** ✅ |
| `SOTAGLIFLOZIN_HF_REVIEW.html` | **3,640,156 B** | 3,640,156 | 904,657 | **rob-lane** ✅ |

`git cat-file -s origin/main:ARNI_HF_REVIEW.html` = **6,100,652** — the served bytes are
`origin/main`, and the rob-lane worktree happens to hold identical content for these four.
**Everything I built was keyed to the right artefact after all.**

⛔ **The hazard runs the other way from what I feared.** The 912 KB variants are a
**pruning branch**. Merging `delivery/prune-and-panels-20260826` would replace each served
page with a copy ~7× smaller — and, per §4, would move every registration identifier out
of served visible text. **That is the rebuild lane's finding, and it is pending in a
branch, not sitting in a worktree.**

### One divergence found only because the rule was applied

`index.html` **served 109,081 B ≠ local 109,124 B**. `portfolio_pools.html` and
`dashboard.html` match. So a surface being read by both gates is not identical to the
served copy — which is precisely why the rule is *fetch and hash*, not *read the checkout*.

### Evidence contract, extended

Every score row will carry **`served_url` · `served_sha256` · `fetched_at`** beside
`file · offset · length · span`, and a pair whose local copy does not hash-match the
served bytes is **`NOT_SCOREABLE_ARTEFACT_NOT_SERVED`** — a named state, never a silent
substitution.

---

## 4. ⭐ The JavaScript finding REVERSES on the served artefact

**On the served pages the registration identifiers are in visible text.**

| page | ids | in visible text | script-only | state |
|---|---|---|---|---|
| `ARNI_HF_REVIEW.html` | 93 | **93** | 0 | `VISIBLE_TEXT` |
| `SGLT2_HF_REVIEW.html` | 49 | **49** | 0 | `VISIBLE_TEXT` |
| `SOTAGLIFLOZIN_HF_REVIEW.html` | 3 | **3** | 0 | `VISIBLE_TEXT` |
| `IV_IRON_HF_REVIEW.html` | 14 | 12 | **2** | `MIXED` |

⭐ **The moat sentence holds on the artefact a reader actually meets** — no JavaScript
required, on 3 of 4 pages completely and on the fourth for 12 of 14 ids. **The
`SCRIPT_ONLY` state I reported belongs to the *unserved* pruning branch**, where all ids
live in `window.RapidMeta.outcomeKeys`. Two builds, one name, different reader guarantees
— and the one with the weaker guarantee is not the one being served.

**Recoverable without executing script:** yes in every case. Ids in a `<script>` block as
*data* are extractable from the served bytes by a determined reader. That is materially
different from "not present", and different again from "in the rendered text"; the
`ids_found_in` field now records which of the three, per page, so a later run can tell a
text id from a script id.

⚠️ **The browser reading was not obtained.** The served page loads (its title resolves) but
a scripted read of its rendered text timed out at 30 s on four attempts — the page is
3.9 MB. **I am not reporting a rendered count I did not measure.** The static reading is
complete and is the one that decides the claim, because it is the weaker condition: if the
ids are in the served text, no runtime is required.

---

## 5. `arni-hfref` — protected, and untouched

Nothing in either tree was modified. Its status on this axis is
`NOT_COMPARABLE_SURFACE_ABSENT` from my check — **I could not evaluate it**, which is not
the same as the peer lane's positive finding of an index/dashboard mismatch. Both are
reported; neither is merged into the other.

## 6. What agrees

Their trial-set result and mine agree: **every registration id the store declares as
included is rendered on its page, all four.** Independently built, same answer — with
their stated caveat that the included/excluded field partition is their reading rather
than a documented contract.
