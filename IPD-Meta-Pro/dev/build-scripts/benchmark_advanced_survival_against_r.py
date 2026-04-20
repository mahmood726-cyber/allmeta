#!/usr/bin/env python3
"""Benchmark advanced survival methods against R references."""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import re
import statistics
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

from selenium.webdriver.edge.options import Options

from edge_webdriver import create_edge_driver, load_local_app_with_ready_check


CURE_POOLED_TOL = 0.02
CURE_LOGIT_TOL = 0.12
CURE_SE_TOL = 0.06
CURE_HR_LOG_TOL = 0.18
CURE_HR_SE_TOL = 0.05

COMPETING_LOGHR_TOL = 0.005
COMPETING_SE_TOL = 0.005
COMPETING_CIF_RD_TOL = 0.005
COMPETING_GRAY_LOGP_TOL = 0.08


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


def _log_p_value(p: Any) -> float | None:
    value = _to_float(p)
    if value is None or value <= 0:
        return None
    return -math.log10(max(value, 1e-12))


def _uniform(rng: random.Random, lo: float, hi: float) -> float:
    return lo + (hi - lo) * rng.random()


def _rexp(rng: random.Random, rate: float) -> float:
    u = max(rng.random(), 1e-12)
    return -math.log(u) / max(rate, 1e-9)


def _generate_cure_rows(seed: int) -> dict[str, list[dict[str, Any]]]:
    scenarios = [
        {
            "name": "cure_benefit",
            "studies": [
                {"id": "CURE_A", "n": 240, "cure_fraction": 0.28, "base_hazard": 0.12, "hr_treated": 0.76, "censor_low": 12.0, "censor_high": 30.0},
                {"id": "CURE_B", "n": 260, "cure_fraction": 0.34, "base_hazard": 0.08, "hr_treated": 0.82, "censor_low": 14.0, "censor_high": 32.0},
                {"id": "CURE_C", "n": 220, "cure_fraction": 0.24, "base_hazard": 0.15, "hr_treated": 0.71, "censor_low": 10.0, "censor_high": 26.0},
                {"id": "CURE_D", "n": 250, "cure_fraction": 0.39, "base_hazard": 0.07, "hr_treated": 0.86, "censor_low": 16.0, "censor_high": 34.0},
            ],
        },
        {
            "name": "cure_plateau",
            "studies": [
                {"id": "CURVE_A", "n": 230, "cure_fraction": 0.18, "base_hazard": 0.18, "hr_treated": 0.79, "censor_low": 8.0, "censor_high": 22.0},
                {"id": "CURVE_B", "n": 240, "cure_fraction": 0.26, "base_hazard": 0.11, "hr_treated": 0.88, "censor_low": 10.0, "censor_high": 24.0},
                {"id": "CURVE_C", "n": 250, "cure_fraction": 0.31, "base_hazard": 0.09, "hr_treated": 0.80, "censor_low": 12.0, "censor_high": 28.0},
                {"id": "CURVE_D", "n": 220, "cure_fraction": 0.22, "base_hazard": 0.14, "hr_treated": 0.74, "censor_low": 9.0, "censor_high": 23.0},
            ],
        },
    ]

    generated: dict[str, list[dict[str, Any]]] = {}
    for offset, scenario in enumerate(scenarios):
        rng = random.Random(seed + 1000 + offset)
        rows: list[dict[str, Any]] = []
        for study in scenario["studies"]:
            for idx in range(int(study["n"])):
                treatment = 1 if rng.random() < 0.5 else 0
                cured = 1 if rng.random() < float(study["cure_fraction"]) else 0
                event_time = _rexp(
                    rng,
                    float(study["base_hazard"]) * (float(study["hr_treated"]) if treatment == 1 else 1.0),
                )
                censor_time = _uniform(rng, float(study["censor_low"]), float(study["censor_high"]))
                if cured:
                    time_months = censor_time
                    event = 0
                else:
                    time_months = min(event_time, censor_time)
                    event = 1 if event_time <= censor_time else 0
                rows.append(
                    {
                        "study_id": study["id"],
                        "patient_id": f"{study['id']}_{idx:04d}",
                        "treatment": treatment,
                        "time_months": round(max(time_months, 1e-6), 6),
                        "event": event,
                    }
                )
        generated[scenario["name"]] = rows
    return generated


