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
