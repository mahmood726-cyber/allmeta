# WATCHDOG LOG — open-access extraction, run to Sat 2026-07-18 15:00

One line per MEANINGFUL ADVANCE (a counter that moved), not per heartbeat.
A live process with a frozen counter is STALLED, not working — if the count in
the newest line equals the one before it, the lane needs a kick, not patience.

Format: `ISO-time | lane | measured counter | note`
Sources: OPEN ACCESS ONLY (AACT/CT.gov, PubMed/EPMC abstracts, OA JATS,
ISRCTN/PACTR). No Embase, no paywalled full text, no CSRs.

2026-07-16T12:34:32 | fulltext:linked_rct | 1000/58255 OA papers harvested | 6w, KEY B, 65/min measured
| 2026-07-16 12:36 | 12,885 | 12,098 | 9,014 | 33,997 (50.2%) | 5,079 | 24.3% poolable-meta (NCT-only) | live poll: 3 shards grinding, key-audit running |
2026-07-16T12:39:27 | cohorts | 290,724 trials tagged: malaria 892 / TB 776 / HIV 4,679 / NCD 84,337 | NCD now first-class, reported separately
2026-07-16T12:39:27 | three-layer | malaria registry-only 145 (16%) -> ANY-LAYER 553 (62%) | single-layer ceiling would have understated by 3.8x
2026-07-16T12:39:27 | transportability | African site: malaria 63.2% vs NCD-cardiometabolic 3.1% (1,392/44,697) | absence (malaria) vs elsewhere-generated (NCD) quantified
2026-07-16T12:47:28 | fda:link | 24 review PDFs -> 69 links -> 29 distinct NCTs (0 unextractable) | Turner loop closed on REAL regulatory data
2026-07-16T12:47:28 | transport | 24,469 RCTs w/ Region-of-Enrollment; 45,289 w/ structured sex (was 843 = category-vs-classification bug, 54x undercount) | NCD mean 0.5% participants in Africa vs malaria 64.8%
2026-07-16T12:51:29 | resume-verify | KILL/RESTART PASSED: no-skip 5,970=5,970 | no-redo 0 dupes | monotone | stale-lock reclaim added (a killed harvester's lock would have wedged the watchdog permanently)
| 2026-07-16 13:01 | 16,631 | 15,996 | 12,921 | 45,548 (67.2%) | 5,079 | NCT-in-text 4.24% / widened 4.48% / ref-PMID route 73-79% cites-linked, 24.3% poolable | KEY-AUDIT: key-absent 0.24% vs data-absent 95.5% on meta TEXT; PACTR=0 hits; NCD=54% of corpus, malaria+TB=2% |
2026-07-16T13:11:22 | METHODS-CONTRACT s0 | predicate audit: allocation='RANDOMIZED' silently dropped 710 randomised-by-title trials (23 African, 2 malaria/TB) | RECOVERED additively -> universe 290,724 -> 291,434, batch 59 extracted
2026-07-16T13:11:22 | phase-diagnostic | NO silent phase filter: PHASE2 34,640 ~= PHASE3 34,985; results-posting 30.0% vs 30.2% | phase 2 is NOT thin
2026-07-16T13:11:22 | withholding | PHASE2 36.8% of closed+overdue withheld vs PHASE3 30.4% (8,114 vs 6,684 candidates) | phase 2 = where drugs die quietly, CONFIRMED
2026-07-16T13:11:22 | three-layer | single-layer would OVERSTATE withholding 12,121->8,114 (ph2) | rule protects against over- AND under-claiming
