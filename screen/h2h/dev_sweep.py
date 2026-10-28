"""DEV-only sweep of Screen ranker configurations, using the shipping JS ranker (js/run_js.mjs). Refuses non-DEV reviews.

Each config is a name plus run_js.mjs arguments. Writes one JSONL row per (config, review, seed) with metrics from
core.metrics_from_order; resumable (skips rows already present).

  python h2h/dev_sweep.py --grid h2h/dev_grid.json --reviews <comma list> --seeds 101,202,303 --data-dir ... --out sweep.jsonl
"""
import argparse
import json
import shlex
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import core

HERE = Path(__file__).resolve().parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--grid", required=True); ap.add_argument("--reviews", required=True)
    ap.add_argument("--seeds", default="101,202,303"); ap.add_argument("--data-dir", required=True)
    ap.add_argument("--out", required=True); ap.add_argument("--jobs", type=int, default=2)
    a = ap.parse_args()
    dev = {x.strip() for x in (HERE / "sets" / "dev.txt").read_text().splitlines() if x.strip() and not x.startswith("#")}
    reviews = a.reviews.split(",")
    bad = [r for r in reviews if r not in dev]
    if bad:
        raise SystemExit(f"DEV only; refusing {bad}")
    grid = json.loads(Path(a.grid).read_text())
    done = set()
    if Path(a.out).exists():
        for l in Path(a.out).read_text().splitlines():
            r = json.loads(l); done.add((r["config"], r["review"]))
    ys = {r: core.load_review(r, Path(a.data_dir))[1] for r in reviews}
    tasks = [(c, r) for c in grid for r in reviews if (c, r) not in done]

    def job(t):
        cname, rv = t
        with tempfile.TemporaryDirectory() as td:
            of = Path(td, "o.json")
            p = subprocess.run(["node", str(HERE / "js" / "run_js.mjs"), "--review", rv, "--config", cname, "--seeds", a.seeds,
                                "--data-dir", a.data_dir, "--out", str(of)] + shlex.split(grid[cname]),
                               capture_output=True, text=True, stdin=subprocess.DEVNULL)
            if p.returncode != 0:
                return [{"config": cname, "review": rv, "error": p.stderr[-500:]}]
            d = json.loads(of.read_text())
            rows = []
            for s, run in d["runs"].items():
                if run.get("failed"):
                    rows.append({"config": cname, "review": rv, "seed": s, "failed": True}); continue
                m = core.metrics_from_order(run["order"], ys[rv])
                rows.append({"config": cname, "review": rv, "seed": s, "args": grid[cname], "seconds": run["seconds"],
                             **{k: m[k] for k in ("N", "R", "wss95", "recall_at_10pct", "recall_at_20pct", "prop_last")}})
            return rows

    with open(a.out, "a") as fo, ThreadPoolExecutor(a.jobs) as ex:
        for rows in ex.map(job, tasks):
            for r in rows:
                fo.write(json.dumps(r) + "\n")
            fo.flush()
            print(rows[0]["config"], rows[0]["review"], [round(r.get("wss95", float("nan")), 3) for r in rows], flush=True)


if __name__ == "__main__":
    main()
