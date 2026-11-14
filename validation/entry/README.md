Smart entry numerical validation
===============================

From the repository root:

```
node --test --test-reporter=tap hub/shared/tests/unit/
node validation/entry/gen_cases.mjs
Rscript validation/entry/check_entry.R validation/entry/cases.json
Rscript validation/entry/check_entry.R validation/entry/cases.planted.json
```

The last command must exit 1 and print a failure. The unmodified corpus must
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

The comparator is `abs(JS-R) / max(1, abs(R)) <= 1e-10`; missing must match
missing, and unexpected errors fail. CI and p conversions use `conv.wald`
plus direct formulas. Estimate midpoint is calculated directly and passed to
`conv.wald`: that function does not itself impute missing estimates.
SD from a mean CI uses t with n-1 degrees of freedom below 60 and normal
quantiles at or above 60, including at level .95 (3.919927969..., conventionally
rounded to 3.92 in the Handbook). Events use nearest integer with upward ties,
the JavaScript convention, stated explicitly in the R oracle.

The planted corpus changes exactly one scalar JS output by 1e-6 relative.
Parser fixtures and unit tests independently cover table delimiters, compound
cells, explicit ambiguity questions, schema mapping, every sanity rule, and
a disabled-rule planted defect. Browser UI is a separate, unwired mountable
module; callers load `shared/alm-entry.css` and provide their own apply callback.

When the sandbox blocks the Node test runner's child process (`spawn EPERM`),
the same tests can run in process:

```
node --test --test-isolation=none --test-reporter=tap hub/shared/tests/unit/alm-entry.test.mjs hub/shared/tests/unit/alm-entry-ui.test.mjs
```

The unit directory has a package entry point so its positional directory
argument loads both suites with the default process isolation. In-process
execution needs explicit filenames (as above) or `hub/shared/tests/unit/index.mjs`;
Node's ESM loader does not accept the directory in that mode.

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
same tests run through `index.mjs`. The runner exits 0 and prints
`ALL_TESTS_PASS` only if all gates pass. Its 16 self-tests include unequal
normal counts, an undetected planted defect, missing summaries and erroneous
process exits. They exercise the actual gate predicates.

The original external runner cannot print `ALL_TESTS_PASS` until its owner
selects TAP and renames both case-only variable pairs to distinct names.
Changing statistical output cannot repair those runner defects.

The UI tests use a small DOM double for mapping, questions, blocking, file
import, applying rows, provenance, labels and status updates. They do not claim
browser rendering or screen-reader certification.
