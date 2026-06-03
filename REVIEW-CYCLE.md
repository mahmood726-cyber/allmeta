# Quarterly review cycle

allmeta is reviewed on a **quarterly cadence** (versioned `v12`, `v13`, …). The
goal of each cycle is not to add scope but to **drive the deferred list down**:
close or explicitly re-scope every open item, and catch regressions while the
codebase is small enough to hold in one review.

This complements the *continuous* gates — `lint.yml` (shipped-asset invariants),
`shared-tests.yml` + `playwright.yml` (R-parity + a11y + behavior), and
`nightly-pages-crawl.yml` (deployed-site crawl). The quarterly cycle is the
*human* pass on top of those.

## When

Once per quarter, or before any tagged release. The `quarterly-review.yml`
workflow also runs on a quarterly cron and on manual `workflow_dispatch`,
uploading a fresh prep snapshot as an artifact.

## How

1. **Generate the prep snapshot** — accurate, not from memory:

   ```
   python scripts/review_cycle.py --out review-findings-v<N>.md
   ```

   It records the live health (catalog count, parity-ledger headline, lint
   status) and the **deferred list** parsed straight from `ROADMAP.md` open
   boxes (`[ ]` not started, `[~]` partial).

2. **Review with four personas** (the established `review-findings-v*.md`
   format): **Methods** (stats correctness vs R), **Engineering** (lint/tests/
   CSP/regressions), **A11y** (sweep, forced-colors, reduced-motion), **Domain**
   (claims-match-implementation, citations, identifiers).

3. **Triage the deferred list down.** For each open item: fix it, or write a
   one-line re-scope/defer rationale. Update the `[ ]`/`[~]`/`[x]` boxes in
   `ROADMAP.md` so the next snapshot reflects reality.

4. **Record findings** in `review-findings-v<N>.md` with P0/P1/P2 severities and
   a verification line (test counts, lint, crawl). Fix P0/P1 in the same cycle
   where feasible; log anything deferred back into `ROADMAP.md`.

5. **Tag** the release if the cycle gates a version bump (see `RELEASING.md`).

## Invariants a cycle must re-confirm

- `python scripts/lint_repo.py` → CLEAN (empty allowlist, or every entry still
  justified).
- Parity ledger in sync (`parity-ledger.spec.mjs`) and `parityTestCount`
  non-decreasing.
- No new hardcoded paths / CDN deps / BOMs / unpopulated placeholders.
- README / catalog / dashboard claims still match the implementation.
