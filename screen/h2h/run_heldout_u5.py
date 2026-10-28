"""AMENDMENT 2 driver for the ELAS u5 comparator. Same conduct as run_heldout.py (imported, never edited): one seed
per process, 6-hour limit, one retry from scratch, failures recorded and never dropped, orders validated by
accept_run, the same set guard (held-out reviews only, or --dev-smoke for DEV only). Calls run_asreview_u5.py
with this interpreter (the pinned ASReview-main environment).

  <venv-u5>/python h2h/run_heldout_u5.py --set h2h/sets/official_test16.txt --data-dir ... --out R/asreview/elas_u5
"""
import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import core  # noqa: E402
import run_heldout as rh  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--data-dir", default=str(core.DATA_DIR))
    ap.add_argument("--reviews", default=None, help="optional comma list restricting the set (for sharding)")
    ap.add_argument("--dev-smoke", action="store_true")
    a = ap.parse_args()
    reviews = rh.read_set(a.set)
    allowed = set(rh.read_set(HERE / "sets" / "dev.txt")) if a.dev_smoke else \
        set(rh.read_set(HERE / "sets" / "primary_plus_devoverlap.txt")) | set(rh.read_set(HERE / "sets" / "official_test16.txt"))
    wrong = sorted(set(reviews) - allowed)
    if wrong:
        raise SystemExit(f"{'not DEV reviews' if a.dev_smoke else 'not registered held-out reviews'}: {wrong}")
    if a.reviews:
        bad = set(a.reviews.split(",")) - set(reviews)
        if bad:
            raise SystemExit(f"not in the set: {sorted(bad)}")
        reviews = a.reviews.split(",")
    prov = {"driver_git_commit": rh.git_commit()}
    out = Path(a.out); parts = out / "_per_seed"; parts.mkdir(parents=True, exist_ok=True)
    log = (out / "_attempts.jsonl").open("a")
    for rv in reviews:
        final = out / f"{rv}.json"
        if final.exists():
            continue
        runs, head = {}, None
        _, y, _ = core.load_review(rv, Path(a.data_dir))
        pri = json.loads((HERE / "priors" / f"{rv}.json").read_text())
        for s in map(str, core.SEEDS):
            pf = parts / f"{rv}__{s}.json"
            cmd = [sys.executable, str(HERE / "run_asreview_u5.py"), "--review", rv, "--seeds", s,
                   "--data-dir", a.data_dir, "--out", str(pf)]
            rec = None
            for attempt in (1, 2):
                if pf.exists():
                    pf.unlink()
                t0 = time.time(); rc, err = None, ""
                try:
                    p = subprocess.run(cmd, capture_output=True, text=True, timeout=rh.LIMIT_S, stdin=subprocess.DEVNULL)
                    rc, err = p.returncode, p.stderr[-2000:]
                except subprocess.TimeoutExpired:
                    rc, err = "timeout", f"exceeded {rh.LIMIT_S} s"
                ok, why = rh.accept_run(pf, s, y, pri["priors"][s]) if rc == 0 else (False, f"exit {rc}")
                log.write(json.dumps({"tool": "asreview", "ai": "elas_u5", "review": rv, "seed": s, "attempt": attempt,
                                      "rc": rc, "ok": ok, "why": why, "seconds": round(time.time() - t0, 1),
                                      "stderr_tail": err}) + "\n"); log.flush()
                if ok:
                    d = json.loads(pf.read_text()); head = head or {k: v for k, v in d.items() if k != "runs"}
                    rec = d["runs"][s]; rec["driver_attempt"] = attempt
                    break
            runs[s] = rec or {"failed": True, "attempts": 2}
            print(f"[asreview elas_u5] {rv} seed {s}: {'ok' if rec else 'FAILED twice'}", flush=True)
        if head is None:
            head = {"tool": "asreview", "ai": "elas_u5", "review": rv, "ids_sha256": pri["ids_sha256"],
                    "dataset_sha256": pri["dataset_sha256"], "all_failed": True}
        final.write_text(json.dumps({**head, **prov, "runs": runs}))


if __name__ == "__main__":
    main()
