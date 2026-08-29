# REUSE SHORTLIST

Question: what should a caller of `oa68k/ladder.py` import and call rather than rewrite?

This is a judged shortlist, not a keyword inventory. Required files read: 4/4
(`out/REUSE-INVENTORY.md`, `oa68k/ladder.py`, `oa68k/obtainability.py`,
`oa68k/ladder_bench.py`). Candidate files opened before rowing: 25/25.
Rows below: 25/25 maximum allowed. Rows from unopened files: 0/25.

Row format: path | public callable with exact signature copied from the file |
one-line function | ladder rung or concern | what `ladder.py` duplicates or lacks.

## Rung Reuse Shortlist

1. `oa68k/net.py` | `class PoliteSession` | Session wrapper with User-Agent, rate limiting, E-utilities API-key injection, retry/backoff. | cross-cutting HTTP | `ladder._get` reimplements retry and headers without the shared rate limiter or API-key routing.

2. `oa68k/net.py` | `def append_jsonl(path: str, obj) -> None` | Append one JSONL record using UTF-8 JSON. | cross-cutting ledger | `ladder.py` records attempts in memory and prints JSON, but has no durable per-request ledger.

3. `oa68k/net.py` | `def load_done_keys(path: str, key: str) -> set` | Load completed keys from a JSONL ledger for resume. | cross-cutting ledger | `ladder.py` has no resume/done set, so reruns cannot skip already searched data.

4. `oa68k/harvest.py` | `def fetch_fulltext(sess: PoliteSession, row: dict) -> dict` | Fetch structured OA full text by PMCID using efetch JATS, EPMC XML, then BioC fallback, and cache XML. | Rung 3 literature | `ladder.rung3_literature` hand-fetches PMC/EPMC full text and strips XML instead of using the existing tiered full-text fetcher.

5. `oa68k/jats.py` | `def all_text(xml_bytes: bytes) -> str` | Parse XML and return descendant text with collapsed whitespace. | Rung 1/Rung 3 text extraction | `ladder._xml_text` strips tags by regex for XML that `jats.py` already parses.

6. `oa68k/jats.py` | `def parse_tables(xml_bytes: bytes) -> list[dict]` | Extract JATS table-wraps with labels, captions, composed headers, rows, and raw table XML. | Rung 1 prior metas; Rung 3 literature | `ladder.rung1_prior_meta` searches prior-meta free text but does not use existing structured tables where extracted meta-analysis data usually lives.

7. `oa68k/config.py` | `def reqs_per_sec() -> float` | Return the node's allowed request rate from key and node-sharing settings. | cross-cutting politeness | `ladder._get` has fixed retry sleeps and no shared per-node rate budget.

8. `oa68k/config.py` | `def ext_table(name: str) -> str | None` | Resolve converted AACT extension tables such as `study_references`, `result_groups`, and `id_information`. | Rung 2 registry; Rung 4 regulatory linking | `ladder.py` queries live sources but does not use the offline AACT extension tables that already back registry and FDA joins.

9. `oa68k/fda.py` | `def ingest() -> dict` | Download FDA's official Drugs@FDA bulk data and write applications/docs parquet. | Rung 4 regulatory | `ladder.rung4_regulatory` probes OpenFDA live endpoints instead of using FDA's official application-document inventory.

10. `oa68k/fda.py` | `def harvest(limit: int = 50) -> dict` | Fetch directly linked NDA/BLA review PDFs from FDA-published URLs with a review-document ledger. | Rung 4 regulatory | `ladder.rung4_regulatory` only records guessed FDA review PDF patterns and does not fetch/cache review documents.

11. `oa68k/fda.py` | `def extract_and_link(limit: int | None = None) -> dict` | Extract protocol codes from harvested FDA reviews and link unambiguous codes to NCT IDs via AACT `id_information`. | Rung 4 regulatory to Rung 2 registry | `ladder.rung4_regulatory` has no protocol-code-to-NCT bridge for FDA reviews.

