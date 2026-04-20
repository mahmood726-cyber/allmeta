#!/usr/bin/env python3
"""Benchmark one-stage and frailty workflows against R (lme4/survival)."""

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


DEFAULT_ONE_STAGE_DATASETS = ["continuous", "network_antidepressants"]
DEFAULT_ONE_STAGE_EXPLORATORY_DATASETS = ["binary", "statin_cvd", "covid_treatments"]
DEFAULT_FRAILTY_DATASETS = ["survival", "ovarian_survival", "hiv_survival"]

ONE_STAGE_EFFECT_TOL = 2e-2
ONE_STAGE_SE_TOL = 5e-2
FRAILTY_HR_TOL = 5e-3
FRAILTY_SE_TOL = 5e-3
FRAILTY_THETA_TOL = 1e-2

ONE_STAGE_OUTCOME_MAP = {
    "continuous": "hamd_change",
    "network_antidepressants": "hamd_change",
    "binary": "mace_event",
    "statin_cvd": "mace_event",
    "covid_treatments": "mortality_28d",
}


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


def _rel_diff(a: float | None, b: float | None) -> float | None:
    if a is None or b is None:
        return None
    denom = abs(b) if abs(b) > 1e-12 else 1.0
    return abs(a - b) / denom


def _run_app(
    app_path: Path,
    one_stage_datasets: list[str],
    one_stage_exploratory_datasets: list[str],
    frailty_datasets: list[str],
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
    out: dict[str, Any] = {"one_stage": {}, "frailty": {}}

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
              (typeof runOneStageIPDMA === 'function' || typeof runOneStageIPD === 'function') &&
              typeof fitFrailtyModel === 'function'
            );
            """
        )
        if not ready:
            raise RuntimeError("Required app benchmark functions are not available in page context")

        for dataset in one_stage_datasets:
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
            outcome_var = ONE_STAGE_OUTCOME_MAP.get(dataset, "hamd_change")
            try:
                payload = driver.execute_script(
                    """
                    const outcomeVar = arguments[0];
                    const rows = window.currentData || [];
                    const runner = (typeof window.runOneStageIPDMA === 'function')
                      ? window.runOneStageIPDMA
                      : ((typeof runOneStageIPDMA === 'function') ? runOneStageIPDMA : runOneStageIPD);
                    const app = runner(rows, outcomeVar, 'treatment', 'study_id', []);
                    const slim = rows.map(r => ({
                      study_id: r.study_id,
                      treatment: Number(r.treatment),
                      outcome: Number(r[outcomeVar])
                    }));
                    return {
                      n: rows.length,
                      n_studies: [...new Set(rows.map(r => r.study_id))].length,
                      outcome_var: outcomeVar,
                      model_used: runner === runOneStageIPD ? 'runOneStageIPD' : 'runOneStageIPDMA',
                      app: {
                        pooled_effect: app ? (app.pooled_effect ?? (app.treatment ? app.treatment.effect : null)) : null,
                        se: app ? (app.SE ?? (app.treatment ? app.treatment.se : null)) : null,
                        tau2: app ? (app.tau2 ?? (app.heterogeneity ? app.heterogeneity.tau_sq : null)) : null,
                        i2: app ? (app.I2 ?? (app.heterogeneity ? app.heterogeneity.I2 : null)) : null,
                        p_value: app ? (app.p_value ?? (app.treatment ? app.treatment.pValue : null)) : null,
                        error: app && app.error ? app.error : null
                      },
                      rows: slim
                    };
                    """,
                    outcome_var,
                )
            except JavascriptException as exc:
                payload = {
                    "n": 0,
                    "n_studies": 0,
                    "outcome_var": outcome_var,
                    "model_used": "runOneStageIPD",
                    "app": {
                        "pooled_effect": None,
                        "se": None,
                        "tau2": None,
                        "i2": None,
                        "p_value": None,
                        "error": str(exc),
                    },
                    "rows": [],
                }
            payload["is_exploratory"] = False
            out["one_stage"][dataset] = payload

        for dataset in one_stage_exploratory_datasets:
            if dataset in out["one_stage"]:
                continue
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
            outcome_var = ONE_STAGE_OUTCOME_MAP.get(dataset, "hamd_change")
            try:
                payload = driver.execute_script(
                    """
                    const outcomeVar = arguments[0];
                    const rows = window.currentData || [];
                    const runner = (typeof window.runOneStageIPDMA === 'function')
                      ? window.runOneStageIPDMA
                      : ((typeof runOneStageIPDMA === 'function') ? runOneStageIPDMA : runOneStageIPD);
                    const app = runner(rows, outcomeVar, 'treatment', 'study_id', []);
                    const slim = rows.map(r => ({
                      study_id: r.study_id,
                      treatment: Number(r.treatment),
                      outcome: Number(r[outcomeVar])
                    }));
                    return {
                      n: rows.length,
                      n_studies: [...new Set(rows.map(r => r.study_id))].length,
                      outcome_var: outcomeVar,
                      model_used: runner === runOneStageIPD ? 'runOneStageIPD' : 'runOneStageIPDMA',
                      app: {
                        pooled_effect: app ? (app.pooled_effect ?? (app.treatment ? app.treatment.effect : null)) : null,
                        se: app ? (app.SE ?? (app.treatment ? app.treatment.se : null)) : null,
                        tau2: app ? (app.tau2 ?? (app.heterogeneity ? app.heterogeneity.tau_sq : null)) : null,
                        i2: app ? (app.I2 ?? (app.heterogeneity ? app.heterogeneity.I2 : null)) : null,
                        p_value: app ? (app.p_value ?? (app.treatment ? app.treatment.pValue : null)) : null,
                        error: app && app.error ? app.error : null
                      },
                      rows: slim
                    };
                    """,
                    outcome_var,
                )
            except JavascriptException as exc:
                payload = {
                    "n": 0,
                    "n_studies": 0,
                    "outcome_var": outcome_var,
                    "model_used": "runOneStageIPD",
                    "app": {
                        "pooled_effect": None,
                        "se": None,
                        "tau2": None,
                        "i2": None,
                        "p_value": None,
                        "error": str(exc),
                    },
                    "rows": [],
                }
            payload["is_exploratory"] = True
            out["one_stage"][dataset] = payload

        for dataset in frailty_datasets:
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
                    const rows = window.currentData || [];
                    const app = fitFrailtyModel(rows, 'time_months', 'event', 'treatment', 'study_id');
                    const slim = rows.map(r => ({
                      study_id: r.study_id,
                      treatment: Number(r.treatment),
                      time_months: Number(r.time_months),
                      event: Number(r.event)
                    }));
                    return {
                      n: rows.length,
                      n_studies: [...new Set(rows.map(r => r.study_id))].length,
                      app: {
                        hr: app ? app.hr : null,
                        se: app ? app.se : null,
                        theta: app ? app.theta : null,
                        lower: app ? app.lower : null,
                        upper: app ? app.upper : null
                      },
                      rows: slim
                    };
                    """
                )
            except JavascriptException as exc:
                payload = {
                    "n": 0,
                    "n_studies": 0,
                    "app": {"hr": None, "se": None, "theta": None, "lower": None, "upper": None, "error": str(exc)},
                    "rows": [],
                }
            out["frailty"][dataset] = payload
    finally:
        driver.quit()

    return out


