# allmeta triage atlas — v0.1 design

**Date:** 2026-05-13
**Status:** draft — brainstorming complete, awaiting user review
**Scope:** allmeta repo only (`C:\Projects\allmeta`, github.com/mahmood726-cyber/allmeta)
**Parent decomposition:** Subproject #1 of 4 (Triage → Hardening → Hub-lift → Cross-app integration)

---

## 1. Goal & non-goals

**Goal.** Produce a living scorecard across all ~71 in-repo allmeta apps. Tag each with a quality tier 1–5. The hub consumes the scorecard to (a) show a Tier-1 "Validated" badge per card, (b) auto-populate the featured strip from Tier-1, and (c) drive an "improvement queue" view in a sortable dashboard. The atlas guides which app to polish next, not whether to retain anything.

**Non-goals.**

- Removing, hiding, or hibernating any app. All 71 stay live on the hub.
- Running R-parity tests during the scan (medium depth — record presence, not pass/fail).
- Auto-fixing any app. The atlas reports; humans fix.
- Replacing Sentinel or Overmind. Atlas is allmeta-internal and complementary.
- Modifying any individual app's code in v0.1. Scope = scanner + hub edits + artifacts.

---

## 2. Architecture

### Components

1. **Scanner** (`triage/scan.py`) — Python entry-point; walks `C:\Projects\allmeta`, calls signal extractors, applies rubric, emits artifacts. Run on-demand: `python triage/scan.py`.
2. **Signal extractors** (`triage/signals.py`) — small pure functions: stub detection, git-age, hub-link presence, test-file count, R-parity test presence, Playwright pass-list parsing, file-size, README presence.
3. **Rubric** (`triage/rubric.py`) — maps raw signals → tier 1–5 + confidence + reasons[]. Single source of truth for tier rules.
4. **Renderer** (`triage/render.py`) — emits `triage.json`, `triage.csv`, `triage.md`, `triage.html`.
5. **Overrides** (`triage/triage-overrides.yaml`) — committed, hand-edited. Any app listed here uses the override tier; the rubric's auto-tier is preserved alongside for transparency. Human always wins.
6. **Hub consumer** — additive edits to `hub/app.js` and `hub/styles.css` (and a small `index.html` metric swap). Reads `/triage.json` on load. Fails open.

### Repo layout (additive, no existing files moved)

```
allmeta/
├── triage/
│   ├── scan.py
│   ├── signals.py
│   ├── rubric.py
│   ├── render.py
│   ├── triage-overrides.yaml
│   ├── schema/
│   │   └── triage.schema.json
│   ├── tests/
│   │   ├── fixtures/
│   │   ├── test_signals.py
│   │   ├── test_rubric.py
│   │   ├── test_render.py
│   │   └── test_overrides.py
│   └── README.md
├── triage.json          ← data contract, served at site root
├── triage.csv
├── triage.md
├── triage.html
└── hub/                 (edits only — no new files)
    ├── app.js           (modified)
    └── styles.css       (modified)
```

### Data flow

```
scan.py → signals.py → rubric.py → render.py → {json,csv,md,html}
                            ↑
              triage-overrides.yaml

(browser load)
hub/app.js ──fetch('./triage.json')──► merge tier into card render
                                       featured strip = tier-1 + featuredRank
                                       new filter chip "Needs polish" = tier 3-5
                                       (fails open on any error)
```

### Why `triage.json` separate from `hub/projects.js`

The scanner regenerates often; `projects.js` is hand-edited. Decoupling them means re-running the atlas never touches hand-curated card metadata. The two files have different ownership: `projects.js` is curatorial; `triage.json` is computed.

---

## 3. Tier rubric

### Signals (medium-depth, deterministic)

| Signal | Source | Type |
|---|---|---|
| `stub_count` | grep app folder for `TODO`, `\bstub\b`, `placeholder`, `REPLACE_ME`, `__PLACEHOLDER__`, `not implemented`, `throw new Error\(.unimpl` | int |
| `has_index` | `index.html` exists | bool |
| `total_size_kb` | sum of top-level `index.html` + `*.js` + `*.css` | float |
| `last_touched` | `git log -1 --format=%ct -- <folder>` (unix ts) | int / null |
| `is_hub_linked` | folder name appears in `hub/projects.js` | bool |
| `featured_rank` | `featuredRank` field from projects.js (if any) | int / null |
| `test_count` | `tests/test_*.py` + `tests/test_*.mjs` + `tests/playwright/*.spec.*` in app folder | int |
| `has_r_parity` | any test filename contains `metafor`, `_parity`, `_against_r`, `_compare_r`, `mada`, `netmeta_compare` | bool |
| `playwright_pass` | look up in repo-root Playwright report; null if not present | bool / null |
| `has_readme` | `README.md` exists in app folder | bool |
| `category` | from `hub/projects.js` card metadata | string |
| `kind` | `numerical` \| `non-numerical` — heuristic from category, overridable | string |

