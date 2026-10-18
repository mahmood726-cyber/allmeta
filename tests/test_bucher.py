"""Bucher: independent Decimal arithmetic, signed pinned R parity and refusals.

All inputs are synthetic software fixtures, not clinical evidence.
"""
import json
import shutil
import subprocess
from decimal import Decimal, localcontext
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

def js(expression):
    result = subprocess.run(
        [NODE, "-e", "const B=require('./bucher/contrast-engine.js');"
         + "console.log(JSON.stringify(" + expression + "));"],
        cwd=ROOT, capture_output=True, text=True, timeout=20, check=True)
    return json.loads(result.stdout)

def pairs(te=0.2, se=0.1):
    return [dict(study="s1", treat1="A", treat2="C", TE=te, seTE=se),
            dict(study="s2", treat1="B", treat2="C", TE=-0.1, seTE=.2)]

def test_signed_r_and_independent_decimal():
    oracle = json.loads((ROOT / "bucher/tests/fixtures/bucher-reference.json").read_text())
    for c in oracle["cases"]:
        fit = js(f"B.compute({json.dumps(c['rows'])},{json.dumps(c['options'])})")
        for field in ("mu", "se"):
            assert fit["indirect"][field] == pytest.approx(c["expected"][field], abs=1e-10)
        with localcontext() as ctx:
            ctx.prec = 50
            estimates = []
            variances = []
            for target in ("A", "B"):
                T, C = c["options"][target], c["options"]["C"]
                rows = [r for r in c["rows"] if {r["treat1"], r["treat2"]} == {T, C}]
                weights = [1 / Decimal(str(r["seTE"]))**2 for r in rows]
                effects = [Decimal(str(r["TE"])) * (1 if r["treat1"] == T else -1) for r in rows]
                estimates.append(sum(w*y for w,y in zip(weights,effects))/sum(weights))
                variances.append(1/sum(weights))
            assert fit["indirect"]["mu"] == pytest.approx(float(estimates[0]-estimates[1]), abs=1e-12)
            assert fit["indirect"]["se"] == pytest.approx(float(sum(variances).sqrt()), abs=1e-12)

@pytest.mark.parametrize("value", [None, "", " ", "1e", "2junk", "0x10", True, [], {}])
def test_malformed_effect_rejected(value):
    expr = f"(()=>{{try{{B.compute({json.dumps(pairs(value))},{{A:'A',B:'B',C:'C'}});return false}}catch(e){{return true}}}})()"
    assert js(expr)

@pytest.mark.parametrize("value", [0, -1, 1e-200, 1e200])
def test_unrepresentable_variance_rejected(value):
    assert js(f"(()=>{{try{{B.compute({json.dumps(pairs(se=value))},{{A:'A',B:'B',C:'C'}});return false}}catch(e){{return true}}}})()")

@pytest.mark.parametrize("suffix", [",extra", ',"unfinished', '"junk', ',"extra"'])
def test_csv_never_silently_truncates_or_repairs(suffix):
    csv = "treat1,treat2,TE,seTE\nA,C,.2,.1\nB,C,-.1,.2" + suffix
    assert js(f"B.parseCSV({json.dumps(csv)})")["warnings"]

def test_csv_quoted_labels_and_newlines():
    csv = 'study,treat1,treat2,TE,seTE\r\ns1,"Drug, A","Control\nlabel",.2,.1\r\ns2,B,"Control\nlabel",-.1,.2\r\n'
    parsed = js(f"B.parseCSV({json.dumps(csv)})")
    assert parsed["warnings"] == []
    assert parsed["rows"][0]["treat1"] == "Drug, A"
    assert parsed["rows"][1]["treat2"] == "Control\nlabel"

def test_direction_and_direct_exclusion():
    rows = pairs() + [dict(study="excluded",treat1="A",treat2="B",TE=999,seTE=.001)]
    ab = js(f"B.compute({json.dumps(rows)},{{A:'A',B:'B',C:'C'}})")
    ba = js(f"B.compute({json.dumps(rows[::-1])},{{A:'B',B:'A',C:'C'}})")
    assert ab["indirect"]["mu"] == pytest.approx(.3)
    assert ba["indirect"]["mu"] == pytest.approx(-.3)
    assert ab["excludedDirectAB"] == 1
    assert ab["indirect"]["se"] == ba["indirect"]["se"]