def _generate_competing_rows(seed: int) -> dict[str, list[dict[str, Any]]]:
    scenarios = [
        {
            "name": "competing_primary_benefit",
            "studies": [
                {"id": "CR_A", "n": 280, "base_primary": 0.09, "base_competing": 0.05, "hr_primary_treated": 0.73, "hr_competing_treated": 0.95, "censor_low": 8.0, "censor_high": 24.0},
                {"id": "CR_B", "n": 260, "base_primary": 0.07, "base_competing": 0.04, "hr_primary_treated": 0.81, "hr_competing_treated": 1.02, "censor_low": 10.0, "censor_high": 26.0},
                {"id": "CR_C", "n": 250, "base_primary": 0.11, "base_competing": 0.03, "hr_primary_treated": 0.76, "hr_competing_treated": 0.97, "censor_low": 7.0, "censor_high": 20.0},
                {"id": "CR_D", "n": 270, "base_primary": 0.08, "base_competing": 0.06, "hr_primary_treated": 0.79, "hr_competing_treated": 0.92, "censor_low": 9.0, "censor_high": 25.0},
            ],
        },
        {
            "name": "competing_tradeoff",
            "studies": [
                {"id": "SHIFT_A", "n": 260, "base_primary": 0.08, "base_competing": 0.05, "hr_primary_treated": 0.83, "hr_competing_treated": 1.08, "censor_low": 9.0, "censor_high": 24.0},
                {"id": "SHIFT_B", "n": 250, "base_primary": 0.06, "base_competing": 0.05, "hr_primary_treated": 0.88, "hr_competing_treated": 1.16, "censor_low": 10.0, "censor_high": 26.0},
                {"id": "SHIFT_C", "n": 280, "base_primary": 0.10, "base_competing": 0.04, "hr_primary_treated": 0.79, "hr_competing_treated": 1.12, "censor_low": 8.0, "censor_high": 22.0},
                {"id": "SHIFT_D", "n": 270, "base_primary": 0.07, "base_competing": 0.06, "hr_primary_treated": 0.85, "hr_competing_treated": 1.05, "censor_low": 11.0, "censor_high": 28.0},
            ],
        },
    ]

    generated: dict[str, list[dict[str, Any]]] = {}
    for offset, scenario in enumerate(scenarios):
        rng = random.Random(seed + 2000 + offset)
        rows: list[dict[str, Any]] = []
        for study in scenario["studies"]:
            for idx in range(int(study["n"])):
                treatment = 1 if rng.random() < 0.5 else 0
                t_primary = _rexp(
                    rng,
                    float(study["base_primary"]) * (float(study["hr_primary_treated"]) if treatment == 1 else 1.0),
                )
                t_competing = _rexp(
                    rng,
                    float(study["base_competing"]) * (float(study["hr_competing_treated"]) if treatment == 1 else 1.0),
                )
                censor_time = _uniform(rng, float(study["censor_low"]), float(study["censor_high"]))
                time_months = min(t_primary, t_competing, censor_time)
                if time_months == censor_time:
                    event = 0
                elif t_primary < t_competing:
                    event = 1
                else:
                    event = 2
                rows.append(
                    {
                        "study_id": study["id"],
                        "patient_id": f"{study['id']}_{idx:04d}",
                        "treatment": treatment,
                        "time_months": round(max(time_months, 1e-6), 6),
                        "event": event,
                    }
                )
        generated[scenario["name"]] = rows
    return generated


def _generate_advanced_datasets(seed: int) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for name, rows in _generate_cure_rows(seed).items():
        out[name] = {"type": "cure", "rows": rows}
    for name, rows in _generate_competing_rows(seed).items():
        out[name] = {"type": "competing", "rows": rows}
    return out


