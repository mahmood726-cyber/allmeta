#!/usr/bin/env python3
"""Run Loop-7 publication-profile replication gate on canonical IPD example datasets."""

from __future__ import annotations

import argparse
import json
import math
import re
import time
from pathlib import Path
from typing import Any

from selenium import webdriver
from selenium.common.exceptions import JavascriptException
from selenium.webdriver.edge.options import Options

from edge_webdriver import create_edge_driver, load_local_app_with_ready_check


PUBLICATION_PROFILES: list[dict[str, Any]] = [
    {
        "id": "survival_reml",
        "dataset": "survival",
        "method": "REML",
        "outcome_kind": "survival",
        "effect_range": (-0.50, -0.24),
        "i2_max": 40.0,
        "description": "Overall mortality survival profile (log-HR)",
    },
    {
        "id": "binary_reml",
        "dataset": "binary",
        "method": "REML",
        "outcome_kind": "binary",
        "effect_range": (-0.40, -0.23),
        "i2_max": 5.0,
        "description": "Binary endpoint profile (log-OR/log-RR scale as configured)",
    },
    {
        "id": "continuous_reml",
        "dataset": "continuous",
        "method": "REML",
        "outcome_kind": "continuous",
        "effect_range": (1.85, 2.35),
        "i2_max": 75.0,
        "description": "Continuous endpoint profile (mean difference style scale)",
    },
    {
        "id": "ovarian_survival_reml",
        "dataset": "ovarian_survival",
        "method": "REML",
        "outcome_kind": "survival",
        "effect_range": (-0.56, -0.34),
        "i2_max": 25.0,
        "description": "Ovarian survival profile (log-HR)",
    },
    {
        "id": "statin_cvd_reml",
        "dataset": "statin_cvd",
        "method": "REML",
        "outcome_kind": "binary",
        "effect_range": (-0.33, -0.14),
        "i2_max": 50.0,
        "description": "Statin CVD profile (relative risk reduction)",
    },
    {
        "id": "hiv_survival_reml",
        "dataset": "hiv_survival",
        "method": "REML",
        "outcome_kind": "survival",
        "effect_range": (-0.78, -0.58),
        "i2_max": 5.0,
        "description": "HIV survival profile (log-HR)",
    },
]


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


