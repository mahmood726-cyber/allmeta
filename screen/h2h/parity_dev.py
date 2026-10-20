"""DEV-only parity check: the browser ranker (js/rank-core.js, run in Node) vs real ASReview 3.0.8 ELAS u4.

For each DEV review and seed, both tools get the same registered starting records; full screening orders are
compared with ==. Refuses held-out reviews (via run_js.mjs and an explicit check here).

  python h2h/parity_dev.py --reviews Donners_2021,Sep_2021 --seeds 101,202 --out-dir parity --data-dir C:/h2h/synergy_plus_local
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reviews", required=True)
    ap.add_argument("--seeds", default="101,202")
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--out-dir", required=True)
    a = ap.parse_args()
    held = set()
    for f in ("primary.txt", "official_test16.txt", "primary_plus_devoverlap.txt"):
        held |= {x.strip() for x in (HERE / "sets" / f).read_text().splitlines() if x.strip() and not x.startswith("#")}
    out = Path(a.out_dir); out.mkdir(parents=True, exist_ok=True)
    summary = []
    for rv in a.reviews.split(","):
        dev = {x.strip() for x in (HERE / "sets" / "dev.txt").read_text().splitlines() if x.strip() and not x.startswith("#")}
        if rv in held or rv not in dev:
            raise SystemExit(f"refusing {rv}: DEV reviews only")
        fa, fj = out / f"asr_{rv}.json", out / f"js_{rv}.json"
        if not fa.exists():
            subprocess.run([sys.executable, str(HERE / "run_asreview_h2h.py"), "--review", rv, "--ai", "elas_u4", "--seeds", a.seeds,
                            "--data-dir", a.data_dir, "--out", str(fa)], check=True, stdin=subprocess.DEVNULL)
        if not fj.exists():
            subprocess.run(["node", str(HERE / "js" / "run_js.mjs"), "--review", rv, "--config", "u4", "--seeds", a.seeds,
                            "--data-dir", a.data_dir, "--out", str(fj)], check=True, stdin=subprocess.DEVNULL)
        A, J = json.loads(fa.read_text())["runs"], json.loads(fj.read_text())["runs"]
        for s in a.seeds.split(","):
            x, y = A[s].get("order"), J[s].get("order")
            first = None if x == y else next((i for i in range(min(len(x or []), len(y or []))) if x[i] != y[i]), min(len(x or []), len(y or [])))
            row = {"review": rv, "seed": s, "identical": x == y, "len_asr": len(x or []), "len_js": len(y or []),
                   "first_diff": first, "wss_asr": A[s].get("metrics", {}).get("wss95"),
                   "sec_asr": A[s].get("seconds"), "sec_js": J[s].get("seconds")}
            summary.append(row); print(json.dumps(row), flush=True)
    (out / "summary.jsonl").open("a").write("".join(json.dumps(r) + "\n" for r in summary))


if __name__ == "__main__":
    main()