`kind=non-numerical` means R-parity is not required (e.g. PRISMA flow, RoB traffic-light, kanban-lab, prisma-checklist). Heuristic: category in `{reporting, workflow, productivity, qualitative}` → non-numerical. Always overridable via YAML.

### Tunable constants

All magic numbers in the rules below live at the top of `rubric.py` as named constants — `STUB_REBUILD_THRESHOLD=6`, `MIN_TESTS_FOR_VALIDATED=3`, `STALE_DAYS=365`, `MIN_VALIDATED_SIZE_KB=10`. Changing the rubric means editing those constants in one place; the rules themselves stay literal.

### Tier rules (first match wins, top-down)

```
Tier 5 — Active rebuild
    not has_index OR stub_count >= 6

Tier 4 — Hardening priority
    stub_count >= 1 OR playwright_pass == false OR total_size_kb < 10

Tier 3 — Polish needed
    test_count == 0
    OR (kind == numerical AND not has_r_parity)
    OR (last_touched is not null AND older than 12 months)
    OR not has_readme

Tier 1 — Validated (featured-eligible)
    test_count >= 3
    AND (kind == non-numerical OR has_r_parity)
    AND (last_touched is null OR within 12 months)
    AND is_hub_linked

Tier 2 — Working
    everything else
```

Note on stale-with-no-git: if `last_touched` is null (e.g. git unavailable), the Tier-3 staleness check is skipped and confidence drops by one level. Treating missing-git as "stale" would unfairly penalise apps in a CI environment.

### Reasons array

Each app carries `reasons: ["stub_count=3", "no R-parity test", "last_touched 14mo ago"]`. Surfaced in the dashboard and the Tier-1 tooltip on the hub. The user always knows why a tier was assigned.

### Confidence

- **high** — ≥8 of 12 signals non-null, no internal conflicts
- **medium** — 4–7 signals available, or one inconsistency (e.g. Playwright pass but no tests folder)
- **low** — <4 signals available; the markdown report lists these for manual review

### Override file (`triage/triage-overrides.yaml`)

```yaml
# Human always wins. auto_tier preserved in triage.json for transparency.
apps:
  Truthcert1:
    tier: 4
    reason: "Known stubs in app.min.js — see review-findings-v11"
  prisma-flow:
    kind: non-numerical
    reason: "UI tool, R parity not applicable"
  pi-atlas:
    tier: 1
    reason: "External-paper anchor; treat as flagship"
```

Override schema fields: `tier` (1–5, optional), `kind` (string, optional), `reason` (string, required if any field set), `expires` (ISO date, optional — re-flag the override for review past this date).

---

## 4. Outputs & hub teeth

### `triage.json` (data contract)

```json
{
  "generated_at": "2026-05-13T10:30:00Z",
  "scanner_version": "0.1.0",
  "totals": { "tier_1": 12, "tier_2": 28, "tier_3": 18, "tier_4": 9, "tier_5": 4, "total": 71 },
  "apps": {
    "forest-plot": {
      "tier": 1,
      "auto_tier": 1,
      "override": null,
      "kind": "numerical",
      "confidence": "high",
      "reasons": ["test_count=12", "has_r_parity", "last_touched 8d ago"],
      "signals": {
        "stub_count": 0,
        "has_index": true,
        "total_size_kb": 87.4,
        "last_touched_days": 8,
        "is_hub_linked": true,
        "featured_rank": 3,
        "test_count": 12,
        "has_r_parity": true,
        "playwright_pass": true,
        "has_readme": true,
        "category": "pairwise",
        "kind": "numerical"
      }
    }
  }
}
```

Schema versioning: a breaking change bumps the major `scanner_version`. Hub reads the major and fails open on unknown majors. The committed JSON Schema at `triage/schema/triage.schema.json` is the source of truth.

### `triage.csv` — flat one-row-per-app

Columns: `app, tier, auto_tier, kind, confidence, stub_count, test_count, has_r_parity, last_touched_days, total_size_kb, is_hub_linked, featured_rank, reasons`. UTF-8 with BOM stripped; semicolon-free `reasons` field (joined with ` | `).

### `triage.md` — committed, human-readable

Sections, in order: header (generated-at, totals), Tier 5, Tier 4, Tier 3, Tier 2 (collapsed listing), Tier 1, low-confidence flags. Each app line: name · key reasons · override-flag.

### `triage.html` — single-file filterable dashboard

No external dependencies; matches the `hub/styles.css` aesthetic. Sortable table, tier/kind/category filter chips, search box, click-row-to-expand for full signals. The "what to work on" daily view. Generated by `render.py` from the same data as `triage.json` — no client-side fetch required.

### Hub teeth — concrete edits (additive, fail-open)

