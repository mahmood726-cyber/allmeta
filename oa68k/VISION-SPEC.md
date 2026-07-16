# FOREST-PLOT VISION SPEC — shard B, 2026-07-16

You are reading forest-plot figures from published meta-analyses **using vision**.
`Read` renders images natively. Read each assigned image, then **write your own
output to disk yourself**. Nothing between your eyes and the file.

## ⚠ ZOOM IS MANDATORY — read this before your first `Read`

**92.6% of this corpus is under 800px wide. At native size these figures are
below the legibility floor, and a too-small image does not announce itself — you
will read a confident, plausible, WRONG digit.** This is not hypothetical: a
reader at native resolution transcribed "Bizino 2019" mean = 7.7, which is the
**SD**; the mean was **12**. Another dropped a **minus sign on a CI bound**,
reversing the effect. Same readers, same images, zoomed: correct.

⚠⚠ **AND IT GETS WORSE THAN DIGITS. A BLURRY FIGURE CAN BE REPLACED WHOLESALE BY
AN IMAGINED ONE.** Twice, independently:
* at **2.99×**, a reader returned a 34-study *proportion* meta-analysis (pooled
  0.529 [0.442; 0.616], I²=99.6%, τ²=0.0688) from an image that actually holds a
  37-study *odds-ratio* forest — same bytes, md5 verified;
* at **2.21×**, a reader returned a Stata WMD plot with six invented study names
  and I²=61.6%, from a figure that is a five-study meta-package plot.

Both fabrications were **internally self-consistent** — the totals reconciled,
the CI matched the estimate, nothing looked wrong. **No checksum and no
downstream validator can catch this. Your own confidence cannot catch it: both
readers felt fine, and 2.2× "felt adequate."** When the pixels are insufficient
the model does not return noise — it returns *the most likely figure*, which is
precisely why it is undetectable later.

**Rule 2 does not save you here: abstention only fires when you KNOW you cannot
read. THE ONLY DEFENCE IS RESOLUTION.** If a figure looks readable at low zoom,
that is not evidence it is. Zoom anyway, and if a zoomed crop disagrees with your
overview, **the crop wins and the overview read must be discarded in full.**

So, before transcribing any figure narrower than ~1200px:

1. **CROP FIRST, THEN UPSCALE — and never exceed ~2000px per crop.**
   ⚠ **The renderer silently downscales anything bigger than ~2000px.** A 6×
   upscale of a whole 669px figure → 4014px → resampled back to 2000px ≈ **2.6×
   effective**. You would believe you zoomed 6× and have read a 2.6× image. It
   does not warn you. **Whole-figure upscaling is therefore mostly self-deception**
   — the gain must be spent on a *small piece* of the image, not the whole thing.
   Split the figure into panels/row-bands and size each crop to land **at or just
   under 2000px on its long side**:
   ```python
   from PIL import Image
   im = Image.open(SRC)                       # Pillow 12 is installed
   c  = im.crop(box)                          # ONE panel / band of rows
   f  = min(2000 / max(c.size), 8)            # fill the budget, never overshoot
   c.resize((int(c.width*f), int(c.height*f)), Image.LANCZOS).save(OUT)
   ```
2. `Read` the **upscaled crops**, not the original.
3. Record the **effective** factor in `read_method` (e.g. `"zoomed_3x_per_panel"`)
   and say in `reading_notes` how you split it. Report what you actually got, not
   what you asked for.

Upscaling adds no information — it makes the information that IS there legible to
the renderer. It is not enhancement and it is not imputation.

Set `"read_method"` on every figure object: `"zoomed_<N>x"` (say the crops),
or `"native"` **only** if the image was already large enough to read comfortably.
**A native read of a <1200px figure is not acceptable** — zoom it.

## What you do

1. Zoom per the protocol above, then `Read` each image.
2. `Write` a JSON **array** — one object per figure, in the order given — to the
   output path you were given. This file is the evidence record.
3. Reply with ONLY: `WROTE <path> <n_bytes> <n_figures>` plus, if you like, one
   line naming anything you abstained on. **Do not paste the JSON into your
   reply** — the file is the deliverable, the reply is a receipt.

Write the file **once**. Do not re-read an image to "check" a value after
writing: a re-read returns a *different* answer and destroys comparability with
the stored batch. Your first honest reading is the record.

## Schema — one object per figure

