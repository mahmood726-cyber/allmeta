# Offline tell-check — run before sample B, and it saved sample B

**Protocol:** `SCORING-PROTOCOL.md` §2A burn rule. ⛔ **No judge was called for this.**
**Artefacts (`F:\claude-temp\pend\`):** `tellcheck.json` (28 KB) · `tellcheck_strip.json`
(21 KB) · `ft_PMC*.txt` (12 cached comparator texts).

---

## ⛔ VERDICT: A TELL SURVIVES, ON BOTH SIDES. SAMPLE B WAS NOT SPENT.

The condition was: *if a tell survives, sample B is burned for nothing.* It survives, so
the sample is intact and no calls went out.

---

## First, condition 4: is the manuscript prose what we SERVE?

**No. And the answer changed the object under test before a single scan ran.**

- **Only 1 of 5 topics has manuscript prose at all.** `arni-hfref` carries
  `title / abstract / methods_prose / results_prose / discussion / limitations /
  conclusions`. The other four carry `references` and `introduction` only.
- **`manuscript.abstract` is not prose.** It is a JSON container opening
  `{"_structure": "Structured, four sections, journal-mandated order.", "_limit": "300
  words…"}`. The thing named "manuscript prose" is still schema-shaped.
- **It is not served.** The abstract text does not appear anywhere in
  `ARNI_HF_REVIEW.html`. A comparison run on it would have been a comparison of an
  artefact no reader can reach — *"not the claim we want to make"*, exactly.

⭐ So the honest object is **the served page's reader-visible text**, and that is what was
scanned. Its first visible words are `theme · Submission readiness: NOT YET DETERMINED ·
Computed from this object's own state…`.

---

## The scan: 12 pairs, both sides, frozen marker list

**Mirrored on purpose.** A judge that can identify the *human* side answers correctly by
elimination — the same failure wearing the other face — so the comparator was scanned for
its own markers too.

| our-side marker | pairs | hits | | their-side marker | pairs | hits |
|---|---|---|---|---|---|---|
| `self_reference` | **12/12** | 935 | | `doi` | **12/12** | 734 |
| `schema_field_names` | **12/12** | 583 | | `identifiers` (PMC/PMID/Supplementary) | **12/12** | 256 |
| `ui_chrome` | **12/12** | 518 | | `licence_front_matter` | **12/12** | 74 |
| `pipeline_vocabulary` | **12/12** | 288 | | `journal_sections` | **12/12** | 65 |
| `caps_emphasis` | **12/12** | 160 | | `affiliations` | **12/12** | 65 |
| `build_stamp` | 9/12 | 27 | | `reference_style` (*et al.*) | 8/12 | 293 |
| `brand` | 1/12 | 10 | | `publication_dates` | 6/12 | 13 |
| `json_punctuation` | 0/12 | 0 | | | | |

**Every pair carries identifying markers on both sides.** Blinding is not marginally
broken; it is broken twice over.

## The strip test: what a normaliser can and cannot remove

| survives normalisation — OUR side | pairs | hits |
|---|---|---|
| `self_reference` (*"this object's"*, *"this page"*) | 12/12 | **935** |
| `pipeline_vocabulary` (*estimand*, *SSOT*, *handbook conformance*, *P22*) | 12/12 | **288** |
| `caps_emphasis` (runs of ≥3 capitalised words) | 12/12 | **160** |

| survives normalisation — THEIR side | pairs | hits |
|---|---|---|
| `journal_sections` (Acknowledgements, Competing interests, Funding) | 12/12 | 65 |
| `reference_style` (*et al.*) | 8/12 | 293 |

Brand, UI chrome, schema field names, build stamps, DOIs, licences, affiliations,
publication dates and PMC identifiers all strip cleanly. **The residue does not.**

⭐ **The decisive number: normalisation removed 831 of 175,878 characters — 0.5%.** The
chrome was never the problem. **The tell is in the prose itself** — how we write, not what
we wrap it in. Stripping `self_reference`, `pipeline_vocabulary` and `caps_emphasis` would
not be normalisation; it would be deleting the writing.

Symmetrically, removing a paper's Acknowledgements and its *et al.* citations would delete
the paper's own body. Neither side can be laundered into the other's voice.

---

## What follows, and what I am NOT doing

⛔ **I am not iterating renderers until one passes.** That is p-hacking with extra steps
and it is the most damaging thing we could do to the claim. Two design attempts — the
dossier and the manuscript-prose proposal — have now been checked, one by a spent control
and one offline, and **the second was stopped before it cost anything.**

**This is a finding about our format, and a real one:** an artefact that narrates its own
construction cannot be blinded against an artefact that does not. Our reviews are
identifiable *because* they carry the provenance that makes them checkable — the property
we are trying to demonstrate is the property that breaks the test we chose to demonstrate
it with.

### Options, stated and not chosen — this is Mahmood's and the reviewer's call

1. **Drop the preference panel; score the rubric mechanically.** S1, S3 and S6 are
   already machine-checkable from both sides; the surface gate is machine-checkable. A
   mechanically-scored rubric has **no judge to fool, so blinding stops being required
   at all** — and it is *more* checkable by a reader than an LLM preference, which is our
   whole claim. ⭐ This is what I would recommend if asked.
2. **Compare fragments, not documents.** Per criterion, extract only the evidence needed
   — the included-study list, the heterogeneity sentence, the search string — and judge
   short normalised fragments. Far less style survives a fragment. But the judge no
   longer sees a review, and what is being compared becomes our extractor.
3. **Run it open and disclose it.** Judges are told which side is ours; every result is
   reported as confounded by that. Weak, and I would rather say so than dress it up.

⚠️ **None of these is a renderer tweak, and that is deliberate.** A third attempt at
making our prose look like a journal paper would be the iteration this document exists to
refuse.

---

## The openai re-probe — one call, authorised, and it failed again

**`DEGRADED_TWO_FAMILY` stands. Seat: `openai` / `gpt-5.5`. Reason:
`JUDGE_CALL_VOID:MODEL_STRING_ABSENT_OR_WRONG_FAMILY`.**

`rc=0`, 106 s, a real completion. Asked for three lines naming its own model, it replied
*"Acknowledged. Three lines. Nothing else."* — the same behaviour as the first attempt,
so it is consistent rather than flaky. **One call. Not retried.**

### ⚠️ A correction to my own diagnosis

I said the earlier failure was probably caused by `subprocess` inheriting stdin, because
the log showed codex printing *"Reading additional input from stdin…"*. **That was wrong.**
`stdin=subprocess.DEVNULL` is set (`judgeprobe.py:80`) and the banner still appears, so it
is a startup message and not evidence of anything. The behaviour is unchanged with the fix
in place, which means stdin was never the cause.

What the evidence actually supports: **`codex exec` is an agentic front end that returns an
agent-style acknowledgement rather than a literal payload.** The seat is **live and
authenticated** — the banner reads `model: gpt-5.5 provider: openai` — but it does not
satisfy a strict output contract in this invocation mode. That is a fact about the
invocation, and settling it would need a different mode, not another identical call.
