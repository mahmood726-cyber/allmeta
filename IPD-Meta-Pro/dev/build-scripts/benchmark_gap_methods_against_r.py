#!/usr/bin/env python3
"""Benchmark gap-validated IPD methods against R reference implementations."""

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


DEFAULT_CENTERED_DATASETS = ["continuous", "network_antidepressants"]
DEFAULT_SURVIVAL_DATASETS = ["survival", "ovarian_survival", "hiv_survival"]

CENTERED_COVARIATE_MAP = {
    "continuous": "hamd_baseline",
    "network_antidepressants": "hamd_baseline",
}

CENTERED_WITHIN_EFFECT_TOL = 1e-1
CENTERED_WITHIN_SE_TOL = 1e-1
CENTERED_ACROSS_EFFECT_TOL = 1e-1
CENTERED_ACROSS_SE_TOL = 1.5e-1

PIECEWISE_LOGHR_TOL = 2e-2
PIECEWISE_SE_TOL = 2e-2

RMST_EFFECT_TOL = 1e-1
RMST_SE_TOL = 1e-1
RMST_TAU_TOL = 1e-6


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
    centered_datasets: list[str],
    survival_datasets: list[str],
    n_intervals: int,
    tau_quantile: float,
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
    out: dict[str, Any] = {"centered": {}, "piecewise": {}, "rmst": {}}

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
              typeof loadExampleData === 'function' &&
              typeof BeyondR40 === 'object' &&
              typeof BeyondR40.centeredOneStageInteractionIPD === 'function' &&
              typeof BeyondR40.piecewisePoissonIPDMA === 'function' &&
              typeof BeyondR40.rmstIPDMetaFromData === 'function'
            );
            """
        )
        if not ready:
            raise RuntimeError("Gap-method benchmark functions are not available in page context")

        for dataset in centered_datasets:
            covariate = CENTERED_COVARIATE_MAP.get(dataset, "hamd_baseline")
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
                    const covariateVar = arguments[0];
                    const rows = window.currentData || APP.data || [];
                    const app = BeyondR40.centeredOneStageInteractionIPD(
                      rows,
                      'hamd_change',
                      'treatment',
                      covariateVar,
                      'study_id'
                    );
                    const slim = rows.map(r => ({
                      study_id: r.study_id,
                      treatment: Number(r.treatment),
                      outcome: Number(r.hamd_change),
                      covariate: Number(r[covariateVar])
                    }));
                    return {
                      n: rows.length,
                      n_studies: [...new Set(rows.map(r => r.study_id))].length,
                      covariate_var: covariateVar,
                      app: {
                        within_effect: app && app.withinTrialInteraction ? app.withinTrialInteraction.estimate : null,
                        within_se: app && app.withinTrialInteraction ? app.withinTrialInteraction.se : null,
                        within_tau2: app && app.withinTrialInteraction ? app.withinTrialInteraction.tau2 : null,
                        within_i2: app && app.withinTrialInteraction ? app.withinTrialInteraction.I2 : null,
                        across_effect: app && app.acrossTrialAssociation ? app.acrossTrialAssociation.estimate : null,
                        across_se: app && app.acrossTrialAssociation ? app.acrossTrialAssociation.se : null,
                        error: app && app.error ? app.error : null
                      },
                      rows: slim
                    };
                    """,
                    covariate,
                )
            except JavascriptException as exc:
                payload = {
                    "n": 0,
                    "n_studies": 0,
                    "covariate_var": covariate,
                    "app": {
                        "within_effect": None,
                        "within_se": None,
                        "within_tau2": None,
                        "within_i2": None,
                        "across_effect": None,
                        "across_se": None,
                        "error": str(exc),
                    },
                    "rows": [],
                }
            out["centered"][dataset] = payload

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
                piecewise_payload = driver.execute_script(
                    """
                    const rows = window.currentData || APP.data || [];
                    const app = BeyondR40.piecewisePoissonIPDMA(
                      rows,
                      'time_months',
                      'event',
                      'treatment',
                      'study_id',
                      arguments[0]
                    );
                    const slim = rows.map(r => ({
                      study_id: r.study_id,
                      treatment: Number(r.treatment),
                      time_months: Number(r.time_months),
                      event: Number(r.event)
                    }));
                    return {
                      n: rows.length,
                      n_studies: [...new Set(rows.map(r => r.study_id))].length,
                      intervals: arguments[0],
                      app: {
                        tau: app ? app.tau : null,
                        log_hr: app && app.pooled ? app.pooled.logHR : null,
                        se: app && app.pooled ? app.pooled.se : null,
                        tau2: app && app.pooled ? app.pooled.tau2 : null,
                        i2: app && app.pooled ? app.pooled.I2 : null,
                        error: app && app.error ? app.error : null
                      },
                      rows: slim
                    };
                    """,
                    n_intervals,
                )
            except JavascriptException as exc:
                piecewise_payload = {
                    "n": 0,
                    "n_studies": 0,
                    "intervals": n_intervals,
                    "app": {"tau": None, "log_hr": None, "se": None, "tau2": None, "i2": None, "error": str(exc)},
                    "rows": [],
                }
            out["piecewise"][dataset] = piecewise_payload

            try:
                rmst_payload = driver.execute_script(
                    """
                    const rows = window.currentData || APP.data || [];
                    const app = BeyondR40.rmstIPDMetaFromData(
                      rows,
                      'time_months',
                      'event',
                      'treatment',
                      'study_id',
                      arguments[0]
                    );
                    return {
                      n: rows.length,
                      n_studies: [...new Set(rows.map(r => r.study_id))].length,
                      tau_quantile: arguments[0],
                      app: {
                        tau: app ? app.tau : null,
                        effect: app && app.pooled && app.pooled.randomEffects ? app.pooled.randomEffects.estimate : null,
                        se: app && app.pooled && app.pooled.randomEffects ? app.pooled.randomEffects.se : null,
                        tau2: app && app.pooled && app.pooled.heterogeneity ? app.pooled.heterogeneity.tau2 : null,
                        i2: app && app.pooled && app.pooled.heterogeneity ? app.pooled.heterogeneity.I2 : null,
                        error: app && app.error ? app.error : null
                      }
                    };
                    """,
                    tau_quantile,
                )
            except JavascriptException as exc:
                rmst_payload = {
                    "n": 0,
                    "n_studies": 0,
                    "tau_quantile": tau_quantile,
                    "app": {"tau": None, "effect": None, "se": None, "tau2": None, "i2": None, "error": str(exc)},
                }
            out["rmst"][dataset] = rmst_payload
    finally:
        driver.quit()

    return out


