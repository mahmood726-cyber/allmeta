"""HTA Base Case R check (HTA/src/utils/rCheck.js) must run in fresh R and agree with the page.

Requirement (user path): the downloadable / WebR script is generated from the page's CURRENT model
and last base-case run, re-runs the Markov cohort in base R, compares every displayed Base Case
number and the plotted trace, and ends with an honest "MATCH n/n" -- "MISMATCH" when the page is wrong.
The page's own Markov engine produces the page values here, and the displayed texts are built the
way src/ui/app.js displayResults() builds them. (Lives here because HTA/conftest.py ignores test_*.py.)
"""
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
HTA = ROOT / "HTA"
NODE = shutil.which("node")
RSCRIPT = os.environ.get("RSCRIPT", "C:/Program Files/R/R-4.6.0/bin/Rscript.exe")
pytestmark = [
    pytest.mark.skipif(NODE is None, reason="node not installed"),
    pytest.mark.skipif(not Path(RSCRIPT).exists(), reason="Rscript not installed"),
]

GEN = r"""
const path = require('path'), fs = require('fs'), H = process.cwd();
const { MarkovEngine } = require(path.join(H, 'src/engine/markov.js'));
const C = require(path.join(H, 'src/utils/rCheck.js'));
const arg = JSON.parse(process.argv[1]);
let project;
if (arg.demo) {
  const src = fs.readFileSync(path.join(H, 'src/ui/app.js'), 'utf8').split('\r').join('');
  project = eval('(' + src.match(/createDemoProject\(\) \{\s*return (\{[\s\S]*?\n        \});\n    \}/)[1] + ')');
} else project = arg.project;
const e = new MarkovEngine({ logger: { warn() {}, log() {}, error() {} } });
const results = e.runAllStrategies(project);
let intId = null, compId = null;
for (const [id, s] of Object.entries(project.strategies)) { if (s.is_comparator) compId = id; else if (!intId) intId = id; }
const ir = results.strategies[intId], cr = results.strategies[compId], c0 = results.incremental.comparisons[0];
const disp = { costsInt: `£${Math.round(ir.total_costs || 0).toLocaleString()}`, costsComp: `£${Math.round(cr.total_costs || 0).toLocaleString()}`,
  qalysInt: (ir.total_qalys || 0).toFixed(3), qalysComp: (cr.total_qalys || 0).toFixed(3),
  icer: typeof c0.icer === 'number' ? `£${Math.round(c0.icer).toLocaleString()}` : (c0.dominance || c0.icer) };
if (arg.tamper) eval(arg.tamper);
process.stdout.write(C.buildScript(project, results, disp, { settings: e.getSettings(project), tolerance: e.options.tolerance }));
"""


def _script(arg):
    p = subprocess.run([NODE, "-e", GEN, json.dumps(arg)], capture_output=True, text=True, encoding="utf-8",
                       timeout=60, cwd=str(HTA))
    assert p.returncode == 0, p.stderr
    return p.stdout


def _run_r(script, tmp_path):
    f = tmp_path / "check.R"
    f.write_text(script, encoding="utf-8")
    env = dict(os.environ, R_ENVIRON_USER="C:/Users/mahmo/wt/empty.Renviron")
    p = subprocess.run([RSCRIPT, "--vanilla", str(f)], capture_output=True, text=True, encoding="utf-8",
                       timeout=180, env=env)
    assert p.returncode == 0, p.stdout + p.stderr
    return p.stdout


USER = json.loads((HTA / "tests" / "fixtures" / "r_check_user_model.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("arg", [{"demo": True}, {"project": USER}], ids=["demo", "user-model"])
def test_script_matches_page_in_fresh_r(arg, tmp_path):
    out = _run_r(_script(arg), tmp_path)
    m = re.fullmatch(r"MATCH (\d+)/(\d+)", out.strip().splitlines()[-1])
    assert m and m.group(1) == m.group(2) and int(m.group(2)) >= 14, out


def test_demo_numbers_are_the_displayed_ones(tmp_path):
    out = _run_r(_script({"demo": True}), tmp_path)
    for shown in ("£55,413", "£39,547", "6.316", "5.208", "£14,321"):
        assert shown in out, out


def test_script_carries_current_model_after_user_change():
    user = json.loads(json.dumps(USER))
    user["parameters"]["rr"]["value"] = 0.4321
    s = _script({"project": user})
    # numbers are written with 17 significant digits (exact round trip)
    assert f'"rr" = list(kind = "num", value = {0.4321:.17g})' in s
    assert f"{0.509:.17g}" not in s


def test_wrong_page_value_is_reported_as_mismatch(tmp_path):
    tamper = "results.strategies.comb.total_costs *= 1 + 1e-8; results.strategies.mono.trace.states.B[5] += 1e-8;"
    out = _run_r(_script({"project": USER, "tamper": tamper}), tmp_path)
    assert out.strip().splitlines()[-1].startswith("MISMATCH"), out
    assert out.count("DIFF") == 2, out


def test_unsupported_models_are_refused_not_guessed():
    p = subprocess.run([NODE, "-e", "const C=require('./src/utils/rCheck.js');"
                        "try{C.buildScript({model:{type:'des'}},{},{},{});console.log('built')}catch(e){console.log('refused:'+e.message)}"],
                       capture_output=True, text=True, timeout=30, cwd=str(HTA))
    assert p.stdout.startswith("refused:") and "Markov cohort" in p.stdout, p.stdout
