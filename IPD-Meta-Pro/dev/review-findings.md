# REVIEW CLEAN — All P0 and P1 fixed
# Multi-Persona Review: IPD Integrity Gate
### Date: 2026-03-18
### Summary: 6 P0 [ALL FIXED], 10 P1 [ALL FIXED], 8 P2 [deferred]
### Verification: 34/34 regression tests pass, 0 JS errors, 2063/2063 div balance

## Personas
1. Statistical Methodologist
2. Security Auditor
3. UX/Accessibility Reviewer
4. Software Engineer
5. Domain Expert (Clinical/Epidemiological)

---

## P0 -- Critical

- **P0-1** [Domain]: Duplicate key (study+treatment+event+time) produces mass false positives on clean IPD. [FIXED] Uses patientIdVar if mapped; else downgrades to warning with caveat.

- **P0-2** [Domain]: IQR outliers on survival timeVar flags long-term survivors as errors. [FIXED] Survival skips IQR entirely; only checks negatives + zero-time events.

- **P0-3** [SWE]: `report.blockers/warnings` arrays mutated after returned by QC gate — aliasing. [FIXED] Arrays cloned with `.slice()` before pushing.

- **P0-4** [SWE]: "Gate Details" re-runs QC independently, omitting new checks. [FIXED] Now passes `APP.lastIntegrityReport`.

- **P0-5** [Security]: Raw user strings stored unescaped in shared report. [FIXED] Study IDs escaped with `esc()` before storage; `arms` object stripped from details.

- **P0-6** [Stats]: n=4 threshold allows structurally undetectable upper outliers. [FIXED] Raised to n<6.

## P1 -- Important

- **P1-1** [Security]: Plain `{}` used as hash maps — prototype pollution on keys like `__proto__`, `constructor`. (JS lines 62, 83, 94, 100)
  - Fix: Use `Object.create(null)` for all hash maps. [FIXED]

- **P1-2** [Stats]: Moderate imbalance and single-arm studies are score-invisible — no warning pushed. (JS lines 272-277)
  - Fix: Push warnings for moderate imbalance and single-arm studies. [FIXED]

- **P1-3** [Stats]: `idxMap` array in detectOutliers is dead code. (JS lines 29-35)
  - Fix: Remove idxMap. [FIXED]

- **P1-4** [Domain]: 2:1 balance threshold fires on planned unequal allocation (common in oncology). (JS lines 117-120)
  - Fix: Reframe warning text as "verify planned allocation". [FIXED]

- **P1-5** [Domain]: Chronology misses zero-time event=1 (baseline event coding error). (JS lines 129-137)
  - Fix: Also check time===0 && event===1. [FIXED]

- **P1-6** [Domain/Stats]: Missing rate computed over ALL columns including non-analytic metadata. (JS lines 312-325)
  - Fix: Compute over mapped analysis variables only. [FIXED]

- **P1-7** [SWE]: setTimeout(refreshMethodConfidencePanel, 50) magic delay. (JS line 364)
  - Fix: Use requestAnimationFrame or direct call. [FIXED]

- **P1-8** [SWE]: Override window.runDataGuardian is load-order dependent. (JS line 375)
  - Fix: Wrap in DOMContentLoaded listener. [FIXED]

- **P1-9** [UX]: qualityBadge lacks role="status" and aria-label. (HTML line 828)
  - Fix: Add role and aria-label, update JS to maintain aria-label. [FIXED]

- **P1-10** [UX]: Stat-boxes lack group labels; screen reader announces values without context. (HTML lines 836-877)
  - Fix: Add role="group" and aria-label to each stat-box. [FIXED]

## P2 -- Minor

- **P2-1** [Stats]: Document floor(n*p) as non-standard but conservative quantile approximation. (JS lines 40-41)
- **P2-2** [Security]: `\x1F` separator injectable from user CSV data. (JS line 70)
- **P2-3** [Security]: `r.qualityScore || 0` drops valid zero — use `?? 0`. (JS line 151) [FIXED as part of P0 pass]
- **P2-4** [Security]: Generic element IDs vulnerable to DOM clobbering. (HTML lines 828-871)
- **P2-5** [SWE]: Success message renders alongside outlier findings — logical inconsistency. (JS line 209) [FIXED as part of P0 pass]
- **P2-6** [Domain]: No event rate plausibility check (0%/100% = likely mapping error). (JS lines 246-295)
- **P2-7** [Domain]: No study-level N plausibility check (N<5/arm = likely mapping error).
- **P2-8** [Stats]: 5% duplicate blocker boundary is exclusive (> not >=). (JS line 263)

## False Positive Watch
- IQR Q1/Q3 calculation is correct (verified)
- 1.5*IQR Tukey fence is standard (verified)
- Treatment balance max/min ratio is sound (verified)
- `\x1F` separator is safe for typical CSV data (verified)
