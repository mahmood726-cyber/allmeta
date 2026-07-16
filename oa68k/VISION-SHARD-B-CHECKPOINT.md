# Vision shard B — checkpoint, 2026-07-17 (~01:30)

Lane: shard B (`local_…`), writing `data/visionstore/calls.shard-B.jsonl`.
Owner's store `calls.jsonl` **never written**. Shard A read-only.

## Throughput

| metric | value |
|---|---|
| figures read (calls) | **151** |
| records (2 roles/call) | 299 |
| integrity (blob re-hash) | **OK** |
| ingest failures | 1 — an orchestrator-invented path (see own-error 5), no data lost |
| study rows captured | 1,749 |
| all rows captured | 2,720 |
| elapsed | ~2h 20m (≈65 figures/h at 7–9 agents; zoomed reads are slower and worth it) |

`call_group` — not row count — is the call count. Two roles per bought call.
**Reporting rows as calls would double our own throughput number.**

## Confidence gradient (ALL rows, per call — not per record, not study-only)

`high 2083 | medium 172 | low 49 | ABSTAIN 97` → **6.1% of all rows** at
low/ABSTAIN (2.5% if you look only at study rows — **a subset, see below**).

**This gradient is real but it is NOT a reliability estimate — see FINDING 1.**
It is the model's *self*-report, and FINDING 1's failure mode is invisible to it.

### v1 native vs v2 zoomed — the accidental natural experiment

| cohort | figures | rows | low+ABSTAIN |
|---|---|---|---|
| **v1 native** | 75 | 1656 | **8.7%** |
| **v2 zoomed** | 55 | 729 | **0.3%** |

Zoomed readers abstain ~30× less. Two readings, and they are not equivalent:
(a) zoom genuinely makes the figure legible, so the confidence is earned; or
(b) zoom induces overconfidence. The evidence favours **(a)**: zooming
*corrected* known errors (the 7.7-vs-12 mean, the dropped minus sign), and the
reject option still fires under v2 when it should — one reader abstained at
**26×** because two candidate readings both reconciled the printed total, so
"not even the checksum could settle it." **But this cannot be settled from
self-reports alone**; sizing the v1 error rate needs a v2 re-read of a v1 sample
(see Next).

---

## FINDING 1 — ⚠ THE LEGIBILITY FLOOR. Native reads bank wrong digits at "high".

**92.6% of the cached corpus (503/543) is under 800px wide.** At that size these
figures are below the legibility floor, and *a too-small image does not announce
itself*. Two subagents discovered this independently, unprompted:

- **PMC12560356** (669px): at native size read "Bizino 2019" mean = **7.7** —
  that is the **SD**; the mean is **12**. Zoomed 5× LANCZOS: correct.
- **PMC12619315** (798px): zooming "corrected four values I had misread at
  native size, **including a dropped minus sign on a CI bound**" — a sign error
  reverses the direction of an effect.

This is the 47.1%-wrong-at-high-confidence failure reproducing *inside our own
vision run*. **Rule "abstain if you cannot read it" does not save you**: it only
fires when the reader KNOWS it cannot read. A misread digit at 669px is read
fluently and confidently. Abstention cannot catch what does not feel uncertain.

### FINDING 1b — ⚠⚠ LOW-RES READS CONFABULATE WHOLE FIGURES. REPRODUCIBLE, n=2.

The worst case is not a wrong digit. **Two independent readers, two different
papers, same failure — neither prompted to look for it:**

**(i) `PMC12709776 / 12967_2025_7415_Fig5` @ 2.99×.** Returned a complete,
internally coherent meta-analysis that is not in the image: a "Study / Events /
Total / Proportion" table of 34 studies, `Random effects model 34188`, pooled
**0.529 [0.442; 0.616]**, **I² = 99.6%**, **τ² = 0.0688**. The actual figure is an
**odds-ratio forest of 37 studies** (Puts 2005 → Zhang 2024, I² = 81.8%). **Same
file bytes — md5 verified.** The 8× crop exposed it; the read was discarded.

**(ii) `PMC12752444 / 12894_2025_2005_Fig3` @ 2.21×.** Returned a fabricated
Stata-style WMD plot with studies *Borland / Christle / Kato / Malmo / Osbak /
Wahlström*, **I² = 61.6%, p = 0.016**. Fig3 is in fact the same meta-package
layout as Fig2 with the same five GLP-1 studies. Caught at 5× band crops.

**n=2 makes this a property of the method, not an anecdote.** Note the failure
scales with *how far below legibility* the read is (2.2× and 3.0× both failed),
and that **2.2× "felt adequate"** to the reader. Note also that the fabricated
study names in (ii) are plausible surnames from this literature — the model is
not emitting noise, it is emitting **the most likely figure given a blur**, which
is exactly what makes it undetectable downstream.

Note what is fabricated: not a smudged digit, but a *self-consistent artefact* —
a plausible pooled estimate with a plausible CI and a plausible τ², none of which
exist. **Nothing downstream could ever have flagged it.** It has the right shape,
it passes every internal check, and its own reader rated it confidently. A
checksum cannot catch it (the fabricated totals reconcile with the fabricated
rows). Only *more pixels* caught it.