def _run_app(app_path: Path, profiles: list[dict[str, Any]], seed: int) -> dict[str, Any]:
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")

    driver = create_edge_driver(options)
    out: dict[str, Any] = {"profiles": {}}

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
              typeof runAnalysis === 'function' &&
              typeof APP === 'object'
            );
            """
        )
        if not ready:
            raise RuntimeError("Core analysis functions are not available in page context")

        for profile in profiles:
            profile_id = profile["id"]
            dataset = profile["dataset"]
            outcome_kind = profile["outcome_kind"]
            method = profile["method"]

            try:
                payload = driver.execute_script(
                    """
                    const dataset = arguments[0];
                    const outcomeKind = arguments[1];
                    const method = arguments[2];
                    const seed = arguments[3];

                    if (typeof SeededRNG !== 'undefined') SeededRNG.patchMathRandom(seed);
                    loadExampleData(dataset);
                    if (typeof SeededRNG !== 'undefined') SeededRNG.restoreMathRandom();

                    document.getElementById('varStudy').value = 'study_id';
                    document.getElementById('varTreatment').value = 'treatment';
                    if (outcomeKind === 'survival') {
                      document.getElementById('varTime').value = 'time_months';
                      document.getElementById('varEvent').value = 'event';
                    } else if (outcomeKind === 'binary') {
                      if (dataset === 'binary' || dataset === 'statin_cvd') {
                        document.getElementById('varEvent').value = 'mace_event';
                      } else {
                        document.getElementById('varEvent').value = 'mortality_28d';
                      }
                    } else {
                      document.getElementById('varEvent').value = 'hamd_change';
                    }

                    document.getElementById('reMethod').value = method;
                    document.getElementById('useHKSJ').checked = false;
                    const t0 = performance.now();
                    runAnalysis();
                    const t1 = performance.now();
                    const pooled = (APP.results && APP.results.pooled) ? APP.results.pooled : {};
                    const studies = (APP.results && APP.results.studies) ? APP.results.studies : [];
                    const pooledEffect = Number.isFinite(pooled.pooled) ? pooled.pooled : pooled.effect;
                    return {
                      error: null,
                      pooled: pooledEffect,
                      se: pooled.se,
                      tau2: pooled.tau2,
                      i2: pooled.I2,
                      q: pooled.Q,
                      k: studies.length,
                      runtime_ms: t1 - t0
                    };
                    """,
                    dataset,
                    outcome_kind,
                    method,
                    seed,
                )
            except JavascriptException as exc:
                payload = {
                    "error": str(exc),
                    "pooled": None,
                    "se": None,
                    "tau2": None,
                    "i2": None,
                    "q": None,
                    "k": 0,
                    "runtime_ms": None,
                }
            out["profiles"][profile_id] = payload
    finally:
        driver.quit()

    return out


def _compare(app_results: dict[str, Any], profiles: list[dict[str, Any]]) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    for profile in profiles:
        profile_id = profile["id"]
        app = (app_results.get("profiles") or {}).get(profile_id) or {}
        pooled = _to_float(app.get("pooled"))
        i2 = _to_float(app.get("i2"))
        k = int(app.get("k") or 0)
        lo, hi = profile["effect_range"]
        checks = {
            "no_error": not bool(app.get("error")),
            "has_pooled": pooled is not None,
            "effect_in_range": pooled is not None and lo <= pooled <= hi,
            "min_studies": k >= 3,
            "i2_within_cap": i2 is not None and i2 <= float(profile["i2_max"]),
        }
        rows.append(
            {
                "profile_id": profile_id,
                "dataset": profile["dataset"],
                "method": profile["method"],
                "description": profile["description"],
                "target": {
                    "effect_range": [lo, hi],
                    "i2_max": profile["i2_max"],
                },
                "app": app,
                "checks": checks,
                "pass": all(checks.values()),
            }
        )

    summary = {
        "rows": len(rows),
        "overall_pass_rate": (sum(1 for r in rows if r["pass"]) / len(rows)) if rows else None,
        "effect_range_pass_rate": (
            sum(1 for r in rows if r["checks"].get("effect_in_range")) / len(rows)
            if rows
            else None
        ),
        "i2_pass_rate": (
            sum(1 for r in rows if r["checks"].get("i2_within_cap")) / len(rows)
            if rows
            else None
        ),
    }
    return {"rows": rows, "summary": summary}


def _fmt(v: float | None, digits: int = 6) -> str:
    if v is None:
        return "NA"
    return f"{v:.{digits}f}"


def _write_markdown(path: Path, comparison: dict[str, Any], seed: int) -> None:
    summary = comparison["summary"]
    rows = comparison["rows"]
    lines: list[str] = []
    lines.append("# Publication-Profile Replication Gate (Loop 7)")
    lines.append("")
    lines.append(f"- Seed: `{seed}`")
    lines.append(f"- Profiles: `{len(rows)}`")
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    lines.append(f"- Rows: `{summary['rows']}`")
    lines.append(f"- Overall pass rate: `{_fmt(summary['overall_pass_rate'], 3)}`")
    lines.append(f"- Effect-range pass rate: `{_fmt(summary['effect_range_pass_rate'], 3)}`")
    lines.append(f"- I2-cap pass rate: `{_fmt(summary['i2_pass_rate'], 3)}`")
    lines.append("")
    lines.append("## Detailed Rows")
    lines.append("")
    lines.append("| Profile | Dataset | Method | Status | Pooled | Target Range | I2 | I2 Cap |")
    lines.append("|---|---|---|:---:|---:|---:|---:|---:|")
    for row in rows:
        app = row.get("app") or {}
        lo, hi = (row.get("target") or {}).get("effect_range") or [None, None]
        lines.append(
            f"| {row['profile_id']} | {row['dataset']} | {row['method']} | "
            f"{'YES' if row['pass'] else 'NO'} | {_fmt(_to_float(app.get('pooled')), 4)} | "
            f"[{_fmt(_to_float(lo), 3)}, {_fmt(_to_float(hi), 3)}] | "
            f"{_fmt(_to_float(app.get('i2')), 2)} | {_fmt(_to_float((row.get('target') or {}).get('i2_max')), 2)} |"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Loop-7 publication-profile replication gate")
    parser.add_argument("--seed", type=int, default=12345, help="Deterministic seed")
    parser.add_argument(
        "--out-json",
        default=str(_repo_root() / "dev" / "benchmarks" / "latest_publication_replication_gate.json"),
    )
    parser.add_argument(
        "--out-md",
        default=str(_repo_root() / "dev" / "benchmarks" / "latest_publication_replication_gate.md"),
    )
    args = parser.parse_args()

    repo = _repo_root()
    app_path = repo / "ipd-meta-pro.html"
    if not app_path.exists():
        raise FileNotFoundError(f"App file not found: {app_path}")

    print("=" * 72)
    print("IPD Meta-Analysis Pro - Publication-Profile Replication Gate (Loop 7)")
    print("=" * 72)
    print(f"App: {app_path}")
    print(f"Profiles: {len(PUBLICATION_PROFILES)}")
    print(f"Seed: {args.seed}")
    print()

    app_results = _run_app(app_path, PUBLICATION_PROFILES, args.seed)
    comparison = _compare(app_results, PUBLICATION_PROFILES)

    out_json = Path(args.out_json)
    out_md = Path(args.out_md)
    out_json.parent.mkdir(parents=True, exist_ok=True)

    full = {
        "app_build_id": _app_build_id(app_path),
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "seed": args.seed,
        "profiles": PUBLICATION_PROFILES,
        "app": app_results,
        "comparison": comparison,
    }
    out_json.write_text(json.dumps(full, indent=2), encoding="utf-8")
    _write_markdown(out_md, comparison, args.seed)

    print("Replication gate complete.")
    print(f"JSON: {out_json}")
    print(f"Markdown: {out_md}")
    print(f"Overall pass rate: {_fmt(comparison['summary']['overall_pass_rate'], 3)}")
    print(f"Effect-range pass rate: {_fmt(comparison['summary']['effect_range_pass_rate'], 3)}")
    print(f"I2-cap pass rate: {_fmt(comparison['summary']['i2_pass_rate'], 3)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