def _run_r_reference(
    rscript: Path,
    app_results: dict[str, Any],
    n_intervals: int,
    tau_quantile: float,
) -> dict[str, Any]:
    payload = {
        "centered": {
            ds: {
                "rows": data["rows"],
                "covariate_var": data.get("covariate_var"),
            }
            for ds, data in app_results["centered"].items()
        },
        "piecewise": {
            ds: {
                "rows": data["rows"],
                "intervals": data.get("intervals", n_intervals),
            }
            for ds, data in app_results["piecewise"].items()
        },
        "rmst": {
            ds: {
                "rows": app_results["piecewise"].get(ds, {}).get("rows", []),
                "tau_quantile": app_results["rmst"].get(ds, {}).get("tau_quantile", tau_quantile),
            }
            for ds in app_results["rmst"].keys()
        },
    }

    temp_root = _windows_temp_root()
    with tempfile.TemporaryDirectory(
        prefix="ipd_gap_r_",
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
suppressPackageStartupMessages(library(metafor))

args <- commandArgs(trailingOnly = TRUE)
inp <- fromJSON(args[1], simplifyVector = FALSE)
out <- list(centered = list(), piecewise = list(), rmst = list())

to_df <- function(rows) {
  as.data.frame(do.call(rbind, lapply(rows, as.data.frame)))
}

for (ds_name in names(inp$centered)) {
  rows <- inp$centered[[ds_name]]$rows
  cov_name <- inp$centered[[ds_name]]$covariate_var
  if (length(rows) == 0) {
    out$centered[[ds_name]] <- list(error = "No rows provided")
    next
  }
  df <- to_df(rows)
  df$study_id <- as.character(df$study_id)
  df$treatment <- as.numeric(df$treatment)
  df$outcome <- as.numeric(df$outcome)
  df$covariate <- as.numeric(df$covariate)
  df <- df[is.finite(df$outcome) & is.finite(df$treatment) & is.finite(df$covariate), ]
  if (nrow(df) < 20) {
    out$centered[[ds_name]] <- list(error = "Too few complete rows")
    next
  }

  studies <- split(df, df$study_id)
  interaction_rows <- list()
  eco_rows <- list()

  for (sid in names(studies)) {
    s <- studies[[sid]]
    n <- nrow(s)
    n1 <- sum(s$treatment > 0)
    n0 <- sum(s$treatment <= 0)
    if (n < 12 || n1 < 4 || n0 < 4) next

    c_mean <- mean(s$covariate)
    s$c_centered <- s$covariate - c_mean
    fit <- tryCatch(
      lm(outcome ~ treatment + c_centered + I(treatment * c_centered), data = s),
      error = function(e) e
    )
    if (inherits(fit, "error")) next
    co <- summary(fit)$coefficients
    term <- "I(treatment * c_centered)"
    if (!(term %in% rownames(co))) next
    yi <- as.numeric(co[term, "Estimate"])
    sei <- as.numeric(co[term, "Std. Error"])
    if (!is.finite(yi) || !is.finite(sei) || sei <= 0) next

    mean1 <- mean(s$outcome[s$treatment > 0])
    mean0 <- mean(s$outcome[s$treatment <= 0])
    interaction_rows[[length(interaction_rows) + 1]] <- list(study = sid, yi = yi, vi = sei * sei, se = sei, n = n)
    eco_rows[[length(eco_rows) + 1]] <- list(study = sid, covMean = c_mean, trtEffect = mean1 - mean0, n = n)
  }

  if (length(interaction_rows) < 2) {
    out$centered[[ds_name]] <- list(error = "Insufficient studies after quality filters")
    next
  }

  re_df <- as.data.frame(do.call(rbind, lapply(interaction_rows, as.data.frame)))
  eco_df <- as.data.frame(do.call(rbind, lapply(eco_rows, as.data.frame)))
  fit_re <- tryCatch(rma.uni(yi = re_df$yi, vi = re_df$vi, method = "REML"), error = function(e) e)
  fit_eco <- tryCatch(lm(trtEffect ~ covMean, data = eco_df, weights = n), error = function(e) e)
  if (inherits(fit_re, "error")) {
    out$centered[[ds_name]] <- list(error = as.character(fit_re$message))
    next
  }
  if (inherits(fit_eco, "error")) {
    out$centered[[ds_name]] <- list(error = as.character(fit_eco$message))
    next
  }

  eco_co <- summary(fit_eco)$coefficients
  if (!("covMean" %in% rownames(eco_co))) {
    out$centered[[ds_name]] <- list(error = "Failed to estimate across-trial slope")
    next
  }

  out$centered[[ds_name]] <- list(
    within_effect = as.numeric(fit_re$b[1]),
    within_se = as.numeric(fit_re$se[1]),
    within_tau2 = as.numeric(fit_re$tau2),
    within_i2 = as.numeric(fit_re$I2),
    across_effect = as.numeric(eco_co["covMean", "Estimate"]),
    across_se = as.numeric(eco_co["covMean", "Std. Error"])
  )
}

for (ds_name in names(inp$piecewise)) {
  rows <- inp$piecewise[[ds_name]]$rows
  if (length(rows) == 0) {
    out$piecewise[[ds_name]] <- list(error = "No rows provided")
    next
  }
  df <- to_df(rows)
  df$study_id <- as.character(df$study_id)
  df$treatment <- ifelse(as.numeric(df$treatment) > 0, 1, 0)
  df$time_months <- as.numeric(df$time_months)
  df$event <- ifelse(as.numeric(df$event) > 0, 1, 0)
  df <- df[is.finite(df$time_months) & is.finite(df$event) & is.finite(df$treatment) & df$time_months > 0, ]
  if (nrow(df) < 30) {
    out$piecewise[[ds_name]] <- list(error = "Too few complete rows")
    next
  }

  tau <- as.numeric(stats::quantile(df$time_months, probs = 0.95, type = 7, na.rm = TRUE))
  if (!is.finite(tau) || tau <= 0) {
    out$piecewise[[ds_name]] <- list(error = "Failed to determine tau")
    next
  }

  studies <- split(df, df$study_id)
  rec <- list()
  for (sid in names(studies)) {
    s <- studies[[sid]]
    n1 <- sum(s$treatment == 1)
    n0 <- sum(s$treatment == 0)
    if (n1 < 5 || n0 < 5) next
    t_obs <- pmin(s$time_months, tau)
    pt1 <- sum(t_obs[s$treatment == 1])
    pt0 <- sum(t_obs[s$treatment == 0])
    if (!(pt1 > 0 && pt0 > 0)) next
    ev1 <- sum(s$event[s$treatment == 1] == 1 & s$time_months[s$treatment == 1] <= tau)
    ev0 <- sum(s$event[s$treatment == 0] == 1 & s$time_months[s$treatment == 0] <= tau)
    e1 <- ev1 + 0.5
    e0 <- ev0 + 0.5
    yi <- log(e1 / pt1) - log(e0 / pt0)
    vi <- 1 / e1 + 1 / e0
    if (!is.finite(yi) || !is.finite(vi) || vi <= 0) next
    rec[[length(rec) + 1]] <- list(study = sid, yi = yi, vi = vi)
  }

  if (length(rec) < 2) {
    out$piecewise[[ds_name]] <- list(error = "Need at least 2 analyzable studies")
    next
  }

  re_df <- as.data.frame(do.call(rbind, lapply(rec, as.data.frame)))
  fit <- tryCatch(rma.uni(yi = re_df$yi, vi = re_df$vi, method = "REML"), error = function(e) e)
  if (inherits(fit, "error")) {
    out$piecewise[[ds_name]] <- list(error = as.character(fit$message))
    next
  }

  out$piecewise[[ds_name]] <- list(
    tau = tau,
    log_hr = as.numeric(fit$b[1]),
    se = as.numeric(fit$se[1]),
    tau2 = as.numeric(fit$tau2),
    i2 = as.numeric(fit$I2)
  )
}

km_js <- function(times, events, tau) {
  ord <- order(times)
  times_sorted <- times[ord]
  events_sorted <- events[ord]
  unique_times <- sort(unique(times_sorted[times_sorted <= tau]))

  km_times <- c(0)
  km_surv <- c(1)
  km_events <- c(0)
  km_atrisk <- c(length(times_sorted))

  n_risk <- length(times_sorted)
  surv_prob <- 1

  for (tt in unique_times) {
    idx <- which(times_sorted == tt)
    n_events <- sum(events_sorted[idx] == 1)
    n_cens <- sum(events_sorted[idx] == 0)
    if (n_events > 0 && n_risk > 0) {
      surv_prob <- surv_prob * (n_risk - n_events) / n_risk
      km_times <- c(km_times, tt)
      km_surv <- c(km_surv, surv_prob)
      km_events <- c(km_events, n_events)
      km_atrisk <- c(km_atrisk, n_risk)
    }
    n_risk <- n_risk - n_events - n_cens
  }
  list(times = km_times, survival = km_surv, events = km_events, atrisk = km_atrisk)
}

rmst_group_js <- function(times, events, tau) {
  km <- km_js(times, events, tau)
  if (length(km$times) < 2) return(NULL)

  rmst <- 0
  for (i in seq_len(length(km$times) - 1)) {
    dt <- km$times[i + 1] - km$times[i]
    rmst <- rmst + km$survival[i] * dt
  }
  rmst <- rmst + km$survival[length(km$survival)] * max(0, tau - km$times[length(km$times)])

  cum_haz <- 0
  for (i in seq_along(km$times)) {
    if (km$events[i] > 0 && km$atrisk[i] > 1) {
      cum_haz <- cum_haz + km$events[i] / max(km$atrisk[i] * (km$atrisk[i] - km$events[i]), 1)
    }
  }
  variance <- max(1e-10, rmst * rmst * cum_haz)
  list(rmst = rmst, se = sqrt(variance))
}

for (ds_name in names(inp$rmst)) {
  rows <- inp$rmst[[ds_name]]$rows
  tau_q <- as.numeric(inp$rmst[[ds_name]]$tau_quantile)
  if (!is.finite(tau_q)) tau_q <- 0.8
  tau_q <- min(0.95, max(0.5, tau_q))

  if (length(rows) == 0) {
    out$rmst[[ds_name]] <- list(error = "No rows provided")
    next
  }
  df <- to_df(rows)
  df$study_id <- as.character(df$study_id)
  df$treatment <- ifelse(as.numeric(df$treatment) > 0, 1, 0)
  df$time_months <- as.numeric(df$time_months)
  df$event <- ifelse(as.numeric(df$event) > 0, 1, 0)
  df <- df[is.finite(df$time_months) & is.finite(df$event) & is.finite(df$treatment) & df$time_months > 0, ]
  if (nrow(df) < 30) {
    out$rmst[[ds_name]] <- list(error = "Too few complete rows")
    next
  }

  tau <- as.numeric(stats::quantile(df$time_months, probs = tau_q, type = 7, na.rm = TRUE))
  if (!is.finite(tau) || tau <= 0) {
    out$rmst[[ds_name]] <- list(error = "Failed to determine tau")
    next
  }

  studies <- split(df, df$study_id)
  rec <- list()
  for (sid in names(studies)) {
    s <- studies[[sid]]
    s1 <- s[s$treatment == 1, ]
    s0 <- s[s$treatment == 0, ]
    if (nrow(s1) < 5 || nrow(s0) < 5) next
    g1 <- rmst_group_js(s1$time_months, s1$event, tau)
    g0 <- rmst_group_js(s0$time_months, s0$event, tau)
    if (is.null(g1) || is.null(g0)) next
    diff <- g1$rmst - g0$rmst
    se <- sqrt(g1$se * g1$se + g0$se * g0$se)
    if (!is.finite(diff) || !is.finite(se) || se <= 0) next
    rec[[length(rec) + 1]] <- list(study = sid, rmst_diff = diff, se = se)
  }

  if (length(rec) < 2) {
    out$rmst[[ds_name]] <- list(error = "Need at least 2 analyzable studies")
    next
  }

  re_df <- as.data.frame(do.call(rbind, lapply(rec, as.data.frame)))
  w <- 1 / (re_df$se * re_df$se)
  sum_w <- sum(w)
  fe <- sum(w * re_df$rmst_diff) / sum_w
  Q <- sum(w * (re_df$rmst_diff - fe)^2)
  df_q <- nrow(re_df) - 1
  C <- sum_w - sum(w * w) / sum_w
  tau2 <- max(0, (Q - df_q) / C)
  w_re <- 1 / (re_df$se * re_df$se + tau2)
  sum_w_re <- sum(w_re)
  re_est <- sum(w_re * re_df$rmst_diff) / sum_w_re
  re_se <- sqrt(1 / sum_w_re)
  i2 <- ifelse(Q > 0, max(0, (Q - df_q) / Q * 100), 0)

  out$rmst[[ds_name]] <- list(
    tau = tau,
    effect = re_est,
    se = re_se,
    tau2 = tau2,
    i2 = i2
  )
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
                "R gap-method benchmark failed\n"
                f"STDOUT:\n{completed.stdout}\n\nSTDERR:\n{completed.stderr}"
            )
        return json.loads(output_json.read_text(encoding="utf-8"))


def _compare(app_results: dict[str, Any], r_results: dict[str, Any]) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []

    centered_rows: list[dict[str, Any]] = []
    for dataset, ds in app_results["centered"].items():
        app = ds["app"]
        ref = r_results["centered"].get(dataset, {})
        row = {
            "track": "centered",
            "dataset": dataset,
            "app": app,
            "r": ref,
            "diff": {
                "within_effect_abs": _abs_diff(_to_float(app.get("within_effect")), _to_float(ref.get("within_effect"))),
                "within_se_abs": _abs_diff(_to_float(app.get("within_se")), _to_float(ref.get("within_se"))),
                "across_effect_abs": _abs_diff(_to_float(app.get("across_effect")), _to_float(ref.get("across_effect"))),
                "across_se_abs": _abs_diff(_to_float(app.get("across_se")), _to_float(ref.get("across_se"))),
            },
        }
        within_eff_ok = row["diff"]["within_effect_abs"] is not None and row["diff"]["within_effect_abs"] <= CENTERED_WITHIN_EFFECT_TOL
        within_se_ok = row["diff"]["within_se_abs"] is not None and row["diff"]["within_se_abs"] <= CENTERED_WITHIN_SE_TOL
        across_eff_ok = row["diff"]["across_effect_abs"] is not None and row["diff"]["across_effect_abs"] <= CENTERED_ACROSS_EFFECT_TOL
        across_se_ok = row["diff"]["across_se_abs"] is not None and row["diff"]["across_se_abs"] <= CENTERED_ACROSS_SE_TOL
        row["pass"] = bool(
            within_eff_ok and within_se_ok and across_eff_ok and across_se_ok
            and not app.get("error") and not ref.get("error")
        )
        centered_rows.append(row)
        rows.append(row)

    piecewise_rows: list[dict[str, Any]] = []
    for dataset, ds in app_results["piecewise"].items():
        app = ds["app"]
        ref = r_results["piecewise"].get(dataset, {})
        row = {
            "track": "piecewise",
            "dataset": dataset,
            "app": app,
            "r": ref,
            "diff": {
                "loghr_abs": _abs_diff(_to_float(app.get("log_hr")), _to_float(ref.get("log_hr"))),
                "se_abs": _abs_diff(_to_float(app.get("se")), _to_float(ref.get("se"))),
                "tau_abs": _abs_diff(_to_float(app.get("tau")), _to_float(ref.get("tau"))),
            },
        }
        loghr_ok = row["diff"]["loghr_abs"] is not None and row["diff"]["loghr_abs"] <= PIECEWISE_LOGHR_TOL
        se_ok = row["diff"]["se_abs"] is not None and row["diff"]["se_abs"] <= PIECEWISE_SE_TOL
        row["pass"] = bool(loghr_ok and se_ok and not app.get("error") and not ref.get("error"))
        piecewise_rows.append(row)
        rows.append(row)

    rmst_rows: list[dict[str, Any]] = []
    for dataset, ds in app_results["rmst"].items():
        app = ds["app"]
        ref = r_results["rmst"].get(dataset, {})
        row = {
            "track": "rmst",
            "dataset": dataset,
            "app": app,
            "r": ref,
            "diff": {
                "effect_abs": _abs_diff(_to_float(app.get("effect")), _to_float(ref.get("effect"))),
                "se_abs": _abs_diff(_to_float(app.get("se")), _to_float(ref.get("se"))),
                "tau_abs": _abs_diff(_to_float(app.get("tau")), _to_float(ref.get("tau"))),
            },
        }
        effect_ok = row["diff"]["effect_abs"] is not None and row["diff"]["effect_abs"] <= RMST_EFFECT_TOL
        se_ok = row["diff"]["se_abs"] is not None and row["diff"]["se_abs"] <= RMST_SE_TOL
        tau_ok = row["diff"]["tau_abs"] is not None and row["diff"]["tau_abs"] <= RMST_TAU_TOL
        row["pass"] = bool(effect_ok and se_ok and tau_ok and not app.get("error") and not ref.get("error"))
        rmst_rows.append(row)
        rows.append(row)

    summary = {
        "rows": len(rows),
        "overall_pass_rate": (sum(1 for r in rows if r["pass"]) / len(rows)) if rows else None,
        "centered_pass_rate": (
            sum(1 for r in centered_rows if r["pass"]) / len(centered_rows)
            if centered_rows
            else None
        ),
        "piecewise_pass_rate": (
            sum(1 for r in piecewise_rows if r["pass"]) / len(piecewise_rows)
            if piecewise_rows
            else None
        ),
        "rmst_pass_rate": (
            sum(1 for r in rmst_rows if r["pass"]) / len(rmst_rows)
            if rmst_rows
            else None
        ),
        "max_abs_diff": {
            "centered_within_effect": max((r["diff"]["within_effect_abs"] for r in centered_rows if r["diff"]["within_effect_abs"] is not None), default=None),
            "piecewise_loghr": max((r["diff"]["loghr_abs"] for r in piecewise_rows if r["diff"]["loghr_abs"] is not None), default=None),
            "rmst_effect": max((r["diff"]["effect_abs"] for r in rmst_rows if r["diff"]["effect_abs"] is not None), default=None),
        },
        "mean_abs_diff": {
            "centered_within_effect": (
                statistics.mean([r["diff"]["within_effect_abs"] for r in centered_rows if r["diff"]["within_effect_abs"] is not None])
                if any(r["diff"]["within_effect_abs"] is not None for r in centered_rows)
                else None
            ),
            "piecewise_loghr": (
                statistics.mean([r["diff"]["loghr_abs"] for r in piecewise_rows if r["diff"]["loghr_abs"] is not None])
                if any(r["diff"]["loghr_abs"] is not None for r in piecewise_rows)
                else None
            ),
            "rmst_effect": (
                statistics.mean([r["diff"]["effect_abs"] for r in rmst_rows if r["diff"]["effect_abs"] is not None])
                if any(r["diff"]["effect_abs"] is not None for r in rmst_rows)
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
    centered_datasets: list[str],
    survival_datasets: list[str],
    n_intervals: int,
    tau_quantile: float,
    seed: int,
) -> None:
    summary = comparison["summary"]
    rows = comparison["rows"]
    lines: list[str] = []
    lines.append("# Gap-Validated Methods Benchmark vs R")
    lines.append("")
    lines.append(f"- Seed: `{seed}`")
    lines.append(f"- Centered interaction datasets: `{', '.join(centered_datasets)}`")
    lines.append(f"- Survival datasets (piecewise + RMST): `{', '.join(survival_datasets)}`")
    lines.append(f"- Piecewise intervals: `{n_intervals}`")
    lines.append(f"- RMST tau quantile: `{tau_quantile:.2f}`")
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    lines.append(
        f"- Centered pass criteria: within |effect| <= `{_fmt(CENTERED_WITHIN_EFFECT_TOL, 3)}`, "
        f"within |SE| <= `{_fmt(CENTERED_WITHIN_SE_TOL, 3)}`, "
        f"across |effect| <= `{_fmt(CENTERED_ACROSS_EFFECT_TOL, 3)}`, "
        f"across |SE| <= `{_fmt(CENTERED_ACROSS_SE_TOL, 3)}`"
    )
    lines.append(
        f"- Piecewise pass criteria: |logHR| <= `{_fmt(PIECEWISE_LOGHR_TOL, 3)}`, "
        f"|SE| <= `{_fmt(PIECEWISE_SE_TOL, 3)}`"
    )
    lines.append(
        f"- RMST pass criteria: |effect| <= `{_fmt(RMST_EFFECT_TOL, 3)}`, "
        f"|SE| <= `{_fmt(RMST_SE_TOL, 3)}`, |tau| <= `{_fmt(RMST_TAU_TOL, 6)}`"
    )
    lines.append(f"- Rows compared: `{summary['rows']}`")
    lines.append(f"- Overall pass rate: `{_fmt(summary['overall_pass_rate'], 3)}`")
    lines.append(f"- Centered pass rate: `{_fmt(summary['centered_pass_rate'], 3)}`")
    lines.append(f"- Piecewise pass rate: `{_fmt(summary['piecewise_pass_rate'], 3)}`")
    lines.append(f"- RMST pass rate: `{_fmt(summary['rmst_pass_rate'], 3)}`")
    lines.append(f"- Max |centered within effect diff|: `{_fmt(summary['max_abs_diff']['centered_within_effect'], 6)}`")
    lines.append(f"- Max |piecewise logHR diff|: `{_fmt(summary['max_abs_diff']['piecewise_loghr'], 6)}`")
    lines.append(f"- Max |RMST effect diff|: `{_fmt(summary['max_abs_diff']['rmst_effect'], 6)}`")
    lines.append("")
    lines.append("## Detailed Rows")
    lines.append("")
    lines.append("| Track | Dataset | Key Diff 1 | Key Diff 2 | Pass |")
    lines.append("|---|---|---:|---:|:---:|")
    for row in rows:
        track = row["track"]
        diff = row["diff"]
        if track == "centered":
            d1 = _fmt(diff.get("within_effect_abs"), 6)
            d2 = _fmt(diff.get("within_se_abs"), 6)
        elif track == "piecewise":
            d1 = _fmt(diff.get("loghr_abs"), 6)
            d2 = _fmt(diff.get("se_abs"), 6)
        else:
            d1 = _fmt(diff.get("effect_abs"), 6)
            d2 = _fmt(diff.get("se_abs"), 6)
        lines.append(f"| {track} | {row['dataset']} | {d1} | {d2} | {'YES' if row['pass'] else 'NO'} |")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark gap-validated methods against R")
    parser.add_argument("--rscript", default=None, help="Path to Rscript.exe")
    parser.add_argument("--seed", type=int, default=12345, help="Seed for deterministic example data")
    parser.add_argument(
        "--centered-datasets",
        nargs="*",
        default=DEFAULT_CENTERED_DATASETS,
        help="Dataset keys for centered interaction benchmark",
    )
    parser.add_argument(
        "--survival-datasets",
        nargs="*",
        default=DEFAULT_SURVIVAL_DATASETS,
        help="Dataset keys for piecewise + RMST benchmark",
    )
    parser.add_argument("--piecewise-intervals", type=int, default=8, help="Number of piecewise intervals")
    parser.add_argument("--rmst-tau-quantile", type=float, default=0.80, help="Tau quantile for RMST benchmark")
    parser.add_argument(
        "--out-json",
        default=str(_repo_root() / "dev" / "benchmarks" / "latest_gap_methods_r_benchmark.json"),
    )
    parser.add_argument(
        "--out-md",
        default=str(_repo_root() / "dev" / "benchmarks" / "latest_gap_methods_r_benchmark.md"),
    )
    args = parser.parse_args()

    repo = _repo_root()
    app_path = repo / "ipd-meta-pro.html"
    if not app_path.exists():
        raise FileNotFoundError(f"App file not found: {app_path}")

    rscript = _find_rscript(args.rscript)

    print("=" * 72)
    print("IPD Meta-Analysis Pro - Gap Methods Benchmark")
    print("=" * 72)
    print(f"App: {app_path}")
    print(f"Rscript: {rscript}")
    print(f"Centered datasets: {', '.join(args.centered_datasets)}")
    print(f"Survival datasets: {', '.join(args.survival_datasets)}")
    print(f"Piecewise intervals: {args.piecewise_intervals}")
    print(f"RMST tau quantile: {args.rmst_tau_quantile:.2f}")
    print()

    app_results = _run_app(
        app_path=app_path,
        centered_datasets=args.centered_datasets,
        survival_datasets=args.survival_datasets,
        n_intervals=args.piecewise_intervals,
        tau_quantile=args.rmst_tau_quantile,
        seed=args.seed,
    )
    r_results = _run_r_reference(
        rscript=rscript,
        app_results=app_results,
        n_intervals=args.piecewise_intervals,
        tau_quantile=args.rmst_tau_quantile,
    )
    comparison = _compare(app_results, r_results)

    out_json = Path(args.out_json)
    out_md = Path(args.out_md)
    out_json.parent.mkdir(parents=True, exist_ok=True)

    full = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "app_build_id": _app_build_id(app_path),
        "seed": args.seed,
        "centered_datasets": args.centered_datasets,
        "survival_datasets": args.survival_datasets,
        "piecewise_intervals": args.piecewise_intervals,
        "rmst_tau_quantile": args.rmst_tau_quantile,
        "app": app_results,
        "reference": r_results,
        "comparison": comparison,
    }
    out_json.write_text(json.dumps(full, indent=2), encoding="utf-8")
    _write_markdown(
        path=out_md,
        comparison=comparison,
        centered_datasets=args.centered_datasets,
        survival_datasets=args.survival_datasets,
        n_intervals=args.piecewise_intervals,
        tau_quantile=args.rmst_tau_quantile,
        seed=args.seed,
    )

    print("Benchmark complete.")
    print(f"JSON: {out_json}")
    print(f"Markdown: {out_md}")
    print(f"Overall pass rate: {_fmt(comparison['summary']['overall_pass_rate'], 3)}")
    print(f"Centered pass rate: {_fmt(comparison['summary']['centered_pass_rate'], 3)}")
    print(f"Piecewise pass rate: {_fmt(comparison['summary']['piecewise_pass_rate'], 3)}")
    print(f"RMST pass rate: {_fmt(comparison['summary']['rmst_pass_rate'], 3)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