**This is direct evidence that (a) the zoom protocol catches real fabrication,
not merely illegibility, and (b) the ~3× ceiling from whole-figure upscaling is
genuinely unsafe.** It also means the v1 native cohort is not just "noisier" —
it is capable of whole-figure confabulation, and we cannot tell which v1 figures
are affected without re-reading them. Treat every v1 record as **quarantined**,
not merely provisional.

**Consequence for the store, stated plainly:** all **72 figures banked so far are
v1 = NATIVE-resolution reads** and must be treated as **provisional**. They are
tagged `prompt_version=…@2026-07-16+abstain+per_field_conf` (v1). From batch 30
on, the spec **mandates** ≥4× LANCZOS upscaling and a `read_method` field; those
records tag `…@2026-07-16-v2+mandatory_zoom+no_checksum_backsolve`.
**v1 and v2 are different measurements and must never be pooled silently.**

Upscaling adds no information — it makes information that is already there
legible to the renderer. Not enhancement, not imputation.

## FINDING 2 — the shard collision was STRUCTURAL, not accidental

Both lanes were told (1) "A works bottom-up, B top-down" *and* (2) "PRIORITISE
MALARIA, TB, NCD". (2) is a **content** order, (1) a **positional** one. Both
lanes obeyed (2) — the louder rule — so both marched onto the *same* figures, and
not just any figures: **the scarcest, highest-value ones**. Shard A's ledger
proves it: its first 20 images are all TB/MALARIA/NCD, timestamped in that order.

- ≥8 images were paid for **twice**. The `(sha, role)` guard refused the double
  *write* — but a write-time guard fires **after** the call is bought.
- **A convention is not a lock.** `nextbatch.py` now reads every other lane's
  ledger from disk each wave and claims work at *dispatch* time (`_inflight.json`).
- Territory is now set by A's **observed behaviour**, not its stated rule:
  shard B took `topic=OTHER` (238 remaining), which A reaches last.

**TB + MALARIA are now fully covered across both shards** — the priority target
is complete (TB was our 0: 3 figures, 19 trial rows).

## FINDING 3 — the duplicates are an ASSET. Do not let the merge eat them.

The collision produced the one thing a never-read-twice store can never make:
**two independent reads of the same pixels** (17 images). A single-read store has
**no measure of its own reliability** — every number in it is unreplicated.

A merge keeping one row per `(sha, role)` would destroy this while looking like
tidying. `compare_dupes.py` scores it. **Caveat that must travel with the number:**
same model + same prompt ⇒ correlated errors, so agreement bounds reliability
*optimistically*. Disagreement is strong evidence of a problem; agreement is weak
evidence of correctness. Never call it "validated".

*Already visible:* on the malaria figure A recorded Baptista `weight=10.0`, B
recorded `16.7`. **Neither is wrong** — the plot prints *two* weight columns
(common and random). A took common, B took random. Same pixels, both defensible,
different numbers. A schema that says "weight" without saying *which* weight
manufactures a disagreement that is really an ambiguity.

## FINDING 4 — `figscan` over-calls forest. Detector precision is not 100%.

`figscan` labels all 543 cached figures `kind="forest"`. Vision says **7/72 are
`not_a_forest_plot`** — rows that are outcomes of one cohort, or subgroups of a
single trial (evidence: "subgroup denominators sum back to the 662 total").
A caption-based detector cannot see this; only reading the plot can.

**Taxonomy gap flagged by a subagent:** the enum has no value for *"a real forest
plot, but of pooled/treatment-level estimates"* (NMA nodes, pooled subgroup
proportions). Forcing those to `not_a_forest_plot` understates them. Their rows
are transcribed as `other`/`subtotal` so nothing is lost pending a fix.

## FINDING 5 — model is unprinted on 28/72 figures (39%)

`model printed: random 38 | fixed 6 | **null 28**`. Rule 3 holds: τ²/I² presence
is **not** evidence of a random-effects model. Every one of those 28 is an honest
`null` + `ABSTAIN`, not an inference. A pipeline that infers "random" from a
printed τ² would silently fabricate the model on 39% of this corpus.

## FINDING 6 — a checksum verifies; it must never impute

