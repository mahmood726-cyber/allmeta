"""Canonicalize the independently generated R evidence and pin exact LF bytes."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
plus = root / 'plus'
corpus = json.loads((root / 'corpus/corpus.json').read_text(encoding='utf-8'))
reference = json.loads((plus / 'reference.json').read_text(encoding='utf-8'))
assert len(corpus) == len(reference) == 169
assert [x['id'] for x in corpus] == [x['id'] for x in reference]
for base, enriched in zip(corpus, json.loads((plus / 'corpus.json').read_text(encoding='utf-8'))):
    assert base['id'] == enriched['id']
    if 'binary' in enriched:
        base['binary'] = enriched['binary']
# jsonlite encodes coef(selmodel)[1] as a singleton list. Normalize shape only.
for row in reference:
    selection = row['methods']['selection']
    if selection['status'] == 'ok':
        v = selection['values']
        if isinstance(v['mu'], list):
            assert len(v['mu']) == 1
            v['mu'] = v['mu'][0]
        if any(x is None for x in v.values()):
            row['methods']['selection'] = {'status': 'refused', 'reason': 'selection-fit-undefined'}

def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8', newline='\n')

write(plus / 'corpus.json', corpus)
write(plus / 'reference.json', reference)
checks = 169  # one rendering contract per configuration
for row in reference:
    for m in row['methods'].values():
        checks += 1  # status
        if m['status'] == 'refused':
            checks += 1
        else:
            checks += int('branch' in m)
            checks += sum(1 + len(v) if isinstance(v, list) else 1 for v in m['values'].values())
manifest = {'schema': 'limit-ma-plus-v1', 'configurations': len(corpus), 'checks': checks,
            'versions': {'metafor': '5.2-1', 'meta': '8.5-0', 'metasens': '1.5-3'},
            'source_sha256': hashlib.sha256((root / 'corpus/corpus.json').read_bytes()).hexdigest(),
            'files': []}
for name in ('corpus.json', 'reference.json'):
    raw = (plus / name).read_bytes()
    assert b'\r' not in raw
    manifest['files'].append({'path': 'validate/plus/' + name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})
write(root / 'MANIFEST-plus.json', manifest)
(root / 'plus-pins.js').write_text('window.AlmLimitPlusManifest=' + json.dumps(manifest, separators=(',', ':')) + ';\n', encoding='utf-8', newline='\n')
print(f'PLUS PINNED {len(corpus)} configurations; {checks} checks')