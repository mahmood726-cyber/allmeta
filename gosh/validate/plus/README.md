# GOSH extras validation

## Rendered style contract

Each comparison calls the same pure plot renderer with the current analysis,
study selection and axis in a temporary closed shadow root. Clean ancestor
elements and authored stylesheets are captured at adapter initialization,
before replay mutations. The original CSS cascade (including unitless inherited
values) lays out fresh reference nodes at the current viewport width. `:root`
rules target the isolated host, preserving media rules and theme variables.
Computed values come from this browser, not stored browser constants. The
host is offscreen and removed in `finally`.

Every property enumerated by `getComputedStyle` is compared on the SVG root,
points, ticks and labels. Unexpected wrappers or label descendants fail closed;
the renderer emits direct children only. This covers filters, blending, dashes,
markers, transforms and text painting without a paint-property allowlist.
Equivalent class/inline/attribute styles pass when their computed values match.
Compensated transforms are outside this strict style contract and are refused.

Both layout trees are flushed before computed-style reads. Resolved left/right
root margins and their logical aliases are excluded: these place the viewport,
not paint inside it, and Chromium reports different auto-margin values after
harmless mark mutations in live/offscreen contexts. Dimensions, transforms and
all mark styles remain checked.

Other exceptions are limited to Chromium app-region (native window dragging), fill
on straight open ticks (no fill area), and stroke colour/width/opacity when
both reference and actual strokes contribute no paint. A newly painted stroke
still fails. Numerical comparisons and corpus cardinalities are unchanged.

| Item | Static or dynamic | Source |
| --- | --- | --- |
| Mark topology and ineffective-paint exceptions | Static renderer contract | `plus.js`, adapter |
| Reference computed styles | Dynamic, same browser/page | Isolated clean render |
| Numerical output | Dynamic | Captured analysis and pinned R reference files |

The extras are isolated in `#alm-plus`. Refresh captures the existing GOSH
engine through its existing validation hook, restores the original page state,
and draws a separate scatter. The original engine, plot, summary, export and
paper corpus are unchanged.

Choose a study to colour subsets by inclusion. Each table row reports counts,
mean and median pooled estimate, and mean I² with and without that study.
Differences are with minus without. These are descriptive summaries of
overlapping subsets, not independent observations; no p-values are reported.
Column buttons sort the table; each study button also selects its highlight.
The highlight axis supports I², H², Q, and (DL only) tau² and tau.
GOSH H² is Q/(subset size − 1), including values below one; singleton H² is one.

## Evidence and reproduction

`MANIFEST-plus.json` and `manifest-plus.js` pin two independent extras files.
The selection is all 75 accepted configurations in the original deterministic
replay corpus, with both FE and DL: 150 model configurations. Original over-cap
cases remain covered by the unchanged original validator. Memberships, source
row identifiers, input effects and standard errors come from the original
pinned corpus/reference. No new study identifiers or research results are
invented.

Run from the repository root, with the pinned metafor 5.2-1 library first in
`R_LIBS_USER` and a library containing jsonlite also available:

```text
Rscript gosh/validate/generate-plus.R
python gosh/validate/pin-plus.py
```

The R generator verifies the original manifest hashes. Enumerated cases call
`sav <- metafor::gosh(res)` and match `sav$incl` by exact membership key before
using `sav$res$estimate`, `I2`, `H2`, `QE`, `tau2` and `tau`. Summaries use R
`mean` and `median` over inclusion columns. Sampled cases reuse the original
archived R fits on the app's exact memberships, preserving duplicates and
order. Their H² is computed in R using GOSH's Q/(k−1) convention. They are
**summaries over the app's own draws**, not parity with metafor's sampling
distribution. No new sampled subset fits are required.

The second panel uses the existing self-hosted webR runner (live metafor
4.8-0, explicitly different from the pinned 5.2-1 reference). Live validation
enumerates with `gosh` or refits each captured sampled membership in R.
Replay works offline after preparation; file URLs provide a separate file
picker. Modified corpus bytes, malformed inputs, missing quantities, invalid
membership, nonfinite results, empty with/without groups, and R errors refuse
validation. The supported input range is 3–100 valid rows. Invalid axis controls
must be corrected first.
Replay aborts with an explicit error after 1,000 mismatches, rather than
attempting to render an unbounded failure table; it never reports that partial
run as a pass.

Every displayed table number, extra point quantity, plot coordinate, colour,
membership class, highlight count and axis limit is checked. Counts, text and
membership are exact; numeric comparisons use
`abs(app − R) / max(1, abs(R)) <= 1e-9`. The generated manifest states the exact
check count. The original replay still has its own 876,760-check denominator.

| Item | Static contract | Dynamic evidence |
|---|---|---|
| Inputs | Original source pins and selection | Verified source files and exact memberships |
| Oracle | R 4.6.0, metafor 5.2-1; live 4.8-0 | R enumeration, archived sampled fits, live R fits |
| Statistics | Named quantities and tolerance | Captured engine values and inclusion summaries |
| Display | Labels, colours and SVG dimensions | Actual table text, coordinates, axes and counts |

Tests: `gosh-plus.spec.mjs` checks pinned replay, interaction, keyboard controls,
FE/DL axis availability, isolated plot behavior, per-quantity mutations,
evidence/input refusals, and live webR. The original `validate-gosh.spec.mjs`
and `validate-integration.spec.mjs` remain separate regression gates.
