# The twenty are published

**URL a reader lands on:** https://mahmood726-cyber.github.io/rapidmeta-finerenone/
**Anchor:** `#twenty-comparators` — on the **portfolio index itself**, above every specialty
section, not under `#sp-cardiology`. The result is cross-specialty (14 topics, 10 drug
families, spanning cardiology, infectious disease, ophthalmology and amyloidosis), so a
cardiology anchor would have misdescribed it.

| | |
|---|---|
| **served sha256** | `fece003df5da9b942349c935b7ed81019ac004cb9a983d8dbc9fb019ef59be08` |
| **served bytes** | 115,500 (was 109,081) |
| **commit on `main`** | `6ad5f4df5` (pushed `606b09d3c..6ad5f4df5`) |
| **files touched** | `index.html` only |

## Verified on the SERVED bytes, both ways

**Without JavaScript** — 16 of 16 checks visible in the served HTML after stripping
`<script>`/`<style>` and tags: the funnel (6,182 / 1,105 / 442 / 20), the frames line, the
155-object disposition, all three caveats, the provenance commits, the join defence, the
PROSPERO caveat, and the 451→442 correction. **A no-JS reader sees every number.**

**With JavaScript** — block present in the DOM, `display` not none, laid out with real child
boxes (H2 56px · PRE 206px · OL 234px · block 1,179px × 1,064px), and **`missing: []`** against
all ten required strings. The accessibility tree exposes the heading, which is what a screen
reader receives.

⚠️ **A screenshot was not obtained.** The browser pane rendered white at the block's
position across four attempts while the DOM, layout metrics and accessibility tree all
reported it present and visible; the pane had already been reported hidden earlier in the
session. **I am recording that I could not capture the raster rather than claiming a picture
I do not have.** The three render-level checks above are what the verification rests on.

## Two repo guards fired, and one of them prevented a disaster

1. ⛔ **A pre-commit hook refused a commit that would have deleted 14,830 files from `main`.**
   My `git worktree add` was killed by a 5-minute timeout mid-checkout, leaving an empty
   index — so git saw the entire site as staged deletions. The hook demanded a script the
   half-built worktree did not contain, and that failure is the only thing that stopped it.
   Repaired with `git reset` + `git checkout -- .`, then verified that **exactly one path**
   was staged before retrying.
2. The anti-`git add -A` guard refuses top-level `.html`. `STAGING_WIDE=1` is the escape it
   documents for a legitimately staged path, and it was used **deliberately, with one path
   staged by name**. ⛔ **No hook was bypassed and `--no-verify` was not used.**

---

# The routing artefact: `TWENTY_COMPARATORS.json`

**Fetch:** `git show origin/main:TWENTY_COMPARATORS.json` in
`mahmood726-cyber/rapidmeta-finerenone`.

| | |
|---|---|
| **path** | `TWENTY_COMPARATORS.json` — **top level**, tracked |
| **commit on `main`** | `bbdb94584` (`6ad5f4df5..bbdb94584`) |
| **blob sha256** | `1f5807308cf5fabe9eca2e07cb26f35cc77c4ac2f2127e612876142f962670c3` |
| **size** | 36,470 bytes |
| **verified** | read back from `origin/main` in a **different clone** |

⛔ **Not `outputs/`.** `.gitignore:131` ignores `outputs/*.json`, so a file placed there is
untracked and unfetchable — the exact failure this request warned about. ⚠️ **Worth
relaying: the peer lane's own `outputs/DO_NOT_REBUILD_FROM_SIDECAR.json` is likewise
untracked**, so it exists only on the machine that wrote it.

**Contents:** 20 comparators / 14 topics / 10 families / 24 pairs under the ruled
`nct_pmid` join. Per row: our topic slug · our page filename · comparator PMID + DOI ·
journal · year · title · PROSPERO id · source frame · our k · overlap and fraction ·
**the join key per trial**. Plus the disposition of all 155 objects (49 + 65 + 4 + 37 =
155, every topic named); the builder refuses to write if that sum is wrong.

## Two defects found while checking it, both fixed before it shipped

1. ⛔ **Wrong DOIs.** `efetch_meta` walked `.//ArticleId`, which reaches into the
   **reference list**, and kept the last match — so the "DOI" was a **cited paper's**.
   PMID 40998847 (*Scientific Reports*) carried `10.3390/jcm11020288`, a *J Clin Med*
   paper it merely cites. Caught because the DOI prefix disagreed with the journal name
   **in the same row**. Real DOI `10.1038/s41598-025-16166-3`. DOIs are now fetched
   directly per PMID from `ELocationID` / `PubmedData ArticleIdList` — 24 of 24 resolved,
   every prefix agreeing with its publisher. `opencomp.py` fixed for future runs. No
   criterion reads `doi`, so **eligibility is unaffected** — but it was about to become a
   routing key for another lane.
2. The key list could be misread: a pair qualifies on **ruled** keys alone, yet a further
   trial might carry a non-ruled acronym key, which put `acronym` in two pairs' key lists.
   Split into `ruled_join_keys_that_qualified` (nct 13, cited_pmid 13 — **no acronym**) and
   `all_keys_present_including_non_ruled`, with a note that acronym carries no weight.
