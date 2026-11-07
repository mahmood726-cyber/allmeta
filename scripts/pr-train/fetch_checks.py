"""Per-PR check-run conclusions via REST (GraphQL is 502/504-ing on these repos)."""
import json, subprocess, sys, time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

repo = sys.argv[1]
prs = json.load(open(f"prs_{repo}.json"))


def api(path):
    for a in range(5):
        r = subprocess.run(["gh", "api", path], capture_output=True, text=True, encoding="utf-8")
        if r.returncode == 0:
            return json.loads(r.stdout)
        time.sleep(3 * (a + 1))
    return None


def one(p):
    d = api(f"repos/mahmood726-cyber/{repo}/commits/{p['sha']}/check-runs?per_page=100")
    if d is None:
        return p["number"], None
    latest = {}
    for c in d["check_runs"]:
        k = c["name"]
        if k not in latest or c["started_at"] > latest[k]["started_at"]:
            latest[k] = c
    return p["number"], {k: (v["conclusion"] or v["status"]) for k, v in latest.items()}


with ThreadPoolExecutor(6) as ex:
    res = dict(ex.map(one, prs))
json.dump(res, open(f"checks_{repo}.json", "w"), indent=0)
fails = Counter()
none = sum(1 for v in res.values() if v is None)
empty = sum(1 for v in res.values() if v == {})
pending = Counter()
for v in res.values():
    for k, c in (v or {}).items():
        if c in ("failure", "timed_out", "startup_failure"):
            fails[k] += 1
        elif c in ("queued", "in_progress"):
            pending[k] += 1
print(repo, "fetchfail", none, "nochecks", empty)
print(" failing:", fails.most_common(15))
print(" pending:", pending.most_common(10))
print(" allgreen:", sum(1 for v in res.values() if v and not any(c in ("failure", "timed_out", "startup_failure", "queued", "in_progress") for c in v.values())))
