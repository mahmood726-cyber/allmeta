Smart entry numerical validation
===============================

From the repository root:

```
node --test --test-reporter=tap "hub/shared/tests/unit/**/*.test.mjs"
node validation/entry/gen_cases.mjs
Rscript validation/entry/check_entry.R validation/entry/cases.json
Rscript validation/entry/check_entry.R validation/entry/cases.planted.json
Rscript validation/entry/check_entry.R validation/entry/cases.planted-tiny.json
Rscript validation/entry/check_entry.R validation/entry/cases.planted-formula.json
Rscript validation/entry/check_entry.R validation/entry/cases.planted-de.json
```

Each of the last four commands must exit 1 and print a failure. The unmodified corpus must
exit 0 and print `ENTRY passed/total` with identical counts. All cases run before
that final line; errors are failures, never skipped rows.

The supplied reference source and oracle package version is **metafor 5.2.1**.
The local validation used **R 4.6.0** and **jsonlite 2.0.0**. The runner prints the installed package versions
so the actual environment is recorded rather than inferred.

The deterministic Mulberry32 seed is 20261020. The grid covers every mean/SD
method pair across range, IQR and all-five scenarios, every requested sample
size, scales from 1e-12 to 1e12, 90/95/99% intervals, natural/log ratio inputs,
default symmetry rejection, missing values, small samples, and closed-form
log-normal transformations. Walter's expected range uses the infinite-interval
Gauss–Kronrod rule and R's default `integrate()` stopping tolerance; its SD is
compared with metafor's integration result. Unsupported scenario
outputs are compared as missing values, including all n < 5 five-number inputs.

The comparator is a true relative tolerance, `abs(JS-R) <= 1e-10 * abs(R)`,
at every magnitude; when R is exactly 0 this requires JS to be exactly 0. (An
earlier version divided by a floor of 1, which made the check absolute 1e-10
for |R| < 1, so the 1e-12/1e-9/1e-6 parts of the grid could not fail.) Missing
must match missing, and unexpected errors fail. CI and p conversions use `conv.wald`
plus direct formulas. Estimate midpoint is calculated directly and passed to
`conv.wald`: that function does not itself impute missing estimates.
SD from a mean CI uses t with n-1 degrees of freedom below 60 and normal
quantiles at or above 60, including at level .95 (3.919927969..., conventionally
rounded to 3.92 in the Handbook). Events use nearest integer with upward ties,
the JavaScript convention, stated explicitly in the R oracle.

Cluster-randomised trials (Cochrane Handbook v6.5 §23.1.4): `designEffect`, `clusterCounts`
and `clusterSE` are checked against the Handbook arithmetic written out in R,
DE = 1 + (M - 1) × ICC with M given or total / clusters (or a reported DE), events and totals
divided by DE, and an SE multiplied by sqrt(DE); M from 1 to 500 and ICC from 0 to 1.

There are four planted corpora, and the R gate must FAIL each one:
`cases.planted.json` multiplies one large stored output (sdFromSE, about 1000)
by 1+1e-6; `cases.planted-tiny.json` does the same to a fixed 1e-12-scale case
(seFromCI with bounds 1e-12 and 3e-12, output about 5.1e-13), which only a
relative criterion can detect; `cases.planted-formula.json` recomputes every
output with a copy of `alm-entry.js` in which one coefficient is changed
(Luo 2018 IQR weight `.7+.39/n` -> `.7+.40/n`), so an error that propagates
through the converter itself is caught, not only an edited stored number;
`cases.planted-de.json` does the same with the design effect changed to `1 + M × ICC`.
Parser fixtures and unit tests independently cover table delimiters, compound
cells, explicit ambiguity questions, schema mapping, every sanity rule, and
a disabled-rule planted defect. Browser UI is a separate, unwired mountable
module; callers load `shared/alm-entry.css` and provide their own apply callback.

When the sandbox blocks the Node test runner's child process (`spawn EPERM`),
the same tests can run in process by listing every suite explicitly (there is
no index file or package entry point in the unit directory; CI uses the glob):

```
node --test --test-isolation=none --test-reporter=tap hub/shared/tests/unit/*.test.mjs
```

The round-1 feedback contains two umbrella-runner defects:

- `TEST.ps1` reads TAP `# pass` / `# fail` lines but Node emitted the `spec`
  reporter. The actual result was 358 passes and zero failures.
- PowerShell variable names are case-insensitive. `$pn` and `$pN` refer to one
  variable, so assigning the total overwrites the planted passed count and
  makes the less-than check impossible. `$n` / `$N` also alias, making the
  normal count equality check ineffective. R actually printed `ENTRY 8163/8164`
  and exited 1 for the planted case.

`validation/entry/test_entry.ps1` is a corrected runner within the worktree;
the external `TEST.ps1` is unchanged. It selects TAP explicitly, keeps passed
and total in distinct object properties, and preserves the minimum counts,
R comparison tolerance, references and planted-defect requirement. It also
requires successful unit/generator exits and checks the script-close hygiene
rule advertised by the original runner. It inherits R library environment
variables; `-Rscript` accepts the installed executable if it is not on PATH.

```
powershell -NoProfile -File validation/entry/test_entry.ps1 -SelfTest
powershell -NoProfile -File validation/entry/test_entry.ps1
```

Add `-InProcess` only when the sandbox prohibits Node child creation. The
runner then lists every `hub/shared/tests/unit/*.test.mjs` file explicitly. The runner exits 0 and prints
`ALL_TESTS_PASS` only if all gates pass. Its 16 self-tests include unequal
normal counts, an undetected planted defect, missing summaries and erroneous
process exits. They exercise the actual gate predicates.

The original external runner cannot print `ALL_TESTS_PASS` until its owner
selects TAP and renames both case-only variable pairs to distinct names.
Changing statistical output cannot repair those runner defects.

The UI tests use a small DOM double for mapping, questions, blocking, file
import, applying rows, provenance, labels and status updates. They do not claim
browser rendering or screen-reader certification.
