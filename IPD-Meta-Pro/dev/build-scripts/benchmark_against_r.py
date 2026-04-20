#!/usr/bin/env python3
"""Benchmark IPD Meta-Analysis Pro against R metafor/meta using raw patient rows."""

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

from selenium import webdriver
from selenium.common.exceptions import JavascriptException
from selenium.webdriver.edge.options import Options

from edge_webdriver import create_edge_driver, load_local_app_with_ready_check


DEFAULT_DATASETS = [
    "survival",
    "binary",
    "continuous",
    "ovarian_survival",
    "statin_cvd",
    "hiv_survival",
]
METHODS = ["FE", "DL", "REML", "PM", "SJ", "HE", "ML"]


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


def _run_app(app_path: Path, datasets: list[str], seed: int) -> dict[str, Any]:
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")

    driver = create_edge_driver(options)
    results: dict[str, Any] = {"datasets": {}}

    try:
        load_local_app_with_ready_check(
            driver,
            app_path,
            required_functions=("loadExampleData", "runAnalysis"),
            required_objects=("APP", "MetaAnalysis"),
            ready_timeout=20,
        )
        time.sleep(0.5)

        for dataset in datasets:
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

            if dataset in {"survival", "ovarian_survival", "breast_endocrine", "hiv_survival"}:
                outcome_kind = "survival"
                time_var = "time_months"
                event_var = "event"
            elif dataset in {"binary", "statin_cvd", "covid_treatments"}:
                outcome_kind = "binary"
                time_var = None
                event_var = "mace_event" if dataset in {"binary", "statin_cvd"} else "mortality_28d"
            else:
                outcome_kind = "continuous"
                time_var = None
                event_var = "hamd_change"

            driver.execute_script(
                """
                document.getElementById('outcomeType').value = arguments[0];
                if (typeof updateOutcomeVars === 'function') updateOutcomeVars();
                document.getElementById('varStudy').value = 'study_id';
                document.getElementById('varTreatment').value = 'treatment';
                if (arguments[0] === 'survival') {
                  if (typeof ipd80SetSelectValue === 'function') {
                    ipd80SetSelectValue('varTime', 'time_months');
                    ipd80SetSelectValue('varEvent', 'event');
                  } else {
                    document.getElementById('varTime').value = 'time_months';
                    document.getElementById('varEvent').value = 'event';
                  }
                } else if (arguments[0] === 'binary') {
                  if (arguments[1] === 'binary' || arguments[1] === 'statin_cvd') {
                    if (typeof ipd80SetSelectValue === 'function') {
                      ipd80SetSelectValue('varEvent', 'mace_event');
                    } else {
                      document.getElementById('varEvent').value = 'mace_event';
                    }
                  } else {
                    if (typeof ipd80SetSelectValue === 'function') {
                      ipd80SetSelectValue('varEvent', 'mortality_28d');
                    } else {
                      document.getElementById('varEvent').value = 'mortality_28d';
                    }
                  }
                } else {
                  if (typeof ipd80SetSelectValue === 'function') {
                    ipd80SetSelectValue('varEvent', 'hamd_change');
                  } else {
                    document.getElementById('varEvent').value = 'hamd_change';
                  }
                }
                """,
                outcome_kind,
                dataset,
            )
            time.sleep(0.1)

            raw_rows = driver.execute_script(
                """
                const timeVar = arguments[0];
                const eventVar = arguments[1];
                const rows = window.currentData || APP.data || [];
                return rows.map(r => ({
                  study_id: r.study_id,
                  treatment: Number(r.treatment),
                  time: timeVar ? Number(r[timeVar]) : null,
                  event: eventVar ? Number(r[eventVar]) : null
                }));
                """,
                time_var,
                event_var,
            )

            method_results: dict[str, Any] = {}
            study_vectors: dict[str, Any] | None = None

            for method in METHODS:
                try:
                    primary = driver.execute_script(
                    """
                    document.getElementById('reMethod').value = arguments[0];
                    document.getElementById('useHKSJ').checked = false;
                    const t0 = performance.now();
                    runAnalysis();
                    const t1 = performance.now();
                    const pooled = (APP.results && APP.results.pooled) ? APP.results.pooled : {};
                    const studies = (APP.results && APP.results.studies) ? APP.results.studies : [];
                    const pooledEffect = Number.isFinite(pooled.pooled) ? pooled.pooled : pooled.effect;
                    return {
                      pooled: pooledEffect,
                      se: pooled.se,
                      tau2: pooled.tau2,
                      i2: pooled.I2,
                      q: pooled.Q,
                      k: studies.length,
                      effects: studies.map(s => s.effect),
                      variances: studies.map(s => s.variance),
                      runtime_ms: (t1 - t0)
                    };
                    """,
                    method,
                )

                    repeat = driver.execute_script(
                    """
                    document.getElementById('reMethod').value = arguments[0];
                    document.getElementById('useHKSJ').checked = false;
                    runAnalysis();
                    const pooled = (APP.results && APP.results.pooled) ? APP.results.pooled : {};
                    const studies = (APP.results && APP.results.studies) ? APP.results.studies : [];
                    const pooledEffect = Number.isFinite(pooled.pooled) ? pooled.pooled : pooled.effect;
                    return {
                      pooled: pooledEffect,
                      se: pooled.se,
                      tau2: pooled.tau2,
                      i2: pooled.I2,
                      q: pooled.Q,
                      k: studies.length
                    };
                    """,
                    method,
                )
                except JavascriptException as exc:
                    method_results[method] = {
                        "error": str(exc),
                        "pooled": None,
                        "se": None,
                        "tau2": None,
                        "i2": None,
                        "q": None,
                        "k": 0,
                        "runtime_ms": None,
                        "repeat_diff": {"pooled": None, "se": None, "tau2": None, "i2": None},
                    }
                    continue

                method_results[method] = {
                    "pooled": _to_float(primary.get("pooled")),
                    "se": _to_float(primary.get("se")),
                    "tau2": _to_float(primary.get("tau2")),
                    "i2": _to_float(primary.get("i2")),
                    "q": _to_float(primary.get("q")),
                    "k": int(primary.get("k", 0)),
                    "runtime_ms": _to_float(primary.get("runtime_ms")),
                    "repeat_diff": {
                        "pooled": _abs_diff(_to_float(primary.get("pooled")), _to_float(repeat.get("pooled"))),
                        "se": _abs_diff(_to_float(primary.get("se")), _to_float(repeat.get("se"))),
                        "tau2": _abs_diff(_to_float(primary.get("tau2")), _to_float(repeat.get("tau2"))),
                        "i2": _abs_diff(_to_float(primary.get("i2")), _to_float(repeat.get("i2"))),
                    },
                }

                if study_vectors is None:
                    study_vectors = {
                        "effects": [_to_float(v) for v in primary.get("effects", [])],
                        "variances": [_to_float(v) for v in primary.get("variances", [])],
                    }

            results["datasets"][dataset] = {
                "outcome_kind": outcome_kind,
                "time_var": time_var,
                "event_var": event_var,
                "rows": raw_rows,
                "study_vectors": study_vectors or {"effects": [], "variances": []},
                "methods": method_results,
            }
    finally:
        driver.quit()

    return results


