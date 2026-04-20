#!/usr/bin/env python3
"""Build Loop-9 IPD validation snapshot from benchmark artifacts."""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _mean(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def _to_float(value: Any) -> float | None:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    if out != out:  # NaN
        return None
    return out


def _status(value: float | None, gate: float | None) -> str:
    if value is None or gate is None:
        return "missing"
    if value > gate + 0.0025:
        return "ahead"
    if value >= gate:
        return "target"
    return "below"


def _fmt_pct(v: float | None) -> str:
    return "NA" if v is None else f"{v*100:.1f}%"


def _load_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _write_markdown(path: Path, payload: dict[str, Any]) -> None:
    sc = payload.get("scorecards") or {}
    metrics = payload.get("metrics") or []
    avail = payload.get("artifact_availability") or {}
    lines: list[str] = []
    lines.append("# IPD Validation Snapshot (Loop 9)")
    lines.append("")
    lines.append(f"- Generated: `{payload.get('generated_at')}`")
    lines.append(f"- Positioning: `{(payload.get('positioning') or {}).get('level', 'unknown')}`")
    lines.append(f"- Composite validated score: `{_fmt_pct(sc.get('composite_validated_score'))}`")
    lines.append(f"- Loop 2 score: `{_fmt_pct(sc.get('loop2_score'))}`")
    lines.append(f"- Frontier score (Loop 3/4/6): `{_fmt_pct(sc.get('frontier_score'))}`")
    lines.append(f"- Loop 7 score: `{_fmt_pct(sc.get('loop7_score'))}`")
    lines.append("")
    lines.append("## Metrics")
    lines.append("")
    lines.append("| Metric | Value | Gate | Gap | Status |")
    lines.append("|---|---:|---:|---:|:---:|")
    for m in metrics:
        value = _to_float(m.get("value"))
        gate = _to_float(m.get("gate"))
        gap = _to_float(m.get("gap_to_gate"))
        lines.append(
            f"| {m.get('label', 'NA')} | "
            f"{_fmt_pct(value)} | {_fmt_pct(gate)} | "
            f"{'NA' if gap is None else f'{gap:.3f}'} | {m.get('status', 'missing')} |"
        )
    lines.append("")
    lines.append("## Artifact Availability")
    lines.append("")
    lines.append(f"- Parity gate: `{'yes' if avail.get('parity') else 'no'}`")
    lines.append(f"- Frontier: `{'yes' if avail.get('frontier') else 'no'}`")
    lines.append(f"- Simulation: `{'yes' if avail.get('simulation') else 'no'}`")
    lines.append(f"- Replication: `{'yes' if avail.get('replication') else 'no'}`")
    lines.append("")
    lines.append("## Positioning Message")
    lines.append("")
    lines.append((payload.get("positioning") or {}).get("message", "NA"))
    lines.append("")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    repo = _repo_root()
    bench = repo / "dev" / "benchmarks"
    parser = argparse.ArgumentParser(description="Build Loop-9 validation snapshot from latest benchmark artifacts.")
    parser.add_argument(
        "--parity-json",
        default=str(bench / "latest_ipd_parity_gate.json"),
        help="Path to parity-gate JSON artifact",
    )
    parser.add_argument(
        "--frontier-json",
        default=str(bench / "latest_frontier_gap_methods_benchmark.json"),
        help="Path to frontier benchmark JSON artifact",
    )
    parser.add_argument(
        "--simulation-json",
        default=str(bench / "latest_ipd_simulation_lab_benchmark.json"),
        help="Path to Loop-7 simulation benchmark JSON artifact",
    )
    parser.add_argument(
        "--replication-json",
        default=str(bench / "latest_publication_replication_gate.json"),
        help="Path to Loop-7 replication benchmark JSON artifact",
    )
    parser.add_argument(
        "--out-json",
        default=str(bench / "latest_ipd_superiority_snapshot.json"),
        help="Output JSON path",
    )
    parser.add_argument(
        "--out-md",
        default=str(bench / "latest_ipd_superiority_snapshot.md"),
        help="Output markdown path",
    )
    args = parser.parse_args()

    parity_path = Path(args.parity_json)
    parity = _load_json(parity_path)
    if parity is None:
        print(f"[ERROR] Missing parity gate JSON: {parity_path}")
        return 1

    frontier = _load_json(Path(args.frontier_json))
    simulation = _load_json(Path(args.simulation_json))
    replication = _load_json(Path(args.replication_json))

    summary = (parity.get("summary") or {}) if isinstance(parity, dict) else {}
    gate = (parity.get("gate") or {}) if isinstance(parity, dict) else {}
    frontier_summary = (frontier.get("comparison") or {}).get("summary") if isinstance(frontier, dict) else {}

    frontier_fallback_keys = {
        "km_pass_rate",
        "transport_iow_pass_rate",
        "transport_sensitivity_pass_rate",
        "transport_overlap_pass_rate",
        "federated_pass_rate",
    }
    gate_defaults = {
        "min_transport_iow_pass_rate": 1.0,
    }

    def metric_value(key: str) -> float | None:
        value = _to_float(summary.get(key))
        if value is not None:
            return value
        if key in frontier_fallback_keys and isinstance(frontier_summary, dict):
            return _to_float(frontier_summary.get(key))
        return None

    def metric_gate(gate_key: str) -> float | None:
        value = _to_float(gate.get(gate_key))
        if value is not None:
            return value
        return _to_float(gate_defaults.get(gate_key))

    specs: list[tuple[str, str, str, str]] = [
        ("Two-stage parity vs metafor", "two_stage_pass_rate", "min_two_stage_pass_rate", "loop2"),
        ("One-stage parity vs lme4", "one_stage_pass_rate", "min_one_stage_pass_rate", "loop2"),
        ("Frailty parity vs coxph", "frailty_pass_rate", "min_frailty_pass_rate", "loop2"),
        ("Centered interaction parity", "centered_pass_rate", "min_centered_pass_rate", "loop2"),
        ("Piecewise survival parity", "piecewise_pass_rate", "min_piecewise_pass_rate", "loop2"),
        ("RMST parity", "rmst_pass_rate", "min_rmst_pass_rate", "loop2"),
        ("Extended survival parity", "extended_survival_pass_rate", "min_extended_survival_pass_rate", "loop2"),
        ("Advanced survival parity", "advanced_survival_pass_rate", "min_advanced_survival_pass_rate", "loop2"),
        ("KM uncertainty method pass", "km_pass_rate", "min_km_pass_rate", "frontier"),
        ("Transportability IOW pass", "transport_iow_pass_rate", "min_transport_iow_pass_rate", "frontier"),
        (
            "Transport sensitivity pass",
            "transport_sensitivity_pass_rate",
            "min_transport_sensitivity_pass_rate",
            "frontier",
        ),
        ("Transport overlap stress pass", "transport_overlap_pass_rate", "min_transport_overlap_pass_rate", "frontier"),
        ("Federated survival pass", "federated_pass_rate", "min_federated_pass_rate", "frontier"),
        ("Simulation lab pass", "simulation_lab_pass_rate", "min_simulation_pass_rate", "loop7"),
        ("Publication replication pass", "publication_replication_pass_rate", "min_replication_pass_rate", "loop7"),
    ]

    metrics: list[dict[str, Any]] = []
    for label, key, gate_key, group in specs:
        value = metric_value(key)
        gate_value = metric_gate(gate_key)
        metrics.append(
            {
                "label": label,
                "key": key,
                "group": group,
                "value": value,
                "gate": gate_value,
                "gap_to_gate": (value - gate_value) if value is not None and gate_value is not None else None,
                "status": _status(value, gate_value),
            }
        )

    loop2_vals = [m["value"] for m in metrics if m["group"] == "loop2" and m["value"] is not None]
    frontier_vals = [m["value"] for m in metrics if m["group"] == "frontier" and m["value"] is not None]
    loop7_vals = [m["value"] for m in metrics if m["group"] == "loop7" and m["value"] is not None]
    all_vals = [m["value"] for m in metrics if m["value"] is not None]
    composite = _mean(all_vals)

    if composite is None:
        level = "unknown"
        msg = "Benchmark artifacts unavailable for inferences."
    elif composite >= 0.999:
        level = "world-class"
        msg = "Available compatible benchmark artifacts show high pass rates."
    elif composite >= 0.98:
        level = "strong"
        msg = "Available compatible benchmark artifacts are favorable, with smaller residual headroom."
    else:
        level = "developing"
        msg = "Benchmark rates indicate meaningful room for improvement."

    payload: dict[str, Any] = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "app_build_id": ((parity or {}).get("app_build_id") or (frontier or {}).get("app_build_id") or (simulation or {}).get("app_build_id") or (replication or {}).get("app_build_id")),
        "source_artifacts": {
            "parity_json": str(Path(args.parity_json)),
            "frontier_json": str(Path(args.frontier_json)),
            "simulation_json": str(Path(args.simulation_json)),
            "replication_json": str(Path(args.replication_json)),
        },
        "artifact_availability": {
            "parity": parity is not None,
            "frontier": frontier is not None,
            "simulation": simulation is not None,
            "replication": replication is not None,
        },
        "scorecards": {
            "composite_validated_score": composite,
            "loop2_score": _mean(loop2_vals),
            "frontier_score": _mean(frontier_vals),
            "loop7_score": _mean(loop7_vals),
        },
        "metrics": metrics,
        "positioning": {"level": level, "message": msg},
    }

    out_json = Path(args.out_json)
    out_md = Path(args.out_md)
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    _write_markdown(out_md, payload)

    print("IPD validation snapshot built")
    print(f"- JSON: {out_json}")
    print(f"- MD: {out_md}")
    print(f"- Composite validated score: {_fmt_pct((payload.get('scorecards') or {}).get('composite_validated_score'))}")
    print(f"- Positioning: {level}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
