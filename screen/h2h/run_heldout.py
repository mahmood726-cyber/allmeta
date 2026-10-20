"""Held-out run driver (PROTOCOL 7.5 and 8). Runs one tool on registered held-out reviews, ONE SEED PER PROCESS, with
a 6-hour wall-clock limit per (review, seed), one retry from scratch, and failure records that are never dropped.
Every attempt (command, exit code, seconds, stderr tail) is logged. Per-seed outputs are merged into one
<review>.json in the format analyze.py validates.

  python h2h/run_heldout.py --tool asreview --ai elas_u4 --set h2h/sets/primary_plus_devoverlap.txt --out R/asreview/elas_u4
  python h2h/run_heldout.py --tool screen --config <frozen> --js-args "--expect-rank-sha256 <sha>" --set ... --out R/screen
"""
import argparse
import json
import shlex
import subprocess
import sys
import time
from pathlib import Path

import hashlib

import core

HERE = Path(__file__).resolve().parent
LIMIT_S = 6 * 3600


def accept_run(pf: Path, s: str, y, prior: list):
    """AMENDMENT 1 (2026-10-20): a run counts as successful only if its order is valid for the metrics (same check for
    both tools), so an invalid order is a retried failure here instead of an error inside the analysis."""
    if not pf.exists():
        return False, "no output file"
    run = json.loads(pf.read_text())["runs"].get(s) or {"failed": True}
    if run.get("failed"):
        return False, "runner recorded a failure"
    try:
        if run["order"][: len(prior)] != prior:
            return False, "order does not start from the registered starting records"
        core.metrics_from_order(run["order"], y)
    except (ValueError, KeyError, TypeError) as e:
        return False, f"invalid order: {e}"
    return True, ""


def check_freeze(config: str, js_args: str) -> dict:
    """AMENDMENT 1: a held-out Screen run is refused unless FREEZE.json exists and names this exact ranker file,
    config and runner arguments."""
    fz = HERE / "FREEZE.json"
    if not fz.exists():
        raise SystemExit("held-out Screen run refused: FREEZE.json is missing")
    f = json.loads(fz.read_text())
    rank_sha = hashlib.sha256((HERE / "js" / "rank-core.js").read_bytes()).hexdigest()
    for k, have in (("rank_core_sha256", rank_sha), ("config", config), ("js_args", js_args)):
        if f.get(k) != have:
            raise SystemExit(f"held-out Screen run refused: {k}={have!r} differs from FREEZE.json {f.get(k)!r}")
    return {"freeze_sha256": hashlib.sha256(fz.read_bytes()).hexdigest()}


def git_commit() -> str:
    try:
        return subprocess.run(["git", "-C", str(HERE), "rev-parse", "HEAD"], capture_output=True, text=True,
                              stdin=subprocess.DEVNULL, timeout=30).stdout.strip() or "unknown"
    except (OSError, subprocess.TimeoutExpired):
        return "unknown"


def read_set(p):
    return [x.strip() for x in Path(p).read_text().splitlines() if x.strip() and not x.startswith("#")]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tool", required=True, choices=["asreview", "screen"])
    ap.add_argument("--ai", choices=["elas_u4", "elas_u3"])
    ap.add_argument("--config", help="frozen Screen config name")
    ap.add_argument("--js-args", default="", help="extra run_js.mjs args fixed in FREEZE.md")
    ap.add_argument("--set", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--data-dir", default=str(core.DATA_DIR))
    ap.add_argument("--reviews", default=None, help="optional comma list restricting the set (for sharding)")
    ap.add_argument("--dev-smoke", action="store_true",
                    help="exercise the driver on DEV reviews only (no --heldout-ok); carries no confirmatory weight")
    a = ap.parse_args()
    reviews = read_set(a.set)
    # The same set guard for both tools: held-out mode takes only registered held-out reviews, dev-smoke only DEV.
    # run_js.mjs already enforces this for Screen; without it here the ASReview side would run either kind silently.
    allowed = set(read_set(HERE / "sets" / "dev.txt")) if a.dev_smoke else \
        set(read_set(HERE / "sets" / "primary_plus_devoverlap.txt")) | set(read_set(HERE / "sets" / "official_test16.txt"))
    wrong = sorted(set(reviews) - allowed)
    if wrong:
        raise SystemExit(f"{'not DEV reviews' if a.dev_smoke else 'not registered held-out reviews'}: {wrong}")
    if a.reviews:
        bad = set(a.reviews.split(",")) - set(reviews)
        if bad:
            raise SystemExit(f"not in the set: {sorted(bad)}")
        reviews = a.reviews.split(",")
    prov = {"driver_git_commit": git_commit()}
    if a.tool == "screen" and not a.dev_smoke:
        prov.update(check_freeze(a.config, a.js_args))
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
            if a.tool == "asreview":
                cmd = [sys.executable, str(HERE / "run_asreview_h2h.py"), "--review", rv, "--ai", a.ai, "--seeds", s,
                       "--data-dir", a.data_dir, "--out", str(pf)]
            else:
                cmd = ["node", str(HERE / "js" / "run_js.mjs")] + ([] if a.dev_smoke else ["--heldout-ok"]) + [
                       "--review", rv, "--config", a.config,
                       "--seeds", s, "--data-dir", a.data_dir, "--out", str(pf)] + shlex.split(a.js_args)
            rec = None
            for attempt in (1, 2):
                if pf.exists():
                    pf.unlink()
                t0 = time.time(); rc, err = None, ""
                try:
                    p = subprocess.run(cmd, capture_output=True, text=True, timeout=LIMIT_S, stdin=subprocess.DEVNULL)
                    rc, err = p.returncode, p.stderr[-2000:]
                except subprocess.TimeoutExpired:
                    rc, err = "timeout", f"exceeded {LIMIT_S} s"
                ok, why = accept_run(pf, s, y, pri["priors"][s]) if rc == 0 else (False, f"exit {rc}")
                log.write(json.dumps({"tool": a.tool, "ai": a.ai, "config": a.config, "review": rv, "seed": s, "attempt": attempt,
                                      "rc": rc, "ok": ok, "why": why, "seconds": round(time.time() - t0, 1), "stderr_tail": err}) + "\n"); log.flush()
                if ok:
                    d = json.loads(pf.read_text()); head = head or {k: v for k, v in d.items() if k != "runs"}
                    rec = d["runs"][s]; rec["driver_attempt"] = attempt
                    break
            runs[s] = rec or {"failed": True, "attempts": 2}
            print(f"[{a.tool}] {rv} seed {s}: {'ok' if rec else 'FAILED twice'}", flush=True)
        if head is None:  # every seed failed: still write the review, so it is scored and never dropped
            head = {"tool": a.tool, "review": rv, "ids_sha256": pri["ids_sha256"], "dataset_sha256": pri["dataset_sha256"],
                    "all_failed": True}
            head.update({"ai": a.ai} if a.tool == "asreview" else {"config": a.config})
        final.write_text(json.dumps({**head, **prov, "runs": runs}))


if __name__ == "__main__":
    main()
