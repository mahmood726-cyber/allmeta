"""Derive the plus-panel corpus from the P18 v1 validation corpus (same 92 configurations).
Accepted rows follow the page's complete-pair rule (as recorded by the v1 lane)."""
import json, sys, math
src, out = sys.argv[1], sys.argv[2]
corpus = json.load(open(src, encoding='utf-8'))
rows_out = []
for c in corpus:
    acc = c['accepted'] if isinstance(c['accepted'], list) else [c['accepted']]
    rows, omitted = [], []
    for i, s in enumerate(c['studies'], 1):
        if i in acc:
            y = s['y']; S = s['S']
            assert all(isinstance(x, (int, float)) and math.isfinite(x) for x in [y[0], y[1], S[0][0], S[1][1], S[0][1]])
            assert S[0][1] == S[1][0]
            rows.append({'label': str(s['label']), 'source_row': i, 'y': [y[0], y[1]], 'v': [S[0][0], S[1][1]], 'cov': S[0][1]})
        else:
            omitted.append({'source_row': i, 'label': str(s['label']), 'reason': 'missing/nonfinite outcome or covariance, or nonpositive variance'})
    rows_out.append({'id': c['id'], 'package': c['package'], 'dataset': c['dataset'], 'outcomes': c['outcomes'],
                     'covariance': c['covariance'], 'recipe': c['recipe'], 'rows': rows, 'omitted': omitted})
ids = [r['id'] for r in rows_out]
assert len(ids) == len(set(ids)) == 92
doc = {'schema': 'multivariate-ma-plus-corpus-v1', 'grid': [(-9 + i) / 10 for i in range(19)],
       'source': 'P18 v1 validation corpus (corpus.R over installed mvmeta 1.0.3, mixmeta 1.2.2, metadat 1.6.0, metafor 5.2.1)',
       'configurations': rows_out}
with open(out, 'w', encoding='utf-8', newline='\n') as f:
    f.write(json.dumps(doc, ensure_ascii=False, indent=1, allow_nan=False) + '\n')
print('PLUS CORPUS', len(rows_out), 'configurations;', sum(len(r['rows']) for r in rows_out), 'accepted rows;', sum(len(r['omitted']) for r in rows_out), 'omitted rows')
