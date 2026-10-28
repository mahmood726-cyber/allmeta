"""AMENDMENT 2 comparator: ASReview ELAS u5, run with ASReview's OWN code path at the pinned main commit.

ELAS u5 is not released on PyPI (latest release 3.0.8, 2026-06-18). It is defined on asreview main
(PR #2597, 2026-08-25) and is run here from main at commit 79d568212b2b0a78f9fd7be3c5117dfb890489f9, installed from a
git checkout of that commit into its own environment (reported version 3.0.9.dev10+g79d568212).

The simulation call is the registered one (run_asreview_h2h.simulate_order: the asreview simulate CLI call
path, unchanged on main except for an added groups=None default): the same cycles, LastRelevant stopper,
sim.label(prior_idx), and np.random.seed(seed) before each simulation. Same output schema as run_asreview_h2h.py,
so analyze code reads both. The registered runner (pinned by sha256 in FREEZE.md) is imported, never edited.

  python h2h/run_asreview_u5.py --review Abgaz_2023 --seeds 101 --data-dir ... --out results/u5/Abgaz_2023.json
"""
import argparse
import json
import platform
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import core  # noqa: E402
import run_asreview_h2h as base  # noqa: E402

REGISTRY = HERE / "sets" / "comparator_configs_u5.json"


def comparator_guard_u5() -> dict:
    """Refuse anything but the registered ASReview main build and the registered ELAS u5 configuration."""
    import asreview
    from asreview.models.models import get_ai_config
    reg = json.loads(REGISTRY.read_text())
    if asreview.__version__ != reg["asreview"]:
        raise SystemExit(f"ASReview {asreview.__version__} installed; registered {reg['asreview']} (commit {reg['asreview_commit']})")
    cfg = json.loads(json.dumps(get_ai_config("elas_u5")["value"], default=lambda o: o.__dict__))
    if cfg != reg["elas_u5"]:
        raise SystemExit(f"elas_u5 configuration differs from the registered one: {cfg}")
    return cfg


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--review", required=True)
    ap.add_argument("--priors", default=str(HERE / "priors"))
    ap.add_argument("--seeds", default=",".join(map(str, core.SEEDS)))
    ap.add_argument("--data-dir", default=str(core.DATA_DIR))
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    import asreview
    import sklearn
    from numpy._core._multiarray_umath import __cpu_features__ as cpu

    cfg = comparator_guard_u5()
    csv_path = Path(a.data_dir, f"{a.review}.csv")
    pri = json.loads(Path(a.priors, f"{a.review}.json").read_text())
    _, y, id_sha = core.load_review(a.review, Path(a.data_dir))
    if id_sha != pri["ids_sha256"]:
        raise SystemExit(f"{a.review}: dataset row order differs from the one the priors were drawn on")
    ds_sha = core.dataset_digest(a.review, Path(a.data_dir))
    if ds_sha != pri["dataset_sha256"]:
        raise SystemExit(f"{a.review}: dataset content differs from the registered digest")
    runs = {}
    for s in [int(x) for x in a.seeds.split(",")]:
        prior_idx = pri["priors"][str(s)]
        errors = []
        for attempt in (1, 2):  # PROTOCOL 8: one retry from scratch, then recorded as failed
            t0 = time.time()
            try:
                order, labels = base.simulate_order(csv_path, "elas_u5", prior_idx, s)
                if not np.array_equal(np.asarray(labels).astype(int), y):
                    raise RuntimeError("ASReview's loaded labels differ from core.load_review")
                if order[: len(prior_idx)] != prior_idx:
                    raise RuntimeError("ASReview did not start from the shared starting records")
                m = core.metrics_from_order(order, y)
            except Exception as e:  # noqa: BLE001 - every failure is logged and counted, never hidden
                errors.append(f"attempt {attempt}: {type(e).__name__}: {e}")
                continue
            runs[str(s)] = {"order": order, "metrics": m, "seconds": time.time() - t0, "attempts": attempt, "errors": errors}
            print(f"[asreview elas_u5] {a.review:24s} seed {s:5d} WSS@95 {m['wss95']:.4f} ({time.time() - t0:.0f} s)", flush=True)
            break
        else:
            runs[str(s)] = {"failed": True, "attempts": 2, "errors": errors}
            print(f"[asreview elas_u5] {a.review} seed {s} FAILED twice: {errors}", flush=True)
    reg = json.loads(REGISTRY.read_text())
    env = {"python": platform.python_version(), "machine": platform.machine(), "node": platform.node(),
           "asreview": asreview.__version__, "asreview_commit": reg["asreview_commit"], "sklearn": sklearn.__version__,
           "numpy": np.__version__,
           "cpu_simd": sorted(k for k, v in cpu.items() if v and k.startswith(("AVX", "SSE", "FMA"))),
           "pip_freeze_sha256": base.pip_freeze_sha(), "ai_config": cfg}
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps({"tool": "asreview", "ai": "elas_u5", "review": a.review, "ids_sha256": id_sha,
                                       "dataset_sha256": ds_sha, "environment": env, "runs": runs}))


if __name__ == "__main__":
    main()