One subagent resolved an ambiguous digit as 65 *"since only that value
reconciles the printed 670 control-arm total"* — **back-solving**. Disclosed and
marked medium (honest), but it destroys the checksum: a cell derived from the
total can never afterwards be *checked* against that total. Spec rule **4a** now
bans it — null + ABSTAIN + note the total. Contrast, same night: another agent
refused exactly this ("my candidate reading disagreed with the printed *Total
events = 95*; **I did not back-solve it**").

## FINDING 7 — ⚠ the renderer caps at 2000px: whole-figure zoom is self-deception

Flagged by a subagent, then **verified directly**: a 669px figure upscaled 6× to
4014px was reported back by the image tool as *"original 4014x2388, **displayed
at 2000x1190**"* — i.e. **2.99× effective, not 6×**. The downscale is silent.

So on this corpus (92.6% sub-800px) **whole-figure upscaling can never exceed
~3×**, however large a factor you pass — the budget is spent on empty pixels. Real
resolution is only bought by **cropping to a panel/row-band and sizing that crop
to land at ~2000px**. Spec updated; `read_method` must state the *effective*
factor achieved, not the factor requested.

This compounds FINDING 1: an agent told to "zoom 6×" that upscales the whole
figure believes it has zoomed 6× and has in fact read a 3× image — a *second*
layer of confident-but-wrong, this time in the mitigation rather than the data.

## Own-error log (found and fixed in this lane, tonight)

1. **Gradient double-counted.** Summed over *records*; both roles carry the whole
   doc ⇒ every study row counted twice (24 where 12 were read). Now per
   `call_group`. Inflating your own denominator is the error we hunt in others.
2. **`compare_dupes` fabricated a finding.** v1 understood only B's schema, saw 0
   study rows in every A record, and reported *"70% disagreement on figure_kind"*.
   Pure artefact — A uses `trials[]`/`weight_pct`/`forest_continuous`.
   **The anti-fabrication tool fabricated.** Fixed with a cross-schema adapter;
   verify a comparator can SEE both sides before believing it.
3. **`prompt_version` lie.** `ingest_raw` computed the right version into `pv`
   then stamped the v2 constant anyway (dead variable) — 76 native records
   labelled as zoomed. The warning comment sat 3 lines above the bug. *Writing a
   rule down does not execute it.* Repaired from evidence (`repair_promptver.py`,
   audit trail per record, pre-repair copy kept).
4. **Basename vs full path** — subagents return `image_file` either way; a strict
   match silently *dropped* bought calls. Normalised at lookup; raw untouched.
5. **The orchestrator imputed.** I hand-typed figure paths into two dispatch
   prompts from a *truncated* planner listing and **invented three files** —
   wrong journal, wrong article, nonexistent. Both subagents refused to
   substitute (*"no object was written rather than guessing a substitute file"*)
   — the reader's discipline caught the orchestrator's. This is the same
   imputation the spec bans, committed one layer up: **a human retyping paths IS
   a paraphraser between plan and work.** `nextbatch.py --emit-prompts` now
   machine-generates the prompt and re-`stat`s every path at emit time. Zero path
   errors in every machine-generated wave since.
6. **The gradient could not see its own subject.** `_confidences()` counted only
   `row_type=="study"`, so the run's largest abstention — 93 rows on a 545×268
   figure, all typed `subtotal` — emitted a gradient with **zero** abstentions.
   Shard rate read 2.5%; true all-row rate was 8.7%. Rebuilt across all rows and
   keyed by row_type (`repair_gradient.py`; derived index, no evidence touched).
   ⚠ **The owner's `visionstore.py::_confidences` has the same study-only
   narrowing and will under-report abstention on the merged store.**

## Not measurable on this route (stated, not estimated)

Per-image **tokens and cost** are unobservable to a subagent. Written as `None`
with `cost_basis="unmeasurable_subagent_route"`. **Not** estimated from a
remembered pixels→tokens formula — that is the folklore being cured.

## Next — and the one decision that needs Mahmood

**1. The v1 quarantine is the biggest open item.** 75 figures are unusable as-is
and cannot be triaged without re-reading, because confabulation (FINDING 1b) does
not show up in the gradient, in a checksum, or anywhere downstream.

**A v2 re-read of the v1 set is the only way to size the native-read error rate**
— and it doubles as the calibration the whole store lacks. It is deliberately NOT
done unilaterally, because the store's founding rule is *never re-read*: a re-read
returns a different answer and destroys comparability. The argument that this is
the legitimate exception:
  * it is a **different measurement** (v2 spec, different `prompt_version`), not
    a re-run of the same one, so it does not overwrite an answer — it adds one;
  * both reads are kept and compared, exactly as with the shard-A duplicates;
  * it needs `allow_duplicate=True` on `(sha, role)` — a deliberate, logged
    exception, not a loosened guard.
**Mahmood's call.** If the answer is no, the v1 cohort stays quarantined forever
and 75 figures' spend is a sunk control arm.

**2. Shard B's `topic=OTHER` territory is nearly exhausted** (226 read). What
remains corpus-wide is NCD — **shard A's active lane**. Do not take it on the old
"A works bottom-up" assumption: that premise is false (FINDING 2). Re-read the
lane ledgers and negotiate, or take the tail A has demonstrably not reached.

**3. Tell the owner two things before the merge:**
  * `visionstore.py::_confidences` counts only study rows and will under-report
    abstention on the merged store (own-error 6 — it hid a 93-row abstention);
  * the 17 cross-lane duplicate images are **inter-reader agreement data**, the
    only reliability evidence in the store. A dedupe on `(sha, role)` destroys it
    and will look like housekeeping.

**4. `compare_dupes.py` needs shard A's raw** to compare at row level; A stores a
different schema (`trials[]`/`weight_pct`) and its BEHAVIOURAL_RECORD rows are
`route="derived"`, not independent reads.
