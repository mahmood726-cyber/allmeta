# `ma-comparisons-v1` — the allmeta multi-arm contrast bus

> Version: `ma-comparisons-v1` · Status: draft (introduced 2026-05-24).
> Sister bus to [`ma-studies-v1`](ma-studies-v1.md). `ma-studies-v1` carries
> single-arm-or-pairwise rows (`{label, est, se}`); this one carries the
> multi-arm contrasts that NMA / network apps actually consume.

A single `localStorage` key (`ma-comparisons-v1`) carries an envelope of
**arm-level** rows for one or more trials. Arms in the same study share a
study `id`, so consumers can rebuild within-study covariance and apply the
Cochrane multi-arm correction (Σ off-diagonal = τ²/2 — see
`advanced-stats.md`).

## Envelope

```json
{
  "_schema": "ma-comparisons-v1",
  "_savedAt": "2026-05-24T09:12:33.000Z",
  "effectMeasure": "OR",
  "studies": [
    {
      "id": "GUSTO-1",
      "year": 1993,
      "rob": "low",
      "arms": [
        { "treatment": "SK",  "events": 1135, "n": 13780 },
        { "treatment": "tPA", "events": 1021, "n": 13746 }
      ]
    },
    {
      "id": "ASSENT-2",
      "year": 1999,
      "arms": [
        { "treatment": "TNK", "events": 749, "n": 8461 },
        { "treatment": "tPA", "events": 753, "n": 8488 }
      ]
    }
  ]
}
```

| Envelope key    | Type    | Rule                                                                |
| --------------- | ------- | ------------------------------------------------------------------- |
| `_schema`       | string  | **Must equal `"ma-comparisons-v1"`.** Readers reject otherwise.     |
| `_savedAt`      | string  | ISO 8601 timestamp, set at every write.                             |
| `effectMeasure` | string  | One of `"OR" | "RR" | "HR" | "RD" | "MD" | "SMD"`. Pooling apps reject mixed scales. |
| `studies`       | array   | Zero or more studies. May be empty (`[]`).                          |

## Study row

| Field      | Type     | Required | Rule                                                                  |
| ---------- | -------- | -------- | --------------------------------------------------------------------- |
| `id`       | string   | **yes**  | Non-empty. Multi-arm trials are recognized by identical `id`.         |
| `arms`     | array    | **yes**  | ≥ 2 arms per study (otherwise it's not a comparison).                 |
| `year`     | number\|null | no   | Calendar year.                                                        |
| `rob`      | string\|null | no   | `"low" | "some" | "high" | "unclear"` for the study as a whole.       |

## Arm row

| Field       | Type     | Required for `effectMeasure` | Rule                                              |
| ----------- | -------- | ---------------------------- | ------------------------------------------------- |
| `treatment` | string   | **all**                      | Non-empty node label in the network.              |
| `events`    | number   | OR / RR / HR / RD            | Integer count, `≥ 0`. May be 0 (zero-cell).       |
| `n`         | number   | OR / RR / HR / RD            | Positive integer.                                 |
| `mean`      | number   | MD / SMD                     | Arm mean.                                         |
| `sd`        | number   | MD / SMD                     | Arm SD, `> 0`.                                    |
| `n`         | number   | MD / SMD *(optional)*        | Arm size. Not required by `validate()`, but `toContrasts()` needs it on both arms to derive an MD/SMD contrast SE; a CONT pair missing `n` is skipped. |
| `dose`      | number\|null | no                       | mg dose, used for dose-response NMA.              |

## Contracts

**Multi-arm detection.**
Two arm rows belong to the same multi-arm trial **iff** their parent
`studies[].id` strings are identical (post `.trim()`, case-sensitive). NMA
poolers rebuild the within-study covariance from that grouping.

**One scale per envelope.**
Mixing `OR` and `MD` arm rows in a single envelope is rejected by the
writer. Use separate buses if you need to carry both.

**Drop, don't poison.**
Studies with `< 2` arms, or with arms missing the fields required for the
declared `effectMeasure`, are dropped at write — they should never appear
in the bus.

**Pairwise → comparisons.**
The interop helper exports a no-op when the source data is single-arm
pairwise (use `ma-studies-v1` for those). For pairwise-binary apps that
nevertheless want to push to this bus, two arms (`treatment1/2`,
`events1/2`, `n1/2`) are converted into an `arms: [...]` array with the
study `id` taken from `name`.

## Reader contract

```js
function readComparisons() {
  try {
    const raw = localStorage.getItem("ma-comparisons-v1");
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && p._schema === "ma-comparisons-v1" && Array.isArray(p.studies)) return p;
  } catch (_) {}
  return null;
}
```

Readers must:
- Tolerate a missing key (`return null`).
- Reject any envelope where `_schema !== "ma-comparisons-v1"`.
- Accept extra fields on studies / arms (forward-compat).

## Shared helper — `shared/ma-comparisons-v1.js`

| Helper                          | Purpose                                                        |
| ------------------------------- | -------------------------------------------------------------- |
| `MaComparisons.read()`          | Returns full envelope (or `null`). Same-origin localStorage.   |
| `MaComparisons.write(env)`      | Validates, drops bad rows, persists.                            |
| `MaComparisons.validate(env)`   | Returns `{ok, errors[]}`.                                       |
| `MaComparisons.merge(env)`      | Read-concat-write; deduplicates by `studies[].id`.              |
| `MaComparisons.clear()`         | Remove the key.                                                 |
| `MaComparisons.fromPairwise(rows, effectMeasure)` | Build an envelope from per-row `{name, t1, e1, n1, t2, e2, n2}`. |
| `MaComparisons.fromBinaryTriplets(studies)`       | Build from nma-pro-v2's `{name, treatment1, events1, n1, treatment2, events2, n2}` shape. |
| `MaComparisons.toNmaProStudies(env)`              | Inverse: flatten arms back to nma-pro-v2's per-row shape.        |

## Apps that should participate

| App                       | Role        |
| ------------------------- | ----------- |
| nma                       | Read+write  |
| nma-pro-v2                | Read+write  |
| bayesian-nma              | Read        |
| component-nma             | Read        |
| nma-inconsistency         | Read        |
| nma-global-inconsistency  | Read        |
| nma-dose-response-app     | Read        |
| bucher                    | Read+write (3-arm slice) |
| mh-peto                   | Write (pairwise 2x2 → arms) |
