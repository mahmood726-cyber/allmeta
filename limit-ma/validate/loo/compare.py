"""Strict identity, status, refusal payload and numeric comparison; exits nonzero on failure."""
import csv
import hashlib
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
NUMERIC = ('limit_est', 'limit_se', 're_est', 'tau2')


def compare(app, reference, corpus):
    expected = {(c['id'], i + 1): len(c['te']) for c in corpus for i in range(len(c['te']))}
    failures = []
    checks = passed = 0
    maxima = {}

    def check(ok, description):
        nonlocal checks, passed
        checks += 1
        if ok:
            passed += 1
        else:
            failures.append(description)

    def index(rows, label):
        result = {}
        for row in rows:
            key = (row['id'], int(row['dropped']))
            if key in result:
                failures.append(f'{label}: duplicate {key}')
            result[key] = row
        check(set(result) == set(expected) and len(rows) == len(expected), f'{label}: coverage mismatch')
        return result

    a, r = index(app, 'app'), index(reference, 'R')
    for key, k in expected.items():
        if key not in a or key not in r:
            continue
        x, y = a[key], r[key]
        check(int(x['k']) == int(y['k']) == k, f'{key}: k mismatch')
        check(x['status'] == y['status'] and y['status'] in ('ok', 'refused'), f'{key}: status mismatch')
        if y['status'] == 'refused':
            check(all(f in x and x[f] is None for f in (*NUMERIC, 'change', 'ci_low', 'ci_high')),
                  f'{key}: refusal contains numbers')
            check(bool(x.get('reason')) and x['reason'] == y['reason'], f'{key}: refusal reason mismatch')
        else:
            for field in NUMERIC:
                try:
                    av, rv = float(x[field]), float(y[field])
                    delta = abs(av - rv) / max(1, abs(rv))
                    ok = math.isfinite(av) and math.isfinite(rv) and delta <= 1e-9
                except (TypeError, ValueError, KeyError):
                    delta, ok = math.inf, False
                maxima[field] = max(maxima.get(field, 0), delta)
                check(ok, f'{key}: {field} relative error {delta}')
    return {'passed': passed, 'checks': checks, 'failures': failures, 'max_relative': maxima,
            'app_rows': len(app), 'reference_rows': len(reference)}


def main():
    manifest = json.loads((HERE / 'MANIFEST.json').read_text())
    for item in manifest['files']:
        data = (HERE / item['path']).read_bytes()
        if len(data) != item['bytes'] or hashlib.sha256(data).hexdigest() != item['sha256']:
            raise ValueError('Pinned input changed: ' + item['path'])
    print(f"{len(manifest['files'])}/{len(manifest['files'])} input hashes verified")
    app = json.loads(Path(sys.argv[1] if len(sys.argv) > 1 else HERE / 'app.json').read_text())
    with Path(sys.argv[2] if len(sys.argv) > 2 else HERE / 'reference.csv').open(newline='') as stream:
        reference = list(csv.DictReader(stream))
    corpus = json.loads((HERE / 'corpus.json').read_text())
    if len(corpus) != manifest['configurations'] or sum(len(c['te']) for c in corpus) != manifest['deletions']:
        raise ValueError('Pinned corpus counts changed')
    result = compare(app, reference, corpus)
    if result['checks'] != manifest['comparison_checks']:
        result['failures'].append('Comparison check count differs from pinned contract')
    print(f"{result['passed']}/{result['checks']} checks; {result['app_rows']}/{result['reference_rows']} rows")
    print(json.dumps(result, indent=2))
    return int(bool(result['failures']) or result['passed'] != result['checks'])


if __name__ == '__main__':
    sys.exit(main())
