"""Parser limits of fragility/index.html (LIM-P33 L01).

Requirements:
- A label is everything after the fourth count, so a label containing a comma ("Trial, A",
  quoted or not) is kept whole, and a further field is shown as part of the label rather than
  silently dropped. Before the fix `2,10,3,10,"Trial, A"` was labelled `"Trial`.
- Counts must be exactly representable integers and the summed N must stay exact; such a
  line is reported (skipped, as every malformed line is) instead of being rounded.
  9007199254740993 used to be read as 9007199254740992, which can even hide events > total.
The existing skip-and-report policy for malformed lines is unchanged (P33 parser probes).
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(not NODE, reason="needs node")

PARSER = r"""
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(process.argv[1], 'fragility/index.html'), 'utf8');
const src = /function parse\(text\) \{[\s\S]*?\r?\n    \}\r?\n/.exec(html)[0];
const ctx = {}; vm.createContext(ctx); vm.runInContext(src, ctx);
const texts = JSON.parse(fs.readFileSync(0, 'utf8'));
console.log(JSON.stringify(texts.map(t => ctx.parse(t))));
"""


def run(texts):
    out = subprocess.run([NODE, "-e", PARSER, str(ROOT)], input=json.dumps(texts), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def test_label_with_comma_is_kept_whole():
    r = run(['2,10,3,10,"Trial, A"\n5, 90, 14, 95, Trial B, 2019',
             "8\t100\t18\t100\tTab trial"])
    assert r[0]["labels"] == ["Trial, A", "Trial B, 2019"]
    assert r[0]["errs"] == []
    assert r[1]["labels"] == ["Tab trial"]


def test_valid_layouts_unchanged():
    r = run(["# c\n8, 100, 18, 100, Study A\n\n5, 90, 14, 95"])
    assert r[0]["studies"] == [{"e1": 8, "n1": 100, "e0": 18, "n0": 100}, {"e1": 5, "n1": 90, "e0": 14, "n0": 95}]
    assert r[0]["labels"] == ["Study A", "Study 2"] and r[0]["errs"] == []
