# PR merge train

Landing a stack of PRs without a checkout, a rebase or a force push.

| Script | Does | Writes |
|---|---|---|
| `fetch_prs.py <repo>` | Open PRs via REST (GraphQL returns 502/504 on repos this size) | `prs_<repo>.json` |
| `fetch_checks.py <repo>` | Latest conclusion per check at each PR head | `checks_<repo>.json` |
| `triage.py <repo> <clone>` | Ahead/behind, conflict dry run, patch identity, net diff | `triage_<repo>.json`, `.tsv` |
| `train.py <clone> <branch> <base> <PR:SHA>...` | Merges PR heads in order; skips and names conflicts | a local branch |

## Steps

1. Fetch, then triage. `ahead_main == 0` means the head is already in main: close it as superseded.
2. Review the candidates. Green CI is necessary, not sufficient.
3. `train.py`, push the branch, and open a **draft PR** from it. A branch push alone runs only `plus-pixels`; the other suites need `pull_request`.
4. When every check is green, fast-forward main to the tip. GitHub marks each contained PR merged.
5. Prove with `git ls-remote <URL> refs/heads/main`, by URL, not by the name `origin`.

## Limits

- `triage.py` tests each PR against main alone, so conflicts between two PRs appear only in `train.py`.
- A clean merge is not a semantic check. Run the stack, not each PR.
- These read PR metadata and write only to the working directory; `train.py` never pushes.
