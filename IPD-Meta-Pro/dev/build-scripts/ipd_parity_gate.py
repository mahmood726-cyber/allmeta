#!/usr/bin/env python3
"""Run IPD-only parity benchmarks vs R and enforce pass-rate gates."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _app_build_id(app_path: Path) -> str | None:
    try:
        text = app_path.read_text(encoding="utf-8")
    except Exception:
        return None
    match = re.search(r"const IPD_APP_BUILD_ID = '([^']+)'", text)
    return match.group(1) if match else None


def _default_windows_python_paths() -> list[Path]:
    return [
        Path("/mnt/c/Users/user/AppData/Local/Programs/Python/Python313/python.exe"),
        Path("/mnt/c/Users/user/AppData/Local/Programs/Python/Python312/python.exe"),
        Path(r"C:\Users\user\AppData\Local\Programs\Python\Python313\python.exe"),
        Path(r"C:\Users\user\AppData\Local\Programs\Python\Python312\python.exe"),
    ]


def _find_python_for_bench(explicit: str | None) -> Path:
    if explicit:
        p = Path(explicit)
        if p.exists():
            return p
        raise FileNotFoundError(f"Benchmark Python not found: {p}")

    def _can_import_selenium(py: Path) -> bool:
        try:
            probe = subprocess.run(
                [str(py), "-c", "import selenium; print('ok')"],
                text=True,
                capture_output=True,
                encoding="utf-8",
                errors="replace",
                check=False,
                timeout=20,
            )
            return probe.returncode == 0
        except Exception:
            return False

    current = Path(sys.executable)
    is_wsl = False
    if os.name != "nt":
        try:
            is_wsl = "microsoft" in Path("/proc/version").read_text(encoding="utf-8").lower()
        except Exception:
            is_wsl = False

    if is_wsl:
        candidates = [c for c in _default_windows_python_paths() if c.exists()]
        if current.exists():
            candidates.append(current)
    else:
        candidates = [current] if current.exists() else []
        candidates.extend(c for c in _default_windows_python_paths() if c.exists())

    for candidate in candidates:
        if _can_import_selenium(candidate):
            return candidate

    raise FileNotFoundError("Could not locate a Python interpreter for benchmark scripts")


def _coerce_path_for_python(path: Path, python_exe: Path) -> str:
    """Convert POSIX path to Windows path when invoking a Windows .exe under WSL."""
    python_str = str(python_exe).lower()
    if os.name != "nt" and python_str.endswith(".exe") and str(path).startswith("/"):
        try:
            out = subprocess.check_output(["wslpath", "-w", str(path)], text=True)
            return out.strip()
        except Exception:
            return str(path)
    return str(path)


def _fmt(v: float | None, digits: int = 6) -> str:
    if v is None:
        return "NA"
    return f"{v:.{digits}f}"


def _run_step(name: str, cmd: list[str], cwd: Path) -> None:
    print("\n" + "-" * 72)
    print(name)
    print(f"Command: {' '.join(cmd)}")
    print("-" * 72)
    start = time.time()
    proc = subprocess.run(
        cmd,
        cwd=str(cwd),
        text=True,
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    elapsed = time.time() - start
    if proc.stdout.strip():
        print(proc.stdout.rstrip())
    if proc.stderr.strip():
        print(proc.stderr.rstrip())
    if proc.returncode != 0:
        raise RuntimeError(f"{name} failed in {elapsed:.1f}s")
    print(f"[OK] {name} ({elapsed:.1f}s)")


def _top_two_stage_gaps(two_stage_json: dict[str, Any], n: int = 5) -> list[dict[str, Any]]:
    rows = ((two_stage_json.get("comparison") or {}).get("rows")) or []
    ranked = sorted(
        rows,
        key=lambda r: (
            float((r.get("diff_metafor") or {}).get("pooled") or 0.0),
            float((r.get("diff_metafor") or {}).get("tau2") or 0.0),
            float((r.get("diff_metafor") or {}).get("i2") or 0.0),
        ),
        reverse=True,
    )
    return ranked[:n]


def _top_one_stage_gaps(one_stage_json: dict[str, Any], n: int = 5) -> list[dict[str, Any]]:
    rows = ((one_stage_json.get("comparison") or {}).get("rows")) or []
    ranked = sorted(
        rows,
        key=lambda r: (
            float((r.get("diff") or {}).get("effect_abs") or (r.get("diff") or {}).get("hr_abs") or 0.0),
            float((r.get("diff") or {}).get("se_abs") or 0.0),
            float((r.get("diff") or {}).get("theta_abs") or 0.0),
        ),
        reverse=True,
    )
    return ranked[:n]


def _top_gap_method_gaps(gap_json: dict[str, Any], n: int = 5) -> list[dict[str, Any]]:
    rows = ((gap_json.get("comparison") or {}).get("rows")) or []

    def rank_key(r: dict[str, Any]) -> tuple[float, float, float]:
        diff = r.get("diff") or {}
        track = r.get("track")
        if track == "centered":
            return (
                float(diff.get("within_effect_abs") or 0.0),
                float(diff.get("within_se_abs") or 0.0),
                float(diff.get("across_effect_abs") or 0.0),
            )
        if track == "piecewise":
            return (
                float(diff.get("loghr_abs") or 0.0),
                float(diff.get("se_abs") or 0.0),
                float(diff.get("tau_abs") or 0.0),
            )
        return (
            float(diff.get("effect_abs") or 0.0),
            float(diff.get("se_abs") or 0.0),
            float(diff.get("tau_abs") or 0.0),
        )

    ranked = sorted(rows, key=rank_key, reverse=True)
    return ranked[:n]


def _top_extended_survival_gaps(ext_json: dict[str, Any], n: int = 5) -> list[dict[str, Any]]:
    rows = ((ext_json.get("comparison") or {}).get("rows")) or []

    def rank_key(r: dict[str, Any]) -> tuple[float, float, float]:
        diff = r.get("diff") or {}
        if r.get("track") == "aft_weibull":
            return (
                float(diff.get("treatment_effect_abs") or 0.0),
                float(diff.get("time_ratio_abs") or 0.0),
                float(diff.get("scale_abs") or 0.0),
            )
        return (
            float(diff.get("hr_abs") or 0.0),
            float(diff.get("se_abs") or 0.0),
            0.0,
        )

    ranked = sorted(rows, key=rank_key, reverse=True)
    return ranked[:n]


def _top_advanced_survival_gaps(adv_json: dict[str, Any], n: int = 5) -> list[dict[str, Any]]:
    rows = ((adv_json.get("comparison") or {}).get("rows")) or []

    def rank_key(r: dict[str, Any]) -> tuple[float, float, float]:
        diff = r.get("diff") or {}
        if r.get("track") == "cure_meta":
            return (
                float(diff.get("cure_pooled_abs") or 0.0),
                float(diff.get("hr_log_abs") or 0.0),
                float(diff.get("cure_se_abs") or 0.0),
            )
        return (
            float(diff.get("logcshr_abs") or 0.0),
            float(diff.get("se_abs") or 0.0),
            float(diff.get("cshr_abs") or 0.0),
        )

    ranked = sorted(rows, key=rank_key, reverse=True)
    return ranked[:n]


def _top_frontier_gaps(frontier_json: dict[str, Any], n: int = 5) -> list[dict[str, Any]]:
    rows = ((frontier_json.get("comparison") or {}).get("rows")) or []

    def _as_float(v: Any, default: float = 0.0) -> float:
        try:
            return float(v)
        except Exception:
            return default

    def rank_key(r: dict[str, Any]) -> tuple[float, float]:
        app = r.get("app") or {}
        if r.get("track") == "transport_iow":
            max_abs_smd_post = app.get("max_abs_smd_post")
            overlap = app.get("overlap_fraction")
            return (
                abs(_as_float(max_abs_smd_post, 0.0)) if max_abs_smd_post is not None else 0.0,
                max(0.0, 1.0 - _as_float(overlap, 1.0)),
            )
        if r.get("track") == "transport_sensitivity":
            delta_null = app.get("delta_needed_for_null")
            return (
                abs(_as_float(delta_null, 0.0)) if delta_null is not None else 0.0,
                _as_float(app.get("base_se"), 0.0),
            )
        if r.get("track") == "transport_overlap":
            span = abs(_as_float(app.get("tate_span_stable"), 0.0))
            min_overlap = _as_float(app.get("min_overlap_fraction"), 1.0)
            return (
                span,
                max(0.0, 1.0 - min_overlap),
            )
        if r.get("track") == "federated_survival":
            utility_gap = app.get("utility_gap")
            return (
                abs(_as_float(utility_gap, 0.0)) if utility_gap is not None else 0.0,
                _as_float(app.get("dp_se"), 0.0),
            )
        return (
            _as_float(app.get("interaction_se"), 0.0),
            _as_float(app.get("event_flip_rate"), 0.0),
        )

    ranked = sorted(rows, key=rank_key, reverse=True)
    return ranked[:n]


def _write_markdown(
    path: Path,
    combined: dict[str, Any],
    top_two_stage: list[dict[str, Any]],
    top_one_stage: list[dict[str, Any]],
    top_gap_methods: list[dict[str, Any]],
    top_extended_survival: list[dict[str, Any]] | None = None,
    top_advanced_survival: list[dict[str, Any]] | None = None,
    top_frontier: list[dict[str, Any]] | None = None,
) -> None:
    gate = combined["gate"]
    summ = combined["summary"]
    lines: list[str] = []
    if gate.get("with_frontier_gap") and gate.get("with_loop7"):
        title = "IPD Parity Gate (Loop 2 + Loop 3/4/6 + Loop 7)"
    elif gate.get("with_frontier_gap"):
        title = "IPD Parity Gate (Loop 2 + Loop 3/4/6)"
    elif gate.get("with_loop7"):
        title = "IPD Parity Gate (Loop 2 + Loop 7)"
    else:
        title = "IPD Parity Gate (Loop 2)"
    lines.append(f"# {title}")
    lines.append("")
    lines.append(f"- Generated: `{combined['generated_at']}`")
    lines.append(f"- Status: `{'PASS' if gate['pass'] else 'FAIL'}`")
    lines.append(f"- Two-stage pass rate (vs metafor): `{_fmt(summ['two_stage_pass_rate'], 3)}`")
    lines.append(f"- One-stage pass rate (vs lme4): `{_fmt(summ['one_stage_pass_rate'], 3)}`")
    lines.append(f"- One-stage coverage pass rate: `{_fmt(summ.get('one_stage_coverage_pass_rate'), 3)}`")
    lines.append(f"- One-stage exploratory pass rate: `{_fmt(summ.get('one_stage_exploratory_pass_rate'), 3)}`")
    lines.append(f"- Frailty pass rate (vs survival::coxph): `{_fmt(summ['frailty_pass_rate'], 3)}`")
    lines.append(f"- Centered interaction pass rate (vs R): `{_fmt(summ.get('centered_pass_rate'), 3)}`")
    lines.append(f"- Piecewise survival pass rate (vs R): `{_fmt(summ.get('piecewise_pass_rate'), 3)}`")
    lines.append(f"- RMST IPD pass rate (vs R): `{_fmt(summ.get('rmst_pass_rate'), 3)}`")
    if summ.get("extended_survival_pass_rate") is not None:
        lines.append(f"- Extended survival pass rate (AFT/landmark vs survival): `{_fmt(summ.get('extended_survival_pass_rate'), 3)}`")
    if summ.get("advanced_survival_pass_rate") is not None:
        lines.append(f"- Advanced survival pass rate (cure/competing vs flexsurvcure+cmprsk): `{_fmt(summ.get('advanced_survival_pass_rate'), 3)}`")
    if summ.get("km_pass_rate") is not None:
        lines.append(f"- KM uncertainty-reconstruction pass rate (Loop 3): `{_fmt(summ.get('km_pass_rate'), 3)}`")
    if summ.get("transport_iow_pass_rate") is not None:
        lines.append(f"- Transportability IOW pass rate (Loop 4): `{_fmt(summ.get('transport_iow_pass_rate'), 3)}`")
    if summ.get("federated_pass_rate") is not None:
        lines.append(f"- Federated survival DP pass rate (Loop 3): `{_fmt(summ.get('federated_pass_rate'), 3)}`")
    if summ.get("transport_sensitivity_pass_rate") is not None:
        lines.append(f"- Transportability sensitivity pass rate (Loop 4): `{_fmt(summ.get('transport_sensitivity_pass_rate'), 3)}`")
    if summ.get("transport_overlap_pass_rate") is not None:
        lines.append(f"- Transportability overlap-stress pass rate (Loop 6): `{_fmt(summ.get('transport_overlap_pass_rate'), 3)}`")
    if summ.get("simulation_lab_pass_rate") is not None:
        lines.append(f"- Simulation lab pass rate (Loop 7): `{_fmt(summ.get('simulation_lab_pass_rate'), 3)}`")
    if summ.get("publication_replication_pass_rate") is not None:
        lines.append(f"- Publication replication pass rate (Loop 7): `{_fmt(summ.get('publication_replication_pass_rate'), 3)}`")
    lines.append("")
    lines.append("## Gate Thresholds")
    lines.append("")
    lines.append(f"- Min two-stage pass rate: `{_fmt(gate['min_two_stage_pass_rate'], 3)}`")
    lines.append(f"- Min one-stage pass rate: `{_fmt(gate['min_one_stage_pass_rate'], 3)}`")
    lines.append(f"- Min frailty pass rate: `{_fmt(gate['min_frailty_pass_rate'], 3)}`")
    lines.append(f"- Min centered pass rate: `{_fmt(gate['min_centered_pass_rate'], 3)}`")
    lines.append(f"- Min piecewise pass rate: `{_fmt(gate['min_piecewise_pass_rate'], 3)}`")
    lines.append(f"- Min RMST pass rate: `{_fmt(gate['min_rmst_pass_rate'], 3)}`")
    lines.append(f"- Min extended survival pass rate: `{_fmt(gate['min_extended_survival_pass_rate'], 3)}`")
    lines.append(f"- Min advanced survival pass rate: `{_fmt(gate['min_advanced_survival_pass_rate'], 3)}`")
    if gate.get("with_frontier_gap"):
        lines.append(f"- Min KM pass rate: `{_fmt(gate.get('min_km_pass_rate'), 3)}`")
        lines.append(f"- Min transport IOW pass rate: `{_fmt(gate.get('min_transport_iow_pass_rate'), 3)}`")
        lines.append(f"- Min federated pass rate: `{_fmt(gate.get('min_federated_pass_rate'), 3)}`")
        lines.append(f"- Min transport sensitivity pass rate: `{_fmt(gate.get('min_transport_sensitivity_pass_rate'), 3)}`")
        lines.append(f"- Min transport overlap-stress pass rate: `{_fmt(gate.get('min_transport_overlap_pass_rate'), 3)}`")
    if gate.get("with_loop7"):
        lines.append(f"- Min simulation-lab pass rate: `{_fmt(gate.get('min_simulation_pass_rate'), 3)}`")
        lines.append(f"- Min publication-replication pass rate: `{_fmt(gate.get('min_replication_pass_rate'), 3)}`")
    lines.append("")
    lines.append("## Largest Two-Stage Gaps")
    lines.append("")
    lines.append("| Dataset | Method | |pooled diff| | |tau2 diff| | |I2 diff| | Pass |")
    lines.append("|---|---|---:|---:|---:|:---:|")
    for row in top_two_stage:
        d = row.get("diff_metafor") or {}
        lines.append(
            f"| {row.get('dataset', 'NA')} | {row.get('method', 'NA')} | "
            f"{_fmt(d.get('pooled'), 6)} | {_fmt(d.get('tau2'), 6)} | {_fmt(d.get('i2'), 4)} | "
            f"{'YES' if row.get('pass_metafor') else 'NO'} |"
        )
    lines.append("")
    lines.append("## Largest One-Stage/Frailty Gaps")
    lines.append("")
    lines.append("| Track | Dataset | Diff 1 | Diff 2 | Pass |")
    lines.append("|---|---|---:|---:|:---:|")
    for row in top_one_stage:
        diff = row.get("diff") or {}
        is_expl = bool(row.get("is_exploratory"))
        track = str(row.get("track", "NA")) + (" (exploratory)" if is_expl else "")
        if row.get("track") == "one_stage":
            d1 = diff.get("effect_abs")
            d2 = diff.get("se_abs")
        else:
            d1 = diff.get("hr_abs")
            d2 = diff.get("theta_abs")
        lines.append(
            f"| {track} | {row.get('dataset', 'NA')} | "
            f"{_fmt(d1, 6)} | {_fmt(d2, 6)} | {'YES' if row.get('pass') else 'NO'} |"
        )
    lines.append("")
    lines.append("## Largest Gap-Method Gaps")
    lines.append("")
    lines.append("| Track | Dataset | Diff 1 | Diff 2 | Pass |")
    lines.append("|---|---|---:|---:|:---:|")
    for row in top_gap_methods:
        diff = row.get("diff") or {}
        track = row.get("track", "NA")
        if track == "centered":
            d1 = diff.get("within_effect_abs")
            d2 = diff.get("within_se_abs")
        elif track == "piecewise":
            d1 = diff.get("loghr_abs")
            d2 = diff.get("se_abs")
        else:
            d1 = diff.get("effect_abs")
            d2 = diff.get("se_abs")
        lines.append(
            f"| {track} | {row.get('dataset', 'NA')} | "
            f"{_fmt(d1, 6)} | {_fmt(d2, 6)} | {'YES' if row.get('pass') else 'NO'} |"
        )
    lines.append("")
    if top_extended_survival:
        lines.append("## Largest Extended Survival Gaps")
        lines.append("")
        lines.append("| Track | Dataset | Landmark | Diff 1 | Diff 2 | Pass |")
        lines.append("|---|---|---:|---:|---:|:---:|")
        for row in top_extended_survival:
            diff = row.get("diff") or {}
            if row.get("track") == "aft_weibull":
                d1 = diff.get("treatment_effect_abs")
                d2 = diff.get("time_ratio_abs")
            else:
                d1 = diff.get("hr_abs")
                d2 = diff.get("se_abs")
            lines.append(
                f"| {row.get('track', 'NA')} | {row.get('dataset', 'NA')} | "
                f"{row.get('landmark', '-')} | {_fmt(d1, 6)} | {_fmt(d2, 6)} | "
                f"{'YES' if row.get('pass') else 'NO'} |"
            )
        lines.append("")
    if top_advanced_survival:
        lines.append("## Largest Advanced Survival Gaps")
        lines.append("")
        lines.append("| Track | Dataset | Cause | Diff 1 | Diff 2 | Pass |")
        lines.append("|---|---|---|---:|---:|:---:|")
        for row in top_advanced_survival:
            diff = row.get("diff") or {}
            if row.get("track") == "cure_meta":
                d1 = diff.get("cure_pooled_abs")
                d2 = diff.get("hr_log_abs")
            else:
                d1 = diff.get("logcshr_abs")
                d2 = diff.get("se_abs")
            lines.append(
                f"| {row.get('track', 'NA')} | {row.get('dataset', 'NA')} | "
                f"{row.get('cause', '-')} | {_fmt(d1, 6)} | {_fmt(d2, 6)} | "
                f"{'YES' if row.get('pass') else 'NO'} |"
            )
        lines.append("")
    lines.append("")
    if top_frontier:
        lines.append("## Largest Frontier Gap-Method Gaps")
        lines.append("")
        lines.append("| Track | Dataset | Diff 1 | Diff 2 | Pass |")
        lines.append("|---|---|---:|---:|:---:|")
        for row in top_frontier:
            app = row.get("app") or {}
            track = row.get("track", "NA")
            if track == "transport_sensitivity":
                d1 = _fmt(app.get("delta_needed_for_null"), 6)
                d2 = _fmt(app.get("base_se"), 6)
            elif track == "transport_overlap":
                d1 = _fmt(app.get("tate_span_stable"), 6)
                d2 = _fmt(app.get("min_overlap_fraction"), 6)
            elif track == "federated_survival":
                d1 = _fmt(app.get("utility_gap"), 6)
                d2 = _fmt(app.get("mean_abs_noise"), 6)
            else:
                d1 = _fmt(app.get("interaction_se"), 6)
                d2 = _fmt(app.get("event_flip_rate"), 6)
            lines.append(
                f"| {track} | {row.get('dataset', 'NA')} | "
                f"{d1} | {d2} | {'YES' if row.get('pass') else 'NO'} |"
            )
        lines.append("")
    lines.append("## Raw Artifact Paths")
    lines.append("")
    lines.append(f"- Two-stage JSON: `{combined['artifacts']['two_stage_json']}`")
    lines.append(f"- Two-stage MD: `{combined['artifacts']['two_stage_md']}`")
    lines.append(f"- One-stage JSON: `{combined['artifacts']['one_stage_json']}`")
    lines.append(f"- One-stage MD: `{combined['artifacts']['one_stage_md']}`")
    lines.append(f"- Gap-method JSON: `{combined['artifacts']['gap_methods_json']}`")
    lines.append(f"- Gap-method MD: `{combined['artifacts']['gap_methods_md']}`")
    if combined["artifacts"].get("extended_survival_json"):
        lines.append(f"- Extended survival JSON: `{combined['artifacts']['extended_survival_json']}`")
    if combined["artifacts"].get("extended_survival_md"):
        lines.append(f"- Extended survival MD: `{combined['artifacts']['extended_survival_md']}`")
    if combined["artifacts"].get("advanced_survival_json"):
        lines.append(f"- Advanced survival JSON: `{combined['artifacts']['advanced_survival_json']}`")
    if combined["artifacts"].get("advanced_survival_md"):
        lines.append(f"- Advanced survival MD: `{combined['artifacts']['advanced_survival_md']}`")
    if combined["artifacts"].get("frontier_json"):
        lines.append(f"- Frontier JSON: `{combined['artifacts']['frontier_json']}`")
    if combined["artifacts"].get("frontier_md"):
        lines.append(f"- Frontier MD: `{combined['artifacts']['frontier_md']}`")
    if combined["artifacts"].get("simulation_json"):
        lines.append(f"- Simulation JSON: `{combined['artifacts']['simulation_json']}`")
    if combined["artifacts"].get("simulation_md"):
        lines.append(f"- Simulation MD: `{combined['artifacts']['simulation_md']}`")
    if combined["artifacts"].get("replication_json"):
        lines.append(f"- Replication JSON: `{combined['artifacts']['replication_json']}`")
    if combined["artifacts"].get("replication_md"):
        lines.append(f"- Replication MD: `{combined['artifacts']['replication_md']}`")
    if combined["artifacts"].get("superiority_json"):
        lines.append(f"- Validation Snapshot JSON (Loop 9): `{combined['artifacts']['superiority_json']}`")
    if combined["artifacts"].get("superiority_md"):
        lines.append(f"- Validation Snapshot MD (Loop 9): `{combined['artifacts']['superiority_md']}`")
    lines.append("")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Loop-2 IPD parity gate vs R (+ optional frontier Loop-3/4/6 and Loop-7 checks)")
    parser.add_argument("--python-exe", default=None, help="Python executable for child benchmark scripts")
    parser.add_argument("--rscript", default=None, help="Path to Rscript.exe (optional)")
    parser.add_argument("--seed", type=int, default=12345, help="Deterministic seed for example datasets")
    parser.add_argument(
        "--with-frontier-gap",
        action="store_true",
        help="Also run frontier gap benchmark (KM uncertainty + transport IOW + transport sensitivity + transport overlap stress + federated survival DP)",
    )
    parser.add_argument(
        "--with-loop7",
        action="store_true",
        help="Also run Loop-7 simulation lab + publication-profile replication checks",
    )
    parser.add_argument("--min-two-stage-pass-rate", type=float, default=1.0)
    parser.add_argument("--min-one-stage-pass-rate", type=float, default=1.0)
    parser.add_argument("--min-frailty-pass-rate", type=float, default=1.0)
    parser.add_argument("--min-centered-pass-rate", type=float, default=1.0)
    parser.add_argument("--min-piecewise-pass-rate", type=float, default=1.0)
    parser.add_argument("--min-rmst-pass-rate", type=float, default=1.0)
    parser.add_argument("--min-extended-survival-pass-rate", type=float, default=1.0)
    parser.add_argument("--min-advanced-survival-pass-rate", type=float, default=1.0)
    parser.add_argument("--min-km-pass-rate", type=float, default=1.0)
    parser.add_argument("--min-transport-iow-pass-rate", type=float, default=1.0)
    parser.add_argument("--min-federated-pass-rate", type=float, default=1.0)
    parser.add_argument("--min-transport-sensitivity-pass-rate", type=float, default=1.0)
    parser.add_argument("--min-transport-overlap-pass-rate", type=float, default=1.0)
    parser.add_argument("--min-simulation-pass-rate", type=float, default=1.0)
    parser.add_argument("--min-replication-pass-rate", type=float, default=1.0)
    parser.add_argument(
        "--out-json",
        default=str(_repo_root() / "dev" / "benchmarks" / "latest_ipd_parity_gate.json"),
    )
    parser.add_argument(
        "--out-md",
        default=str(_repo_root() / "dev" / "benchmarks" / "latest_ipd_parity_gate.md"),
    )
    parser.add_argument(
        "--out-superiority-json",
        default=str(_repo_root() / "dev" / "benchmarks" / "latest_ipd_superiority_snapshot.json"),
    )
    parser.add_argument(
        "--out-superiority-md",
        default=str(_repo_root() / "dev" / "benchmarks" / "latest_ipd_superiority_snapshot.md"),
    )
    args = parser.parse_args()

    repo = _repo_root()
    bench_dir = repo / "dev" / "benchmarks"
    bench_dir.mkdir(parents=True, exist_ok=True)

    py = _find_python_for_bench(args.python_exe)

    two_stage_json = bench_dir / "latest_r_benchmark.json"
    two_stage_md = bench_dir / "latest_r_benchmark.md"
    one_stage_json = bench_dir / "latest_one_stage_r_benchmark.json"
    one_stage_md = bench_dir / "latest_one_stage_r_benchmark.md"
    gap_json = bench_dir / "latest_gap_methods_r_benchmark.json"
    gap_md = bench_dir / "latest_gap_methods_r_benchmark.md"
    extended_survival_json = bench_dir / "latest_extended_survival_r_benchmark.json"
    extended_survival_md = bench_dir / "latest_extended_survival_r_benchmark.md"
    advanced_survival_json = bench_dir / "latest_advanced_survival_r_benchmark.json"
    advanced_survival_md = bench_dir / "latest_advanced_survival_r_benchmark.md"
    frontier_json = bench_dir / "latest_frontier_gap_methods_benchmark.json"
    frontier_md = bench_dir / "latest_frontier_gap_methods_benchmark.md"
    simulation_json = bench_dir / "latest_ipd_simulation_lab_benchmark.json"
    simulation_md = bench_dir / "latest_ipd_simulation_lab_benchmark.md"
    replication_json = bench_dir / "latest_publication_replication_gate.json"
    replication_md = bench_dir / "latest_publication_replication_gate.md"
    superiority_json = Path(args.out_superiority_json)
    superiority_md = Path(args.out_superiority_md)

    bench1 = repo / "dev" / "build-scripts" / "benchmark_against_r.py"
    bench2 = repo / "dev" / "build-scripts" / "benchmark_one_stage_against_r.py"
    bench3 = repo / "dev" / "build-scripts" / "benchmark_gap_methods_against_r.py"
    bench4 = repo / "dev" / "build-scripts" / "benchmark_frontier_gap_methods.py"
    bench5 = repo / "dev" / "build-scripts" / "benchmark_ipd_simulation_lab.py"
    bench6 = repo / "dev" / "build-scripts" / "benchmark_publication_replication_gate.py"
    bench7 = repo / "dev" / "build-scripts" / "build_ipd_superiority_snapshot.py"
    bench8 = repo / "dev" / "build-scripts" / "benchmark_extended_survival_against_r.py"
    bench9 = repo / "dev" / "build-scripts" / "benchmark_advanced_survival_against_r.py"

    cmd1 = [
        str(py),
        _coerce_path_for_python(bench1, py),
        "--seed",
        str(args.seed),
        "--out-json",
        _coerce_path_for_python(two_stage_json, py),
        "--out-md",
        _coerce_path_for_python(two_stage_md, py),
    ]
    cmd2 = [
        str(py),
        _coerce_path_for_python(bench2, py),
        "--seed",
        str(args.seed),
        "--out-json",
        _coerce_path_for_python(one_stage_json, py),
        "--out-md",
        _coerce_path_for_python(one_stage_md, py),
    ]
    cmd3 = [
        str(py),
        _coerce_path_for_python(bench3, py),
        "--seed",
        str(args.seed),
        "--out-json",
        _coerce_path_for_python(gap_json, py),
        "--out-md",
        _coerce_path_for_python(gap_md, py),
    ]
    cmd4 = [
        str(py),
        _coerce_path_for_python(bench8, py),
        "--seed",
        str(args.seed),
        "--output-json",
        _coerce_path_for_python(extended_survival_json, py),
        "--output-md",
        _coerce_path_for_python(extended_survival_md, py),
    ]
    cmd4b = [
        str(py),
        _coerce_path_for_python(bench9, py),
        "--seed",
        str(args.seed),
        "--output-json",
        _coerce_path_for_python(advanced_survival_json, py),
        "--output-md",
        _coerce_path_for_python(advanced_survival_md, py),
    ]
    cmd5 = [
        str(py),
        _coerce_path_for_python(bench4, py),
        "--seed",
        str(args.seed),
        "--out-json",
        _coerce_path_for_python(frontier_json, py),
        "--out-md",
        _coerce_path_for_python(frontier_md, py),
    ]
    cmd6 = [
        str(py),
        _coerce_path_for_python(bench5, py),
        "--seed",
        str(args.seed),
        "--out-json",
        _coerce_path_for_python(simulation_json, py),
        "--out-md",
        _coerce_path_for_python(simulation_md, py),
    ]
    cmd7 = [
        str(py),
        _coerce_path_for_python(bench6, py),
        "--seed",
        str(args.seed),
        "--out-json",
        _coerce_path_for_python(replication_json, py),
        "--out-md",
        _coerce_path_for_python(replication_md, py),
    ]
    cmd8 = [
        str(py),
        _coerce_path_for_python(bench7, py),
        "--parity-json",
        _coerce_path_for_python(Path(args.out_json), py),
        "--frontier-json",
        _coerce_path_for_python(frontier_json, py),
        "--simulation-json",
        _coerce_path_for_python(simulation_json, py),
        "--replication-json",
        _coerce_path_for_python(replication_json, py),
        "--out-json",
        _coerce_path_for_python(superiority_json, py),
        "--out-md",
        _coerce_path_for_python(superiority_md, py),
    ]
    if args.rscript:
        cmd1.extend(["--rscript", args.rscript])
        cmd2.extend(["--rscript", args.rscript])
        cmd3.extend(["--rscript", args.rscript])
        cmd4.extend(["--rscript", args.rscript])
        cmd4b.extend(["--rscript", args.rscript])

    print("=" * 72)
    print("IPD Parity Gate (Loop 2 + optional Loop 3/4/6 + Loop 7)")
    print("=" * 72)
    print(f"Repo: {repo}")
    print(f"Benchmark Python: {py}")
    print(f"Seed: {args.seed}")

    _run_step("Two-stage vs R benchmark", cmd1, repo)
    _run_step("One-stage/frailty vs R benchmark", cmd2, repo)
    _run_step("Gap methods vs R benchmark", cmd3, repo)
    _run_step("Extended survival benchmark vs R", cmd4, repo)
    _run_step("Advanced survival benchmark vs R", cmd4b, repo)
    if args.with_frontier_gap:
        _run_step("Frontier gap methods benchmark (Loop 3/4/6)", cmd5, repo)
    if args.with_loop7:
        _run_step("Simulation lab benchmark (Loop 7)", cmd6, repo)
        _run_step("Publication-profile replication gate (Loop 7)", cmd7, repo)

    two_stage = json.loads(two_stage_json.read_text(encoding="utf-8"))
    one_stage = json.loads(one_stage_json.read_text(encoding="utf-8"))
    gap = json.loads(gap_json.read_text(encoding="utf-8"))
    extended_survival = json.loads(extended_survival_json.read_text(encoding="utf-8"))
    advanced_survival = json.loads(advanced_survival_json.read_text(encoding="utf-8"))
    frontier = json.loads(frontier_json.read_text(encoding="utf-8")) if args.with_frontier_gap else None
    simulation = json.loads(simulation_json.read_text(encoding="utf-8")) if args.with_loop7 else None
    replication = json.loads(replication_json.read_text(encoding="utf-8")) if args.with_loop7 else None

    two_stage_pass = ((two_stage.get("comparison") or {}).get("summary") or {}).get(
        "overall_pass_rate_metafor"
    )
    one_stage_pass = ((one_stage.get("comparison") or {}).get("summary") or {}).get(
        "one_stage_pass_rate"
    )
    one_stage_coverage_pass = ((one_stage.get("comparison") or {}).get("summary") or {}).get(
        "one_stage_coverage_pass_rate"
    )
    one_stage_exploratory_pass = ((one_stage.get("comparison") or {}).get("summary") or {}).get(
        "one_stage_exploratory_pass_rate"
    )
    frailty_pass = ((one_stage.get("comparison") or {}).get("summary") or {}).get(
        "frailty_pass_rate"
    )
    centered_pass = ((gap.get("comparison") or {}).get("summary") or {}).get("centered_pass_rate")
    piecewise_pass = ((gap.get("comparison") or {}).get("summary") or {}).get("piecewise_pass_rate")
    rmst_pass = ((gap.get("comparison") or {}).get("summary") or {}).get("rmst_pass_rate")
    extended_survival_pass = ((extended_survival.get("comparison") or {}).get("summary") or {}).get(
        "overall_pass_rate"
    )
    extended_survival_aft_pass = ((extended_survival.get("comparison") or {}).get("summary") or {}).get(
        "aft_pass_rate"
    )
    extended_survival_landmark_pass = ((extended_survival.get("comparison") or {}).get("summary") or {}).get(
        "landmark_pass_rate"
    )
    advanced_survival_pass = ((advanced_survival.get("comparison") or {}).get("summary") or {}).get(
        "overall_pass_rate"
    )
    advanced_survival_cure_pass = ((advanced_survival.get("comparison") or {}).get("summary") or {}).get(
        "cure_pass_rate"
    )
    advanced_survival_competing_pass = ((advanced_survival.get("comparison") or {}).get("summary") or {}).get(
        "competing_pass_rate"
    )
    km_pass = ((frontier.get("comparison") or {}).get("summary") or {}).get("km_pass_rate") if frontier else None
    transport_iow_pass = (
        ((frontier.get("comparison") or {}).get("summary") or {}).get("transport_iow_pass_rate")
        if frontier
        else None
    )
    transport_sensitivity_pass = (
        ((frontier.get("comparison") or {}).get("summary") or {}).get("transport_sensitivity_pass_rate")
        if frontier
        else None
    )
    transport_overlap_pass = (
        ((frontier.get("comparison") or {}).get("summary") or {}).get("transport_overlap_pass_rate")
        if frontier
        else None
    )
    federated_pass = (
        ((frontier.get("comparison") or {}).get("summary") or {}).get("federated_pass_rate")
        if frontier
        else None
    )
    simulation_pass = (
        ((simulation.get("comparison") or {}).get("summary") or {}).get("overall_pass_rate")
        if simulation
        else None
    )
    replication_pass = (
        ((replication.get("comparison") or {}).get("summary") or {}).get("overall_pass_rate")
        if replication
        else None
    )

    loop2_gate_pass = bool(
        (two_stage_pass is not None and float(two_stage_pass) >= args.min_two_stage_pass_rate)
        and (one_stage_pass is not None and float(one_stage_pass) >= args.min_one_stage_pass_rate)
        and (frailty_pass is not None and float(frailty_pass) >= args.min_frailty_pass_rate)
        and (centered_pass is not None and float(centered_pass) >= args.min_centered_pass_rate)
        and (piecewise_pass is not None and float(piecewise_pass) >= args.min_piecewise_pass_rate)
        and (rmst_pass is not None and float(rmst_pass) >= args.min_rmst_pass_rate)
        and (
            extended_survival_pass is not None
            and float(extended_survival_pass) >= args.min_extended_survival_pass_rate
        )
        and (
            advanced_survival_pass is not None
            and float(advanced_survival_pass) >= args.min_advanced_survival_pass_rate
        )
    )
    loop3_gate_pass = True
    if args.with_frontier_gap:
        loop3_gate_pass = bool(
            (km_pass is not None and float(km_pass) >= args.min_km_pass_rate)
            and (
                transport_iow_pass is not None
                and float(transport_iow_pass) >= args.min_transport_iow_pass_rate
            )
            and (
                transport_sensitivity_pass is not None
                and float(transport_sensitivity_pass) >= args.min_transport_sensitivity_pass_rate
            )
            and (
                transport_overlap_pass is not None
                and float(transport_overlap_pass) >= args.min_transport_overlap_pass_rate
            )
            and (federated_pass is not None and float(federated_pass) >= args.min_federated_pass_rate)
        )
    loop7_gate_pass = True
    if args.with_loop7:
        loop7_gate_pass = bool(
            (simulation_pass is not None and float(simulation_pass) >= args.min_simulation_pass_rate)
            and (replication_pass is not None and float(replication_pass) >= args.min_replication_pass_rate)
        )
    gate_pass = loop2_gate_pass and loop3_gate_pass and loop7_gate_pass

    combined = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "app_build_id": _app_build_id(repo / "ipd-meta-pro.html"),
        "seed": args.seed,
        "artifacts": {
            "two_stage_json": str(two_stage_json),
            "two_stage_md": str(two_stage_md),
            "one_stage_json": str(one_stage_json),
            "one_stage_md": str(one_stage_md),
            "gap_methods_json": str(gap_json),
            "gap_methods_md": str(gap_md),
            "extended_survival_json": str(extended_survival_json),
            "extended_survival_md": str(extended_survival_md),
            "advanced_survival_json": str(advanced_survival_json),
            "advanced_survival_md": str(advanced_survival_md),
            "frontier_json": str(frontier_json) if args.with_frontier_gap else None,
            "frontier_md": str(frontier_md) if args.with_frontier_gap else None,
            "simulation_json": str(simulation_json) if args.with_loop7 else None,
            "simulation_md": str(simulation_md) if args.with_loop7 else None,
            "replication_json": str(replication_json) if args.with_loop7 else None,
            "replication_md": str(replication_md) if args.with_loop7 else None,
            "superiority_json": str(superiority_json),
            "superiority_md": str(superiority_md),
        },
        "summary": {
            "two_stage_pass_rate": two_stage_pass,
            "one_stage_pass_rate": one_stage_pass,
            "one_stage_coverage_pass_rate": one_stage_coverage_pass,
            "one_stage_exploratory_pass_rate": one_stage_exploratory_pass,
            "frailty_pass_rate": frailty_pass,
            "centered_pass_rate": centered_pass,
            "piecewise_pass_rate": piecewise_pass,
            "rmst_pass_rate": rmst_pass,
            "extended_survival_pass_rate": extended_survival_pass,
            "extended_survival_aft_pass_rate": extended_survival_aft_pass,
            "extended_survival_landmark_pass_rate": extended_survival_landmark_pass,
            "advanced_survival_pass_rate": advanced_survival_pass,
            "advanced_survival_cure_pass_rate": advanced_survival_cure_pass,
            "advanced_survival_competing_pass_rate": advanced_survival_competing_pass,
            "km_pass_rate": km_pass,
            "transport_iow_pass_rate": transport_iow_pass,
            "transport_sensitivity_pass_rate": transport_sensitivity_pass,
            "transport_overlap_pass_rate": transport_overlap_pass,
            "federated_pass_rate": federated_pass,
            "simulation_lab_pass_rate": simulation_pass,
            "publication_replication_pass_rate": replication_pass,
            "two_stage_rows": ((two_stage.get("comparison") or {}).get("summary") or {}).get("rows"),
            "one_stage_rows": ((one_stage.get("comparison") or {}).get("summary") or {}).get("rows"),
            "gap_rows": ((gap.get("comparison") or {}).get("summary") or {}).get("rows"),
            "extended_survival_rows": ((extended_survival.get("comparison") or {}).get("summary") or {}).get("rows"),
            "advanced_survival_rows": ((advanced_survival.get("comparison") or {}).get("summary") or {}).get("rows"),
            "frontier_rows": (
                ((frontier.get("comparison") or {}).get("summary") or {}).get("rows")
                if frontier
                else None
            ),
            "simulation_rows": (
                ((simulation.get("comparison") or {}).get("summary") or {}).get("rows")
                if simulation
                else None
            ),
            "replication_rows": (
                ((replication.get("comparison") or {}).get("summary") or {}).get("rows")
                if replication
                else None
            ),
        },
        "gate": {
            "pass": gate_pass,
            "loop2_pass": loop2_gate_pass,
            "loop3_pass": loop3_gate_pass,
            "loop7_pass": loop7_gate_pass,
            "with_frontier_gap": args.with_frontier_gap,
            "with_loop7": args.with_loop7,
            "min_two_stage_pass_rate": args.min_two_stage_pass_rate,
            "min_one_stage_pass_rate": args.min_one_stage_pass_rate,
            "min_frailty_pass_rate": args.min_frailty_pass_rate,
            "min_centered_pass_rate": args.min_centered_pass_rate,
            "min_piecewise_pass_rate": args.min_piecewise_pass_rate,
            "min_rmst_pass_rate": args.min_rmst_pass_rate,
            "min_extended_survival_pass_rate": args.min_extended_survival_pass_rate,
            "min_advanced_survival_pass_rate": args.min_advanced_survival_pass_rate,
            "min_km_pass_rate": args.min_km_pass_rate,
            "min_transport_iow_pass_rate": args.min_transport_iow_pass_rate,
            "min_federated_pass_rate": args.min_federated_pass_rate,
            "min_transport_sensitivity_pass_rate": args.min_transport_sensitivity_pass_rate,
            "min_transport_overlap_pass_rate": args.min_transport_overlap_pass_rate,
            "min_simulation_pass_rate": args.min_simulation_pass_rate,
            "min_replication_pass_rate": args.min_replication_pass_rate,
        },
    }

    top_two = _top_two_stage_gaps(two_stage)
    top_one = _top_one_stage_gaps(one_stage)
    top_gap = _top_gap_method_gaps(gap)
    top_extended = _top_extended_survival_gaps(extended_survival)
    top_advanced = _top_advanced_survival_gaps(advanced_survival)
    top_frontier = _top_frontier_gaps(frontier) if frontier else []
    combined["top_gaps"] = {
        "two_stage": top_two,
        "one_stage_frailty": top_one,
        "gap_methods": top_gap,
        "extended_survival": top_extended,
        "advanced_survival": top_advanced,
        "frontier_gap_methods": top_frontier if frontier else None,
    }

    out_json = Path(args.out_json)
    out_md = Path(args.out_md)
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(combined, indent=2), encoding="utf-8")
    _write_markdown(out_md, combined, top_two, top_one, top_gap, top_extended, top_advanced, top_frontier if frontier else None)
    _run_step("Validation snapshot build (Loop 9)", cmd8, repo)

    print("\nGate summary:")
    print(f"- Two-stage pass rate: {_fmt(two_stage_pass, 3)}")
    print(f"- One-stage pass rate: {_fmt(one_stage_pass, 3)}")
    print(f"- Frailty pass rate: {_fmt(frailty_pass, 3)}")
    print(f"- Centered pass rate: {_fmt(centered_pass, 3)}")
    print(f"- Piecewise pass rate: {_fmt(piecewise_pass, 3)}")
    print(f"- RMST pass rate: {_fmt(rmst_pass, 3)}")
    print(f"- Extended survival pass rate: {_fmt(extended_survival_pass, 3)}")
    print(f"- Advanced survival pass rate: {_fmt(advanced_survival_pass, 3)}")
    if args.with_frontier_gap:
        print(f"- KM pass rate: {_fmt(km_pass, 3)}")
        print(f"- Transport IOW pass rate: {_fmt(transport_iow_pass, 3)}")
        print(f"- Transport sensitivity pass rate: {_fmt(transport_sensitivity_pass, 3)}")
        print(f"- Transport overlap-stress pass rate: {_fmt(transport_overlap_pass, 3)}")
        print(f"- Federated pass rate: {_fmt(federated_pass, 3)}")
    if args.with_loop7:
        print(f"- Simulation lab pass rate: {_fmt(simulation_pass, 3)}")
        print(f"- Publication replication pass rate: {_fmt(replication_pass, 3)}")
    print(f"- Overall gate: {'PASS' if gate_pass else 'FAIL'}")
    print(f"- JSON: {out_json}")
    print(f"- MD: {out_md}")

    return 0 if gate_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
