# Second frame: infectious disease — **1 comparator / 1 topic**

**Criteria unchanged.** `opencomp.py` byte-identical (`git diff` empty); `opencomp_id.py`
replaced only the §5.2/§5.3 topic tables, frozen and pushed at `7ad2538` **before** the run.
**Frame:** `F:\claude-temp\pend\opencomp_frame_id.jsonl` — **664 rows · 664 distinct PMIDs ·
26 keys · 27 provenance keys · 6,150,179 bytes.** Nothing scored.

---

## ⭐ The number, always as a pair

| specialty | comparators | independent topics | pairs |
|---|---|---|---|
| cardiology (ruled `nct_pmid` join) | **12** | **4** | 13 |
| infectious disease | **1** | **1** | 1 |
| **combined toward the target** | **13** | **5** | 14 |

⛔ **We are short of twenty.** 13 of 20. **The join is not being revisited** — that was
pre-committed in the addendum before this ran, precisely so this outcome could not
reopen it.

## The prediction, scored

| | |
|---|---|
| predicted | **18** comparators across **8** of 12 topics |
| measured | **1** comparator, **1** topic (`nirsevimab-infant-rsv-review`) |
| direction named | **too HIGH** — correct |
| magnitude | **18× too high**, and outside my own stated range of 6–30 |

⭐ I named the direction right for the first time tonight, from measured evidence (the
NCT-only key channel), and still missed the magnitude by more than an order of magnitude.
**Naming the direction is not the same as knowing the size, and I should not present it as
if it were.**

## The partition, asserted before writing

| cell | n |
|---|---|
| `EXCLUDED_DESIGN` | 422 |
| `EXCLUDED_NMA` (named stratum) | 52 |
| `EXCLUDED_NO_ENUMERATION` | 23 |
| `UNRETRIEVABLE` | 106 |
| `EXAMINED` | 61 |
| **sum** | **664 = candidates** ✅ |

12 rows are **licence-open AND unretrievable** — the cell that only exists because those
are separate fields.

## Why it is 1, and the instrument is not at fault

Among the **61 examined**: licence-open **61/61**; PROSPERO-registered **33 (54%)** —
comparable to cardiology's 44%, so the quality instrument is measuring normally.

| `match_status` | n |
|---|---|
| `NO_COUNTERPART` | 34 |
| `MATCH_UNDECIDABLE_NO_TRIAL_IDS` | 23 |
| `MATCHED` | **4** |

Of the 33 licence-open **and** registered, exactly **1** matched.

**Two pre-declared constraints did the work, and both were named in the addendum before
the run:**

1. **The NCT-only key channel.** 23 of 61 examined recovered no registry identifier at all
   — ID meta-analyses cite trials by author-and-year far more often than cardiology's
   acronym-heavy trials. **That is our key table's gap, not the comparators'.**
2. ⭐ **Small k makes the threshold far harsher here.** `≥2 AND ≥50%` means that for a
   **k = 2** topic a comparator must contain **both** our trials — 100%. Four of the twelve
   ID topics are k = 2 and three more are k = 3. In cardiology, k = 4–5 let a comparator
   qualify on 2 of 4. **The same rule is a much higher bar in this specialty, and it is a
   property of our topics rather than of the rule.** Recorded as a finding; the rule is not
   being adjusted.

## ⛔ A finding about the quality criterion — recorded, not adjusted

**Two of the four `MATCHED` comparators are Cochrane reviews**, matched at **3 of 3** on
`rotavirus-vaccine-africa-review`:

| PMID | journal | overlap | PROSPERO |
|---|---|---|---|
| 31684685 | *The Cochrane Database of Systematic Reviews* | 3/3 | **false** |
| 30912133 | *The Cochrane Database of Systematic Reviews* | 3/3 | **false** |
| 31584679 | *JAMA Network Open* | 3/3 | false |
| 40313952 | *Frontiers in Immunology* | 2/2 | **true** — `CRD42025629937` |

⚠️ **Our PROSPERO criterion excludes Cochrane reviews** — Cochrane registers protocols in
its own library, not in PROSPERO. So the frame found Cochrane as the **best-matching
comparator** on a topic, and the quality rule excluded it **for a reason unrelated to the
enumeration problem that drove us off Cochrane in the first place.**

This is exactly the case the instruction anticipated: *if a criterion behaves badly in the
new specialty, that is a finding about the criterion, recorded — not an adjustment.* It is
recorded. §3 of the protocol already says the criterion should be read as **"prospectively
registered"** and nothing more; this is what that disclaimer looks like when it bites.

**The single eligible comparator:** PMID `40313952`, *Frontiers in Immunology*,
"Effectiveness of nirsevimab immunization against RSV infection in preterm infants",
matched 2/2 on NCT identifiers, `CRD42025629937`.

## What would reach twenty, and what would not

⛔ **Not**: reopening the join, loosening `≥2 AND ≥50%`, or dropping the PROSPERO
criterion. Each would be choosing a rule to hit a target after seeing the result.

Available without touching a criterion:
1. **More ID topics.** Twelve of 35 shortlisted were used; several excluded topics
   (`lenacapavir-prep`, `lenacapavir-hiv`, `delamanid-tb`, `rifapentine-tb`,
   `bezlotoxumab-cdi`, `influenza-recombinant`, `raltegravir-hiv`, `doravirine-hiv`,
   `sarilumab-covid`, `anidulafungin-candida`) are eligible for a third pass on the same
   frozen criteria.
2. **A third specialty.** The corpus holds 155 topic objects; cardiology and ID together
   used 16.
3. ⭐ **Prefer larger-k topics.** The binding constraint is arithmetic: k = 2 demands a
   perfect overlap. Topics with k ≥ 4 clear the bar on half their trials. Selecting future
   frames toward larger k is a **selection** decision about which of our reviews to enter,
   not a change to how comparators are judged — but it must be declared in advance, and I
   have not made it.

⚠️ **Whether 13 well-founded comparators beats 20 loosely-founded ones is Mahmood's call,
not mine.** I will say only that the 13 survive the reason we abandoned Cochrane, and that
a 20 assembled by relaxing the join would not.
