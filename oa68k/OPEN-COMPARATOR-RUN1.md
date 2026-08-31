# Open-access comparator frame, cardiology — first run

**Rule:** `oa68k/OPEN-COMPARATOR-PROTOCOL.md`, frozen at commit `fe1f2fd` and pushed
**before** the first comparator was retrieved. Nothing below changed a criterion, a
threshold, a term list or a trial set.

**Artefacts (all in `F:\claude-temp\pend\`):** `opencomp_frame_cardiology.jsonl`
(the frame) · `opencomp_frame_cardiology.RUN1.jsonl` (the first, defective build,
kept) · `opencomp_build.log`, `opencomp_build3.log` (the runs).

---

## The prediction, and how it missed

| | |
|---|---|
| predicted (§7, before the run) | **9** eligible — sglt2-hf 4, iv-iron-hf 2, arni-hfref 2, alirocumab-lipid 1, sotagliflozin-hf 0, bococizumab 0 |
| named direction of miss | **too HIGH** |
| measured | **22** eligible papers (23 paper–topic pairs) |
| actual direction | **too LOW, by 2.4×** |

⛔ **I named the direction and named it wrong.** The point estimate was 59% low. The
per-topic shape was also wrong in a way the total hides: I predicted 4 for `sglt2-hf`
and it returned **18**; I predicted 0 for `bococizumab-lipid-review` and it returned
**1**. Two of my six per-topic numbers were right (`sotagliflozin-hf`, near-miss on
`iv-iron-hf`), and the one I was most confident about — a discontinued drug with no
reason for anyone to review it — was the one that produced an eligible comparator.

**The reason is not subtle and it is not exculpatory.** I reasoned about the
conjunction of six gates and forgot the population size: `sglt2-hf` alone returns 460
candidate meta-analyses. A small survival fraction of a large population is not a
small number. I was estimating a *rate* and reporting it as a *count*.

---

## The zero, and what it measured

**The first build returned 0 eligible comparators.** Protocol §7 pre-committed that a
zero measures the instrument until proven otherwise, and that the question is settled
by hand-running a known-good example rather than by inspecting the frame that produced
the zero. Doing that found **three implementation defects**. None of them is a rule
change; the frozen file is untouched.

### 1. ⛔ The PROSPERO regex could not match any registration that exists

`CRD42\d{12}` — but a PROSPERO id is `CRD42` + **9** digits (`CRD42022358299`). The
pattern demanded a 19-character id where real ones are 14. It scored **0 of 108** read
papers as registered.

Hand-verified against three papers before touching the code:

| PMC | CRD token in the full text | old regex | new regex |
|---|---|---|---|
| PMC10946839 | `CRD42022358299` | — | ✅ |
| PMC11755955 | `CRD42024546540` | — | ✅ |
| PMC10517929 | `CRD42019131774` | — | ✅ |

**A 0% rate on one field beside a 100% rate on another is a harness signal, not a
finding.** Every one of the 108 was licence-open; every one was "unregistered". Real
differences are graded.

⭐ The corrected build scores **48 of 108 registered (44%)**, which is the rate the
literature would lead you to expect — and is the first evidence that the instrument is
now measuring anything at all. Rows now also carry `prospero_tokens_seen`, so a
malformed id in the paper (one review carries `CRD4202016054`, eight digits) stays
visible instead of silently becoming "not registered".

### 2. Network meta-analyses were folded into a design exclusion

PubMed's `"Meta-Analysis"[Publication Type]` **explodes to the narrower `Network
Meta-Analysis`[PT]**. My gate tested G1 before G2, so **128 NMAs** were filed as
`EXCLUDED_DESIGN / NOT_PT_META_ANALYSIS` — inside the general excluded bucket, which
is precisely the silent folding §1 forbids. The named stratum read **5**; it is
actually **133**.

This fix moves rows **between two excluded cells** and is provably eligibility-neutral.

### 3. Acronyms were matched against table captions, not the full text

Protocol §5.3 matches frozen trial acronyms over *the retrieved full text*. The
implementation searched only included-studies table captions, which is not the full
text and is not what the committed rule says. Corrected, case-sensitively.

### And one non-defect, named because it looks like one

`NO_ABSTRACT_CANNOT_EVALUATE_RCT_RESTRICTION` (24 rows) now exists so that records
with no abstract at all stop being reported as having *failed* a test that could not
be *run* on them. They remain excluded. Same distinction as `NOT_RETRIEVED_*` vs
`RETRIEVED_NO_VALUE`, one layer up.

### What was NOT changed, and why that matters more than what was

**G3 refuses 182 records** whose title and abstract never state a restriction to
randomised trials, and I can see from the titles that some of them are genuinely
trial-based — individual-participant-data meta-analyses in particular. **Loosening G3
after seeing the results could admit new eligible comparators, which is the definition
of the cherry-picking this protocol exists to prevent.** G3, the overlap thresholds,
the Stage-A term lists, the trial sets and the quality criterion are untouched.

Two of the three fixes (1 and 3) *can* raise eligibility and are disclosed as such.
Fix 2 cannot.

---

## The frame

**802 rows · 802 distinct PMIDs · 26 top-level keys · 27 provenance keys · 6,974,316 bytes**

### The denominator, by composition and not only by number

`candidates = 802` is composed of: **PubMed records returned by the six frozen Stage-A
queries of §5.2, deduplicated by PMID, with no date limit, no language limit and no
free-full-text filter.**

Per-topic query hits — these sum to 877, not 802, because 72 records are proposed for
more than one topic:

| topic | Stage-A hits |
|---|---|
| sglt2-hf | 460 |
| alirocumab-lipid | 152 |
| arni-hfref | 123 |
| iv-iron-hf | 82 |
| sotagliflozin-hf | 54 |
| bococizumab-lipid-review | 6 |

⛔ **This is not "cardiology meta-analyses".** PubMed holds **39,524** records under
`"Cardiovascular Diseases"[MeSH] AND "Meta-Analysis"[PT]`. That number is context for
how much of the specialty six drug-specific queries touch — **2.03%** — and it is the
denominator of **nothing** reported here. (I first wrote 50,861 in this document from
memory rather than from the file; it is 39,524, and the field
`provenance.cardiology_meta_analyses_in_pubmed` carries it in every row.)

⛔ **The free-full-text filter is deliberately absent from the query.** Including it
would silently redefine the population as "papers PubMed believes are free" and would
make the licence-open-but-unretrievable cell unobservable — the exact cell a prior
ladder was blind to when it scored 0 of 10.

### The partition, asserted before the file was written

| cell | n |
|---|---|
| `EXCLUDED_DESIGN` — no RCT restriction stated | 182 |
| `EXCLUDED_DESIGN` — no abstract, could not evaluate | 24 |
| `EXCLUDED_DESIGN` — observational in title | 14 |
| `EXCLUDED_DESIGN` — not a review record | 2 |
| `EXCLUDED_NMA` (named stratum, not folded) | 133 |
| `UNRETRIEVABLE` — no PMC full-text record | 283 |
| `EXCLUDED_NO_ENUMERATION` — read it, no included-study list | 56 |
| `EXAMINED` | 108 |
| **sum** | **802 = candidates** ✅ |

The builder refuses to write if this identity fails.

### Licence is not retrieval — the cell that exists because they are separate fields

**24 rows are `licence_open = true` AND `NOT_RETRIEVED_*`.** Openly licensed, and we
did not get the bytes. Under a single collapsed field those 24 would have been counted
either as available (wrong) or as closed (wrong). They are counted as what they are.

All 283 unretrievable rows failed as `NO_FULLTEXT_RECORD`; **zero** were
`NOT_RETRIEVED_BLOCKED`. Europe PMC did not bot-block us once — which is worth saying
plainly, because the 0-of-10 ladder's failure mode did not recur here and I would
otherwise have been tempted to claim credit for avoiding it.

**56 rows are `RETRIEVED_NO_VALUE`**: we read the full text and it carries no
included-study list under §4. That is a fact about those papers, and it is the same
condition Cochrane failed in run 1 — so it is not a Cochrane peculiarity. Roughly one
open-access meta-analysis in three that we could read does not enumerate what it
pooled.

### Among the 108 examined

| | n |
|---|---|
| licence-open | 108 / 108 |
| PROSPERO-registered | **48** (44%) |
| `MATCHED` | 47 |
| `NO_COUNTERPART` | 40 |
| `MATCH_UNDECIDABLE_NO_TRIAL_IDS` | 21 |
| **eligible comparators** | **22** |

Enumeration route: 87 via an included-studies table, 21 via registry identifiers.
`enumeration_vs_stated`: 17 COMPLETE, 3 PARTIAL, 88 STATED_K_UNKNOWN — the last is my
parser failing to find a stated k, not the papers failing to state one.

### Eligible comparators, per topic

| topic | predicted | eligible |
|---|---|---|
| sglt2-hf | 4 | **18** |
| sotagliflozin-hf | 0 | **2** |
| arni-hfref | 2 | **1** |
| iv-iron-hf | 2 | **1** |
| bococizumab-lipid-review | 0 | **1** |
| alirocumab-lipid | 1 | **0** |

`alirocumab-lipid` returning 0 is the failure §5.3 predicted in advance and it is
**ours, not the comparators'**: our alirocumab trials carry no acronym and no PMID in
the corpus SSOT, so they join on NCT identifiers alone.

---

## ⚠️ The measured weakness of the match, and the number it moves

The frozen rule accepts a trial acronym appearing **anywhere in the retrieved full
text**. Auditing `overlap_detail[topic].key_used`, that turns out to find *mentions*,
not *inclusions*. `DELIVER` fired on 14 papers; hand-reading three of them:

- PMID 33586910 (2020) — *"Two ongoing SGLT2 inhibitor trials … and DELIVER"*. A
  mention of a trial that had not reported. **Not an included study.**
- PMID 35338608 (2022) — *"In addition to the ongoing DELIVER study"*. Same.
- PMID 37773799 (2023) — *"including DELIVER and EMPEROR-Preserved trials"*. A
  genuine inclusion.

The same mechanism can affect an NCT identifier: the 2020 paper's sentence carries
`NCT03057951` inside the very phrase that says the trial is ongoing.

**I have not changed the rule to fix this.** Tightening the join after seeing the
results is post-hoc even when it moves the number down, and the frozen rule is what
the frame reports. What the frame does instead is record **which key produced every
single trial-level match**, so the stricter join is a filter rather than a rebuild:

| join key admitted | paper–topic pairs | distinct papers |
|---|---|---|
| **frozen rule** — NCT, cited PMID or acronym | 23 | **22** |
| NCT or cited PMID only (drop acronym-only) | 13 | **12** |
| cited PMID only (strongest evidence of citing the trial's report) | 8 | **8** |

⭐ **The headline 22 is the frozen rule's answer. If the head-to-head wants a join
that cannot be satisfied by a passing mention, the number is 12, and that filter runs
on the existing file.** That choice is about how hard the comparator should be, which
is Mahmood's call, not ours.

---

## Checks: every one watched to fail

`oa68k/opencomp_plant.py` plants each check's violation **in the real frame file on
disk**, requires the check to fail, restores the file byte-for-byte and requires it to
pass again. **8 of 8 watched to fail and restored, bytes identical.** Plus a synthetic
mirror in `oa68k/tests/test_opencomp.py` — 10 passed, including a case that runs every
check against the real frame.

| check | planted violation | fired |
|---|---|---|
| `check_partition` | a disposition outside the partition | ✅ |
| `check_provenance_in_every_row` | provenance stripped from the **last** row | ✅ |
| `check_no_empty_strings` | `""` masquerading as a value | ✅ |
| `check_absence_requires_retrieval` | `NO_COUNTERPART` on a paper we never opened | ✅ |
| `check_licence_is_not_retrieval` | a licence-open unretrievable row promoted to `EXAMINED` | ✅ |
| `check_denominator_composition_recorded` | composition replaced by the label "cardiology" | ✅ |
| `check_eligible_implies_every_criterion` | eligibility asserted from none of its parts | ✅ |
| `check_pmid_unique` | one comparator counted twice | ✅ |
