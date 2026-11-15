"""UTF-8 text decoded as Windows-1252 in the per-app README.md files.

Root cause (lane pwscan, 2026-11-15): scripts/gen_app_readmes.py reads the catalog by running node and capturing
stdout with ``subprocess.run(..., text=True)`` and no ``encoding``. On a Windows machine whose locale encoding is
cp1252, Python decoded node's UTF-8 output as cp1252, so every non-ASCII character in a catalog label/blurb was
written into a newly created README as two characters: '×' (C3 97) -> 'Ã—', 'τ²' -> 'Ï„Â²', 'α' -> 'Î±',
'β' -> 'Î²', 'ö' -> 'Ã¶', 'ü' -> 'Ã¼'. Eight READMEs carried it (everything-model, bma-tau-priors,
heterogeneity, multi-outcome-nma, nma-meta-reg, gosh-metareg, limit-ma, sequential-ma). The generator only writes
the header of a README once (when it creates the file), so fixing the script does not repair existing files;
both are fixed and this test guards both.
"""
import importlib.util
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent

_CP1252_CONT = ('\u0080-¿ŒœŠšŸŽžƒˆ˜–—'
                '‘-„†-•…‰‹›€™')
# a UTF-8 lead byte (C2-F4) shown as its cp1252 character followed by a continuation byte shown the same way
SIG = re.compile('[Â-ô][' + _CP1252_CONT + ']')
SNAPSHOT = re.compile(r'(^|/)(_archive|archive|e156-submission|Submission|dev|node_modules)/')

GARBLED = ['Ã—', 'Ï„Â²', 'IÂ²', 'Î±', 'Î²', 'RÃ¶ver', 'RÃ¼cker']
RESTORED = {
    'everything-model/README.md': 'Joint outcome × time × RoB hierarchy.',
    'bma-tau-priors/README.md': '# BMA across τ² priors',
    'heterogeneity/README.md': '**Purpose:** I², τ², Q, prediction interval.',
    'multi-outcome-nma/README.md': 'Achana 2014 multi-arm × multi-outcome.',
    'nma-meta-reg/README.md': 'Treatment × covariate interaction model.',
    'gosh-metareg/README.md': '**Purpose:** β coefficient stability',
    'limit-ma/README.md': '**Purpose:** Rücker shrinkage toward zero-variance',
    'sequential-ma/README.md': '# Sequential MA (α-spending)',
}


def _readmes():
    out = subprocess.run(['git', '-C', str(ROOT), 'ls-files', '-z', '*README.md'],
                         capture_output=True, check=True).stdout.decode('utf-8').split('\0')
    return [f for f in out if f and not SNAPSHOT.search(f)]


def test_readme_list_nonempty():
    files = _readmes()
    assert len(files) > 50, files  # the scan must have looked at the per-app READMEs, not nothing
    assert all(f in files for f in RESTORED)


def test_no_mojibake_in_readmes():
    bad = {}
    for rel in _readmes():
        text = (ROOT / rel).read_text(encoding='utf-8')
        hits = [text[max(0, m.start() - 15):m.end() + 5] for m in SIG.finditer(text)]
        hits += [g for g in GARBLED if g in text]
        if hits:
            bad[rel] = hits[:5]
    assert not bad, f'{len(bad)} README(s) with cp1252-decoded UTF-8: {bad}'


@pytest.mark.parametrize('rel', sorted(RESTORED))
def test_restored_text(rel):
    assert RESTORED[rel] in (ROOT / rel).read_text(encoding='utf-8')


@pytest.mark.skipif(shutil.which('node') is None, reason='node not installed')
def test_generator_reads_node_output_as_utf8():
    spec = importlib.util.spec_from_file_location('gen_app_readmes', ROOT / 'scripts' / 'gen_app_readmes.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    cat = mod._load_data()['catalog']
    assert '×' in cat['everything-model']['blurb'], ascii(cat['everything-model']['blurb'])
    assert 'τ²' in cat['bma-tau-priors']['label'], ascii(cat['bma-tau-priors']['label'])
    for key, entry in cat.items():
        for field in ('label', 'blurb'):
            v = entry.get(field) or ''
            assert not SIG.search(v), (key, field, ascii(v))
