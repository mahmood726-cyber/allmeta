#!/usr/bin/env python3
"""Run Loop-7 simulation lab for nonlinear one-stage interaction IPD methods."""

from __future__ import annotations

import argparse
import json
import math
import re
import statistics
import time
from pathlib import Path
from typing import Any

from selenium import webdriver
from selenium.common.exceptions import JavascriptException
from selenium.webdriver.edge.options import Options

from edge_webdriver import create_edge_driver, load_local_app_with_ready_check


DEFAULT_SCENARIOS = ["null", "linear", "nonlinear"]
MIN_VALID_REPLICATES = 30
MAX_ABS_BIAS = 0.12
MIN_COVERAGE = 0.80
MAX_FALSE_POSITIVE_RATE = 0.10
MIN_POWER = 0.75
MAX_RMSE_MARGIN_VS_LINEAR = 0.07


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _app_build_id(app_path: Path) -> str | None:
    try:
        text = app_path.read_text(encoding="utf-8")
    except Exception:
        return None
    match = re.search(r"const IPD_APP_BUILD_ID = '([^']+)'", text)
    return match.group(1) if match else None


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        out = float(value)
    except Exception:
        return None
    if math.isnan(out) or math.isinf(out):
        return None
    return out


def _run_app(app_path: Path, scenarios: list[str], replicates: int, seed: int) -> dict[str, Any]:
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")

    driver = create_edge_driver(options)
    out: dict[str, Any] = {"scenarios": {}}

    try:
        load_local_app_with_ready_check(
            driver,
            app_path,
            required_functions=("loadExampleData", "runAnalysis"),
            required_objects=("APP", "BeyondR40"),
            ready_timeout=20,
        )
        time.sleep(0.5)

        ready = driver.execute_script(
            """
            return (
              typeof BeyondR40 === 'object' &&
              typeof BeyondR40.nonlinearSplineInteractionIPDMA === 'function' &&
              typeof BeyondR40.centeredOneStageInteractionIPD === 'function'
            );
            """
        )
        if not ready:
            raise RuntimeError("Loop-7 nonlinear interaction method not available in page context")

        try:
            payload = driver.execute_script(
                """
                const scenarioNames = arguments[0];
                const reps = Math.max(1, Math.floor(arguments[1]));
                const baseSeed = Math.floor(arguments[2]);

                function mulberry32(a) {
                  return function() {
                    let t = a += 0x6D2B79F5;
                    t = Math.imul(t ^ (t >>> 15), t | 1);
                    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
                  };
                }

                function randn(rng) {
                  const u1 = Math.max(1e-12, rng());
                  const u2 = rng();
                  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
                }

                function effectAtZ(scenario, z) {
                  if (scenario === 'null') return 0.40;
                  if (scenario === 'linear') return 0.40 + 0.25 * z;
                  return 0.40 + 0.10 * z - 0.20 * z * z;
                }

                function scenarioTruth(scenario) {
                  const low = effectAtZ(scenario, -1);
                  const mid = effectAtZ(scenario, 0);
                  const high = effectAtZ(scenario, 1);
                  return {
                    high_low: high - low,
                    curvature: mid - 0.5 * (low + high)
                  };
                }

                function makeData(scenario, seed) {
                  const rng = mulberry32(seed);
                  const nStudies = 8;
                  const perStudy = 120;
                  const rows = [];
                  for (let s = 0; s < nStudies; s++) {
                    const studyShift = 0.40 * randn(rng);
                    for (let i = 0; i < perStudy; i++) {
                      const z = randn(rng);
                      const trt = rng() < 0.5 ? 1 : 0;
                      const txEff = effectAtZ(scenario, z);
                      const y = 2.0 + studyShift + 0.60 * z + trt * txEff + randn(rng);
                      rows.push({
                        study_id: 'S' + (s + 1),
                        treatment: trt,
                        age: z,
                        outcome: y
                      });
                    }
                  }
                  return rows;
                }

                const result = {};
                scenarioNames.forEach((scenarioName, scenarioIdx) => {
                  const truth = scenarioTruth(scenarioName);
                  const repsOut = [];
                  for (let r = 0; r < reps; r++) {
                    const simSeed = baseSeed + scenarioIdx * 100003 + r * 7919;
                    const rows = makeData(scenarioName, simSeed);
                    let spline = null;
                    let splineErr = null;
                    let centered = null;
                    let centeredErr = null;

                    try {
                      spline = BeyondR40.nonlinearSplineInteractionIPDMA(
                        rows,
                        'outcome',
                        'treatment',
                        'age',
                        'study_id',
                        0.01,
                        [-1.5, -0.5, 0.5, 1.5]
                      );
                    } catch (e) {
                      splineErr = String(e && e.message ? e.message : e);
                    }
                    try {
                      centered = BeyondR40.centeredOneStageInteractionIPD(
                        rows,
                        'outcome',
                        'treatment',
                        'age',
                        'study_id'
                      );
                    } catch (e) {
                      centeredErr = String(e && e.message ? e.message : e);
                    }

                    const sHL = (((spline || {}).interactionHighVsLow || {}).spline) || {};
                    const sCurv = (spline || {}).curvatureContrast || {};
                    const lin = ((centered || {}).withinTrialInteraction) || {};

                    repsOut.push({
                      rep: r + 1,
                      truth: truth,
                      spline: {
                        error: spline && spline.error ? spline.error : splineErr,
                        n_studies: spline ? spline.nStudies : null,
                        high_low_est: sHL.estimate,
                        high_low_se: sHL.se,
                        high_low_ci_low: sHL.ci ? sHL.ci.lower : null,
                        high_low_ci_high: sHL.ci ? sHL.ci.upper : null,
                        curvature_est: sCurv.estimate,
                        curvature_se: sCurv.se,
                        curvature_ci_low: sCurv.ci ? sCurv.ci.lower : null,
                        curvature_ci_high: sCurv.ci ? sCurv.ci.upper : null,
                        curvature_p: sCurv.pValue
                      },
                      centered_linear: {
                        error: centered && centered.error ? centered.error : centeredErr,
                        interaction_est: lin.estimate,
                        interaction_se: lin.se,
                        high_low_est: (lin.estimate !== null && lin.estimate !== undefined) ? 2 * Number(lin.estimate) : null,
                        high_low_se: (lin.se !== null && lin.se !== undefined) ? 2 * Number(lin.se) : null
                      }
                    });
                  }

                  result[scenarioName] = {
                    truth: truth,
                    replicates: repsOut
                  };
                });
                return result;
                """,
                scenarios,
                replicates,
                seed,
            )
        except JavascriptException as exc:
            raise RuntimeError(f"Simulation lab JS execution failed: {exc}") from exc

        out["scenarios"] = payload or {}
    finally:
        driver.quit()

    return out


