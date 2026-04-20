#!/usr/bin/env python3
"""Benchmark extended survival methods against R survival references."""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import statistics
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

from selenium.common.exceptions import JavascriptException
from selenium.webdriver.edge.options import Options

from edge_webdriver import create_edge_driver, load_local_app_with_ready_check


DEFAULT_SURVIVAL_DATASETS = ["survival", "ovarian_survival", "breast_endocrine", "hiv_survival"]
DEFAULT_LANDMARKS = [6, 12, 24]
DEFAULT_HORIZON = 60

AFT_EFFECT_TOL = 0.2
AFT_TIME_RATIO_TOL = 0.35
AFT_SCALE_TOL = 0.1

LANDMARK_HR_TOL = 0.15
LANDMARK_SE_TOL = 0.05


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _app_build_id(app_path: Path) -> str | None:
    try:
        text = app_path.read_text(encoding="utf-8")
    except Exception:
        return None
    match = re.search(r"const IPD_APP_BUILD_ID = '([^']+)'", text)
    return match.group(1) if match else None


def _default_rscript_paths() -> list[Path]:
    return [
        Path(r"C:\Program Files\R\R-4.5.2\bin\Rscript.exe"),
        Path(r"C:\Program Files\R\R-4.5.1\bin\Rscript.exe"),
        Path("/mnt/c/Program Files/R/R-4.5.2/bin/Rscript.exe"),
        Path("/mnt/c/Program Files/R/R-4.5.1/bin/Rscript.exe"),
    ]


def _find_rscript(explicit: str | None) -> Path:
    if explicit:
        path = Path(explicit)
        if path.exists():
            return path
        raise FileNotFoundError(f"Rscript not found: {path}")
    for candidate in _default_rscript_paths():
        if candidate.exists():
            return candidate
    raise FileNotFoundError("Rscript.exe not found in default Program Files R locations")


def _windows_temp_root() -> Path | None:
    candidates = [
        Path("/mnt/c/Users/user/AppData/Local/Temp"),
        Path("/mnt/c/Temp"),
    ]
    for candidate in candidates:
        if candidate.exists() and candidate.is_dir():
            return candidate
    return None


def _rscript_arg_path(path: Path, rscript: Path) -> str:
    if os.name != "nt" and rscript.suffix.lower() == ".exe":
        completed = subprocess.run(
            ["wslpath", "-w", str(path)],
            text=True,
            capture_output=True,
            check=False,
        )
        if completed.returncode == 0 and completed.stdout.strip():
            return completed.stdout.strip()
    return str(path)


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


def _abs_diff(a: float | None, b: float | None) -> float | None:
    if a is None or b is None:
        return None
    return abs(a - b)


