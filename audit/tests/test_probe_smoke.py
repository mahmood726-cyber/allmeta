"""Smoke test: probe runs against a single fixture app and writes the expected JSONL line."""
import json
import os
import subprocess
import shutil
import sys
from pathlib import Path

FIXTURES = Path(__file__).parent / "fixtures"
AUDIT_DIR = Path(__file__).parent.parent

# On Windows, npx is a .cmd file and must be invoked via shell=True or with the
# full .cmd path; on POSIX shutil.which("npx") already returns the real binary.
_IS_WINDOWS = sys.platform == "win32"


def test_probe_runs_against_a_real_app_and_writes_jsonl(tmp_path):
    if shutil.which("npx") is None:
        import pytest
        pytest.skip("npx not available — Playwright probe smoke requires Node.js")
    apps_json = json.dumps([{"key": "forest-plot", "path": "./forest-plot/index.html"}])
    env = {**os.environ, "ALM_AUDIT_APPS_JSON": apps_json, "ALM_AUDIT_WORKERS": "1", "ALM_AUDIT_TIMEOUT_MS": "20000"}
    out_file = AUDIT_DIR / ".probe-output.jsonl"
    if out_file.exists():
        out_file.unlink()
    # shell=True required on Windows because npx resolves to npx.cmd which is a
    # batch file and cannot be exec'd directly without the shell.
    cmd = "npx playwright test probe.spec.mjs --reporter=line --workers=1"
    proc = subprocess.run(
        cmd,
        cwd=str(AUDIT_DIR),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
        timeout=120,
        shell=True,
    )
    assert out_file.exists(), f"Probe didn't write output. stdout={proc.stdout[-500:]} stderr={proc.stderr[-500:]}"
    lines = [ln for ln in out_file.read_text(encoding="utf-8").splitlines() if ln.strip()]
    assert len(lines) == 1, f"Expected 1 record, got {len(lines)}"
    rec = json.loads(lines[0])
    assert rec["key"] == "forest-plot"
    assert rec["load_ok"] is True
    assert rec["probe_crashed"] is False
    # Regression (two bugs fixed together):
    # 1. Selector: 'button:has-text(/regex/)' CANNOT appear in a CSS comma-list in
    #    Playwright ≥1.50 — the slash-regex form triggers a CSS parse error on the
    #    whole selector, causing mount_found=False for every app.  Fix: use MOUNT_CSS
    #    (plain CSS union) + locator.or(page.getByRole('button', {name:/regex/})).
    # 2. Timing: isVisible({timeout:…}) ignores the timeout in Playwright ≥1.50 and
    #    returns immediately; JS-rendered SVGs may not be in the DOM yet at networkidle.
    #    Fix: add 500 ms waitForTimeout settle + use waitFor({state:'visible', timeout:2000}).
    assert rec["mount_found"] is True, (
        "forest-plot mount not found — check probe.spec.mjs: must use MOUNT_CSS (no regex) "
        "+ locator.or(getByRole) and waitFor({state:'visible'}) with 500 ms settle."
    )


def test_probe_classifies_button_start_as_mount_present(tmp_path):
    """Regression for Cycle 3.3: focus-studio-style page (Start button +
    number inputs) should be mount_found=True after the widened selectors.

    Before the fix, apps with ONLY <button>Start</button> + <input type="number">
    (no svg/canvas/textarea/table) were false-negative classified as MISSING-MOUNT.
    The widened MOUNT_CSS adds input[type='number'] and the button-text regex adds
    'start', so both paths now detect this fixture.
    """
    import pytest

    if shutil.which("npx") is None:
        pytest.skip("npx not available — Playwright probe smoke requires Node.js")

    # Build a tiny fixture app in a subdir of tmp_path that mimics focus-studio:
    # a Start button + a numeric input, no svg/canvas/textarea/table.
    fixture_dir = tmp_path / "focus-fixture"
    fixture_dir.mkdir(parents=True)
    (fixture_dir / "index.html").write_text(
        "<!doctype html><html><body>"
        '<button id="toggle">Start</button>'
        '<input id="dur" type="number" min="1" max="120">'
        "</body></html>",
        encoding="utf-8",
    )

    # Playwright's webServer / baseURL is wired to the repo root (allmeta/).
    # We can't easily reconfigure it here, but the probe reads ALM_AUDIT_APPS_JSON
    # paths as relative to the repo root.  Copy the fixture into the audit dir's
    # parent (repo root) so the relative path resolves correctly, then clean up.
    repo_root = AUDIT_DIR.parent
    staging = repo_root / "_test_focus_fixture_cycle33"
    if staging.exists():
        shutil.rmtree(staging)
    shutil.copytree(fixture_dir, staging)

    try:
        apps_json = json.dumps(
            [{"key": "_test_focus_fixture", "path": "./_test_focus_fixture_cycle33/index.html"}]
        )
        env = {
            **os.environ,
            "ALM_AUDIT_APPS_JSON": apps_json,
            "ALM_AUDIT_WORKERS": "1",
            "ALM_AUDIT_TIMEOUT_MS": "20000",
        }
        out_file = AUDIT_DIR / ".probe-output.jsonl"
        if out_file.exists():
            out_file.unlink()

        cmd = "npx playwright test probe.spec.mjs --reporter=line --workers=1"
        proc = subprocess.run(
            cmd,
            cwd=str(AUDIT_DIR),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=env,
            timeout=120,
            shell=True,
        )
        assert out_file.exists(), (
            f"Probe didn't write output.\nstdout={proc.stdout[-500:]}\nstderr={proc.stderr[-500:]}"
        )
        lines = [ln for ln in out_file.read_text(encoding="utf-8").splitlines() if ln.strip()]
        assert len(lines) == 1, f"Expected 1 record, got {len(lines)}"
        rec = json.loads(lines[0])
        assert rec["key"] == "_test_focus_fixture"
        assert rec["load_ok"] is True, f"Fixture page failed to load: {rec}"
        assert rec["mount_found"] is True, (
            "Cycle 3.3 regression: focus-studio-style page (Start button + number input) "
            "was NOT detected as mount_found=True. Check that MOUNT_CSS includes "
            "input[type='number'] and the button-text regex includes 'start'."
        )
    finally:
        if staging.exists():
            shutil.rmtree(staging)
