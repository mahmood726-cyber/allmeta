# Prespecified local ranking comparison

Configuration fixed before inspecting new model results: seeds 101, 202, 303; two randomly selected eligible and two ineligible starting records (oracle-seeded, included in workload); batch size 10; title and abstract only; full published datasets with original row order and labels. Rules are empty and semantic fusion is off for the primary comparison, avoiding post-hoc domain tuning. Evaluate the shipped logistic-regression engine against installed ASReview 3.0.8 ELAS u4, preserving its default model settings except the matched batch size and fixed classifier seed. ASReview u4 was tuned on SYNERGY; these are not unseen validation domains for that comparator.

Final-inclusion labels are the reference standard; they are not title/abstract-stage decisions. Appenzeller-Herzog's original review used independent full-text review and consensus/third-reviewer resolution, but only its first 200 title/abstract records were screened in duplicate. Kwok's methods document independent title/abstract review but do not describe a separate adjudication log. Neither public dataset supplies per-record reviewer adjudication histories or a guarantee of error-free exclusions. This benchmark therefore cannot certify independently re-adjudicated gold labels for every record.

Source reconciliation found a material count discrepancy: the Wilson review paper reports 26 reports (23 studies), while the released CSV has 29 positive labels among 3,453 records. We preserve all 29 released labels and report performance against that dataset, without claiming they reproduce the paper's included-report set. The difference remains unresolved. Kwok's 120 positive labels among 2,481 records match the paper's stated record counts; that count agreement does not independently adjudicate each label. The source dataset ID `Appenzeller-Herzog_2020` is retained even though its cited review was published in 2019.

Sources: [Wilson disease methods, section 2.3.1](https://morbus-wilson.ch/wp-content/uploads/2025/05/appenzeller-herzog_et_al-2019-liver_international.pdf), [Kwok methods, section 2.1](https://pmc.ncbi.nlm.nih.gov/articles/PMC7019290/), and dataset-specific citations/licenses in `sources.json`. Original CSV bytes are pinned by SHA-256. IDs, DOI fields, dates and labels are never synthesized or corrected. Runtime records contain internal row IDs and the source text, with labels kept separate until a record is selected.

Metrics: first screened count reaching at least 95% of eligible records; WSS@95 = 0.95 − screened/N; workload fraction saved = 1 − screened/N; achieved recall and missed eligible count at that point; recall and misses at a fixed 20% workload; full screening order and per-batch cumulative recall. Report every seed, not only the best. Rerun one seed per dataset and require identical order. Runtime includes vectorization, training and ranking, but excludes input downloads and dependency installation. Runtime in Node/Python is algorithm compute time, not reviewer screening speed or a cross-browser performance result.

Rayyan, human screening time and reviewer usability remain unmeasured, as authorized by the user. No synthetic reviewer times, claimed Rayyan baseline, or superiority conclusion may substitute for those missing measurements. A future human crossover study needs blinded datasets, balanced order, independent adjudication, time-on-task, error counts and a prespecified usability instrument.

| Item | Static/dynamic | Purpose |
|---|---|---|
| Seeds, batch, metrics, model defaults | Static, prespecified | Reproducible comparison; no outcome-based tuning |
| Dataset text and reference labels | External, source-pinned | Real review data, with the above adjudication limits |
| Scores, trajectories, metrics and runtimes | Dynamic | Computed from actual runs |
| Rayyan and human usability cells | Unavailable | Never imputed |
