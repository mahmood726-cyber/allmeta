# Built-in example audit: papers 2–19

Scope: the examples shipped by the original app pages and their example/hero
scripts. Existing defaults are preserved. A package name alone does not establish
that data are real: notably, **robumeta describes corrdat as fictional**.
“Published-derived” below means the inputs have a documented published source,
but may be transformed, rounded or subsetted. It is not a claim that every old
transcribed value has been revalidated. The new JSON records are exact exports of
the package data; the R gate checks every source value against the original
versioned package object in `source-data/` before fitting anything.

| Paper | App | Existing built-in choices and classification | Addition |
|---|---|---|---|
| 2 | dose-response-ma | `alcohol_cvd`: real, published-derived; dosresmeta documents Liu et al. (2009), six observational studies. The page explicitly rounds log-RR and SE to six decimals. | None: existing example is published data. |
| 3 | dta-sroc | Generic Study A–G: synthetic. `AuditC` (Kriston 2008), `Dementia` (Mitchell 2009), `IAQ`, `SAQ`, `smoking` (Patrick 1994), `skin_tests` (Sousa-Pinto 2021): published mada count datasets; `_make_examples.R` records their export. | Exact mada `AuditC` count rows, with original citation. |
| 4 | nma | Generic five-treatment network: synthetic. `Senn2013`, `smokingcessation`, `Baker2009`, `Dogliotti2014`, `Franchini2012`, `Gurusamy2011`, `Linde2015`, `Linde2016`, `Stowe2010`, `Woods2010`, `dietaryfat`: published-derived netmeta examples; `_make_examples.R` states their measures, contrast direction and 10-significant-digit serialization. Franchini2012 and dietaryfat cite Dias (2013); smokingcessation also cites Dias (2013). | Exact smokingcessation raw records; a disclosed two-arm subset, converted without decimal rounding. |
| 5 | heterogeneity | Trial A–H default: synthetic. Shared BCG hero: published-derived, rounded effects/variances. | Exact metadat `dat.bcg` counts. |
| 6 | pubbias-tests | Generic effect/SE default: synthetic. Shared BCG hero: published-derived; worked BCG binary-count option: published-derived. | Exact `dat.bcg` counts transformed to log-RR/SE. |
| 7 | multilevel-ma | Generic clusters/outcomes A/B: synthetic. | Real modified-school-calendar results, `dat.konstantopoulos2011`, schools nested in districts. |
| 8 | meta-regression | Trial A–H baseline-LVEF default: synthetic. Shared BCG hero and the plus-panel BCG year/latitude example: published-derived. | Exact `dat.bcg`, log-RR on absolute latitude, using the base page's PM/adhoc model. |
| 9 | proportion-ma | Study A–G count default: synthetic. | Exact BCG control-arm TB case proportions; different follow-up durations explicitly disclosed. |
| 10 | mh-peto | StudyA etc. default: synthetic. Yusuf (1985) table-6 option: published-derived from `metadat::dat.yusuf1985`, with source attribution. | Exact BCG treatment/control counts. |
| 11 | influence | Generic named default: no publication provenance; treat as synthetic/unverified. BCG hero: published-derived. | Exact `dat.bcg` counts. |
| 12 | limit-ma | S01–S10 default: synthetic. BCG hero: published-derived. | Exact `dat.bcg` counts. |
| 13 | gosh | Study A etc. default: synthetic. BCG hero: published-derived. | Exact `dat.bcg` counts; deterministic full subset enumeration with the existing FE setting. |
| 14 | cumulative-subgroup | Trial A etc., Low-risk/High-risk default: synthetic. BCG hero: published-derived. | Exact `dat.bcg`; source publication years and allocation categories retained. |
| 15 | rve-meta | `robumeta::corrdat`: **fictional**, per the package's `man/corrdat.Rd`, despite tutorial provenance. The separate small five-study example is synthetic too. | Real `dat.konstantopoulos2011`; CORR model by district, rho=0.8 explicitly an assumption. |
| 16 | nma-inconsistency | A/B/C contrast default: synthetic. Baker2009 and Linde2015 plus examples: published-derived, with explicit two-arm-only filtering and publication citations in `plus-examples.js`. | Exact smokingcessation source records, whole multi-arm trials excluded. |
| 17 | correlation-ma | Study A–H default: synthetic. | Exact `dat.molloy2014` correlations and sample sizes. |
| 18 | multivariate-ma | Berkey1998: real periodontal trials from metadat/mvmeta, PD/AL paired outcomes and covariance. `mvmeta::hyp`: real hypertension trials; source is Jackson, White & Riley (2013), Biometrical Journal 55:231–245. Package documentation says the article mislabeled SEs as variances; the page correctly squares the SEs. | None: both existing choices have published sources. |
| 19 | component-nma | drug/exercise/education default: synthetic. | Exact netmeta `Baker2009` arm counts; two-arm trials only, with source drug combinations retained. Placebo maps to control and names are lowercased as in the original parser. |

## Evidence and qualifications

- Page definitions: `<app>/index.html`; DTA/NMA exports:
  `dta-sroc/_make_examples.R`, `nma/_make_examples.R` and their
  `example-datasets.js`; NMA inconsistency: `plus-examples.js`.
- Shared BCG hero: `shared/canonical-datasets.js` explicitly stores four-decimal
  effects/variances. Its simplified `design` labels are not the source `alloc`
  field. The new examples use package counts and source allocation categories.
- Primary package documentation for the distinctions above is saved with blob
  identities in `audit-source-notes.json`: [corrdat](https://github.com/cran/robumeta/blob/master/man/corrdat.Rd),
  [hyp](https://github.com/cran/mvmeta/blob/master/man/hyp.Rd),
  [alcohol_cvd](https://github.com/cran/dosresmeta/blob/master/man/alcohol_cvd.Rd),
  [Baker2009](https://github.com/cran/netmeta/blob/master/man/Baker2009.Rd).
- Original source records and citations for each addition are in the app's JSON.
  There are no invented study IDs: source labels/IDs are retained where provided;
  mada and smokingcessation rows use explicit package-row labels.
- The binary package blobs in `sources.json` are the extraction inputs. Their
  Git blob identities are verified by `export_sources.py`; Python serializes
  decoded doubles without rounding. Missing source values remain JSON null.

## Static versus dynamic disclosure

| Item | Nature | Verification |
|---|---|---|
| Package data, citations, versions and hashes | Static source records | Binary identity at extraction; exact original package objects loaded and compared again in R |
| Source-to-input transformations and subsets | Deterministic code | Unit/native-parser controls and independent R reconstruction |
| App results and displayed text | Dynamic original app output | Browser spec captures full-precision values and the visible main result |
| R reference results | Dynamic package fits | Original live-adapter recipes; existing tolerances, with planted numerical/display failures |
| UI test doubles | Explicitly synthetic test-only controls | Never exported as `.app.json` or counted as scientific validation |

Browser execution and the R cross-check must pass in the external runner before
claiming numerical validation of these additions. The audit does not certify the
old rounded examples or alter their publication-time defaults.
