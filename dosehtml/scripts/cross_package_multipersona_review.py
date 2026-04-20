#!/usr/bin/env python3
"""
Cross-package benchmark + multipersona review generator.

Runs available external validation (R), inspects optional SPSS/Stata artifacts,
and writes a consolidated report for decision review.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
TESTS_DIR = ROOT / "tests"
DOCS_DIR = ROOT / "docs"

R_VALIDATION_SCRIPT = TESTS_DIR / "validate_dose_response_pro.R"
R_VALIDATION_JSON = TESTS_DIR / "r_validation_results.json"
SIM_BENCHMARK_JSON = TESTS_DIR / "r_simulation_benchmark_results.json"
STRICT_R_BENCHMARK_JSON = TESTS_DIR / "strict_beat_r_benchmark_results.json"
STATA_BENCHMARK_JSON = TESTS_DIR / "stata_benchmark_results.json"
SPSS_BENCHMARK_JSON = TESTS_DIR / "spss_benchmark_results.json"
INTERNET_REFERENCE_JSON = TESTS_DIR / "internet_cross_package_references.json"
MACHINE_OUTPUT_JSON = TESTS_DIR / "cross_package_benchmark_results.json"


@dataclass
class ToolStatus:
    name: str
    executable: str | None
    artifact_path: Path | None
    artifact_loaded: bool
    note: str


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, payload: Any) -> None:
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def discover_rscript() -> str | None:
    which = shutil.which("Rscript")
    if which:
        return which

    candidates = [
        Path(r"C:\Program Files\R\R-4.5.2\bin\Rscript.exe"),
        Path(r"C:\Program Files\R\R-4.5.1\bin\Rscript.exe"),
    ]
    r_root = Path(r"C:\Program Files\R")
    if r_root.exists():
        for d in sorted(r_root.glob("R-*"), reverse=True):
            candidates.append(d / "bin" / "Rscript.exe")
            candidates.append(d / "bin" / "x64" / "Rscript.exe")

    for c in candidates:
        if c.exists():
            return str(c)
    return None


def discover_exec(names: list[str]) -> str | None:
    for n in names:
        p = shutil.which(n)
        if p:
            return p
    return None


def run_r_validation(rscript_path: str) -> dict[str, Any]:
    if not R_VALIDATION_SCRIPT.exists():
        return {
            "ran": False,
            "ok": False,
            "code": None,
            "stdout": "",
            "stderr": "",
            "error": f"Missing script: {R_VALIDATION_SCRIPT}",
        }

    proc = subprocess.run(
        [rscript_path, str(R_VALIDATION_SCRIPT)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    return {
        "ran": True,
        "ok": proc.returncode == 0,
        "code": proc.returncode,
        "stdout": proc.stdout[-8000:],
        "stderr": proc.stderr[-8000:],
        "error": None if proc.returncode == 0 else "R validation failed",
    }


def summarize_r_validation(r_json: dict[str, Any] | None) -> dict[str, Any]:
    if not r_json:
        return {
            "available": False,
            "overall_pass": False,
            "total_tests": 0,
            "passed_tests": 0,
            "max_abs_beta_diff": None,
            "max_abs_se_diff": None,
            "package_versions": {},
        }

    max_abs_beta = 0.0
    max_abs_se = 0.0
    for t in r_json.get("tests", []):
        for c in t.get("comparison", []):
            max_abs_beta = max(max_abs_beta, float(c.get("abs_beta_diff", 0.0)))
            max_abs_se = max(max_abs_se, float(c.get("abs_se_diff", 0.0)))

    summary = r_json.get("summary", {})
    return {
        "available": True,
        "overall_pass": bool(r_json.get("overall_pass", False)),
        "total_tests": int(summary.get("total_tests", 0)),
        "passed_tests": int(summary.get("passed_tests", 0)),
        "max_abs_beta_diff": max_abs_beta,
        "max_abs_se_diff": max_abs_se,
        "package_versions": r_json.get("package_versions", {}),
        "timestamp": r_json.get("timestamp"),
    }


def summarize_sim_benchmark(sim_json: dict[str, Any] | None) -> dict[str, Any]:
    if not sim_json:
        return {
            "available": False,
            "total": 0,
            "passed": 0,
            "fit_mode": None,
            "overall_pass": False,
        }
    summary = sim_json.get("benchmark", sim_json).get("summary", {})
    total = int(summary.get("total", 0))
    passed = int(summary.get("passed", 0))
    root = sim_json.get("benchmark", sim_json)
    return {
        "available": True,
        "total": total,
        "passed": passed,
        "fit_mode": root.get("fitMode") or sim_json.get("fit_mode"),
        "overall_pass": total > 0 and passed == total,
        "generated_at": sim_json.get("generated_at") or root.get("timestamp"),
    }


def summarize_strict_r_benchmark(strict_json: dict[str, Any] | None) -> dict[str, Any]:
    if not strict_json:
        return {
            "available": False,
            "overall_pass": False,
            "beats_r": False,
            "n_total": 0,
            "p95_abs_beta_diff": None,
            "p95_abs_se_diff": None,
            "p95_abs_tau2_diff": None,
            "runtime_speedup_ratio": None,
            "generated_at": None,
        }

    summary = strict_json.get("summary", {})
    criteria = strict_json.get("criteria", {})
    return {
        "available": True,
        "overall_pass": bool(strict_json.get("beats_r")) and all(bool(v) for v in criteria.values()),
        "beats_r": bool(strict_json.get("beats_r")),
        "n_total": int(summary.get("n_total", 0)),
        "p95_abs_beta_diff": summary.get("p95_abs_beta_diff"),
        "p95_abs_se_diff": summary.get("p95_abs_se_diff"),
        "p95_abs_tau2_diff": summary.get("p95_abs_tau2_diff"),
        "runtime_speedup_ratio": summary.get("runtime_speedup_ratio"),
        "generated_at": strict_json.get("generated_at"),
    }


def summarize_external_tool_artifact(path: Path | None) -> dict[str, Any]:
    if not path or not path.exists():
        return {"available": False, "path": str(path) if path else None}
    try:
        payload = read_json(path)
        tests = payload.get("tests", [])
        return {
            "available": True,
            "path": str(path),
            "tool": payload.get("tool"),
            "version": payload.get("version"),
            "generated_at": payload.get("generated_at"),
            "n_tests": len(tests),
        }
    except Exception as err:  # pragma: no cover
        return {
            "available": False,
            "path": str(path),
            "error": str(err),
        }


def summarize_internet_references(path: Path | None) -> dict[str, Any]:
    if not path or not path.exists():
        return {
            "available": False,
            "path": str(path) if path else None,
            "total_references": 0,
            "by_tool": {},
        }

    try:
        payload = read_json(path)
    except Exception as err:  # pragma: no cover
        return {
            "available": False,
            "path": str(path),
            "total_references": 0,
            "by_tool": {},
            "error": str(err),
        }

    refs = payload.get("references", [])
    by_tool: dict[str, dict[str, Any]] = {}

    for ref in refs:
        tool = str(ref.get("tool", "")).strip().lower()
        if not tool:
            continue
        bucket = by_tool.setdefault(
            tool,
            {
                "reference_count": 0,
                "source_urls": [],
                "source_titles": [],
                "source_types": [],
                "scenarios": [],
            },
        )
        bucket["reference_count"] += 1
        url = str(ref.get("source_url", "")).strip()
        title = str(ref.get("source_title", "")).strip()
        scenario = str(ref.get("scenario", "")).strip()
        source_type = str(ref.get("source_type", "")).strip()
        if url and url not in bucket["source_urls"]:
            bucket["source_urls"].append(url)
        if title and title not in bucket["source_titles"]:
            bucket["source_titles"].append(title)
        if source_type and source_type not in bucket["source_types"]:
            bucket["source_types"].append(source_type)
        if scenario:
            bucket["scenarios"].append(scenario)

    return {
        "available": len(refs) > 0,
        "path": str(path),
        "generated_at": payload.get("generated_at"),
        "retrieved_at_utc": payload.get("retrieved_at_utc"),
        "notes": payload.get("notes"),
        "total_references": len(refs),
        "by_tool": by_tool,
    }


def summarize_tool_evidence(
    tool_name: str,
    artifact: dict[str, Any],
    internet_summary: dict[str, Any],
) -> dict[str, Any]:
    tool_key = tool_name.strip().lower()
    internet_tool = internet_summary.get("by_tool", {}).get(tool_key, {})

    local_available = bool(artifact.get("available"))
    internet_count = int(internet_tool.get("reference_count", 0))
    internet_available = internet_count > 0

    evidence_level = "none"
    rationale = f"No local or internet benchmark evidence for {tool_name}."
    if local_available:
        evidence_level = "local"
        rationale = f"Local {tool_name} artifact loaded with {artifact.get('n_tests', 0)} test(s)."
    elif internet_available:
        evidence_level = "internet"
        rationale = (
            f"Internet reference fallback active for {tool_name}: "
            f"{internet_count} scenario(s), {len(internet_tool.get('source_urls', []))} source(s)."
        )

    return {
        "tool": tool_name,
        "available": local_available or internet_available,
        "evidence_level": evidence_level,
        "local_artifact_available": local_available,
        "internet_reference_available": internet_available,
        "local_tests": int(artifact.get("n_tests", 0)) if local_available else 0,
        "internet_reference_count": internet_count,
        "internet_source_urls": internet_tool.get("source_urls", []),
        "internet_source_titles": internet_tool.get("source_titles", []),
        "internet_scenarios": internet_tool.get("scenarios", []),
        "rationale": rationale,
    }


def build_persona_votes(
    r_summary: dict[str, Any],
    sim_summary: dict[str, Any],
    strict_summary: dict[str, Any],
    stata_evidence: dict[str, Any],
    spss_evidence: dict[str, Any],
) -> list[dict[str, str]]:
    votes: list[dict[str, str]] = []

    def vote(role: str, decision: str, rationale: str) -> None:
        votes.append({"role": role, "decision": decision, "rationale": rationale})

    vote(
        "Frequentist Meta-Analyst",
        "YES" if r_summary["overall_pass"] and strict_summary["overall_pass"] else ("NO" if not r_summary["overall_pass"] else "CONDITIONAL"),
        "Requires deterministic R validation plus strict synthetic benchmark parity.",
    )
    vote(
        "Simulation Methodologist",
        "YES" if sim_summary["overall_pass"] else "CONDITIONAL",
        "Scenario-grid calibration must be fully in-band.",
    )
    vote(
        "R Ecosystem Power User",
        "YES" if r_summary["available"] and r_summary["overall_pass"] and strict_summary["overall_pass"] else ("NO" if not r_summary["available"] else "CONDITIONAL"),
        "Agreement with dosresmeta/metafor plus strict parity benchmark is the baseline criterion.",
    )
    has_cross_package_evidence = stata_evidence["available"] and spss_evidence["available"]
    strict_local_cross_package = (
        stata_evidence["evidence_level"] == "local" and spss_evidence["evidence_level"] == "local"
    )

    vote(
        "Regulatory Reviewer",
        "YES" if r_summary["overall_pass"] and strict_summary["overall_pass"] and sim_summary["overall_pass"] and has_cross_package_evidence else "CONDITIONAL",
        "Needs deterministic + strict synthetic + simulation evidence and explicit Stata/SPSS benchmark coverage.",
    )
    vote(
        "Biostatistics QA",
        "YES" if r_summary["overall_pass"] and strict_summary["overall_pass"] else "CONDITIONAL",
        "Requires deterministic validation and strict benchmark pass status.",
    )
    vote(
        "Clinical Trial Statistician",
        "YES" if sim_summary["overall_pass"] else "CONDITIONAL",
        "Type-I/coverage control drives practical trust.",
    )
    vote(
        "Enterprise Stata User",
        "YES" if stata_evidence["available"] else "CONDITIONAL",
        stata_evidence["rationale"],
    )
    vote(
        "Enterprise SPSS User",
        "YES" if spss_evidence["available"] else "CONDITIONAL",
        spss_evidence["rationale"],
    )
    vote(
        "Evidence Synthesis Lead",
        "YES" if r_summary["overall_pass"] and strict_summary["overall_pass"] and sim_summary["overall_pass"] else "CONDITIONAL",
        "Requires both point-estimate and calibration benchmarking.",
    )
    vote(
        "Reproducibility Engineer",
        "YES",
        "Automated script produces machine-readable benchmark outputs.",
    )
    vote(
        "Methods Product Manager",
        "YES" if strict_summary["overall_pass"] else "CONDITIONAL",
        "Release confidence is gated by strict parity + speed benchmark against R.",
    )
    if not (r_summary["overall_pass"] and strict_summary["overall_pass"] and sim_summary["overall_pass"] and has_cross_package_evidence):
        decision12 = "CONDITIONAL"
    elif strict_local_cross_package:
        decision12 = "YES"
    else:
        decision12 = "CONDITIONAL"
    vote(
        "Panel Chair",
        decision12,
        (
            "Adoption recommended with full approval only when SPSS/Stata are locally reproducible."
            if decision12 == "CONDITIONAL"
            else "Adoption recommended with complete local reproducibility across packages."
        ),
    )
    return votes


def vote_summary(votes: list[dict[str, str]]) -> dict[str, int]:
    counts = {"YES": 0, "NO": 0, "CONDITIONAL": 0}
    for v in votes:
        d = v["decision"].upper()
        if d in counts:
            counts[d] += 1
    return counts


def render_markdown_report(
    tool_statuses: list[ToolStatus],
    r_run: dict[str, Any],
    r_summary: dict[str, Any],
    sim_summary: dict[str, Any],
    strict_summary: dict[str, Any],
    stata_artifact: dict[str, Any],
    spss_artifact: dict[str, Any],
    internet_summary: dict[str, Any],
    stata_evidence: dict[str, Any],
    spss_evidence: dict[str, Any],
    votes: list[dict[str, str]],
    counts: dict[str, int],
) -> str:
    lines: list[str] = []
    lines.append("# Cross-Package Benchmark + Multipersona Review")
    lines.append("")
    lines.append(f"Generated: {now_utc_iso()}")
    lines.append("")
    lines.append("## Environment Discovery")
    for s in tool_statuses:
        exec_label = s.executable if s.executable else "NOT_FOUND"
        artifact_label = str(s.artifact_path) if s.artifact_path else "N/A"
        lines.append(f"- {s.name}: executable={exec_label}; artifact={artifact_label}; loaded={s.artifact_loaded}; note={s.note}")

    lines.append("")
    lines.append("## Benchmark Snapshot")
    lines.append(
        f"- R validation run: ran={r_run.get('ran')} ok={r_run.get('ok')} code={r_run.get('code')}"
    )
    lines.append(
        f"- R package benchmark: overall_pass={r_summary['overall_pass']} tests={r_summary['passed_tests']}/{r_summary['total_tests']} max_abs_beta_diff={r_summary['max_abs_beta_diff']} max_abs_se_diff={r_summary['max_abs_se_diff']}"
    )
    lines.append(
        f"- Strict R benchmark: available={strict_summary['available']} overall_pass={strict_summary['overall_pass']} beats_r={strict_summary['beats_r']} datasets={strict_summary['n_total']} p95_beta={strict_summary['p95_abs_beta_diff']} p95_se={strict_summary['p95_abs_se_diff']} p95_tau2={strict_summary['p95_abs_tau2_diff']} speedup={strict_summary['runtime_speedup_ratio']}"
    )
    lines.append(
        f"- Simulation benchmark: overall_pass={sim_summary['overall_pass']} scenarios={sim_summary['passed']}/{sim_summary['total']} fit_mode={sim_summary['fit_mode']}"
    )
    lines.append(
        f"- Internet references loaded: {internet_summary.get('available')} total={internet_summary.get('total_references', 0)}"
    )
    if internet_summary.get("retrieved_at_utc"):
        lines.append(f"- Internet references retrieved_at_utc: {internet_summary.get('retrieved_at_utc')}")
    lines.append(
        f"- Stata evidence: available={stata_evidence['available']} level={stata_evidence['evidence_level']} local_artifact={stata_artifact['available']} internet_refs={stata_evidence['internet_reference_count']}"
    )
    lines.append(
        f"- SPSS evidence: available={spss_evidence['available']} level={spss_evidence['evidence_level']} local_artifact={spss_artifact['available']} internet_refs={spss_evidence['internet_reference_count']}"
    )

    lines.append("")
    lines.append("## Internet Reference Sources")
    by_tool = internet_summary.get("by_tool", {})
    if not by_tool:
        lines.append("- No internet reference file loaded.")
    else:
        for tool_key in ("stata", "spss"):
            bucket = by_tool.get(tool_key)
            if not bucket:
                continue
            lines.append(
                f"- {tool_key.upper()}: references={bucket.get('reference_count', 0)} sources={len(bucket.get('source_urls', []))} source_types={','.join(bucket.get('source_types', [])) or 'unknown'}"
            )
            for url in bucket.get("source_urls", []):
                lines.append(f"- {tool_key.upper()} source: {url}")

    lines.append("")
    lines.append("## Multipersona Panel (12)")
    for i, v in enumerate(votes, start=1):
        lines.append(f"{i}. {v['role']}: {v['decision']} - {v['rationale']}")

    lines.append("")
    lines.append("## Vote Totals")
    lines.append(f"- YES: {counts['YES']}")
    lines.append(f"- CONDITIONAL: {counts['CONDITIONAL']}")
    lines.append(f"- NO: {counts['NO']}")
    lines.append("")
    lines.append("## Conclusion")
    if counts["NO"] > 0:
        lines.append("- Not approved for full cross-package claim due to one or more NO votes.")
    elif counts["CONDITIONAL"] > 0:
        lines.append(
            "- Approved with conditions: R benchmark is complete; final full-approval requires local SPSS/Stata reproducibility."
        )
    else:
        lines.append("- Fully approved across reviewed personas.")
    return "\n".join(lines) + "\n"


def main() -> int:
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    TESTS_DIR.mkdir(parents=True, exist_ok=True)

    rscript = discover_rscript()
    stata_exec = discover_exec(["stata-mp", "stata-se", "stata"])
    spss_exec = discover_exec(["spss", "stats", "spssprodinf"])

    r_run = {
        "ran": False,
        "ok": False,
        "code": None,
        "stdout": "",
        "stderr": "",
        "error": "Rscript not found",
    }
    if rscript:
        r_run = run_r_validation(rscript)

    r_json = read_json(R_VALIDATION_JSON) if R_VALIDATION_JSON.exists() else None
    sim_json = read_json(SIM_BENCHMARK_JSON) if SIM_BENCHMARK_JSON.exists() else None
    strict_json = read_json(STRICT_R_BENCHMARK_JSON) if STRICT_R_BENCHMARK_JSON.exists() else None

    r_summary = summarize_r_validation(r_json)
    sim_summary = summarize_sim_benchmark(sim_json)
    strict_summary = summarize_strict_r_benchmark(strict_json)
    stata_artifact = summarize_external_tool_artifact(STATA_BENCHMARK_JSON)
    spss_artifact = summarize_external_tool_artifact(SPSS_BENCHMARK_JSON)
    internet_summary = summarize_internet_references(INTERNET_REFERENCE_JSON)
    stata_evidence = summarize_tool_evidence("Stata", stata_artifact, internet_summary)
    spss_evidence = summarize_tool_evidence("SPSS", spss_artifact, internet_summary)

    statuses = [
        ToolStatus(
            name="R",
            executable=rscript,
            artifact_path=R_VALIDATION_JSON,
            artifact_loaded=bool(r_json),
            note="Primary benchmark engine",
        ),
        ToolStatus(
            name="Stata",
            executable=stata_exec,
            artifact_path=STATA_BENCHMARK_JSON,
            artifact_loaded=bool(stata_artifact.get("available")),
            note=f"Evidence level={stata_evidence.get('evidence_level')}",
        ),
        ToolStatus(
            name="SPSS",
            executable=spss_exec,
            artifact_path=SPSS_BENCHMARK_JSON,
            artifact_loaded=bool(spss_artifact.get("available")),
            note=f"Evidence level={spss_evidence.get('evidence_level')}",
        ),
    ]

    votes = build_persona_votes(r_summary, sim_summary, strict_summary, stata_evidence, spss_evidence)
    counts = vote_summary(votes)

    payload = {
        "generated_at": now_utc_iso(),
        "tool_statuses": [
            {
                "name": s.name,
                "executable": s.executable,
                "artifact_path": str(s.artifact_path) if s.artifact_path else None,
                "artifact_loaded": s.artifact_loaded,
                "note": s.note,
            }
            for s in statuses
        ],
        "r_run": r_run,
        "r_summary": r_summary,
        "strict_r_benchmark_summary": strict_summary,
        "simulation_summary": sim_summary,
        "stata_artifact": stata_artifact,
        "spss_artifact": spss_artifact,
        "internet_reference_summary": internet_summary,
        "stata_evidence": stata_evidence,
        "spss_evidence": spss_evidence,
        "persona_votes": votes,
        "vote_counts": counts,
    }
    write_json(MACHINE_OUTPUT_JSON, payload)

    report_name = f"CROSS_PACKAGE_MULTIPERSONA_REVIEW_{datetime.now().date().isoformat()}.md"
    report_path = DOCS_DIR / report_name
    report_text = render_markdown_report(
        statuses,
        r_run,
        r_summary,
        sim_summary,
        strict_summary,
        stata_artifact,
        spss_artifact,
        internet_summary,
        stata_evidence,
        spss_evidence,
        votes,
        counts,
    )
    report_path.write_text(report_text, encoding="utf-8")

    print(f"Wrote machine output: {MACHINE_OUTPUT_JSON}")
    print(f"Wrote report: {report_path}")
    print(f"Votes -> YES={counts['YES']} CONDITIONAL={counts['CONDITIONAL']} NO={counts['NO']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