12. `oa68k/obtainability.py` | `def earn_unobtainable(query_key: str, enumeration, evidence_kind: EvidenceKind) -> Verdict` | Grant or refuse `GENUINELY_UNOBTAINABLE` from a named, hashed enumeration with a passed positive control. | cross-cutting absence state | `ladder.py` defines the state but never calls the only module allowed to grant it.

13. `oa68k/registry_full.py` | `def run_batch(con, batch_id: int) -> dict` | Materialize one CT.gov RCT batch into trial, arm, intervention, outcome, result, AE, site, and reference parquet tables. | Rung 2 registry | `ladder.rung2_registry` re-reads one live CT.gov record and does not consult the existing registry store.

14. `oa68k/preextract.py` | `def run(chunk: int = 500) -> dict` | Copy structured registry counts for NCTs discovered in OA meta-analysis detect ledgers. | Rung 2 registry | `ladder.rung2_registry` duplicates the idea of registry-direct extraction but only for one live NCT and without the shared preextract ledger.

15. `oa68k/crosswalk.py` | `def collect_pmids(link_types_only: bool = True) -> list` | Collect DERIVED/RESULT PMIDs linked to RCTs, ordered by trial-report relevance and cohort. | Rung 2 to Rung 3 bridge | `ladder.rung3_literature` searches by trial name/NCT instead of using the registry's typed PMID links.

16. `oa68k/crosswalk.py` | `def fetch_chunk(sess: PoliteSession, pmids: list[str]) -> dict` | Resolve PMIDs to DOI, PMCID, OA flags, title, and abstract through one Europe PMC batch query. | Rung 3 literature | `ladder.rung3_literature` does single search/result handling for metadata that the crosswalk already fetches in typed batches.

17. `oa68k/registry_ids.py` | `def find_all(text: str) -> dict[str, list[str]]` | Extract NCT, ISRCTN, PACTR, CTRI, ChiCTR, EudraCT, and other registry accessions from text. | Rung 2 registry; Rung 5 protocols | `ladder.py` is NCT-centered and lacks a multi-registry key extractor.

18. `oa68k/keyscan.py` | `def scan(corpus: str, limit: int | None = None) -> dict` | Scan cached OA full text for the paper's own registry accession while excluding citations/tables by JATS zone. | Rung 2/Rung 3 key recovery | `ladder.rung3_literature` searches papers but does not recover non-NCT or missing-NCT keys from held full text.

19. `oa68k/linkmap.py` | `def ncts_for(self, pmids) -> set[str]` | Resolve PMID sets to NCTs through a DERIVED/RESULT-filtered map. | Rung 2 to Rung 3 bridge | `ladder.rung3_literature` uses first PMID/PMCID candidates without this typed PMID-to-NCT link layer.

20. `oa68k/refmatch.py` | `def ref_entries(xml_bytes: bytes) -> list[dict]` | Extract PMID-bearing JATS references with surname keys and publication year. | Rung 1 prior metas | `ladder.rung1_prior_meta` scopes by trial name only and does not use the prior meta's own reference list.

21. `oa68k/refmatch.py` | `def match_label(label: str, refs: list[dict], year_slack: int = 1) -> dict` | Resolve a forest-plot study label to exactly one PMID, rejecting ambiguity. | Rung 1 prior metas | `ladder.py` would otherwise have to rewrite author-year label matching for prior-meta forest rows.

22. `oa68k/refjoin.py` | `def ref_entries_full(xml_bytes: bytes) -> list[dict]` | Extract every JATS reference, including DOI-only refs and citation text. | Rung 1 prior metas; Rung 3 literature | `ladder.rung1_prior_meta` ignores DOI-only prior-meta references that are still resolvable identities.

23. `oa68k/refjoin.py` | `def resolve(label: str, refs: list[dict]) -> dict` | Resolve a study label by acronym, surname-year, or surname-only paths with ambiguity rejection. | Rung 1 prior metas | `ladder.py` has no reusable identity resolver for trial acronyms or yearless labels in prior metas.

