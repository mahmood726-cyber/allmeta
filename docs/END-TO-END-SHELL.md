# allmeta end-to-end "Review Project" shell — build plan (corrected)

> Drafted 2026-06-10; **corrected same day** after a proper recon found the
> pipeline already largely exists (the first audit under-scanned). Scope: a
> browser-only, user-owns-the-data, full systematic-review platform — Rayyan
> (screening) + RevMan/Covidence (management) + metafor-grade synthesis + a
> paper writer. **Audience: ALL user types, as a *full* meta/SR platform.**

## CORRECTED gap audit (2026-06-10)

The first pass checked only the OLD apps (`rct-extractor`, `prisma-screen`,
`search-translator`) + the `ma-studies-v1` bus, and **missed a newer, mature
`sr-*` pipeline that already implements most of the end-to-end flow.** What
actually exists:

| App | What it is | Bus |
| --- | --- | --- |
| `design/` | Protocol & PICO builder | `sr-project-v1` |
| `search/` | Search import → "Send to Screen" | `sr-records-v1` |
| **`screen/` (1939 ln)** | **Rayyan-class screener**: dual reviewers (`r1`/`r2` + `resolved` conflict), include/exclude/maybe + reason, dedup (`dup`/`dupOf`), **ML-assisted ranking** (TF-IDF + buscar 95%-recall stopping rule), AI suggestions, per-reviewer export/merge (`sr-reviewer-v1`), shareable `sr-bundle-v1` | `sr-records-v1`, `sr-reviewer-v1` |
| `extract/` | Deterministic effect-size extraction → `forest-plot` | `sr-extract-v1` → `ma-studies-v1` |
| `rob/` | Automated RoB (RoB2/ROBINS-I) | `ma-studies-v1` |
| synthesis | `forest-plot`/`workbench`/`nma-pro`/… (R-validated) | `ma-studies-v1` |
| GRADE | `grade-sof` reads pooled results | `ma-pooled-v1` |

So `design → search → screen → extract → rob → synthesis → GRADE` is **already
wired** with proper dual-screening, dedup, ML/AI assist, and synthesis handoff.

### The `references-v1` bus I drafted was a DUPLICATE — dropped.
The real `sr-records-v1` record schema (from `screen`'s `normalizeImported`) is
richer and incompatible: `{id,title,abstract,authors[],journal,year:"YYYY",doi,
pmid,keywords[],source, r1:{d,reason}, r2:{d,reason}, resolved, dup,dupManual,
dupOf, score,mlScore, aiSuggestion,aiRationale,aiConfidence}`. Shipping a
second, weaker record bus would only cause drift. Reverted (was never pushed).

## The REAL remaining gaps (grounded, prioritised)

1. **No paper / report stage.** The manuscript writer is genuinely missing from
   the pipeline. **Port RapidMeta Paper Studio** (`C:\Projects\rapidmeta-paperstudio-pilot`
   — deterministic references-from-included-studies, no hallucinated citations,
   35/35 Selenium) as the `report` stage, reading PICO (`sr-project-v1`),
   included studies (`sr-records-v1`), pooled results (`ma-pooled-v1`/`ma-studies-v1`),
   RoB and GRADE. **Highest value, additive, on-target.**
2. **The `design/` orchestrator is thin** — it only chains Design→Search→Screen.
   Extend it into the full stateful shell that shows every stage's status and
   opens each app pre-loaded (Extract→RoB→Synthesis→GRADE→Report). This is the
   "shell" — but it's an *extension of design/*, not a greenfield build.
3. **Google Drive collaboration.** The per-reviewer export/merge (`sr-reviewer-v1`,
   `mergeReviewerState`) ALREADY exists — so team dual-screening works by file
   exchange today. Streamline it: store the review as a **folder of small
   files** in a shared Drive (one `sr-reviewer-<id>` log per reviewer + per-stage
   outputs), browser-side Drive API + Google sign-in (a free OAuth client-id,
   **no allmeta server**). Per-reviewer files merge by union — conflict-free and
   methodologically correct. Manual export kept as the air-gapped fallback.
4. **(Lower) Shared bus contract module.** `sr-records-v1` is inline-duplicated
   across `search`/`screen`/`extract` (each re-declares the key + its own
   normalize). Apps interoperate via the common `{records:[]}` envelope so this
   is low-severity, but a shared `shared/sr-records-v1.js` + contract test would
   guard against future drift. Safe to do incrementally (extract first).

### WebR / "match & exceed metafor" (unchanged decision)
WebR cold-download is too slow to be the default engine. Keep JS-native engines
as the primary fast path (R-validated to ≤1e-7 on the core methods); make
"Verify / Run in R" an **opt-in, lazy, service-worker-cached** button that
embeds real metafor/netmeta/mada — match on core, exceed on workflow/offline/
reproducibility/UX, not on raw method breadth.

## Re-sequenced execution — ALL PHASES SHIPPED (2026-06-10)

- **Phase 1 — port Paper Studio as the `report` stage. ✅ DONE** (PR #5).
  Ported verbatim over a bus bridge; browser-verified; catalogued.
- **Phase 2 — full stateful shell. ✅ DONE** (PR #7). The shell's home was the
  EXISTING `review-project/` orchestrator, not `design/` (anti-duplication):
  per-stage LIVE detectors read the shared buses, show live/in-bundle/no-output
  status, link to the current pipeline apps incl. the new Report stage, and
  fold live bus state into the signed bundle in one click.
- **Phase 3 — team collaboration. ✅ DONE** (PR #8). Built as serverless
  **folder-of-files via the File System Access API** (the user's own Drive /
  Dropbox / OneDrive desktop client does the sync), NOT browser Drive OAuth —
  that would need an external GIS script + a registered client-id, breaking the
  offline/CDN-free build. `shared/sr-collab-v1.js` (pure N-file union merge +
  folder adapter) + a Connect/Publish/Pull panel in `screen/`. Browser-OAuth
  Drive is deferred as a per-deployment opt-in.
- **Phase 4 — shared `sr-records-v1` module + contract test. ✅ DONE** (PR #9).
  `shared/sr-records-v1.js` canonical schema (mirrors screen's normalizeImported)
  + cross-app drift guard; adopted by `extract/` first. WebR opt-in verify
  button remains a future enhancement (unchanged decision below).

## Lessons recorded
- My first gap audit under-scanned (checked old apps, missed the `sr-*` family)
  and I built a duplicate before catching it. The corrected recon is above; the
  pipeline is more complete than first reported. Always grep the *newer* app set
  before declaring a capability missing.

## Non-goals
- No allmeta-hosted server, accounts, or data custody (Google's OAuth, not ours).
- Not racing metafor on method breadth (embed it).
- Not solo-only — full-SR rigor is the baseline.