1. **`hub/projects.js`** — no change. Stays metadata-only.
2. **`hub/app.js`** — adds:
   - `fetch('./triage.json')` on load, merges `tier` into each card's render.
   - **Featured strip** = apps with `tier === 1`, sorted by `featuredRank` then alphabetical. The strip is currently hidden in `index.html` (`<section id="featured-strip" ... hidden>`); v0.1 reveals it when at least one Tier-1 app exists. Manual `featuredRank` still tiebreaks within Tier 1.
   - **New filter chip "Needs polish"** → tier ∈ {3, 4, 5}.
   - **Badge on each card** — *only Tier 1 is positively badged* ("Validated" pill, no emoji). Tiers 2–5 stay unbadged on the main grid; the improvement queue lives in `triage.html`, not on the public-facing catalog. This keeps the grid calm and avoids broadcasting "this app needs work" to a casual visitor.
   - **Tooltip on Tier-1 badge** = `reasons[]` from triage.json.
   - **Fail-open**: if `triage.json` is missing, malformed, or has an unknown major version, the hub renders exactly as today.
3. **`hub/styles.css`** — adds `.tier-badge` + `.tier-badge--validated`. CSS-only tooltip; no JS dependency for the badge itself.
4. **`index.html`** — one small change: replace the existing "Recently added" metric card in the hero with "Validated apps" (= Tier 1 count). "Recently added" can survive in the dashboard later.

### Why hide tier 2–5 from the main grid

Two reasons. First, the user's "don't remove anything" instinct extends to "don't shame anything either" — broadcasting `Hardening` on a public hub creates noise the casual visitor cannot act on. Second, badges decay in value when most cards have one; reserving the badge for Tier 1 makes it mean something. The full tier picture is one click away in `triage.html`.

---

## 5. Error handling, testing, v0.2 hooks

### Scanner error handling

| Condition | Behavior |
|---|---|
| App folder missing from disk but listed in `projects.js` | Log WARNING; tier = 5; reasons = `["folder missing"]` |
| Bad YAML in `triage-overrides.yaml` | Fail closed with line number; no artifacts written |
| Override references unknown app | WARNING; skip |
| Override sets tier outside 1–5 | Fail closed |
| `git log` unavailable | `last_touched = null`; confidence drops one level |
| Playwright report not present | `playwright_pass = null`; no penalty |
| Signal extractor throws | Catch per-signal; that signal → null; one signal failure never aborts the scan |

**Single principle.** Scanner fails *closed* on operator error (bad overrides, missing repo). Fails *soft* on missing-data signals.

### Hub consumer error handling

Fail-open on every failure: 404 on `triage.json`, malformed JSON, unknown `scanner_version` major, network error, fetch timeout. Console-warn for the developer; no visible UI change. The hub must always render exactly as it does today if the atlas is not usable.

### Testing

- **Signal-extractor unit tests** (pytest, fixtures in `triage/tests/fixtures/`): mini-apps with known stub counts, with/without R-parity test files, with/without git history. Target ≥20 tests.
- **Rubric unit tests**: 5 tier-boundary cases (one per tier) + 5 edge cases (no signals, conflicting signals, override applied, kind=non-numerical, low confidence). Target ≥10 tests.
- **Renderer snapshot test**: known signal set → byte-for-byte match against committed `triage.expected.json`. Catches accidental schema drift.
- **Schema contract test**: `triage.json` validates against `triage/schema/triage.schema.json`; `hub/app.js` parsing exercised against the same schema in a Node test.
- **Playwright sanity**: load the hub with (a) valid `triage.json`, (b) missing file, (c) malformed file. All three must render the grid.
- **Sentinel scan**: run on the new `triage/` folder before commit. BLOCK = 0 required.

### v0.2 hooks (not implemented in v0.1, signposted)

- **R-parity execution** — heavy-depth mode that runs the parity test files against metafor/meta/mada and records pass/fail, not just presence. Add `--depth heavy` flag.
- **Time-series** — every scan stamps a row to `triage/history.csv`; later show tier drift per app over 6 months.
- **Overmind integration** — the nightly verifier reads `triage.json` to know which apps are flagships and prioritise their numerical baselines.
- **"Working on" claims** — overrides gain a `working-on: {date, person}` field so the dashboard shows an active improvement queue.
- **TruthCert on the atlas** — HMAC-sign `triage.json` so the hub can verify provenance.

### Self-imposed v0.1 scope limits

- One PR.
- No changes to any individual app's code.
- No external API calls.
- Stays within `C:\Projects\allmeta\`.
- No CI changes; manual run only.

---

## 6. What ships next

After v0.1 of this atlas ships, subproject **#2 — Flagship app hardening** is the planned next cycle. The atlas output (Tier 1 / Tier 4 / Tier 5 lists, sorted by reasons) is the input to that next spec: it tells us which 5–8 apps deserve a hardening pass first. No flagship-hardening work happens until the triage atlas has been run at least once and the user has reviewed the tier assignments.

## 7. Open questions resolved during brainstorming

| Question | Resolution |
|---|---|
| Scope of "improve"? | Decomposed into 4 subprojects. This spec covers #1 only. |
| Atlas purpose? | Full lifecycle scorecard (not just kill-list). |
| Analysis depth? | Medium — filesystem + git + existing test output. No R execution in v0.1. |
| Hub teeth? | Yes, from day one. Fail-open contract. |
| Removal of apps? | None. All 71 stay. Tier 2–5 are not badged on the main grid. |
