# JOB: settle a contradiction about where trial registration ids live, per build

Two measurements of "the same" pages disagree. Establish which bytes each came from and
produce ONE table that reconciles them. Work until the ACCEPTANCE TEST passes.

## The four pages
ARNI_HF_REVIEW.html
IV_IRON_HF_REVIEW.html
SGLT2_HF_REVIEW.html
SOTAGLIFLOZIN_HF_REVIEW.html

## The three sources to read for EACH page (all three, no substitutions)
S1 SERVED   : https://mahmood726-cyber.github.io/rapidmeta-finerenone/<PAGE>
S2 MAIN     : in the git repo at F:\rapidmeta-finerenone -> `git show origin/main:<PAGE>`
S3 PRUNED   : same repo      -> `git show delivery/prune-and-panels-20260826:<PAGE>`

Read bytes exactly. Do NOT read the working-tree file for S2/S3 -- use `git show` so the
ref is unambiguous. Record the full sha of each ref you used (`git rev-parse <ref>`).

## For each (page, source) compute EXACTLY these
- size_bytes            : length of the bytes read
- sha256                : hex sha256 of those bytes
- ids_total             : distinct matches of the regex  NCT\d{8}  in the RAW bytes
- ids_visible           : distinct matches AFTER removing <script>...</script> and
                          <style>...</style> blocks (case-insensitive, dot-matches-newline)
                          and then removing all remaining <...> tags
- ids_script_only       : ids_total minus ids_visible (list them)
- in_rapidmeta_outcomekeys : how many of ids_total appear inside a
                          `window.RapidMeta.outcomeKeys` assignment, if that string is
                          present at all (0 / null if absent)
- state                 : VISIBLE_TEXT (all ids visible) | MIXED | SCRIPT_ONLY | NONE

## Output
Write JSON to  F:\claude-temp\pend\codexjob\id_layer_reconciliation.json
Top level keys: refs (ref -> full sha), rows (list of the 12 page x source records),
control (see below), errors (every error you hit, even ones you recovered from).
Also print the 12 rows as a plain table at the end of your reply.

## ⛔ KNOWN-ANSWER CONTROL -- these values were measured independently. Embed them in the
## output under `control` with a pass/fail per line. If your sweep disagrees with ANY of
## them, DO NOT adjust the control: report the disagreement loudly and treat your sweep as
## suspect.
C1 SERVED ARNI_HF_REVIEW.html size_bytes == 6100652
C2 SERVED ARNI_HF_REVIEW.html sha256 starts with dc32a0f3146a9571
C3 SERVED ARNI_HF_REVIEW.html ids_visible == 93 and ids_script_only == 0
C4 SERVED IV_IRON_HF_REVIEW.html ids_visible == 12 and ids_script_only == 2
C5 SERVED SGLT2_HF_REVIEW.html size_bytes == 3862693 and ids_visible == 49
C6 PRUNED ARNI_HF_REVIEW.html size_bytes == 912140 and ids_visible == 0
C7 `git rev-parse origin/main` == bca61dd312cd1ef7ead30c465df849ad4a4bf2bf

## ACCEPTANCE TEST -- iterate until ALL of these hold, then stop
A1 the JSON file exists, is non-zero bytes, and parses
A2 it contains exactly 12 rows (4 pages x 3 sources), none with a null size_bytes
A3 every control C1..C7 is evaluated and its pass/fail recorded
A4 for every row: ids_visible + len(ids_script_only) == ids_total
A5 the SERVED sha256 for each page equals the MAIN sha256 for that page, OR the row
   records explicitly that it does not (this is a real question, not an assumption)

## Constraints
- Read only. Do not modify any file in F:\rapidmeta-finerenone or any worktree.
- Do not `git checkout`, `git switch`, or change any branch.
- If a fetch fails, retry up to 3 times with backoff, then record the failure in `errors`
  and continue with the other rows rather than aborting.
- Report every error you hit on the way, including ones you fixed.

## Network note
If the served fetch is blocked in your sandbox, byte-identical copies are cached beside
this file as SERVED_<PAGE>. Record `served_route`: "fetched" or "local_cache" per row.
Still attempt the fetch first and record the error if it fails.
