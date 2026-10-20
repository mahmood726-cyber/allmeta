"""Exact field diff of regenerated reference against the historical feasibility probe.

The new oracle adds tau2, so compare all eight shared CSV fields after parsing.
Usage: python compare_probe.py path/to/probe/loo_reference.csv
"""
import csv
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
with (HERE / 'reference.csv').open(newline='') as stream:
    fresh = list(csv.DictReader(stream))
with Path(sys.argv[1]).open(newline='') as stream:
    probe = list(csv.DictReader(stream))
key = lambda r: (r['id'], int(r['dropped']))
fresh_index, probe_index = {key(r): r for r in fresh}, {key(r): r for r in probe}
assert len(fresh_index) == len(fresh) == len(probe_index) == len(probe) == 5304
assert fresh_index.keys() == probe_index.keys()
checks = passed = 0
differences = []
for identity, old in probe_index.items():
    for field, value in old.items():
        checks += 1
        if fresh_index[identity][field] == value:
            passed += 1
        else:
            differences.append((identity, field, value, fresh_index[identity][field]))
print(f'{len(fresh)}/{len(probe)} deletion identities match')
print(f'{passed}/{checks} shared CSV fields match exactly; {len(differences)} differences')
print('New reference adds tau2; the eight-column projection matches the probe.' if not differences else differences)
sys.exit(int(bool(differences)))
