#!/usr/bin/env python3
"""
Strict benchmark against R dosresmeta on synthetic datasets.

Compares:
1) Accuracy (beta, SE, tau2)
2) Runtime
3) Failure rate

Outputs:
- tests/strict_beat_r_benchmark_results.json
- docs/STRICT_BEAT_R_BENCHMARK_YYYY-MM-DD.md
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import shutil
import subprocess
import time
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from statistics import NormalDist
from typing import Any

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
TESTS_DIR = ROOT / "tests"
DOCS_DIR = ROOT / "docs"

R_HELPER_SCRIPT = TESTS_DIR / "strict_r_batch_dosresmeta.R"
INPUT_JSON = TESTS_DIR / "strict_benchmark_input.json"
R_OUTPUT_JSON = TESTS_DIR / "strict_r_batch_results.json"
RESULTS_JSON = TESTS_DIR / "strict_beat_r_benchmark_results.json"

DEFAULT_N_DATASETS = 120
DEFAULT_SEED = 20260228

_STANDARD_NORMAL = NormalDist()

# Strict but realistic thresholds for a "beat R" claim.
MAX_P95_ABS_BETA_DIFF = 0.02
MAX_P95_ABS_SE_DIFF = 0.05
MAX_P95_ABS_TAU2_DIFF = 0.02
MAX_P95_ABS_GRID_LOGRR_DIFF = 0.02
MAX_P95_ABS_GRID_SE_DIFF = 0.05
MAX_FAIL_RATE_MARGIN = 0.01
MIN_COMPARABLE_FRACTION = 0.95


@dataclass
class DatasetRow:
    study: str
    dose: float
    cases: int
    n: int

    def to_json(self) -> dict[str, Any]:
        return {
            "study": self.study,
            "dose": float(self.dose),
            "cases": int(self.cases),
            "n": int(self.n),
        }


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def normal_ppf(p: float) -> float:
    p = min(max(float(p), 1e-12), 1 - 1e-12)
    return float(_STANDARD_NORMAL.inv_cdf(p))


def write_json(path: Path, payload: Any) -> None:
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def discover_rscript() -> str | None:
    which = shutil.which("Rscript")
    if which:
        return which

    candidates = [
        Path(r"C:\Program Files\R\R-4.5.2\bin\Rscript.exe"),
        Path(r"C:\Program Files\R\R-4.5.1\bin\Rscript.exe"),
        Path("/mnt/c/Program Files/R/R-4.5.2/bin/Rscript.exe"),
        Path("/mnt/c/Program Files/R/R-4.5.1/bin/Rscript.exe"),
    ]
    r_root = Path(r"C:\Program Files\R")
    if r_root.exists():
        for d in sorted(r_root.glob("R-*"), reverse=True):
            candidates.append(d / "bin" / "Rscript.exe")
            candidates.append(d / "bin" / "x64" / "Rscript.exe")
    wsl_r_root = Path("/mnt/c/Program Files/R")
    if wsl_r_root.exists():
        for d in sorted(wsl_r_root.glob("R-*"), reverse=True):
            candidates.append(d / "bin" / "Rscript.exe")
            candidates.append(d / "bin" / "x64" / "Rscript.exe")

    for c in candidates:
        if c.exists():
            return str(c)
    return None


def to_r_compatible_path(path: Path | str, rscript: str) -> str:
    raw = str(path)
    if rscript.lower().endswith(".exe") and raw.startswith("/mnt/") and len(raw) > 6:
        drive = raw[5].upper()
        rest = raw[6:].replace("\\", "/")
        return f"{drive}:{rest}"
    return raw


def load_cli_module() -> Any:
    cli_path = ROOT / "dose-response-cli.py"
    spec = importlib.util.spec_from_file_location("dose_response_cli_mod", cli_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load CLI module from {cli_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def make_synthetic_dataset(rng: np.random.Generator, dataset_id: str) -> list[DatasetRow]:
    n_studies = int(rng.integers(4, 10))
    dose_templates = [
        np.array([0.0, 1.0, 2.0, 3.0], dtype=float),
        np.array([0.0, 0.5, 1.5, 3.0], dtype=float),
        np.array([0.0, 1.0, 2.5, 4.0], dtype=float),
    ]

    template = dose_templates[int(rng.integers(0, len(dose_templates)))]
    beta1_true = float(rng.uniform(-0.08, 0.08))
    beta2_true = float(rng.uniform(-0.02, 0.02))
    tau2_true = float(rng.uniform(0.0, 0.02))
    tau_sd = math.sqrt(max(tau2_true, 0.0))

    rows: list[DatasetRow] = []
    for i in range(n_studies):
        study = f"{dataset_id}_S{i+1:02d}"
        study_shift = float(rng.normal(0.0, tau_sd))
        baseline_risk = float(rng.uniform(0.008, 0.06))
        n_base = int(rng.integers(12000, 70000))

        for d in template:
            n_i = int(max(2000, round(n_base * rng.uniform(0.85, 1.15))))
            log_rr = beta1_true * float(d) + beta2_true * float(d) ** 2 + study_shift
            p = baseline_risk * math.exp(log_rr)
            p = min(max(p, 1e-6), 0.95)
            cases = int(rng.binomial(n_i, p))
            cases = max(cases, 1)
            rows.append(DatasetRow(study=study, dose=float(d), cases=cases, n=n_i))

    return rows


def to_dataframe(rows: list[DatasetRow]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "study_id": [r.study for r in rows],
            "dose": [r.dose for r in rows],
            "cases": [r.cases for r in rows],
            "n": [r.n for r in rows],
        }
    )


def finite_float(value: Any) -> float | None:
    try:
        x = float(value)
    except Exception:
        return None
    if math.isfinite(x):
        return x
    return None


def percentile(values: list[float], q: float) -> float | None:
    arr = np.asarray(values, dtype=float)
    if arr.size == 0:
        return None
    return float(np.percentile(arr, q))


def median(values: list[float]) -> float | None:
    if not values:
        return None
    return float(np.median(np.asarray(values, dtype=float)))


def build_prediction_grid(rows: list[DatasetRow]) -> list[float]:
    max_dose = max((float(r.dose) for r in rows), default=0.0)
    upper = max(0.0, max_dose, max_dose * 1.1)
    return [float(x) for x in np.linspace(0.0, upper, 41)]


def contrast_basis(dose: float, reference_dose: float, model_key: str) -> np.ndarray:
    if model_key == "linear":
        return np.array([0.0, float(dose) - float(reference_dose)], dtype=float)
    return np.array(
        [0.0, float(dose) - float(reference_dose), float(dose) ** 2 - float(reference_dose) ** 2],
        dtype=float,
    )


def compute_cli_prediction_grid(
    fit: dict[str, Any],
    doses: list[float],
    model_key: str = "quadratic",
    reference_dose: float = 0.0,
    ci_level: float = 0.95,
) -> list[dict[str, Any]]:
    beta = np.asarray(fit.get("beta", []), dtype=float)
    var = np.asarray(fit.get("var", []), dtype=float)
    if beta.ndim != 1 or var.ndim != 2:
        return []

    z_value = normal_ppf(0.5 + float(ci_level) / 2.0)
    rows: list[dict[str, Any]] = []
    for dose in doses:
        delta = contrast_basis(float(dose), float(reference_dose), model_key)
        if delta.shape[0] != beta.shape[0] or var.shape != (beta.shape[0], beta.shape[0]):
            return []
        log_rr = float(delta @ beta)
        pred_var = float(delta @ var @ delta)
        se_log_rr = math.sqrt(max(pred_var, 0.0))
        rows.append(
            {
                "dose": float(dose),
                "logrr": log_rr,
                "se_logrr": se_log_rr,
                "rr": float(math.exp(log_rr)),
                "ci_lower": float(math.exp(log_rr - z_value * se_log_rr)),
                "ci_upper": float(math.exp(log_rr + z_value * se_log_rr)),
            }
        )
    return rows


def compare_prediction_grids(
    our_grid: list[dict[str, Any]],
    r_grid: list[dict[str, Any]],
) -> tuple[float | None, float | None, int]:
    our_map = {
        round(float(row.get("dose", float("nan"))), 12): row
        for row in our_grid
        if finite_float(row.get("dose")) is not None
    }
    logrr_diffs: list[float] = []
    se_diffs: list[float] = []

    for row in r_grid:
        dose = finite_float(row.get("dose"))
        if dose is None:
            continue
        ours = our_map.get(round(dose, 12))
        if not ours:
            continue
        our_logrr = finite_float(ours.get("logrr"))
        r_logrr = finite_float(row.get("logrr"))
        our_se = finite_float(ours.get("se_logrr"))
        r_se = finite_float(row.get("se_logrr"))
        if our_logrr is not None and r_logrr is not None:
            logrr_diffs.append(abs(our_logrr - r_logrr))
        if our_se is not None and r_se is not None:
            se_diffs.append(abs(our_se - r_se))

    max_logrr = max(logrr_diffs) if logrr_diffs else None
    max_se = max(se_diffs) if se_diffs else None
    return max_logrr, max_se, min(len(logrr_diffs), len(se_diffs))


def build_markdown_report(payload: dict[str, Any]) -> str:
    s = payload["summary"]
    crit = payload["criteria"]
    lines: list[str] = []
    lines.append("# Strict Beat-R Benchmark")
    lines.append("")
    lines.append(f"Generated: {payload['generated_at']}")
    lines.append(f"Seed: {payload['seed']}")
    lines.append(f"Datasets requested: {payload['n_datasets_requested']}")
    lines.append("")
    lines.append("## Outcome")
    lines.append(f"- Beats R under strict criteria: {payload['beats_r']}")
    lines.append(f"- Comparable datasets: {s['comparable_count']}/{s['n_total']}")
    lines.append(f"- Our fail rate: {s['our_fail_rate']:.4f}")
    lines.append(f"- R fail rate: {s['r_fail_rate']:.4f}")
    lines.append(f"- Median runtime (ours ms): {s['our_runtime_median_ms']}")
    lines.append(f"- Median runtime (R ms): {s['r_runtime_median_ms']}")
    lines.append(f"- Runtime speedup (R/ours): {s['runtime_speedup_ratio']}")
    lines.append("")
    lines.append("## Accuracy")
    lines.append(f"- p95 |beta diff|: {s['p95_abs_beta_diff']}")
    lines.append(f"- p95 |SE diff|: {s['p95_abs_se_diff']}")
    lines.append(f"- p95 |tau2 diff|: {s['p95_abs_tau2_diff']}")
    lines.append(f"- p95 max |grid logRR diff|: {s['p95_abs_grid_logrr_diff']}")
    lines.append(f"- p95 max |grid SE diff|: {s['p95_abs_grid_se_diff']}")
    lines.append("")
    lines.append("## Criteria")
    for key, value in crit.items():
        lines.append(f"- {key}: {value}")
    lines.append("")
    lines.append("## Notes")
    lines.append("- Accuracy compares linear/quadratic coefficients, their SEs, tau2, and pooled contrast-grid predictions against dosresmeta.")
    lines.append("- R fits are executed via batch R script to avoid per-dataset startup overhead.")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Run strict beat-R benchmark.")
    parser.add_argument("--n-datasets", type=int, default=DEFAULT_N_DATASETS)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    args = parser.parse_args()

    n_datasets = max(20, int(args.n_datasets))
    seed = int(args.seed)

    TESTS_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)

    rscript = discover_rscript()
    if not rscript:
        raise RuntimeError("Rscript not found; cannot run strict beat-R benchmark.")
    if not R_HELPER_SCRIPT.exists():
        raise RuntimeError(f"Missing R helper script: {R_HELPER_SCRIPT}")

    cli = load_cli_module()

    rng = np.random.default_rng(seed)
    datasets: list[dict[str, Any]] = []
    our_results: list[dict[str, Any]] = []

    for i in range(n_datasets):
        dataset_id = f"ds_{i+1:04d}"
        rows = make_synthetic_dataset(rng, dataset_id)
        prediction_grid = build_prediction_grid(rows)
        datasets.append(
            {
                "dataset_id": dataset_id,
                "model_type": "quadratic",
                "reference_dose": 0.0,
                "ci_level": 0.95,
                "prediction_grid": prediction_grid,
                "rows": [r.to_json() for r in rows],
            }
        )

        t0 = time.perf_counter()
        try:
            df = to_dataframe(rows)
            fit = cli.solve_gls(df, tau2_override=None, model="quadratic", ci_level=0.95)
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            our_prediction_grid = compute_cli_prediction_grid(
                fit,
                prediction_grid,
                model_key="quadratic",
                reference_dose=0.0,
                ci_level=0.95,
            )

            beta = fit.get("beta", [])
            se = fit.get("se", [])
            our_results.append(
                {
                    "dataset_id": dataset_id,
                    "ok": True,
                    "runtime_ms": elapsed_ms,
                    "beta_linear": finite_float(beta[1]) if len(beta) > 1 else None,
                    "beta_quadratic": finite_float(beta[2]) if len(beta) > 2 else None,
                    "se_linear": finite_float(se[1]) if len(se) > 1 else None,
                    "se_quadratic": finite_float(se[2]) if len(se) > 2 else None,
                    "tau2": finite_float(fit.get("tau2")),
                    "prediction_grid": our_prediction_grid,
                    "error": None,
                }
            )
        except Exception as err:
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            our_results.append(
                {
                    "dataset_id": dataset_id,
                    "ok": False,
                    "runtime_ms": elapsed_ms,
                    "beta_linear": None,
                    "beta_quadratic": None,
                    "se_linear": None,
                    "se_quadratic": None,
                    "tau2": None,
                    "prediction_grid": [],
                    "error": str(err),
                }
            )

    write_json(
        INPUT_JSON,
        {
            "generated_at": now_utc_iso(),
            "seed": seed,
            "n_datasets": n_datasets,
            "datasets": datasets,
        },
    )

    r_proc = subprocess.run(
        [
            rscript,
            to_r_compatible_path(R_HELPER_SCRIPT, rscript),
            to_r_compatible_path(INPUT_JSON, rscript),
            to_r_compatible_path(R_OUTPUT_JSON, rscript),
        ],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    if r_proc.returncode != 0:
        raise RuntimeError(
            "R benchmark batch failed.\n"
            f"stdout:\n{r_proc.stdout[-4000:]}\n"
            f"stderr:\n{r_proc.stderr[-4000:]}"
        )

    r_payload = read_json(R_OUTPUT_JSON)
    r_results = {row["dataset_id"]: row for row in r_payload.get("results", [])}
    our_map = {row["dataset_id"]: row for row in our_results}

    comparable_rows: list[dict[str, Any]] = []
    beta_diffs: list[float] = []
    se_diffs: list[float] = []
    tau2_diffs: list[float] = []
    grid_logrr_diffs: list[float] = []
    grid_se_diffs: list[float] = []
    our_runtime_ok: list[float] = []
    r_runtime_ok: list[float] = []

    for dataset in datasets:
        did = dataset["dataset_id"]
        ours = our_map.get(did)
        rfit = r_results.get(did)

        if ours and ours.get("ok") and finite_float(ours.get("runtime_ms")) is not None:
            our_runtime_ok.append(float(ours["runtime_ms"]))
        if rfit and rfit.get("ok") and finite_float(rfit.get("runtime_ms")) is not None:
            r_runtime_ok.append(float(rfit["runtime_ms"]))

        if not (ours and rfit and ours.get("ok") and rfit.get("ok")):
            continue

        diffs = {}
        for key in ("beta_linear", "beta_quadratic", "se_linear", "se_quadratic", "tau2"):
            ov = finite_float(ours.get(key))
            rv = finite_float(rfit.get(key))
            diffs[key] = None if ov is None or rv is None else abs(ov - rv)

        max_beta_diff = max(
            [d for d in (diffs["beta_linear"], diffs["beta_quadratic"]) if d is not None],
            default=None,
        )
        max_se_diff = max(
            [d for d in (diffs["se_linear"], diffs["se_quadratic"]) if d is not None],
            default=None,
        )

        if max_beta_diff is not None:
            beta_diffs.append(max_beta_diff)
        if max_se_diff is not None:
            se_diffs.append(max_se_diff)
        if diffs["tau2"] is not None:
            tau2_diffs.append(diffs["tau2"])

        max_grid_logrr_diff, max_grid_se_diff, grid_points = compare_prediction_grids(
            ours.get("prediction_grid", []),
            rfit.get("prediction_grid", []),
        )
        if max_grid_logrr_diff is not None:
            grid_logrr_diffs.append(max_grid_logrr_diff)
        if max_grid_se_diff is not None:
            grid_se_diffs.append(max_grid_se_diff)

        comparable_rows.append(
            {
                "dataset_id": did,
                "max_abs_beta_diff": max_beta_diff,
                "max_abs_se_diff": max_se_diff,
                "abs_tau2_diff": diffs["tau2"],
                "max_abs_grid_logrr_diff": max_grid_logrr_diff,
                "max_abs_grid_se_diff": max_grid_se_diff,
                "grid_points_compared": grid_points,
                "our_runtime_ms": finite_float(ours.get("runtime_ms")),
                "r_runtime_ms": finite_float(rfit.get("runtime_ms")),
            }
        )

    n_total = n_datasets
    our_ok = sum(1 for r in our_results if r.get("ok"))
    r_ok = sum(1 for r in r_payload.get("results", []) if r.get("ok"))
    comparable_count = len(comparable_rows)
    comparable_fraction = comparable_count / n_total if n_total else 0.0

    our_fail_rate = 1.0 - (our_ok / n_total if n_total else 0.0)
    r_fail_rate = 1.0 - (r_ok / n_total if n_total else 0.0)

    p95_beta = percentile(beta_diffs, 95)
    p95_se = percentile(se_diffs, 95)
    p95_tau2 = percentile(tau2_diffs, 95)
    p95_grid_logrr = percentile(grid_logrr_diffs, 95)
    p95_grid_se = percentile(grid_se_diffs, 95)
    median_our_runtime = median(our_runtime_ok)
    median_r_runtime = median(r_runtime_ok)

    runtime_speedup_ratio = None
    runtime_better = False
    if median_our_runtime and median_r_runtime and median_our_runtime > 0:
        runtime_speedup_ratio = median_r_runtime / median_our_runtime
        runtime_better = runtime_speedup_ratio > 1.0

    criteria = {
        "comparable_fraction_ok": comparable_fraction >= MIN_COMPARABLE_FRACTION,
        "p95_abs_beta_diff_ok": (p95_beta is not None and p95_beta <= MAX_P95_ABS_BETA_DIFF),
        "p95_abs_se_diff_ok": (p95_se is not None and p95_se <= MAX_P95_ABS_SE_DIFF),
        "p95_abs_tau2_diff_ok": (p95_tau2 is not None and p95_tau2 <= MAX_P95_ABS_TAU2_DIFF),
        "p95_abs_grid_logrr_diff_ok": (p95_grid_logrr is not None and p95_grid_logrr <= MAX_P95_ABS_GRID_LOGRR_DIFF),
        "p95_abs_grid_se_diff_ok": (p95_grid_se is not None and p95_grid_se <= MAX_P95_ABS_GRID_SE_DIFF),
        "fail_rate_vs_r_ok": our_fail_rate <= (r_fail_rate + MAX_FAIL_RATE_MARGIN),
        "runtime_better_than_r_ok": runtime_better,
    }
    beats_r = all(criteria.values())

    summary = {
        "n_total": n_total,
        "our_ok": our_ok,
        "r_ok": r_ok,
        "comparable_count": comparable_count,
        "comparable_fraction": comparable_fraction,
        "our_fail_rate": our_fail_rate,
        "r_fail_rate": r_fail_rate,
        "our_runtime_median_ms": median_our_runtime,
        "r_runtime_median_ms": median_r_runtime,
        "runtime_speedup_ratio": runtime_speedup_ratio,
        "p95_abs_beta_diff": p95_beta,
        "p95_abs_se_diff": p95_se,
        "p95_abs_tau2_diff": p95_tau2,
        "p95_abs_grid_logrr_diff": p95_grid_logrr,
        "p95_abs_grid_se_diff": p95_grid_se,
        "max_abs_beta_diff": max(beta_diffs) if beta_diffs else None,
        "max_abs_se_diff": max(se_diffs) if se_diffs else None,
        "max_abs_tau2_diff": max(tau2_diffs) if tau2_diffs else None,
        "max_abs_grid_logrr_diff": max(grid_logrr_diffs) if grid_logrr_diffs else None,
        "max_abs_grid_se_diff": max(grid_se_diffs) if grid_se_diffs else None,
    }

    payload = {
        "generated_at": now_utc_iso(),
        "seed": seed,
        "n_datasets_requested": n_datasets,
        "rscript_path": rscript,
        "r_package_versions": r_payload.get("package_versions", {}),
        "criteria_thresholds": {
            "max_p95_abs_beta_diff": MAX_P95_ABS_BETA_DIFF,
            "max_p95_abs_se_diff": MAX_P95_ABS_SE_DIFF,
            "max_p95_abs_tau2_diff": MAX_P95_ABS_TAU2_DIFF,
            "max_p95_abs_grid_logrr_diff": MAX_P95_ABS_GRID_LOGRR_DIFF,
            "max_p95_abs_grid_se_diff": MAX_P95_ABS_GRID_SE_DIFF,
            "max_fail_rate_margin_vs_r": MAX_FAIL_RATE_MARGIN,
            "min_comparable_fraction": MIN_COMPARABLE_FRACTION,
            "runtime_must_be_faster_than_r": True,
        },
        "criteria": criteria,
        "beats_r": beats_r,
        "summary": summary,
        "rows": comparable_rows,
        "our_results": our_results,
        "r_results": r_payload.get("results", []),
    }
    write_json(RESULTS_JSON, payload)

    report_path = DOCS_DIR / f"STRICT_BEAT_R_BENCHMARK_{date.today().isoformat()}.md"
    report_path.write_text(build_markdown_report(payload), encoding="utf-8")

    print(f"Wrote strict benchmark JSON: {RESULTS_JSON}")
    print(f"Wrote strict benchmark report: {report_path}")
    print(f"Beats R under strict criteria: {beats_r}")
    print(
        f"Comparable={comparable_count}/{n_total} "
        f"p95_beta={p95_beta} p95_se={p95_se} p95_tau2={p95_tau2} "
        f"p95_grid_logrr={p95_grid_logrr} p95_grid_se={p95_grid_se} "
        f"speedup={runtime_speedup_ratio}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
