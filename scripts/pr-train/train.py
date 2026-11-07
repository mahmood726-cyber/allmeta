"""Build a merge train without a checkout. Never rewrites a PR head; no force pushes.

usage: train.py <clone> <train-branch> <base-ref> <PR:SHA> ...
Each PR head is merged on top of the previous result with merge-tree/commit-tree.
A PR that conflicts is skipped and named. Prints the tip sha; does not push.
"""
import os, subprocess, sys

clone, branch, base, items = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
TRAILER = "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"


def git(*a, ok=(0,), env=None):
    r = subprocess.run(["git", "-C", clone, *a], capture_output=True, text=True, encoding="utf-8", errors="replace", env=env)
    if r.returncode not in ok:
        raise SystemExit(f"git {a[:3]}: rc={r.returncode} {r.stderr[:300]}")
    return r


tip = git("rev-parse", base).stdout.strip()
merged, skipped = [], []
for it in items:
    n, sha = it.split(":")
    mt = git("merge-tree", "--write-tree", "--name-only", "--no-messages", tip, sha, ok=(0, 1))
    if mt.returncode == 1:
        skipped.append((n, [l for l in mt.stdout.split("\n")[1:] if l][:4]))
        continue
    tree = mt.stdout.split("\n")[0].strip()
    msg = f"Merge pull request #{n} (integration train {branch})\n\nHead {sha}\n\n{TRAILER}\n"
    tip = git("commit-tree", tree, "-p", tip, "-p", sha, "-m", msg).stdout.strip()
    merged.append(n)
git("update-ref", f"refs/heads/{branch}", tip)
print("tip", tip)
print("merged", " ".join(merged))
print("skipped", skipped)
