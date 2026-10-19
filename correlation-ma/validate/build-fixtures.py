"""Extract the declared P17 subset; never generate numerical expectations from JS.

Usage: python build-fixtures.py <P17-validation.zip>
Then run validate-correlation-ma.node.cjs --build to pin the static text and bytes.
"""
from pathlib import Path
import hashlib
import json
import sys
import zipfile

dest = Path(__file__).resolve().parent
archive = Path(sys.argv[1])

def save(name, obj):
    (dest / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8', newline='\n')

with zipfile.ZipFile(archive) as z:
    load = lambda p: json.loads(z.read(p))
    refs = {r['id']: r for r in load('reference.json') + load('supplemental-reference.json')}
    corpus, reference = [], []
    for c in load('corpus.json'):
        if len(c['studies']) > 100:
            continue
        for method in ['REML', 'PM', 'DL', 'FE']:
            key = c['id'] + '::' + method
            text = '\n'.join(f"{s['label']}, {s['r'] if s['r'] is not None else 'NA'}, {s['n'] if s['n'] is not None else 'NA'}" for s in c['studies'])
            corpus.append(dict(id=key, method=method, text=text))
            reference.append(refs[key])
    for p in load('ui-patched.json'):
        name, method = p['id'].split('::')
        if name == 'no-study-cap':
            continue
        corpus.append(dict(id=p['id'], method=method, text=p['text']))
        if len(p['expectedLabels']) < 2:
            reference.append(dict(id=p['id'], status='refused', method=method))
        else:
            r = json.loads(json.dumps(refs.get(p['id'], refs['two-studies::' + method])))
            r['id'] = p['id']
            for s, label in zip(r['studies'], p['expectedLabels']):
                s['label'] = label
            reference.append(r)
    for method in ['REML', 'PM', 'DL', 'FE']:
        key = 'empty-fields::' + method
        corpus.append(dict(id=key, method=method, text='empty-r, , 30\nempty-n, .4, \nnegative-n, .4, -2\ninf-n, .4, Infinity\nnegative-inf, -Infinity, 30\n, .2, 20\ncomma,label, -.3, 30'))
        r = json.loads(json.dumps(refs['two-studies::' + method])); r['id'] = key
        r['studies'][0]['label'] = 'Study 1'; r['studies'][1]['label'] = 'comma, label'
        reference.append(r)
    save('corpus/corpus.json', corpus)
    save('corpus/reference.json', dict(configurations=reference))
    names = ['corpus.json', 'reference.json', 'supplemental-reference.json', 'ui-patched.json', 'reference.R', 'supplemental.R', 'json17.R']
    save('SOURCE.json', dict(archive='P17-validation.zip', sha256=hashlib.sha256(archive.read_bytes()).hexdigest(),
        base_commit='7966530de875d22253f0557c7b447ed9d917685d', files={n: hashlib.sha256(z.read(n)).hexdigest() for n in names}))
print(f'Extracted {len(corpus)} configurations; rebuild static text and pins with the Node fixture builder.')