def _run_app(
    app_path: Path,
    survival_datasets: list[str],
    landmarks: list[int],
    horizon: int,
    seed: int,
) -> dict[str, Any]:
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")

    driver = create_edge_driver(options)
    out: dict[str, Any] = {"survival": {}}

    try:
        load_local_app_with_ready_check(
            driver,
            app_path,
            required_functions=("loadExampleData", "runAnalysis"),
            required_objects=("APP",),
            ready_timeout=20,
        )
        time.sleep(0.5)

        ready = driver.execute_script(
            """
            return (
              typeof loadExampleData === 'function' &&
              typeof fitAFTModel === 'function' &&
              typeof landmarkAnalysis === 'function'
            );
            """
        )
        if not ready:
            raise RuntimeError("Extended survival benchmark functions are not available in page context")

        for dataset in survival_datasets:
            driver.execute_script(
                """
                if (typeof SeededRNG !== 'undefined') SeededRNG.patchMathRandom(arguments[1]);
                loadExampleData(arguments[0]);
                if (typeof SeededRNG !== 'undefined') SeededRNG.restoreMathRandom();
                """,
                dataset,
                seed,
            )
            time.sleep(0.35)
            try:
                payload = driver.execute_script(
                    """
                    const rows = window.currentData || APP.data || [];
                    const aft = fitAFTModel(rows, 'weibull');
                    const landmark = landmarkAnalysis(rows, arguments[0], arguments[1]);
                    return {
                      n: rows.length,
                      n_studies: [...new Set(rows.map(r => r.study_id))].length,
                      app: {
                        aft: {
                          treatment_effect: aft ? aft.treatmentEffect : null,
                          time_ratio: aft ? aft.timeRatio : null,
                          scale: aft ? aft.scale : null,
                          ci_lower: aft ? aft.ci_lower : null,
                          ci_upper: aft ? aft.ci_upper : null,
                          error: aft && aft.error ? aft.error : null
                        },
                        landmark: landmark && Array.isArray(landmark.landmarks)
                          ? landmark.landmarks.map(r => ({
                              landmark: r.landmark,
                              hr: r.hr,
                              se: r.se,
                              ci_lower: r.ci_lower,
                              ci_upper: r.ci_upper,
                              n_at_risk: r.nAtRisk,
                              error: r.error || null
                            }))
                          : []
                      },
                      rows: rows.map(r => ({
                        study_id: r.study_id,
                        treatment: Number(r.treatment),
                        time_months: Number(r.time_months),
                        event: Number(r.event)
                      }))
                    };
                    """,
                    landmarks,
                    horizon,
                )
            except JavascriptException as exc:
                payload = {
                    "n": 0,
                    "n_studies": 0,
                    "app": {
                        "aft": {
                            "treatment_effect": None,
                            "time_ratio": None,
                            "scale": None,
                            "ci_lower": None,
                            "ci_upper": None,
                            "error": str(exc),
                        },
                        "landmark": [],
                    },
                    "rows": [],
                }
            out["survival"][dataset] = payload
    finally:
        driver.quit()

    return out


