# FULLTEXT SELECTOR CHECK

Source opened: `F:/allmeta/oa68k/fulltext.py` only.

1. Candidate set

For default corpus `linked_rct`, built in `candidates()`, lines 130-162.
`_run_locked()` selects it at line 270:
`cands = candidates() if corpus == "linked_rct" else seed_candidates(corpus)`

Exact visible SQL/predicate:
```sql
WITH p AS (
  SELECT pmid, pmcid, doi, title FROM read_parquet({_lst(papers)})
  WHERE is_open_access AND in_pmc
    AND pmcid IS NOT NULL AND trim(pmcid) <> ''
),
link AS (
  SELECT trim(pmid) AS pmid, nct_id FROM read_parquet({_lst(refs)})
  WHERE upper(reference_type) IN ('DERIVED','RESULT')
),
t AS (SELECT nct_id, cohort, results_posted
      FROM read_parquet({_lst(trials)}))
SELECT p.pmcid, p.pmid, p.doi,
       MIN(CASE WHEN t.cohort='p0_malaria_tb_hiv' THEN 0 ELSE 1 END) AS c_rank,
       MAX(CASE WHEN t.results_posted THEN 1 ELSE 0 END) AS any_results,
       string_agg(DISTINCT link.nct_id, ' | ') AS ncts
FROM p JOIN link ON link.pmid = p.pmid
       LEFT JOIN t ON t.nct_id = link.nct_id
GROUP BY p.pmcid, p.pmid, p.doi
ORDER BY c_rank, any_results DESC, CAST(p.pmid AS BIGINT)
```
No publication-type filter appears in this SQL. For other corpora, lines
241-248 call `epmc_seed.load_seed(corpus, priority_first=True)`; I did not
open `epmc_seed.py`, so those rules are incomplete from this file.

2. Primary report claim/assumption

No line says "primary report" or stores a primary-report role. Closest claims:
line 1: `"""Stage T3 - OA full text for the TRIAL papers (layer 3 of the three-layer rule).`
lines 4-6: `This is layer 3: the open-access full text of the papers that`
`actually report the trials - where the results tables, harms and (for DTA) the`
`2x2 sens/spec cells live.`
line 131: `"""OA-in-PMC papers that REPORT an RCT, priority-ordered."""`
These claim/report an RCT, but do not distinguish the trial's primary report
from another paper reporting or citing that NCT.

3. DERIVED/RESULT and reliability acknowledgement

Yes. Line 147: `WHERE upper(reference_type) IN ('DERIVED','RESULT')`
The file does not acknowledge that `reference_type` is unreliable; visible
comments/docstrings rely on it as a linking/reporting predicate.

4. Written records and role/link status

Ledger records are appended at lines 306-308 from `rec`. This file updates them
at lines 316-318:
`rec.update(ncts=c["ncts"], cohort_rank=c["cohort_rank"], corpus=corpus,`
`           source_tier="oa_fulltext", extracted_at=today,`
`           locator=f"https://europepmc.org/article/PMC/{c['pmcid']}")`
Cached records are defined at lines 176-178 with `pmcid`, `pmid`, `doi`,
`status`, `tier`, `tiers_tried`, `bytes`, and `path`.
Table rows are written to parquet at lines 381-390, created at lines 326-348,
and include `pmcid`, `pmid`, `ncts`, `table_index`, `label`, `caption`,
`n_rows`, `n_cols`, `headers`, `rows_json`, `table_xml`, `tier`, `corpus`,
`source_tier`, `locator`, and `extracted_at`.
The record identifies the paper (`pmcid`, `pmid`, `doi`) and linked NCTs
(`ncts`). It does not state a paper role or mark the primary report.

Verdict

CANNOT TELL FROM THIS FILE whether the whole pipeline commits the sibling-lane
error, because this file does not show how `trial_refs` or `papers` were derived
or whether upstream role-resolution exists. From this file alone, the selector
uses an OA-in-PMC paper-level flag plus a DERIVED/RESULT NCT link, then describes
selected papers as reporting trials without proving primary-report status. What
would settle it: inspect the code/data contract creating `trial_refs/*.parquet`
and `papers/*.parquet`, specifically whether it assigns and validates a
source-backed publication role such as primary trial report rather than only a
paper-to-NCT link.
