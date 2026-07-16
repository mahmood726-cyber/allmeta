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
