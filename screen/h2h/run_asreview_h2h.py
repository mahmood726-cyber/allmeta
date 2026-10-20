"""ASReview comparator for the held-out head-to-head, run with ASReview's OWN code path.

This reproduces `asreview simulate <data> --ai <name> --prior-idx ...` (asreview/simulation/cli.py, v3.0.8; group_similar_records off, the CLI default)
call for call: the dataset is read with asreview.data.load_dataset, the cycles are
[ActiveLearningCycle(querier=TopDown(), stopper=IsFittable()), ActiveLearningCycle.from_meta(get_ai_config(name)["value"])],
the stopper is LastRelevant, and the starting records are labelled with sim.label(prior_idx).
No ASReview setting, querier or tie-break is changed (3.0.8 Max already sorts stably).

One addition, disclosed: np.random.seed(seed) immediately before each simulation. ELAS u4's LinearSVC has
random_state=None, so liblinear's shuffle draws from NumPy's global generator; without a fixed seed the
result is not reproducible run to run. Seeding the global generator changes no setting.

Output: per (review, seed) the screening order (record indices, starting records first) and the
environment. All metrics are computed by h2h/core.py from these orders, identically for both tools.

  python h2h/run_asreview_h2h.py --review Abgaz_2023 --ai elas_u4 --priors h2h/priors --out results/asreview/elas_u4/Abgaz_2023.json
"""
import argparse
import json
import platform
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import core  # noqa: E402


def simulate_order(csv_path: Path, ai: str, prior_idx: list[int], seed: int) -> list[int]:
    from asreview import load_dataset
    from asreview.learner import ActiveLearningCycle
    from asreview.models.models import get_ai_config
    from asreview.models.queriers import TopDown
    from asreview.models.stoppers import IsFittable, LastRelevant
    from asreview.simulation.simulate import Simulate

    cycle_meta = get_ai_config(ai)["value"]
    cycles = [ActiveLearningCycle(querier=TopDown(), stopper=IsFittable()), ActiveLearningCycle.from_meta(cycle_meta)]
    with load_dataset(str(csv_path), dataset_id=csv_path.name) as db:  # ASReview 3.0.8 CLI: db = load_dataset(...)
        labels = np.asarray(db.input["included"])
        np.random.seed(seed)  # see module docstring
        sim = Simulate(db.input.get_df(), db.input["included"], cycles, stopper=LastRelevant(), print_progress=False)
        sim.label(prior_idx)
        sim.review()
    res = sim._results
    # rows are appended in labelling order; record_id is the 0-based row index of the loaded dataset
    order = [int(r) for r in res["record_id"].tolist()]
    return order, labels


def comparator_guard(ai: str) -> dict:
    """Refuse to run anything but the registered ASReview version and model configuration."""
    import asreview
    from asreview.models.models import get_ai_config
    reg = json.loads(Path(__file__).resolve().parent.joinpath("sets", "comparator_configs.json").read_text())
    if asreview.__version__ != reg["asreview"]:
        raise SystemExit(f"ASReview {asreview.__version__} installed; registered {reg['asreview']}")
    cfg = json.loads(json.dumps(get_ai_config(ai)["value"], default=lambda o: o.__dict__))
    if cfg != reg[ai]:
        raise SystemExit(f"{ai} configuration differs from the registered one: {cfg}")
    return cfg


def pip_freeze_sha() -> str:
    import hashlib
    import subprocess
    out = subprocess.run([sys.executable, "-m", "pip", "freeze"], capture_output=True, text=True, stdin=subprocess.DEVNULL).stdout
    return hashlib.sha256(out.encode()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--review", required=True)
    ap.add_argument("--ai", default="elas_u4", choices=["elas_u4", "elas_u3"])
    ap.add_argument("--priors", default=str(Path(__file__).resolve().parent / "priors"))
    ap.add_argument("--seeds", default=",".join(map(str, core.SEEDS)))
    ap.add_argument("--data-dir", default=str(core.DATA_DIR))
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    import asreview
    import sklearn
    from numpy._core._multiarray_umath import __cpu_features__ as cpu

    cfg = comparator_guard(a.ai)
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
                order, labels = simulate_order(csv_path, a.ai, prior_idx, s)
                if not np.array_equal(np.asarray(labels).astype(int), y):
                    raise RuntimeError("ASReview's loaded labels differ from core.load_review")
                if order[: len(prior_idx)] != prior_idx:
                    raise RuntimeError("ASReview did not start from the shared starting records")
                m = core.metrics_from_order(order, y)
            except Exception as e:  # noqa: BLE001 - every failure is logged and counted, never hidden
                errors.append(f"attempt {attempt}: {type(e).__name__}: {e}")
                continue
            runs[str(s)] = {"order": order, "metrics": m, "seconds": time.time() - t0, "attempts": attempt, "errors": errors}
            print(f"[asreview {a.ai}] {a.review:24s} seed {s:5d} WSS@95 {m['wss95']:.4f} ({time.time() - t0:.0f} s)", flush=True)
            break
        else:
            runs[str(s)] = {"failed": True, "attempts": 2, "errors": errors}
            print(f"[asreview {a.ai}] {a.review} seed {s} FAILED twice: {errors}", flush=True)
    env = {"python": platform.python_version(), "machine": platform.machine(), "node": platform.node(),
           "asreview": asreview.__version__, "sklearn": sklearn.__version__, "numpy": np.__version__,
           "cpu_simd": sorted(k for k, v in cpu.items() if v and k.startswith(("AVX", "SSE", "FMA"))),
           "pip_freeze_sha256": pip_freeze_sha(), "ai_config": cfg}
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps({"tool": "asreview", "ai": a.ai, "review": a.review, "ids_sha256": id_sha,
                                       "dataset_sha256": ds_sha, "environment": env, "runs": runs}))


if __name__ == "__main__":
    main()
