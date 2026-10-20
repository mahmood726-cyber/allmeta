"""Pin the plus corpus/reference bytes (LF) and the reference-derived check count.
Usage: python pin-plus.py   (from multivariate-ma/validate; needs node for the check count)"""
import hashlib, json, subprocess
from pathlib import Path

root = Path(__file__).resolve().parent
plus = root / 'plus'
for name in ('corpus.json', 'reference.json'):
    p = plus / name
    raw = p.read_bytes().replace(b'\r\n', b'\n')
    json.loads(raw.decode('utf-8'))  # must parse
    p.write_bytes(raw)
corpus = json.loads((plus / 'corpus.json').read_text(encoding='utf-8'))
ref = json.loads((plus / 'reference.json').read_text(encoding='utf-8'))
assert len(corpus['configurations']) == len(ref['configurations']) == 92
assert [c['id'] for c in corpus['configurations']] == [c['id'] for c in ref['configurations']]
assert corpus['grid'] == ref['grid'] and len(corpus['grid']) == 19
js = ("const c=require('./plus-contract.js'),fs=require('fs');"
      "const a=JSON.parse(fs.readFileSync('plus/corpus.json','utf8')),b=JSON.parse(fs.readFileSync('plus/reference.json','utf8'));"
      "c.validateInputs(a,b);console.log(c.expectedChecks(a,b,true));")
checks = int(subprocess.check_output(['node', '-e', js], cwd=root, text=True).strip())
manifest = {'schema': 'multivariate-ma-plus-v1', 'configurations': 92, 'grid': corpus['grid'], 'checks': checks,
            'versions': ref['versions'], 'R': ref['R'], 'controls': ref['controls'], 'files': []}
for name in ('corpus.json', 'reference.json'):
    raw = (plus / name).read_bytes()
    assert b'\r' not in raw
    manifest['files'].append({'path': 'validate/plus/' + name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})
(root / 'MANIFEST-plus.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
(root / 'plus-pins.js').write_text('window.AlmMvPlusManifest=' + json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8', newline='\n')
print(f'PLUS PINNED 92 configurations x 19 rho_w; {checks} checks')