def _run_r_reference(rscript: Path, app_results: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "one_stage": {
            ds: {
                "rows": data["rows"],
                "outcome_var": data.get("outcome_var"),
                "model_used": data.get("model_used"),
                "is_exploratory": data.get("is_exploratory", False),
            }
            for ds, data in app_results["one_stage"].items()
        },
        "frailty": {
            ds: {"rows": data["rows"]}
            for ds, data in app_results["frailty"].items()
        },
    }

    temp_root = _windows_temp_root()
    with tempfile.TemporaryDirectory(
        prefix="ipd_one_stage_r_",
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
suppressPackageStartupMessages(library(lme4))
suppressPackageStartupMessages(library(survival))

args <- commandArgs(trailingOnly = TRUE)
inp <- fromJSON(args[1], simplifyVector = FALSE)
out <- list(one_stage = list(), frailty = list())

extract_theta <- function(fit, summ) {
  theta <- NA_real_
  if (!is.null(fit$history) && length(fit$history) > 0) {
    h <- fit$history[[1]]
    if (!is.null(h$theta)) theta <- as.numeric(h$theta)
  }
  if (is.na(theta) && !is.null(summ$theta)) {
    theta <- as.numeric(summ$theta)
  }
  theta
}

for (ds_name in names(inp$one_stage)) {
  rows <- inp$one_stage[[ds_name]]$rows
  df <- as.data.frame(do.call(rbind, lapply(rows, as.data.frame)))
  if (nrow(df) == 0) {
    out$one_stage[[ds_name]] <- list(error = "No rows provided")
    next
  }
  df$outcome <- as.numeric(df$outcome)
  df$treatment <- as.numeric(df$treatment)
  df$study_id <- as.factor(df$study_id)
  df <- df[is.finite(df$outcome) & is.finite(df$treatment), ]

  fit <- tryCatch(
    lmer(
      outcome ~ treatment + (1 + treatment | study_id),
      data = df,
      REML = TRUE,
      control = lmerControl(check.conv.singular = "ignore")
    ),
    error = function(e) e
  )
  model_used <- "random_slope"
  if (inherits(fit, "error")) {
    fit <- tryCatch(
      lmer(
        outcome ~ treatment + (1 | study_id),
        data = df,
        REML = TRUE,
        control = lmerControl(check.conv.singular = "ignore")
      ),
      error = function(e) e
    )
    model_used <- "random_intercept"
  }
  if (inherits(fit, "error")) {
    out$one_stage[[ds_name]] <- list(error = as.character(fit$message), model = model_used)
  } else {
    sm <- summary(fit)
    tau2 <- tryCatch({
      vc <- as.matrix(VarCorr(fit)$study_id)
      if ("treatment" %in% rownames(vc) && "treatment" %in% colnames(vc)) {
        as.numeric(vc["treatment", "treatment"])
      } else {
        as.numeric(vc[1, 1])
      }
    }, error = function(e) NA_real_)
    out$one_stage[[ds_name]] <- list(
      effect = as.numeric(fixef(fit)["treatment"]),
      se = as.numeric(sm$coefficients["treatment", "Std. Error"]),
      tau2 = tau2,
      model = model_used
    )
  }
}

for (ds_name in names(inp$frailty)) {
  rows <- inp$frailty[[ds_name]]$rows
  df <- as.data.frame(do.call(rbind, lapply(rows, as.data.frame)))
  if (nrow(df) == 0) {
    out$frailty[[ds_name]] <- list(error = "No rows provided")
    next
  }
  df$time_months <- as.numeric(df$time_months)
  df$event <- as.numeric(df$event)
  df$treatment <- as.numeric(df$treatment)
  df$study_id <- as.factor(df$study_id)
  df <- df[is.finite(df$time_months) & is.finite(df$event) & is.finite(df$treatment), ]

  fit <- tryCatch(
    coxph(Surv(time_months, event) ~ treatment + frailty(study_id), data = df),
    error = function(e) e
  )
  if (inherits(fit, "error")) {
    out$frailty[[ds_name]] <- list(error = as.character(fit$message))
  } else {
    sm <- summary(fit)
    coef_name <- if ("treatment" %in% rownames(sm$coefficients)) "treatment" else rownames(sm$coefficients)[1]
    out$frailty[[ds_name]] <- list(
      hr = as.numeric(exp(coef(fit)[coef_name])),
      se = as.numeric(sm$coefficients[coef_name, "se(coef)"]),
      theta = extract_theta(fit, sm)
    )
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
                "R one-stage/frailty benchmark failed\n"
                f"STDOUT:\n{completed.stdout}\n\nSTDERR:\n{completed.stderr}"
            )
        return json.loads(output_json.read_text(encoding="utf-8"))


def _compare(app_results: dict[str, Any], r_results: dict[str, Any]) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []

    one_stage_rows: list[dict[str, Any]] = []
    for dataset, ds in app_results["one_stage"].items():
        app = ds["app"]
        ref = r_results["one_stage"].get(dataset, {})
        is_exploratory = bool(ds.get("is_exploratory"))
        row = {
            "track": "one_stage",
            "dataset": dataset,
            "is_exploratory": is_exploratory,
            "app": app,
            "r": ref,
            "diff": {
                "effect_abs": _abs_diff(_to_float(app.get("pooled_effect")), _to_float(ref.get("effect"))),
                "se_abs": _abs_diff(_to_float(app.get("se")), _to_float(ref.get("se"))),
                "tau2_abs": _abs_diff(_to_float(app.get("tau2")), _to_float(ref.get("tau2"))),
            },
        }
        effect_ok = row["diff"]["effect_abs"] is not None and row["diff"]["effect_abs"] <= ONE_STAGE_EFFECT_TOL
        se_ok = row["diff"]["se_abs"] is not None and row["diff"]["se_abs"] <= ONE_STAGE_SE_TOL
        row["pass"] = bool(effect_ok and se_ok and not ref.get("error") and not app.get("error"))
        one_stage_rows.append(row)
        rows.append(row)

    frailty_rows: list[dict[str, Any]] = []
    for dataset, ds in app_results["frailty"].items():
        app = ds["app"]
        ref = r_results["frailty"].get(dataset, {})
        row = {
            "track": "frailty",
            "dataset": dataset,
            "app": app,
            "r": ref,
            "diff": {
                "hr_abs": _abs_diff(_to_float(app.get("hr")), _to_float(ref.get("hr"))),
                "hr_rel": _rel_diff(_to_float(app.get("hr")), _to_float(ref.get("hr"))),
                "se_abs": _abs_diff(_to_float(app.get("se")), _to_float(ref.get("se"))),
                "theta_abs": _abs_diff(_to_float(app.get("theta")), _to_float(ref.get("theta"))),
            },
        }
        hr_ok = row["diff"]["hr_abs"] is not None and row["diff"]["hr_abs"] <= FRAILTY_HR_TOL
        se_ok = row["diff"]["se_abs"] is not None and row["diff"]["se_abs"] <= FRAILTY_SE_TOL
        theta_ok = row["diff"]["theta_abs"] is None or row["diff"]["theta_abs"] <= FRAILTY_THETA_TOL
        row["pass"] = bool(hr_ok and se_ok and theta_ok and not ref.get("error") and not app.get("error"))
        frailty_rows.append(row)
        rows.append(row)

    one_stage_gate_rows = [r for r in one_stage_rows if not r.get("is_exploratory")]
    one_stage_explore_rows = [r for r in one_stage_rows if r.get("is_exploratory")]

    summary = {
        "rows": len(rows),
        "overall_pass_rate": (sum(1 for r in rows if r["pass"]) / len(rows)) if rows else None,
        "one_stage_pass_rate": (
            sum(1 for r in one_stage_gate_rows if r["pass"]) / len(one_stage_gate_rows)
            if one_stage_gate_rows
            else None
        ),
        "one_stage_coverage_pass_rate": (
            sum(1 for r in one_stage_rows if r["pass"]) / len(one_stage_rows)
            if one_stage_rows
            else None
        ),
        "one_stage_exploratory_pass_rate": (
            sum(1 for r in one_stage_explore_rows if r["pass"]) / len(one_stage_explore_rows)
            if one_stage_explore_rows
            else None
        ),
        "frailty_pass_rate": (
            sum(1 for r in frailty_rows if r["pass"]) / len(frailty_rows)
            if frailty_rows
            else None
        ),
        "max_abs_diff": {
            "one_stage_effect": max(
                (r["diff"]["effect_abs"] for r in one_stage_rows if r["diff"]["effect_abs"] is not None),
                default=None,
            ),
            "frailty_hr": max(
                (r["diff"]["hr_abs"] for r in frailty_rows if r["diff"]["hr_abs"] is not None),
                default=None,
            ),
            "frailty_theta": max(
                (r["diff"]["theta_abs"] for r in frailty_rows if r["diff"]["theta_abs"] is not None),
                default=None,
            ),
        },
        "mean_abs_diff": {
            "one_stage_effect": (
                statistics.mean([r["diff"]["effect_abs"] for r in one_stage_rows if r["diff"]["effect_abs"] is not None])
                if any(r["diff"]["effect_abs"] is not None for r in one_stage_rows)
                else None
            ),
            "frailty_hr": (
                statistics.mean([r["diff"]["hr_abs"] for r in frailty_rows if r["diff"]["hr_abs"] is not None])
                if any(r["diff"]["hr_abs"] is not None for r in frailty_rows)
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
    one_stage_datasets: list[str],
    one_stage_exploratory_datasets: list[str],
    frailty_datasets: list[str],
    seed: int,
) -> None:
    summary = comparison["summary"]
    rows = comparison["rows"]
    lines: list[str] = []
    lines.append("# One-Stage/Frailty Benchmark vs R")
    lines.append("")
    lines.append(f"- Seed: `{seed}`")
    lines.append(f"- One-stage gated datasets: `{', '.join(one_stage_datasets)}`")
    lines.append(f"- One-stage exploratory datasets: `{', '.join(one_stage_exploratory_datasets)}`")
    lines.append(f"- Frailty datasets: `{', '.join(frailty_datasets)}`")
    lines.append("- One-stage lane is currently benchmarked for continuous outcomes only.")
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    lines.append(
        f"- Pass criteria: one-stage |effect| <= `{_fmt(ONE_STAGE_EFFECT_TOL, 3)}`, "
        f"one-stage |SE| <= `{_fmt(ONE_STAGE_SE_TOL, 3)}`"
    )
    lines.append(
        f"- Pass criteria: frailty |HR| <= `{_fmt(FRAILTY_HR_TOL, 3)}`, "
        f"|SE| <= `{_fmt(FRAILTY_SE_TOL, 3)}`, |theta| <= `{_fmt(FRAILTY_THETA_TOL, 3)}`"
    )
    lines.append(f"- Rows compared: `{summary['rows']}`")
    lines.append(f"- Overall pass rate: `{_fmt(summary['overall_pass_rate'], 3)}`")
    lines.append(f"- One-stage gated pass rate: `{_fmt(summary['one_stage_pass_rate'], 3)}`")
    lines.append(f"- One-stage coverage pass rate: `{_fmt(summary['one_stage_coverage_pass_rate'], 3)}`")
    lines.append(f"- One-stage exploratory pass rate: `{_fmt(summary['one_stage_exploratory_pass_rate'], 3)}`")
    lines.append(f"- Frailty pass rate: `{_fmt(summary['frailty_pass_rate'], 3)}`")
    lines.append(f"- Max |one-stage effect diff|: `{_fmt(summary['max_abs_diff']['one_stage_effect'], 6)}`")
    lines.append(f"- Max |frailty HR diff|: `{_fmt(summary['max_abs_diff']['frailty_hr'], 6)}`")
    lines.append(f"- Max |frailty theta diff|: `{_fmt(summary['max_abs_diff']['frailty_theta'], 6)}`")
    lines.append("")
    lines.append("## Detailed Rows")
    lines.append("")
    lines.append("| Track | Dataset | Key Diff 1 | Key Diff 2 | Pass |")
    lines.append("|---|---|---:|---:|:---:|")
    for row in rows:
        track = row["track"] + (" (exploratory)" if row.get("is_exploratory") else "")
        if row["track"] == "one_stage":
            d1 = _fmt(row["diff"]["effect_abs"], 6)
            d2 = _fmt(row["diff"]["se_abs"], 6)
        else:
            d1 = _fmt(row["diff"]["hr_abs"], 6)
            d2 = _fmt(row["diff"]["theta_abs"], 6)
        lines.append(
            f"| {track} | {row['dataset']} | {d1} | {d2} | {'YES' if row['pass'] else 'NO'} |"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark one-stage/frailty workflows against R")
    parser.add_argument("--rscript", default=None, help="Path to Rscript.exe")
    parser.add_argument("--seed", type=int, default=12345, help="Seed for deterministic example data")
    parser.add_argument(
        "--one-stage-datasets",
        nargs="*",
        default=DEFAULT_ONE_STAGE_DATASETS,
        help="Dataset keys for one-stage benchmark gate",
    )
    parser.add_argument(
        "--one-stage-exploratory-datasets",
        nargs="*",
        default=DEFAULT_ONE_STAGE_EXPLORATORY_DATASETS,
        help="Additional one-stage datasets for coverage reporting (do not affect one-stage gate pass rate)",
    )
    parser.add_argument(
        "--frailty-datasets",
        nargs="*",
        default=DEFAULT_FRAILTY_DATASETS,
        help="Dataset keys for frailty benchmark",
    )
    parser.add_argument(
        "--out-json",
        default=str(_repo_root() / "dev" / "benchmarks" / "latest_one_stage_r_benchmark.json"),
    )
    parser.add_argument(
        "--out-md",
        default=str(_repo_root() / "dev" / "benchmarks" / "latest_one_stage_r_benchmark.md"),
    )
    args = parser.parse_args()

    repo = _repo_root()
    app_path = repo / "ipd-meta-pro.html"
    if not app_path.exists():
        raise FileNotFoundError(f"App file not found: {app_path}")

    rscript = _find_rscript(args.rscript)

    print("=" * 72)
    print("IPD Meta-Analysis Pro - One-Stage/Frailty Benchmark")
    print("=" * 72)
    print(f"App: {app_path}")
    print(f"Rscript: {rscript}")
    print(f"One-stage gated datasets: {', '.join(args.one_stage_datasets)}")
    print(f"One-stage exploratory datasets: {', '.join(args.one_stage_exploratory_datasets)}")
    print(f"Frailty datasets: {', '.join(args.frailty_datasets)}")
    print()

    app_results = _run_app(
        app_path,
        args.one_stage_datasets,
        args.one_stage_exploratory_datasets,
        args.frailty_datasets,
        args.seed,
    )
    r_results = _run_r_reference(rscript, app_results)
    comparison = _compare(app_results, r_results)

    out_json = Path(args.out_json)
    out_md = Path(args.out_md)
    out_json.parent.mkdir(parents=True, exist_ok=True)

    full = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "app_build_id": _app_build_id(app_path),
        "seed": args.seed,
        "one_stage_datasets": args.one_stage_datasets,
        "one_stage_exploratory_datasets": args.one_stage_exploratory_datasets,
        "frailty_datasets": args.frailty_datasets,
        "app": app_results,
        "reference": r_results,
        "comparison": comparison,
    }
    out_json.write_text(json.dumps(full, indent=2), encoding="utf-8")
    _write_markdown(
        out_md,
        comparison,
        args.one_stage_datasets,
        args.one_stage_exploratory_datasets,
        args.frailty_datasets,
        args.seed,
    )

    print("Benchmark complete.")
    print(f"JSON: {out_json}")
    print(f"Markdown: {out_md}")
    print(f"Overall pass rate: {_fmt(comparison['summary']['overall_pass_rate'], 3)}")
    print(f"One-stage gated pass rate: {_fmt(comparison['summary']['one_stage_pass_rate'], 3)}")
    print(f"One-stage coverage pass rate: {_fmt(comparison['summary']['one_stage_coverage_pass_rate'], 3)}")
    print(f"Frailty pass rate: {_fmt(comparison['summary']['frailty_pass_rate'], 3)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