24. `oa68k/forestvision.py` | `def check_extraction(doc: dict) -> dict` | Check a forest-plot extraction for row arithmetic and structural consistency. | Rung 1 prior-meta tables/figures | `ladder.py` treats an extracted value as a value but does not validate over-determined forest-plot rows.

25. `oa68k/ladder_store.py` | `def emit(rec, path: str, strict: bool = True) -> dict` | Gate writes of ladder records, refusing contradictory states, missing provenance, and unearned absence verdicts. | cross-cutting write path | `ladder.main` prints records directly and bypasses the existing write-path validation.

## Already Duplicated By `ladder.py`

Checked duplicate/missing concerns: 10/10 named below. Straightforward means the
existing callable can be wrapped without changing the ladder state model. Stand
apart means the existing code serves a different population or lacks the
single-request return shape that `ladder.py` needs.

1. `net.PoliteSession` vs `ladder._get`

`ladder._get` duplicates bounded GET retries, headers, and backoff. Delegating is
mostly straightforward: time the call around `PoliteSession.get`, preserve
`Attempt.seconds`, and convert final exceptions/status codes into ladder
`FAILED` attempts. Real reason to keep a thin ladder wrapper: `PoliteSession.get`
raises on final request exceptions while `ladder._get` returns `(None, seconds,
error)`.

2. `net.append_jsonl` / `net.load_done_keys` and `ladder_store.emit` vs no
ladder ledger

This is not a duplicate so much as an omission. `ladder.py` has `Attempt` and
`Record` types, but it does not append a durable ledger or skip completed
requests. Delegating is straightforward: write completed records through
`ladder_store.emit` and use `load_done_keys` on a request key.

3. `harvest.fetch_fulltext` vs `ladder.rung3_literature`

`ladder.rung3_literature` duplicates the EPMC/PMC full-text retrieval step.
Delegating is straightforward once a PMCID is known: pass a row containing
`pmcid`, `pmid`, `doi`, and `source` to `harvest.fetch_fulltext`. Real reason the
ladder stands apart: rung 3 also has to discover the candidate PMID/PMCID from a
single trial request before a cacheable full-text row exists.

4. `jats.all_text` / `jats.parse_tables` vs `ladder._xml_text`

`ladder._xml_text` reimplements XML-to-text by regex. Delegating text extraction
to `jats.all_text` is straightforward for valid XML bytes. `ladder._xml_text`
can remain only as a fallback for non-XML blobs such as OpenFDA label fragments.
For prior-meta tables, `jats.parse_tables` is the stronger delegate because it
keeps headers and cells.

5. `config.py` constants vs inline URLs and User-Agent in `ladder.py`

`ladder.py` duplicates `EPMC_SEARCH`, `EPMC_FULLTEXT`, and its User-Agent string
instead of importing `config.EPMC_SEARCH`, `config.EPMC_FULLTEXT`, and
`config.USER_AGENT`. Delegating is straightforward for EPMC and User-Agent.
Real reason `ladder.py` stands apart today: `config.py` does not currently define
the CT.gov v2/history URLs or OpenFDA label/drugsfda URLs.

6. `fda.py` vs `ladder.rung4_regulatory`

`ladder.rung4_regulatory` duplicates FDA discovery through live OpenFDA probes
and guessed review addresses. `fda.ingest`, `fda.harvest`, and
`fda.extract_and_link` already own official FDA application-document inventory,
review PDF fetching, and protocol-code linking. Delegating document discovery is
straightforward after FDA store creation. Real reason the ladder stands apart:
`fda.py` still stops at PDF/code/link extraction and does not return a
ladder-shaped effect value.

7. `obtainability.earn_unobtainable` vs `ladder.State.GENUINELY_UNOBTAINABLE`

`ladder.py` defines `GENUINELY_UNOBTAINABLE` but does not call the only grant
path in `obtainability.py`. Delegating is straightforward whenever a rung wants
to mark a datum absent from an enumerated register. Real reason the ladder stands
apart: most rung misses are search/retrieval misses and should remain
`NOT_YET_FOUND`, not absence verdicts.