def _mean(values: list[float]) -> float | None:
    return statistics.mean(values) if values else None


def _coverage(ci_lows: list[float], ci_highs: list[float], truth: float) -> float | None:
    if not ci_lows or not ci_highs or len(ci_lows) != len(ci_highs):
        return None
    ok = 0
    n = 0
    for lo, hi in zip(ci_lows, ci_highs):
        if lo is None or hi is None:
            continue
        n += 1
        if lo <= truth <= hi:
            ok += 1
    return (ok / n) if n else None


def _compare(app_results: dict[str, Any], min_valid_reps: int) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []

    for scenario, info in (app_results.get("scenarios") or {}).items():
        truth = info.get("truth") or {}
        truth_hl = _to_float(truth.get("high_low")) or 0.0
        truth_curv = _to_float(truth.get("curvature")) or 0.0
        reps = info.get("replicates") or []

        valid = []
        for r in reps:
            spline = r.get("spline") or {}
            if spline.get("error"):
                continue
            hl_est = _to_float(spline.get("high_low_est"))
            hl_l = _to_float(spline.get("high_low_ci_low"))
            hl_h = _to_float(spline.get("high_low_ci_high"))
            cu_est = _to_float(spline.get("curvature_est"))
            cu_l = _to_float(spline.get("curvature_ci_low"))
            cu_h = _to_float(spline.get("curvature_ci_high"))
            if None in (hl_est, hl_l, hl_h, cu_est, cu_l, cu_h):
                continue
            valid.append(r)

        hl_estimates = [_to_float((r.get("spline") or {}).get("high_low_est")) for r in valid]
        hl_estimates = [v for v in hl_estimates if v is not None]
        hl_ci_l = [_to_float((r.get("spline") or {}).get("high_low_ci_low")) for r in valid]
        hl_ci_h = [_to_float((r.get("spline") or {}).get("high_low_ci_high")) for r in valid]
        cu_estimates = [_to_float((r.get("spline") or {}).get("curvature_est")) for r in valid]
        cu_estimates = [v for v in cu_estimates if v is not None]
        cu_ci_l = [_to_float((r.get("spline") or {}).get("curvature_ci_low")) for r in valid]
        cu_ci_h = [_to_float((r.get("spline") or {}).get("curvature_ci_high")) for r in valid]

        hl_bias = (_mean(hl_estimates) - truth_hl) if hl_estimates else None
        hl_rmse = (
            math.sqrt(statistics.mean([(x - truth_hl) ** 2 for x in hl_estimates]))
            if hl_estimates
            else None
        )
        cu_bias = (_mean(cu_estimates) - truth_curv) if cu_estimates else None
        cu_rmse = (
            math.sqrt(statistics.mean([(x - truth_curv) ** 2 for x in cu_estimates]))
            if cu_estimates
            else None
        )

        hl_cov = _coverage(hl_ci_l, hl_ci_h, truth_hl)
        cu_cov = _coverage(cu_ci_l, cu_ci_h, truth_curv)

        significant_curv = 0
        curv_total = 0
        for lo, hi in zip(cu_ci_l, cu_ci_h):
            if lo is None or hi is None:
                continue
            curv_total += 1
            if lo > 0 or hi < 0:
                significant_curv += 1
        sig_rate = (significant_curv / curv_total) if curv_total else None

        linear_hl = [
            _to_float(((r.get("centered_linear") or {}).get("high_low_est")))
            for r in valid
            if not (r.get("centered_linear") or {}).get("error")
        ]
        linear_hl = [v for v in linear_hl if v is not None]
        linear_hl_rmse = (
            math.sqrt(statistics.mean([(x - truth_hl) ** 2 for x in linear_hl]))
            if linear_hl
            else None
        )

        checks = {
            "min_valid_replicates": len(valid) >= min_valid_reps,
            "high_low_bias_bounded": hl_bias is not None and abs(hl_bias) <= MAX_ABS_BIAS,
            "high_low_coverage": hl_cov is not None and hl_cov >= MIN_COVERAGE,
            "curvature_coverage": cu_cov is not None and cu_cov >= MIN_COVERAGE,
            "spline_vs_linear_rmse": (
                linear_hl_rmse is None
                or hl_rmse is not None
                and hl_rmse <= (linear_hl_rmse + MAX_RMSE_MARGIN_VS_LINEAR)
            ),
        }
        if abs(truth_curv) < 1e-12:
            checks["curvature_false_positive_bounded"] = sig_rate is not None and sig_rate <= MAX_FALSE_POSITIVE_RATE
        else:
            checks["curvature_power"] = sig_rate is not None and sig_rate >= MIN_POWER

        row = {
            "scenario": scenario,
            "truth": {
                "high_low": truth_hl,
                "curvature": truth_curv,
            },
            "n_replicates": len(reps),
            "n_valid": len(valid),
            "metrics": {
                "high_low_bias": hl_bias,
                "high_low_rmse": hl_rmse,
                "high_low_coverage": hl_cov,
                "curvature_bias": cu_bias,
                "curvature_rmse": cu_rmse,
                "curvature_coverage": cu_cov,
                "curvature_significant_rate": sig_rate,
                "linear_high_low_rmse": linear_hl_rmse,
            },
            "checks": checks,
            "pass": all(bool(v) for v in checks.values()),
        }
        rows.append(row)

    summary = {
        "rows": len(rows),
        "overall_pass_rate": (sum(1 for r in rows if r["pass"]) / len(rows)) if rows else None,
        "mean_high_low_bias_abs": (
            statistics.mean([abs(_to_float(r["metrics"].get("high_low_bias")) or 0) for r in rows])
            if rows
            else None
        ),
        "mean_curvature_bias_abs": (
            statistics.mean([abs(_to_float(r["metrics"].get("curvature_bias")) or 0) for r in rows])
            if rows
            else None
        ),
    }
    return {"rows": rows, "summary": summary}


