"""Add only the two example scripts; preserve every original page byte."""
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
manifest = json.loads((HERE / 'manifest.json').read_text(encoding='utf-8'))
baseline_path = HERE / 'page-baselines.json'
baselines = json.loads(baseline_path.read_text(encoding='utf-8')) if baseline_path.exists() else {}
for entry in manifest:
    path = ROOT / entry['app'] / 'index.html'
    original = path.read_bytes()
    newline = b'\r\n' if b'\r\n' in original else b'\n'
    addition = newline.join([b'<script src="../shared/alm-examples.js"></script>', b'<script src="alm-examples.js"></script>', b''])
    if addition not in original:
        if original.count(b'</body>') != 1:
            raise ValueError('Ambiguous page body: ' + entry['app'])
        baselines[entry['app']] = hashlib.sha256(original).hexdigest()
        path.write_bytes(original.replace(b'</body>', addition + b'</body>'))
    restored = path.read_bytes().replace(addition, b'')
    if hashlib.sha256(restored).hexdigest() != baselines[entry['app']]:
        raise ValueError('Non-additive page changes: ' + entry['app'])
    print(entry['app'], 'script tags only; original bytes verified')
baseline_path.write_text(json.dumps(baselines, indent=2) + '\n', encoding='utf-8')
