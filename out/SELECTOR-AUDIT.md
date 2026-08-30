# Selector Audit: oa68k/ladder.py

Scope: production selector gates for documents, PubMed/registry/regulatory records, prior-meta rows, and posted document records. Skipped selftests and value-only numeric plausibility gates.

| line | class | predicate, copied verbatim from the source | what it selects ON |
|---:|:---:|---|---|
| 547 | B | `q = ('(PUB_TYPE:"Meta-Analysis" OR PUB_TYPE:"Systematic Review") AND OPEN_ACCESS:y '` | Europe PMC prior-meta candidates on PUB_TYPE and OPEN_ACCESS |
| 548 | B | `'AND HAS_FT:y AND (' + " OR ".join('"' + n + '"' for n in names if n) + ')')` | Europe PMC prior-meta candidates on HAS_FT plus trial/alias names |
| 591 | C | `if not pmcid:` | prior-meta hits with a PMCID usable for full-text retrieval |
| 601 | C | `if got.get("status") != "XML" or not got.get("path"):` | prior-meta full texts actually obtained as XML at a path |
| 636 | A | `if val:` | the prior-meta document whose tables yielded a trial-row value |
| 684 | A | `if cues and not any(c in scope_text.lower() for c in cues):` | prior-meta table candidates on requested outcome cue |
| 686 | B | `if single and _is_composite(scope_text):` | prior-meta table candidates on composite-outcome type wording |
| 692 | A | `if not _names_trial(label, req):` | prior-meta rows on trial identity in the row label |
| 702 | B | `if _ROW_NOT_A_RESULT.search(" ".join(cells)):` | prior-meta rows on row-type tags such as post-hoc/observational/subgroup |
| 778 | A | `if not req.nct:` | CT.gov registry record availability on explicit NCT identity |
| 800 | B | `hasres = bool(js.get("hasResults") or res)` | CT.gov result-section availability flag |
| 838 | A | `if cues and not any(c in title for c in cues):` | CT.gov outcomeMeasure records on requested outcome cue |
| 841 | B | `if single and _is_composite(raw_title):` | CT.gov outcomeMeasure records on composite-outcome type wording |
| 846 | B | `if pv in (None, ""):` | CT.gov analyses records on paramValue availability |
| 903 | C | `epmc_pmids = [h["pmid"] for h in hits if h.get("pmid")]` | Europe PMC seed records with PMIDs usable by PubMed efetch |
| 908 | A | `cands = ([pmid] if pmid else []) + _esearch_pmids(session, req, notes)` | PubMed candidate records seeded by explicit PMID or identity-search PMIDs |
| 909 | A | `cands += [p for p in epmc_pmids if p not in cands]` | PubMed candidate IDs after duplicate suppression |
| 931 | C | `if not val:` | ranked own-report records whose abstract yields an extractable value |
| 933 | B | `if require_interval and not val.get("has_interval"):` | ranked own-report records on interval availability flag |
| 948 | A | `if ranked and not pmid:` | first ranked own-report selected as the fallback PMID |
| 955 | C | `pmcid = _pmcid_for(session, pmid, notes) if pmid else ""` | a PMCID reachable from the selected PMID |
| 956 | C | `if pmcid:` | selected PMID restricted to records with PMC full-text reachability |
| 984 | B | `return q + ' AND (PUB_TYPE:"Randomized Controlled Trial" OR PUB_TYPE:"Clinical Trial, Phase III" OR SRC:MED)'` | primary-report search candidates on publication type/source tag |
| 1040 | A | `strong = (['"' + req.nct + '"[si]'] if req.nct else []) \` | PubMed candidates on registration accession in [si] |
| 1041 | A | `        + ['"' + n + '"[Title]' + _topic_and(req) for n in names] \` | PubMed candidates on trial/alias in Title plus topic terms |
| 1042 | A | `        + [n + '[cn]' for n in names] \` | PubMed candidates on collective/corporate author |
| 1043 | A | `        + author_year \` | PubMed candidates on parsed author+year terms |
| 1044 | A | `        + ['"' + n + '"[Author]' for n in names]` | PubMed candidates on trial/alias in Author |
| 1045 | A | `weak = ['"' + n + '"[tiab]' for n in names] + topical` | fallback PubMed candidates on trial/alias in title/abstract and topical terms |
| 1096 | A | `if not ok:` | PubMed records filtered to the trial's own reports by _is_primary_report |
| 1149 | B | `out.sort(key=lambda r: (r["is_design_paper"], not r["has_registration"],` | ranked own-report order on design-paper tag, registration flag, year, RCT tag |
| 1194 | A | `if req.nct and any(req.nct.upper() in b.upper() for b in banks):` | PubMed record identity on registration accession in DataBank |
| 1198 | A | `if collective and _names_trial(_xml_text(collective), req):` | PubMed record identity on CollectiveName naming the trial |
| 1202 | A | `if _names_trial(title, req):` | PubMed record identity on ArticleTitle naming the trial |
| 1211 | A | `if not any(t.lower() in hay for t in req.topic_terms):` | acronym-collision rejection on topic terms in title+abstract |
| 1235 | A | `if yr and yr.group(1) == want_year and any(_sur_match(l) for l in lasts):` | PubMed record identity on first-author surname plus publication year |
| 1282 | A | `if req.nct and req.nct.lower() in low:` | _names_trial identity on NCT text |
| 1288 | A | `if re.search(r"(?<![a-z0-9])" + pat + r"(?![a-z0-9])", low):` | _names_trial identity on trial/alias token match |
| 1339 | A | `candidates = [req.drug] if req.drug else []` | regulatory candidates on explicit requested drug |
| 1340 | A | `candidates += [c for c in (req.drug_candidates or []) if c not in candidates]` | regulatory candidates on PubMed substance annotations after duplicate suppression |
| 1354 | A | `{"search": 'openfda.generic_name:"' + cand + '"', "limit": "5"})` | openFDA application records on generic_name identity |
| 1356 | C | `if r is not None and r.status_code == 200:` | first drug candidate that resolves to reachable openFDA application records |
| 1378 | A | `appls = [x.get("application_number", "") for x in results]` | FDA application records on explicit application_number |
| 1383 | C | `if appls:` | review-PDF addressability from enumerated FDA applications |
| 1389 | A | `{"search": 'openfda.generic_name:"' + req.drug + '"', "limit": "1"})` | openFDA label record on resolved generic_name identity |
| 1394 | C | `if res:` | openFDA label result availability before selecting res[0] |
| 1417 | A | `if not req.nct:` | CT.gov protocol/document record availability on explicit NCT identity |
| 1428 | C | `docs = (((js.get("documentSection") or {}).get("largeDocumentModule") or {})` | posted CT.gov largeDocs reachability path |
| 1438 | C | `(Outcome.RETRIEVED_NO_VALUE.value if docs else Outcome.MISS.value),` | posted-document availability, recorded without mining a result |

of 49 selection sites found, A=26, B=10, C=13

B sites by line number: 547, 548, 686, 702, 800, 841, 846, 933, 984, 1149

B/C ambiguous sites: 601, 955, 956, 1356, 1394, 1428, 1438. These use availability/reachability state, but the code is restricting to records/documents it can fetch or address and is not claiming document role, so the counted class is C.

---

# ADJUDICATION — which of the 10 B sites are actually the retracted defect

Codex's pass is mechanical and over-includes: it labels any type tag or availability
flag `B`. The defect the sibling lane retracted a finding over is narrower and
specific:

> **selecting THE TRIAL'S OWN REPORT by an open-access flag or by a publication type.**
> An OA flag on *a* paper linked to an NCT says nothing about the primary report, and
> adding a `pubType` filter does not save it, because sub-studies carry the RCT tag too.

Judged against that, of the 10 `B` sites:

| line | what it really does | defect? |
|---|---|---|
| **984** | `AND (PUB_TYPE:"Randomized Controlled Trial" OR ... OR SRC:MED)` in the EPMC seed query | ⛔ **YES — fixed** |
| **1149** | `not r["is_rct"]` as the **tertiary** sort key in `_rank_reports` | ⚠️ type tag, but it **orders**, never gates — and it already sits below registration and year precisely because SOLVD's 1991 primary lacks the tag |
| 547, 548 | `OPEN_ACCESS:y AND HAS_FT:y` on **prior meta-analyses** | no — a reachability filter on a document we intend to *read*; no role claim. It does bound rung 1's coverage, which is stated in the report |
| 686, 702, 841 | `_is_composite`, `_ROW_NOT_A_RESULT` | no — these **exclude** an outcome/row by type. Excluding by type is not asserting a role by type |
| 800, 846, 933 | `hasResults`, `pv in (None,"")`, `has_interval` | no — null/availability checks on a **value**, not document selection |

## The answer, with denominators

**Of 49 selection sites: 2 use a publication-type tag anywhere near role, and 0 use
an open-access flag to select the trial's report.**

- **0/49 select the trial report by an OA flag.** The retraction's exact failure mode
  — *"some paper citing this NCT is open access, therefore the primary is reachable"* —
  cannot occur here, because rung 3 decides role by `_is_primary_report`: a
  registration accession the record carries as its own, a collective author, a title
  plus topic, or an author-and-year. **None of those is an availability flag.**
- **1/49 was a pubType filter on the search for the trial's report — now removed.**

## Why line 984 was removed rather than tightened

The clause could only ever **lose** a true primary, never gain one:

- the ROLE decision downstream is identity-based, so the filter adds no evidence;
- a true primary that lacks the tag is silently dropped — **SOLVD's 1991 paper is
  exactly that shape**, and its `[cn]` route was the only thing that reached it;
- and it was close to vacuous anyway: the `OR SRC:MED` disjunct is true of
  essentially every MEDLINE record, so it filtered almost nothing while carrying the
  risk of dropping the one record that mattered.

⇒ **A filter that cannot add evidence but can remove the answer is not a
conservative choice.** Plant 23 asserts the seed query now carries no `PUB_TYPE` and
no OA clause, still carries the trial name and accession, and that a primary report
with **no** publication-type tag is still accepted — on authorship, not on a tag.

⚠️ **Scope of this audit: one file, `oa68k/ladder.py`, 49 sites.** `identity.py`,
`ladder_store.py` and `obtainability.py` were not swept, and `oa68k`'s pre-existing
modules — `fulltext.py` selects on `is_open_access AND in_pmc` — were not either.
That last one is worth its own look, and it is not mine.
