# `ma-studies-v1` — the allmeta cross-tool study bus

> Version: `ma-studies-v1` · Status: stable (used by 13 apps as of 2026-05-24).
> Formalized 2026-05-24. The protocol existed before this document — it just
> hadn't been written down.

A single `localStorage` key (`ma-studies-v1`) carries an envelope of
study-level effect rows between allmeta apps. This is the moat: extract once,
pool everywhere — without re-typing.

## Envelope

```json
{
  "_schema": "ma-studies-v1",
  "_savedAt": "2026-05-24T08:31:47.123Z",
  "studies": [
    { "label": "Trial A 2018", "est": -0.22, "se": 0.11,
      "moderator": null, "group": null, "year": 2018 },
    { "label": "Trial B 2019", "est": -0.31, "se": 0.14,
      "moderator": null, "group": null, "year": 2019 }
  ]
}
```

| Envelope key | Type   | Rule                                                       |
| ------------ | ------ | ---------------------------------------------------------- |
| `_schema`    | string | **Must equal `"ma-studies-v1"`.** Readers must reject otherwise. |
| `_savedAt`   | string | ISO 8601 timestamp, UTC, set at every write.               |
| `studies`    | array  | Zero or more study rows. May be empty (`[]`).              |

## Study row

| Field      | Type             | Required | Rule                                                  |
| ---------- | ---------------- | -------- | ----------------------------------------------------- |
| `label`    | string           | **yes**  | Free-text study label; fallback `"Study " + (i+1)` if blank. |
| `est`      | number           | **yes**  | **Log-scale** effect for ratios (HR/OR/RR/IRR). Identity for linear (MD/SMD/RD). `NaN`/`Infinity` rows are dropped at write. |
| `se`       | number           | **yes**  | Standard error on the **same scale as `est`**. `> 0`, finite. Computed via `(ln(U) - ln(L)) / (2 * 1.95996)` when only a CI is available. |
| `moderator`| number \| null   | no       | Continuous moderator for meta-regression.             |
| `group`    | string \| null   | no       | Categorical subgroup label.                           |
| `year`     | number \| null   | no       | Calendar year of the study; useful for cumulative / sensitivity. |

## Contracts

**Cochrane §10.4 mixed-scale guard.**
Before serializing a batch into the bus, the writer must reject mixed ratio
families (HR vs OR vs RR vs IRR) and mixed scale-vs-family combos. Pooling
across families is methodologically incoherent.

**Log scale for ratios.**
`OR=1.5, CI=[1.1, 2.1]` is stored as
`est = ln(1.5) ≈ 0.405`,
`se = (ln(2.1) - ln(1.1)) / (2*1.95996) ≈ 0.165`.
Back-transformation happens at the **display** layer, not the bus.

**Merge, don't overwrite.**
Writers must read the current bus, concatenate, and re-write — so the bus
accumulates studies across multiple extractor passes. Overwriting silently
discards prior extraction work.

**Drop, don't poison.**
Rows with non-finite `est` or `se`, or with non-positive ratios, must be
dropped at write — they should never appear in the bus.

## Reader contract

```js
function readBusStudies() {
  try {
    const raw = localStorage.getItem("ma-studies-v1");
    if (!raw) return [];
    const p = JSON.parse(raw);
    if (p && p._schema === "ma-studies-v1" && Array.isArray(p.studies)) return p.studies;
  } catch (_) {}
  return [];
}
```

Readers must:
- Tolerate a missing key (`return []`).
- Reject any envelope where `_schema !== "ma-studies-v1"` (surface a Toast).
- Tolerate extra fields on rows; only require `label`, `est`, `se`.

## Writer contract

```js
const payload = {
  _schema: "ma-studies-v1",
  _savedAt: new Date().toISOString(),
  studies: rows.map((r, i) => ({
    label: r.label || ("Study " + (i + 1)),
    est: r.est,
    se: r.se,
    moderator: r.moderator ?? null,
    group: r.group ?? null,
    year: r.year ?? null,
  })),
};
localStorage.setItem("ma-studies-v1", JSON.stringify(payload));
```

Writers should call `shared/ma-studies-v1.js#write()` instead of rolling this
themselves — see the helper below.

## Shared helper — `shared/ma-studies-v1.js`

Apps adopting the bus should `<script src="…/shared/ma-studies-v1.js">` before
their consumer code and use:

| Helper                | Purpose                                                |
| --------------------- | ------------------------------------------------------ |
| `MaStudies.read()`    | Returns `studies[]` (empty array if missing/malformed).|
| `MaStudies.write(s)`  | Replaces the bus with `s`.                             |
| `MaStudies.merge(s)`  | Reads, concatenates, writes. Returns new total length. |
| `MaStudies.clear()`   | Removes the key.                                       |
| `MaStudies.validate(p)` | Validates a candidate envelope, returns `{ok, errors[]}`.|
| `MaStudies.parseCSV(text)` | Parses `label,est,se[,year[,group]]` CSV → studies. |
| `MaStudies.toCSV(s)`  | Serializes studies → CSV with header.                  |
| `MaStudies.fromCI(...)` | Helper: build `{est, se}` from `(point, ciLow, ciHigh, scale)`. |
| `MaStudies.toRatio(s)`| Display helper: back-transform log to ratio.           |
| `MaStudies.studiesFromTextarea(text, format)` | Parse a textarea (`"label-est-se"`, `"est-se-label"`, or `"est-se-label-mod"`) into bus rows. |
| `MaStudies.textareaFromStudies(studies, format)` | Inverse: serialise bus rows → textarea text. |
| `MaStudies.attachButtons({ btnLoad, btnSave, textarea, format, onAfterLoad, toast })` | One-call wiring: binds Load/Save buttons to a textarea for any participating app. Returns `true` on success. |

The helper is **additive**: existing apps continue to work without change.
Adoption is per-app, opt-in, and idempotent.

## Apps participating today (2026-05-24, after moat C-1/C-2)

**Fully wired (Load + Save buttons + handler):**

| App                  | Reads | Writes | Textarea format       |
| -------------------- | :---: | :----: | --------------------- |
| rct-extractor        |       | ✅     | (computed extraction) |
| forest-plot          | ✅    | ✅     | label-est-se          |
| funnel-plot          | ✅    | ✅     | label-est-se          |
| heterogeneity        | ✅    | ✅     | label-est-se          |
| meta-regression      | ✅    | ✅     | label-est-se(-mod)    |
| bayesian-ma          | ✅    | ✅     | label-est-se          |
| cumulative-subgroup  | ✅    | ✅     | label-est-se          |
| tsa                  | ✅    | ✅     | label-est-se          |
| webr-validator       | ✅    |        | label-est-se          |
| workbench            | ✅    | ✅     | label-est-se          |
| influence            | ✅    | ✅     | est-se-label          |
| gosh                 | ✅    | ✅     | est-se-label          |
| gosh-metareg         | ✅    | ✅     | est-se-label-mod      |
| pet-peese            | ✅    | ✅     | est-se-label          |
| pubbias-tests        | ✅    | ✅     | est-se-label          |
| copas                | ✅    | ✅     | est-se-label          |
| limit-ma             | ✅    | ✅     | est-se-label          |
| bayesian-mcmc        | ✅    | ✅     | est-se-label          |

**Helper script loaded but no direct buttons** (data shape doesn't match the
single-arm `{label, est, se}` contract — pending a future `ma-comparisons-v1`
extension):

multilevel-ma (cluster-effect-SE-outcome), nma, bayesian-nma,
nma-inconsistency, nma-global-inconsistency, nma-pro-v2, nma-dose-response-app,
component-nma, bucher (per-comparison cells), mh-peto (2x2 cells),
proportion-ma (events/n), p-curve (p-values), powerma (sample-size calc),
median-to-mean (summary-stats converter), effect-size-converter,
dta-sroc (DTA 2x2), hsroc (DTA 2x2), mcid (single-MCID calc).

## Roadmap (post-2026-05-24)

1. Migrate the 11 in-place duplicate read/write blocks to call
   `MaStudies.read()` / `MaStudies.write()` so the contract has one canonical
   implementation. (Risk: low, behavioural-equivalent refactor.)
2. Wire `influence`, `gosh`, `pet-peese`, `pubbias-tests`, `proportion-ma`,
   `multilevel-ma`, `mh-peto`, `limit-ma`, `copas`, `bucher`, and
   `bayesian-nma` into the bus.
3. Add `from-rm5(file)` and `from-revman(file)` importers so a single click
   pulls a Cochrane review into the bus.
4. Add `MaStudies.toTruthCert(s)` — emit an HMAC-signed receipt of the bus
   state at any point in the pipeline.

## Test fixtures

See `tests/fixtures/ma-studies-v1/`:

- `empty.json` — empty bus
- `one-study-or.json` — single OR study (log scale)
- `mixed-scale-rejected.json` — example a writer must refuse
- `roundtrip.json` — canonical 5-study payload used by `tests/test_ma_studies_v1.py`

---

## Code & Data Availability

The allmeta evidence-synthesis toolkit described here is openly archived on Zenodo and citable via its concept DOI, which always resolves to the latest released version:

> Ahmad, Mahmood. *allmeta — open browser-only tools for evidence synthesis.* Zenodo. https://doi.org/10.5281/zenodo.20516880
