"""Tests for shared/evalue.js (E-value; VanderWeele & Ding 2017).

Locks the documented ratio-measure values AND the fix that SMD/d on the
difference scale accepts negative (protective) effects — previously the
positivity guard rejected them and returned NaN.
"""
import json
import math
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

PRELUDE = "const E = require('./shared/evalue.js');\n"


def _run(expr: str) -> dict:
    r = subprocess.run([NODE, "-e", PRELUDE + "console.log(JSON.stringify(" + expr + "));"],
                       capture_output=True, text=True, timeout=20, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(f"node exited {r.returncode}\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_ratio_measures_match_documented():
    rr = _run("E.eValues('RR',2.0,1.5,2.7)")
    assert math.isclose(rr["point"], 3.414213562, abs_tol=1e-6)
    assert math.isclose(rr["ci"], 2.366025404, abs_tol=1e-6)
    orr = _run("E.eValues('OR',2.0,null,null,{rare:false})")
    assert math.isclose(orr["point"], 2.179580, abs_tol=1e-5)


def test_smd_accepts_negative_protective_effect():
    """Regression: SMD/d is difference-scale — negatives are valid, not NaN."""
    o = _run("E.eValues('SMD',-0.3,-0.6,-0.1)")
    # exp(0.91 * -0.3) = 0.7611 -> E-value defined (uses 1/RR for RR<1).
    assert math.isclose(o["rr"]["point"], math.exp(0.91 * -0.3), rel_tol=1e-9)
    assert o["point"] is not None and o["point"] > 1, "E-value must be defined for a protective SMD"
    assert math.isfinite(o["point"])


def test_ratio_measure_still_rejects_nonpositive():
    o = _run("E.eValues('RR',-1.0,null,null)")
    assert o["point"] is None or (isinstance(o["point"], float) and math.isnan(o["point"])) or o["rr"]["point"] is None


@pytest.mark.parametrize("rr", [0.01, 0.2, 0.6, 0.999999, 1, 1.000001, 2, 100])
def test_independent_rr_bound_and_reciprocal_symmetry(rr):
    # Independently solve the equal-strength confounding bound x^2/(2*x-1)=RR.
    from decimal import Decimal, localcontext
    with localcontext() as ctx:
        ctx.prec = 50
        ratio = Decimal(str(rr))
        ratio = max(ratio, 1 / ratio)
        expected = ratio + (ratio * (ratio - 1)).sqrt()
        assert abs(expected**2 / (2*expected-1) - ratio) < Decimal('1e-40')
    actual = _run(f"[E.eValue({rr}), E.eValue(1/{rr})]")
    for value in actual:
        assert value == pytest.approx(float(expected), abs=1e-6, rel=0)


def test_fresh_pinned_evalue_source_reference():
    reference = json.loads((ROOT / 'tests/fixtures/evalue-input-oracle.json').read_text(encoding='utf-8'))
    for case in reference['cases']:
        args = ','.join(json.dumps(case[k]) for k in ('measure', 'point', 'lo', 'hi'))
        actual = _run(f"E.eValues({args}, {{rare: {json.dumps(case['rare'])}}})")
        assert actual['point'] == pytest.approx(case['expected']['point'], abs=1e-6, rel=0)
        # The UI overrides legacy engine CI=1 when both limits are absent.
        if case['lo'] is not None:
            assert actual['ci'] == pytest.approx(case['expected']['ci'], abs=1e-6, rel=0)
        for field in ('point', 'lo', 'hi'):
            expected = case['expected']['rr'][field]
            if expected is None:
                assert actual['rr'][field] is None
            else:
                assert actual['rr'][field] == pytest.approx(expected, abs=1e-6, rel=0)
