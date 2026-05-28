# `ma-pooled-v1` — the allmeta pooled-result bus

A small `localStorage` channel that carries **finished pooled meta-analytic
effects** from a pooling app to a downstream consumer (GRADE Summary-of-Findings),
so the user neither re-types nor re-pools. It complements the other two buses:

| Bus | Key | Carries |
|-----|-----|---------|
| [`ma-studies-v1`](./ma-studies-v1.md) | `ma-studies-v1` | per-study `{label, est, se}` (one meta-analysis' studies) |
| [`ma-comparisons-v1`](./ma-comparisons-v1.md) | `ma-comparisons-v1` | per-study arm-level counts (for NMA) |
| **`ma-pooled-v1`** | `ma-pooled-v1` | a **queue** of finished pooled effects `{pointEstimate, ciLo, ciHi, …}` |

**Design rule — the producer pools, the consumer reads verbatim.** The consumer
MUST NOT re-pool the bus contents: a different τ² estimator or model in the
consumer would silently disagree with the estimate the user already saw. Each
producer computes its estimate on its own terms and writes the finished numbers
here; GRADE drops them straight into a row.

## Envelope

```json
{
  "_schema": "ma-pooled-v1",
  "_savedAt": "2026-05-28T12:00:00.000Z",
  "results": [ /* 1..50 result objects (a queue) */ ]
}
```

The bus holds a **queue** so a multi-outcome SoF table can be assembled: each
producer push APPENDS (`add`); the consumer reads the whole queue at once. Cap: 50.

## Result object

| Field | Type | Notes |
|-------|------|-------|
| `pointEstimate` | finite number | NATURAL scale (ratio already exp'd) |
| `ciLo`, `ciHi` | finite number | `ciLo ≤ pointEstimate ≤ ciHi`; on a ratio scale both `> 0` |
| `scale` | `"ratio"` \| `"linear"` | ratio ⇒ null value 1; linear ⇒ 0 |
| `measure` | string? | `OR`/`RR`/`HR`/`MD`/`SMD`/`RD` hint for the consumer's effect-type |
| `k` | int ≥ 1 | number of studies pooled |
| `nTotal` | int > 0? | total participants, if known |
| `model` | `"random"` \| `"fixed"`? | |
| `label` | string? | outcome name; drives replace-by-label + consumer merge |

## Reader contract (consumer)

- `MaPooled.read()` returns the `results` array (possibly empty); malformed bus ⇒ `[]`.
- The consumer renders the numbers **verbatim** (only formatting), never re-pools.
- grade-sof is **consume-once**: after loading it `clear()`s the bus, and merges a
  loaded outcome into an existing same-`label` row by refreshing only the pooled
  numbers (effect/CI/type/studies/participants) while preserving the user's GRADE
  assessment (certainty, 5-domain wizard, comments, baseline/corresponding risk).

## Writer contract (producer)

- `MaPooled.add(result)` appends; re-pushing a non-empty `label` REPLACES that
  entry (update, no duplicate). Returns the new queue length, or 0 on failure.
- `MaPooled.write(resultOrArray)` replaces the whole queue.
- Carry the effect **as displayed** (e.g. forest-plot/heterogeneity carry their
  HKSJ CI; workbench/cumulative/multilevel carry the Wald CI they show). For ratio
  measures, back-transform with `exp` (the GradePush helper's scale selector, or
  `MaPooled.fromEstSE(est, se, {scale:"ratio", …})`).

## Shared helpers

- `shared/ma-pooled-v1.js` — `MaPooled.{validate, read, write, add, clear, buildEnvelope, fromEstSE}`.
- `shared/grade-push.js` — `GradePush.attach({mount, getPooled, defaultScale})`
  injects an outcome-name + export-scale (linear/ratio) + "→ GRADE" control and
  wires `MaPooled.add()`. A new producer is a ~10-line `attach` call whose
  `getPooled()` returns `{mu, lo?, hi?, se?, k, model?}` on the analysis scale.

## Apps participating today (2026-05-28)

**Producers (→ GRADE):** forest-plot (ratio/general, `f-scale`), workbench
(linear hub), heterogeneity (ratio/linear toggle, HKSJ), cumulative-subgroup
(overall/final pool, via GradePush), multilevel-ma (z-CI, via GradePush),
bayesian-ma (posterior mean + 95% CrI, via GradePush).

**Consumer:** grade-sof ("↓ Load pooled (N)" — live badge, storage-event,
multi-outcome, consume-once, merge-by-label).

Not wired (non-single-relative-effect): proportion-ma, meta-regression, NMA apps.

## Tests

- `tests/test_ma_pooled_v1.py` — Node contract: list-shaped envelope validation,
  `fromEstSE` back-transform, empty-queue/CI/scale/k rejection.
- `tests/playwright/grade-pooled-bus.spec.mjs` — end-to-end per producer, the
  multi-outcome queue + replace-by-label, consume-once, preserve-certainty, and
  the "Load pooled (N)" badge.
