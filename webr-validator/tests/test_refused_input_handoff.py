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
    # Codex review of fix509: parses, passes Egger/Begg/trim-and-fill, then the selection
    # model's REML refuses (SE 1e200) and so does the page.
    ("pubbias-tests", "#src", "0.1, 0.2\n0.3, 0.25\n0.5, 0.3\n0.2, 0.15\n0.4, 1e200\n"),
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


def _handoff(base, app, textarea, data, tmp_path, *extra):
    f = tmp_path / "data.txt"
    f.write_text(data, encoding="utf-8")
    env = dict(os.environ, PLAYWRIGHT_CORE=PW)
    out = subprocess.run(["node", str(TOOLS / "bus-handoff.cjs"), app, base, str(f), textarea] + list(extra),
                         capture_output=True, text=True, encoding="utf-8", timeout=600, env=env)
    last = out.stdout.strip().splitlines()[-1] if out.stdout.strip() else ""
    assert out.returncode == 0 and last.startswith("PASS:"), out.stdout + out.stderr


@pytest.mark.parametrize("app,textarea,data", CASES, ids=["%s-%d" % (c[0], i) for i, c in enumerate(CASES)])
def test_refused_input_opens_no_validator(base, app, textarea, data, tmp_path):
    _handoff(base, app, textarea, data, tmp_path, "0", "expect-refuse")


# The positive half (Codex review of fix509): a provider that always returned [] would pass
# every refusal case above. Valid input -- BCG, 13 trials, in each page's format -- must open
# the validator with exactly the page's 13 studies (no stale row), empty and stale bus.
BCG = [
    ('Aronson 1948', -0.8893113339, 0.5706003549), ('Ferguson & Simes 1949', -1.5853886572, 0.4411135017),
    ('Rosenthal et al 1960', -1.3480731483, 0.6444904696), ('Hart & Sutherland 1977', -1.4415511900, 0.1414568199),
    ('Frimodt-Moller et al 1973', -0.2175473222, 0.2262966464), ('Stein & Aronson 1953', -0.7861155858, 0.0831000509),
    ('Vandiviere et al 1973', -1.6208982236, 0.4722470197), ('TPT Madras 1980', 0.0119523335, 0.0629410780),
    ('Coetzee & Berjak 1968', -0.4694176487, 0.2375588568), ('Rosenthal et al 1961', -1.3713448035, 0.2702310005),
    ('Comstock et al 1974', -0.3393588283, 0.1114101161), ('Comstock & Webster 1969', 0.4459134006, 0.7297299810),
    ('Comstock et al 1976', -0.0173139482, 0.2672165034)]
ABLAT = [44, 55, 42, 52, 13, 44, 19, 13, 27, 42, 18, 33, 33]
VALID = [
    ("limit-ma", "#src", ["%r, %r, %s" % (y, s, l) for l, y, s in BCG], ["expect-method=DL", "expect-test=z"]),
    ("pubbias-tests", "#src", ["%r, %r" % (y, s) for l, y, s in BCG], []),
    ("meta-regression", "#f-data", ["%s, %r, %r, %d" % (l, y, s, a) for (l, y, s), a in zip(BCG, ABLAT)], []),
    ("bma-tau-priors", "#src", ["%s, %r, %r" % (l, y, s * s) for l, y, s in BCG], []),
    ("cross-design", "#src", ["%s, %r, %r, %s" % (l, y, s * s, "rct" if i % 2 == 0 else "obs") for i, (l, y, s) in enumerate(BCG)], []),
]


@pytest.mark.parametrize("app,textarea,lines,expect", VALID, ids=[v[0] for v in VALID])
def test_valid_input_opens_the_validator_with_the_page_studies(base, app, textarea, lines, expect, tmp_path):
    _handoff(base, app, textarea, "\n".join(lines) + "\n", tmp_path, str(len(lines)), *expect)
