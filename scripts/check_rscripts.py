"""Run the self-checking R scripts exported by hub/shared/tests/rscript-export.spec.mjs in native R.

usage: python scripts/check_rscripts.py <dir-with-scripts-and-manifests> [--rscript PATH] [--out results.json]

For every exported script:
  1. run it unchanged: it must exit 0 and print 'RESULT: PASS' and 'n/n quantities agree';
  2. run a planted-defect copy (the first browser value v replaced by v*2+1, which exceeds every tolerance
     under both the absolute and the relative rule): it must exit 1 and print 'RESULT: FAIL'.
A run that cannot execute (missing package, R error) is reported as ERROR, never as PASS.
Exit status: 0 only if every script passes and every planted defect is caught.
"""
import argparse, json, re, subprocess, sys, time, io
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
ap = argparse.ArgumentParser()
ap.add_argument('dir')
ap.add_argument('--rscript', default='Rscript')
ap.add_argument('--out', default=None)
ap.add_argument('--timeout', type=int, default=600)
a = ap.parse_args()
root = Path(a.dir)

FIRST = re.compile(r'^(\.alm_app <- list\("(?:[^"\\]|\\.)*"=)([^,\n)]+)', re.M)


def run(path):
    t0 = time.time()
    try:
        p = subprocess.run([a.rscript, '--vanilla', str(path)], capture_output=True, text=True,
                           encoding='utf-8', errors='replace', timeout=a.timeout)
        out, rc = p.stdout + p.stderr, p.returncode
    except subprocess.TimeoutExpired:
        out, rc = 'TIMEOUT', -9
    m = re.search(r'(\d+)/(\d+) quantities agree', out)
    return {'rc': rc, 'secs': round(time.time() - t0, 1), 'agree': m.group(0) if m else None,
            'pass_line': 'RESULT: PASS' in out, 'fail_line': 'RESULT: FAIL' in out, 'tail': out[-1500:]}


manifests = sorted(root.glob('*.manifest.json'))
if not manifests:
    sys.exit('no manifests found in ' + str(root))
results, ok = [], True
versions = subprocess.run([a.rscript, '--vanilla', '-e',
                           'cat(R.version.string, "\\n"); for (p in c("dosresmeta","mixmeta","mada","netmeta","metafor")) '
                           'cat(p, tryCatch(as.character(packageVersion(p)), error=function(e) "missing"), "\\n")'],
                          capture_output=True, text=True).stdout
print(versions)
for mf in manifests:
    for entry in json.load(open(mf, encoding='utf-8')):
        rec = {'app': mf.name.replace('.manifest.json', ''), **entry}
        if not entry['exported']:
            rec['verdict'] = 'NOT-OFFERED' if entry.get('notOffered') else 'REFUSED-AT-EXPORT'
            results.append(rec); print('REFUSED', entry['name'], '-', entry['reason'][:100]); continue
        script = root / entry['file']
        good = run(script)
        m = re.search(r'(\d+)/(\d+) quantities agree', good['agree'] or '')
        good_ok = good['rc'] == 0 and good['pass_line'] and m and m.group(1) == m.group(2) and int(m.group(2)) == entry['quantities']
        text = script.read_text(encoding='utf-8')
        planted_text, n = FIRST.subn(lambda mm: mm.group(1) + '(' + mm.group(2) + ')*2+1', text, count=1)
        if n != 1:
            bad = {'rc': None, 'tail': 'could not plant defect'}; bad_ok = False
        else:
            pf = script.with_suffix('.planted.R'); pf.write_text(planted_text, encoding='utf-8')
            bad = run(pf); bad_ok = bad['rc'] == 1 and bad['fail_line']
        rec.update(good=good, planted=bad)
        rec['verdict'] = 'PASS' if good_ok and bad_ok else ('ERROR' if good['rc'] not in (0, 1) else 'FAIL')
        ok &= rec['verdict'] == 'PASS'
        print(f"{rec['verdict']:5s} {entry['name']}: {good['agree']} rc={good['rc']}; planted rc={bad['rc']}")
        results.append(rec)
SKIP = ('REFUSED-AT-EXPORT', 'NOT-OFFERED')
apps = sorted({r['app'] for r in results})
summary = {'versions': versions, 'scripts': sum(1 for r in results if r['verdict'] not in SKIP),
           'pass': sum(1 for r in results if r['verdict'] == 'PASS'),
           'by_app': {a: {'pass': sum(1 for r in results if r['app'] == a and r['verdict'] == 'PASS'),
                          'scripts': sum(1 for r in results if r['app'] == a and r['verdict'] not in SKIP),
                          'not_offered': sum(1 for r in results if r['app'] == a and r['verdict'] == 'NOT-OFFERED'),
                          'refused_at_export': sum(1 for r in results if r['app'] == a and r['verdict'] == 'REFUSED-AT-EXPORT')}
                      for a in apps},
           'not_pass': [r['name'] for r in results if r['verdict'] not in ('PASS',) + SKIP]}
ok &= all(v['pass'] > 0 for v in summary['by_app'].values())   # every app must have at least one passing script
print(json.dumps(summary, indent=1))
if a.out:
    Path(a.out).write_text(json.dumps({'summary': summary, 'results': results}, indent=1), encoding='utf-8')
sys.exit(0 if ok and summary['scripts'] > 0 else 1)
