# SCORING-HARNESS — frozen 2026-09-01, BEFORE any pair was scored

`rubric.py` freezes the six criteria and stamps its own sha256 on every row. **It does not
freeze what the criteria SEE**, and that is enough to change every verdict.

Measured on synthetic strings, same text, same sha-pinned criterion:

    study_labels = ['DAPA-HF','EMPEROR-Reduced']                -> SATISFIED
    study_labels = ['DAPA-HF','EMPEROR-Reduced','SOLOIST-WHF']  -> NOT_SATISFIED
    study_labels = ['DAPA-HF']                                  -> SATISFIED

⇒ **A FROZEN CRITERION FED BY AN UNFROZEN HARNESS IS NOT A FROZEN RUBRIC.** Two people could
run the identical rubric and get different scores, and neither would see why, because the
criteria functions are byte-identical on both sides. *The instrument is right; the thing
feeding it decides the answer.*

This file freezes the feeding. It is pre-registration, exactly as the criteria were.

---

## ⛔ AMENDMENT 1, 2026-09-01 — SYMMETRIC CODE IS NOT A SYMMETRIC RULE

The first implementation ran ONE function over both sides and still built the asymmetry in.
Measured on `ablation-af-heart-failure` vs PMID 40998847:

    ours   k=4   NCT00643188 …   the page's INCLUDED trials
    theirs k=2   NCT05508256 …   "Ongoing RCTs, such as (CABA-HFPEF; NCT05508256) and
                                  (STABLE-SR IV; NCT06125925), may provide more definitive
                                  evidence" — trials it explicitly does NOT include

Our pages print a registry id per included trial; their papers print registry ids mainly for
trials they are **not** including. Same code, both sides, **different kinds of thing**.

⇒ **THE RULE WAS SYMMETRIC AND THE MEANING WAS NOT.** The clause below is therefore about
what is EXTRACTED, not about which function runs.

**The rule, in one line:** *a study label is a registry identifier the document declares
whose own sentence does not mark it as ongoing, planned, future or excluded; fewer than two
such identifiers is `NOT_SCOREABLE_NO_STUDY_LIST`.*

⚠️ This is deliberately conservative and will refuse many comparators. That refusal is a
**PRISMA 2020 item 17 finding about them**, reported as a headline count — not a low score,
and it applies to our pages identically.

## ⛔ AMENDMENT 2, 2026-09-01 — §5.2 COVERS SIX TOPICS; THE PROGRAMME HAS FOURTEEN

`S2_estimand` requires `topic_terms`, and its docstring binds them to the vocabularies
**frozen in OPEN-COMPARATOR-PROTOCOL.md §5.2 — "no new list is introduced here"**. §5.2
covers `sglt2-hf`, `sotagliflozin-hf`, `arni-hfref`, `iv-iron-hf`, `alirocumab-lipid`,
`bococizumab-lipid-review`. The comparator set covers **fourteen** topics.

⇒ For a topic outside §5.2, `topic_terms` **cannot be built without introducing a new list**,
which S2 forbids. The state is **`NOT_SCOREABLE_NO_FROZEN_TOPIC_TERMS`**, and it is a
declared limit of the protocol rather than a property of either document.

⚠️ AND §5.2 DISCLOSES ITS OWN BIAS, which must travel with every S2 result: *"the topic term
lists in §5.2 were written by someone who already knew which trials our reviews pool, so they
are tuned to find our questions. They are not tuned to any comparator."* **S2 is therefore
the one criterion with a known pro-us tilt, and it is stated, not corrected** — correcting it
would introduce the new list §5.2 forbids.

## ⛔ AMENDMENT 4, 2026-09-01 — A STUDY LABEL IS ANY COORDINATE FORM THE ARTEFACT DECLARES

§5.3 declares each of our included trials as **three coordinate forms of one study**:

    NCT03036124 DAPA-HF 31535829      registry id · acronym · PMID

⇒ **A label rule that accepts any of them is faithful to what the artefact declares. A rule
that picks a single form imposes a convention the protocol never stated.** §5.3 does not
nominate a canonical form; it prints all three as equally the study's name.

**And it is the SYMMETRIC choice.** A comparator's included-studies table prints whatever
form that paper uses — an acronym, an author-year, a registry id — and the harness already
takes their labels as printed. Accepting any declared form on our side treats both sides the
same way; insisting on registry ids for us while accepting anything for them would be the
asymmetry Amendment 1 exists to prevent, re-entering through the other door.

**Implementation, and the constraint that fixes it:** S3 and S7 are CONJUNCTIONS over the
label list, so passing three forms of one study as three labels would demand a numeric row
near *each* form — stricter than the criterion means and wrong. ⇒ **One label per declared
study: whichever of its coordinate forms the document actually uses.** `k` is unchanged and
equals the number of declared studies.

