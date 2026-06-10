# Registry-native vs literature-based meta — the head-to-head DELTA (the publishable claim)

`workstream_delta_main.py`. Same MBNMA engine, three nested trial sets from the AACT cohort:
S0 registry-native (all) · S1 minus ghosts · S2 literature-emulated (minus ghosts AND minus
T2D-population trials, i.e. what an obesity-weight-loss literature search like Xie 2024 captures).

## Finding 1 — coverage (the registry-native advantage)
| set | trials | patient-contributions |
|---|---|---|
| S0 registry-native | 28 | 17,401 |
| S2 literature-emulated | 23 | 14,510 |
**Registry-native captures +5 trials / +2,891 patient-contributions** a weight-loss literature
search would miss — 5 unpublished ghosts + 9 T2D-secondary-outcome trials (weight reported only in
the CT.gov results, not the diabetes paper's headline).

## Finding 2 — cross-agent ranking (max dose) is ROBUST to sourcing
The clinical hierarchy by effect at each agent's max studied dose is unchanged across S0/S1/S2:
retatrutide / mazdutide / tirzepatide top, etc. **Reassuring: the published metas got the ordering
right, and it does not depend on the unpublished/secondary evidence.** (Top agents' pivotal max-dose
trials are published and obesity-focused, present in all sets.)

## Finding 3 — dose-specific estimates are HIGHLY sourcing-sensitive (the real delta)
Pooled effect at each node's modal dose (same dose across sets), registry-native vs literature-emulated:
| node (modal dose) | S0 registry | S2 literature | Δ (reg−lit) | k reg/lit |
|---|---|---|---|---|
| **semaglutide-oral (14 mg)** | **3.8** | **13.6** | **−9.8** | 3/1 |
| orforglipron (12 mg) | 5.0 | 7.1 | −2.1 | 2/1 |
| semaglutide-sc-weekly (2.4 mg) | 11.6 | 11.7 | −0.1 | 14/13 |
| tirzepatide (10 mg) | 12.3 | 12.3 | 0.0 | 3/3 |

**Oral-semaglutide 14 mg drops from 13.6 pp (literature) to 3.8 pp (registry) — a 9.8 pp swing** —
because the registry adds PIONEER T2D trials where weight is a small secondary outcome. This quantifies
the population-confound: *what you include changes the dose-specific answer by up to ~10 pp*, and the
registry-native approach makes it **visible and decomposable** (you can see the T2D trials pulling it
down) where a literature search silently includes-or-excludes them.

## Reporting bias (from workstream A, folded in)
The unpublished ghost semaglutide-2.4 mg trials pool 3.2 pp LOWER than published (8.5 vs 11.7 pp) —
the reporting-bias direction; visible only registry-natively.

## The publishable claim (honest)
Not "a better meta" or "breakthrough." The contribution is: **a registry-native dose-response synthesis
that (i) adds unpublished + secondary-outcome evidence a literature search misses (+5 trials / +2,891
pts here), (ii) shows the cross-agent ranking is robust to sourcing while dose-specific estimates are
not (oral-sema −9.8 pp), and (iii) surfaces reporting bias (ghosts −3.2 pp) and population confounding
(T2D) transparently — none of which a literature-based meta can do.** That is a defensible methods/
automation paper: *"how much does registry-native vs literature sourcing change a dose-response NMA,
and what does it reveal."* Caveat: S2 emulates a literature search from registry data, not a real
independent Medline/Embase search — the genuine paper would run both arms prospectively.
