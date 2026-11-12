"""Input a page REFUSES to analyse must not open the WebR validator (lane fix509, 2026-11-12).

Codex review of PR #509, reproduced in real Chrome on e404a247 (tools/userpath/bus-handoff.cjs
... expect-refuse): every validator control on these pages opened the validator on studies the
page itself refused -- limit-ma with three identical SEs ("requires variation in study SEs"),
pubbias-tests with 3 rows (k >= 5 required), meta-regression with one moderator value (singular
design, no fit), bma-tau-priors / cross-design with 1 study (Continue-with had no studies
provider, so it opened whatever an earlier session left on the bus).

Real system Chrome via playwright-core against a local serve.cjs of this checkout. Skipped only
when playwright-core or Chrome is not installed (the static guard test_user_path.py still runs).
"""
import os
import socket
import subprocess
import time
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
TOOLS = REPO / "tools" / "userpath"
PW = os.environ.get("PLAYWRIGHT_CORE", "F:/claude-temp/userpath/node_modules/playwright-core")
CHROME = os.environ.get("CHROME", "C:/Program Files/Google/Chrome/Application/chrome.exe")

# app, textarea, refused input (each is refused by the page's own run(); see the module docstring)
CASES = [
    ("limit-ma", "#src", "0.1, 0.2, A\n0.3, 0.2, B\n0.5, 0.2, C\n"),
    ("pubbias-tests", "#src", "0.1, 0.2\n0.3, 0.25\n0.5, 0.3\n"),
    ("meta-regression", "#f-data", "A, 0.1, 0.2, 5\nB, 0.3, 0.25, 5\nC, 0.5, 0.3, 5\nD, 0.2, 0.15, 5\n"),
    ("bma-tau-priors", "#src", "A, 0.1, 0.04\n"),
    ("cross-design", "#src", "RCT 1, -0.35, 0.020, rct\n"),
]


@pytest.fixture(scope="module")
def base():
    if not (Path(PW).exists() and Path(CHROME).exists() and (TOOLS / "bus-handoff.cjs").exists()):
        pytest.skip("playwright-core / Chrome / tools/userpath not available")
    missing = [a for a, _, _ in CASES if not (REPO / a / "index.html").is_file()]
    if missing:
        pytest.skip("apps not in this checkout: %s" % missing)
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    proc = subprocess.Popen(["node", str(TOOLS / "serve.cjs"), str(REPO), str(port)],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                socket.create_connection(("127.0.0.1", port), timeout=0.2).close()
                break
            except OSError:
                time.sleep(0.2)
        yield "http://127.0.0.1:%d/" % port
    finally:
        proc.kill()


@pytest.mark.parametrize("app,textarea,data", CASES, ids=[c[0] for c in CASES])
def test_refused_input_opens_no_validator(base, app, textarea, data, tmp_path):
    f = tmp_path / "data.txt"
    f.write_text(data, encoding="utf-8")
    env = dict(os.environ, PLAYWRIGHT_CORE=PW)
    out = subprocess.run(["node", str(TOOLS / "bus-handoff.cjs"), app, base, str(f), textarea, "0", "expect-refuse"],
                         capture_output=True, text=True, encoding="utf-8", timeout=600, env=env)
    last = out.stdout.strip().splitlines()[-1] if out.stdout.strip() else ""
    assert out.returncode == 0 and last.startswith("PASS:"), out.stdout + out.stderr