⚠️ **ORDER OF RECORD.** This amendment was written after observing that a registry-id-only
rule produced `S7 NOT_SATISFIED` on 9 of 9 of our own pages while those pages name a
risk-of-bias tool and carry 21–53 risk-of-bias level statements beside trial ACRONYMS. **The
justification above is stated in terms of §5.3's declaration and not in terms of that
effect**, and this file is committed BEFORE the re-run so the commit order is the evidence
that the form was not chosen for the number it produces.

## THE BINDING CLAUSE

⛔⛔ **THE SAME RULE MUST EXTRACT BOTH SIDES.** If our labels came from our curated
`our_trials` and theirs from a parse of their text, the asymmetry would be built into the
instrument and **every score would inherit it** — we would be comparing a curated list against
a parsed one and calling the difference quality.

Our curated list is therefore **not used**. Both sides are parsed, by one function.

---

## THE THREE INPUTS

    study_labels   registry identifiers (NCT / ISRCTN / ChiCTR) the document declares,
                   MINUS any whose surrounding sentence marks it as ONGOING, PLANNED,
                   FUTURE or EXCLUDED. Fewer than two survivors -> NOT_SCOREABLE_NO_STUDY_LIST.
                   ⭐ REUSED, NOT REIMPLEMENTED. This is the same function, and the same
                      `registry_ids` field, that produced `enumerates_included_studies` and
                      `enumeration_via` in the published frames. A second extractor would be
                      a second standard, exactly as a second scorer would be.

    k              len(study_labels)
                   ⭐ DERIVED FROM THE SAME LIST, never from a separate count, so k and the
                      labels can never disagree.

    topic_terms    the FROZEN topic definition in TWENTY_COMPARATORS.json (`topic`,
                   `drug_family`), never re-derived per pair.

## WHY REGISTRY IDS AND NOT ACRONYMS OR TABLE ROWS

* **Acronyms are ruled out already.** `TWENTY_COMPARATORS.json._join` records that a trial
  ACRONYM "was measured to find MENTIONS rather than INCLUSIONS and was ruled out". That
  ruling is inherited here rather than re-argued.
* **`included_studies_table` yields a ROW COUNT, not labels.** S3 and S7 search each label as
  a literal string in the text (`re.escape(lab)`), so a row count cannot feed them. Using the
  table count for `k` while using registry ids for the labels would let the two disagree —
  which is the defect this file exists to close.
* **Registry ids are strings that literally appear in the document**, which is precisely what
  the criteria require, and the same regex reads our HTML and their JATS XML.

## THE REFUSAL STATE, AND IT IS A FINDING NOT A FAILURE

Where a document declares **fewer than two registry identifiers**, the label-dependent
criteria (S3, S4, S7) return the rubric's own **`NOT_SCOREABLE_NO_STUDY_LIST`**.

⛔ **This is never scored as a low score.** PRISMA 2020 item 17 requires an included-study
list; a paper that does not enumerate one has failed a reporting standard, and saying so is a
finding about that paper. **`n` in this state is a headline number in its own right** — the
published frames already measure 136 of 289 assessed papers enumerating nothing.

⚠️ It applies symmetrically. If one of OUR pages declares fewer than two registry ids, our
side is `NOT_SCOREABLE_NO_STUDY_LIST` too, and it is reported, not excused.

## WHAT IS NOT FROZEN HERE, AND IS THEREFORE NOT USED

Anything requiring judgement about which studies "should" have been included; any
reconciliation between a document's registry ids and our curated trial list; any
per-pair tuning of the extraction. If a pair needs one of those, it is not scoreable by this
harness and says so.

---

## VERSION

    HARNESS_VERSION  scoring-harness-1.0.0-2026-09-01
    frozen           before any pair was scored
    depends on       opencomp.parse_fulltext  (registry_ids field)
                     rubric.py  RULE_VERSION rubric-1.0.0-2026-08-31

⛔ **THE RUBRIC'S FILE SHA CHANGED AND ITS `RULE_VERSION` DID NOT. RECORDED, NOT HIDDEN.**

    before release   sha256 f887eec5…5ef8c4
    after release    sha256 1ef22ec9…23a1e1

Releasing `--score` edited the CLI banner only; **not one criterion changed** and the
selftest is 14/14 before and after. `RULE_VERSION` is the identity of the CRITERIA, so it
correctly did not move — but that means **the same declared version now names two different
files**, which is the shape of an instrument certified in one configuration and run in
another. Any result must therefore stamp the **file sha**, not the version string, and
`rubric.py` already does exactly that on every row.

⚠️ A reader checking `f887eec5…` against a post-release checkout will find a mismatch. That
is this line's whole purpose: the mismatch is expected, dated, and explained here.
