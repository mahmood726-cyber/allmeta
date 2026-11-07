"""Deterministic PR triage against a local clone. Read-only on the repo (merge-tree writes loose trees only).

usage: triage.py <repo> <clone>   -> triage_<repo>.json / .tsv
Fields are measured, not judged: behind/ahead vs the PR's own base, conflicts against origin/main,
ahead-commits whose patch-id is already in main (git cherry), files touched.
"""
import json, subprocess, sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

repo, clone = sys.argv[1], sys.argv[2]
prs = json.load(open(f"prs_{repo}.json"))
checks = json.load(open(f"checks_{repo}.json"))


def git(*a, ok=(0,)):
    r = subprocess.run(["git", "-C", clone, *a], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode not in ok:
        raise RuntimeError(f"git {a}: rc={r.returncode} {r.stderr[:200]}")
    return r


main = git("rev-parse", "origin/main").stdout.strip()
have = set(git("for-each-ref", "--format=%(objectname)", "refs/remotes/origin").stdout.split())


def one(p):
    sha, n = p["sha"], p["number"]
    out = dict(number=n, head=p["head"], base=p["base"], draft=p["draft"], title=p["title"], updated=p["updated"][:10], sha=sha)
    c = checks.get(str(n)) or {}
    out["failing"] = sorted(k for k, v in c.items() if v in ("failure", "timed_out", "startup_failure"))
    out["n_checks"] = len(c)
    if sha not in have:
        out["error"] = "head not fetched"
        return out
    be, ah = git("rev-list", "--left-right", "--count", f"{main}...{sha}").stdout.split()
    out["behind_main"], out["ahead_main"] = int(be), int(ah)
    mb = git("merge-base", main, sha).stdout.strip()
    files = git("diff", "--name-only", f"{mb}..{sha}").stdout.split("\n")
    out["files"] = [f for f in files if f]
    # already in main by patch identity
    ch = git("cherry", main, sha).stdout.split("\n")
    ch = [l for l in ch if l]
    out["cherry_plus"] = sum(l.startswith("+") for l in ch)
    out["cherry_minus"] = sum(l.startswith("-") for l in ch)
    # conflict dry run against main (rc 1 = conflicts; 0 = clean)
    mt = git("merge-tree", "--write-tree", "--name-only", "--no-messages", main, sha, ok=(0, 1))
    out["conflict"] = mt.returncode == 1
    lines = mt.stdout.split("\n")
    out["conflict_files"] = [l for l in lines[1:] if l] if out["conflict"] else []
    # net diff vs main if merged: empty means nothing left to land
    if not out["conflict"]:
        tree = lines[0].strip()
        out["net_files"] = len([l for l in git("diff", "--name-only", main, tree).stdout.split("\n") if l])
    return out


with ThreadPoolExecutor(3) as ex:
    res = list(ex.map(one, prs))
json.dump(res, open(f"triage_{repo}.json", "w"), indent=0)
with open(f"triage_{repo}.tsv", "w", encoding="utf-8") as f:
    for r in sorted(res, key=lambda r: -r["number"]):
        f.write("\t".join(str(x) for x in (r["number"], "D" if r["draft"] else "-", r["base"], r.get("behind_main"), r.get("ahead_main"), "CONFLICT" if r.get("conflict") else "clean", r.get("net_files"), ",".join(r["failing"]), r["head"], r["title"][:70])) + "\n")
print(repo, "main", main[:10], "n", len(res))
print(" base main:", sum(r["base"] == "main" for r in res), "conflict(vs main):", sum(bool(r.get("conflict")) for r in res), "net-empty:", sum(r.get("net_files") == 0 for r in res), "errors:", sum("error" in r for r in res))
print(" failing checks:", Counter(k for r in res for k in r["failing"]).most_common(12))
