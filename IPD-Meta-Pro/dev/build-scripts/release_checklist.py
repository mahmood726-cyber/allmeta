#!/usr/bin/env python3
"""Release checklist runner for IPD Meta-Analysis Pro."""

from __future__ import annotations

import argparse
from datetime import datetime
import json
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Callable


if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


MOJIBAKE_PATTERN = re.compile(r"(â€™|â€œ|â€\x9d|â€“|â€”|Ã.|Â.|ðŸ|IÂ²|Ï„Â²|Ï|ÃŽÂ)")


class CheckSummary:
    def __init__(self) -> None:
        self.passed: list[str] = []
        self.failed: list[str] = []

    def ok(self, name: str) -> None:
        print(f"[PASS] {name}")
        self.passed.append(name)

    def fail(self, name: str) -> None:
        print(f"[FAIL] {name}")
        self.failed.append(name)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run release checks for IPD Meta-Analysis Pro.")
    parser.add_argument(
        "--skip-selenium",
        action="store_true",
        help="Skip selenium_test.py for a quick local pass.",
    )
    parser.add_argument(
        "--freeze",
        action="store_true",
        help="Run in release-freeze mode (full gate, bug-fix-only workflow).",
    )
    parser.add_argument(
        "--with-r-parity",
        action="store_true",
        help="Also run the IPD parity gate vs R benchmarks (requires R + Selenium environment).",
    )
    parser.add_argument(
        "--parity-python",
        default=None,
        help="Python executable used by IPD parity benchmark scripts.",
    )
    parser.add_argument(
        "--rscript",
        default=None,
        help="Optional path to Rscript.exe for IPD parity benchmark scripts.",
    )
    parser.add_argument(
        "--with-frontier-gap",
        action="store_true",
        help="When running --with-r-parity, also include Loop-3/4/6 frontier gap benchmark checks.",
    )
    parser.add_argument(
        "--with-loop7",
        action="store_true",
        help="When running --with-r-parity, also include Loop-7 simulation and replication gates.",
    )
    return parser.parse_args()


