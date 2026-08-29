# REUSE INVENTORY

Question: for a five-rung data-finder ladder, what already exists that should be called rather than rewritten?

## Coverage
- Worktree Python files inspected for grep candidates: 822/822.
- oa68k top-level Python modules rowed: 78/78.
- Non-oa68k Python grep-hit files inspected: 351/744.
- Non-oa68k source grep-hit files rowed below: 81/351; excluded grep hits are listed by path in Appendix A.
- Regulatory side-tree Python files inspected: 20/20; grep-hit files rowed: 13/20.
- Data files inventoried under oa68k/data: 3/3.
- Data files inventoried under F:/allmeta/regulatory/data: 55/55.

Rung key: 0 = infrastructure; 1 = prior meta-analyses; 2 = ClinicalTrials.gov/registry posted results and history; 3 = Europe PMC/NCBI/PMC/DOI full text and parsers; 4 = regulator documents; 5 = protocols/SAPs; - = no ladder implementation.

## oa68k Modules
| path | purpose | public_functions | rung |
| --- | --- | --- | --- |
| oa68k/aact_ext.py | Stage 0b - convert the AACT tables the parquet mirror does NOT carry. | `convert_one(con, flat_root: str, table: str, force: bool = False) -> dict`<br>`run(only: list[str] \\| None = None, force: bool = False) -> list[dict]` | 2,4 |
| oa68k/adjbatch.py | Emit BLIND re-identification batches for the label->ref precision gate. | `main() -> int` | 1,3,4 |
| oa68k/adjscore.py | Score the blind adjudication against the matcher -> MEASURED PRECISION. | `main() -> int` | 3,4 |
| oa68k/behaviour.py | FOREST PLOT AS BEHAVIOURAL RECORD - the inclusion record, recovered. | `extract_one(fig)`<br>`double_count_candidates(rec, figrows=None)`<br>`load_batch()`<br>`summarise(recs)`<br>`main()` | 1,2,3 |
| oa68k/bendlink.py | BENDLINK - link a forest-plot inclusion to the trial's OWN registry record. | `parse_refs(pmcid: str) -> list[dict]`<br>`label_key(label: str) -> tuple[str \\| None, int \\| None]`<br>`match_ref(surname, year, refs, year_slack=1)`<br>`load_pmid2nct() -> dict[str, list[str]]`<br>`load_trials() -> pd.DataFrame`<br>`main()` | 1,2,3 |
| oa68k/breadthaudit.py | BREADTH x LICENCE - does "maximum public" buy a narrower gold set? | `classify(url: str) -> str`<br>`wilson(k, n, z=1.96)`<br>`norm_pub(s: str) -> str`<br>`main()` | 1,2,3 |
| oa68k/build_done_global.py | Build the cross-node DONE set - the thing that makes re-sharding safe. | `collect() -> set[str]`<br>`write(done: set[str]) -> str` | 2,3 |
| oa68k/cohorts.py | Disease cohorts - malaria / TB / HIV / NCD, reported SEPARATELY. | `classify(condition_text: str \\| None) -> dict`<br>`build() -> dict`<br>`cohort_table() -> str`<br>`report() -> dict` | 1,2,3,4 |
| oa68k/compare_dupes.py | INTER-READER AGREEMENT - where two lanes read the SAME image independently. | `load()`<br>`studies(parsed)`<br>`is_forest(parsed)`<br>`num(a, b)`<br>`main() -> int` | 1,2,4 |
| oa68k/config.py | oa68k configuration - root discovery, fail-closed. | `reqs_per_sec() -> float`<br>`node_ledgers(stem: str) -> list[str]`<br>`in_shard(pmcid: str, shard_id: int, shard_count: int) -> bool`<br>`ensure_dirs() -> None`<br>`find_aact() -> str \\| None`<br>`require_aact() -> str`<br>`find_aact_flat() -> str \\| None`<br>`require_aact_flat() -> str`<br>`ext_table(name: str) -> str \\| None` | 1,2,3,4 |
| oa68k/coverage.py | The coverage ledger - what the store ACTUALLY holds, per field, batch-actual. | `report(fields: bool = False) -> dict` | 1,2,3 |
| oa68k/crosswalk.py | Stage T2 - the NCT <-> PMID <-> DOI <-> PMCID crosswalk, and the OA/abstract | `collect_pmids(link_types_only: bool = True) -> list`<br>`fetch_chunk(sess: PoliteSession, pmids: list[str]) -> dict`<br>`run(limit: int \\| None = None, all_: bool = False, include_background: bool = False) -> dict` | 1,2,3 |
| oa68k/defectmine.py | DEFECT MINE - surface published-figure defects the vision readers flagged. | `main() -> int` | 1 |
| oa68k/detect2.py | Stage 3-v2 - TABLE-SCOPED detection + reference link layer (Phase 2). | `analyse(xml_bytes: bytes, lm: LinkMap \\| None = None) -> dict`<br>`ledger_path() -> str`<br>`run(limit: int) -> dict` | 1,2,3,4 |
| oa68k/detect3.py | Stage 3-v3 - COLUMN-SEMANTIC error detection over JATS tables (Phase 2). | `classify_column(header: str) -> str`<br>`scan_table(tbl: dict) -> tuple[list, list, dict]`<br>`analyse(xml_bytes: bytes, lm: LinkMap \\| None = None) -> dict`<br>`ledger_path() -> str`<br>`run(limit: int) -> dict` | 1,2,3,4 |
| oa68k/dta_detect.py | Stage T4 - DTA 2x2 detection over OA full-text tables. PRECISION-first. | `classify_table(headers: list[str], caption: str = "", n_rows: int = 0) -> dict`<br>`run(corpus: str = "dta") -> dict` | 1,3,4 |
| oa68k/epmc_seed.py | Parameterised Europe PMC corpus seeder (cursorMark, resumable). | `seed_path(corpus: str) -> str`<br>`state_path(corpus: str) -> str`<br>`seed(corpus: str, query: str, max_rows: int \\| None = None) -> dict`<br>`load_seed(corpus: str, priority_first: bool = True) -> list[dict]` | 1,2,3,4 |
| oa68k/eraprobe.py | ERA x LICENCE - EXACT counts from EPMC. No sampling, no cursorMark. | `hits(q: str)`<br>`era_q(lo, hi)`<br>`main()` | 1,2,3,4 |
| oa68k/eraseed.py | ERA RE-SEED - page the FULL id list per era stratum. Checkpointed, resumable. | `fetch(q, cursor)`<br>`load_state()`<br>`save_state(s)`<br>`seen_ids()`<br>`run()`<br>`summary()` | 1,3 |
| oa68k/fda.py | Stage R1 - Drugs@FDA regulatory review documents. THE LESS-SELECTED SAMPLE. | `ingest() -> dict`<br>`harvest(limit: int = 50) -> dict`<br>`extract_and_link(limit: int \\| None = None) -> dict` | 2,3,4,5 |
| oa68k/figfetch.py | Stage F2 - fetch forest-plot image bytes for figures located by figscan. | `resolve_article(pmcid: str, cache: dict) -> dict`<br>`fetch_fig(pmcid: str, href: str, cache: dict) -> dict`<br>`forest_targets(only_pmcids: set \\| None = None) -> list[tuple[str, str]]`<br>`run(limit: int \\| None, pmcids: set \\| None = None) -> dict` | 3,4 |
| oa68k/figscan.py | Stage F1 - locate forest-plot figures in already-harvested JATS. | `classify(caption: str, label: str) -> tuple[str, str]`<br>`scan_xml(pmcid: str, xml_bytes: bytes) -> list[dict]`<br>`run(limit: int \\| None) -> dict`<br>`summary() -> dict` | 1,3 |
| oa68k/forestgold.py | Stage F5 - score vision-read forest rows against AACT registry ground truth. | `label_to_nct(pmcid: str, labels: list[str]) -> dict`<br>`score_arm_sizes(read_rows: list[dict], nct_info: dict) -> dict` | 2,3,4 |
| oa68k/forestrate_era.py | FOREST-PLOT RATE **PER ERA** - the hole I named in my own pre-registration. | `wilson(k, n, z=1.96)`<br>`newcombe(k1, n1, k2, n2, z=1.96)`<br>`fetch_jats(pmcid: str) -> bytes \\| None`<br>`main()` | 3 |
| oa68k/forestscore.py | Stage F6 - score the vision extractions. The number that decides go/no-go. | `load() -> list[dict]`<br>`score_checksum(docs: list[dict]) -> dict`<br>`score_arithmetic(docs: list[dict]) -> dict`<br>`score_registry(docs: list[dict], max_metas: int \\| None = None) -> dict` | 2,3,4 |
| oa68k/forestvision.py | Stage F4 - the vision extraction contract, and the checks that police it. | `recompute_dichotomous(r: dict, measure: str) -> dict \\| None`<br>`check_row(r: dict, measure: str, tol_log: float = 0.15, tol_lin: float = 0.05) -> dict`<br>`check_extraction(doc: dict) -> dict` | 1,2,4 |
| oa68k/fulltext.py | Stage T3 - OA full text for the TRIAL papers (layer 3 of the three-layer rule). | `ft_ledger(corpus: str) -> str`<br>`tables_dir(corpus: str) -> str`<br>`candidates() -> list[dict]`<br>`fetch_or_cached(sess: PoliteSession, c: dict) -> dict`<br>`seed_candidates(corpus: str) -> list[dict]`<br>`run(limit: int \\| None, all_: bool = False, corpus: str = "linked_rct") -> dict` | 1,2,3,4 |
| oa68k/geo.py | African-site classification for registry trial locations. | `normalize_country(name: str \\| None) -> str`<br>`is_african_country(name: str \\| None) -> bool`<br>`unknown_countries(names) -> set`<br>`africa_sql_list() -> str` | 2,4 |
| oa68k/goldframe.py | GOLD SET stage 0 - the frame, and the honest n. | `wilson(k, n, z=1.96)`<br>`main()` | 1,3,4 |
| oa68k/goldsample.py | GOLD-SET FRAME - 0b enforced AT INGEST, with an executable how_drawn. | `draw()`<br>`mesh_tags(pmcids)`<br>`must_contain(pmcids)`<br>`main()` | 1,2,3,4 |
| oa68k/harvest.py | Stage 2 - HARVEST: fetch + cache full-text XML for a batch of OA metas. | `fetch_fulltext(sess: PoliteSession, row: dict) -> dict`<br>`run(limit: int, shard_id: int = 0, shard_count: int = 1, workers: int \\| None = None) -> dict` | 3,4 |
| oa68k/holdout_freeze.py | FREEZE THE MALARIA/TB TRANSFER HOLDOUT - pre-specified, timestamped, never tuned on. | `freeze(n: int) -> int`<br>`is_held_out(pmcid: str) -> bool` | 1,2,3 |
| oa68k/ingest.py | Stage 1 - INGEST: build the seed ledger of all OA meta-analyses. | `run(max_rows: int \\| None = None) -> dict` | 1,3 |
| oa68k/ingest_agent.py | Ingest agent-route vision output into the store, and score it. | `checksum(fig)`<br>`main()` | 2,3,4 |
| oa68k/ingest_raw.py | INGEST - subagent vision returns (data/_visionraw/*.json) -> shard B. | `load_index() -> dict`<br>`ingest_file(path: str, idx: dict, dry: bool = False) -> tuple`<br>`main() -> int` | 3 |
| oa68k/integrity.py | Stage R2 - trial-integrity signals: Retraction Watch + Crossref/OpenAlex. | `retraction_watch() -> dict`<br>`link() -> dict` | 2,3,4 |
| oa68k/isrctn.py | Stage R3 - ISRCTN: the trials an NCT join structurally cannot see. | `probe() -> dict`<br>`ingest(queries: list[str], max_per_query: int \\| None = None) -> dict` | 1,2,3,4,5 |
| oa68k/jats.py | JATS parsing - structured tables (with column headers) + reference PMIDs. | `parse_tables(xml_bytes: bytes) -> list[dict]`<br>`ref_pmids(xml_bytes: bytes) -> set[str]`<br>`all_text(xml_bytes: bytes) -> str` | 3,4 |
| oa68k/keyaudit.py | THE KEY-ABSENT vs DATA-ABSENT AUDIT - the table that decides this lane's priority. | `disease_of(text: str) -> list[str]`<br>`run(limit: int) -> dict` | 1,2,3,4 |
| oa68k/keyscan.py | Stage T9 - recover the KEY from the paper's own full text. Offline, free. | `scan(corpus: str, limit: int \\| None = None) -> dict` | 1,2,3,4,5 |
| oa68k/ladder.py | THE DATA-FINDER LADDER -- five rungs, four states, yield measured per rung. | `extractor()`<br>`extract_effect(text: str, req: Request) -> dict \\| None`<br>`rung1_prior_meta(session, req: Request) -> Attempt`<br>`rung2_registry(session, req: Request) -> Attempt`<br>`rung3_literature(session, req: Request) -> Attempt`<br>`rung4_regulatory(session, req: Request) -> Attempt`<br>`rung5_protocol(session, req: Request) -> Attempt`<br>`climb(req: Request, session=None, stop_at_first_hit: bool = True, only: list \\| None = None) -> Record`<br>`yield_report(records: list) -> dict`<br>`print_yield(rep: dict) -> None`<br>`main() -> int` | 1,2,3,4,5 |
| oa68k/ledger.py | Coverage ledger - the standing job's scoreboard over the full 68k. | `report() -> dict` | 2,3 |
| oa68k/licenceaudit.py | ROUTE 3 - THE LICENCE COUNT. Runs FIRST, before anything is built. | `classify(url: str) -> str`<br>`wilson(k, n, z=1.96)`<br>`main()` | 1,3,4 |
| oa68k/linkfunnel.py | Phase-2 diagnostic - WHY does a meta fail to yield a poolable linked trial? | `load_preextract() -> dict`<br>`run() -> dict` | 2,3 |
| oa68k/linkmap.py | The PMID->NCT link layer (Phase 2) - AUTHORITATIVE, reference_type-filtered. | `find_sqlite_index() -> str \\| None` | 1,2,3 |
| oa68k/merge.py | Cross-shard MERGE + reconciliation guard. | `check_disjoint() -> dict`<br>`main() -> None` | 2,3 |
| oa68k/net.py | Polite, bounded-retry HTTP + durable checkpoint helpers. | `atomic_write_json(path: str, obj) -> None`<br>`append_jsonl(path: str, obj) -> None`<br>`load_done_keys(path: str, key: str) -> set` | 3 |
| oa68k/nextbatch.py | DISPATCH PLANNER - emit the next N un-read figures, collision-safe. | `covered() -> tuple`<br>`main() -> int` | 3,4,5 |
| oa68k/nma_export.py | Stage T6 - emit the registry store in the shape `bias-adjusted-nma-adv` eats. | `export_dir(cohort: str \\| None) -> str`<br>`normalize_treatment(title: str \\| None) -> tuple[str, bool]`<br>`treatment_id(label: str) -> str`<br>`build(cohort: str \\| None = None) -> dict`<br>`summary(cohort: str \\| None = None) -> dict` | 1,2,4,5 |
| oa68k/obtainability.py | GENUINELY_UNOBTAINABLE must be EARNED. This module is the only thing that can grant it. | `normalise_key(k: str) -> str`<br>`earn_unobtainable(query_key: str, enumeration, evidence_kind: EvidenceKind) -> Verdict`<br>`ema_extract_names(payload: bytes) -> list`<br>`build_ema_enumeration(positive_control: str = "Ferinject") -> Enumeration`<br>`main() -> int` | 1,2,4 |
| oa68k/outcometype.py | OUTCOME TYPE - the stratum that is the mission, not a stratum. | `classify(cap: str) -> str`<br>`wilson(k, n, z=1.96)`<br>`selftest()`<br>`main()` | 1,2,3 |
| oa68k/papers_union.py | Stage T10 - widen `papers` to every paper we hold, not only AACT-sourced ones. | `build() -> dict` | 2,3 |
| oa68k/parse_detect.py | Stage 3 - PARSE + DETECT: structure signals, trial links, error patterns. | `analyse(xml_bytes: bytes) -> dict`<br>`run(limit: int) -> dict` | 1,2,3 |
| oa68k/preextract.py | Stage 4 - PRE-EXTRACT: registry-direct structured records for linked trials. | `collect_ncts() -> set`<br>`run(chunk: int = 500) -> dict` | 2,3,4 |
| oa68k/quarantine_v1.py | Stamp the v1 (native-resolution) cohort with its quarantine status. | `main() -> int` | 1,3 |
| oa68k/reconcile.py | Reconcile node ledgers to the CURRENT partition after a re-shard. | `analyse(shard_count: int) -> dict`<br>`canonical(pmcid: str, shard_count: int) -> str \\| None`<br>`apply(shard_count: int, dupes: dict) -> dict` | 2,3 |
| oa68k/refjoin.py | THE IDENTITY LAYER - forest-plot label -> the meta's OWN ref-list -> DOI/PMID -> NCT. | `vision_ledgers() -> list[str]`<br>`wilson(k: int, n: int) -> tuple[float, float, float]`<br>`fmt(k: int, n: int) -> str`<br>`pmcid_of(source_id: str) -> str`<br>`load_labels() -> list[dict]`<br>`ref_entries_full(xml_bytes: bytes) -> list[dict]`<br>`jats_path(pmcid: str) -> str`<br>`load_refs(pmcid: str)`<br>`surname_candidates(label: str, refs: list[dict], year_slack: int = 1) -> list[int]`<br>`is_acronym_label(label: str) -> bool`<br>`match_acronym(label: str, refs: list[dict]) -> dict`<br>`label_surname(label: str) -> str`<br>`match_surname_only(label: str, refs: list[dict]) -> dict`<br>`resolve(label: str, refs: list[dict]) -> dict`<br>`pmid_to_nct() -> dict`<br>`is_cardio(pmcid: str, titles: dict) -> bool`<br>`jats_title(pmcid: str) -> str`<br>`load_titles(pmcids=None) -> dict`<br>`run_funnel(cardio_only: bool = False, verbose: bool = True, subset: str = "", keep_all_matched: bool = False) -> dict`<br>`excluded_prevalence(limit: int = 0, corpus: int = 0, seed: int = 20260717) -> dict`<br>`discovery(limit: int = 0) -> dict`<br>`adjudicate_sample(n: int, seed: int = 20260717, all_matched: bool = True) -> list[dict]`<br>`main() -> int` | 1,2,3,4 |
| oa68k/refmatch.py | Stage F3 - the link a forest plot does not carry: row label -> PMID -> NCT. | `norm_name(s: str) -> str`<br>`parse_label(label: str) -> tuple[str, str, str] \\| None`<br>`ref_entries(xml_bytes: bytes) -> list[dict]`<br>`match_label(label: str, refs: list[dict], year_slack: int = 1) -> dict` | 1,2,3 |
| oa68k/registry_full.py | Stage T1 - FULL registry pre-extraction over the whole CT.gov RCT universe. | `connect()`<br>`universe_path() -> str`<br>`build_universe(con, batch_size: int = BATCH_SIZE, rebuild: bool = False) -> dict`<br>`extend_universe(con, batch_size: int = BATCH_SIZE) -> dict`<br>`batch_path(table: str, batch_id: int) -> str`<br>`run_batch(con, batch_id: int) -> dict`<br>`run(limit: int \\| None, do_all: bool = False, shard_id: int = 0, shard_count: int = 1) -> dict`<br>`status() -> dict` | 1,2,4,5 |
| oa68k/registry_ids.py | Multi-registry identifier extraction - widening the JOIN KEY beyond NCT. | `find_all(text: str) -> dict[str, list[str]]`<br>`classify(ids: dict[str, list[str]]) -> str`<br>`non_nct_registries(ids: dict[str, list[str]]) -> list[str]` | 2,3 |
| oa68k/repair_gradient.py | ONE-OFF REPAIR - rebuild `confidence_emitted` across ALL rows. | `main() -> int` | 0 |
| oa68k/repair_promptver.py | ONE-OFF REPAIR - un-lie the prompt_version on shard B. | `main() -> int` | 0 |
| oa68k/reparse_tables.py | Backfill table CELLS + raw XML from the cached JATS. ZERO network calls. | `run(corpus: str = "linked_rct", batch: int = 2000) -> dict` | 2,3,4 |
| oa68k/run_batch.py | The STANDING JOB - one batch: harvest -> parse+detect -> preextract -> ledger. | `main(batch: int, skip_preextract: bool, shard_id: int, shard_count: int) -> None` | 2 |
| oa68k/shardA_report.py | SHARD-A CHECKPOINT - what the run has actually banked, re-runnable from disk. | `load()`<br>`main() -> int` | 2,4 |
| oa68k/shardA_worklist.py | SHARD-A WORKLIST - decide which figures this lane reads next, and batch them. | `topic_of(text: str) -> str`<br>`reserved() -> set`<br>`reserve(shas) -> None`<br>`build() -> list`<br>`main() -> int` | 1,3 |
| oa68k/shardwrite.py | SHARD-B WRITER - append vision calls to our own shard of the vision store. | `sha256_file(path: str) -> str`<br>`all_ledgers() -> list`<br>`seen_keys() -> set`<br>`stash_blob(image_path: str, sha: str) -> str`<br>`record(*, image_path, role, model_id, prompt_version, raw_response, route="agent_read", parsed=None, parser_version=None, source_kind=None, source_id=None, tokens_in=None, tokens_out=None, cost_usd=None, notes=None, call_ts=None, call_group=None, allow_duplicate=False)`<br>`ingest(path: str) -> int`<br>`verify() -> int` | 2,4 |
| oa68k/standing.py | The standing job for the pre-extraction layer - one stream, priority order. | `cycle(slice_n: int = SLICE) -> list[dict]` | 2,3,4 |
| oa68k/status.py | Live fleet status -> one WATCHDOG-LOG.md line per advance. | `counts() -> dict`<br>`poolable() -> int`<br>`now() -> str`<br>`main(action: str, link: str) -> None` | 2 |
| oa68k/test_bendlink.py | Regression tests for bendlink's label->surname parse. | `test_accented_surname_survives()`<br>`test_accented_surname_matches_its_ref()`<br>`test_label_templates()`<br>`test_initials_are_not_surnames()`<br>`test_no_year_is_none_not_guessed()`<br>`test_non_author_label_yields_no_usable_surname()`<br>`test_ambiguous_match_is_dropped_not_guessed()`<br>`test_year_slack_one_absorbs_online_first()`<br>`test_year_slack_does_not_reach_two()`<br>`test_no_surname_never_matches()` | 3 |
| oa68k/tier2_extract.py | Stage 3 (LAPTOP) - TIER-2 off-corpus extraction via agy->Gemini. | `agy_liveness() -> tuple[bool, str]`<br>`targets() -> list[dict]`<br>`extract_one(abstract: str) -> dict`<br>`run(limit: int, fetch_abstract) -> dict` | 1,2,3 |
| oa68k/transport.py | Stage T7 - transportability covariates. WHO was actually enrolled. | `build() -> dict`<br>`report() -> dict` | 2,3,4 |
| oa68k/trial_index.py | Stage T5 - the distilled, shippable per-trial index. ONE row per trial. | `build() -> dict`<br>`summary() -> dict` | 1,2,3,4 |
| oa68k/trial_key_audit.py | TRIAL-LAYER key audit - the honest DATA-ABSENT vs KEY-ABSENT test. | `fetch_pubmed(sess: PoliteSession, pmids: list[str]) -> dict`<br>`ref_pmids_of_metas(limit_metas: int) -> list[tuple[str, list[str]]]`<br>`run(sample: int, meta_scan: int) -> None` | 1,2,3 |
| oa68k/visioncost.py | VISION COST - what does 180/month actually buy? Measured, not projected. | `per_figure_usd(model: str, img_tokens: int, batch: bool) -> float`<br>`main()` | 1,4 |
| oa68k/visionshard.py | SHARD-A WRITER - bank live `agent_read` vision calls without touching the | `seen_shard() -> set`<br>`owner_keys() -> set`<br>`ingest_file(path: str, seen: set, owner: set \\| None = None) -> dict`<br>`ingest_duplicate(path: str, why: str) -> int`<br>`ingest_dir(d: str) -> int`<br>`verify() -> int` | 2,3,4 |
| oa68k/visionstore.py | VISION STORE - the evidence ledger for non-reproducible model calls. | `sha256_file(path: str) -> str`<br>`seen_keys() -> set`<br>`stash_blob(image_path: str, sha: str) -> str`<br>`record(*, image_path, role, model_id, prompt_version, raw_response, route="agent_read", parsed=None, parser_version=None, source_kind=None, source_id=None, tokens_in=None, tokens_out=None, cost_usd=None, notes=None, call_ts=None, allow_duplicate=False)`<br>`read_all()`<br>`verify()`<br>`backfill()` | 2,3,4 |
| oa68k/withholding.py | Stage T8 - the withholding / non-publication signal, by PHASE. | `build() -> dict`<br>`report() -> dict` | 1,2,3,4 |

## Other Worktree Python Source Matches
| path | purpose | public_functions | rung | matched_terms |
| --- | --- | --- | --- | --- |
| audit/classifier.py | Runtime-audit classifier. Six states, first-match-wins. | `filter_console_errors(errors: list[str]) -> list[str]`<br>`classify(probe: dict) -> dict` | 1 | table |
| audit/render.py | Emit runtime-health.{json,csv,md,html} from per-app records. | `totals(records: list[dict]) -> dict[str, int]`<br>`render_json(records: list[dict], out_path: Path, *, audit_version: str, now_iso: str) -> None`<br>`render_csv(records: list[dict], out_path: Path) -> None`<br>`render_md(records: list[dict], out_path: Path, *, audit_version: str, now_iso: str) -> None`<br>`render_html(records: list[dict], out_path: Path, *, audit_version: str, now_iso: str) -> None` | 1,2 | table |
| dosehtml/dose-response-cli.py | Dose Response Pro v18.1 - Command Line Interface | `normal_ppf(p: float) -> float`<br>`normal_cdf(x: float) -> float`<br>`chi2_cdf_wilson_hilferty(x: float, df: int) -> float`<br>`invert_matrix(V: np.ndarray) -> np.ndarray`<br>`invert_block_diagonal(V_blocks: List[Dict]) -> List[Dict]`<br>`compute_log_rate_variance(cases: float, n: float) -> float`<br>`build_gls_covariance(study_points: pd.DataFrame, rho: float = 0.5) -> np.ndarray`<br>`build_relative_gls_inputs( study_points: pd.DataFrame, model_key: str ) -> Optional[Tuple[np.ndarray, np.ndarray, np.ndarray, int, float]]`<br>`is_positive_semidefinite(V: np.ndarray) -> bool`<br>`compute_Q_statistic( study_betas: np.ndarray, beta_pooled: np.ndarray, study_variances: np.ndarray, tau2: float ) -> float`<br>`estimate_tau2_moments( study_betas: np.ndarray, study_variances: np.ndarray ) -> float`<br>`solve_gls( points: pd.DataFrame, tau2_override: Optional[float] = None, model: str = 'gls', ci_level: float = 0.95 ) -> Dict`<br>`generate_predictions( beta: np.ndarray, var: np.ndarray, points: pd.DataFrame, model: str = 'quadratic', ci_level: float = 0.95, reference_dose: float = 0.0 ) -> List[Dict]`<br>`load_csv(filepath: str) -> pd.DataFrame`<br>`detect_columns(columns: List[str]) -> Dict[str, str]`<br>`save_results(results: Dict, output_path: str, format: str = 'json')`<br>`sanitize_for_json(value)`<br>`run_batch_analysis(batch_file: str, output_dir: str)`<br>`main()` | 1,4 | table |
| dosehtml/scripts/build_release_readiness_summary.py | Build machine-readable release readiness summary from benchmark/test artifacts. | `extract(pattern: str, text: str, cast: Callable[[str], Any], default: Any = None) -> Any`<br>`read_text(path: Path) -> str`<br>`load_json(path: Path) -> dict[str, Any]`<br>`build_summary(validation_dir: Path) -> dict[str, Any]`<br>`main() -> int` | 1,4 | table |
| dosehtml/scripts/cross_package_multipersona_review.py | Cross-package benchmark + multipersona review generator. | `now_utc_iso() -> str`<br>`read_json(path: Path) -> Any`<br>`write_json(path: Path, payload: Any) -> None`<br>`discover_rscript() -> str \\| None`<br>`discover_exec(names: list[str]) -> str \\| None`<br>`run_r_validation(rscript_path: str) -> dict[str, Any]`<br>`summarize_r_validation(r_json: dict[str, Any] \\| None) -> dict[str, Any]`<br>`summarize_sim_benchmark(sim_json: dict[str, Any] \\| None) -> dict[str, Any]`<br>`summarize_strict_r_benchmark(strict_json: dict[str, Any] \\| None) -> dict[str, Any]`<br>`summarize_external_tool_artifact(path: Path \\| None) -> dict[str, Any]`<br>`summarize_internet_references(path: Path \\| None) -> dict[str, Any]`<br>`summarize_tool_evidence( tool_name: str, artifact: dict[str, Any], internet_summary: dict[str, Any], ) -> dict[str, Any]`<br>`build_persona_votes( r_summary: dict[str, Any], sim_summary: dict[str, Any], strict_summary: dict[str, Any], stata_evidence: dict[str, Any], spss_evidence: dict[str, Any], ) -> list[dict[str, str]]`<br>`vote_summary(votes: list[dict[str, str]]) -> dict[str, int]`<br>`render_markdown_report( tool_statuses: list[ToolStatus], r_run: dict[str, Any], r_summary: dict[str, Any], sim_summary: dict[str, Any], strict_summary: dict[str, Any], stata_artifact: dict[str, Any], spss_artifact: dict[str, Any], internet_summary: dict[str, Any], stata_evidence: dict[str, Any], spss_evidence: dict[str, Any], votes: list[dict[str, str]], counts: dict[str, int], ) -> str`<br>`main() -> int` | 4 | table |
| evidenceos/src/evidenceos_engine.py | EvidenceOS report builder. | `fetch_json(url: str, params: dict[str, Any], timeout: int = 40) -> dict[str, Any]`<br>`fetch_sources(page_size: int = 100, works_per_page: int = 12) -> dict[str, Any]`<br>`write_json(path: Path, payload: dict[str, Any]) -> None`<br>`load_json(path: Path) -> dict[str, Any]`<br>`iso_today() -> str`<br>`parse_date(value: str \\| None) -> date \\| None`<br>`nested_get(data: dict[str, Any], path: tuple[str, ...], default: Any = None) -> Any`<br>`canonical_hash(payload: Any) -> str`<br>`normalize_text_list(values: list[Any] \\| None) -> list[str]`<br>`is_relevant_condition(conditions: list[str]) -> bool`<br>`extract_trial(study: dict[str, Any]) -> Trial`<br>`extract_trials(ctgov_payload: dict[str, Any]) -> list[dict[str, Any]]`<br>`extract_publications(openalex_payload: dict[str, Any]) -> list[dict[str, Any]]`<br>`count_recent(items: list[dict[str, Any]], field: str, anchor: str) -> int`<br>`summarize(trials: list[dict[str, Any]], publications: list[dict[str, Any]]) -> dict[str, Any]`<br>`build_report(sources: dict[str, Any]) -> dict[str, Any]` | 1,2,3,4,5 | clinicaltrials.gov, ClinicalTrials.gov, http, table, urllib |
| extractor_bridge/extract_meta.py | Thin, loosely-coupled CLI bridge to the rct-extractor-v2 cardiology/malaria | `main()` | 2 | table |
| glp1-obesity-mbnma/bayes_mbnma.py | EXPERIMENTAL - no external R oracle; validated only against its own Python output / internal MC coverage (split-Rhat + ESS); not for primary published estimates without independent confirmation. | `nlogpdf(x, m, s)`<br>`halfnormal_logpdf(x, s)`<br>`build(cdf)`<br>`make_logpost(agents, idx, d, y, v)`<br>`split_rhat(chain)`<br>`poth_js(sucra)`<br>`main()` | 2,3,4 | table |
| glp1-obesity-mbnma/benford_integrity.py | Benford first-digit integrity screen (method per benfordma: MAD + chi-square vs Benford) on the registry- | `first_digit(x)`<br>`screen(vals, label)` | 2,4 | table |
| glp1-obesity-mbnma/build_continuous_report.py | Self-contained continuous dose-response NMA report (offline HTML, inline SVG). | `emax(d, E, ED)`<br>`fit(a)`<br>`xpix(v)`<br>`cx(d)`<br>`cy(v)` | 1,2,4 | ClinicalTrials.gov, table |
| glp1-obesity-mbnma/build_rapidmeta_config.py | Wire the AACT-extracted obesity cohort into a rapidmeta-kit config, so the full | `trial_name(nct)`<br>`year(nct)` | 1,2,4 | table |
| glp1-obesity-mbnma/build_survival.py | Time-to-event arm: pull incretin survival/HR outcomes from AACT, identify the clinically-hard | (none) | 2,4 | table |
| glp1-obesity-mbnma/cinema_confidence.py | CINeMA network-confidence layer (Nikolakopoulou/Salanti 2020) for the recommendation contrast. | `node_summary(node)`<br>`level(r)` | 2,4 | table |
| glp1-obesity-mbnma/class2_pcsk9/build_pcsk9_rapidmeta_config.py | Assemble the rapidmeta-kit config for the PCSK9 class from the harvested per-trial LDL %-change table | (none) | 1,2,4 | table |
| glp1-obesity-mbnma/class2_pcsk9/harvest_pcsk9.py | GENERALITY TEST - repoint the registry-native pipeline to a SECOND drug class: PCSK9 inhibitors. | (none) | 2 | table |
| glp1-obesity-mbnma/class2_pcsk9/pcsk9_dashboard.py | GENERALITY depth (dashboard stage) for the PCSK9 class: render the repointed league + GRADE + transport | `league_cell(a, b)` | 2,3,4 | http, table |
| glp1-obesity-mbnma/class2_pcsk9/pcsk9_league.py | GENERALITY depth: promote the PCSK9 class from a core repoint to a fuller pipeline slice -- a COMPLETE | `certainty(i, j, crosses_null)` | 2,4 | TABLE, table |
| glp1-obesity-mbnma/class2_pcsk9/pcsk9_rapidmeta_harvest.py | PCSK9 per-trial LDL-C %-change harvest for the RapidMeta conversion -- the CONTINUOUS path (md/se), mirroring | `agent_of(title)`<br>`arm_se(row)`<br>`trial_name(nct)`<br>`year(nct)` | 1,2 | table |
| glp1-obesity-mbnma/class2_pcsk9/pcsk9_transport.py | GENERALITY depth (transport stage) for the PCSK9 class -- the analogue of the incretin pipeline's | `xpt(name)` | 2,3 | http, table, urllib |
| glp1-obesity-mbnma/class3_sglt2/build_sglt2_rapidmeta_config.py | Assemble the rapidmeta-kit config for the SGLT2 class from the harvested per-trial HR table | (none) | 1,2,4 | table |
| glp1-obesity-mbnma/class3_sglt2/sglt2_classeffect.py | GENERALITY class 3 - SGLT2 inhibitors: repoint to a HARD-OUTCOME class (HF/CV/renal HRs), exercising the | `pool(g)` | 1,2,4 | table |
| glp1-obesity-mbnma/class3_sglt2/sglt2_dashboard.py | GENERALITY depth (dashboard) for the SGLT2 class: render the Bayesian HF-hospitalisation league + GRADE | `cell(a, b)` | 2,3,4 | http, table |
| glp1-obesity-mbnma/class3_sglt2/sglt2_league_bayes.py | GENERALITY depth (Bayesian league) for the SGLT2 class -- promote class 3 from a core repoint to a full | `certainty(i, j, crosses0)` | 2,4 | table |
| glp1-obesity-mbnma/class3_sglt2/sglt2_rapidmeta_harvest.py | SGLT2 per-trial HF/CV-composite hazard-ratio harvest for the RapidMeta conversion -- the SURVIVAL/HR path | `trial_name(nct)`<br>`year(nct)` | 1,2 | table |
| glp1-obesity-mbnma/class3_sglt2/sglt2_transport.py | GENERALITY depth (transport stage) for the SGLT2 class -- the hard-outcome analogue of the PCSK9/incretin | `arr_nnt(hr_draws, base)` | 2 | table |
| glp1-obesity-mbnma/cnma_incretin.py | Component NMA (Welton 2009 / Ruecker 2020 additive contrast model) on the incretin RECEPTOR components. | `cnma_wls(X, TE, seTE)`<br>`eff_se(node)`<br>`predict(components)` | 2,4 | table |
| glp1-obesity-mbnma/concordance_battery.py | Multi-review concordance battery: score our registry-native results against MANY published obesity NMAs/ | (none) | 1,2,3,4 | table |
| glp1-obesity-mbnma/concordance_validation.py | External-validation keystone: concordance of our AUTOMATED, transparent GRADE/CINeMA outputs against | (none) | 1,2,3,4 | table |
| glp1-obesity-mbnma/dashboard.py | Single self-contained guideline dashboard: stitches the recommendation + Summary of Findings + Evidence- | `load(f)`<br>`loadtext(f)`<br>`esc(x)` | 1,2,3,4 | table |
| glp1-obesity-mbnma/decision_sensitivity.py | Decision-sensitivity / tipping-point analysis: GRADE leaves the minimal important difference (MID) and | `tipping(thresh)`<br>`x(v)`<br>`y(p)` | 4 | http |
| glp1-obesity-mbnma/discovery.py | Discover the full obesity weight-loss cohort for the post-2010 incretin agents. | `main()` | 2,4 | table |
| glp1-obesity-mbnma/entropy_transport.py | Entropy-balanced transported NMA (nmatransport method): upgrade the single-modifier gamma-transport to a | `ebal(X, target)` | 2 | table |
| glp1-obesity-mbnma/extend_surrogate.py | Extended surrogate validation: class-wide, estimation-error-adjusted trial-level surrogacy of WEIGHT | `pred(sval)` | 2,4 | table |
| glp1-obesity-mbnma/extract.py | Arm-level extractor: % change body weight from AACT (CT.gov mirror) for the | `parse_arm(title)`<br>`extract_nct(nct, OUTCOMES, OM, RG, OC)`<br>`main()` | 2,4 | table |
| glp1-obesity-mbnma/extract_full.py | Generalized arm-level extractor for the full obesity cohort (candidates.csv). | `parse_arm(title, desc='')`<br>`arms_for_outcome(oid, nct, OM, RG, OC, tf)`<br>`week_of(tf)`<br>`main()` | 1,2,4 | table |
| glp1-obesity-mbnma/fit_network.py | Two-stage model-based dose-response NMA on the full obesity cohort (arms_full.csv). | `week_of(tf)`<br>`emax(d, Emax, ED50)`<br>`node_of(agent, dose_mg, schedule)`<br>`contrasts(df, min_week=0)`<br>`fit_agent(sub)`<br>`poth_of(sucra)`<br>`poth_js(sucra)`<br>`analyze(cdf, label, out_json=None)`<br>`main()` | 2,4 | table |
| glp1-obesity-mbnma/fix1_medline_multistrategy.py | Fix 1: multi-strategy MEDLINE - is the 43% miss an artifact of a narrow obesity-weight string? | (none) | 1,2 | table |
| glp1-obesity-mbnma/grade_export.py | GRADEpro/iEtD export: turn our GRADE + CINeMA assessment into a standard, panel-ready Summary of | `td(x)` | 2,4 | table |
| glp1-obesity-mbnma/harvest_class_weight.py | Harvest weight-change effect (active-placebo) + primary MACE HR for the FULL incretin CVOT class | `baseline(nct)` | 2,4 | table |
| glp1-obesity-mbnma/harvest_cvot_weight.py | Harvest the WEIGHT-CHANGE secondary outcome from the incretin CVOT trials (same trials that report the | (none) | 2 | table |
| glp1-obesity-mbnma/joint_benefit_risk.py | Joint benefit-risk (#3): bivariate efficacy + safety on ONE coherent surface, instead of two separate | `dominated(r)` | 2,4 | table |
| glp1-obesity-mbnma/nhanes_microdata.py | Fix the requirement-3 gap: replace hardcoded NHANES marginals with REAL NHANES 2017-2020 microdata. | `xpt(name)`<br>`wmean(col)` | 4 | http, urllib |
| glp1-obesity-mbnma/nma_league.py | Full multi-comparison league table with per-comparison certainty. Re-fits the Bayesian NMA ONCE, | `certainty(i, j, cri, crosses0)` | 2,4 | table, TABLE |
| glp1-obesity-mbnma/nma_league_export.py | Render the multi-comparison league table (nma_league.json) as a panel-ready league SoF: a colour-coded | `cell(a, b)`<br>`th(x)` | 4 | table |
| glp1-obesity-mbnma/run_all.py | Master orchestrator for the registry-native synthesis system. Runs the pipeline stages in | (none) | 1,2,4 | table |
| glp1-obesity-mbnma/run_medline_compare.py | REAL literature arm: an independent MEDLINE (PubMed) search vs the registry-native cohort. | (none) | 1,2 | table |
| glp1-obesity-mbnma/surrogate_validation.py | Trial-level surrogate-endpoint validation (Buyse 2000 / Daniels-Hughes): is WEIGHT LOSS a valid surrogate | (none) | 2,4 | table |
| glp1-obesity-mbnma/survival_nma.py | Survival arm: pool the incretin CVOT/renal HRs (harvested via registry-ipd's harvest_trial from AACT) | `trial_hr(g)` | 2 | table |
| glp1-obesity-mbnma/trial_sequential.py | Trial Sequential Analysis (#5) with the LIVE pipeline. Is the cardiovascular evidence for semaglutide | `obf(t)` | 1,2,4 | table |
| glp1-obesity-mbnma/ubcma_reporting_bias.py | Complementary method #1 (frontier 4): UBCMA -- the INFERENTIAL pair to the registry-native ghost- | `sem_contrasts()`<br>`ivw(d)` | 1,2,4 | table |
| glp1-obesity-mbnma/validate_extraction.py | Stage-3 extraction-validation harness for the GLP-1/GIP obesity dose-response NMA. | `wilson_ci(k, n, z=1.959963984540054)`<br>`validate(extract_fn, gold=GOLD, snippets=None, within_pp=1.0)` | 2,4 | table |
| glp1-obesity-mbnma/workstream_B_transport.py | Workstream B (transport, labelled SENSITIVITY): transport node effects to the NHANES US | `node_of(a, d, s)`<br>`contrasts()`<br>`ivw(d)` | 2,4 | table |
| glp1-obesity-mbnma/workstream_bmi.py | BMI abstract-supplement -> add BMI as a SECOND transport modifier. | (none) | 2,3,4 | efetch |
| glp1-obesity-mbnma/workstream_C_transitivity.py | Workstream C: transitivity / effect-modifier assessment (panel: 'transitivity untested'). | `node_of(a, d, s)`<br>`measure(nct, pat, exclude=None)` | 2,4 | table |
| glp1-obesity-mbnma/workstream_D_robustness.py | Workstream D: single-trial-node robustness (panel: 'top-2 ranks are k=1'). | `node_of(a, d, s)`<br>`contrasts(df)`<br>`ivw_maxdose(g)` | 2,4 | table |
| glp1-obesity-mbnma/workstream_H_benefitrisk.py | Workstream H: benefit-risk - pair % weight loss with GI adverse events (nausea) per node, | `node_of_title(title)`<br>`node_of(a, d, s)` | 1,2,4 | table |
| glp1-obesity-mbnma/workstream_I_representativeness.py | Workstream I (transportability, valid first form): REPRESENTATIVENESS / POSITIVITY MAP. | (none) | 2,4 | table |
| glp1-obesity-mbnma/workstream_mlnmr.py | Model-based transport on a BINARY effect modifier (ML-NMR-consistent for pure strata). | `node_of(a, d, s)`<br>`ivw(d)` | 2,4 | table |
| glp1-obesity-mbnma/workstream_synthesis.py | The synthesis: ghost/secondary-evidence completeness -> transportability. | `diab_pct(sub, weight=False)` | 1,2,5 | table |
| IPD-Meta-Pro/dev/build.py | IPD-Meta-Pro Build System | `read_html()`<br>`split_command(force: bool = False)`<br>`build_command()`<br>`verify_command()`<br>`stats_command()`<br>`minify_command()` | 1,2,4 | http, table |
| nma-dose-response-app/create_production.py | (no module docstring) | (none) | 3 | efetch, http, Table |
| Pairwiseai/S4_Validation_Test.py | TruthCert-PairwisePro Validation Test (S4) | `resolve_app_html(default_name="TruthCert-PairwisePro-v1.0.html")`<br>`dismiss_alerts(driver)`<br>`is_finite_number(value)`<br>`compare_numbers(actual, expected, rel_tol=1e-6, abs_tol=1e-8)`<br>`record_test(results, section, name, passed, actual=None, expected=None, error=None)`<br>`run_analysis(driver, run_btn, pause_seconds=2.5)`<br>`run_validation()` | 2 | TABLE |
| screen/tools/train_rct_classifier.py | Train the offline RCT classifier shipped in screen/. | `esearch(term: str, retmax: int) -> list`<br>`efetch(pmids: list) -> list`<br>`main()` | 1,3,4 | efetch, http, table, urllib |
| scripts/backfill_reference_dois.py | Append verified DOIs/PMIDs to bare reference lines flagged by citation_cascade. | `main() -> int` | 1,2,3,4 | http |
| scripts/gen_app_readmes.py | Generate per-app README.md files enriched with structured data from | `main() -> int` | 1,2 | http |
| scripts/ground_citations.py | Citation grounding gate - DOI-resolve every claimed citation (Phase 1c). | `extract_claimed() -> list[dict]`<br>`load_cache() -> dict`<br>`save_cache(cache: dict) -> None`<br>`resolve_crossref(doi: str) -> dict \\| None`<br>`title_overlap(resolved_title: str, vancouver: str) -> float`<br>`main(argv: list[str]) -> int` | 1,2,3 | HTTP, http, urllib |
| scripts/lint_repo.py | Sentinel-equivalent pre-merge lint for allmeta's shipped browser assets. | `inline_math_inventory(paths)`<br>`is_allowlisted(finding: str) -> bool`<br>`line_of(text: str, idx: int) -> int`<br>`strip_script_style(html: str) -> str`<br>`lint_file(path: Path) -> list[str]`<br>`catalog_entry_files() -> list[Path]`<br>`iter_assets()`<br>`main() -> int` | 1,2,4 | http, table |
| scripts/living_evidence_watch.py | Living-evidence watcher - diff today's ClinicalTrials.gov + OpenAlex | `fetch_ctgov(term: str, conditions: list[str], min_year: int) -> list[dict]`<br>`fetch_openalex(query: str, min_year: int) -> list[dict]`<br>`diff_lists(prev: list[dict], curr: list[dict], key: str = "id") -> list[dict]`<br>`write_summary(path: Path, new_trials: list[dict], new_pubs: list[dict], topic: str) -> None`<br>`main() -> int` | 1,2,3,5 | clinicaltrials.gov, ClinicalTrials.gov, http, urllib |
| scripts/regen_build_info.py | Regenerate shared/build-info.js with the current git SHA + ISO timestamp. | `main() -> int` | 1,2,3,4 | http |
| scripts/review_cycle.py | Quarterly-review snapshot generator. | `deferred_items() -> list[tuple[str, str]]`<br>`lint_status() -> str`<br>`parity_headline() -> str`<br>`catalog_count() -> int`<br>`render() -> str`<br>`main() -> int` | 1,5 | table |
| scripts/strip_font_cdn.py | Strip external Google Fonts <link> tags (stylesheet + preconnect + dns-prefetch) | `is_frozen(p: Path) -> bool`<br>`main() -> int` | 3 | efetch |
| scripts/trim_audit.py | trim_audit.py - compute transitive asset closure of an HTML entry point. | `closure(src_root: Path, entry: Path, max_depth: int = 3) -> set[Path]`<br>`human(n: int) -> str`<br>`main() -> int` | 1,2 | http, table |
| scripts/vendor_cdn_assets.py | Vendor CDN-loaded JS libraries to shared/vendor/ with SRI hashes. | `sri_hash(data: bytes) -> str`<br>`download(url: str, timeout: int = 60) -> bytes`<br>`main() -> int` | 3 | http, HTTP, urllib |
| scripts/vendor_cdn_refs.py | Repoint hard external CDN <script src> / document.write refs to the local | `is_frozen(p: Path) -> bool`<br>`vendor_prefix(html: Path) -> str`<br>`main() -> int` | 3 | http |
| scripts/verify_external_pages.py | verify_external_pages.py - check GitHub Pages status for the 5 external hub cards. | `gh_pages(repo: str) -> dict \\| None`<br>`main() -> int` | - | table |
| triage/projects_js.py | Parse hub/projects.js without executing JS. Tolerates the trailing comma / | `path_to_key(path: str) -> str`<br>`path_to_app_dir(path: str) -> str`<br>`load_projects(projects_js: Path) -> list[dict]` | 1,2 | http, urllib |
| triage/render.py | Emit triage.{json,csv,md,html} from per-app records. | `render_json(records: list[dict], out_path: Path, *, scanner_version: str, now_iso: str) -> None`<br>`render_csv(records: list[dict], out_path: Path) -> None`<br>`render_md(records: list[dict], out_path: Path, *, scanner_version: str, now_iso: str) -> None`<br>`render_html(records: list[dict], out_path: Path, *, scanner_version: str, now_iso: str) -> None` | 1,2 | table |
| truth-recovery-bench/dose_response/harness_dose.py | harness_dose.py -- Known-truth dose-response truth-recovery benchmark engine. | `run_cell(cell, reps)`<br>`build_grid(profile="full")`<br>`main()` | - | table |
| truth-recovery-bench/dose_response/report_dose.py | report_dose.py -- Assemble REPORT.md from results_dose_*.json. | `fmt(x, d=3)`<br>`load(p)`<br>`by_block(results, block)`<br>`slope_table(rows)`<br>`width_table(rows)`<br>`nonlinear_table(rows)`<br>`selection_table(rows)`<br>`build(results_path, out_path)`<br>`main()` | 2 | table |
| truth-recovery-bench/dose_response/run_all.py | run_all.py -- single entry point that regenerates every number and figure for the | `run(cmd, **kw)`<br>`main()` | 3 | table |
| truth-recovery-bench/dose_response/tools/md2pdf.py | md2pdf.py -- dependency-light Markdown -> PDF builder (reportlab only). | `build(md_path: str, pdf_path: str, title: str \\| None = None)` | 3 | table, Table |

## Regulatory Side Tree Matches
| path | purpose | public_functions | rung | matched_terms |
| --- | --- | --- | --- | --- |
| regulatory/ae_compare.py | Three-source adverse-event comparison: OA paper vs CT.gov registry vs FDA review. | `fetch(url, timeout=60, tries=3)`<br>`epmc_papers_for_nct(nct)`<br>`paper_text(pmcid)`<br>`strip_xml(x)`<br>`pdf_text(path)`<br>`norm(s)`<br>`build_matcher(vocab)`<br>`found_terms(text, matcher)`<br>`main()` | 1,2,3,4 | ebi.ac.uk, europepmc, fitz, http, urllib |
| regulatory/ae_compare2.py | TRIAL-MATCHED three-source AE comparison: OA paper vs CT.gov vs FDA review. | `fetch(url, timeout=60, tries=3)`<br>`papers_for_nct(nct)`<br>`paper_text(pmcid)`<br>`main()` | 1,2,3,4 | ebi.ac.uk, europepmc, http, table, urllib |
| regulatory/ae_registry.py | Extract per-NCT adverse-event terms from the local AACT mirror. | `parse(path, ncols, nct_col)`<br>`nct_for_drug(drug)`<br>`ae_rows(nct_set)`<br>`main()` | 2,4 | table |
| regulatory/crosswalk_fda_nct.py | Bridge FDA review protocol IDs -> ClinicalTrials.gov NCT IDs. | `variants(pid)`<br>`load_id_index(wanted)`<br>`drug_nct_set(drug)`<br>`main()` | 2,3,4,5 | ClinicalTrials.gov |
| regulatory/faers_feasibility.py | FAERS feasibility probe -- ASSESSMENT ONLY. Deliberately not a detector. | `count(search)`<br>`prr(drug, event)`<br>`main()` | 1,2,4 | HTTP, http, urllib |
| regulatory/fetch_statr.py | Download verified statistical/medical reviews and classify their text layer. | `download(url, path)`<br>`classify(path)`<br>`main()` | 1,2,3,5 | fitz, table, urllib |
| regulatory/nct_resolve.py | Resolve a drug name -> its NCT set. Shared by the registry and crosswalk arms. | `by_intervention_name(drug)`<br>`by_mesh(drug)`<br>`resolve(drug, verbose=True)` | 1,2 | table |
| regulatory/phase1_gap.py | Quantify the phase-1 hole: FDA review package vs ClinicalTrials.gov. | `phase_map(ncts)`<br>`main()` | 2,4,5 | ClinicalTrials.gov, http |
| regulatory/probe_ema.py | Classify EMA assessment reports: text layer + per-trial content signals. | (none) | 2,3,4,5 | fitz |
| regulatory/probe_fda.py | Probe Drugs@FDA reachability for target drugs. | `fetch(url, tries=3)`<br>`probe(name, extra_brands=())`<br>`main()` | 1,4 | HTTP, http, urllib |
| regulatory/probe_textlayer.py | Determine, per era, whether Drugs@FDA Review PDFs carry a text layer. | `load_reviews()`<br>`download(url, path)`<br>`measure(path)`<br>`main()` | 1,3,4 | fitz, table, urllib |
| regulatory/render.py | Render scanned-PDF pages to PNG so Claude vision can read them. | `render(pdf, first, last, dpi=170, outdir=None)` | 3 | fitz, table |
| regulatory/resolve_toc.py | Resolve Drugs@FDA "Review" entries to their component review PDFs. | `fetch(url, tries=3, timeout=90, headers=None)`<br>`js_str_var(html, name)`<br>`parse_flags(html)`<br>`parse_filenames(html)`<br>`verify_pdf(url)`<br>`resolve(review_url, verify=True)`<br>`main()` | 1,2,3,4 | HTTP, http, table, urllib |

## JSON/JSONL Ledgers And Stores Written By Code
Static scan rows: 319/319 candidate write sites. Record keys are literal keys only when visible in source; non-literal variable writes are marked unknown.
| module | writer | target | record_keys |
| --- | --- | --- | --- |
| IPD-Meta-Pro/dev/build-scripts/benchmark_advanced_survival_against_r.py | write_text | args.output_json | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/benchmark_advanced_survival_against_r.py | write_text | input_json | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/benchmark_advanced_survival_against_r.py | write_text | path | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/benchmark_advanced_survival_against_r.py | write_text | r_code | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/benchmark_against_r.py | write_text | input_json | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/benchmark_against_r.py | write_text | out_json | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/benchmark_against_r.py | write_text | path | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/benchmark_against_r.py | write_text | r_code | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/benchmark_extended_survival_against_r.py | write_text | args.output_json | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/benchmark_extended_survival_against_r.py | write_text | input_json | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/benchmark_extended_survival_against_r.py | write_text | path | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/benchmark_extended_survival_against_r.py | write_text | r_code | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/benchmark_frontier_gap_methods.py | write_text | out_json | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/benchmark_frontier_gap_methods.py | write_text | path | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/benchmark_gap_methods_against_r.py | write_text | input_json | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/benchmark_gap_methods_against_r.py | write_text | out_json | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/benchmark_gap_methods_against_r.py | write_text | path | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/benchmark_gap_methods_against_r.py | write_text | r_code | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/benchmark_ipd_simulation_lab.py | write_text | out_json | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/benchmark_ipd_simulation_lab.py | write_text | path | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/benchmark_one_stage_against_r.py | write_text | input_json | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/benchmark_one_stage_against_r.py | write_text | out_json | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/benchmark_one_stage_against_r.py | write_text | path | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/benchmark_one_stage_against_r.py | write_text | r_code | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/benchmark_publication_replication_gate.py | write_text | out_json | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/benchmark_publication_replication_gate.py | write_text | path | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/browser_test_runner.py | write_text | artifact_path | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/build_ipd_superiority_snapshot.py | write_text | out_json | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/build_ipd_superiority_snapshot.py | write_text | path | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/ipd_parity_gate.py | write_text | out_json | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/ipd_parity_gate.py | write_text | path | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/smoke_user_flows_test.py | write_text | self.summary_path | unknown (path method) |
| IPD-Meta-Pro/dev/build-scripts/user_flow_smoke_test.py | write_text | ARTIFACT_PATH | unknown (path method) |
| IPD-Meta-Pro/dev/build.py | open(write/append) | MANIFEST_FILE | unknown (raw write or handle) |
| IPD-Meta-Pro/dev/build.py | json.dump | file handle | order, tail |
| Pairwiseai/S4_Validation_Test.py | json.dump | file handle | timestamp, passed, failed, tests, summary |
| audit/render.py | write_text | out_path | unknown (path method) |
| audit/tests/test_orchestrator_e2e.py | write_text | repo / "hub" / "projects.js" | unknown (path method) |
| audit/tests/test_orchestrator_e2e.py | write_text | repo / "tiny-one" / "index.html" | unknown (path method) |
| audit/tests/test_probe_smoke.py | write_text | fixture_dir / "index.html" | unknown (path method) |
| dosehtml/_run_full_validation_suite.py | write_text | out_path | unknown (path method) |
| dosehtml/archive/release-evidence/2026-02-28/scripts/build_release_readiness_summary.py | json.dump | file handle | validation_date, gui_test_runs |
| dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_170159/_run_full_validation_suite.py | write_text | out_path | unknown (path method) |
| dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_170159/dose-response-cli.py | json.dump | file handle | unknown (non-literal object or list) |
| dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_170159/test_dose_response_app.py | json.dump | file handle | unknown (non-literal object or list) |
| dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_170227/_run_full_validation_suite.py | write_text | out_path | unknown (path method) |
| dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_170227/dose-response-cli.py | json.dump | file handle | unknown (non-literal object or list) |
| dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_170227/test_dose_response_app.py | json.dump | file handle | unknown (non-literal object or list) |
| dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_172825/_run_full_validation_suite.py | write_text | out_path | unknown (path method) |
| dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_172825/dose-response-cli.py | json.dump | file handle | unknown (non-literal object or list) |
| dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_172825/scripts/benchmark_simulations.py | write_text | Path(args.output) | unknown (path method) |
| dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_172825/test_dose_response_app.py | json.dump | file handle | unknown (non-literal object or list) |
| dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_174841/_run_full_validation_suite.py | write_text | out_path | unknown (path method) |
| dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_174841/dose-response-cli.py | json.dump | file handle | unknown (non-literal object or list) |
| dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_174841/test_dose_response_app.py | json.dump | file handle | unknown (non-literal object or list) |
| dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-13_093003/_run_full_validation_suite.py | write_text | out_path | unknown (path method) |
| dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-13_093003/dose-response-cli.py | json.dump | file handle | unknown (non-literal object or list) |
| dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-13_093003/test_dose_response_app.py | json.dump | file handle | unknown (non-literal object or list) |
| dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-13_114929/_run_full_validation_suite.py | write_text | out_path | unknown (path method) |
| dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-13_114929/dose-response-cli.py | json.dump | file handle | unknown (non-literal object or list) |
| dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-13_114929/test_dose_response_app.py | json.dump | file handle | unknown (non-literal object or list) |
| dosehtml/dose-response-cli.py | json.dump | file handle | unknown (non-literal object or list) |
| dosehtml/scripts/build_release_readiness_summary.py | json.dump | file handle | validation_date, gui_test_runs |
| dosehtml/scripts/cross_package_multipersona_review.py | json.dump | file handle | generated_at, tool_statuses, r_run, r_summary, strict_r_benchmark_summary, simulation_summary, stata_artifact, spss_artifact, internet_reference_summary, stata_evidence, spss_evidence, persona_votes, vote_counts |
| dosehtml/scripts/cross_package_multipersona_review.py | write_text | report_path | unknown (path method) |
| dosehtml/scripts/strict_beat_r_benchmark.py | json.dump | file handle | generated_at, seed, n_datasets_requested, rscript_path, r_package_versions, criteria_thresholds, criteria, beats_r, summary, rows, our_results, r_results |
| dosehtml/scripts/strict_beat_r_benchmark.py | write_text | report_path | unknown (path method) |
| dosehtml/test_dose_response_app.py | json.dump | file handle | unknown (non-literal object or list) |
| dosehtml/test_dose_response_main.py | json.dump | file handle | unknown (non-literal object or list) |
| evidenceos/src/evidenceos_engine.py | write_text | path | unknown (path method) |
| extract/tests/fixtures/make_fixture.py | write_bytes | out | unknown (path method) |
| glp1-obesity-mbnma/bayes_mbnma.py | json.dump | f'{ROOT}/bayes_ranking.json' | agents, sucra, poth, Emax_median, Emax_cri, pred_median, pred_cri, tau_median, rhat_max, rhat_pred_max, ess, converged, order |
| glp1-obesity-mbnma/bayes_mbnma.py | open(write/append) | f'{ROOT}/bayes_ranking.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/benford_integrity.py | json.dump | f'{ROOT}/benford_integrity.json' | enrollment_screen, weight_pct_excluded, verdict, method, bound |
| glp1-obesity-mbnma/benford_integrity.py | open(write/append) | f'{ROOT}/benford_integrity.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/build_rapidmeta_config.py | json.dump | f'{ROOT}/rapidmeta_config.json' | drug, drug_lower, slug, condition, comparator, title, hero_h2, nyt_headline, pico, acronyms, trials |
| glp1-obesity-mbnma/build_rapidmeta_config.py | open(write/append) | f'{ROOT}/rapidmeta_config.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/build_survival.py | json.dump | f'{ROOT}/survival_summary.json' | hard_outcome_trials, hr_rows, by_agent, km_reconstruct_candidates |
| glp1-obesity-mbnma/build_survival.py | open(write/append) | f'{ROOT}/survival_summary.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/cinema_confidence.py | json.dump | f'{ROOT}/cinema_confidence.json' | comparison, transitivity_ok, transitivity_flags, domains, cinema_confidence, majors, some_concerns, note |
| glp1-obesity-mbnma/cinema_confidence.py | open(write/append) | f'{ROOT}/cinema_confidence.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/class2_pcsk9/build_pcsk9_rapidmeta_config.py | json.dump | f'{HERE}/pcsk9_rapidmeta_config.json' | drug, drug_lower, slug, condition, comparator, title, hero_h2, nyt_headline, pico, acronyms, trials, provenance_note |
| glp1-obesity-mbnma/class2_pcsk9/build_pcsk9_rapidmeta_config.py | open(write/append) | f'{HERE}/pcsk9_rapidmeta_config.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/class2_pcsk9/ldl_nma.py | json.dump | f'{HERE}/pcsk9_results.json' | class, ldl_nma, ranking, lead_contrast, surrogate_pairs, surrogate_note, generality |
| glp1-obesity-mbnma/class2_pcsk9/ldl_nma.py | open(write/append) | f'{HERE}/pcsk9_results.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/class2_pcsk9/pcsk9_league.py | json.dump | f'{HERE}/pcsk9_league.json' | class, outcome, ranking, median_ldl_pct, kper, comparisons, certainty_counts, k1_insufficient, lead, lead_vs_second, depth_note |
| glp1-obesity-mbnma/class2_pcsk9/pcsk9_league.py | open(write/append) | f'{HERE}/pcsk9_league.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/class2_pcsk9/pcsk9_league_bayes.py | json.dump | f'{HERE}/pcsk9_league_bayes.json' | class, outcome, inference, ranking, kper, median_ldl_pct, rhat, comparisons, certainty_counts, k1_insufficient, lead, depth_note |
| glp1-obesity-mbnma/class2_pcsk9/pcsk9_league_bayes.py | open(write/append) | f'{HERE}/pcsk9_league_bayes.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/class2_pcsk9/pcsk9_rapidmeta_harvest.py | json.dump | f'{HERE}/pcsk9_trials.json' | trials, effect_measure, screening |
| glp1-obesity-mbnma/class2_pcsk9/pcsk9_rapidmeta_harvest.py | open(write/append) | f'{HERE}/pcsk9_trials.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/class2_pcsk9/pcsk9_transport.py | json.dump | f'{HERE}/pcsk9_transport.json' | class, stage, target, transported, ctt_context, depth_note |
| glp1-obesity-mbnma/class2_pcsk9/pcsk9_transport.py | open(write/append) | f'{HERE}/pcsk9_transport.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/class3_sglt2/build_sglt2_rapidmeta_config.py | json.dump | f'{HERE}/sglt2_rapidmeta_config.json' | drug, drug_lower, slug, condition, comparator, title, hero_h2, nyt_headline, pico, acronyms, trials, provenance_note |
| glp1-obesity-mbnma/class3_sglt2/build_sglt2_rapidmeta_config.py | open(write/append) | f'{HERE}/sglt2_rapidmeta_config.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/class3_sglt2/sglt2_classeffect.py | json.dump | f'{HERE}/sglt2_results.json' | class, outcome, agents, class_pooled_hr, cross_agent_I2, class_effect_naive_homogeneous, generality, caveat |
| glp1-obesity-mbnma/class3_sglt2/sglt2_classeffect.py | open(write/append) | f'{HERE}/sglt2_results.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/class3_sglt2/sglt2_league_bayes.py | json.dump | f'{HERE}/sglt2_league.json' | class, outcome, inference, ranking, kper, median_hr, class_pooled_hr, rhat, comparisons, certainty_counts, k1_insufficient, lead, depth_note |
| glp1-obesity-mbnma/class3_sglt2/sglt2_league_bayes.py | open(write/append) | f'{HERE}/sglt2_league.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/class3_sglt2/sglt2_rapidmeta_harvest.py | json.dump | f'{HERE}/sglt2_trials.json' | trials, screening |
| glp1-obesity-mbnma/class3_sglt2/sglt2_rapidmeta_harvest.py | open(write/append) | f'{HERE}/sglt2_trials.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/class3_sglt2/sglt2_transport.py | json.dump | f'{HERE}/sglt2_transport.json' | class, stage, class_pooled_hr, lead, lead_hr, scenarios, primary_scenario, lead_at_primary, baseline_source, depth_note |
| glp1-obesity-mbnma/class3_sglt2/sglt2_transport.py | open(write/append) | f'{HERE}/sglt2_transport.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/class_concordance.py | json.dump | os.path.join(HERE, 'class_concordance.json') | what, n_classes, n_concordant, method, all_references_doi_resolved, doi_resolution_date, entries, honest_boundary |
| glp1-obesity-mbnma/class_concordance.py | open(write/append) | os.path.join(HERE, 'class_concordance.json') | unknown (raw write or handle) |
| glp1-obesity-mbnma/cnma_incretin.py | json.dump | f'{ROOT}/cnma_incretin.json' | validated_vs_discomb, components, Q, df, triple_additive_pred_pp, triple_observed_pp, predicted_GIP_GCG_no_GLP1_pp, caveat |
| glp1-obesity-mbnma/cnma_incretin.py | open(write/append) | f'{ROOT}/cnma_incretin.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/concordance_battery.py | json.dump | f'{ROOT}/concordance_battery.json' | our_top3, reviews, n_reviews, n_concordant, tirzepatide_top_count, semaglutide_top_count, verdict, caveats, attribution |
| glp1-obesity-mbnma/concordance_battery.py | open(write/append) | f'{ROOT}/concordance_battery.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/concordance_validation.py | json.dump | f'{ROOT}/concordance_validation.json' | references, verdict, n_concordant_primary, headline, data_policy |
| glp1-obesity-mbnma/concordance_validation.py | open(write/append) | f'{ROOT}/concordance_validation.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/decision_sensitivity.py | json.dump | f'{ROOT}/decision_sensitivity.json' | headline, league, confident_by_mid, n_pairs, note |
| glp1-obesity-mbnma/decision_sensitivity.py | open(write/append) | f'{ROOT}/decision_sensitivity.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/entropy_transport.py | json.dump | f'{ROOT}/entropy_transport.json' | target, nodes, method, covariates_balanced, infeasible_nodes, caveat, pure_strata_duality, finding |
| glp1-obesity-mbnma/entropy_transport.py | open(write/append) | f'{ROOT}/entropy_transport.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/extend_surrogate.py | json.dump | f'{ROOT}/extend_surrogate.json' | k, n_agents, agents, pairs, r2_naive_weighted, r2_error_adjusted, I2_logHR, pearson_r, pearson_drop_tirzepatide, within_semaglutide_r, ste_pct, unrecoverable_agents, boundary, finding |
| glp1-obesity-mbnma/extend_surrogate.py | open(write/append) | f'{ROOT}/extend_surrogate.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/extract.py | json.dump | r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/arms.json' | unknown (non-literal object or list) |
| glp1-obesity-mbnma/extract.py | open(write/append) | r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/arms.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/fit_network.py | json.dump | out_json | label, agents, sucra, poth, order |
| glp1-obesity-mbnma/fit_network.py | open(write/append) | out_json | unknown (raw write or handle) |
| glp1-obesity-mbnma/fix1_medline_multistrategy.py | json.dump | f'{ROOT}/medline_multistrategy.json' | cohort, found_narrow, found_broad, still_missed_broad, ghosts_irreducible |
| glp1-obesity-mbnma/fix1_medline_multistrategy.py | open(write/append) | f'{ROOT}/medline_multistrategy.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/fix2_transport_validation.py | json.dump | f'{ROOT}/transport_validation.json' | gamma, validations, mean_abs_error |
| glp1-obesity-mbnma/fix2_transport_validation.py | open(write/append) | f'{ROOT}/transport_validation.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/fix3_joint_sensitivity.py | json.dump | f'{ROOT}/transport_joint_sensitivity.json' | node, obesity_effect, us_obese_transported_range, gammas, contamination, ratios, note |
| glp1-obesity-mbnma/fix3_joint_sensitivity.py | open(write/append) | f'{ROOT}/transport_joint_sensitivity.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/fix5_evalue.py | json.dump | f'{ROOT}/transport_evalue.json' | measured_diabetes_shift_pp, nullify_threshold_pp, min_adjacent_gap_pp, benchmark, conclusion |
| glp1-obesity-mbnma/fix5_evalue.py | open(write/append) | f'{ROOT}/transport_evalue.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/grade_export.py | json.dump | f'{ROOT}/grade_export.json' | comparison, grade_certainty, cinema_confidence, strength, summary_of_findings, evidence_to_decision, draft_recommendation, guardrails, key_evidence_gap, export_note |
| glp1-obesity-mbnma/grade_export.py | open(write/append) | f'{ROOT}/grade_export.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/grade_inputs.py | json.dump | f'{ROOT}/grade_inputs.json' | comparison, estimate_pp, ci95, se, p_gt_0, p_gt_mid2, posterior_corr, contrast_source, ci_note, tirz, sema, i2_sema_pct, i2_tirz_pct, k_studies, network |
| glp1-obesity-mbnma/grade_inputs.py | open(write/append) | f'{ROOT}/grade_inputs.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/grma_robust_pool.py | json.dump | f'{ROOT}/grma_robust_pool.json' | method, role, node, k, iv, grma, grma_minus_iv_pp, conclusion_robust_to_pooling, most_downweighted, scope_note |
| glp1-obesity-mbnma/grma_robust_pool.py | open(write/append) | f'{ROOT}/grma_robust_pool.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/hta_mcda.py | json.dump | f'{ROOT}/hta_mcda.json' | weights, agents_full, value_median, p_best, note |
| glp1-obesity-mbnma/hta_mcda.py | open(write/append) | f'{ROOT}/hta_mcda.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/joint_benefit_risk.py | json.dump | f'{ROOT}/joint_benefit_risk.json' | placebo_nausea_pct, agents, frontier, dominated, tradeoff_nausea_per_pp_weight, benefit_risk_corr, note |
| glp1-obesity-mbnma/joint_benefit_risk.py | open(write/append) | f'{ROOT}/joint_benefit_risk.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/nhanes_microdata.py | json.dump | f'{ROOT}/nhanes_target.json' | source, n_obese_adults, diabetes_def, target_microdata, was_hardcoded, diabetes_prevalence, diabetes_se, kish_neff, diabetes_by_ethnicity_pct, joint_correlations |
| glp1-obesity-mbnma/nhanes_microdata.py | open(write/append) | f'{ROOT}/nhanes_target.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/nma_contrast.py | json.dump | f'{ROOT}/nma_contrast.json' | obesity, target, mid_pp, rhat, interpretation |
| glp1-obesity-mbnma/nma_contrast.py | open(write/append) | f'{ROOT}/nma_contrast.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/nma_league.py | json.dump | f'{ROOT}/nma_league.json' | nodes, kper, order, median_target, comparisons, certainty_counts, k1_insufficient, rhat, note |
| glp1-obesity-mbnma/nma_league.py | open(write/append) | f'{ROOT}/nma_league.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/pymc_agent_gamma.py | json.dump | f'{ROOT}/agent_gamma_transport.json' | gam_mu, gam_sd, agent_gamma, rhat_max, ess_min, nodes |
| glp1-obesity-mbnma/pymc_agent_gamma.py | open(write/append) | f'{ROOT}/agent_gamma_transport.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/pymc_bayesian_transport.py | json.dump | f'{ROOT}/bayesian_transport.json' | sampler, gamma_median, gamma_cri, P_gamma_gt0, rhat_max, ess_min, target_diabetes, nodes |
| glp1-obesity-mbnma/pymc_bayesian_transport.py | open(write/append) | f'{ROOT}/bayesian_transport.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/pymc_mbnma.py | json.dump | f'{ROOT}/pymc_ranking.json' | sampler, agents, sucra, poth, pred_median, pred_cri, tau_median, rhat_max, ess_min, converged, order |
| glp1-obesity-mbnma/pymc_mbnma.py | open(write/append) | f'{ROOT}/pymc_ranking.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/pymc_onestep.py | json.dump | f'{ROOT}/onestep_ranking.json' | sampler, nodes, sucra, poth, pred_median, pred_cri, rhat_max, ess_min, order |
| glp1-obesity-mbnma/pymc_onestep.py | open(write/append) | f'{ROOT}/onestep_ranking.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/pymc_transport_v2.py | json.dump | f'{ROOT}/transport_v2.json' | nhanes_target_consumed, rhat_max, ess_min, P_diab_posterior_pct, poth_obesity, poth_transported, nodes |
| glp1-obesity-mbnma/pymc_transport_v2.py | open(write/append) | f'{ROOT}/transport_v2.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/registry_pubbias.py | json.dump | f'{ROOT}/registry_pubbias.json' | node, k_published, k_ghost, published_pooled_pp, complete_pooled_pp, measured_reporting_bias_shift_pp, egger_intercept, egger_p, egger_detects_asymmetry, copas_applicable, measured_bias_negligible, finding, caveat |
| glp1-obesity-mbnma/registry_pubbias.py | open(write/append) | f'{ROOT}/registry_pubbias.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/run_medline_compare.py | json.dump | f'{ROOT}/medline_compare.json' | medline_hits, cohort, medline_found, registry_only, ghosts_unfindable, published_not_found |
| glp1-obesity-mbnma/run_medline_compare.py | open(write/append) | f'{ROOT}/medline_compare.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/surrogate_validation.py | json.dump | f'{ROOT}/surrogate_validation.json' | k, pairs, slope_logHR_per_pct, hr_per_extra_pct_weightloss, trial_level_R2, pearson_r_all, pearson_r_within_semaglutide, finding, caveat |
| glp1-obesity-mbnma/surrogate_validation.py | open(write/append) | f'{ROOT}/surrogate_validation.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/survival_nma.py | json.dump | f'{ROOT}/survival_nma.json' | survival_nma_by_agent, n_trials, registry_ipd |
| glp1-obesity-mbnma/survival_nma.py | open(write/append) | f'{ROOT}/survival_nma.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/trial_sequential.py | json.dump | f'{ROOT}/trial_sequential.json' | agent, outcome, k, target_RRR, cumulative_HR, cumulative_z, I2, diversity_D, information_fraction, obf_boundary_z, conclusive, ongoing_trials, ongoing_enrollment, finding, caveat |
| glp1-obesity-mbnma/trial_sequential.py | open(write/append) | f'{ROOT}/trial_sequential.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/ubcma_reporting_bias.py | json.dump | f'{ROOT}/ubcma_reporting_bias.json' | method, role, node, k_published, k_ghost, observed, visible_estimators, ubcma, ubcma_correction_vs_DL_pp, truth_correction_vs_DL_pp, same_direction_as_ghost_truth, moved_closer_to_all15_truth, verdict, scope_note |
| glp1-obesity-mbnma/ubcma_reporting_bias.py | open(write/append) | f'{ROOT}/ubcma_reporting_bias.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/workstream_A_delta.py | json.dump | f'{ROOT}/ghost_delta.json' | ghosts_confirmed, ghosts_with_arms, ghosts_analysable |
| glp1-obesity-mbnma/workstream_A_delta.py | open(write/append) | f'{ROOT}/ghost_delta.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/workstream_B_transport.py | json.dump | f'{ROOT}/transport_sensitivity.json' | beta_diabetes_pp, beta_se, target_diabetes, nodes, framing |
| glp1-obesity-mbnma/workstream_B_transport.py | open(write/append) | f'{ROOT}/transport_sensitivity.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/workstream_C_transitivity.py | json.dump | f'{ROOT}/transitivity.json' | unknown (non-literal object or list) |
| glp1-obesity-mbnma/workstream_C_transitivity.py | open(write/append) | f'{ROOT}/transitivity.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/workstream_D_robustness.py | json.dump | f'{ROOT}/robustness.json' | unknown (non-literal object or list) |
| glp1-obesity-mbnma/workstream_D_robustness.py | open(write/append) | f'{ROOT}/robustness.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/workstream_H_benefitrisk.py | json.dump | f'{ROOT}/benefit_risk.json' | placebo_nausea_pct, nodes |
| glp1-obesity-mbnma/workstream_H_benefitrisk.py | open(write/append) | f'{ROOT}/benefit_risk.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/workstream_I_representativeness.py | json.dump | f'{ROOT}/representativeness.json' | trial, nhanes_target, rows, source |
| glp1-obesity-mbnma/workstream_I_representativeness.py | open(write/append) | f'{ROOT}/representativeness.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/workstream_bmi.py | json.dump | f'{ROOT}/bmi_by_trial.json' | unknown (non-literal object or list) |
| glp1-obesity-mbnma/workstream_bmi.py | open(write/append) | f'{ROOT}/bmi_by_trial.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/workstream_bmi.py | json.dump | f'{ROOT}/bmi_modifier.json' | bmi_coverage, trial_mean_bmi, nhanes_bmi, bmi_gap, bmi_slope_pp_per_unit, bmi_transport_pp, note |
| glp1-obesity-mbnma/workstream_bmi.py | open(write/append) | f'{ROOT}/bmi_modifier.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/workstream_delta_main.py | json.dump | f'{ROOT}/delta_comparison.json' | S0_registry, S1_no_ghost, S2_literature, ghosts_in_cohort, T2D_in_cohort |
| glp1-obesity-mbnma/workstream_delta_main.py | open(write/append) | f'{ROOT}/delta_comparison.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/workstream_ethnicity_atlas.py | json.dump | f'{ROOT}/ethnicity_atlas.json' | gamma, diabetes_by_ethnicity_pct, ethnicity_region_map, transported |
| glp1-obesity-mbnma/workstream_ethnicity_atlas.py | open(write/append) | f'{ROOT}/ethnicity_atlas.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/workstream_mlnmr.py | json.dump | f'{ROOT}/mlnmr_transport.json' | beta, beta_se, target_diabetes, method, nodes |
| glp1-obesity-mbnma/workstream_mlnmr.py | open(write/append) | f'{ROOT}/mlnmr_transport.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/workstream_obese_subset.py | json.dump | f'{ROOT}/transport_atlas_obese.json' | ratio, gamma, targets_obese_subset, atlas, sources |
| glp1-obesity-mbnma/workstream_obese_subset.py | open(write/append) | f'{ROOT}/transport_atlas_obese.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/workstream_synthesis.py | json.dump | f'{ROOT}/synthesis.json' | lit_pct_t2d_ptwtd, reg_pct_t2d_ptwtd, nhanes_target, gap_lit, gap_reg, gap_closed, bridge_trials, bridge_patients |
| glp1-obesity-mbnma/workstream_synthesis.py | open(write/append) | f'{ROOT}/synthesis.json' | unknown (raw write or handle) |
| glp1-obesity-mbnma/workstream_transport_atlas.py | json.dump | f'{ROOT}/transport_atlas.json' | gamma, gamma_cri, targets, atlas, sources |
| glp1-obesity-mbnma/workstream_transport_atlas.py | open(write/append) | f'{ROOT}/transport_atlas.json' | unknown (raw write or handle) |
| nma-dose-response-app/browser_test_isolated.py | open(write/append) | 'browser_test_results.json' | unknown (raw write or handle) |
| nma-dose-response-app/browser_test_isolated.py | json.dump | file handle | passed, errors |
| nma-dose-response-app/comprehensive_feature_test.py | open(write/append) | 'comprehensive_test_results.json' | unknown (raw write or handle) |
| nma-dose-response-app/comprehensive_feature_test.py | json.dump | file handle | unknown (non-literal object or list) |
| nma-dose-response-app/comprehensive_feature_test_v2.py | open(write/append) | 'comprehensive_test_results_v2.json' | unknown (raw write or handle) |
| nma-dose-response-app/comprehensive_feature_test_v2.py | json.dump | file handle | unknown (non-literal object or list) |
| nma-dose-response-app/comprehensive_review.py | open(write/append) | 'review_results.json' | unknown (raw write or handle) |
| nma-dose-response-app/comprehensive_review.py | json.dump | file handle | strengths, issues, recommendations, score |
| nma-dose-response-app/comprehensive_test.py | open(write/append) | 'test_results.json' | unknown (raw write or handle) |
| nma-dose-response-app/comprehensive_test.py | json.dump | file handle | passed, errors, console_errors |
| nma-dose-response-app/edge_browser_test.py | open(write/append) | 'edge_test_results.json' | unknown (raw write or handle) |
| nma-dose-response-app/edge_browser_test.py | json.dump | file handle | passed, errors |
| nma-dose-response-app/editorial_review_rsm.py | open(write/append) | 'editorial_review_rsm.json' | unknown (raw write or handle) |
| nma-dose-response-app/editorial_review_rsm.py | json.dump | file handle | date, total_score, max_score, percentage, decision, categories, all_strengths, all_issues |
| nma-dose-response-app/full_app_test.py | open(write/append) | 'full_test_results.json' | unknown (raw write or handle) |
| nma-dose-response-app/full_app_test.py | json.dump | file handle | buttons_tested, buttons_failed, plots_found, plots_rendered, functions_tested, functions_failed, console_errors, warnings |
| nma-dose-response-app/full_app_test_v2.py | open(write/append) | 'test_results_v2.json' | unknown (raw write or handle) |
| nma-dose-response-app/full_app_test_v2.py | json.dump | file handle | buttons, tabs, plots, functions, console_errors |
| nma-dose-response-app/selenium_test.py | open(write/append) | 'test_issues.json' | unknown (raw write or handle) |
| nma-dose-response-app/selenium_test.py | json.dump | file handle | unknown (non-literal object or list) |
| oa68k/adjbatch.py | json.dump | file handle | unknown (non-literal object or list) |
| oa68k/breadthaudit.py | json.dump | os.path.join(C.HERE, "breadthaudit.json") | n, shareable, shareable_pct |
| oa68k/breadthaudit.py | open(write/append) | os.path.join(C.HERE, "breadthaudit.json") | unknown (raw write or handle) |
| oa68k/crosswalk.py | append_jsonl | CROSSWALK_LEDGER | pmid, status, pmcid, doi, is_open_access, in_pmc, has_abstract |
| oa68k/crosswalk.py | append_jsonl | CROSSWALK_LEDGER | pmid, status |
| oa68k/eraprobe.py | json.dump | os.path.join(C.HERE, "eraprobe.json") | total_oa_metas, method, eras |
| oa68k/eraprobe.py | open(write/append) | os.path.join(C.HERE, "eraprobe.json") | unknown (raw write or handle) |
| oa68k/eraseed.py | open(write/append) | LEDGER | unknown (raw write or handle) |
| oa68k/fda.py | append_jsonl | FDA_LEDGER | url, appl_no, appl_type, sponsor, doc_type, source_tier, locator, licence, provenance, extracted_at |
| oa68k/figfetch.py | open(write/append) | FETCH_LEDGER | unknown (raw write or handle) |
| oa68k/figscan.py | open(write/append) | FIG_LEDGER | unknown (raw write or handle) |
| oa68k/forestrate_era.py | json.dump | os.path.join(C.HERE, "forestrate_era.json") | n_per_era, seed, eras |
| oa68k/forestrate_era.py | open(write/append) | os.path.join(C.HERE, "forestrate_era.json") | unknown (raw write or handle) |
| oa68k/fulltext.py | append_jsonl | ledger | unknown (non-literal record) |
| oa68k/goldframe.py | json.dump | file handle | figscan_ledger, n_scanned, harvest_metas_known, frames |
| oa68k/goldframe.py | open(write/append) | os.path.join(C.HERE, "goldframe.json") | unknown (raw write or handle) |
| oa68k/goldsample.py | json.dump | os.path.join(C.HERE, "goldsample.json") | frame |
| oa68k/goldsample.py | open(write/append) | os.path.join(C.HERE, "goldsample.json") | unknown (raw write or handle) |
| oa68k/harvest.py | append_jsonl | C.HARVEST_LEDGER | unknown (non-literal record) |
| oa68k/holdout_freeze.py | json.dump | file handle | frozen_at, frozen_before, rule, why_t1, contract, n_candidates, n_frozen, papers |
| oa68k/ingest.py | append_jsonl | C.SEED | unknown (non-literal record) |
| oa68k/isrctn.py | append_jsonl | ISRCTN_LEDGER | registry_id, nct_id, key_absent_no_nct, has_african_recruitment, query, extracted_at |
| oa68k/licenceaudit.py | json.dump | os.path.join(C.HERE, "licenceaudit.json") | frame, source, classes |
| oa68k/licenceaudit.py | open(write/append) | os.path.join(C.HERE, "licenceaudit.json") | unknown (raw write or handle) |
| oa68k/net.py | json.dump | file handle | unknown (non-literal object or list) |
| oa68k/nextbatch.py | json.dump | "data/_inflight.json" | unknown (non-literal object or list) |
| oa68k/nextbatch.py | open(write/append) | "data/_inflight.json" | unknown (raw write or handle) |
| oa68k/nma_export.py | json.dump | file handle | unknown (non-literal object or list) |
| oa68k/obtainability.py | json.dump | file handle | enumeration, verdicts |
| oa68k/outcometype.py | json.dump | os.path.join(C.HERE, "outcometype.json") | n_figures, n_metas, classes |
| oa68k/outcometype.py | open(write/append) | os.path.join(C.HERE, "outcometype.json") | unknown (raw write or handle) |
| oa68k/parse_detect.py | append_jsonl | C.DETECT_LEDGER | unknown (non-literal record) |
| oa68k/preextract.py | append_jsonl | C.PREEXTRACT_LEDGER | nct_id, method, confidence, brief_title, phase, overall_status, enrollment, number_of_arms, study_type, results_posted, n_outcome_measurements, n_count_measurements, n_ae_cells, poolable_registry_2x2 |
| oa68k/preextract.py | append_jsonl | C.PREEXTRACT_LEDGER | nct_id, method, in_aact_snapshot |
| oa68k/refjoin.py | open(write/append) | a.json | unknown (raw write or handle) |
| oa68k/refjoin.py | json.dump | file handle | cardio, other |
| oa68k/registry_full.py | append_jsonl | C.DATA + f"/registry_full.{C.NODE}.jsonl" | batch_id, status, n_ncts, counts, secs, aact_snapshot, extracted_at, node |
| oa68k/registry_full.py | append_jsonl | C.DATA + f"/registry_full.{C.NODE}.jsonl" | batch_id, status, error |
| oa68k/shardA_worklist.py | json.dump | file handle | unknown (non-literal object or list) |
| oa68k/shardA_worklist.py | open(write/append) | os.path.join(a.out, "batch_%03d.json" % (a.start + n)) | unknown (raw write or handle) |
| oa68k/shardwrite.py | open(write/append) | SHARD | unknown (raw write or handle) |
| oa68k/tests/test_fulltext_durability.py | write_bytes | p | unknown (path method) |
| oa68k/tests/test_fulltext_durability.py | write_bytes | tmp_path / "PMC404.xml" | unknown (path method) |
| oa68k/tests/test_visionstore.py | write_bytes | other | unknown (path method) |
| oa68k/tests/test_visionstore.py | write_bytes | p | unknown (path method) |
| oa68k/tests/test_visionstore.py | open(write/append) | vs.LEDGER | unknown (raw write or handle) |
| oa68k/tier2_extract.py | append_jsonl | C.TIER2_LEDGER | unknown (non-literal record) |
| oa68k/tier2_extract.py | append_jsonl | C.TIER2_LEDGER | nct_id, present, reason |
| oa68k/visioncost.py | json.dump | os.path.join(C.HERE, "visioncost.json") | billing, budget_gbp_month, usd_per_gbp_ASSUMED, budget_usd_month, forest_figures, assumptions_not_measured |
| oa68k/visioncost.py | open(write/append) | os.path.join(C.HERE, "visioncost.json") | unknown (raw write or handle) |
| oa68k/visionshard.py | open(write/append) | SHARD | unknown (raw write or handle) |
| oa68k/visionstore.py | open(write/append) | LEDGER | unknown (raw write or handle) |
| regulatory/ae_compare.py | json.dump | file handle | unknown (non-literal object or list) |
| regulatory/ae_compare2.py | json.dump | file handle | unknown (non-literal object or list) |
| regulatory/ae_registry.py | json.dump | file handle | unknown (non-literal object or list) |
| regulatory/crosswalk_fda_nct.py | json.dump | file handle | unknown (non-literal object or list) |
| regulatory/faers_feasibility.py | open(write/append) | "data/faers_feasibility.json" | unknown (raw write or handle) |
| regulatory/faers_feasibility.py | json.dump | file handle | unknown (non-literal object or list) |
| regulatory/phase1_gap.py | json.dump | file handle | unknown (non-literal object or list) |
| regulatory/phase1_gap.py | open(write/append) | os.path.join(HERE, "data", "phase1_gap.json") | unknown (raw write or handle) |
| screen/tools/train_rct_classifier.py | write_text | OUT | unknown (path method) |
| scripts/add_a11y_landmarks.py | write_text | idx | unknown (path method) |
| scripts/add_app_flow_bar.py | write_text | idx | unknown (path method) |
| scripts/add_autosave.py | write_text | idx | unknown (path method) |
| scripts/add_build_info.py | write_text | html_path | unknown (path method) |
| scripts/add_cite_button.py | write_text | idx | unknown (path method) |
| scripts/add_course_and_featured.py | write_text | PROJECTS | unknown (path method) |
| scripts/add_csp.py | write_text | path | unknown (path method) |
| scripts/add_forced_colors.py | write_text | path | unknown (path method) |
| scripts/add_hero_examples.py | write_text | idx | unknown (path method) |
| scripts/add_ma_comparisons_bus.py | write_text | p | unknown (path method) |
| scripts/add_ma_studies_bus.py | write_text | idx | unknown (path method) |
| scripts/add_verify_in_r.py | write_text | p | unknown (path method) |
| scripts/add_zenodo_grounding.py | write_text | p | unknown (path method) |
| scripts/backfill_reference_dois.py | write_text | p | unknown (path method) |
| scripts/drift_sweep.py | write_bytes | LEDGER | unknown (path method) |
| scripts/fix_parity_spec_paths.py | write_text | p | unknown (path method) |
| scripts/gen_app_readmes.py | write_text | readme | unknown (path method) |
| scripts/ground_citations.py | write_text | CACHE | unknown (path method) |
| scripts/inject_hub_back_link.py | write_text | path | unknown (path method) |
| scripts/living_evidence_watch.py | write_text | path | unknown (path method) |
| scripts/living_evidence_watch.py | write_text | state_path | unknown (path method) |
| scripts/living_evidence_watch.py | write_text | topic_file | unknown (path method) |
| scripts/regen_build_info.py | write_text | OUT | unknown (path method) |
| scripts/remove_two_refs.py | write_text | p | unknown (path method) |
| scripts/review_cycle.py | write_text | dst | unknown (path method) |
| scripts/strip_font_cdn.py | write_text | html | unknown (path method) |
| scripts/svg_innerHTML_codemod.py | write_text | path | unknown (path method) |
| scripts/vendor_cdn_assets.py | write_bytes | dest | unknown (path method) |
| scripts/vendor_cdn_assets.py | write_text | manifest_path | unknown (path method) |
| scripts/vendor_cdn_refs.py | write_text | html | unknown (path method) |
| triage/apply_z975_fix.py | write_text | idx | unknown (path method) |
| triage/render.py | write_text | out_path | unknown (path method) |
| triage/tests/test_projects_js.py | write_text | pjs | unknown (path method) |
| triage/tests/test_runtime_health.py | write_text | bad | unknown (path method) |
| triage/tests/test_runtime_health.py | write_text | p | unknown (path method) |
| triage/tests/test_scan_e2e.py | write_text | repo / "dta-sroc" / "index.html" | unknown (path method) |
| triage/tests/test_scan_e2e.py | write_text | repo / "forest-plot" / "index.html" | unknown (path method) |
| triage/tests/test_scan_e2e.py | write_text | repo / "hub" / "projects.js" | unknown (path method) |
| triage/tests/test_signals_stub.py | write_text | app / "RETROFIT_AUDIT.md" | unknown (path method) |
| triage/tests/test_signals_stub.py | write_text | app / "index.html" | unknown (path method) |
| triage/tests/test_signals_stub.py | write_text | app / "vendor-bundle.html" | unknown (path method) |
| triage/tests/test_signals_stub.py | write_text | app_dir / "index.html" | unknown (path method) |
| truth-recovery-bench/dose_response/harness_dose.py | json.dump | file handle | meta, results |

## Existing Data On Disk
### oa68k/data
| file | size_bytes | line_count_if_jsonl | first_record_keys |
| --- | --- | --- | --- |
| oa68k/data/holdout_malaria_tb.json | 5883 | - | top keys: frozen_at, frozen_before, rule, why_t1, contract, n_candidates, n_frozen, papers, LIMITATION_TB_ONLY, SECOND_FINDING_IN_THE_LIST_ITSELF, transfer_test_scope |
| oa68k/data/visionstore/calls.jsonl | 1278729 | 117 | schema_version, call_ts, stored_ts, role, source_kind, source_id, image_path_original, image_sha256, image_bytes, blob, model_id, prompt_version, raw_response, parsed, parser_version, confidence_emitted, tokens_in, tokens_out, cost_usd, cost_basis, notes, route |
| oa68k/data/visionstore/calls.shard-A.jsonl | 4711226 | 275 | schema_version, call_ts, stored_ts, role, source_kind, source_id, image_path_original, image_sha256, image_bytes, blob, model_id, route, prompt_version, raw_response, parsed, parser_version, confidence_emitted, tokens_in, tokens_out, cost_usd, cost_basis, notes, shard |

### F:/allmeta/regulatory/data
| file | size_bytes | line_count_if_jsonl | first_record_keys |
| --- | --- | --- | --- |
| regulatory/data/ae_compare_trialmatched.json | 42996 | - | top keys: dolutegravir, bedaquiline, duloxetine |
| regulatory/data/ae_registry.json | 476499 | - | top keys: dolutegravir, bedaquiline, duloxetine, oseltamivir, rosiglitazone |
| regulatory/data/ae_registry.name_only.bak.json | 421966 | - | top keys: dolutegravir, bedaquiline, duloxetine, oseltamivir, rosiglitazone |
| regulatory/data/ae_vocab.json | 363819 | - | top keys: min_trials, n_terms, n_raw_terms, terms |
| regulatory/data/ema_medicines.xlsx | 893116 | - | - |
| regulatory/data/extracted_trials.json | 7191 | - | top keys: _contract, documents, trials |
| regulatory/data/faers_feasibility.json | 727 | - | top keys: BEDAQUILINE\|Electrocardiogram QT prolonged, BEDAQUILINE\|Headache, ROSIGLITAZONE\|Myocardial infarction, ROSIGLITAZONE\|Headache |
| regulatory/data/fda_nct_crosswalk.json | 4751 | - | top keys: dolutegravir, bedaquiline, duloxetine, oseltamivir |
| regulatory/data/fda_probe.firstmatch_buggy.jsonl.bak | 40374 | 28 | drug, tag, matched_field, status, total_apps, apps, n_apps_with_reviews, n_review_docs |
| regulatory/data/fda_probe.jsonl | 66597 | 28 | drug, tag, fields_hit, total_apps_found, status, apps, n_apps_with_reviews, n_review_docs |
| regulatory/data/papers_cache/PMC10293792.xml | 193943 | - | - |
| regulatory/data/papers_cache/PMC11441995.xml | 96486 | - | - |
| regulatory/data/papers_cache/PMC11800428.xml | 97176 | - | - |
| regulatory/data/papers_cache/PMC12107617.xml | 125023 | - | - |
| regulatory/data/papers_cache/PMC12224115.xml | 144212 | - | - |
| regulatory/data/papers_cache/PMC12256558.xml | 114855 | - | - |
| regulatory/data/papers_cache/PMC12404718.xml | 92515 | - | - |
| regulatory/data/papers_cache/PMC12497951.xml | 111176 | - | - |
| regulatory/data/papers_cache/PMC13017758.xml | 109002 | - | - |
| regulatory/data/papers_cache/PMC3069732.xml | 135024 | - | - |
| regulatory/data/papers_cache/PMC3563307.xml | 85763 | - | - |
| regulatory/data/papers_cache/PMC3694319.xml | 69627 | - | - |
| regulatory/data/papers_cache/PMC4007556.xml | 258419 | - | - |
| regulatory/data/papers_cache/PMC4091579.xml | 102806 | - | - |
| regulatory/data/papers_cache/PMC4092087.xml | 121478 | - | - |
| regulatory/data/papers_cache/PMC4166983.xml | 75051 | - | - |
| regulatory/data/papers_cache/PMC4269626.xml | 122463 | - | - |
| regulatory/data/papers_cache/PMC4284010.xml | 61289 | - | - |
| regulatory/data/papers_cache/PMC4335094.xml | 81821 | - | - |
| regulatory/data/papers_cache/PMC4575289.xml | 107794 | - | - |
| regulatory/data/papers_cache/PMC4645960.xml | 36583 | - | - |
| regulatory/data/papers_cache/PMC5063380.xml | 87358 | - | - |
| regulatory/data/papers_cache/PMC5192973.xml | 113924 | - | - |
| regulatory/data/papers_cache/PMC5460622.xml | 81624 | - | - |
| regulatory/data/papers_cache/PMC5533563.xml | 82503 | - | - |
| regulatory/data/papers_cache/PMC5634582.xml | 71396 | - | - |
| regulatory/data/papers_cache/PMC5745624.xml | 101928 | - | - |
| regulatory/data/papers_cache/PMC5899294.xml | 33220 | - | - |
| regulatory/data/papers_cache/PMC6053142.xml | 116761 | - | - |
| regulatory/data/papers_cache/PMC6964875.xml | 93555 | - | - |
| regulatory/data/papers_cache/PMC7011376.xml | 85552 | - | - |
| regulatory/data/papers_cache/PMC7027917.xml | 89708 | - | - |
| regulatory/data/papers_cache/PMC7054577.xml | 79191 | - | - |
| regulatory/data/papers_cache/PMC7163373.xml | 96061 | - | - |
| regulatory/data/papers_cache/PMC8140818.xml | 150035 | - | - |
| regulatory/data/papers_cache/PMC8988194.xml | 370076 | - | - |
| regulatory/data/papers_cache/PMC9020285.xml | 103067 | - | - |
| regulatory/data/papers_cache/PMC9124352.xml | 108750 | - | - |
| regulatory/data/papers_cache/PMC9165736.xml | 32200 | - | - |
| regulatory/data/papers_cache/PMC9312388.xml | 111562 | - | - |
| regulatory/data/phase1_gap.json | 1260 | - | top keys: dolutegravir, bedaquiline, duloxetine |
| regulatory/data/statr_docs.jsonl | 73862 | 137 | drug, tag, app, date, component, url, download, path, pages, sampled, chars_per_page, text_pages, verdict, sig_trial_ids, sig_nct, sig_randomized_n, sig_arm_words, sig_effect, size_mb |
| regulatory/data/textlayer.jsonl | 24379 | 78 | drug, tag, app, date, url, sub, download, pages, sampled, chars_in_sample, text_pages_in_sample, chars_per_page, verdict, size_mb |
| regulatory/data/toc_resolved.anchor_scrape.jsonl.bak | 113630 | 260 | drug, tag, app, sponsor, date, sub, review_url, how, components, has_statr, has_medr |
| regulatory/data/toc_resolved.jsonl | 119219 | 260 | drug, tag, app, sponsor, date, sub, review_url, how, components, has_statr, has_medr |

## Rung Reuse Map
- Rung 1: 86/172 rowed modules/files have an implementation signal.
  - IPD-Meta-Pro/dev/build.py
  - audit/classifier.py
  - audit/render.py
  - dosehtml/dose-response-cli.py
  - dosehtml/scripts/build_release_readiness_summary.py
  - evidenceos/src/evidenceos_engine.py
  - glp1-obesity-mbnma/build_continuous_report.py
  - glp1-obesity-mbnma/build_rapidmeta_config.py
  - glp1-obesity-mbnma/class2_pcsk9/build_pcsk9_rapidmeta_config.py
  - glp1-obesity-mbnma/class2_pcsk9/pcsk9_rapidmeta_harvest.py
  - glp1-obesity-mbnma/class3_sglt2/build_sglt2_rapidmeta_config.py
  - glp1-obesity-mbnma/class3_sglt2/sglt2_classeffect.py
  - glp1-obesity-mbnma/class3_sglt2/sglt2_rapidmeta_harvest.py
  - glp1-obesity-mbnma/concordance_battery.py
  - glp1-obesity-mbnma/concordance_validation.py
  - glp1-obesity-mbnma/dashboard.py
  - glp1-obesity-mbnma/extract_full.py
  - glp1-obesity-mbnma/fix1_medline_multistrategy.py
  - glp1-obesity-mbnma/run_all.py
  - glp1-obesity-mbnma/run_medline_compare.py
  - glp1-obesity-mbnma/trial_sequential.py
  - glp1-obesity-mbnma/ubcma_reporting_bias.py
  - glp1-obesity-mbnma/workstream_H_benefitrisk.py
  - glp1-obesity-mbnma/workstream_synthesis.py
  - oa68k/adjbatch.py
  - oa68k/behaviour.py
  - oa68k/bendlink.py
  - oa68k/breadthaudit.py
  - oa68k/cohorts.py
  - oa68k/compare_dupes.py
  - oa68k/config.py
  - oa68k/coverage.py
  - oa68k/crosswalk.py
  - oa68k/defectmine.py
  - oa68k/detect2.py
  - oa68k/detect3.py
  - oa68k/dta_detect.py
  - oa68k/epmc_seed.py
  - oa68k/eraprobe.py
  - oa68k/eraseed.py
  - oa68k/figscan.py
  - oa68k/forestvision.py
  - oa68k/fulltext.py
  - oa68k/goldframe.py
  - oa68k/goldsample.py
  - oa68k/holdout_freeze.py
  - oa68k/ingest.py
  - oa68k/isrctn.py
  - oa68k/keyaudit.py
  - oa68k/keyscan.py
  - ... 36 more paths omitted from this map; see tables above.
- Rung 2: 130/172 rowed modules/files have an implementation signal.
  - IPD-Meta-Pro/dev/build.py
  - Pairwiseai/S4_Validation_Test.py
  - audit/render.py
  - evidenceos/src/evidenceos_engine.py
  - extractor_bridge/extract_meta.py
  - glp1-obesity-mbnma/bayes_mbnma.py
  - glp1-obesity-mbnma/benford_integrity.py
  - glp1-obesity-mbnma/build_continuous_report.py
  - glp1-obesity-mbnma/build_rapidmeta_config.py
  - glp1-obesity-mbnma/build_survival.py
  - glp1-obesity-mbnma/cinema_confidence.py
  - glp1-obesity-mbnma/class2_pcsk9/build_pcsk9_rapidmeta_config.py
  - glp1-obesity-mbnma/class2_pcsk9/harvest_pcsk9.py
  - glp1-obesity-mbnma/class2_pcsk9/pcsk9_dashboard.py
  - glp1-obesity-mbnma/class2_pcsk9/pcsk9_league.py
  - glp1-obesity-mbnma/class2_pcsk9/pcsk9_rapidmeta_harvest.py
  - glp1-obesity-mbnma/class2_pcsk9/pcsk9_transport.py
  - glp1-obesity-mbnma/class3_sglt2/build_sglt2_rapidmeta_config.py
  - glp1-obesity-mbnma/class3_sglt2/sglt2_classeffect.py
  - glp1-obesity-mbnma/class3_sglt2/sglt2_dashboard.py
  - glp1-obesity-mbnma/class3_sglt2/sglt2_league_bayes.py
  - glp1-obesity-mbnma/class3_sglt2/sglt2_rapidmeta_harvest.py
  - glp1-obesity-mbnma/class3_sglt2/sglt2_transport.py
  - glp1-obesity-mbnma/cnma_incretin.py
  - glp1-obesity-mbnma/concordance_battery.py
  - glp1-obesity-mbnma/concordance_validation.py
  - glp1-obesity-mbnma/dashboard.py
  - glp1-obesity-mbnma/discovery.py
  - glp1-obesity-mbnma/entropy_transport.py
  - glp1-obesity-mbnma/extend_surrogate.py
  - glp1-obesity-mbnma/extract.py
  - glp1-obesity-mbnma/extract_full.py
  - glp1-obesity-mbnma/fit_network.py
  - glp1-obesity-mbnma/fix1_medline_multistrategy.py
  - glp1-obesity-mbnma/grade_export.py
  - glp1-obesity-mbnma/harvest_class_weight.py
  - glp1-obesity-mbnma/harvest_cvot_weight.py
  - glp1-obesity-mbnma/joint_benefit_risk.py
  - glp1-obesity-mbnma/nma_league.py
  - glp1-obesity-mbnma/run_all.py
  - glp1-obesity-mbnma/run_medline_compare.py
  - glp1-obesity-mbnma/surrogate_validation.py
  - glp1-obesity-mbnma/survival_nma.py
  - glp1-obesity-mbnma/trial_sequential.py
  - glp1-obesity-mbnma/ubcma_reporting_bias.py
  - glp1-obesity-mbnma/validate_extraction.py
  - glp1-obesity-mbnma/workstream_B_transport.py
  - glp1-obesity-mbnma/workstream_C_transitivity.py
  - glp1-obesity-mbnma/workstream_D_robustness.py
  - glp1-obesity-mbnma/workstream_H_benefitrisk.py
  - ... 80 more paths omitted from this map; see tables above.
- Rung 3: 91/172 rowed modules/files have an implementation signal.
  - evidenceos/src/evidenceos_engine.py
  - glp1-obesity-mbnma/bayes_mbnma.py
  - glp1-obesity-mbnma/class2_pcsk9/pcsk9_dashboard.py
  - glp1-obesity-mbnma/class2_pcsk9/pcsk9_transport.py
  - glp1-obesity-mbnma/class3_sglt2/sglt2_dashboard.py
  - glp1-obesity-mbnma/concordance_battery.py
  - glp1-obesity-mbnma/concordance_validation.py
  - glp1-obesity-mbnma/dashboard.py
  - glp1-obesity-mbnma/workstream_bmi.py
  - nma-dose-response-app/create_production.py
  - oa68k/adjbatch.py
  - oa68k/adjscore.py
  - oa68k/behaviour.py
  - oa68k/bendlink.py
  - oa68k/breadthaudit.py
  - oa68k/build_done_global.py
  - oa68k/cohorts.py
  - oa68k/config.py
  - oa68k/coverage.py
  - oa68k/crosswalk.py
  - oa68k/detect2.py
  - oa68k/detect3.py
  - oa68k/dta_detect.py
  - oa68k/epmc_seed.py
  - oa68k/eraprobe.py
  - oa68k/eraseed.py
  - oa68k/fda.py
  - oa68k/figfetch.py
  - oa68k/figscan.py
  - oa68k/forestgold.py
  - oa68k/forestrate_era.py
  - oa68k/forestscore.py
  - oa68k/fulltext.py
  - oa68k/goldframe.py
  - oa68k/goldsample.py
  - oa68k/harvest.py
  - oa68k/holdout_freeze.py
  - oa68k/ingest.py
  - oa68k/ingest_agent.py
  - oa68k/ingest_raw.py
  - oa68k/integrity.py
  - oa68k/isrctn.py
  - oa68k/jats.py
  - oa68k/keyaudit.py
  - oa68k/keyscan.py
  - oa68k/ladder.py
  - oa68k/ledger.py
  - oa68k/licenceaudit.py
  - oa68k/linkfunnel.py
  - oa68k/linkmap.py
  - ... 41 more paths omitted from this map; see tables above.
- Rung 4: 105/172 rowed modules/files have an implementation signal.
  - IPD-Meta-Pro/dev/build.py
  - dosehtml/dose-response-cli.py
  - dosehtml/scripts/build_release_readiness_summary.py
  - dosehtml/scripts/cross_package_multipersona_review.py
  - evidenceos/src/evidenceos_engine.py
  - glp1-obesity-mbnma/bayes_mbnma.py
  - glp1-obesity-mbnma/benford_integrity.py
  - glp1-obesity-mbnma/build_continuous_report.py
  - glp1-obesity-mbnma/build_rapidmeta_config.py
  - glp1-obesity-mbnma/build_survival.py
  - glp1-obesity-mbnma/cinema_confidence.py
  - glp1-obesity-mbnma/class2_pcsk9/build_pcsk9_rapidmeta_config.py
  - glp1-obesity-mbnma/class2_pcsk9/pcsk9_dashboard.py
  - glp1-obesity-mbnma/class2_pcsk9/pcsk9_league.py
  - glp1-obesity-mbnma/class3_sglt2/build_sglt2_rapidmeta_config.py
  - glp1-obesity-mbnma/class3_sglt2/sglt2_classeffect.py
  - glp1-obesity-mbnma/class3_sglt2/sglt2_dashboard.py
  - glp1-obesity-mbnma/class3_sglt2/sglt2_league_bayes.py
  - glp1-obesity-mbnma/cnma_incretin.py
  - glp1-obesity-mbnma/concordance_battery.py
  - glp1-obesity-mbnma/concordance_validation.py
  - glp1-obesity-mbnma/dashboard.py
  - glp1-obesity-mbnma/decision_sensitivity.py
  - glp1-obesity-mbnma/discovery.py
  - glp1-obesity-mbnma/extend_surrogate.py
  - glp1-obesity-mbnma/extract.py
  - glp1-obesity-mbnma/extract_full.py
  - glp1-obesity-mbnma/fit_network.py
  - glp1-obesity-mbnma/grade_export.py
  - glp1-obesity-mbnma/harvest_class_weight.py
  - glp1-obesity-mbnma/joint_benefit_risk.py
  - glp1-obesity-mbnma/nhanes_microdata.py
  - glp1-obesity-mbnma/nma_league.py
  - glp1-obesity-mbnma/nma_league_export.py
  - glp1-obesity-mbnma/run_all.py
  - glp1-obesity-mbnma/surrogate_validation.py
  - glp1-obesity-mbnma/trial_sequential.py
  - glp1-obesity-mbnma/ubcma_reporting_bias.py
  - glp1-obesity-mbnma/validate_extraction.py
  - glp1-obesity-mbnma/workstream_B_transport.py
  - glp1-obesity-mbnma/workstream_C_transitivity.py
  - glp1-obesity-mbnma/workstream_D_robustness.py
  - glp1-obesity-mbnma/workstream_H_benefitrisk.py
  - glp1-obesity-mbnma/workstream_I_representativeness.py
  - glp1-obesity-mbnma/workstream_bmi.py
  - glp1-obesity-mbnma/workstream_mlnmr.py
  - oa68k/aact_ext.py
  - oa68k/adjbatch.py
  - oa68k/adjscore.py
  - oa68k/cohorts.py
  - ... 55 more paths omitted from this map; see tables above.
- Rung 5: 15/172 rowed modules/files have an implementation signal.
  - evidenceos/src/evidenceos_engine.py
  - glp1-obesity-mbnma/workstream_synthesis.py
  - oa68k/fda.py
  - oa68k/isrctn.py
  - oa68k/keyscan.py
  - oa68k/ladder.py
  - oa68k/nextbatch.py
  - oa68k/nma_export.py
  - oa68k/registry_full.py
  - regulatory/crosswalk_fda_nct.py
  - regulatory/fetch_statr.py
  - regulatory/phase1_gap.py
  - regulatory/probe_ema.py
  - scripts/living_evidence_watch.py
  - scripts/review_cycle.py

## GAPS
- No empty rung among rowed implementation signals. Inspect row-level purpose before reusing a module.

## Appendix A: Non-oa68k Grep Hits Inspected But Not Rowed As Source Modules
Excluded grep hits: 270/351.
- amstar-2/tests/test_structure.py
- audit/tests/test_classifier.py
- audit/tests/test_orchestrator_e2e.py
- audit/tests/test_probe_smoke.py
- audit/tests/test_render.py
- bayesian-ma/tests/test_bayesian_ma.py
- bayesian-ma/tests/test_structure.py
- bayesian-mcmc/tests/test_structure.py
- bayesian-nma/tests/test_structure.py
- benefit-risk/tests/test_structure.py
- benford-screen/tests/test_benford.py
- benford-screen/tests/test_structure.py
- bucher/tests/test_structure.py
- cerqual/tests/test_smoke.py
- cerqual/tests/test_structure.py
- cinema/tests/test_structure.py
- citation-chaser/tests/test_smoke.py
- citation-chaser/tests/test_structure.py
- citation-dedup/tests/test_smoke.py
- citation-dedup/tests/test_structure.py
- component-nma/tests/test_structure.py
- copas/tests/test_against_metasens.py
- copas/tests/test_structure.py
- cumulative-subgroup/tests/test_cumulative_subgroup.py
- cumulative-subgroup/tests/test_structure.py
- design/tests/test_structure.py
- dosehtml/archive/fix_issues.py
- dosehtml/archive/release-evidence/2026-02-28/scripts/build_release_readiness_summary.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_170159/_run_full_validation_suite.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_170159/dose-response-cli.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_170159/test_dose_response_app.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_170159/test_dose_response_main.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_170159/test_v19_comprehensive.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_170227/_run_full_validation_suite.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_170227/dose-response-cli.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_170227/test_dose_response_app.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_170227/test_dose_response_main.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_170227/test_v19_comprehensive.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_172825/_run_full_validation_suite.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_172825/dose-response-cli.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_172825/test_dose_response_app.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_172825/test_dose_response_main.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_172825/test_v19_comprehensive.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_174841/_run_full_validation_suite.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_174841/dose-response-cli.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_174841/test_dose_response_app.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_174841/test_dose_response_main.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-12_174841/test_v19_comprehensive.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-13_093003/_run_full_validation_suite.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-13_093003/dose-response-cli.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-13_093003/test_dose_response_app.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-13_093003/test_dose_response_main.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-13_093003/test_v19_comprehensive.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-13_114929/_run_full_validation_suite.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-13_114929/dose-response-cli.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-13_114929/test_dose_response_app.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-13_114929/test_dose_response_main.py
- dosehtml/archive/release-snapshots/dosehtml-v18.1.0-stable-2026-02-13_114929/test_v19_comprehensive.py
- dosehtml/test_dose_response_app.py
- dosehtml/test_dose_response_main.py
- dosehtml/test_v19_comprehensive.py
- dosehtml/tests/test_structure.py
- dta-sroc/tests/test_dta_sroc.py
- evalue/tests/test_structure.py
- evidence-board/tests/test_structure.py
- evidenceos/tests/test_report.py
- evidenceos/tests/test_static_app.py
- extract/tests/fixtures/make_fixture.py
- extract/tests/test_extract_grounding.py
- extract/tests/test_sr_records.py
- extract/tests/test_structure.py
- focus-studio/tests/test_structure.py
- forest-plot/tests/test_forest_plot.py
- fragility/tests/test_structure.py
- funnel-plot/tests/test_funnel_plot.py
- glp1-obesity-mbnma/tests/test_pipeline.py
- gosh/tests/test_structure.py
- gosh-metareg/tests/test_structure.py
- grade-sof/tests/test_grade_sof.py
- grade-sof/tests/test_structure.py
- heterogeneity/tests/test_heterogeneity.py
- hsroc/tests/test_smoke.py
- hsroc/tests/test_structure.py
- HTA/tests/test_structure.py
- inspect-sr/tests/test_structure.py
- IPD-Meta-Pro/dev/build-scripts/add_advanced_v2.py
- IPD-Meta-Pro/dev/build-scripts/add_advanced_v3.py
- IPD-Meta-Pro/dev/build-scripts/add_advanced_v4.py
- IPD-Meta-Pro/dev/build-scripts/add_advanced_v5.py
- IPD-Meta-Pro/dev/build-scripts/add_comparison_table.py
- IPD-Meta-Pro/dev/build-scripts/add_cutting_edge_features.py
- IPD-Meta-Pro/dev/build-scripts/add_editorial_review.py
- IPD-Meta-Pro/dev/build-scripts/add_pre_id.py
- IPD-Meta-Pro/dev/build-scripts/add_real_datasets.py
- IPD-Meta-Pro/dev/build-scripts/add_validation_report.py
- IPD-Meta-Pro/dev/build-scripts/beat_r_definitively.py
- IPD-Meta-Pro/dev/build-scripts/beat_r_features.py
- IPD-Meta-Pro/dev/build-scripts/beat_r_ultimate.py
- IPD-Meta-Pro/dev/build-scripts/benchmark_advanced_survival_against_r.py
- IPD-Meta-Pro/dev/build-scripts/benchmark_extended_survival_against_r.py
- IPD-Meta-Pro/dev/build-scripts/benchmark_frontier_gap_methods.py
- IPD-Meta-Pro/dev/build-scripts/beyond_r_40_features.py
- IPD-Meta-Pro/dev/build-scripts/browser_test_runner.py
- IPD-Meta-Pro/dev/build-scripts/check_line.py
- IPD-Meta-Pro/dev/build-scripts/edge_webdriver.py
- IPD-Meta-Pro/dev/build-scripts/editorial_rsm_review.py
- IPD-Meta-Pro/dev/build-scripts/exceed_r_capabilities.py
- IPD-Meta-Pro/dev/build-scripts/exceed_r_part2.py
- IPD-Meta-Pro/dev/build-scripts/extract_and_check_js.py
- IPD-Meta-Pro/dev/build-scripts/fix_all_bugs.py
- IPD-Meta-Pro/dev/build-scripts/fix_canvas_size.py
- IPD-Meta-Pro/dev/build-scripts/fix_editorial_final.py
- IPD-Meta-Pro/dev/build-scripts/fix_editorial_issues.py
- IPD-Meta-Pro/dev/build-scripts/fix_editorial_v2.py
- IPD-Meta-Pro/dev/build-scripts/fix_editorial_v3.py
- IPD-Meta-Pro/dev/build-scripts/fix_js_function_tests.py
- IPD-Meta-Pro/dev/build-scripts/fix_js_function_tests_v2.py
- IPD-Meta-Pro/dev/build-scripts/fix_js_functions.py
- IPD-Meta-Pro/dev/build-scripts/fix_null_parent.py
- IPD-Meta-Pro/dev/build-scripts/fix_null_parent_v2.py
- IPD-Meta-Pro/dev/build-scripts/fix_paren_bug.py
- IPD-Meta-Pro/dev/build-scripts/fix_quotes.py
- IPD-Meta-Pro/dev/build-scripts/fix_selenium_test.py
- IPD-Meta-Pro/dev/build-scripts/fix_stats.py
- IPD-Meta-Pro/dev/build-scripts/fix_syntax.py
- IPD-Meta-Pro/dev/build-scripts/ipd_parity_gate.py
- IPD-Meta-Pro/dev/build-scripts/make_even_better.py
- IPD-Meta-Pro/dev/build-scripts/optimize_advanced.py
- IPD-Meta-Pro/dev/build-scripts/optimize_performance.py
- IPD-Meta-Pro/dev/build-scripts/quick_js_test.py
- IPD-Meta-Pro/dev/build-scripts/regression_fixed_paths_test.py
- IPD-Meta-Pro/dev/build-scripts/release_checklist.py
- IPD-Meta-Pro/dev/build-scripts/rsm_editorial_review_v2.py
- IPD-Meta-Pro/dev/build-scripts/rsm_editorial_v3.py
- IPD-Meta-Pro/dev/build-scripts/rsm_editorial_v4.py
- IPD-Meta-Pro/dev/build-scripts/rsm_editorial_v5.py
- IPD-Meta-Pro/dev/build-scripts/rsm_editorial_v6.py
- IPD-Meta-Pro/dev/build-scripts/rsm_editorial_v7.py
- IPD-Meta-Pro/dev/build-scripts/selenium_full_function_plot_check.py
- IPD-Meta-Pro/dev/build-scripts/selenium_test.py
- IPD-Meta-Pro/dev/build-scripts/smoke_user_flows_test.py
- IPD-Meta-Pro/dev/build-scripts/update_editorial_final.py
- IPD-Meta-Pro/dev/build-scripts/upgrade_to_10_10.py
- IPD-Meta-Pro/dev/build-scripts/user_flow_smoke_test.py
- IPD-Meta-Pro/tests/test_structure.py
- kanban-lab/tests/test_structure.py
- km-reconstructor/tests/test_structure.py
- limit-ma/tests/test_structure.py
- living-meta/tests/test_structure.py
- local-ai/tests/test_smoke.py
- local-ai/tests/test_structure.py
- local-install/tests/test_smoke.py
- local-install/tests/test_structure.py
- mcid/tests/test_structure.py
- median-to-mean/tests/test_structure.py
- meta-regression/tests/test_meta_regression.py
- mh-peto/tests/test_structure.py
- multilevel-ma/tests/test_structure.py
- multiplicative-ma/tests/test_structure.py
- nma/tests/test_nma.py
- nma-dose-response-app/add_editorial_handlers.py
- nma-dose-response-app/add_rsm_v2_handlers.py
- nma-dose-response-app/add_tier1_handlers.py
- nma-dose-response-app/browser_test_isolated.py
- nma-dose-response-app/comprehensive_feature_test.py
- nma-dose-response-app/comprehensive_feature_test_v2.py
- nma-dose-response-app/comprehensive_review.py
- nma-dose-response-app/comprehensive_test.py
- nma-dose-response-app/debug_dl.py
- nma-dose-response-app/edge_browser_test.py
- nma-dose-response-app/editorial_review_rsm.py
- nma-dose-response-app/full_app_test.py
- nma-dose-response-app/full_app_test_v2.py
- nma-dose-response-app/tests/test_structure.py
- nma-global-inconsistency/tests/test_structure.py
- nma-inconsistency/tests/test_structure.py
- nma-pro-v2/tests/test_netmeta_compare.py
- oa68k/tests/test_apikey.py
- oa68k/tests/test_behaviour.py
- oa68k/tests/test_cohorts_transport.py
- oa68k/tests/test_detect2.py
- oa68k/tests/test_detect3.py
- oa68k/tests/test_dta_detect.py
- oa68k/tests/test_forestvision.py
- oa68k/tests/test_fulltext_durability.py
- oa68k/tests/test_jats_headers.py
- oa68k/tests/test_keyscan.py
- oa68k/tests/test_linkmap.py
- oa68k/tests/test_nma_export.py
- oa68k/tests/test_pipeline.py
- oa68k/tests/test_registry_full.py
- oa68k/tests/test_reshard.py
- oa68k/tests/test_trial_index.py
- Pairwiseai/add_advanced_features.py
- Pairwiseai/add_all_features.py
- Pairwiseai/debug_bias_panel.py
- Pairwiseai/selenium_test.py
- Pairwiseai/test_truthcert_comprehensive.py
- Pairwiseai/test_truthcert_v2.py
- Pairwiseai/tests/test_structure.py
- pico/tests/test_smoke.py
- pico/tests/test_structure.py
- poth/tests/test_structure.py
- powerma/tests/test_structure.py
- prisma-checklist/tests/test_structure.py
- prisma-flow/tests/test_prisma_flow.py
- prisma-flow/tests/test_structure.py
- prisma-nma/tests/test_structure.py
- prisma-screen/tests/test_prisma_screen.py
- prisma-screen/tests/test_structure.py
- proportion-ma/tests/test_structure.py
- pubbias-tests/tests/test_structure.py
- quadas-2/tests/test_structure.py
- quantile-ma/tests/test_structure.py
- rct-extractor/tests/test_structure.py
- registry-pubbias/tests/test_structure.py
- registry-survival/tests/test_registry_engine.py
- registry-survival/tests/test_structure.py
- reporting-bias/tests/test_structure.py
- review-project/tests/test_structure.py
- rob/tests/test_playwright.py
- rob/tests/test_structure.py
- rob-traffic-light/tests/test_rob_traffic_light.py
- rob-traffic-light/tests/test_structure.py
- rob2/tests/test_structure.py
- robins-e/tests/test_structure.py
- robins-i/tests/test_structure.py
- screen/tests/test_structure.py
- scripts/add_app_flow_bar.py
- scripts/add_course_and_featured.py
- scripts/add_csp.py
- scripts/add_forced_colors.py
- scripts/add_zenodo_grounding.py
- search/tests/test_regressions.py
- search/tests/test_structure.py
- search-completeness/tests/test_structure.py
- search-translator/tests/test_smoke.py
- search-translator/tests/test_structure.py
- spec-collapse/tests/test_structure.py
- surrogate-validation/tests/test_structure.py
- tests/test_bma_tau.py
- tests/test_ground_citations.py
- tests/test_hub_sw.py
- tests/test_living_evidence_watch.py
- tests/test_ma_comparisons_v1.py
- tests/test_offline_compliance.py
- tests/test_paper_bridge.py
- tests/test_real_data_calibration.py
- tests/test_report_bundle.py
- tests/test_seed_badge.py
- tests/test_snapshot_diff.py
- tests/test_stats_qt.py
- tests/test_truthcert_export.py
- thematic-synthesis/tests/test_smoke.py
- thematic-synthesis/tests/test_structure.py
- transitivity/tests/test_structure.py
- transportability/tests/test_structure.py
- transported-nma/tests/test_structure.py
- triage/tests/test_projects_js.py
- triage/tests/test_render_html.py
- triage/tests/test_signals_stub.py
- Truthcert1/tests/test_structure.py
- tsa/tests/test_structure.py
- tsa/tests/test_tsa.py
- umbrella-overlap/tests/test_structure.py
- webr-studio/tests/test_structure.py
- webr-validator/tests/test_structure.py
- webr-validator/tests/test_webr_validator.py
- workbench/tests/test_structure.py
- workbench/tests/test_workbench.py

