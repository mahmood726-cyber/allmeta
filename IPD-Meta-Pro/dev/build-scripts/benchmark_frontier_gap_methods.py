#!/usr/bin/env python3
"""Benchmark frontier gap methods (Loop 3/4/6, no turnkey R CRAN workflow) in-app."""

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

DEFAULT_DATASETS = ["hiv_survival", "ovarian_survival"]

KM_MIN_IMPUTATIONS = 20
KM_MAX_EVENT_FLIP_RATE = 0.10
FEDERATED_MAX_UTILITY_GAP = 0.25
TRANSPORT_IOW_MAX_POST_SMD = 0.25
TRANSPORT_MIN_SCENARIOS = 7
TRANSPORT_OVERLAP_MIN_SCENARIOS = 4
TRANSPORT_OVERLAP_MAX_STABLE_SPAN = 0.30


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


def _run_app(app_path: Path, datasets: list[str], seed: int, epsilon: float, n_imputations: int) -> dict[str, Any]:
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")

    driver = create_edge_driver(options)
    out: dict[str, Any] = {
        "km_reconstruction": {},
        "transport_iow": {},
        "federated_survival": {},
        "transport_sensitivity": {},
        "transport_overlap": {},
    }

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
              typeof BeyondR40.transportabilityIOWIPDMA === 'function' &&
              typeof BeyondR40.transportabilitySensitivityIPDMA === 'function' &&
              typeof BeyondR40.transportabilityOverlapStressIPDMA === 'function' &&
              typeof BeyondR40.kmReconstructionUncertaintyIPDMA === 'function' &&
              typeof BeyondR40.federatedPseudoObservationSurvivalIPDMA === 'function'
            );
            """
        )
        if not ready:
            raise RuntimeError("Frontier gap methods are not available in page context")

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

            try:
                km_payload = driver.execute_script(
                    """
                    const rows = window.currentData || APP.data || [];
                    const keys = Object.keys(rows[0] || {});
                    const pick = (cands) => {
                      for (const c of cands) if (keys.includes(c)) return c;
                      return null;
                    };
                    const categorical = () => {
                      const preferred = ['sex', 'gender', 'region', 'figo_stage', 'residual_disease'];
                      for (const p of preferred) {
                        if (!keys.includes(p)) continue;
                        const vals = rows.slice(0, 1500).map(r => r[p]).filter(v => v !== null && v !== undefined && v !== '');
                        const uniq = [...new Set(vals.map(v => String(v)))];
                        if (uniq.length >= 2 && uniq.length <= 6) return p;
                      }
                      for (const k of keys) {
                        const vals = rows.slice(0, 1500).map(r => r[k]).filter(v => v !== null && v !== undefined && v !== '');
                        const uniq = [...new Set(vals.map(v => String(v)))];
                        if (uniq.length >= 2 && uniq.length <= 6) return k;
                      }
                      return null;
                    };

                    const studyVar = pick(['study_id', 'study', 'trial']);
                    const treatmentVar = pick(['treatment', 'arm', 'group']);
                    const timeVar = pick(['time_months', 'time', 'os_time', 'survtime']);
                    const eventVar = pick(['event', 'status', 'death']);
                    const subgroupVar = categorical();

                    let app = null;
                    let err = null;
                    try {
                      if (!studyVar || !treatmentVar || !timeVar || !eventVar || !subgroupVar) {
                        throw new Error('Could not infer variables');
                      }
                      app = BeyondR40.kmReconstructionUncertaintyIPDMA(
                        rows,
                        timeVar,
                        eventVar,
                        treatmentVar,
                        subgroupVar,
                        studyVar,
                        arguments[0],
                        0.90,
                        0.08
                      );
                    } catch (e) {
                      err = String(e && e.message ? e.message : e);
                    }

                    return {
                      dataset: arguments[1],
                      n: rows.length,
                      n_studies: [...new Set(rows.map(r => r[studyVar]))].length,
                      inferred: {
                        study: studyVar,
                        treatment: treatmentVar,
                        time: timeVar,
                        event: eventVar,
                        subgroup: subgroupVar
                      },
                      app: {
                        error: app && app.error ? app.error : err,
                        n_imputations: app ? app.nImputations : null,
                        n_subgroups: app && app.subgroupPooledEffects ? app.subgroupPooledEffects.length : null,
                        event_flip_rate: app && app.uncertaintyDiagnostics ? app.uncertaintyDiagnostics.eventFlipRate : null,
                        interaction_se: app && app.interactionContrast ? app.interactionContrast.se : null,
                        interaction_p: app && app.interactionContrast ? app.interactionContrast.pValue : null,
                        subgroup_effects: app && app.subgroupPooledEffects ? app.subgroupPooledEffects : null
                      }
                    };
                    """,
                    n_imputations,
                    dataset,
                )
            except JavascriptException as exc:
                km_payload = {
                    "dataset": dataset,
                    "n": 0,
                    "n_studies": 0,
                    "inferred": {},
                    "app": {
                        "error": str(exc),
                        "n_imputations": None,
                        "n_subgroups": None,
                        "event_flip_rate": None,
                        "interaction_se": None,
                        "interaction_p": None,
                        "subgroup_effects": None,
                    },
                }
            out["km_reconstruction"][dataset] = km_payload

            try:
                transport_iow_payload = driver.execute_script(
                    """
                    const rows = window.currentData || APP.data || [];
                    const keys = Object.keys(rows[0] || {});
                    const pick = (cands) => {
                      for (const c of cands) if (keys.includes(c)) return c;
                      return null;
                    };
                    const studyVar = pick(['study_id', 'study', 'trial']);
                    const treatmentVar = pick(['treatment', 'arm', 'group']);
                    const outcomeVar = pick(['event', 'status', 'death', 'mace_event', 'mortality_28d', 'hamd_change', 'outcome', 'y']);
                    const domainVar = pick(['region', 'study_population', 'population']);

                    const excluded = [studyVar, treatmentVar, outcomeVar, domainVar].filter(Boolean);
                    const preferred = ['age', 'sex', 'bmi', 'hamd_baseline', 'baseline_cd4', 'baseline_viral_load', 'ldl_baseline'];
                    const covariates = [];
                    const sampleRows = rows.slice(0, 600);
                    const minFinite = Math.max(20, Math.floor(sampleRows.length * 0.2));

                    preferred.forEach((k) => {
                      if (!keys.includes(k) || excluded.includes(k) || covariates.includes(k)) return;
                      const vals = sampleRows.map(r => Number(r[k])).filter(v => Number.isFinite(v));
                      if (vals.length >= minFinite) covariates.push(k);
                    });
                    keys.forEach((k) => {
                      if (covariates.length >= 6 || excluded.includes(k) || covariates.includes(k)) return;
                      const vals = sampleRows.map(r => Number(r[k])).filter(v => Number.isFinite(v));
                      if (vals.length >= minFinite) covariates.push(k);
                    });

                    let app = null;
                    let err = null;
                    try {
                      if (!studyVar || !treatmentVar || !outcomeVar || covariates.length < 2) {
                        throw new Error('Could not infer variables');
                      }
                      app = BeyondR40.transportabilityIOWIPDMA(
                        rows,
                        outcomeVar,
                        treatmentVar,
                        covariates.slice(0, 6),
                        domainVar,
                        studyVar,
                        0.99
                      );
                    } catch (e) {
                      err = String(e && e.message ? e.message : e);
                    }

                    const estimates = app && app.effectEstimates ? app.effectEstimates : {};
                    const overlap = app && app.diagnostics && app.diagnostics.overlap ? app.diagnostics.overlap : {};
                    const weights = app && app.diagnostics && app.diagnostics.weights ? app.diagnostics.weights : {};
                    const balance = app && app.diagnostics && app.diagnostics.covariateBalance ? app.diagnostics.covariateBalance : {};

                    return {
                      dataset: arguments[0],
                      n: rows.length,
                      n_studies: [...new Set(rows.map(r => r[studyVar]))].length,
                      inferred: {
                        study: studyVar,
                        treatment: treatmentVar,
                        outcome: outcomeVar,
                        domain: domainVar,
                        covariates: covariates.slice(0, 6)
                      },
                      app: {
                        error: app && app.error ? app.error : err,
                        n_trial: app ? app.nTrial : null,
                        n_target: app ? app.nTarget : null,
                        target_definition: app ? app.targetDefinition : null,
                        sate: estimates && estimates.SATE ? estimates.SATE.estimate : null,
                        sate_se: estimates && estimates.SATE ? estimates.SATE.se : null,
                        tate: estimates && estimates.TATE ? estimates.TATE.estimate : null,
                        tate_se: estimates && estimates.TATE ? estimates.TATE.se : null,
                        transport_shift: estimates ? estimates.transportabilityShift : null,
                        transport_ratio: estimates ? estimates.transportabilityRatio : null,
                        overlap_fraction: overlap.overlapFraction,
                        ess: weights.effectiveSampleSize,
                        max_abs_smd_pre: balance.maxAbsSMD_Pre,
                        max_abs_smd_post: balance.maxAbsSMD_Post
                      }
                    };
                    """,
                    dataset,
                )
            except JavascriptException as exc:
                transport_iow_payload = {
                    "dataset": dataset,
                    "n": 0,
                    "n_studies": 0,
                    "inferred": {},
                    "app": {
                        "error": str(exc),
                        "n_trial": None,
                        "n_target": None,
                        "target_definition": None,
                        "sate": None,
                        "sate_se": None,
                        "tate": None,
                        "tate_se": None,
                        "transport_shift": None,
                        "transport_ratio": None,
                        "overlap_fraction": None,
                        "ess": None,
                        "max_abs_smd_pre": None,
                        "max_abs_smd_post": None,
                    },
                }
            out["transport_iow"][dataset] = transport_iow_payload

            try:
                transport_payload = driver.execute_script(
                    """
                    const rows = window.currentData || APP.data || [];
                    const keys = Object.keys(rows[0] || {});
                    const pick = (cands) => {
                      for (const c of cands) if (keys.includes(c)) return c;
                      return null;
                    };
                    const studyVar = pick(['study_id', 'study', 'trial']);
                    const treatmentVar = pick(['treatment', 'arm', 'group']);
                    const outcomeVar = pick(['event', 'status', 'death', 'mace_event', 'mortality_28d', 'hamd_change', 'outcome', 'y']);
                    const domainVar = pick(['region', 'study_population', 'population']);

                    const excluded = [studyVar, treatmentVar, outcomeVar, domainVar].filter(Boolean);
                    const preferred = ['age', 'sex', 'bmi', 'hamd_baseline', 'baseline_cd4', 'baseline_viral_load', 'ldl_baseline'];
                    const covariates = [];
                    const sampleRows = rows.slice(0, 600);
                    const minFinite = Math.max(20, Math.floor(sampleRows.length * 0.2));

                    preferred.forEach((k) => {
                      if (!keys.includes(k) || excluded.includes(k) || covariates.includes(k)) return;
                      const vals = sampleRows.map(r => Number(r[k])).filter(v => Number.isFinite(v));
                      if (vals.length >= minFinite) covariates.push(k);
                    });
                    keys.forEach((k) => {
                      if (covariates.length >= 6 || excluded.includes(k) || covariates.includes(k)) return;
                      const vals = sampleRows.map(r => Number(r[k])).filter(v => Number.isFinite(v));
                      if (vals.length >= minFinite) covariates.push(k);
                    });

                    let app = null;
                    let err = null;
                    try {
                      if (!studyVar || !treatmentVar || !outcomeVar || covariates.length < 2) {
                        throw new Error('Could not infer variables');
                      }
                      app = BeyondR40.transportabilitySensitivityIPDMA(
                        rows,
                        outcomeVar,
                        treatmentVar,
                        covariates.slice(0, 6),
                        domainVar,
                        studyVar,
                        0.99,
                        [-0.30, -0.20, -0.10, -0.05, 0, 0.05, 0.10, 0.20, 0.30]
                      );
                    } catch (e) {
                      err = String(e && e.message ? e.message : e);
                    }

                    const baseTATE = app && app.sensitivity ? app.sensitivity.baseTATE : null;
                    const baseSE = app && app.sensitivity ? app.sensitivity.baseSE : null;
                    const scenarios = app && app.sensitivity && Array.isArray(app.sensitivity.scenarios) ? app.sensitivity.scenarios : [];
                    const scenario0 = scenarios.find(s => Math.abs(Number(s.delta) || 0) < 1e-12) || null;
                    return {
                      dataset: arguments[0],
                      n: rows.length,
                      n_studies: [...new Set(rows.map(r => r[studyVar]))].length,
                      inferred: {
                        study: studyVar,
                        treatment: treatmentVar,
                        outcome: outcomeVar,
                        domain: domainVar,
                        covariates: covariates.slice(0, 6)
                      },
                      app: {
                        error: app && app.error ? app.error : err,
                        base_tate: baseTATE,
                        base_se: baseSE,
                        scenario_count: scenarios.length,
                        monotonic: app && app.sensitivity ? app.sensitivity.monotonicResponse : null,
                        zero_delta_matches_base: app && app.sensitivity ? app.sensitivity.zeroDeltaMatchesBase : null,
                        delta_needed_for_null: app && app.robustness ? app.robustness.deltaNeededForNull : null,
                        first_null_delta: app && app.robustness ? app.robustness.firstNullCompatibleDelta : null,
                        scenario0_tate: scenario0 ? scenario0.adjustedTATE : null
                      }
                    };
                    """,
                    dataset,
                )
            except JavascriptException as exc:
                transport_payload = {
                    "dataset": dataset,
                    "n": 0,
                    "n_studies": 0,
                    "inferred": {},
                    "app": {
                        "error": str(exc),
                        "base_tate": None,
                        "base_se": None,
                        "scenario_count": None,
                        "monotonic": None,
                        "zero_delta_matches_base": None,
                        "delta_needed_for_null": None,
                        "first_null_delta": None,
                        "scenario0_tate": None,
                    },
                }
            out["transport_sensitivity"][dataset] = transport_payload

            try:
                transport_overlap_payload = driver.execute_script(
                    """
                    const rows = window.currentData || APP.data || [];
                    const keys = Object.keys(rows[0] || {});
                    const pick = (cands) => {
                      for (const c of cands) if (keys.includes(c)) return c;
                      return null;
                    };
                    const studyVar = pick(['study_id', 'study', 'trial']);
                    const treatmentVar = pick(['treatment', 'arm', 'group']);
                    const outcomeVar = pick(['event', 'status', 'death', 'mace_event', 'mortality_28d', 'hamd_change', 'outcome', 'y']);
                    const domainVar = pick(['region', 'study_population', 'population']);

                    const excluded = [studyVar, treatmentVar, outcomeVar, domainVar].filter(Boolean);
                    const preferred = ['age', 'sex', 'bmi', 'hamd_baseline', 'baseline_cd4', 'baseline_viral_load', 'ldl_baseline'];
                    const covariates = [];
                    const sampleRows = rows.slice(0, 600);
                    const minFinite = Math.max(20, Math.floor(sampleRows.length * 0.2));

                    preferred.forEach((k) => {
                      if (!keys.includes(k) || excluded.includes(k) || covariates.includes(k)) return;
                      const vals = sampleRows.map(r => Number(r[k])).filter(v => Number.isFinite(v));
                      if (vals.length >= minFinite) covariates.push(k);
                    });
                    keys.forEach((k) => {
                      if (covariates.length >= 6 || excluded.includes(k) || covariates.includes(k)) return;
                      const vals = sampleRows.map(r => Number(r[k])).filter(v => Number.isFinite(v));
                      if (vals.length >= minFinite) covariates.push(k);
                    });

                    let app = null;
                    let err = null;
                    try {
                      if (!studyVar || !treatmentVar || !outcomeVar || covariates.length < 2) {
                        throw new Error('Could not infer variables');
                      }
                      app = BeyondR40.transportabilityOverlapStressIPDMA(
                        rows,
                        outcomeVar,
                        treatmentVar,
                        covariates.slice(0, 6),
                        domainVar,
                        studyVar,
                        [0.90, 0.95, 0.975, 0.99, 0.995],
                        0.20,
                        0.35
                      );
                    } catch (e) {
                      err = String(e && e.message ? e.message : e);
                    }

                    const scenarios = app && Array.isArray(app.scenarios) ? app.scenarios : [];
                    const stableScenariosFromRows = scenarios.filter(s => !!(s && s.stable)).length;
                    const preferredScenario = app && app.preferredScenario ? app.preferredScenario : {};
                    const robustness = app && app.robustness ? app.robustness : {};

                    return {
                      dataset: arguments[0],
                      n: rows.length,
                      n_studies: [...new Set(rows.map(r => r[studyVar]))].length,
                      inferred: {
                        study: studyVar,
                        treatment: treatmentVar,
                        outcome: outcomeVar,
                        domain: domainVar,
                        covariates: covariates.slice(0, 6)
                      },
                      app: {
                        error: app && app.error ? app.error : err,
                        n_scenarios: app ? app.nScenarios : null,
                        n_stable_scenarios: app ? app.nStableScenarios : null,
                        stable_scenarios_from_rows: stableScenariosFromRows,
                        sign_consistent: robustness.signConsistentAcrossGrid,
                        stable_window_available: robustness.stableWindowAvailable,
                        min_overlap_fraction: robustness.minOverlapFraction,
                        min_ess_fraction: robustness.minEssFraction,
                        tate_span_stable: robustness.tateSpanStable,
                        preferred_tate: preferredScenario.tate,
                        preferred_se: preferredScenario.se
                      }
                    };
                    """,
                    dataset,
                )
            except JavascriptException as exc:
                transport_overlap_payload = {
                    "dataset": dataset,
                    "n": 0,
                    "n_studies": 0,
                    "inferred": {},
                    "app": {
                        "error": str(exc),
                        "n_scenarios": None,
                        "n_stable_scenarios": None,
                        "stable_scenarios_from_rows": None,
                        "sign_consistent": None,
                        "stable_window_available": None,
                        "min_overlap_fraction": None,
                        "min_ess_fraction": None,
                        "tate_span_stable": None,
                        "preferred_tate": None,
                        "preferred_se": None,
                    },
                }
            out["transport_overlap"][dataset] = transport_overlap_payload

            try:
                fed_payload = driver.execute_script(
                    """
                    const rows = window.currentData || APP.data || [];
                    const keys = Object.keys(rows[0] || {});
                    const pick = (cands) => {
                      for (const c of cands) if (keys.includes(c)) return c;
                      return null;
                    };
                    const studyVar = pick(['study_id', 'study', 'trial']);
                    const treatmentVar = pick(['treatment', 'arm', 'group']);
                    const timeVar = pick(['time_months', 'time', 'os_time', 'survtime']);
                    const eventVar = pick(['event', 'status', 'death']);

                    let app = null;
                    let err = null;
                    try {
                      if (!studyVar || !treatmentVar || !timeVar || !eventVar) {
                        throw new Error('Could not infer variables');
                      }
                      app = BeyondR40.federatedPseudoObservationSurvivalIPDMA(
                        rows,
                        timeVar,
                        eventVar,
                        treatmentVar,
                        studyVar,
                        arguments[0],
                        0.90,
                        8
                      );
                    } catch (e) {
                      err = String(e && e.message ? e.message : e);
                    }

                    return {
                      dataset: arguments[1],
                      n: rows.length,
                      n_studies: [...new Set(rows.map(r => r[studyVar]))].length,
                      inferred: {
                        study: studyVar,
                        treatment: treatmentVar,
                        time: timeVar,
                        event: eventVar
                      },
                      app: {
                        error: app && app.error ? app.error : err,
                        n_sites: app ? app.nSites : null,
                        dp_loghr: app && app.federatedEstimateDP ? app.federatedEstimateDP.logHR : null,
                        dp_se: app && app.federatedEstimateDP ? app.federatedEstimateDP.se : null,
                        centralized_loghr: app && app.centralizedReference ? app.centralizedReference.logHR : null,
                        utility_gap: app ? app.utilityGapVsCentralizedLogHR : null,
                        epsilon: app && app.privacy ? app.privacy.epsilon : null,
                        mean_abs_noise: app && app.privacy ? app.privacy.meanAbsNoiseLogHR : null,
                        dp_applied: app && app.privacy ? app.privacy.differentialPrivacyApplied : null
                      }
                    };
                    """,
                    epsilon,
                    dataset,
                )
            except JavascriptException as exc:
                fed_payload = {
                    "dataset": dataset,
                    "n": 0,
                    "n_studies": 0,
                    "inferred": {},
                    "app": {
                        "error": str(exc),
                        "n_sites": None,
                        "dp_loghr": None,
                        "dp_se": None,
                        "centralized_loghr": None,
                        "utility_gap": None,
                        "epsilon": None,
                        "mean_abs_noise": None,
                        "dp_applied": None,
                    },
                }
            out["federated_survival"][dataset] = fed_payload

    finally:
        driver.quit()

    return out


def _compare(app_results: dict[str, Any]) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []

    km_rows: list[dict[str, Any]] = []
    for dataset, ds in app_results["km_reconstruction"].items():
        app = ds["app"]
        subgroup_effects = app.get("subgroup_effects") or []
        subgroup_ses = [
            _to_float(s.get("se"))
            for s in subgroup_effects
            if isinstance(s, dict)
        ]
        finite_ses = [x for x in subgroup_ses if x is not None and x > 0]

        checks = {
            "has_no_error": not bool(app.get("error")),
            "min_imputations": (_to_float(app.get("n_imputations")) or 0) >= KM_MIN_IMPUTATIONS,
            "has_subgroups": (_to_float(app.get("n_subgroups")) or 0) >= 2,
            "has_positive_ses": len(finite_ses) >= 2,
            "has_interaction": (_to_float(app.get("interaction_se")) or 0) > 0,
            "event_flip_bounded": (
                _to_float(app.get("event_flip_rate")) is not None
                and 0 < float(app["event_flip_rate"]) <= KM_MAX_EVENT_FLIP_RATE
            ),
        }
        row = {
            "track": "km_reconstruction",
            "dataset": dataset,
            "app": app,
            "checks": checks,
            "pass": all(checks.values()),
        }
        km_rows.append(row)
        rows.append(row)

    transport_iow_rows: list[dict[str, Any]] = []
    for dataset, ds in app_results["transport_iow"].items():
        app = ds["app"]
        max_abs_smd_post = _to_float(app.get("max_abs_smd_post"))
        checks = {
            "has_no_error": not bool(app.get("error")),
            "has_trial_target_samples": (_to_float(app.get("n_trial")) or 0) >= 30
            and (_to_float(app.get("n_target")) or 0) >= 30,
            "has_sate_tate": _to_float(app.get("sate")) is not None and _to_float(app.get("tate")) is not None,
            "has_positive_ses": (_to_float(app.get("sate_se")) or 0) > 0
            and (_to_float(app.get("tate_se")) or 0) > 0,
            "overlap_in_unit_interval": (
                _to_float(app.get("overlap_fraction")) is not None
                and 0 <= float(app["overlap_fraction"]) <= 1
            ),
            "ess_positive": (_to_float(app.get("ess")) or 0) > 0,
            "post_balance_reported": max_abs_smd_post is not None,
            "post_balance_reasonable": max_abs_smd_post is not None
            and max_abs_smd_post <= TRANSPORT_IOW_MAX_POST_SMD,
        }
        row = {
            "track": "transport_iow",
            "dataset": dataset,
            "app": app,
            "checks": checks,
            "pass": all(checks.values()),
        }
        transport_iow_rows.append(row)
        rows.append(row)

    transport_rows: list[dict[str, Any]] = []
    for dataset, ds in app_results["transport_sensitivity"].items():
        app = ds["app"]
        base_tate = _to_float(app.get("base_tate"))
        scenario0_tate = _to_float(app.get("scenario0_tate"))
        checks = {
            "has_no_error": not bool(app.get("error")),
            "has_base_estimate": base_tate is not None,
            "has_base_se": (_to_float(app.get("base_se")) or 0) > 0,
            "min_scenarios": (_to_float(app.get("scenario_count")) or 0) >= TRANSPORT_MIN_SCENARIOS,
            "monotonic_response": bool(app.get("monotonic")),
            "zero_delta_consistent": bool(app.get("zero_delta_matches_base"))
            and base_tate is not None
            and scenario0_tate is not None
            and abs(base_tate - scenario0_tate) <= 1e-8,
        }
        row = {
            "track": "transport_sensitivity",
            "dataset": dataset,
            "app": app,
            "checks": checks,
            "pass": all(checks.values()),
        }
        transport_rows.append(row)
        rows.append(row)

    transport_overlap_rows: list[dict[str, Any]] = []
    for dataset, ds in app_results["transport_overlap"].items():
        app = ds["app"]
        stable_count = _to_float(app.get("n_stable_scenarios"))
        if stable_count is None:
            stable_count = _to_float(app.get("stable_scenarios_from_rows"))
        stable_span = _to_float(app.get("tate_span_stable"))
        overlap = _to_float(app.get("min_overlap_fraction"))
        ess_fraction = _to_float(app.get("min_ess_fraction"))
        checks = {
            "has_no_error": not bool(app.get("error")),
            "min_scenarios": (_to_float(app.get("n_scenarios")) or 0) >= TRANSPORT_OVERLAP_MIN_SCENARIOS,
            "has_preferred_estimate": _to_float(app.get("preferred_tate")) is not None,
            "has_preferred_se": (_to_float(app.get("preferred_se")) or 0) > 0,
            "has_stability_diagnostics": stable_count is not None and stable_count >= 0,
            "sign_consistent": bool(app.get("sign_consistent")),
            "overlap_in_unit_interval": overlap is not None and 0 <= overlap <= 1,
            "ess_fraction_positive": ess_fraction is not None and ess_fraction > 0,
            "stable_span_bounded": stable_span is None or abs(stable_span) <= TRANSPORT_OVERLAP_MAX_STABLE_SPAN,
        }
        row = {
            "track": "transport_overlap",
            "dataset": dataset,
            "app": app,
            "checks": checks,
            "pass": all(checks.values()),
        }
        transport_overlap_rows.append(row)
        rows.append(row)

    federated_rows: list[dict[str, Any]] = []
    for dataset, ds in app_results["federated_survival"].items():
        app = ds["app"]
        utility_gap = _to_float(app.get("utility_gap"))
        checks = {
            "has_no_error": not bool(app.get("error")),
            "min_sites": (_to_float(app.get("n_sites")) or 0) >= 2,
            "has_dp_estimate": (_to_float(app.get("dp_se")) or 0) > 0,
            "has_centralized_reference": _to_float(app.get("centralized_loghr")) is not None,
            "utility_gap_bounded": utility_gap is not None and abs(utility_gap) <= FEDERATED_MAX_UTILITY_GAP,
            "privacy_noise_present": (_to_float(app.get("mean_abs_noise")) or 0) > 0,
            "dp_applied": bool(app.get("dp_applied")),
        }
        row = {
            "track": "federated_survival",
            "dataset": dataset,
            "app": app,
            "checks": checks,
            "pass": all(checks.values()),
        }
        federated_rows.append(row)
        rows.append(row)

    summary = {
        "rows": len(rows),
        "overall_pass_rate": (sum(1 for r in rows if r["pass"]) / len(rows)) if rows else None,
        "km_pass_rate": (sum(1 for r in km_rows if r["pass"]) / len(km_rows)) if km_rows else None,
        "transport_iow_pass_rate": (
            sum(1 for r in transport_iow_rows if r["pass"]) / len(transport_iow_rows)
            if transport_iow_rows
            else None
        ),
        "transport_sensitivity_pass_rate": (
            sum(1 for r in transport_rows if r["pass"]) / len(transport_rows)
            if transport_rows
            else None
        ),
        "transport_overlap_pass_rate": (
            sum(1 for r in transport_overlap_rows if r["pass"]) / len(transport_overlap_rows)
            if transport_overlap_rows
            else None
        ),
        "federated_pass_rate": (
            sum(1 for r in federated_rows if r["pass"]) / len(federated_rows)
            if federated_rows
            else None
        ),
        "max_abs_utility_gap": max(
            (abs(_to_float(r["app"].get("utility_gap")) or 0) for r in federated_rows),
            default=None,
        ),
        "mean_abs_utility_gap": (
            statistics.mean(
                [abs(_to_float(r["app"].get("utility_gap")) or 0) for r in federated_rows]
            )
            if federated_rows
            else None
        ),
    }

    return {"rows": rows, "summary": summary}


def _fmt(v: float | None, digits: int = 6) -> str:
    if v is None:
        return "NA"
    return f"{v:.{digits}f}"


def _write_markdown(path: Path, comparison: dict[str, Any], datasets: list[str], epsilon: float, n_imputations: int, seed: int) -> None:
    summary = comparison["summary"]
    rows = comparison["rows"]
    lines: list[str] = []
    lines.append("# Frontier Gap Methods Benchmark (Loop 3/4/6)")
    lines.append("")
    lines.append(f"- Seed: `{seed}`")
    lines.append(f"- Datasets: `{', '.join(datasets)}`")
    lines.append(f"- KM imputations: `{n_imputations}`")
    lines.append(f"- Federated epsilon: `{epsilon}`")
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    lines.append(f"- Rows compared: `{summary['rows']}`")
    lines.append(f"- Overall pass rate: `{_fmt(summary['overall_pass_rate'], 3)}`")
    lines.append(f"- KM reconstruction pass rate: `{_fmt(summary['km_pass_rate'], 3)}`")
    lines.append(f"- Transport IOW pass rate: `{_fmt(summary['transport_iow_pass_rate'], 3)}`")
    lines.append(f"- Transport sensitivity pass rate: `{_fmt(summary['transport_sensitivity_pass_rate'], 3)}`")
    lines.append(f"- Transport overlap-stress pass rate: `{_fmt(summary['transport_overlap_pass_rate'], 3)}`")
    lines.append(f"- Federated survival pass rate: `{_fmt(summary['federated_pass_rate'], 3)}`")
    lines.append(f"- Max |federated utility gap|: `{_fmt(summary['max_abs_utility_gap'], 6)}`")
    lines.append("")
    lines.append("## Criteria")
    lines.append("")
    lines.append(f"- KM: imputations >= `{KM_MIN_IMPUTATIONS}`, at least 2 subgroup effects, finite interaction SE, event flip rate in `(0, {KM_MAX_EVENT_FLIP_RATE:.2f}]`")
    lines.append(
        f"- Transport IOW: finite SATE/TATE and SEs, trial/target samples >= `30`, overlap in `[0,1]`, ESS > 0, max post-weighting |SMD| <= `{TRANSPORT_IOW_MAX_POST_SMD:.2f}`"
    )
    lines.append(f"- Transport sensitivity: >=`{TRANSPORT_MIN_SCENARIOS}` delta scenarios, finite base TATE/SE, monotonic delta response, zero-delta consistency")
    lines.append(
        f"- Transport overlap stress: >=`{TRANSPORT_OVERLAP_MIN_SCENARIOS}` truncation scenarios, finite preferred TATE/SE, stability diagnostics reported, sign consistency, overlap in `[0,1]`, ESS fraction > 0, |stable span| <= `{TRANSPORT_OVERLAP_MAX_STABLE_SPAN:.2f}`"
    )
    lines.append(f"- Federated: >=2 sites, finite DP estimate, centralized reference available, |utility gap| <= `{FEDERATED_MAX_UTILITY_GAP:.2f}`")
    lines.append("")
    lines.append("## Detailed Rows")
    lines.append("")
    lines.append("| Track | Dataset | Status | Key Metric |")
    lines.append("|---|---|:---:|---|")
    for row in rows:
        track = row["track"]
        ds = row["dataset"]
        ok = "YES" if row["pass"] else "NO"
        app = row.get("app") or {}
        if track == "km_reconstruction":
            key_metric = f"imputations={app.get('n_imputations')}, subgroups={app.get('n_subgroups')}, interaction_se={_fmt(_to_float(app.get('interaction_se')), 4)}"
        elif track == "transport_iow":
            key_metric = (
                f"tate={_fmt(_to_float(app.get('tate')), 4)}, "
                f"overlap={_fmt(_to_float(app.get('overlap_fraction')), 3)}, "
                f"max_smd_post={_fmt(_to_float(app.get('max_abs_smd_post')), 3)}"
            )
        elif track == "transport_sensitivity":
            key_metric = f"base_tate={_fmt(_to_float(app.get('base_tate')), 4)}, scenarios={app.get('scenario_count')}, delta_null={_fmt(_to_float(app.get('delta_needed_for_null')), 4)}"
        elif track == "transport_overlap":
            key_metric = (
                f"stable={app.get('n_stable_scenarios')}, "
                f"min_overlap={_fmt(_to_float(app.get('min_overlap_fraction')), 3)}, "
                f"stable_span={_fmt(_to_float(app.get('tate_span_stable')), 4)}"
            )
        else:
            key_metric = f"n_sites={app.get('n_sites')}, utility_gap={_fmt(_to_float(app.get('utility_gap')), 4)}, mean_noise={_fmt(_to_float(app.get('mean_abs_noise')), 4)}"
        lines.append(f"| {track} | {ds} | {ok} | {key_metric} |")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark Loop 3/4/6 frontier gap methods in app")
    parser.add_argument("--seed", type=int, default=12345, help="Seed for deterministic example data")
    parser.add_argument(
        "--datasets",
        nargs="*",
        default=DEFAULT_DATASETS,
        help="Example dataset keys to run frontier method checks",
    )
    parser.add_argument("--epsilon", type=float, default=8.0, help="Differential privacy epsilon for federated method")
    parser.add_argument("--km-imputations", type=int, default=80, help="Imputation count for KM uncertainty propagation")
    parser.add_argument(
        "--out-json",
        default=str(_repo_root() / "dev" / "benchmarks" / "latest_frontier_gap_methods_benchmark.json"),
    )
    parser.add_argument(
        "--out-md",
        default=str(_repo_root() / "dev" / "benchmarks" / "latest_frontier_gap_methods_benchmark.md"),
    )
    args = parser.parse_args()

    repo = _repo_root()
    app_path = repo / "ipd-meta-pro.html"
    if not app_path.exists():
        raise FileNotFoundError(f"App file not found: {app_path}")

    print("=" * 72)
    print("IPD Meta-Analysis Pro - Frontier Gap Benchmark (Loop 3/4/6)")
    print("=" * 72)
    print(f"App: {app_path}")
    print(f"Datasets: {', '.join(args.datasets)}")
    print(f"KM imputations: {args.km_imputations}")
    print(f"Federated epsilon: {args.epsilon}")
    print()

    app_results = _run_app(
        app_path=app_path,
        datasets=args.datasets,
        seed=args.seed,
        epsilon=args.epsilon,
        n_imputations=args.km_imputations,
    )
    comparison = _compare(app_results)

    out_json = Path(args.out_json)
    out_md = Path(args.out_md)
    out_json.parent.mkdir(parents=True, exist_ok=True)

    full = {
        "app_build_id": _app_build_id(app_path),
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "seed": args.seed,
        "datasets": args.datasets,
        "km_imputations": args.km_imputations,
        "federated_epsilon": args.epsilon,
        "app": app_results,
        "comparison": comparison,
    }
    out_json.write_text(json.dumps(full, indent=2), encoding="utf-8")
    _write_markdown(
        path=out_md,
        comparison=comparison,
        datasets=args.datasets,
        epsilon=args.epsilon,
        n_imputations=args.km_imputations,
        seed=args.seed,
    )

    print("Benchmark complete.")
    print(f"JSON: {out_json}")
    print(f"Markdown: {out_md}")
    print(f"Overall pass rate: {_fmt(comparison['summary']['overall_pass_rate'], 3)}")
    print(f"KM reconstruction pass rate: {_fmt(comparison['summary']['km_pass_rate'], 3)}")
    print(f"Transport IOW pass rate: {_fmt(comparison['summary']['transport_iow_pass_rate'], 3)}")
    print(f"Transport sensitivity pass rate: {_fmt(comparison['summary']['transport_sensitivity_pass_rate'], 3)}")
    print(f"Transport overlap-stress pass rate: {_fmt(comparison['summary']['transport_overlap_pass_rate'], 3)}")
    print(f"Federated survival pass rate: {_fmt(comparison['summary']['federated_pass_rate'], 3)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
