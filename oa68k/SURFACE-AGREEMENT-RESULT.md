# Surface agreement — the last gate before the scored run

**Protocol:** `SCORING-PROTOCOL.md` §2B. **Join-independent** — computed for all 23
union pairs; the per-join line is a filter. **No pair has been judged.**

**Artefacts (`F:\claude-temp\pend\`):** `surface_index.json` (254 KB) ·
`surface_agreement.json` (10.8 KB).

---

## Result under the ruled join

| join | pairs | scoreable | `NOT_SCOREABLE_SURFACE_DISAGREEMENT` |
|---|---|---|---|
| frozen | 23 | 22 | 1 |
| **`nct_pmid` (RULED)** | **13** | **12** | **1** |
| cited_pmid | 8 | 7 | 1 |

| topic | page that describes it | k | verdict |
|---|---|---|---|
| `sglt2-hf` | `SGLT2_HF_REVIEW.html` | 4 | OK |
| `arni-hfref` | `ARNI_HF_REVIEW.html` | 4 | OK |
| `sotagliflozin-hf` | `SOTAGLIFLOZIN_HF_REVIEW.html` | 2 | OK |
| `bococizumab-lipid-review` | `BOCOCIZUMAB_LIPID_REVIEW.html` | 6 | OK |
| **`iv-iron-hf`** | `IV_IRON_HF_REVIEW.html` | 5 | ⛔ **`NOT_SCOREABLE_SURFACE_DISAGREEMENT`** |

### The one real finding

```
C2 DENOMINATOR_DISAGREEMENT
  trial         NCT01453608 (CONFIRM-HF)
  iv-iron-hf    participants [150, 151]
  fcm-hf-review participants [152.0, 152.0]
```

**Two of our own surfaces publish different randomised denominators for the same trial.**
Events may legitimately differ by outcome; the number randomised may not. Anything pooled
from those arms diverges between the two pages, which is exactly the reader-clicks-twice
failure. `iv-iron-hf` is out of the scored run until it is reconciled — as a **named
state, not a loss**, and its row stays in every denominator.

⚠️ Note the types as well as the values: `[150, 151]` against `[152.0, 152.0]` — one
surface holds integers, the other floats. Whatever produced them was not the same path.

**Population, kinds named before the number:** 1,491 rendered pages (754.3 MB of
`.html`/`.js` at the corpus root) and **155 topic objects** — the `ssot/` directory holds
158 entries, of which `__pycache__`, `figs` and `registration` are not topics. Three
non-topic directories, not a three-object shortfall.

---

## ⛔ Two defects in my own check, both caught by results I refused to accept

### 1. The join was mis-pairing, and it returned 0 of 13 — a 100%, so an instrument reading

The first version called a page a surface of topic T whenever they shared ≥2 trials.
It judged `FCM_HF_REVIEW.html` against `iv-iron-hf`, `SGLT2_HF_REVIEW.html` against
`sotagliflozin-hf`, and the corpus index `LivingMeta.html` against everything. **That is
the malaria-ACT-versus-folic-acid mis-pairing occurring inside our own check**, and it
declared every pair unscoreable.

⚠️ **Narrowing a check after it fires on everything is the same shape as loosening a gate
after it refuses too much, and I have to justify it as more than a tune.** I can: the fix
is evidenced by *named mis-assignments* to objects those pages demonstrably do not
describe, and **C2 — the check that found the real defect — is untouched by it. The topic
with a genuine defect was not rescued.**

### 2. The index read SOURCE, not RENDERED TEXT — and the artefact of that is itself a finding

After the join fix, `sglt2-hf`'s best-matching page came back as
**`TXA_NONCARDIAC_SURGERY_REVIEW.html`** — "RapidMeta Surgery | TXA Non-Cardiac Surgery".
⭐ **An OK obtained from a wrong join is worse than a failure**, so I read the page:

```js
AUTO_INCLUDE_TRIAL_IDS = new Set(["NCT03036124","NCT03057977","NCT03057951",
                                  "NCT03619213","NCT03521934"])
```

**Five heart-failure registrations hardcoded in a tranexamic-acid surgery page's
JavaScript.** My index matched raw bytes, so a template constant counted as published
content — **my own rule, verify against rendered text and never source, which I own and
did not apply.** The index now strips `<script>`/`<style>` and tags first, and keeps
script-only identifiers in a `script_only` field rather than discarding them.

⭐ **Report to the peer lane: `TXA_NONCARDIAC_SURGERY_REVIEW.html` carries five SGLT2/HF
trial identifiers in a JS constant.** It is not reader-visible, so it is not a surface
disagreement — but it is a cross-topic contamination route in a shared template, and it
is the kind of thing that becomes one after the next render change.

### The unplanned control that came out of the fix

With reader-visible text and best-coverage assignment, **all five topics resolved to the
page whose filename matches them** — `SGLT2_HF_REVIEW`, `ARNI_HF_REVIEW`,
`SOTAGLIFLOZIN_HF_REVIEW`, `BOCOCIZUMAB_LIPID_REVIEW`, `IV_IRON_HF_REVIEW` — **with no
keyword input at all**, purely from trial identifiers. Five of five agreeing with the
obvious human answer, arrived at without being told the names, is the closest thing to a
validation of the join that this corpus offers.

---

## Checks: 4/4 planted, watched to fail, restored byte-identical

| check | planted | fired |
|---|---|---|
| C1 `ORPHAN_TRIAL` | `NCT03619213` removed from the visible text of every page while the object still pools it | ✅ |
| C1 `NO_PAGE_SURFACE` | every trace of a topic's trials removed from every page | ✅ |
| C2 `DENOMINATOR_DISAGREEMENT` | a sibling object given different denominators for a shared trial | ✅ |
| no silent exclusion | one pair dropped from the result without reaching any denominator | ✅ |

⛔ **The corpus worktree was not mutated.** Writing a defect into a corpus we do not own,
to prove our own check, is not a trade worth making; the plants go into the index and
result files this harness owns, which is what the checks actually consume.
