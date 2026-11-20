"""The minified production build of nma-dose-response-app must be the current app.js
(lane nmabuild, 2026-11-12).

PR #538 routed app.js's REMLEstimator and SidikJonkmanEstimator to shared/ma-core.js and
added the ma-core <script> tag to index.html, but app.min.js (+ .map), index.prod.html and the
inlined nma-studio-standalone.html were not rebuilt: they still ran the old ML-score "REML"
(dat.bcg 0.223 vs metafor 0.313) and the old non-Sidik-Jonkman "SJ" (0.994 vs 0.346), and
index.prod.html did not load ../shared/upper-tail.js or ../shared/ma-core.js, which the
current app.js needs (AlmTail / AlmMaCore).

These tests pin:
  * index.prod.html loads upper-tail.js and ma-core.js before app.min.js;
  * app.min.js carries a build stamp naming the sha256 of the app.js it was built from, and
    that hash is the current app.js (so a future app.js edit without `npm run build` fails);
  * app.min.js, executed, returns the same REML / SJ estimates as app.js, bit for bit, and
    both equal metafor 5.2.1 at 1e-6 on dat.bcg and the other audit datasets;
  * nma-studio-standalone.html inlines the current upper-tail.js, ma-core.js and app.min.js.
"""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "nma-dose-response-app"
FIX = json.loads((ROOT / "tests" / "fixtures" / "tau2_audit_metafor521.json").read_text(encoding="utf-8"))
NODE = shutil.which("node")
TOL = 1e-6
SHARED = ("../shared/upper-tail.js", "../shared/ma-core.js")


