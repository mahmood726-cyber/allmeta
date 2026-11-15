"""scripts/gen_app_readmes.py must not overwrite hand-edited README auto sections.

Root cause (lane crlfreadme, 2026-11-15): _patch_readme() replaced everything between the ALM-AUTO-README
markers unconditionally. Run on main at 52d60839 it rewrote 5 READMEs (component-nma, cross-design,
multi-outcome-ma, nma-inconsistency, rve-meta), reverting hand corrections -- data-shape and reproducibility
wording, two DOIs and rve-meta's Outputs section -- to the catalog defaults. The generator now records the
hash of each section it writes (scripts/app_readmes.generated.json) and rewrites a section only when it is
still exactly what it wrote.
"""
import importlib.util
import json
import shutil
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
HAND_EDITED = ['component-nma', 'cross-design', 'multi-outcome-ma', 'nma-inconsistency', 'rve-meta']


def _gen():
    spec = importlib.util.spec_from_file_location('gen_app_readmes', ROOT / 'scripts' / 'gen_app_readmes.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


G = _gen()
ENTRY = {'kind': 'pairwise', 'category': 'Pairwise MA', 'blurb': 'Toy method', 'label': 'Toy'}
OLD_ENTRY = {'kind': 'pairwise', 'category': 'Pairwise MA', 'blurb': 'Old blurb', 'label': 'Toy'}
PREAMBLE = '# Toy\n\nHand-written intro.\n\n'


def _section(entry):
    return G._render_auto_section('toy', entry, [], None)


def test_hand_edited_section_survives(tmp_path):
    readme = tmp_path / 'README.md'
    edited = _section(ENTRY).replace('- **Purpose:** Toy method.', '- **Purpose:** corrected by hand.')
    readme.write_text(PREAMBLE + edited + '\n', encoding='utf-8')
    before = readme.read_bytes()
    lock = {}
    assert G.process_readme(readme, 'toy', ENTRY, [], None, lock) == 'PRESERVED (hand-edited)'
    assert readme.read_bytes() == before
    assert 'toy' not in lock


def test_hand_edit_of_a_generated_section_survives(tmp_path):
    # the section WAS generated (its hash is on record), then someone edited it
    readme = tmp_path / 'README.md'
    generated = _section(OLD_ENTRY)
    lock = {'toy': G._section_hash(generated)}
    readme.write_text(PREAMBLE + generated.replace('Old blurb', 'Edited blurb') + '\n', encoding='utf-8')
    before = readme.read_bytes()
    assert G.process_readme(readme, 'toy', ENTRY, [], None, lock).startswith('PRESERVED')
    assert readme.read_bytes() == before
    assert lock['toy'] == G._section_hash(generated)  # record untouched


def test_generated_section_still_regenerates(tmp_path):
    readme = tmp_path / 'README.md'
    stale = _section(OLD_ENTRY)
    readme.write_text(PREAMBLE + stale + '\n', encoding='utf-8')
    lock = {'toy': G._section_hash(stale)}
    assert G.process_readme(readme, 'toy', ENTRY, [], None, lock) == 'WROTE'
    text = readme.read_text(encoding='utf-8')
    assert text.startswith(PREAMBLE)
    assert '- **Purpose:** Toy method.' in text and 'Old blurb' not in text
    assert lock['toy'] == G._section_hash(_section(ENTRY))
    # and a second run is a no-op
    assert G.process_readme(readme, 'toy', ENTRY, [], None, lock) == 'SKIP (no change)'


def test_force_regenerates_a_hand_edited_section(tmp_path):
    readme = tmp_path / 'README.md'
    readme.write_text(PREAMBLE + _section(ENTRY).replace('Toy method', 'hand') + '\n', encoding='utf-8')
    lock = {}
    assert G.process_readme(readme, 'toy', ENTRY, [], None, lock, force=True) == 'WROTE'
    assert '- **Purpose:** Toy method.' in readme.read_text(encoding='utf-8')


def test_missing_and_markerless_readmes_still_handled(tmp_path):
    new = tmp_path / 'new' / 'README.md'
    new.parent.mkdir()
    lock = {}
    assert G.process_readme(new, 'toy', ENTRY, [], None, lock) == 'WROTE'
    assert G.MARK_BEGIN in new.read_text(encoding='utf-8') and 'toy' in lock
    plain = tmp_path / 'README.md'
    plain.write_text('# Toy\n\nNo markers here.\n', encoding='utf-8')
    assert G.process_readme(plain, 'toy', ENTRY, [], None, {}) == 'WROTE'
    text = plain.read_text(encoding='utf-8')
    assert text.startswith('# Toy\n\nNo markers here.\n') and G.MARK_END in text


def test_lock_file_matches_repo_readmes():
    lock = json.loads((ROOT / 'scripts' / 'app_readmes.generated.json').read_text(encoding='utf-8'))
    assert len(lock) >= 30, lock
    for app in HAND_EDITED:
        assert app not in lock, app  # never generator output, so never eligible for regeneration
    for app, digest in lock.items():
        cur = G._existing_section((ROOT / app / 'README.md').read_text(encoding='utf-8'))
        assert cur is not None and G._section_hash(cur) == digest, app


@pytest.mark.skipif(shutil.which('node') is None, reason='node not installed')
def test_full_run_on_repo_readmes_changes_nothing(tmp_path):
    data = G._load_data()
    catalog, cites, hero = data['catalog'], data['citations'], data['hero']
    lock = json.loads((ROOT / 'scripts' / 'app_readmes.generated.json').read_text(encoding='utf-8'))
    statuses = {}
    for app, entry in catalog.items():
        src = ROOT / app / 'README.md'
        if not src.exists():
            continue
        dst = tmp_path / app / 'README.md'
        dst.parent.mkdir()
        shutil.copyfile(src, dst)
        statuses[app] = G.process_readme(dst, app, entry, cites.get(app) or [], hero.get(app), dict(lock))
        assert dst.read_bytes() == src.read_bytes(), app
    assert len(statuses) >= 35, statuses
    for app in HAND_EDITED:
        assert statuses[app] == 'PRESERVED (hand-edited)', (app, statuses[app])
    assert 'WROTE' not in statuses.values(), statuses
