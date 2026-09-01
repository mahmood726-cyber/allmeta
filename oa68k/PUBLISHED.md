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