def _fmt(v: float | None, digits: int = 6) -> str:
    if v is None:
        return "NA"
    return f"{v:.{digits}f}"


def _write_markdown(
    path: Path,
    comparison: dict[str, Any],
    scenarios: list[str],
    replicates: int,
    seed: int,
    min_valid_reps: int,
) -> None:
    summary = comparison["summary"]
    rows = comparison["rows"]
    lines: list[str] = []
    lines.append("# IPD Simulation Lab Benchmark (Loop 7)")
    lines.append("")
    lines.append(f"- Seed: `{seed}`")
    lines.append(f"- Scenarios: `{', '.join(scenarios)}`")
    lines.append(f"- Replicates per scenario: `{replicates}`")
    lines.append(f"- Min valid replicates gate: `{min_valid_reps}`")
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    lines.append(f"- Scenario rows: `{summary['rows']}`")
    lines.append(f"- Overall pass rate: `{_fmt(summary['overall_pass_rate'], 3)}`")
    lines.append(f"- Mean |high-low bias|: `{_fmt(summary['mean_high_low_bias_abs'], 4)}`")
    lines.append(f"- Mean |curvature bias|: `{_fmt(summary['mean_curvature_bias_abs'], 4)}`")
    lines.append("")
    lines.append("## Criteria")
    lines.append("")
    lines.append(f"- |High-low bias| <= `{MAX_ABS_BIAS:.2f}`, high-low coverage >= `{MIN_COVERAGE:.2f}`")
    lines.append(f"- Curvature coverage >= `{MIN_COVERAGE:.2f}`")
    lines.append(f"- If true curvature = 0: significant-rate <= `{MAX_FALSE_POSITIVE_RATE:.2f}`")
    lines.append(f"- If true curvature != 0: significant-rate >= `{MIN_POWER:.2f}`")
    lines.append(f"- Spline high-low RMSE <= linear comparator RMSE + `{MAX_RMSE_MARGIN_VS_LINEAR:.2f}`")
    lines.append("")
    lines.append("## Detailed Rows")
    lines.append("")
    lines.append("| Scenario | Status | Valid reps | HL bias | HL cov | Curv bias | Curv cov | Curv sig-rate |")
    lines.append("|---|:---:|---:|---:|---:|---:|---:|---:|")
    for row in rows:
        m = row.get("metrics") or {}
        lines.append(
            f"| {row['scenario']} | {'YES' if row['pass'] else 'NO'} | {row['n_valid']} | "
            f"{_fmt(_to_float(m.get('high_low_bias')), 4)} | {_fmt(_to_float(m.get('high_low_coverage')), 3)} | "
            f"{_fmt(_to_float(m.get('curvature_bias')), 4)} | {_fmt(_to_float(m.get('curvature_coverage')), 3)} | "
            f"{_fmt(_to_float(m.get('curvature_significant_rate')), 3)} |"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Loop-7 simulation lab benchmark for nonlinear IPD interaction method")
    parser.add_argument("--seed", type=int, default=20260226, help="Deterministic seed")
    parser.add_argument(
        "--scenarios",
        nargs="*",
        default=DEFAULT_SCENARIOS,
        help="Simulation scenarios",
    )
    parser.add_argument("--replicates", type=int, default=40, help="Replicates per scenario")
    parser.add_argument("--min-valid-reps", type=int, default=MIN_VALID_REPLICATES, help="Minimum valid replicates per scenario")
    parser.add_argument(
        "--out-json",
        default=str(_repo_root() / "dev" / "benchmarks" / "latest_ipd_simulation_lab_benchmark.json"),
    )
    parser.add_argument(
        "--out-md",
        default=str(_repo_root() / "dev" / "benchmarks" / "latest_ipd_simulation_lab_benchmark.md"),
    )
    args = parser.parse_args()

    repo = _repo_root()
    app_path = repo / "ipd-meta-pro.html"
    if not app_path.exists():
        raise FileNotFoundError(f"App file not found: {app_path}")

    print("=" * 72)
    print("IPD Meta-Analysis Pro - Simulation Lab Benchmark (Loop 7)")
    print("=" * 72)
    print(f"App: {app_path}")
    print(f"Scenarios: {', '.join(args.scenarios)}")
    print(f"Replicates: {args.replicates}")
    print(f"Min valid reps: {args.min_valid_reps}")
    print()

    app_results = _run_app(
        app_path=app_path,
        scenarios=args.scenarios,
        replicates=args.replicates,
        seed=args.seed,
    )
    comparison = _compare(app_results, args.min_valid_reps)

    out_json = Path(args.out_json)
    out_md = Path(args.out_md)
    out_json.parent.mkdir(parents=True, exist_ok=True)

    full = {
        "app_build_id": _app_build_id(app_path),
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "seed": args.seed,
        "scenarios": args.scenarios,
        "replicates": args.replicates,
        "min_valid_reps": args.min_valid_reps,
        "app": app_results,
        "comparison": comparison,
    }
    out_json.write_text(json.dumps(full, indent=2), encoding="utf-8")
    _write_markdown(out_md, comparison, args.scenarios, args.replicates, args.seed, args.min_valid_reps)

    print("Benchmark complete.")
    print(f"JSON: {out_json}")
    print(f"Markdown: {out_md}")
    print(f"Overall pass rate: {_fmt(comparison['summary']['overall_pass_rate'], 3)}")
    print(f"Mean |high-low bias|: {_fmt(comparison['summary']['mean_high_low_bias_abs'], 4)}")
    print(f"Mean |curvature bias|: {_fmt(comparison['summary']['mean_curvature_bias_abs'], 4)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
