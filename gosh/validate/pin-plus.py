"""Pin the R-produced extras evidence; run from the repository root."""
import hashlib
import json
from pathlib import Path

root = Path('gosh/validate')
corpus = json.loads((root / 'plus/corpus.json').read_text(encoding='utf-8'))
reference = json.loads((root / 'plus/reference.json').read_text(encoding='utf-8'))
assert len(reference) == len(corpus) * 2
assert {r['key'] for r in reference} == {c['id']+'::'+m for c in corpus for m in ('FE', 'DL')}
for r in reference:
    assert all(isinstance(p['members'], list) for p in r['points'])
checks = sum(9 + len(r['rows'])*11 + len(r['points'])*(11 if r['key'].endswith('::DL') else 9) for r in reference)
files = []
for name in ('corpus.json', 'reference.json'):
    path = root / 'plus' / name
    data = path.read_bytes()
    files.append(dict(path='validate/plus/'+name, sha256=hashlib.sha256(data).hexdigest(), bytes=len(data)))
manifest = dict(files=files, configurations=len(corpus), model_configurations=len(reference), checks=checks,
                referenceVersions={'R':'4.6.0','metafor':'5.2-1'},
                source_files=json.loads((root/'MANIFEST.json').read_text())['files'],
                sampling="Archived R fits on the app's exact memberships, including repeated draws; no new sampled fits.",
                enumeration='metafor::gosh; membership-key match to the existing pinned reference',
                quantities='11 displayed per-study quantities; membership; estimate/I2/H2/Q and DL tau2/tau; plotted coordinates/classes/counts; displayed highlight counts',
                tolerance='1e-9 relative to max(1, abs(R)); counts and membership exact')
text=json.dumps(manifest,ensure_ascii=False,indent=2)+'\n'
(root/'MANIFEST-plus.json').write_text(text,encoding='utf-8',newline='\n')
(root/'manifest-plus.js').write_text('window.AlmGoshPlusManifest = '+text.rstrip()+';\n',encoding='utf-8',newline='\n')
print(f'PLUS CORPUS {len(corpus)} configurations / {len(reference)} model configurations / {checks} checks')
