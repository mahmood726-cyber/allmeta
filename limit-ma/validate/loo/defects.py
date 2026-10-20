"""Run the comparator as a CLI; all three planted defects must fail."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import uuid

HERE = Path(__file__).resolve().parent
app = json.loads((HERE / 'app.json').read_text())
passed = 0
for name in ('estimate', 'refusal', 'missing_row'):
    rows = copy.deepcopy(app)
    if name == 'estimate':
        row = next(r for r in rows if r['status'] == 'ok' and abs(r['limit_est']) >= 1)
        row['limit_est'] *= 1 + 1e-8
    elif name == 'refusal':
        row = next(r for r in rows if r['status'] == 'refused')
        row.update(status='ok', limit_est=0, limit_se=1, re_est=0, tau2=0, reason='')
    else:
        rows.pop()
    # Keep temporary files in this already writable directory. Python's Windows
    # private temporary-directory ACL is incompatible with this managed sandbox.
    file = HERE / ('.mutation-' + uuid.uuid4().hex + '.json')
    try:
        file.write_text(json.dumps(rows))
        run = subprocess.run([sys.executable, str(HERE / 'compare.py'), str(file)], capture_output=True, text=True)
    finally:
        file.unlink(missing_ok=True)
    (HERE / f'defect-{name}.log').write_text(run.stdout + run.stderr)
    rejected = run.returncode != 0
    passed += rejected
    summary = next((line for line in run.stdout.splitlines() if ' checks;' in line), run.stdout)
    print(f'{name}: {"rejected" if rejected else "MISSED"}; {summary}')
print(f'{passed}/3 planted defects rejected')
sys.exit(0 if passed == 3 else 1)