```json
{
  "pmcid": "string",
  "image_file": "string",
  "read_method": "zoomed_5x | zoomed_4x_per_panel | native | ...",
  "figure_kind": "forest_per_study | forest_multipanel | not_a_forest_plot",
  "outcome_name": "string|null",
  "effect_measure": "OR|RR|HR|MD|SMD|RD|Peto OR|proportion|other|null",
  "model": "fixed|random|null",
  "model_evidence": "string|null",
  "axis_scale": "log|linear|null",
  "heterogeneity": {"i2": null, "tau2": null, "q": null, "p": null, "df": null},
  "rows": [
    {
      "row_type": "study|subgroup_header|subtotal|total|heterogeneity|other",
      "label": "string|null",
      "year": null,
      "subgroup": "string|null",
      "panel": "string|null",
      "events_t": null, "n_t": null, "events_c": null, "n_c": null,
      "mean_t": null, "sd_t": null, "mean_c": null, "sd_c": null,
      "effect": null, "ci_low": null, "ci_high": null,
      "weight": null,
      "confidence": "high|medium|low|ABSTAIN",
      "abstained_fields": ["field names you could NOT read"],
      "notes": "string|null"
    }
  ],
  "reading_notes": "string",
  "field_confidence": {
    "outcome_name": "high|medium|low|ABSTAIN",
    "effect_measure": "...", "model": "...",
    "heterogeneity": "...", "row_completeness": "..."
  }
}
```

## Rules — each one is a known failure mode

1. **TRANSCRIBE, DO NOT COMPUTE.** Report only numbers **printed** in the figure.
   Not shown → `null`. Never derive events from a percentage, never infer N from
   a weight, never reconstruct a CI you cannot read. **A fabricated number is far
   worse than a missing one.**

2. **IF YOU CANNOT READ IT, SAY `ABSTAIN`. DO NOT GUESS.** List the field in
   `abstained_fields`. An honest abstention is a **result we want**; a confident
   wrong digit is contamination. A parser we tested was 47.1% wrong with *every*
   error emitted at `confidence="high"` — no gradient means no reject option,
   which makes output unusable at any coverage. **Feel zero pressure to fill a
   field.** Empty is a finding.

3. **NEVER INFER THE MODEL.** `model` is non-null **only** if the image literally
   prints "random-effects"/"fixed-effect"/"Random"/"Fixed". **The presence of τ²
   or I² is NOT evidence of a random-effects model.** Not printed → `model:null`,
   `model_evidence:null`. Quote the printed text in `model_evidence`.

4. **ROW TYPE IS THE MOST IMPORTANT FIELD.** Forest plots interleave study rows,
   subgroup headers (often `1.1.1 <name>`), `Subtotal (95% CI)` / `Total (95% CI)`
   diamonds, and heterogeneity lines. **Classify every visible row. Never silently
   skip one.** Capture printed subtotals/totals with their `n_t`/`n_c` — they are
   free checksums.

4a. **A CHECKSUM VERIFIES. IT NEVER IMPUTES.** If a digit is ambiguous, you may
   **not** resolve it by picking the value that reconciles a printed total —
   "only 65 makes the column sum to 670" is **back-solving, and it is banned.**
   Null the cell, `confidence:"ABSTAIN"`, and say in `notes` what the total was.
   Reason: a cell derived from the total can never afterwards be *checked*
   against that total. Back-solving silently converts our one independent
   validator into a circular one, and it does so invisibly — the row looks read
   when it was in fact computed. An abstention keeps the checksum worth
   something; a plausible digit destroys it. The same applies to reconciling a
   row against a printed weight, an Overall N, or `Total events`.

5. **CAPTURE THE WHOLE PLOT IN ONE PASS.** Per row: label (name + year), n/N or
   mean±SD per arm, effect + CI, weight. Per figure: I², τ², printed subtotals,
   subgroup structure, measure, model, outcome name. A previous batch bought all
   of this and banked only the 2×2s — do not repeat that.

6. **MULTI-PANEL.** Several panels → `figure_kind:"forest_multipanel"`, extract
   only per-study forest panels, set `panel` per row, say what you excluded in
   `reading_notes`. A funnel plot, leave-one-out panel, or Kaplan–Meier curve is
   **not** a per-study forest plot.

7. A plot whose rows are subgroups of a **single trial** is not a meta-analysis
   forest plot → `figure_kind:"not_a_forest_plot"`.

8. **Gaps are NULL. Never impute.** Reading ≠ implying. If a column does not
   exist in the figure, that is absence, not illegibility — say which in
   `reading_notes`.
