#!/usr/bin/env python3
"""Run every per-app pytest folder, one folder per pytest process.

Why one process per folder: many apps ship test files with the same basename
(tests/test_smoke.py, tests/test_structure.py, ...) and several carry their own
pytest.ini / basetemp, so a single `pytest a/tests b/tests ...` invocation cannot
collect them together. Before this script none of these folders ran in any CI
workflow, so a regression in them stayed green.

Discovery is automatic: any directory named `tests` that directly contains a
`test_*.py` file is a folder to run, so a new app's tests are picked up without
editing a workflow. Folders/files that cannot run on a plain ubuntu runner (need
R, a browser driver, WebR downloads, network, or are long) are listed in SKIP
with the reason; skipping is explicit and printed, never silent.

Exit status: 0 only if every selected folder exited 0. A folder that times out,
collects nothing (pytest rc 5) or fails makes the whole run fail.

Usage: python .github/scripts/run_pytest_folders.py [--list] [--timeout SECONDS]
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Directories never searched for test folders.
PRUNE = {".git", "node_modules", "archive", "__pycache__", ".pytest_cache", "vendor", "fixtures"}

# Folders handled elsewhere (they have their own CI job, or are not per-app suites).
HANDLED_ELSEWHERE = {
    "tests": "repo-root suite; run by the root-tests step of this workflow",
    "screen/tests": "screen-workflow.yml",
}

# Folders, files ("a/tests/test_x.py") or single tests ("a/tests/test_x.py::test_y")
# NOT run here, with the reason. Paths are repo-relative, POSIX separators.
SKIP: dict[str, str] = {
    # Real browser / driver needed.
    "rob/tests/test_playwright.py": "needs Playwright-for-Python + Chromium (self-skips without it)",
    "webr-validator/tests/test_refused_input_handoff.py": "drives real system Chrome via playwright-core (self-skips without it)",
    "cumulative-subgroup/tests/test_p14.py": "launches Chromium via @playwright/test",
    "audit/tests/test_orchestrator_e2e.py": "runs the Playwright probe via npx (require_playwright fixture)",
    "audit/tests/test_probe_smoke.py": "runs the Playwright probe against a live page",
    "limit-ma/tests/test_page_regressions.py::test_log_controls_have_visible_description":
        "drives Chromium via the playwright npm package",
    "limit-ma/tests/test_page_regressions.py::test_effective_plot_ranges_in_chrome":
        "drives Chromium via the playwright npm package",
    "limit-ma/tests/test_page_regressions.py::test_extreme_finite_plot_bounds_in_chrome":
        "drives Chromium via the playwright npm package",
}

# Files / tests that ALREADY FAIL on main (ad58c9d7, 2026-11-12). Listed so the rest
# of their folder runs; delete the entry when the test is repaired (an entry whose
# file or test no longer exists makes this script fail, so the list cannot rot).
PREEXISTING_FAILURES: dict[str, str] = {
    **{f"gosh/tests/{f}": "page calls window.alm.urlState.isSuspended() (since 75375a19); the "
       "node harness's urlState stub lacks it -> TypeError"
       for f in ("test_against_metafor.py", "test_page_regressions.py",
                 "test_numeric_lifecycle.py", "test_numeric_matrix.py")},
    "dta-sroc/tests/test_dta_sroc.py::test_moses_regression_present":
        "greps dta-sroc/index.html for 'function regressDS', which is no longer there",
    "dta-sroc/tests/test_dta_sroc.py::test_spearman_threshold_check":
        "greps dta-sroc/index.html for 'function spearman', which is no longer there",
    "dta-sroc/tests/test_dta_sroc.py::test_continuity_correction_conditional":
        "greps dta-sroc/index.html for 'zero ? 0.5 : 0', which is no longer there",
    "effect-size-converter/tests/test_export.py::test_tooltips_module_is_referenced":
        "no data-gloss= attribute left in effect-size-converter/index.html (removed in bdf777fb)",
}


def discover() -> list[Path]:
    found = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = sorted(d for d in dirnames if d not in PRUNE and not d.startswith("."))
        p = Path(dirpath)
        if p.name != "tests":
            continue
        if any(f.startswith("test_") and f.endswith(".py") for f in filenames):
            found.append(p)
    return sorted(found)


def rel(p: Path) -> str:
    return p.relative_to(ROOT).as_posix()


def main() -> int:
    # Child output can hold any character; never let printing it crash the runner.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true", help="print the plan and exit")
    ap.add_argument("--timeout", type=int, default=600, help="per-folder timeout in seconds")
    args = ap.parse_args()

    excluded = {**SKIP, **{k: "PRE-EXISTING FAILURE: " + v for k, v in PREEXISTING_FAILURES.items()}}
    plan = []
    for folder in discover():
        r = rel(folder)
        if r in HANDLED_ELSEWHERE:
            print(f"ELSEWHERE {r}: {HANDLED_ELSEWHERE[r]}")
            continue
        if r in excluded:
            print(f"SKIP      {r}: {excluded[r]}")
            continue
        mine = {k: v for k, v in excluded.items() if k.split("::")[0].rsplit("/", 1)[0] == r}
        ignores = [k for k in mine if "::" not in k]
        deselects = [k for k in mine if "::" in k]
        for k in ignores + deselects:
            print(f"SKIP      {k}: {mine[k]}")
        if len(ignores) == len(list(folder.glob("test_*.py"))):
            continue
        plan.append((r, ignores, deselects))

    stale = [k for k in excluded
             if not (ROOT / k.split("::")[0]).exists()
             or ("::" in k and f"def {k.split('::')[1]}(" not in (ROOT / k.split("::")[0]).read_text(encoding="utf-8"))]
    if stale:
        print(f"ERROR: SKIP entries that no longer exist (remove them): {stale}")
        return 1

    print(f"\n{len(plan)} folders to run")
    if args.list:
        for r, ign, des in plan:
            print(f"  {r}" + (f"  (ignoring {len(ign)})" if ign else "") + (f"  (deselecting {len(des)})" if des else ""))
        return 0

    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    failures = []
    t_all = time.time()
    for r, ignores, deselects in plan:
        cmd = [sys.executable, "-m", "pytest", r, "-q", "-p", "no:cacheprovider"]
        for i in ignores:
            cmd += ["--ignore", i]
        if deselects:
            # -k, not --deselect: node ids are relative to whichever rootdir pytest picks,
            # and several apps carry their own pytest.ini, so a repo-relative id silently
            # fails to match. The module name is part of each test's keywords.
            cmd += ["-k", " and ".join(
                f"not ({Path(d.split('::')[0]).stem} and {d.split('::')[1]})" for d in deselects)]
        t0 = time.time()
        # Tests import sibling helpers (e.g. hub/shared/tests/_r_parity.py); the root
        # pytest.ini's --import-mode=importlib does not put the folder on sys.path.
        fenv = dict(env, PYTHONPATH=os.pathsep.join(filter(None, [str(ROOT / r), env.get("PYTHONPATH")])))
        try:
            proc = subprocess.run(cmd, cwd=ROOT, env=fenv, capture_output=True, text=True,
                                  encoding="utf-8", errors="replace", timeout=args.timeout)
            rc, out = proc.returncode, proc.stdout + proc.stderr
        except subprocess.TimeoutExpired as e:
            rc, out = "TIMEOUT", (e.stdout or "") if isinstance(e.stdout, str) else ""
        dt = time.time() - t0
        last = next((l for l in reversed(out.strip().splitlines()) if l.strip()), "") if out else ""
        status = "PASS" if rc == 0 else "FAIL"
        print(f"{status} rc={rc} {dt:6.1f}s {r} :: {last}", flush=True)
        if rc != 0:
            failures.append(r)
            print("----- output -----")
            print(out[-6000:])
            print("------------------", flush=True)

    print(f"\n{len(plan) - len(failures)}/{len(plan)} folders passed in {time.time() - t_all:.0f}s")
    if failures:
        print("FAILED folders:\n  " + "\n  ".join(failures))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