8. `registry_full.py` / `preextract.py` vs `ladder.rung2_registry`

`ladder.rung2_registry` reimplements a small live CT.gov outcome read. The
existing registry modules already materialize CT.gov/AACT trials, arms,
outcomes, results, AE tables, sites, and references with provenance. Delegating
is partly straightforward for store-backed lookups. Real reason the ladder
stands apart: `ladder.rung2_registry` reads the current CT.gov v2 JSON and probes
the `/api/int/studies/<NCT>/history` route; the opened registry modules use the
AACT snapshot and do not parse CT.gov history `originalData`.

9. `refmatch.py`, `refjoin.py`, and `linkmap.py` vs `ladder.rung1_prior_meta`

`ladder.rung1_prior_meta` searches for prior metas naming the trial and scans a
text window. The existing identity layer resolves forest labels and references
through JATS refs, DOI/PMID, and DERIVED/RESULT-filtered PMID-to-NCT maps while
rejecting ambiguous joins. Delegating is straightforward for prior-meta
reference/list identity work. Real reason the ladder stands apart: it currently
seeks a scalar effect from free text, while these modules mostly provide identity
and validation pieces, not a complete scalar extractor.

10. `registry_ids.py`, `keyscan.py`, and `isrctn.py` vs the NCT-only ladder

`ladder.py` accepts only one `nct` field and rung 5 only checks CT.gov
`largeDocs`. The opened modules already extract non-NCT accessions from text and
ingest ISRCTN protocol records. Delegating key extraction is straightforward.
Real reason the ladder stands apart: ISRCTN records are protocol/registration
sources, not result sources, so they should expand keys and protocol evidence
rather than pretend to supply a poolable effect.

## Genuine Gaps

Gap statements below are based on the 25/25 opened candidate files plus repo
searches for the named surfaces.

1. Prior-meta scalar table extractor.

No opened module takes `Request(trial, field_path, outcome)` plus JATS prior-meta
tables and returns the exact requested trial/outcome effect as a ladder `Attempt`.
Pieces exist: `jats.parse_tables`, `refmatch`, `refjoin`, and `forestvision`.

2. CT.gov history `originalData` parser.

`ladder._history_probe` records that the history route returned bytes, but no
opened module parses version-history `originalData` into outcome analyses or
differences from current posted results.

3. DOI-to-full-text acquisition outside PMC.

Opened modules resolve DOI/PMCID and fetch PMC/EPMC/NCBI full text. I did not
find a repo callable that starts from a DOI and retrieves publisher OA full text
when the paper is not in PMC.

4. Regulatory effect extraction from review PDFs.

`fda.harvest` fetches review PDFs and `fda.extract_and_link` extracts protocol
codes with `pdfplumber`, but no opened module extracts a requested HR/RR/OR and
CI from FDA review text/tables into a ladder value.

5. EMA EPAR document fetch and parser.

`obtainability.build_ema_enumeration` enumerates EMA medicines for absence
claims. No opened module fetches EPAR assessment reports for a present medicine
and extracts trial-level effects.

6. Protocol/SAP document parser.

`ladder.rung5_protocol` records CT.gov large-document availability, and ISRCTN
ingest records registered outcomes. No opened module downloads and parses posted
protocol/SAP documents into structured planned outcomes or analysis rules.

7. Cross-source reconciliation function.

`ladder_store.emit` requires a `reconciliation` field for `prior_meta_table`
values, but no opened module computes reconciliation between prior-meta,
registry, primary-report, and regulatory values.

8. Request enrichment.

`ladder.py` expects trial name, aliases, NCT, drug, PMID, or DOI to be supplied.
No opened module builds that request object from a topic/PICO/search result while
typing each identifier and alias source.

9. Ladder-shaped adapters for existing batch modules.

Most reusable modules return batch summaries, parquet/JSONL rows, or detector
records. No opened module wraps those outputs into `ladder.Attempt` objects with
`outcome`, `payload_sha256`, `retrieved_utc`, and `provenance_tier`.
