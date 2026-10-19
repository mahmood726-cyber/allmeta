"""Combine the per-configuration R outputs (reference.R) into one pinned reference + MANIFEST.

Usage (from cumulative-subgroup/): python subcum/validate/build/combine.py <dir with 00001.json ...>
The R text is copied verbatim (17-significant-digit numbers), never re-serialised.
Fails closed on a missing file, a key out of corpus order, an R error, or a version other than metafor 5.2.1.
"""
import hashlib, json, sys
from pathlib import Path

base = Path('subcum/validate')
corpus_bytes = (base / 'corpus' / 'corpus.json').read_bytes()
corpus = json.loads(corpus_bytes)
src = Path(sys.argv[1])
parts, statuses, groups, steps, checks = [], {}, 0, 0, 0
for i, c in enumerate(corpus, 1):
    f = src / f'{i:05d}.json'
    text = f.read_text(encoding='utf-8').strip()
    r = json.loads(text)
    if r['key'] != c['key']:
        sys.exit(f'key mismatch at {i}: {r["key"]} != {c["key"]}')
    if r['status'] not in ('ok', 'refused'):
        sys.exit(f'R status {r["status"]} at {c["key"]}: {r.get("reason")}')
    if r['versions']['metafor'] != '5.2.1':
        sys.exit('metafor version ' + r['versions']['metafor'])
    statuses[r['status']] = statuses.get(r['status'], 0) + 1
    if r['status'] == 'refused':
        checks += 4
    else:
        checks += 5
        for g in r['groups']:
            if len(g['steps']) != g['k']:
                sys.exit('step count mismatch ' + c['key'])
            groups += 1; steps += g['k']; checks += 2 + 13 * g['k']
    parts.append(text)
adj_bytes = (base / 'corpus' / 'adjudicated.json').read_bytes()
adj = json.loads(adj_bytes)
if any(a['versions']['metafor'] != '5.2.1' for a in adj):
    sys.exit('adjudication metafor version')
ref = ('[' + ',\n'.join(parts) + ']\n').encode('utf-8')
(base / 'corpus' / 'reference.json').write_bytes(ref)
sha = lambda b: hashlib.sha256(b).hexdigest()
versions = json.loads(parts[0])['versions']
manifest = {
    'tier': 'within-subgroup cumulative (separate from validate/MANIFEST.json; that contract is unchanged)',
    'files': [
        {'path': 'subcum/validate/corpus/corpus.json', 'sha256': sha(corpus_bytes), 'bytes': len(corpus_bytes)},
        {'path': 'subcum/validate/corpus/reference.json', 'sha256': sha(ref), 'bytes': len(ref)},
        {'path': 'subcum/validate/corpus/adjudicated.json', 'sha256': sha(adj_bytes), 'bytes': len(adj_bytes)},
    ],
    'adjudicated_pools': len(adj),
    'adjudication_rule': 'Only the listed pools (adjudicated.json, produced by adjudicate.R) may be compared with R closed forms evaluated at the page tau2, and only when the page tau2 agrees with the R PM tau2 at 1e-6, is bit-identical to tau2_app, and membership matches; all other pools are strict. All listed pools are residual Q at the PM weights.',
    'configurations': len(corpus),
    'rows_variants': sum(1 for c in corpus if c['source'][1] is None),
    'year_variants': sum(1 for c in corpus if c['source'][1] is not None),
    'ok': statuses.get('ok', 0), 'refused': statuses.get('refused', 0),
    'subgroups': groups, 'steps': steps, 'checks': checks,
    'check_formula': 'refused: 4; ok: 5 + sum over subgroups of (2 + 13 * k_g)',
    'referenceVersions': versions,
    'reference_method': 'per subgroup: rma(yi, vi, method="PM", test="z", archived convergence controls) on the subgroup rows, then cumul(fit, order = year) when every study in the subgroup has a year, else cumul(fit); residual Q at PM weights and t_{k-1} 95% PI computed from each step',
    'tolerances': {'tau2': 'abs(app-R)/max(1,|R|) <= 1e-6', 'other': '1e-9 relative to max(1,|R|)', 'k, order, membership, labels, years, group names, refusals': 'exact'},
    'source_corpus': {'path': 'validate/corpus/corpus.json', 'sha256': 'dac5806f456eb35518124d44b74e721f21c353abdb21287db533bc8f36616ea2'},
}
(base / 'MANIFEST.json').write_text(json.dumps(manifest, indent=1) + '\n', encoding='utf-8', newline='\n')
print(json.dumps({k: manifest[k] for k in ('configurations', 'ok', 'refused', 'subgroups', 'steps', 'checks')}), manifest['files'][1]['sha256'], len(ref))
