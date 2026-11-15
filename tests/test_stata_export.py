r"""Stata .do export of Pairwise Pro / TruthCert (generateStataCode) must be valid `input` syntax.

Before lane aitems (2026-11-15) every copy joined the data rows with .join("\\n") inside a normal JS
string, i.e. a literal backslash-n, so ALL studies landed on ONE line of the `input ... end` block:
    "A" 0.1000 0.1000\n"B" -0.2000 0.2000\n"C" 0.3000 0.3000
Stata reads that as one observation with stray tokens and fails. Truthcert1/app.min.js also lost the
space between yi and sei ("0.10000.1000"), and most copies put a study name containing a double quote
straight inside "...", which ends the string early.

Checked here by executing each copy's generateStataCode in node and parsing the output (no Stata on
this machine): the `input` header declares study (str), yi, sei; then exactly one line per study, each
`"<name>" <number> <number>` with no quote inside the name; then `end`.
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
FILES = [
    'Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html',  # live: hub -> Pairwiseai/main-screen.html -> bundle
    'Pairwiseai/app.js',                                   # loaded by Pairwiseai/TruthCert-PairwisePro-v1.0-fast.html
    'Pairwiseai/app.min.js',
    'Pairwiseai/TruthCert-PairwisePro-v1.0-dist.html',
    'Pairwiseai/TruthCert-PairwisePro-v1.0-min.html',
    'Pairwiseai/TruthCert-PairwisePro-v1.0-optimized.html',
    'Pairwiseai/pairwise-pro-v2_2_evalue (5).html',
    'Truthcert1/app.min.js',
]
NODE = shutil.which('node')
pytestmark = pytest.mark.skipif(NODE is None, reason='node not installed')

RUNNER = r"""
const fs = require('fs');
const src = fs.readFileSync(process.argv[1], 'utf8');
const i = src.indexOf('function generateStataCode(');
if (i < 0) { console.log(JSON.stringify({ error: 'not found' })); process.exit(0); }
let code = null;
for (let e = src.indexOf('{', i); e < src.length; e++) {
  if (src[e] !== '}') continue;
  const cand = src.slice(i, e + 1);
  try { new Function(cand + ';return generateStataCode;'); code = cand; break; } catch (_) {}
}
const fn = new Function(code + ';return generateStataCode;')();
const data = { names: ['Alpha "2019"', 'Beta', 'Gamma et al.'], yi: [0.1, -0.2, 0.3], vi: [0.01, 0.04, 0.09] };
console.log(JSON.stringify({ out: fn(data, {}) }));
"""

ROW = re.compile(r'^"([^"]*)" (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)$')


def _stata(rel):
    r = subprocess.run([NODE, '-e', RUNNER, str(ROOT / rel)], capture_output=True, text=True, timeout=60,
                       encoding='utf-8')
    assert r.returncode == 0, r.stderr[-1500:]
    res = json.loads(r.stdout.strip().splitlines()[-1])
    assert 'error' not in res, rel + ': ' + res.get('error', '')
    return res['out']


@pytest.mark.parametrize('rel', FILES)
def test_input_block_has_one_observation_per_line(rel):
    lines = _stata(rel).split('\n')
    hdr = [n for n, l in enumerate(lines) if l.startswith('input ')]
    assert len(hdr) == 1, f'{rel}: expected one input header, got {len(hdr)}'
    h = hdr[0]
    assert re.fullmatch(r'input str\d+ study (float |double )?yi (float |double )?sei', lines[h].strip()), lines[h]
    end = lines.index('end', h)
    rows = lines[h + 1:end]
    assert len(rows) == 3, f'{rel}: {len(rows)} line(s) between input and end, expected 3: {rows!r}'
    assert not any('\\n' in r for r in rows), f'{rel}: literal backslash-n in data: {rows!r}'
    parsed = [ROW.match(r) for r in rows]
    assert all(parsed), f'{rel}: row not "<name>" <num> <num>: {rows!r}'
    assert [float(m.group(2)) for m in parsed] == [0.1, -0.2, 0.3]
    assert [float(m.group(3)) for m in parsed] == [0.1, 0.2, 0.3]
    assert parsed[1].group(1) == 'Beta' and parsed[2].group(1) == 'Gamma et al.'
