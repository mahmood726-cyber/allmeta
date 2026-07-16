# SHARD-A FOREST PLOT FULL CAPTURE — prompt v2 (2026-07-16)

**Emit `"prompt_version": "shardA.FOREST_FULL_CAPTURE@2026-07-16-v4"` as a
top-level key in every JSON file you write.** It records which contract produced
the reading. Copy that string exactly.

## v4 — READ RESOLUTION IS MANDATORY. Read this before you open an image.

Two v2/v3 workers independently found that **native resolution produces confident
misreads, not abstentions**:

- τ² read as `28.2566` at native size; a 6x crop resolved it to `26.2566`.
- Multipanel figures pack 2–8 panels into ~700px-wide JPEGs (~5px text): *"a
  pipeline that feeds these at native size is reading noise."*

A model reading 5px text does not feel uncertain — it sees a plausible glyph and
reports `high`. That is the exact failure this run exists to detect, and reading
lazily manufactures it.

**Therefore:**

1. **Read the image once at native size to get the layout** (panels, columns,
   how many rows).
2. **Before you commit ANY digit you are not certain of, crop that region and
   upscale it** (e.g. Pillow: `img.crop(box).resize((w*4, h*4), Image.LANCZOS)`,
   save to your scratch dir, `Read` the crop). Use the Bash tool for this.
3. **Multipanel or text under ~10px: crop EVERY panel and read the crops.** Do
   not read a 4-panel 700px figure at native size and report `high`.
4. **If it is still ambiguous after upscaling, THEN abstain.** An abstention
   after a 6x crop is a real measurement. An abstention without one is laziness,
   and a confident answer without one is worse.

Record what you did as a top-level key:

```json
"read_method": {
  "native_read": true,
  "crops_used": true,
  "max_upscale": 4,
  "regions_cropped": ["panel A counts column", "heterogeneity line"],
  "notes": "5px text at native; all numerics read from 4x LANCZOS crops"
}
```

Set `crops_used: false` **only** if the figure was genuinely legible at native
size. This field is a measured variable, not paperwork — it is how we separate
"vision is wrong" from "vision was shown noise".

## v3 additions — two gaps that v2 workers found and reported

Emit these two top-level keys on every figure:

```json
"comparator_present": true,
"nonevent_columns_printed": false,
```

**`comparator_present`** — `false` for a SINGLE-ARM meta-analysis (a pooled
proportion/prevalence/incidence: one arm, no control). These print Events/Total
and so satisfy `forest_dichotomous` literally, but **no 2x2 exists** — there is
nothing to compare against. A v2 worker flagged that counting them as
`forest_dichotomous` would inflate the headline "recoverable 2x2" number. If
`comparator_present` is false, leave `events_c`/`n_c` null and say so in notes.

**`nonevent_columns_printed`** — `true` when the plot prints Yes/No or
event/non-event columns (Stata style) rather than event/total. **Do NOT sum them
into `n_t`/`n_c`** — that is imputation. Put the raw grid verbatim in
`reading_notes` and leave the totals null. The schema has no non-event field;
that gap is known and is being recorded, not papered over.

You are reading forest-plot images with your own vision. You have vision via the
`Read` tool. No API key is needed. `Read` the image file path directly.

## What you produce

For EACH image in your batch, write ONE file:
`<OUTDIR>/raw_<PMCID>_<FNAME-stem>.json`

That file must contain **exactly one JSON object and nothing else** — no prose,
no markdown fences, no commentary before or after. What you write to that file is
stored VERBATIM as the evidence record. It is never re-typed or summarised by
anyone. Write it as carefully as you would write the final answer, because it is.

Your final chat message is NOT the evidence — the files are. Your final message
should be a short status line only (see bottom).

## The one rule that matters more than coverage

**IF YOU CANNOT READ IT, ABSTAIN. DO NOT GUESS.**

Every field carries its own confidence. Set a field to `null` when the plot does
not print it, and use `"abstain"` confidence when the plot DOES print it but you
cannot read it (too small, cropped, overlapping, blurred).

- **`null` = the plot never printed this.** (A year absent from the label is
  absent from the PLOT. The publisher did not print it.)
- **`"abstain"` = the plot printed it and I could not read it.**

These are different facts and must never be merged.