def _run_r_reference(
    rscript: Path, app_results: dict[str, Any], methods: list[str]
) -> dict[str, Any]:
    payload = {
        "methods": methods,
        "datasets": {
            ds: {
                "outcome_kind": data["outcome_kind"],
                "time_var": data["time_var"],
                "event_var": data["event_var"],
                "rows": data["rows"],
            }
            for ds, data in app_results["datasets"].items()
        },
    }

    temp_root = _windows_temp_root()
    with tempfile.TemporaryDirectory(
        prefix="ipd_r_bench_",
        dir=str(temp_root) if temp_root else None,
    ) as td:
        tmp = Path(td)
        input_json = tmp / "input.json"
        output_json = tmp / "output.json"
        r_code = tmp / "benchmark.R"

        input_json.write_text(json.dumps(payload), encoding="utf-8")
        r_code.write_text(
            r"""
library(jsonlite)
library(metafor)
library(meta)
library(survival)

args <- commandArgs(trailingOnly = TRUE)
inp <- fromJSON(args[1], simplifyVector = FALSE)
methods <- unlist(inp$methods)

extract_meta_fixed <- function(fit) {
  te <- if (!is.null(fit$TE.common)) fit$TE.common else fit$TE.fixed
  se <- if (!is.null(fit$seTE.common)) fit$seTE.common else fit$seTE.fixed
  list(pooled = te, se = se, tau2 = 0, i2 = if (!is.null(fit$I2)) fit$I2 else NA, q = if (!is.null(fit$Q)) fit$Q else NA)
}

extract_meta_random <- function(fit) {
  list(
    pooled = fit$TE.random,
    se = fit$seTE.random,
    tau2 = if (!is.null(fit$tau2)) fit$tau2 else NA,
    i2 = if (!is.null(fit$I2)) fit$I2 else NA,
    q = if (!is.null(fit$Q)) fit$Q else NA
  )
}

build_study_vectors <- function(ds) {
  rows <- ds$rows
  if (length(rows) == 0) {
    return(list(yi = numeric(), vi = numeric()))
  }
  row_to_df <- function(row) {
    data.frame(
      study_id = if (!is.null(row$study_id)) as.character(row$study_id) else NA_character_,
      treatment = if (!is.null(row$treatment)) as.numeric(row$treatment) else NA_real_,
      time = if (!is.null(row$time)) as.numeric(row$time) else NA_real_,
      event = if (!is.null(row$event)) as.numeric(row$event) else NA_real_,
      stringsAsFactors = FALSE
    )
  }
  df <- do.call(rbind, lapply(rows, row_to_df))
  df$study_id <- as.character(df$study_id)
  df$treatment <- as.numeric(df$treatment)
  if ("time" %in% names(df)) df$time <- as.numeric(df$time)
  if ("event" %in% names(df)) df$event <- as.numeric(df$event)
  outcome_kind <- ds$outcome_kind

  yi <- c()
  vi <- c()
  for (sid in unique(df$study_id)) {
    sdf <- df[df$study_id == sid, , drop = FALSE]
    treat1 <- sdf[sdf$treatment == 1, , drop = FALSE]
    treat0 <- sdf[sdf$treatment == 0, , drop = FALSE]
    if (outcome_kind == "survival") {
      fit <- tryCatch(
        coxph(Surv(time, event) ~ treatment, data = sdf),
        error = function(e) e
      )
      if (inherits(fit, "error")) {
        next
      }
      sm <- summary(fit)
      coef_name <- if ("treatment" %in% rownames(sm$coefficients)) "treatment" else rownames(sm$coefficients)[1]
      effect <- as.numeric(coef(fit)[coef_name])
      se <- as.numeric(sm$coefficients[coef_name, "se(coef)"])
      if (!is.finite(effect) || !is.finite(se) || se <= 0) {
        next
      }
      yi <- c(yi, effect)
      vi <- c(vi, se * se)
    } else if (outcome_kind == "binary") {
      a <- sum(treat1$event == 1, na.rm = TRUE)
      b <- nrow(treat1) - a
      c_val <- sum(treat0$event == 1, na.rm = TRUE)
      d <- nrow(treat0) - c_val
      effect <- log((a + 0.5) * (d + 0.5) / ((b + 0.5) * (c_val + 0.5)))
      variance <- 1 / (a + 0.5) + 1 / (b + 0.5) + 1 / (c_val + 0.5) + 1 / (d + 0.5)
      yi <- c(yi, effect)
      vi <- c(vi, variance)
    } else {
      outcomes1 <- as.numeric(treat1$event)
      outcomes0 <- as.numeric(treat0$event)
      outcomes1 <- outcomes1[is.finite(outcomes1)]
      outcomes0 <- outcomes0[is.finite(outcomes0)]
      if (length(outcomes1) < 2 || length(outcomes0) < 2) {
        yi <- c(yi, 0)
        vi <- c(vi, 1e6)
      } else {
        effect <- mean(outcomes1) - mean(outcomes0)
        variance <- stats::var(outcomes1) / length(outcomes1) + stats::var(outcomes0) / length(outcomes0)
        yi <- c(yi, effect)
        vi <- c(vi, variance)
      }
    }
  }
  list(yi = yi, vi = vi)
}

out <- list(metafor = list(), meta = list())

for (ds_name in names(inp$datasets)) {
  ds <- inp$datasets[[ds_name]]
  vectors <- build_study_vectors(ds)
  yi <- as.numeric(vectors$yi)
  vi <- as.numeric(vectors$vi)
  se <- sqrt(vi)

  out$metafor[[ds_name]] <- list()
  out$meta[[ds_name]] <- list()

  for (m in methods) {
    fit_mf <- tryCatch(
      rma(yi = yi, vi = vi, method = m),
      error = function(e) e
    )
    if (inherits(fit_mf, "error")) {
      out$metafor[[ds_name]][[m]] <- list(error = as.character(fit_mf$message))
    } else {
      out$metafor[[ds_name]][[m]] <- list(
        pooled = as.numeric(coef(fit_mf)),
        se = fit_mf$se,
        tau2 = fit_mf$tau2,
        i2 = fit_mf$I2,
        q = fit_mf$QE
      )
    }

    fit_meta <- tryCatch(
      {
        if (m == "FE") {
          metagen(TE = yi, seTE = se, sm = "GEN", common = TRUE, random = FALSE, hakn = FALSE)
        } else {
          metagen(TE = yi, seTE = se, sm = "GEN", common = FALSE, random = TRUE, method.tau = m, hakn = FALSE)
        }
      },
      error = function(e) e
    )

    if (inherits(fit_meta, "error")) {
      out$meta[[ds_name]][[m]] <- list(error = as.character(fit_meta$message))
    } else if (m == "FE") {
      out$meta[[ds_name]][[m]] <- extract_meta_fixed(fit_meta)
    } else {
      out$meta[[ds_name]][[m]] <- extract_meta_random(fit_meta)
    }
  }
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
                "R benchmark failed\n"
                f"STDOUT:\n{completed.stdout}\n\nSTDERR:\n{completed.stderr}"
            )
        return json.loads(output_json.read_text(encoding="utf-8"))


def _compare(app_results: dict[str, Any], r_results: dict[str, Any]) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    metric_keys = ("pooled", "se", "tau2", "i2")

    for dataset, ds in app_results["datasets"].items():
        for method, app_vals in ds["methods"].items():
            mf_vals = r_results["metafor"].get(dataset, {}).get(method, {})
            meta_vals = r_results["meta"].get(dataset, {}).get(method, {})

            row: dict[str, Any] = {
                "dataset": dataset,
                "method": method,
                "app": app_vals,
                "metafor": mf_vals,
                "meta": meta_vals,
                "diff_metafor": {},
                "diff_meta": {},
            }

            for key in metric_keys:
                row["diff_metafor"][key] = _abs_diff(
                    _to_float(app_vals.get(key)), _to_float(mf_vals.get(key))
                )
                row["diff_meta"][key] = _abs_diff(
                    _to_float(app_vals.get(key)), _to_float(meta_vals.get(key))
                )

            has_all_metrics = all(
                row["diff_metafor"][k] is not None for k in ("pooled", "se", "tau2", "i2")
            )
            row["pass_metafor"] = bool(
                has_all_metrics
                and row["diff_metafor"]["pooled"] <= 5e-3
                and row["diff_metafor"]["se"] <= 5e-3
                and row["diff_metafor"]["tau2"] <= 1e-2
                and row["diff_metafor"]["i2"] <= 2.0
            )
            rows.append(row)

    by_method: dict[str, dict[str, Any]] = {}
    for method in METHODS:
        method_rows = [r for r in rows if r["method"] == method]
        pooled_diffs = [r["diff_metafor"]["pooled"] for r in method_rows if r["diff_metafor"]["pooled"] is not None]
        se_diffs = [r["diff_metafor"]["se"] for r in method_rows if r["diff_metafor"]["se"] is not None]
        tau2_diffs = [r["diff_metafor"]["tau2"] for r in method_rows if r["diff_metafor"]["tau2"] is not None]
        i2_diffs = [r["diff_metafor"]["i2"] for r in method_rows if r["diff_metafor"]["i2"] is not None]
        passes = [r["pass_metafor"] for r in method_rows]

        by_method[method] = {
            "rows": len(method_rows),
            "pass_rate": (sum(1 for v in passes if v) / len(passes)) if passes else None,
            "mean_abs_diff": {
                "pooled": statistics.mean(pooled_diffs) if pooled_diffs else None,
                "se": statistics.mean(se_diffs) if se_diffs else None,
                "tau2": statistics.mean(tau2_diffs) if tau2_diffs else None,
                "i2": statistics.mean(i2_diffs) if i2_diffs else None,
            },
            "max_abs_diff": {
                "pooled": max(pooled_diffs) if pooled_diffs else None,
                "se": max(se_diffs) if se_diffs else None,
                "tau2": max(tau2_diffs) if tau2_diffs else None,
                "i2": max(i2_diffs) if i2_diffs else None,
            },
        }

    reproducibility = []
    runtimes = []
    for dataset_data in app_results["datasets"].values():
        for method_data in dataset_data["methods"].values():
            repeat = method_data.get("repeat_diff", {})
            reproducibility.extend(v for v in repeat.values() if isinstance(v, (int, float)))
            runtime = method_data.get("runtime_ms")
            if isinstance(runtime, (int, float)):
                runtimes.append(runtime)

    summary = {
        "rows": len(rows),
        "overall_pass_rate_metafor": (
            sum(1 for r in rows if r["pass_metafor"]) / len(rows) if rows else None
        ),
        "max_repeat_diff": max(reproducibility) if reproducibility else None,
        "runtime_ms": {
            "median": statistics.median(runtimes) if runtimes else None,
            "p95": statistics.quantiles(runtimes, n=20)[18] if len(runtimes) >= 20 else (max(runtimes) if runtimes else None),
            "max": max(runtimes) if runtimes else None,
        },
    }

    return {"rows": rows, "by_method": by_method, "summary": summary}


def _fmt(v: float | None, digits: int = 6) -> str:
    if v is None:
        return "NA"
    return f"{v:.{digits}f}"


def _write_markdown(path: Path, comparison: dict[str, Any], datasets: list[str], seed: int) -> None:
    lines: list[str] = []
    lines.append("# IPD Meta-Analysis Pro vs R Benchmark")
    lines.append("")
    lines.append(f"- Seed: `{seed}`")
    lines.append(f"- Datasets: `{', '.join(datasets)}`")
    lines.append(f"- Methods: `{', '.join(METHODS)}`")
    lines.append("")

    summary = comparison["summary"]
    lines.append("## Summary")
    lines.append("")
    lines.append(f"- Rows compared: `{summary['rows']}`")
    lines.append(f"- Overall pass rate vs `metafor`: `{_fmt(summary['overall_pass_rate_metafor'], 3)}`")
    lines.append(f"- Max repeat diff (reproducibility): `{_fmt(summary['max_repeat_diff'], 12)}`")
    lines.append(f"- Median runtime per run (ms): `{_fmt(summary['runtime_ms']['median'], 2)}`")
    lines.append(f"- P95 runtime per run (ms): `{_fmt(summary['runtime_ms']['p95'], 2)}`")
    lines.append("")

    lines.append("## By Method (vs `metafor`)")
    lines.append("")
    lines.append("| Method | Pass Rate | Mean |tau2| diff | Max |tau2| diff | Mean |I2| diff |")
    lines.append("|---|---:|---:|---:|---:|")
    for method in METHODS:
        row = comparison["by_method"][method]
        mean_tau2 = row["mean_abs_diff"]["tau2"]
        max_tau2 = row["max_abs_diff"]["tau2"]
        mean_i2 = row["mean_abs_diff"]["i2"]
        lines.append(
            f"| {method} | {_fmt(row['pass_rate'], 3)} | {_fmt(mean_tau2, 6)} | {_fmt(max_tau2, 6)} | {_fmt(mean_i2, 4)} |"
        )
    lines.append("")

    lines.append("## Detailed Rows")
    lines.append("")
    lines.append("| Dataset | Method | |pooled diff| | |tau2 diff| | |I2 diff| | Pass |")
    lines.append("|---|---|---:|---:|---:|:---:|")
    for row in comparison["rows"]:
        lines.append(
            f"| {row['dataset']} | {row['method']} | {_fmt(row['diff_metafor']['pooled'], 6)} | "
            f"{_fmt(row['diff_metafor']['tau2'], 6)} | {_fmt(row['diff_metafor']['i2'], 4)} | "
            f"{'YES' if row['pass_metafor'] else 'NO'} |"
        )

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark IPD Meta-Analysis Pro against R packages")
    parser.add_argument("--rscript", default=None, help="Path to Rscript.exe")
    parser.add_argument("--seed", type=int, default=12345, help="Seed for deterministic example data")
    parser.add_argument(
        "--datasets",
        nargs="*",
        default=DEFAULT_DATASETS,
        help="Dataset keys to benchmark",
    )
    parser.add_argument(
        "--out-json",
        default=str(_repo_root() / "dev" / "benchmarks" / "latest_r_benchmark.json"),
    )
    parser.add_argument(
        "--out-md",
        default=str(_repo_root() / "dev" / "benchmarks" / "latest_r_benchmark.md"),
    )
    args = parser.parse_args()

    repo = _repo_root()
    app_path = repo / "ipd-meta-pro.html"
    if not app_path.exists():
        raise FileNotFoundError(f"App file not found: {app_path}")

    rscript = _find_rscript(args.rscript)

    print("=" * 72)
    print("IPD Meta-Analysis Pro - Cross-Tool Benchmark")
    print("=" * 72)
    print(f"App: {app_path}")
    print(f"Rscript: {rscript}")
    print(f"Datasets: {', '.join(args.datasets)}")
    print(f"Methods: {', '.join(METHODS)}")
    print()

    app_results = _run_app(app_path, args.datasets, args.seed)
    r_results = _run_r_reference(rscript, app_results, METHODS)
    comparison = _compare(app_results, r_results)

    out_json = Path(args.out_json)
    out_md = Path(args.out_md)
    out_json.parent.mkdir(parents=True, exist_ok=True)

    full = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "app_build_id": _app_build_id(app_path),
        "seed": args.seed,
        "datasets": args.datasets,
        "methods": METHODS,
        "app": app_results,
        "reference": r_results,
        "comparison": comparison,
    }
    out_json.write_text(json.dumps(full, indent=2), encoding="utf-8")
    _write_markdown(out_md, comparison, args.datasets, args.seed)

    print("Benchmark complete.")
    print(f"JSON: {out_json}")
    print(f"Markdown: {out_md}")
    print(
        f"Overall pass rate vs metafor: "
        f"{_fmt(comparison['summary']['overall_pass_rate_metafor'], 3)}"
    )
    print(f"Max reproducibility diff: {_fmt(comparison['summary']['max_repeat_diff'], 12)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
