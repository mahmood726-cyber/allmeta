"""Plus-panel evidence builder for nma-inconsistency (paper 16). Run from the repository root.

  python nma-inconsistency/validate/pin-plus.py corpus <P16-validation-dir>
      Select the plus corpus from the archived P16 corpus + final R references:
      every accepted configuration with a closed loop (global df > 0), plus the
      first three accepted no-loop configurations per model in corpus order.
  python nma-inconsistency/validate/pin-plus.py estimators <P16-validation-dir>
      Assemble FE/DL/PM triples of the same accepted dataset from the archived
      final references (no new R fit) into plus/estimators-reference.json.
  python nma-inconsistency/validate/pin-plus.py merge <shard-dir>...
      Merge generate-plus.R per-configuration outputs into plus/reference.json.
  python nma-inconsistency/validate/pin-plus.py pin
      Pin the plus evidence files (SHA-256, bytes, counts) into MANIFEST-plus.json
      and manifest-plus.js.
"""
import hashlib
import json
import sys
from pathlib import Path

root = Path('nma-inconsistency/validate')
plus = root / 'plus'


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def dump(obj, path):
    text = json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + '\n'
    Path(path).write_text(text, encoding='utf-8', newline='\n')


def archive(src):
    src = Path(src)
    corpus = load(src / 'corpus.json')
    refs = [load(src / 'reference' / ('%05d.json' % i)) for i in range(1, len(corpus) + 1)]
    for c, r in zip(corpus, refs):
        assert c['key'] == r['key'], (c['key'], r['key'])
    return corpus, refs


def rows_of(c):
    return [{k: r[k] for k in ('A', 'B', 'te', 'se', 'study')} for r in c['rows']]


def cmd_corpus(src):
    corpus, refs = archive(src)
    out, noloop = [], {}
    for i, (c, r) in enumerate(zip(corpus, refs), 1):
        if r['status'] != 'ok':
            continue
        loop = r['dbt']['df'] > 0
        if not loop:
            noloop.setdefault(c['model'], [])
            if len(noloop[c['model']]) >= 3:
                continue
            noloop[c['model']].append(c['key'])
        out.append(dict(key=c['key'], archive_index=i, model=c['model'], dataset=c['dataset'], outcome=c['outcome'],
                        measure=c['measure'], subset=c['subset'], loops=loop, rows=rows_of(c)))
    plus.mkdir(parents=True, exist_ok=True)
    dump(out, plus / 'corpus.json')
    loops = [c for c in out if c['loops']]
    nets = {(c['dataset'], c['outcome'], c['subset']) for c in loops}
    print(f'PLUS CORPUS {len(out)} configurations ({len(loops)} with loops, {len(out)-len(loops)} without); '
          f'{sum(len(c["rows"]) for c in out)} drop-fits; {sum(len(c["rows"]) for c in loops)} drop-fits on loop configurations; '
          f'{len(nets)} distinct dataset/outcome/subset networks with loops')


def cmd_estimators(src):
    corpus, refs = archive(src)
    groups = {}
    for i, (c, r) in enumerate(zip(corpus, refs), 1):
        base = c['key'].rsplit('::', 1)[0]
        groups.setdefault(base, {})[c['model']] = (i, c, r)
    out = []
    for base, g in groups.items():
        if set(g) != {'FE', 'DL', 'PM'} or any(g[m][2]['status'] != 'ok' for m in g):
            continue
        rows = [rows_of(g[m][1]) for m in ('FE', 'DL', 'PM')]
        assert rows[0] == rows[1] == rows[2], base
        keep = ('trts', 'Q', 'df', 'tau2', 'Qrandom', 'estimates', 'estimatesRandom', 'nodeSplit', 'dbt')
        out.append(dict(key=base, archive_index={m: g[m][0] for m in g}, rows=rows[0],
                        models={m: {k: g[m][2][k] for k in keep} for m in ('FE', 'DL', 'PM')}))
    dump(out, plus / 'estimators-reference.json')
    print(f'ESTIMATORS {len(out)} accepted dataset triples')


def cmd_merge(dirs):
    corpus = load(plus / 'corpus.json')
    found = {}
    for d in dirs:
        for f in sorted(Path(d).glob('*.json')):
            x = load(f)
            found[x['key']] = x
    missing = [c['key'] for c in corpus if c['key'] not in found]
    assert not missing, f'missing {len(missing)} configurations, first {missing[:3]}'
    cases = []
    for c in corpus:
        x = found[c['key']]
        assert x['full_check'] == 'matches archived final reference within 1e-12', (c['key'], x['full_check'])
        assert [d['drop'] for d in x['drops']] == [r['study'] for r in c['rows']], c['key']
        assert x['full']['status'] == 'ok'
        cases.append(x)
    worst = max(x['full_max_rel_diff'] for x in cases)
    dump(dict(versions=found[corpus[0]['key']]['versions'], full_vs_archive_max_rel_diff=worst, cases=cases), plus / 'reference.json')
    print(f'full fits vs archived final reference: max relative difference {worst:.3g}')
    n = sum(len(x['drops']) for x in cases)
    st = {}
    for x in cases:
        for d in x['drops']:
            k = d['fit']['status'] + ('' if d['fit']['status'] == 'ok' else ': ' + d['fit']['reason'])
            st[k] = st.get(k, 0) + 1
    print(f'MERGED {len(cases)} configurations / {n} drop-fits; statuses {st}')


def cmd_pin():
    corpus = load(plus / 'corpus.json')
    reference = load(plus / 'reference.json')
    est = load(plus / 'estimators-reference.json')
    assert [x['key'] for x in reference['cases']] == [c['key'] for c in corpus]
    files = []
    for name in ('corpus.json', 'reference.json', 'estimators-reference.json'):
        data = (plus / name).read_bytes()
        files.append(dict(path='validate/plus/' + name, sha256=hashlib.sha256(data).hexdigest(), bytes=len(data)))
    drops = sum(len(x['drops']) for x in reference['cases'])
    manifest = dict(
        files=files, configurations=len(corpus), loop_configurations=sum(c['loops'] for c in corpus),
        drop_fits=drops, estimator_triples=len(est),
        referenceVersions=reference['versions'],
        source='P16 archive corpus.json + final reference/*.json (R 4.6.0, netmeta 3.7-0, metafor 5.2-1)',
        rule='Every accepted archived configuration with a closed loop, plus the first three accepted no-loop configurations per model; each study removed in turn; tau2 re-estimated per drop with the selected model.',
        tolerance='FE/DL estimates, Q, tau2 1e-9 relative to max(1,|R|); PM-derived 1e-6; p-values 1e-9 absolute; df, counts, membership, flips and refusal reasons exact')
    text = json.dumps(manifest, ensure_ascii=False, indent=2) + '\n'
    (root / 'MANIFEST-plus.json').write_text(text, encoding='utf-8', newline='\n')
    (root / 'manifest-plus.js').write_text('window.AlmIncoPlusManifest = ' + text.rstrip() + ';\n', encoding='utf-8', newline='\n')
    print(f'PINNED {manifest["configurations"]} configurations / {drops} drop-fits / {len(est)} estimator triples')


if __name__ == '__main__':
    cmd, args = sys.argv[1], sys.argv[2:]
    {'corpus': lambda: cmd_corpus(args[0]), 'estimators': lambda: cmd_estimators(args[0]),
     'merge': lambda: cmd_merge(args), 'pin': cmd_pin}[cmd]()