def _run_app(app_path: Path, advanced_datasets: dict[str, dict[str, Any]]) -> dict[str, Any]:
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")

    driver = create_edge_driver(options)
    out: dict[str, Any] = {"advanced": {}}

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
              typeof buildValidatedSurvivalFeatureBundle === 'function' &&
              typeof BeyondR40 === 'object' &&
              BeyondR40 &&
              typeof BeyondR40.cureFractionMA === 'function' &&
              typeof BeyondR40.competingRisksMA === 'function'
            );
            """
        )
        if not ready:
            raise RuntimeError("Advanced survival benchmark functions are not available in page context")

        for scenario_name, payload in advanced_datasets.items():
            rows = payload["rows"]
            scenario_type = payload["type"]
            result = driver.execute_script(
                """
                const rows = arguments[0];
                const scenarioType = arguments[1];
                const bundle = buildValidatedSurvivalFeatureBundle(rows, {
                  studyVar: 'study_id',
                  treatmentVar: 'treatment',
                  timeVar: 'time_months',
                  eventVar: 'event'
                });
                let meta = null;
                if (bundle && !bundle.error) {
                  if (scenarioType === 'cure') meta = BeyondR40.cureFractionMA(bundle.studies);
                  else if (scenarioType === 'competing') meta = BeyondR40.competingRisksMA(bundle.studies);
                }
                return {
                  scenario_type: scenarioType,
                  n: rows.length,
                  n_studies: bundle && bundle.nStudies ? bundle.nStudies : null,
                  app: { bundle: bundle, meta: meta },
                  rows: rows
                };
                """,
                rows,
                scenario_type,
            )
            out["advanced"][scenario_name] = result
    finally:
        driver.quit()

    return out


def _run_r_reference(rscript: Path, app_results: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "advanced": {
            name: {
                "scenario_type": ds["scenario_type"],
                "tau": (((ds.get("app") or {}).get("bundle") or {}).get("tau")),
                "rows": ds["rows"],
            }
            for name, ds in app_results["advanced"].items()
        }
    }

    temp_root = _windows_temp_root()
    with tempfile.TemporaryDirectory(
        prefix="ipd_adv_surv_r_",
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
suppressPackageStartupMessages(library(cmprsk))
suppressPackageStartupMessages(library(flexsurvcure))
suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(survival))

args <- commandArgs(trailingOnly = TRUE)
inp <- fromJSON(args[1], simplifyVector = FALSE)
out <- list(advanced = list())

for (ds_name in names(inp$advanced)) {
  ds <- inp$advanced[[ds_name]]
  rows <- ds$rows
  df <- as.data.frame(do.call(rbind, lapply(rows, as.data.frame)))
  if (nrow(df) == 0) {
    out$advanced[[ds_name]] <- list(scenario_type = ds$scenario_type, meta = list(error = "No rows provided"))
    next
  }

  df$study_id <- as.factor(df$study_id)
  df$treatment <- as.numeric(df$treatment)
  df$time_months <- pmax(as.numeric(df$time_months), 1e-6)
  df$event <- as.numeric(df$event)
  df <- df[is.finite(df$time_months) & is.finite(df$event) & is.finite(df$treatment), ]

  if (identical(ds$scenario_type, "cure")) {
    study_rows <- list()
    for (study_id in levels(df$study_id)) {
      sdat <- df[df$study_id == study_id, , drop = FALSE]
      if (nrow(sdat) < 20 || length(unique(sdat$treatment)) < 2) next
      fit <- tryCatch(
        flexsurvcure(
          Surv(time_months, event) ~ 1,
          anc = list(rate = ~ treatment),
          data = sdat,
          dist = "exp",
          link = "logistic",
          mixture = TRUE
        ),
        error = function(e) e
      )
      if (inherits(fit, "error")) next
      coefs <- coef(fit)
      vcv <- vcov(fit)
      theta_name <- names(coefs)[grepl("^theta$", names(coefs))]
      rate_name <- names(coefs)[grepl("^rate\\(treatment\\)$", names(coefs))]
      if (length(theta_name) != 1 || length(rate_name) != 1) next
      theta <- as.numeric(coefs[[theta_name]])
      theta_se <- as.numeric(sqrt(vcv[theta_name, theta_name]))
      beta <- as.numeric(coefs[[rate_name]])
      beta_se <- as.numeric(sqrt(vcv[rate_name, rate_name]))
      p <- plogis(theta)
      study_rows[[length(study_rows) + 1]] <- list(
        study = as.character(study_id),
        cure_fraction = as.numeric(p),
        cure_logit = theta,
        cure_se = as.numeric(theta_se * p * (1 - p)),
        hr_uncured = as.numeric(exp(beta)),
        hr_se = beta_se
      )
    }

    if (length(study_rows) < 2) {
      out$advanced[[ds_name]] <- list(
        scenario_type = ds$scenario_type,
        study_rows = study_rows,
        meta = list(error = "Need at least 2 analyzable cure studies")
      )
      next
    }

    cf_yi <- sapply(study_rows, function(x) x$cure_logit)
    cf_vi <- sapply(study_rows, function(x) (x$cure_se / max(x$cure_fraction * (1 - x$cure_fraction), 1e-9))^2)
    cf_meta <- rma.uni(yi = cf_yi, vi = cf_vi, method = "REML")
    cf_est <- as.numeric(coef(cf_meta)[1])
    cf_se <- as.numeric(cf_meta$se[1])

    hr_yi <- sapply(study_rows, function(x) log(x$hr_uncured))
    hr_vi <- sapply(study_rows, function(x) x$hr_se^2)
    hr_meta <- rma.uni(yi = hr_yi, vi = hr_vi, method = "REML")
    hr_est <- as.numeric(coef(hr_meta)[1])
    hr_se <- as.numeric(hr_meta$se[1])

    out$advanced[[ds_name]] <- list(
      scenario_type = ds$scenario_type,
      study_rows = study_rows,
      meta = list(
        cureFraction = list(
          pooled = as.numeric(plogis(cf_est)),
          logitEstimate = cf_est,
          se = cf_se,
          ci = list(
            lower = as.numeric(plogis(cf_est - qnorm(0.975) * cf_se)),
            upper = as.numeric(plogis(cf_est + qnorm(0.975) * cf_se))
          ),
          tau2 = as.numeric(cf_meta$tau2),
          I2 = as.numeric(cf_meta$I2),
          nStudies = length(study_rows)
        ),
        hrUncured = list(
          pooled = as.numeric(exp(hr_est)),
          logHR = hr_est,
          se = hr_se,
          ci = list(
            lower = as.numeric(exp(hr_est - qnorm(0.975) * hr_se)),
            upper = as.numeric(exp(hr_est + qnorm(0.975) * hr_se))
          )
        )
      )
    )
  } else if (identical(ds$scenario_type, "competing")) {
    causes <- sort(unique(df$event[df$event > 0]))
    horizon <- suppressWarnings(as.numeric(ds$tau))
    if (!is.finite(horizon) || horizon <= 0) horizon <- as.numeric(stats::quantile(df$time_months, probs = 0.8, na.rm = TRUE))
    study_rows <- list()
    for (study_id in levels(df$study_id)) {
      sdat <- df[df$study_id == study_id, , drop = FALSE]
      if (nrow(sdat) < 20 || length(unique(sdat$treatment)) < 2) next
      row <- list(study = as.character(study_id))
      analyzable <- FALSE
      ci <- tryCatch(
        cuminc(sdat$time_months, sdat$event, group = sdat$treatment, cencode = 0),
        error = function(e) e
      )
      ci_tp <- if (!inherits(ci, "error")) tryCatch(timepoints(ci, times = horizon), error = function(e) e) else ci
      for (cause in causes) {
        fit <- tryCatch(
          crr(
            ftime = sdat$time_months,
            fstatus = sdat$event,
            cov1 = matrix(sdat$treatment, ncol = 1),
            failcode = cause,
            cencode = 0
          ),
          error = function(e) e
        )
        if (inherits(fit, "error")) next
        beta <- as.numeric(fit$coef[1])
        se <- tryCatch(as.numeric(sqrt(diag(fit$var))[1]), error = function(e) NA_real_)
        if (!is.finite(beta) || !is.finite(se) || !(se > 0)) next
        analyzable <- TRUE
        row[[paste0("cause", cause, "_cshr")]] <- as.numeric(exp(beta))
        row[[paste0("cause", cause, "_se")]] <- se
        if (!inherits(ci, "error") && !inherits(ci_tp, "error")) {
          treated_name <- paste0("1 ", cause)
          control_name <- paste0("0 ", cause)
          est_mat <- ci_tp$est
          var_mat <- ci_tp$var
          if (!is.null(est_mat) && treated_name %in% rownames(est_mat) && control_name %in% rownames(est_mat)) {
            cif_treated <- as.numeric(est_mat[treated_name, 1])
            cif_control <- as.numeric(est_mat[control_name, 1])
            row[[paste0("cause", cause, "_cif_treated")]] <- cif_treated
            row[[paste0("cause", cause, "_cif_control")]] <- cif_control
            row[[paste0("cause", cause, "_cif_rd")]] <- cif_treated - cif_control
            if (!is.null(var_mat) && treated_name %in% rownames(var_mat) && control_name %in% rownames(var_mat)) {
              v_treated <- as.numeric(var_mat[treated_name, 1])
              v_control <- as.numeric(var_mat[control_name, 1])
              if (is.finite(v_treated) && is.finite(v_control) && v_treated >= 0 && v_control >= 0) {
                row[[paste0("cause", cause, "_cif_se")]] <- sqrt(v_treated + v_control)
              }
            }
            row[[paste0("cause", cause, "_cif_horizon")]] <- horizon
          }
        }
        if (!inherits(ci, "error") && !is.null(ci$Tests) && as.character(cause) %in% rownames(ci$Tests)) {
          gray_p <- as.numeric(ci$Tests[as.character(cause), "pv"])
          if (is.finite(gray_p)) row[[paste0("cause", cause, "_gray_p")]] <- gray_p
        }
      }
      if (analyzable) study_rows[[length(study_rows) + 1]] <- row
    }

    cause_results <- list()
    for (cause in causes) {
      cshr_key <- paste0("cause", cause, "_cshr")
      se_key <- paste0("cause", cause, "_se")
      analyzable <- Filter(function(x) !is.null(x[[cshr_key]]) && !is.null(x[[se_key]]), study_rows)
      if (length(analyzable) < 2) next
      yi <- sapply(analyzable, function(x) log(x[[cshr_key]]))
      vi <- sapply(analyzable, function(x) x[[se_key]]^2)
      meta <- rma.uni(yi = yi, vi = vi, method = "REML")
      est <- as.numeric(coef(meta)[1])
      se <- as.numeric(meta$se[1])
      cif_key <- paste0("cause", cause, "_cif_rd")
      cif_se_key <- paste0("cause", cause, "_cif_se")
      horizon_key <- paste0("cause", cause, "_cif_horizon")
      gray_key <- paste0("cause", cause, "_gray_p")
      cif_rows <- Filter(function(x) !is.null(x[[cif_key]]) && !is.null(x[[cif_se_key]]) && is.finite(x[[cif_se_key]]) && x[[cif_se_key]] > 0, study_rows)
      cif_meta <- NULL
      if (length(cif_rows) >= 2) {
        cif_meta <- rma.uni(
          yi = sapply(cif_rows, function(x) x[[cif_key]]),
          vi = sapply(cif_rows, function(x) x[[cif_se_key]]^2),
          method = "REML"
        )
      }
      gray_rows <- Filter(function(x) !is.null(x[[gray_key]]) && is.finite(x[[gray_key]]) && x[[gray_key]] > 0 && x[[gray_key]] <= 1, study_rows)
      combined_gray <- NULL
      if (length(gray_rows) >= 2) {
        fisher_stat <- -2 * sum(log(pmax(sapply(gray_rows, function(x) x[[gray_key]]), 1e-12)))
        fisher_df <- 2 * length(gray_rows)
        combined_gray <- list(
          method = "Fisher combination of study-level Gray tests",
          statistic = fisher_stat,
          df = fisher_df,
          pValue = as.numeric(stats::pchisq(fisher_stat, df = fisher_df, lower.tail = FALSE)),
          nStudies = length(gray_rows)
        )
      }
      cause_results[[paste0("cause", cause)]] <- list(
        cause = paste0("cause", cause),
        nStudies = length(analyzable),
        pooledCSHR = as.numeric(exp(est)),
        logCSHR = est,
        se = se,
        ci = list(
          lower = as.numeric(exp(est - qnorm(0.975) * se)),
          upper = as.numeric(exp(est + qnorm(0.975) * se))
        ),
        tau2 = as.numeric(meta$tau2),
        I2 = as.numeric(meta$I2),
        pooledCIFDifference = if (!is.null(cif_meta)) list(
          pooled = as.numeric(coef(cif_meta)[1]),
          se = as.numeric(cif_meta$se[1]),
          ci = list(
            lower = as.numeric(coef(cif_meta)[1] - qnorm(0.975) * cif_meta$se[1]),
            upper = as.numeric(coef(cif_meta)[1] + qnorm(0.975) * cif_meta$se[1])
          ),
          tau2 = as.numeric(cif_meta$tau2),
          I2 = as.numeric(cif_meta$I2),
          nStudies = length(cif_rows),
          horizon = if (length(cif_rows)) as.numeric(cif_rows[[1]][[horizon_key]]) else horizon
        ) else NULL,
        combinedGrayTest = combined_gray
      )
    }

    meta <- if (length(cause_results)) {
      list(causeSpecificResults = cause_results)
    } else {
      list(error = "Need at least 2 analyzable competing-risk studies per cause")
    }
    out$advanced[[ds_name]] <- list(
      scenario_type = ds$scenario_type,
      study_rows = study_rows,
      meta = meta
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
                "R advanced-survival benchmark failed\n"
                f"STDOUT:\n{completed.stdout}\n\nSTDERR:\n{completed.stderr}"
            )
        return json.loads(output_json.read_text(encoding="utf-8"))


def _compare(app_results: dict[str, Any], r_results: dict[str, Any]) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    cure_rows: list[dict[str, Any]] = []
    competing_rows: list[dict[str, Any]] = []

    for dataset, ds in app_results["advanced"].items():
        scenario_type = ds["scenario_type"]
        app_meta = (ds.get("app") or {}).get("meta") or {}
        ref_meta = ((r_results.get("advanced") or {}).get(dataset) or {}).get("meta") or {}

        if scenario_type == "cure":
            app_cf = (app_meta.get("cureFraction") or {}) if isinstance(app_meta, dict) else {}
            ref_cf = (ref_meta.get("cureFraction") or {}) if isinstance(ref_meta, dict) else {}
            app_hr = (app_meta.get("hrUncured") or {}) if isinstance(app_meta, dict) else {}
            ref_hr = (ref_meta.get("hrUncured") or {}) if isinstance(ref_meta, dict) else {}
            row = {
                "track": "cure_meta",
                "dataset": dataset,
                "app": app_meta,
                "r": ref_meta,
                "diff": {
                    "cure_pooled_abs": _abs_diff(_to_float(app_cf.get("pooled")), _to_float(ref_cf.get("pooled"))),
                    "cure_logit_abs": _abs_diff(_to_float(app_cf.get("logitEstimate")), _to_float(ref_cf.get("logitEstimate"))),
                    "cure_se_abs": _abs_diff(_to_float(app_cf.get("se")), _to_float(ref_cf.get("se"))),
                    "hr_log_abs": _abs_diff(_to_float(app_hr.get("logHR")), _to_float(ref_hr.get("logHR"))),
                    "hr_se_abs": _abs_diff(_to_float(app_hr.get("se")), _to_float(ref_hr.get("se"))),
                    "hr_pooled_abs": _abs_diff(_to_float(app_hr.get("pooled")), _to_float(ref_hr.get("pooled"))),
                },
            }
            row["pass"] = bool(
                row["diff"]["cure_pooled_abs"] is not None
                and row["diff"]["cure_pooled_abs"] <= CURE_POOLED_TOL
                and row["diff"]["cure_logit_abs"] is not None
                and row["diff"]["cure_logit_abs"] <= CURE_LOGIT_TOL
                and row["diff"]["cure_se_abs"] is not None
                and row["diff"]["cure_se_abs"] <= CURE_SE_TOL
                and row["diff"]["hr_log_abs"] is not None
                and row["diff"]["hr_log_abs"] <= CURE_HR_LOG_TOL
                and row["diff"]["hr_se_abs"] is not None
                and row["diff"]["hr_se_abs"] <= CURE_HR_SE_TOL
                and not app_meta.get("error")
                and not ref_meta.get("error")
            )
            cure_rows.append(row)
            rows.append(row)
            continue

        app_causes = ((app_meta.get("causeSpecificResults") or {}) if isinstance(app_meta, dict) else {})
        ref_causes = ((ref_meta.get("causeSpecificResults") or {}) if isinstance(ref_meta, dict) else {})
        for cause in sorted(set(app_causes.keys()) | set(ref_causes.keys())):
            app_row = app_causes.get(cause) or {}
            ref_row = ref_causes.get(cause) or {}
            app_cif = app_row.get("pooledCIFDifference") or {}
            ref_cif = ref_row.get("pooledCIFDifference") or {}
            app_gray = app_row.get("combinedGrayTest") or {}
            ref_gray = ref_row.get("combinedGrayTest") or {}
            row = {
                "track": "competing_meta",
                "dataset": dataset,
                "cause": cause,
                "app": app_row,
                "r": ref_row,
                "diff": {
                    "cshr_abs": _abs_diff(_to_float(app_row.get("pooledCSHR")), _to_float(ref_row.get("pooledCSHR"))),
                    "logcshr_abs": _abs_diff(_to_float(app_row.get("logCSHR")), _to_float(ref_row.get("logCSHR"))),
                    "se_abs": _abs_diff(_to_float(app_row.get("se")), _to_float(ref_row.get("se"))),
                    "cif_rd_abs": _abs_diff(_to_float(app_cif.get("pooled")), _to_float(ref_cif.get("pooled"))),
                    "gray_logp_abs": _abs_diff(_log_p_value(app_gray.get("pValue")), _log_p_value(ref_gray.get("pValue"))),
                },
            }
            row["pass"] = bool(
                row["diff"]["logcshr_abs"] is not None
                and row["diff"]["logcshr_abs"] <= COMPETING_LOGHR_TOL
                and row["diff"]["se_abs"] is not None
                and row["diff"]["se_abs"] <= COMPETING_SE_TOL
                and row["diff"]["cif_rd_abs"] is not None
                and row["diff"]["cif_rd_abs"] <= COMPETING_CIF_RD_TOL
                and row["diff"]["gray_logp_abs"] is not None
                and row["diff"]["gray_logp_abs"] <= COMPETING_GRAY_LOGP_TOL
            )
            competing_rows.append(row)
            rows.append(row)

    summary = {
        "rows": len(rows),
        "overall_pass_rate": (sum(1 for r in rows if r["pass"]) / len(rows)) if rows else None,
        "cure_pass_rate": (sum(1 for r in cure_rows if r["pass"]) / len(cure_rows)) if cure_rows else None,
        "competing_pass_rate": (sum(1 for r in competing_rows if r["pass"]) / len(competing_rows)) if competing_rows else None,
        "max_abs_diff": {
            "cure_pooled": max((r["diff"]["cure_pooled_abs"] for r in cure_rows if r["diff"]["cure_pooled_abs"] is not None), default=None),
            "cure_logit": max((r["diff"]["cure_logit_abs"] for r in cure_rows if r["diff"]["cure_logit_abs"] is not None), default=None),
            "cure_se": max((r["diff"]["cure_se_abs"] for r in cure_rows if r["diff"]["cure_se_abs"] is not None), default=None),
            "cure_hr_log": max((r["diff"]["hr_log_abs"] for r in cure_rows if r["diff"]["hr_log_abs"] is not None), default=None),
            "cure_hr_se": max((r["diff"]["hr_se_abs"] for r in cure_rows if r["diff"]["hr_se_abs"] is not None), default=None),
            "competing_logcshr": max((r["diff"]["logcshr_abs"] for r in competing_rows if r["diff"]["logcshr_abs"] is not None), default=None),
            "competing_se": max((r["diff"]["se_abs"] for r in competing_rows if r["diff"]["se_abs"] is not None), default=None),
            "competing_cif_rd": max((r["diff"]["cif_rd_abs"] for r in competing_rows if r["diff"]["cif_rd_abs"] is not None), default=None),
            "competing_gray_logp": max((r["diff"]["gray_logp_abs"] for r in competing_rows if r["diff"]["gray_logp_abs"] is not None), default=None),
        },
        "mean_abs_diff": {
            "cure_pooled": (
                statistics.mean([r["diff"]["cure_pooled_abs"] for r in cure_rows if r["diff"]["cure_pooled_abs"] is not None])
                if any(r["diff"]["cure_pooled_abs"] is not None for r in cure_rows)
                else None
            ),
            "cure_logit": (
                statistics.mean([r["diff"]["cure_logit_abs"] for r in cure_rows if r["diff"]["cure_logit_abs"] is not None])
                if any(r["diff"]["cure_logit_abs"] is not None for r in cure_rows)
                else None
            ),
            "cure_se": (
                statistics.mean([r["diff"]["cure_se_abs"] for r in cure_rows if r["diff"]["cure_se_abs"] is not None])
                if any(r["diff"]["cure_se_abs"] is not None for r in cure_rows)
                else None
            ),
            "cure_hr_log": (
                statistics.mean([r["diff"]["hr_log_abs"] for r in cure_rows if r["diff"]["hr_log_abs"] is not None])
                if any(r["diff"]["hr_log_abs"] is not None for r in cure_rows)
                else None
            ),
            "cure_hr_se": (
                statistics.mean([r["diff"]["hr_se_abs"] for r in cure_rows if r["diff"]["hr_se_abs"] is not None])
                if any(r["diff"]["hr_se_abs"] is not None for r in cure_rows)
                else None
            ),
            "competing_logcshr": (
                statistics.mean([r["diff"]["logcshr_abs"] for r in competing_rows if r["diff"]["logcshr_abs"] is not None])
                if any(r["diff"]["logcshr_abs"] is not None for r in competing_rows)
                else None
            ),
            "competing_se": (
                statistics.mean([r["diff"]["se_abs"] for r in competing_rows if r["diff"]["se_abs"] is not None])
                if any(r["diff"]["se_abs"] is not None for r in competing_rows)
                else None
            ),
            "competing_cif_rd": (
                statistics.mean([r["diff"]["cif_rd_abs"] for r in competing_rows if r["diff"]["cif_rd_abs"] is not None])
                if any(r["diff"]["cif_rd_abs"] is not None for r in competing_rows)
                else None
            ),
            "competing_gray_logp": (
                statistics.mean([r["diff"]["gray_logp_abs"] for r in competing_rows if r["diff"]["gray_logp_abs"] is not None])
                if any(r["diff"]["gray_logp_abs"] is not None for r in competing_rows)
                else None
            ),
        },
    }
    return {"rows": rows, "summary": summary}


def _fmt(v: float | None, digits: int = 6) -> str:
    if v is None:
        return "NA"
    return f"{v:.{digits}f}"


def _write_markdown(path: Path, comparison: dict[str, Any], datasets: dict[str, dict[str, Any]], seed: int) -> None:
    summary = comparison["summary"]
    rows = comparison["rows"]
    cure_names = [name for name, ds in datasets.items() if ds["type"] == "cure"]
    competing_names = [name for name, ds in datasets.items() if ds["type"] == "competing"]
    lines = [
        "# Advanced Survival Benchmark vs R",
        "",
        f"- Cure scenarios: `{', '.join(cure_names)}`",
        f"- Competing-risk scenarios: `{', '.join(competing_names)}`",
        f"- Seed: `{seed}`",
        f"- Overall pass rate: `{_fmt(summary.get('overall_pass_rate'), 3)}`",
        f"- Cure-model pass rate: `{_fmt(summary.get('cure_pass_rate'), 3)}`",
        f"- Competing-risks pass rate: `{_fmt(summary.get('competing_pass_rate'), 3)}`",
        "",
        "## Tolerances",
        "",
        f"- Cure pooled fraction diff <= `{CURE_POOLED_TOL}`",
        f"- Cure pooled logit diff <= `{CURE_LOGIT_TOL}`",
        f"- Cure pooled SE diff <= `{CURE_SE_TOL}`",
        f"- Uncured HR log diff <= `{CURE_HR_LOG_TOL}`",
        f"- Uncured HR SE diff <= `{CURE_HR_SE_TOL}`",
        f"- Competing-risk pooled log-SHR diff <= `{COMPETING_LOGHR_TOL}`",
        f"- Competing-risk pooled SE diff <= `{COMPETING_SE_TOL}`",
        f"- Competing-risk pooled CIF-RD diff <= `{COMPETING_CIF_RD_TOL}`",
        f"- Competing-risk combined Gray log-p diff <= `{COMPETING_GRAY_LOGP_TOL}`",
        "",
        "## Rows",
        "",
        "| Track | Dataset | Cause | Diff 1 | Diff 2 | Diff 3 | Pass |",
        "|---|---|---|---:|---:|---:|:---:|",
    ]
    for row in rows:
        diff = row["diff"]
        if row["track"] == "cure_meta":
            d1 = diff.get("cure_pooled_abs")
            d2 = diff.get("hr_log_abs")
            d3 = diff.get("cure_se_abs")
        else:
            d1 = diff.get("logcshr_abs")
            d2 = diff.get("cif_rd_abs")
            d3 = diff.get("gray_logp_abs")
        lines.append(
            f"| {row['track']} | {row['dataset']} | {row.get('cause', '-')} | "
            f"{_fmt(d1)} | {_fmt(d2)} | {_fmt(d3)} | {'YES' if row['pass'] else 'NO'} |"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark advanced survival methods against R references.")
    parser.add_argument(
        "--app",
        type=Path,
        default=_repo_root() / "ipd-meta-pro.html",
        help="Path to ipd-meta-pro.html",
    )
    parser.add_argument("--rscript", type=str, default=None, help="Path to Rscript executable")
    parser.add_argument("--seed", type=int, default=42, help="Deterministic seed for synthetic cohorts")
    parser.add_argument(
        "--output-json",
        type=Path,
        default=_repo_root() / "dev" / "benchmarks" / "latest_advanced_survival_r_benchmark.json",
        help="Output JSON path",
    )
    parser.add_argument(
        "--output-md",
        type=Path,
        default=_repo_root() / "dev" / "benchmarks" / "latest_advanced_survival_r_benchmark.md",
        help="Output Markdown path",
    )
    args = parser.parse_args()

    rscript = _find_rscript(args.rscript)
    datasets = _generate_advanced_datasets(args.seed)
    app_results = _run_app(args.app, datasets)
    r_results = _run_r_reference(rscript, app_results)
    comparison = _compare(app_results, r_results)

    output = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "app_path": str(args.app),
        "app_build_id": _app_build_id(args.app),
        "rscript": str(rscript),
        "seed": args.seed,
        "scenario_types": {name: ds["type"] for name, ds in datasets.items()},
        "tolerances": {
            "cure_pooled_abs": CURE_POOLED_TOL,
            "cure_logit_abs": CURE_LOGIT_TOL,
            "cure_se_abs": CURE_SE_TOL,
            "cure_hr_log_abs": CURE_HR_LOG_TOL,
            "cure_hr_se_abs": CURE_HR_SE_TOL,
            "competing_logcshr_abs": COMPETING_LOGHR_TOL,
            "competing_se_abs": COMPETING_SE_TOL,
            "competing_cif_rd_abs": COMPETING_CIF_RD_TOL,
            "competing_gray_logp_abs": COMPETING_GRAY_LOGP_TOL,
        },
        "app": app_results,
        "r": r_results,
        "comparison": comparison,
        "summary": comparison["summary"],
    }

    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(output, indent=2), encoding="utf-8")
    _write_markdown(args.output_md, comparison, datasets, args.seed)

    print("=" * 72)
    print("IPD Meta-Analysis Pro - Advanced Survival Benchmark")
    print("=" * 72)
    print(f"App: {args.app}")
    print(f"Rscript: {rscript}")
    print(f"Scenarios: {', '.join(sorted(datasets.keys()))}")
    print()
    print("Benchmark complete.")
    print(f"JSON: {args.output_json}")
    print(f"Markdown: {args.output_md}")
    print(f"Overall pass rate: {_fmt(output['summary'].get('overall_pass_rate'), 3)}")
    print(f"Cure-model pass rate: {_fmt(output['summary'].get('cure_pass_rate'), 3)}")
    print(f"Competing-risks pass rate: {_fmt(output['summary'].get('competing_pass_rate'), 3)}")


if __name__ == "__main__":
    main()
