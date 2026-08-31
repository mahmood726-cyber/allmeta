# The four topics against the sidecar mismatch list

**List:** `F:\rapidmeta-finerenone\outputs\DO_NOT_REBUILD_FROM_SIDECAR.json` —
**11,139 bytes, sha256 `e28306de…911cc`, verified before use.** Generated against ref
`98196b57`. **Result:** `F:\claude-temp\pend\mismatchcheck.json`. **Nothing scored.**

## Membership — none of the four is in any member

| topic | page | `confirmed_mismatch` | `untested` | `pending_refusal` |
|---|---|---|---|---|
| `arni-hfref` | `ARNI_HF_REVIEW.html` | no | no | no |
| `iv-iron-hf` | `IV_IRON_HF_REVIEW.html` | no | no | no |
| `sglt2-hf` | `SGLT2_HF_REVIEW.html` | no | no | no |
| `sotagliflozin-hf` | `SOTAGLIFLOZIN_HF_REVIEW.html` | no | no | no |

⛔ **And absence is not clearance — now with the mechanism.** `all_pages` (87) is exactly
the union of the three members (87). **The file publishes only flagged pages; its
examined denominator is not in it.** You cannot tell from this file whether a page was
examined at all, so "not listed" carries no information about coverage.

## The positive assertion — HOLDS on all four, and is weaker than it looks

*Every registration id the store object pools appears in the rendered, reader-visible text
of the page that describes it.* **HOLDS 4/4**, from a fresh read with content hashes
recorded for both artefacts.

⛔ **But it has no demonstrated power against their hazard.** Run on the 8 of their 69
`confirmed_mismatch` pages that resolve to a rob-lane object, **it HELD on 8 of 8**. It is
answering a different question — *store* vs page, where theirs is *sidecar* vs page — so a
HOLDS from it must not be read as clearing the sidecar hazard. A check that has never been
seen to fail on known positives is not evidence.

## ⛔ A THIRD question, and it is the one that binds scoring

Neither their sidecar-vs-page nor my store-vs-page. **Sidecar vs store:**

| topic | sidecar `k` | store `k` | verdict |
|---|---|---|---|
| **`arni-hfref`** | 3 | 4 | ⛔ **DISAGREE** — sidecar-only `NCT01920711`, `NCT02924727`; store-only `NCT02468232`, `NCT04023227`, `NCT04853758` |
| **`sglt2-hf`** | 5 | 4 | ⛔ **DISAGREE** — sidecar pools `NCT03521934` (SOLOIST-WHF), the store does not |
| **`iv-iron-hf`** | 4 | 5 | ⛔ **DISAGREE** — store pools `NCT03036462` (FAIR-HF2), the sidecar does not |
| `sotagliflozin-hf` | 2 | 2 | AGREE |

**Three of four disagree.** If a page's sidecar pools a different set than its store
object, the pooled number a reader sees may come from either — which is the
reader-clicks-twice failure again, one artefact further in.

## ⚠️ `iv-iron-hf` — two independent failures, reported separately

1. **Surface gate (mine):** `fcm-hf-review` and `iv-iron-hf` record different randomised
   denominators for CONFIRM-HF — `[150, 151]` vs `[152.0, 152.0]`.
2. **Sidecar vs store (this check):** the store pools FAIR-HF2 (`NCT03036462`); the
   sidecar does not, and reports `k=4` against the store's 5.

Different artefacts, different quantities. Not one failure restated.

## ⛔ `arni-hfref` is PROTECTED and it is FLAGGED — reporting and stopping

Its sidecar pools 3 trials, its store pools 4, and **they overlap on only one**. I have
not touched it, not rebuilt it, and not scored it.

## ⛔ THE BLOCKER: two trees, same filenames, different artefacts

| page | rob-lane | rapidmeta-finerenone |
|---|---|---|
| `ARNI_HF_REVIEW.html` | 6,100,652 B | 912,140 B |
| `IV_IRON_HF_REVIEW.html` | 7,084,981 B | 905,921 B |
| `SGLT2_HF_REVIEW.html` | 3,862,693 B | 795,535 B |
| `SOTAGLIFLOZIN_HF_REVIEW.html` | 3,640,156 B | 904,657 B |

**All four differ in bytes and hash.** Their audit ran against the finerenone copies;
every artefact I have built — surface gate, tell-check, rubric offsets — used the rob-lane
copies. **A page NAME is not an artefact identity**, and here the same four names denote
eight different files.

### And my extraction is wrong for one of the two trees

Against the finerenone copies my assertion reported *every* sidecar id missing from
*every* page — which would make all four `confirmed_mismatch`, yet none is listed. That
contradiction was the instrument, not the pages: **those copies carry zero NCT ids in
visible text.** All of them live in
`window.RapidMeta.outcomeKeys = {"NCT03036124": …}` and are rendered client-side.

⭐ So *"appears on the page"* has two readings, and static extraction understates for a
JS-rendered build. **This does not overturn the TXA finding**: rob-lane pages do render
ids into static HTML (`SGLT2_HF_REVIEW.html` carries 49 visible), so a rob-lane page whose
HF ids were JS-only was anomalous in its own tree. It does mean my visible-only rule is
tree-specific and must be stated as such wherever it is used.

## What I need before any pair is scored

1. **Which copy is served** — rob-lane or finerenone. Everything downstream is keyed to
   the wrong one if it is finerenone.
2. **`arni-hfref`** — protected, flagged, stopped. Yours to sequence.
3. **`sglt2-hf` carries 9 of the 13 pairs and its sidecar/store sets disagree.** If that
   disagreement stands, the largest block of the run is scoring a page whose pooled set is
   ambiguous between two of our own artefacts.
