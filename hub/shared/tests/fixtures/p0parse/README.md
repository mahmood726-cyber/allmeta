# Parser regression fixtures

Data row numbers are one-based, excluding the header. cases.json declares exact rows and refusals; rules.csv lists the same inputs for base R without JSON dependencies.

Semicolon and tab delimiters permit decimal commas in declared float columns. Comma-delimited numeric decimal commas are refused, including quoted cells. Excess fields refuse the whole row and names all header columns because the intended comma boundary cannot be recovered safely.

OR/RR/HR with CI headers is refused unless all ratio/CI headers are explicitly declared by the caller, never automatically transformed. Supply log effects and numeric SEs explicitly. CI text in SE/sei cells refuses the row. Numeric study labels remain strings. n, N, sd and sample size cannot fuzzy-map to se/sei/vi/variance. se/sei cannot fuzzy-map to variance. Exact declared fields remain supported.

The ordinary, scientific, variance and extra-column controls preserve valid input. Numeric labels and sample size already worked in the old parser; explicit planted corruptions test that their regressions are detected. Other defect fixtures were observed failing against the original parser before modification.

The Playwright spec writes only browser callback results to rchecks-out/p0parse. R independently parses the source CSVs, determines refused rows, compares labels and refusal indices exactly, and numbers within 1e-9. A deliberately corrupted result must be rejected before R_CHECK_PASS.

Review regressions: optional-short accepts an omitted trailing year as null; optional-control keeps a supplied year; optional-overflow refuses excess fields. required-short and required-header refuse absent required data. ratio-declared accepts explicit ratio/CI fields unchanged, while ratio-partial and the original ratio fixtures refuse undeclared fields. int-comma refuses the whole row and quotes the original 1,234; int-control accepts unseparated integers. schema.csv describes caller column types and requirements for the independent R check.

Browser harness: parser.html loads only the real shared csv-upload.js and a mount point. The feature spec navigates directly to it, avoiding the hub landing page service-worker registration and Shinylive runtime prefetch. Each case removes its prior output files before navigation so a failed case cannot leave old results for R. All row, diagnostic and refusal assertions are unchanged.
