# Benchmark data: sources, licences and what is redistributed

All 20 files are checked against `SHA256SUMS` (hash of the uncompressed CSV) before every run.

| Files | Source | Licence | In this repository? |
|---|---|---|---|
| `corpora/appenzeller_herzog_2020.csv.gz`, `kwok_2020.csv.gz`, `wolters_2018.csv.gz`, `bos_2018.csv.gz` | ASReview `systematic-review-datasets` (also in SYNERGY, De Bruin *et al.* 2023, https://doi.org/10.34894/HE6NAQ). Reviews: Appenzeller-Herzog 2019 (https://doi.org/10.1111/liv.14179), Kwok 2020 (https://doi.org/10.3390/v12010107), Wolters 2018 (https://doi.org/10.1016/j.jalz.2018.01.007), Bos 2018 (https://doi.org/10.1016/j.jalz.2018.04.007) | CC-BY 4.0 | Yes |
| `dedup/nagtegaal_2019.csv` | Nagtegaal R, Tummers L, Noordegraaf M, Bekkers V. Harvard Dataverse, https://doi.org/10.7910/DVN/WMGPGZ (via ASReview `systematic-review-datasets`) | CC0 1.0 | Yes |
| `corpora/cohen_*.csv.gz` (15 drug-class reviews) | Cohen AM, Hersh WR, Peterson K, Yen PY. *JAMIA* 2006;13(2):206–219, https://doi.org/10.1197/jamia.M1929. Labels: https://dmice.ohsu.edu/cohenaa/systematic-drug-class-review-data.html | Labels openly provided (citation requested); titles/abstracts are MEDLINE records | **No.** Downloaded on first run by `bench/fetch_data.py` from `asreview/systematic-review-datasets` at commit `38b35218e4d0f99621cec5a8a25a0147bb88c654` and SHA-256 verified |

Why the Cohen files are fetched instead of included: OHSU distributes the inclusion labels
freely, but the titles and abstracts come from MEDLINE (originally the NIST TREC Genomics
corpus, which requires an application form). We could not confirm that those abstracts may
be redistributed, so we link to the copy ASReview already publishes and pin it by hash.
The downloaded bytes were checked to be identical to the copies used in the allmeta
benchmark from which the paper's numbers come.

`ATTRIBUTION-allmeta.md` is the attribution file from the allmeta repository, kept for provenance.

Please cite the original dataset authors when you use these data.
