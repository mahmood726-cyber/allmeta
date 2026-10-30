"""Run the unchanged pinned LOO comparator; no logs or bytecode in the tree."""
import csv
import hashlib
import json
import runpy
import tempfile
from pathlib import Path

app = Path(__file__).resolve().parents[4] / 'limit-ma'
# Node fileURLToPath includes a trailing separator; match it exactly on Windows.
key = hashlib.sha256((str(app) + '/').replace('/', '\\').encode()).hexdigest()[:16]
destination = Path(tempfile.gettempdir()) / ('limit-ma-p12-r4-' + key)
after = json.loads((destination / 'after.json').read_text())
namespace = runpy.run_path(str(app / 'validate/loo/compare.py'), run_name='p12_comparator')
corpus = json.loads((app / 'validate/loo/corpus.json').read_text())
with (app / 'validate/loo/reference.csv').open(newline='') as stream:
    reference = list(csv.DictReader(stream))
result = namespace['compare'](after['loo'], reference, corpus)
print(json.dumps(result, indent=2))
assert result['passed'] == result['checks'] == 31514 and not result['failures']