def _run_r_reference(
    rscript: Path,
    app_results: dict[str, Any],
    landmarks: list[int],
    horizon: int,
) -> dict[str, Any]:
    payload = {
        "survival": {
            ds: {
                "rows": data["rows"],
            }
            for ds, data in app_results["survival"].items()
        },
        "landmarks": landmarks,
        "horizon": horizon,
    }

    temp_root = _windows_temp_root()
    with tempfile.TemporaryDirectory(
        prefix="ipd_ext_surv_r_",
        dir=str(temp_root) if temp_root else None,
    ) as td:
        tmp = Path(td)
        input_json = tmp / "input.json"
        output_json = tmp / "output.json"
        r_code = tmp / "benchmark.R"

        input_json.write_text(json.dumps(payload), encoding="utf-8")
        r_code.write_text(
            r"""
suppressPackageStartupMessages(library(jsonlite))
suppressPackageStartupMessages(library(survival))

args <- commandArgs(trailingOnly = TRUE)
inp <- fromJSON(args[1], simplifyVector = FALSE)
out <- list(survival = list())

for (ds_name in names(inp$survival)) {
  rows <- inp$survival[[ds_name]]$rows
  df <- as.data.frame(do.call(rbind, lapply(rows, as.data.frame)))
  if (nrow(df) == 0) {
    out$survival[[ds_name]] <- list(aft = list(error = "No rows provided"), landmark = list())
    next
  }

  df$time_months <- pmax(as.numeric(df$time_months), 1e-6)
  df$event <- as.numeric(df$event)
  df$treatment <- as.numeric(df$treatment)
  df$study_id <- as.factor(df$study_id)
  df <- df[is.finite(df$time_months) & is.finite(df$event) & is.finite(df$treatment), ]

  aft_fit <- tryCatch(
    survreg(Surv(time_months, event) ~ treatment, data = df, dist = "weibull"),
    error = function(e) e
  )
  if (inherits(aft_fit, "error")) {
    aft <- list(error = as.character(aft_fit$message))
  } else {
    aft_summary <- summary(aft_fit)
    aft <- list(
      treatment_effect = as.numeric(coef(aft_fit)["treatment"]),
      time_ratio = as.numeric(exp(coef(aft_fit)["treatment"])),
      scale = as.numeric(aft_fit$scale),
      se = as.numeric(aft_summary$table["treatment", "Std. Error"])
    )
  }

  landmark <- list()
  for (tLM in unlist(inp$landmarks)) {
    at_risk <- df[df$time_months >= tLM, , drop = FALSE]
    key <- as.character(tLM)
    if (nrow(at_risk) < 10) {
      landmark[[key]] <- list(landmark = as.numeric(tLM), error = "Insufficient patients at risk", n_at_risk = nrow(at_risk))
      next
    }

    at_risk$lm_time <- pmax(at_risk$time_months - tLM, 1e-6)
    at_risk$lm_event <- ifelse(at_risk$event == 1 & at_risk$time_months <= tLM + inp$horizon, 1, 0)

    fit <- tryCatch(
      coxph(Surv(lm_time, lm_event) ~ treatment, data = at_risk, ties = "efron"),
      error = function(e) e
    )
    if (inherits(fit, "error")) {
      landmark[[key]] <- list(landmark = as.numeric(tLM), error = as.character(fit$message), n_at_risk = nrow(at_risk))
      next
    }

    sm <- summary(fit)
    landmark[[key]] <- list(
      landmark = as.numeric(tLM),
      hr = as.numeric(exp(coef(fit)["treatment"])),
      se = as.numeric(sm$coefficients["treatment", "se(coef)"]),
      ci_lower = as.numeric(sm$conf.int["treatment", "lower .95"]),
      ci_upper = as.numeric(sm$conf.int["treatment", "upper .95"]),
      n_at_risk = nrow(at_risk)
    )
  }

  out$survival[[ds_name]] <- list(aft = aft, landmark = landmark)
}

write(toJSON(out, auto_unbox = TRUE, digits = 16), args[2])
            """.strip()
            + "\n",
            encoding="utf-8",
        )

        completed = subprocess.run(
            [
                str(rscript),
                _rscript_arg_path(r_code, rscript),
                _rscript_arg_path(input_json, rscript),
                _rscript_arg_path(output_json, rscript),
            ],
            text=True,
            capture_output=True,
            check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError(
                "R extended-survival benchmark failed\n"
                f"STDOUT:\n{completed.stdout}\n\nSTDERR:\n{completed.stderr}"
            )
        return json.loads(output_json.read_text(encoding="utf-8"))


def _compare(app_results: dict[str, Any], r_results: dict[str, Any]) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    aft_rows: list[dict[str, Any]] = []
    landmark_rows: list[dict[str, Any]] = []

    for dataset, ds in app_results["survival"].items():
        app = ds["app"]
        ref = r_results["survival"].get(dataset, {})

        aft_row = {
            "track": "aft_weibull",
            "dataset": dataset,
            "app": app.get("aft") or {},
            "r": ref.get("aft") or {},
            "diff": {
                "treatment_effect_abs": _abs_diff(
                    _to_float((app.get("aft") or {}).get("treatment_effect")),
                    _to_float((ref.get("aft") or {}).get("treatment_effect")),
                ),
                "time_ratio_abs": _abs_diff(
                    _to_float((app.get("aft") or {}).get("time_ratio")),
                    _to_float((ref.get("aft") or {}).get("time_ratio")),
                ),
                "scale_abs": _abs_diff(
                    _to_float((app.get("aft") or {}).get("scale")),
                    _to_float((ref.get("aft") or {}).get("scale")),
                ),
            },
        }
        aft_row["pass"] = bool(
            aft_row["diff"]["treatment_effect_abs"] is not None
            and aft_row["diff"]["treatment_effect_abs"] <= AFT_EFFECT_TOL
            and aft_row["diff"]["time_ratio_abs"] is not None
            and aft_row["diff"]["time_ratio_abs"] <= AFT_TIME_RATIO_TOL
            and aft_row["diff"]["scale_abs"] is not None
            and aft_row["diff"]["scale_abs"] <= AFT_SCALE_TOL
            and not (app.get("aft") or {}).get("error")
            and not (ref.get("aft") or {}).get("error")
        )
        aft_rows.append(aft_row)
        rows.append(aft_row)

        app_landmarks = {int(r["landmark"]): r for r in (app.get("landmark") or []) if r.get("landmark") is not None}
        ref_landmarks = {
            int(key): value
            for key, value in (ref.get("landmark") or {}).items()
            if value and value.get("landmark") is not None
        }
        for landmark in sorted(set(app_landmarks.keys()) | set(ref_landmarks.keys())):
            app_row = app_landmarks.get(landmark, {})
            ref_row = ref_landmarks.get(landmark, {})
            row = {
                "track": "landmark",
                "dataset": dataset,
                "landmark": landmark,
                "app": app_row,
                "r": ref_row,
                "diff": {
                    "hr_abs": _abs_diff(_to_float(app_row.get("hr")), _to_float(ref_row.get("hr"))),
                    "se_abs": _abs_diff(_to_float(app_row.get("se")), _to_float(ref_row.get("se"))),
                },
            }
            row["pass"] = bool(
                row["diff"]["hr_abs"] is not None
                and row["diff"]["hr_abs"] <= LANDMARK_HR_TOL
                and row["diff"]["se_abs"] is not None
                and row["diff"]["se_abs"] <= LANDMARK_SE_TOL
                and not app_row.get("error")
                and not ref_row.get("error")
            )
            landmark_rows.append(row)
            rows.append(row)

    summary = {
        "rows": len(rows),
        "overall_pass_rate": (sum(1 for r in rows if r["pass"]) / len(rows)) if rows else None,
        "aft_pass_rate": (sum(1 for r in aft_rows if r["pass"]) / len(aft_rows)) if aft_rows else None,
        "landmark_pass_rate": (
            sum(1 for r in landmark_rows if r["pass"]) / len(landmark_rows)
            if landmark_rows
            else None
        ),
        "max_abs_diff": {
            "aft_treatment_effect": max(
                (r["diff"]["treatment_effect_abs"] for r in aft_rows if r["diff"]["treatment_effect_abs"] is not None),
                default=None,
            ),
            "landmark_hr": max(
                (r["diff"]["hr_abs"] for r in landmark_rows if r["diff"]["hr_abs"] is not None),
                default=None,
            ),
        },
        "mean_abs_diff": {
            "aft_treatment_effect": (
                statistics.mean([r["diff"]["treatment_effect_abs"] for r in aft_rows if r["diff"]["treatment_effect_abs"] is not None])
                if any(r["diff"]["treatment_effect_abs"] is not None for r in aft_rows)
                else None
            ),
            "landmark_hr": (
                statistics.mean([r["diff"]["hr_abs"] for r in landmark_rows if r["diff"]["hr_abs"] is not None])
                if any(r["diff"]["hr_abs"] is not None for r in landmark_rows)
                else None
            ),
        },
    }
    return {"rows": rows, "summary": summary}


def _fmt(v: float | None, digits: int = 6) -> str:
    if v is None:
        return "NA"
    return f"{v:.{digits}f}"


def _write_markdown(
    path: Path,
    comparison: dict[str, Any],
    survival_datasets: list[str],
    landmarks: list[int],
    horizon: int,
    seed: int,
) -> None:
    summary = comparison["summary"]
    rows = comparison["rows"]
    lines = [
        "# Extended Survival Benchmark vs R",
        "",
        f"- Survival datasets: `{', '.join(survival_datasets)}`",
        f"- Landmarks: `{', '.join(str(v) for v in landmarks)}`",
        f"- Horizon: `{horizon}`",
        f"- Seed: `{seed}`",
        f"- Overall pass rate: `{_fmt(summary.get('overall_pass_rate'), 3)}`",
        f"- AFT pass rate: `{_fmt(summary.get('aft_pass_rate'), 3)}`",
        f"- Landmark pass rate: `{_fmt(summary.get('landmark_pass_rate'), 3)}`",
        "",
        "## AFT Tolerances",
        "",
        f"- |treatment effect diff| <= `{AFT_EFFECT_TOL}`",
        f"- |time-ratio diff| <= `{AFT_TIME_RATIO_TOL}`",
        f"- |scale diff| <= `{AFT_SCALE_TOL}`",
        "",
        "## Landmark Tolerances",
        "",
        f"- |HR diff| <= `{LANDMARK_HR_TOL}`",
        f"- |SE diff| <= `{LANDMARK_SE_TOL}`",
        "",
        "## Rows",
        "",
        "| Track | Dataset | Landmark | Diff 1 | Diff 2 | Pass |",
        "|---|---|---:|---:|---:|:---:|",
    ]

    for row in rows:
        if row["track"] == "aft_weibull":
            lines.append(
                f"| aft_weibull | {row['dataset']} | - | "
                f"{_fmt(row['diff'].get('treatment_effect_abs'))} | "
                f"{_fmt(row['diff'].get('time_ratio_abs'))} | "
                f"{'YES' if row['pass'] else 'NO'} |"
            )
        else:
            lines.append(
                f"| landmark | {row['dataset']} | {row.get('landmark')} | "
                f"{_fmt(row['diff'].get('hr_abs'))} | "
                f"{_fmt(row['diff'].get('se_abs'))} | "
                f"{'YES' if row['pass'] else 'NO'} |"
            )

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark extended survival methods against R")
    parser.add_argument(
        "--app",
        type=Path,
        default=_repo_root() / "ipd-meta-pro.html",
        help="Path to ipd-meta-pro.html",
    )
    parser.add_argument("--rscript", type=str, default=None, help="Path to Rscript executable")
    parser.add_argument(
        "--survival-datasets",
        nargs="+",
        default=DEFAULT_SURVIVAL_DATASETS,
        help="Survival example datasets to benchmark",
    )
    parser.add_argument(
        "--landmarks",
        nargs="+",
        type=int,
        default=DEFAULT_LANDMARKS,
        help="Landmark times to benchmark",
    )
    parser.add_argument(
        "--horizon",
        type=int,
        default=DEFAULT_HORIZON,
        help="Landmark prediction horizon",
    )
    parser.add_argument("--seed", type=int, default=42, help="Seed for deterministic app data generation")
    parser.add_argument(
        "--output-json",
        type=Path,
        default=_repo_root() / "dev" / "benchmarks" / "latest_extended_survival_r_benchmark.json",
        help="Output JSON path",
    )
    parser.add_argument(
        "--output-md",
        type=Path,
        default=_repo_root() / "dev" / "benchmarks" / "latest_extended_survival_r_benchmark.md",
        help="Output Markdown path",
    )
    args = parser.parse_args()

    rscript = _find_rscript(args.rscript)
    app_results = _run_app(args.app, args.survival_datasets, args.landmarks, args.horizon, args.seed)
    r_results = _run_r_reference(rscript, app_results, args.landmarks, args.horizon)
    comparison = _compare(app_results, r_results)

    output = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "app_path": str(args.app),
        "app_build_id": _app_build_id(args.app),
        "rscript": str(rscript),
        "seed": args.seed,
        "survival_datasets": args.survival_datasets,
        "landmarks": args.landmarks,
        "horizon": args.horizon,
        "tolerances": {
            "aft_treatment_effect_abs": AFT_EFFECT_TOL,
            "aft_time_ratio_abs": AFT_TIME_RATIO_TOL,
            "aft_scale_abs": AFT_SCALE_TOL,
            "landmark_hr_abs": LANDMARK_HR_TOL,
            "landmark_se_abs": LANDMARK_SE_TOL,
        },
        "app": app_results,
        "r": r_results,
        "comparison": comparison,
        "summary": comparison["summary"],
    }

    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(output, indent=2), encoding="utf-8")
    _write_markdown(args.output_md, comparison, args.survival_datasets, args.landmarks, args.horizon, args.seed)

    print("=" * 72)
    print("IPD Meta-Analysis Pro - Extended Survival Benchmark")
    print("=" * 72)
    print(f"App: {args.app}")
    print(f"Rscript: {rscript}")
    print(f"Survival datasets: {', '.join(args.survival_datasets)}")
    print(f"Landmarks: {', '.join(str(v) for v in args.landmarks)}")
    print(f"Horizon: {args.horizon}")
    print()
    print("Benchmark complete.")
    print(f"JSON: {args.output_json}")
    print(f"Markdown: {args.output_md}")
    print(f"Overall pass rate: {_fmt(output['summary'].get('overall_pass_rate'), 3)}")
    print(f"AFT pass rate: {_fmt(output['summary'].get('aft_pass_rate'), 3)}")
    print(f"Landmark pass rate: {_fmt(output['summary'].get('landmark_pass_rate'), 3)}")


if __name__ == "__main__":
    main()
