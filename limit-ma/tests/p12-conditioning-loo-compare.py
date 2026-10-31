"""Use the unchanged published LOO comparator, retaining outputs in tempdir."""
import sys
sys.dont_write_bytecode = True
import csv
import importlib.util
import json
import tempfile
from pathlib import Path

here = Path(__file__).resolve().parent.parent / 'validate' / 'loo'
spec = importlib.util.spec_from_file_location('p12_loo_compare', here / 'compare.py')
comparator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(comparator)
with (here / 'reference.csv').open(newline='') as stream:
    refs = list(csv.DictReader(stream))
corpus = json.loads((here / 'corpus.json').read_text())
manifest = json.loads((here / 'MANIFEST.json').read_text())
failed = False
for phase in ('before', 'after'):
    app = json.loads((Path(tempfile.gettempdir()) / f'p12-r5-loo-{phase}.json').read_text())
    result = comparator.compare(app, refs, corpus)
    if result['checks'] != manifest['comparison_checks']:
        result['failures'].append('Comparison check count differs from pinned contract')
    failed |= bool(result['failures'])
    destination = Path(tempfile.gettempdir()) / f'p12-r5-loo-{phase}-comparison.json'
    destination.write_text(json.dumps(result, indent=2))
    print(json.dumps({**result, 'phase': phase, 'failure_count': len(result['failures']),
                      'failures': result['failures'][:20], 'output': str(destination)}, indent=2))
sys.exit(int(failed))