def _read_json(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("artifact root must be a JSON object")
    return data


def _artifact_is_fresh(path: Path, started_at: float) -> bool:
    try:
        if path.stat().st_mtime >= started_at - 0.5:
            return True
    except OSError:
        return False

    if path.suffix.lower() != ".json":
        return False

    try:
        artifact = _read_json(path)
    except Exception:
        return False

    for key in ("timestamp", "generated_at"):
        raw_value = artifact.get(key)
        if not isinstance(raw_value, str) or not raw_value.strip():
            continue
        try:
            artifact_time = datetime.fromisoformat(raw_value.replace("Z", "+00:00")).timestamp()
        except ValueError:
            continue
        if artifact_time >= started_at - 0.5:
            return True

    return False


def _validate_core_artifact(artifact: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if artifact.get("status") != "PASS":
        errors.append(f"status={artifact.get('status')!r}")

    summary = artifact.get("summary")
    if not isinstance(summary, dict):
        return errors + ["missing summary object"]

    total = summary.get("total")
    failed = summary.get("failed")
    if not isinstance(total, int) or total < 10:
        errors.append(f"unexpected summary.total={total!r}")
    if failed != 0:
        errors.append(f"summary.failed={failed!r}")

    tests = artifact.get("tests")
    if not isinstance(tests, list) or not tests:
        errors.append("missing tests array")
        return errors

    test_names = {test.get("name") for test in tests if isinstance(test, dict)}
    for required in (
        "Stats.mean returns arithmetic mean",
        "SurvivalAnalysis.kaplanMeier avoids null CI/SE when the final risk set is exhausted",
        "SurvivalAnalysis.logRankTest returns a neutral result when variance is zero",
        "ipdResolveBinaryArmMapping accepts string 1/0 treatment labels",
        "ipdResolveBinaryArmMapping rejects ambiguous arm coding",
        "PRISMA-IPD flow summary is dataset-derived and deterministic",
        "PRISMAIPDGenerator avoids Math.random placeholders",
        "runGOSHPlot uses deterministic subset sampling",
        "MetaAnalysis.randomEffectsREML SE matches benchmark tolerance",
        "MetaAnalysis.predictionInterval is wider than CI",
    ):
        if required not in test_names:
            errors.append(f"missing core assertion: {required}")
    return errors


def _validate_browser_artifact(artifact: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if artifact.get("status") != "PASS":
        errors.append(f"status={artifact.get('status')!r}")

    passed = artifact.get("passed")
    total = artifact.get("total")
    if not isinstance(total, int) or total < 40:
        errors.append(f"unexpected total={total!r}")
    if passed != total:
        errors.append(f"passed/total mismatch: {passed!r}/{total!r}")
    if artifact.get("failed_tests"):
        errors.append("artifact recorded failing browser tests")
    if artifact.get("browser_console_errors"):
        errors.append("artifact recorded browser console errors")
    summary_text = artifact.get("summary_text")
    if not isinstance(summary_text, str) or "ALL PASS" not in summary_text:
        errors.append("summary_text missing ALL PASS")
    return errors


def _validate_smoke_artifact(artifact: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if artifact.get("status") != "PASS":
        errors.append(f"status={artifact.get('status')!r}")
    failed = artifact.get("failed")
    if failed:
        errors.append(f"artifact recorded failures: {failed!r}")

    passed = artifact.get("passed")
    if not isinstance(passed, list):
        return errors + ["missing passed array"]

    required_markers = (
        "Smoke flow produced pooled analysis output",
        "Smoke flow captured CSV export download",
    )
    for marker in required_markers:
        if not any(isinstance(item, str) and marker in item for item in passed):
            errors.append(f"missing smoke marker: {marker}")
    return errors


def _make_parity_artifact_validator(
    expect_frontier_gap: bool,
    expect_loop7: bool,
) -> Callable[[dict[str, Any]], list[str]]:
    def _validate_parity_artifact(artifact: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        if not artifact.get("generated_at"):
            errors.append("missing generated_at")

        gate = artifact.get("gate")
        if not isinstance(gate, dict):
            return errors + ["missing gate object"]

        if not gate.get("pass"):
            errors.append(f"gate.pass={gate.get('pass')!r}")
        if bool(gate.get("with_frontier_gap")) != expect_frontier_gap:
            errors.append(
                "gate.with_frontier_gap mismatch: "
                f"expected {expect_frontier_gap}, got {gate.get('with_frontier_gap')!r}"
            )
        if bool(gate.get("with_loop7")) != expect_loop7:
            errors.append(
                "gate.with_loop7 mismatch: "
                f"expected {expect_loop7}, got {gate.get('with_loop7')!r}"
            )
        return errors

    return _validate_parity_artifact


def run_command(
    name: str,
    cmd: list[str],
    cwd: Path,
    summary: CheckSummary,
    *,
    artifact_path: Path | None = None,
    artifact_validator: Callable[[dict[str, Any]], list[str]] | None = None,
) -> None:
    print("\n" + "-" * 70)
    print(f"Running: {name}")
    print(f"Command: {' '.join(cmd)}")
    print("-" * 70)

    start = time.time()
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except FileNotFoundError as e:
        print(f"[ERROR] Command not found: {e}")
        summary.fail(f"{name} (command missing)")
        return
    except Exception as e:
        print(f"[ERROR] Command execution failure: {e}")
        summary.fail(f"{name} (runner error)")
        return

    elapsed = time.time() - start

    if proc.stdout.strip():
        print(proc.stdout.rstrip())
    if proc.stderr.strip():
        print(proc.stderr.rstrip())

    label = f"{name} ({elapsed:.1f}s)"
    if proc.returncode == 0:
        if artifact_path is not None:
            if artifact_validator is None:
                print(f"[FAIL] No validator configured for artifact: {artifact_path}")
                summary.fail(label)
                return
            if not artifact_path.exists():
                print(f"[FAIL] Expected artifact not found: {artifact_path}")
                summary.fail(label)
                return
            if not _artifact_is_fresh(artifact_path, start):
                print(f"[FAIL] Artifact was not refreshed by this command: {artifact_path}")
                summary.fail(label)
                return
            try:
                artifact = _read_json(artifact_path)
            except Exception as e:
                print(f"[FAIL] Could not read artifact JSON {artifact_path}: {e}")
                summary.fail(label)
                return
            artifact_errors = artifact_validator(artifact)
            if artifact_errors:
                print(f"[FAIL] Artifact contract failed for {artifact_path}:")
                for item in artifact_errors:
                    print(f"  - {item}")
                summary.fail(label)
                return
            print(f"[OK] Artifact contract validated: {artifact_path}")
        summary.ok(label)
    else:
        summary.fail(label)


def run_mojibake_scan(paths: list[Path], summary: CheckSummary) -> None:
    print("\n" + "-" * 70)
    print("Running: Mojibake/Encoding Scan")
    print("-" * 70)

    findings: list[str] = []
    for path in paths:
        text = path.read_text(encoding="utf-8")
        match = MOJIBAKE_PATTERN.search(text)
        if match:
            findings.append(f"{path}: found '{match.group(0)}'")

    if findings:
        for item in findings:
            print(item)
        summary.fail("Mojibake/Encoding Scan")
    else:
        print("No mojibake markers found in scanned files.")
        summary.ok("Mojibake/Encoding Scan")


def run_browser_process_cleanup() -> None:
    """Best-effort cleanup for stale webdriver processes before browser checks."""
    if sys.platform == "win32":
        commands = [
            ["taskkill", "/F", "/T", "/IM", "msedgedriver.exe"],
            ["taskkill", "/F", "/T", "/IM", "chromedriver.exe"],
        ]
    else:
        commands = [
            ["pkill", "-f", "msedgedriver|chromedriver"],
        ]

    for cmd in commands:
        try:
            subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            )
        except FileNotFoundError:
            print("[WARN] Browser cleanup command not found; continuing.")
            return
        except Exception as e:
            print(f"[WARN] Browser cleanup failed: {e}")
            return


def main() -> int:
    args = parse_args()

    print("=" * 70)
    print("IPD Meta-Analysis Pro - Release Checklist")
    print("=" * 70)

    if args.freeze:
        print("Mode: RELEASE FREEZE (bug-fix only)")

    if args.freeze and args.skip_selenium:
        print("[FAIL] --freeze cannot be combined with --skip-selenium")
        return 1

    script_path = Path(__file__).resolve()
    repo_root = script_path.parents[2]
    build_scripts = repo_root / "dev" / "build-scripts"
    benchmark_dir = repo_root / "dev" / "benchmarks"
    build_script = repo_root / "dev" / "build.py"
    python_exe = sys.executable
    manifest = json.loads((repo_root / "dev" / "modules" / "manifest.json").read_text(encoding="utf-8"))

    app_path = repo_root / "ipd-meta-pro.html"
    module_path = repo_root / "dev" / "modules" / "export_schema_module.js"
    core_test_script = repo_root / "dev" / "tests" / "core_stats_meta_test.js"
    browser_harness_script = build_scripts / "browser_test_runner.py"
    user_flow_smoke_script = build_scripts / "user_flow_smoke_test.py"
    core_artifact = benchmark_dir / "latest_core_stats_meta_test.json"
    browser_artifact = benchmark_dir / "latest_browser_test_runner.json"
    smoke_artifact = benchmark_dir / "latest_user_flow_smoke_test.json"
    parity_artifact = benchmark_dir / "latest_ipd_parity_gate.json"

    if (
        not app_path.exists()
        or not module_path.exists()
        or not build_script.exists()
        or not core_test_script.exists()
        or not browser_harness_script.exists()
        or not user_flow_smoke_script.exists()
    ):
        print("[FAIL] Required files not found:")
        print(f" - {app_path}")
        print(f" - {module_path}")
        print(f" - {build_script}")
        print(f" - {core_test_script}")
        print(f" - {browser_harness_script}")
        print(f" - {user_flow_smoke_script}")
        return 1

    summary = CheckSummary()

    mojibake_paths = [
        repo_root / "dev" / "modules" / name
        for name in manifest.get("order", [])
        if not name.startswith("02_00_vendor_")
    ]
    run_mojibake_scan(mojibake_paths, summary)

    run_command(
        "Build manifest verify",
        [python_exe, str(build_script), "verify"],
        repo_root,
        summary,
    )

    run_command(
        "Node syntax check (export module)",
        ["node", "--check", str(module_path)],
        repo_root,
        summary,
    )

    run_command(
        "Extract and JS syntax check",
        [python_exe, str(build_scripts / "extract_and_check_js.py")],
        repo_root,
        summary,
    )

    run_command(
        "Core stats/meta module test",
        ["node", str(core_test_script)],
        repo_root,
        summary,
        artifact_path=core_artifact,
        artifact_validator=_validate_core_artifact,
    )

    run_browser_process_cleanup()
    run_command(
        "Quick JS runtime check",
        [python_exe, str(build_scripts / "quick_js_test.py")],
        repo_root,
        summary,
    )

    run_browser_process_cleanup()
    run_command(
        "Browser test runner",
        [python_exe, str(browser_harness_script)],
        repo_root,
        summary,
        artifact_path=browser_artifact,
        artifact_validator=_validate_browser_artifact,
    )

    run_browser_process_cleanup()
    run_command(
        "User flow smoke test",
        [python_exe, str(user_flow_smoke_script)],
        repo_root,
        summary,
        artifact_path=smoke_artifact,
        artifact_validator=_validate_smoke_artifact,
    )

    run_browser_process_cleanup()
    run_command(
        "Regression fixed paths test",
        [python_exe, str(build_scripts / "regression_fixed_paths_test.py")],
        repo_root,
        summary,
    )

    if args.skip_selenium:
        print("\n[INFO] Skipping selenium_test.py (--skip-selenium)")
    else:
        selenium_cmd = [python_exe, str(build_scripts / "selenium_test.py")]
        if args.freeze:
            selenium_cmd.append("--fail-on-warnings")

        run_browser_process_cleanup()
        run_command(
            "Full Selenium suite",
            selenium_cmd,
            repo_root,
            summary,
        )

    if args.with_r_parity:
        parity_cmd = [python_exe, str(build_scripts / "ipd_parity_gate.py")]
        if args.parity_python:
            parity_cmd.extend(["--python-exe", args.parity_python])
        if args.rscript:
            parity_cmd.extend(["--rscript", args.rscript])
        if args.with_frontier_gap:
            parity_cmd.append("--with-frontier-gap")
        if args.with_loop7:
            parity_cmd.append("--with-loop7")
        run_command(
            "IPD parity gate vs R",
            parity_cmd,
            repo_root,
            summary,
            artifact_path=parity_artifact,
            artifact_validator=_make_parity_artifact_validator(
                expect_frontier_gap=args.with_frontier_gap,
                expect_loop7=args.with_loop7,
            ),
        )

    print("\n" + "=" * 70)
    print("RELEASE CHECKLIST SUMMARY")
    print("=" * 70)
    print(f"Passed: {len(summary.passed)}")
    print(f"Failed: {len(summary.failed)}")

    if summary.failed:
        print("\nFailed checks:")
        for item in summary.failed:
            print(f" - {item}")
        return 1

    if args.freeze:
        print("\nFreeze gate passed. Continue bug-fix-only until release.")
    else:
        print("\nAll release checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