def _app_js_sha256() -> str:
    # Hash the LF-normalised source so the stamp does not depend on core.autocrlf.
    return hashlib.sha256(APP.joinpath("app.js").read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def _script_srcs(html: str) -> list[str]:
    return re.findall(r'<script\b[^>]*\bsrc="([^"]+)"', html)


def test_prod_html_loads_shared_engines_before_app_min():
    srcs = _script_srcs(APP.joinpath("index.prod.html").read_text(encoding="utf-8"))
    assert "app.min.js" in srcs, srcs
    i = srcs.index("app.min.js")
    for dep in SHARED:
        assert dep in srcs[:i], f"index.prod.html must load {dep} before app.min.js; scripts: {srcs}"


def test_prod_html_does_not_load_unminified_app_js():
    srcs = _script_srcs(APP.joinpath("index.prod.html").read_text(encoding="utf-8"))
    assert "app.js" not in srcs, srcs


def test_app_min_build_stamp_matches_current_app_js():
    head = APP.joinpath("app.min.js").read_bytes()[:200].decode("utf-8", "replace")
    m = re.match(r"/\*! nma-dose-response-app build: app\.js sha256=([0-9a-f]{64}) \*/", head)
    assert m, f"app.min.js has no build stamp (rebuild with `npm run build`): {head[:80]!r}"
    assert m.group(1) == _app_js_sha256(), "app.min.js was built from a different app.js; run `npm run build`"


def test_source_map_matches_build():
    smap = json.loads(APP.joinpath("app.min.js.map").read_text(encoding="utf-8"))
    assert smap.get("file") == "app.min.js"
    assert APP.joinpath("app.min.js").read_text(encoding="utf-8").rstrip().endswith("//# sourceMappingURL=app.min.js.map")
    # Every identifier the map names must exist in the current app.js (a stale map names old ones).
    src = APP.joinpath("app.js").read_text(encoding="utf-8")
    missing = sorted(n for n in set(smap["names"]) if n not in src)
    assert not missing, f"{len(missing)} source-map names absent from app.js, e.g. {missing[:5]}"


@pytest.fixture(scope="module")
def runs():
    if NODE is None:
        pytest.skip("node not installed")
    res = subprocess.run([NODE, str(ROOT / "tests" / "fixtures" / "nma_dose_min_runner.cjs")],
                         capture_output=True, text=True, timeout=300, check=False, cwd=str(ROOT))
    assert res.returncode == 0, f"runner exited {res.returncode}\n{res.stderr[-2000:]}"
    return json.loads(res.stdout)


@pytest.mark.parametrize("est", ["reml", "sj"])
def test_app_min_estimates_identical_to_app_js(runs, est):
    assert set(runs["min"][est]) == set(FIX["data"])
    diff = {ds: (runs["app"][est][ds], runs["min"][est][ds]) for ds in FIX["data"]
            if runs["app"][est][ds] != runs["min"][est][ds]}
    assert not diff, f"app.min.js {est} differs from app.js: {json.dumps(diff)[:1500]}"


@pytest.mark.parametrize("build", ["app", "min"])
@pytest.mark.parametrize("est,method", [("reml", "REML"), ("sj", "SJ")])
def test_build_matches_metafor(runs, build, est, method):
    bad = []
    for ds, ref in FIX["ref"].items():
        got = runs[build][est][ds]
        tau2 = got.get("tau2") if isinstance(got, dict) else got
        r = ref[method]
        if not isinstance(tau2, (int, float)):
            ok = False
        elif r == 0:
            ok = abs(tau2) <= TOL * max(FIX["data"][ds]["vi"])
        else:
            ok = abs(tau2 - r) / abs(r) <= TOL
        if not ok:
            bad.append(f"{ds}: got {tau2!r}, metafor {r!r}")
    assert not bad, f"{build} {method} differs from metafor 5.2.1 at 1e-6:\n  " + "\n  ".join(bad)


def _norm(s: str) -> str:
    return s.replace("\r\n", "\n").strip()


def test_standalone_inlines_current_build_and_shared_engines():
    html = APP.joinpath("nma-studio-standalone.html").read_text(encoding="utf-8")
    blobs = [_norm(m.group(1)) for m in re.finditer(r"<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>", html)]
    order = []
    for rel in SHARED + ("app.min.js",):
        want = _norm((APP / rel).read_text(encoding="utf-8"))
        assert want in blobs, f"nma-studio-standalone.html does not inline the current {rel}"
        order.append(blobs.index(want))
    assert order == sorted(order), "standalone must inline upper-tail.js, ma-core.js, then app.min.js"
    assert "app.min.js" not in _script_srcs(html) and "app.js" not in _script_srcs(html)


# ---------------------------------------------------------------------------------------------
# Lane nmaexp2 (2026-11-14): the checks above compare the build STAMP and the inlined SCRIPTS, so
# an index.html edit (a new button, a changed label, a feature-search entry) that was committed
# without `npm run build` left index.prod.html and nma-studio-standalone.html serving the old page
# while every test above stayed green. The check below re-runs build.js on a copy of the committed
# sources and requires the four generated files to come out identical to the committed ones
# (line endings normalised CRLF -> LF, as build.js itself does, so core.autocrlf cannot matter).
GENERATED = ("app.min.js", "app.min.js.map", "index.prod.html", "nma-studio-standalone.html")
BUILD_INPUTS = ("app.js", "index.html", "build.js", "package.json")


def _lf(b: bytes) -> bytes:
    return b.replace(b"\r\n", b"\n")


def _rebuild(tmp: Path, edit_index=None) -> dict[str, bytes]:
    """Run build.js on a copy of the sources in tmp/app (tmp/shared beside it) and return the
    generated files. tmp must sit inside APP so that `import 'terser'` resolves to APP/node_modules."""
    (tmp / "app").mkdir()
    (tmp / "shared").mkdir()
    for f in BUILD_INPUTS:
        shutil.copyfile(APP / f, tmp / "app" / f)
    for rel in SHARED:
        shutil.copyfile(APP / rel, tmp / "app" / rel)
    if edit_index is not None:
        p = tmp / "app" / "index.html"
        p.write_bytes(edit_index(p.read_bytes()))
    res = subprocess.run([NODE, "build.js"], capture_output=True, text=True, timeout=300, check=False,
                         cwd=str(tmp / "app"))
    assert res.returncode == 0, f"build.js exited {res.returncode}\n{res.stdout[-1000:]}\n{res.stderr[-2000:]}"
    return {f: _lf((tmp / "app" / f).read_bytes()) for f in GENERATED}


def _stale(built: dict[str, bytes]) -> list[str]:
    return [f for f in GENERATED if built[f] != _lf(APP.joinpath(f).read_bytes())]


@pytest.fixture()
def build_tmp():
    if NODE is None:
        pytest.skip("node not installed")
    if not (APP / "node_modules" / "terser").is_dir():
        pytest.skip("terser not installed: run `npm ci` in nma-dose-response-app (this check did NOT run)")
    import tempfile
    with tempfile.TemporaryDirectory(prefix=".rebuild-check-", dir=str(APP)) as d:
        yield Path(d)


def test_committed_build_outputs_equal_a_fresh_build(build_tmp):
    stale = _stale(_rebuild(build_tmp))
    assert not stale, (f"{stale} differ from what build.js produces from the committed app.js / index.html; "
                       "run `npm run build` in nma-dose-response-app and commit the result")


def test_rebuild_check_detects_a_stale_index_html_edit(build_tmp):
    # Plant the defect: an index.html edit the committed index.prod.html / standalone do not carry.
    planted = _rebuild(build_tmp, lambda b: b.replace(b"</body>", b"<!-- planted stale edit --></body>", 1))
    stale = _stale(planted)
    assert "index.prod.html" in stale and "nma-studio-standalone.html" in stale, stale