**NEVER IMPUTE. NEVER INFER. NEVER COMPUTE A FIELD YOU DID NOT READ.**
- Do not derive `n_t` by summing anything.
- Do not compute the effect from the counts. Read what is PRINTED.
- Do not infer the model (fixed/random) from the presence of tau². Only report
  `model` if the words are printed ("Random", "IV, Random", "Fixed", "M-H,
  Fixed", "DerSimonian"). Otherwise `null`.
- If a CI is only plotted (whiskers) and not printed as text, the numeric CI is
  `null` — do not measure pixels.

We are measuring whether vision ABSTAINS where a parser confabulates. A tested
parser was 47.1% wrong with EVERY error emitted at `confidence="high"` — no
gradient, therefore no reject option, therefore unusable at any coverage. **If
you abstain honestly and the parser does not, that is the finding.** An abstention
is a CORRECT and VALUABLE answer here. A guess is a defect.

## Capture the WHOLE plot in one pass

A previous batch bought the whole plot and banked only the 2x2s. Do not repeat
that. Capture everything the figure prints:

Per trial row: label (name + year) · events/N per arm (dichotomous) OR mean±SD
per arm (continuous) · effect + CI · weight %.

Per figure: I² · tau² · Chi² · printed subtotals (these are free checksums) ·
subgroup structure · effect measure · model · outcome name · scale.

## Output schema — every key required, `null` where absent

```json
{
  "image_path": "<the exact absolute path you were given, verbatim>",
  "image_sha256": "<the exact sha you were given, verbatim>",
  "pmcid": "PMC…",
  "fig_id": "<figure id you were given, or null>",
  "figure_kind": "forest_dichotomous|forest_continuous|forest_generic|forest_multipanel|not_a_forest_plot|unreadable",
  "outcome": "<verbatim from caption/axis/header, or null>",
  "timepoint": "<or null>",
  "effect_measure": "RR|OR|HR|RD|MD|SMD|IV|other|null",
  "scale": "log|linear|null",
  "model": "<verbatim as printed, e.g. 'IV, Random' — else null>",
  "n_panels": 1,
  "panels_read": "<which panel(s) these rows come from, or null>",
  "heterogeneity": {
    "i2_pct": null, "tau2": null, "chi2": null, "df": null, "p": null,
    "confidence": "high|medium|low|abstain"
  },
  "rows": [
    {
      "label": "<verbatim row label>",
      "row_type": "study|subgroup_header|subtotal|total|heterogeneity|other",
      "subgroup": "<enclosing subgroup or null>",
      "year": null,
      "events_t": null, "n_t": null,
      "events_c": null, "n_c": null,
      "mean_t": null, "sd_t": null,
      "mean_c": null, "sd_c": null,
      "effect": null, "ci_low": null, "ci_high": null,
      "weight_pct": null,
      "confidence": "high|medium|low|abstain",
      "field_confidence": {"<fieldname>": "high|medium|low|abstain"}
    }
  ],
  "reading_notes": "<what you could and could not read, and why. Name anything odd: multipanel, leave-one-out panels, mismatched labels, unreadable columns.>"
}
```

### `figure_kind` is decided by WHAT IS PRINTED, not by the outcome's nature

This tripped a v1 worker, so it is now explicit:

- **`forest_dichotomous`** — per-arm **events/N are PRINTED** as columns.
- **`forest_continuous`** — per-arm **mean±SD (and N) are PRINTED** as columns.
- **`forest_generic`** — only effect + CI (and maybe weight/Z/p) are printed,
  **NO per-arm counts**. The plot cannot yield a 2x2.

A mortality (dichotomous) outcome plotted CMA-style with only `OR | Lower |
Upper | Z | p` columns is **`forest_generic`**, NOT `forest_dichotomous`. The
question this field answers is "can a 2x2 be recovered from these pixels?" — it
is not asking what the outcome is made of. Getting this wrong overstates how much
of the corpus is recoverable, which is a headline number.

If in doubt: did you fill `events_t`/`n_t` (or `mean_t`/`sd_t`) from PRINTED
columns? If no — it is `forest_generic`.

### `row_type` is THE CRITICAL FIELD

A subgroup header ("1.1.1 Depression at post-test") and a "Subtotal (95% CI)"
diamond are **NOT studies**. Mislabelling either as a study injects a phantom
trial and double-counts a pooled estimate as primary data. Get this right before
you worry about any number.

### `field_confidence`

Only include keys you actually read or attempted. A field you marked `null`
because the plot never printed it does NOT need a confidence entry. A field you
could not read DOES — mark it `"abstain"`.

### Multipanel figures

If the image holds several panels, set `figure_kind: "forest_multipanel"`,
set `n_panels`, and read the per-study forest panel(s). Do NOT read
leave-one-out / influence / "estimates given named study is omitted" panels as
study rows — say so in `reading_notes`. If panels disagree on a label, record
both in `reading_notes` verbatim. Do not reconcile them.

### Not a forest plot

If it is a funnel plot, SROC, PRISMA flow, Kaplan-Meier, or risk-of-bias
traffic-light: `figure_kind: "not_a_forest_plot"`, `rows: []`, and say what it
actually is in `reading_notes`. This is a valid, useful answer — figscan's
caption-based classifier may be wrong, and you are the measurement of that.

## Final message

One line per image, e.g.:
`PMC12587632/12879_2025_11977_Fig2 -> wrote raw_...json | forest_dichotomous | 12 study rows | 1 abstain`
Then: `DONE n/n written to <OUTDIR>`.
Nothing else. Do not paste the JSON into chat.
