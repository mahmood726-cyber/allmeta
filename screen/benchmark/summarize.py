"""Validate preserved run evidence and regenerate the comparison report."""
from pathlib import Path
import csv
import hashlib
import json
import statistics

from run import metrics

ROOT = Path(__file__).resolve().parent


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    evidence_path = ROOT / 'evidence.json'
    if evidence_path.exists():
        prior = json.loads(evidence_path.read_text(encoding='utf-8'))
        for filename, digest in prior['source_code_sha256'].items():
            assert sha(ROOT / filename) == digest, 'Evidence code/source changed; rerun and review the benchmark before replacing provenance: ' + filename
        for item in prior['validated_runs']:
            assert sha(ROOT / item['path']) == item['sha256'], 'Saved benchmark run changed: ' + item['path']
    sources = json.loads((ROOT / 'sources.json').read_text(encoding='utf-8'))
    summary = json.loads((ROOT / 'results/summary.json').read_text(encoding='utf-8'))
    checked = []
    rows = []
    for source in sources['datasets']:
        source_path = ROOT / source['file']
        assert sha(source_path) == source['sha256']
        with source_path.open(encoding='utf-8-sig', newline='') as handle:
            raw = list(csv.DictReader(handle))
        gold = [int(r['label_included']) for r in raw]
        assert len(raw) == source['rows']
        for engine in ['allmeta-lr', 'asreview-u4']:
            runs = []
            for seed in [101, 202, 303]:
                name = f"{source['dataset_id']}-{seed}-{engine}.json"
                path = ROOT / 'results' / name
                run = json.loads(path.read_text(encoding='utf-8'))
                assert sorted(run['order']) == list(range(len(raw)))
                assert run['metrics'] == metrics(run['order'], gold)
                assert run['source_sha256'] == source['sha256']
                matching = [x for x in summary['results'] if x['dataset'] == run['dataset'] and x['engine'] == run['engine'] and x['seed'] == seed]
                assert len(matching) == 1 and matching[0]['metrics'] == run['metrics']
                runs.append(run)
                checked.append({'path': str(path.relative_to(ROOT)).replace('\\', '/'), 'sha256': sha(path)})
            repeat_path = ROOT / 'repeatability' / f"{source['dataset_id']}-101-{engine}.json"
            repeat = json.loads(repeat_path.read_text(encoding='utf-8'))
            assert repeat['order'] == runs[0]['order']
            assert repeat['metrics'] == runs[0]['metrics']
            assert repeat['config'] == runs[0]['config']
            checked.append({'path': str(repeat_path.relative_to(ROOT)).replace('\\', '/'), 'sha256': sha(repeat_path), 'identical_order_to_seed_101': True})
            wss = [r['metrics']['wss95'] * 100 for r in runs]
            saved = statistics.mean(r['metrics']['workload_saved_at_95'] * 100 for r in runs)
            recall20 = statistics.mean(r['metrics']['recall_at_20pct'] * 100 for r in runs)
            missed20 = [r['metrics']['missed_at_20pct'] for r in runs]
            rows.append(f"| {source['dataset_id']} ({len(raw):,}; {sum(gold)} eligible) | {runs[0]['engine']} | {statistics.mean(wss):.2f}% ({min(wss):.2f}–{max(wss):.2f}) | {saved:.2f}% | {runs[0]['metrics']['recall_at_95']*100:.2f}% / {runs[0]['metrics']['missed_at_95']} | {recall20:.2f}% / {min(missed20)}–{max(missed20)} |")
    code = ['../hybrid-core.js', 'run_js.cjs', 'run.py', 'requirements.txt', 'sources.json', 'PROTOCOL.md']
    evidence = {'schema': 1, 'source_code_sha256': {p: sha(ROOT / p) for p in code}, 'validated_runs': checked,
                'repeatability': 'Seed 101 exact full-order, metrics and config equality for both engines on both datasets.',
                'environment': {k: summary[k] for k in ['python', 'node', 'asreview', 'platform']}}
    (ROOT / 'evidence.json').write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
    report = '''# Direct comparison: AllMeta local LR and ASReview

The new browser-local lexical ranker did **not** outperform ASReview ELAS u4 on these two public review datasets. ASReview achieved higher WSS@95 on every matched seed. This is a narrow retrospective comparison, not evidence of global superiority or feature parity.

Three prespecified seeds (101, 202, 303), full datasets, matched two-positive/two-negative oracle starting labels, batch size 10, title/abstract only. Starting labels count toward workload, but the effort to find those oracle seeds is not measured. The semantic option and protocol rules are off in this primary comparison. Seed ranges are descriptive, not confidence intervals or independent-review uncertainty estimates.

| Dataset (records; reference positives) | Engine | Mean WSS@95 (seed range) | Mean workload saved at 95% | Achieved recall / missed at 95% | Mean recall at 20% workload / missed range |
|---|---|---|---|---|---|
''' + '\n'.join(rows) + '''

WSS@95 subtracts the 5% workload achievable by random ordering at a 95% target: `0.95 − screened/N`. Workload saved is `1 − screened/N`. The achieved recall can exceed 95% because eligible counts are integers. “Missed” means eligible reference records remaining at that retrospective point, not records automatically excluded by the application. Gold labels are used only when a selected record is revealed, and by the retrospective metric calculation.

## Evidence and limitations

- [Protocol](PROTOCOL.md), [source manifest](sources.json), [raw primary runs](results/summary.json), [repeated runs](repeatability/summary.json), and [code/data evidence hashes](evidence.json) preserve all configurations and complete screening orders. The shipped `hybrid-core.js` is called directly; the comparator uses installed ASReview 3.0.8, not a proxy implementation. Each seed is reported, with no outcome-based tuning.
- Repeating seed 101 reproduced the **entire screening order, metrics and model configuration exactly** for both engines on both datasets. This demonstrates same-environment repeatability, not identical floating-point behavior on every browser or machine.
- The Wilson CSV contains 29 eligible labels; its paper reports 26 reports (23 studies). This unresolved source difference is retained and disclosed, not “corrected.” The review had duplicate independent full-text screening, but not duplicate screening of every title/abstract. Kwok documents independent title/abstract review; neither dataset exposes a complete per-record adjudication log. These are public reference labels, not newly independently re-adjudicated gold standards.
- ASReview u4 was optimized on SYNERGY data. These datasets are not unseen domains for that comparator. Two review topics and three seeds are insufficient for general efficacy claims.
- Runtime seconds are preserved in each raw run. They are end-to-end algorithm wall time on an interactive machine, with other work and pauses during some runs. The repeated runs show substantial timing variation. AllMeta benchmark vectorization is reused between batches, whereas the UI currently rebuilds it. These timings are **not a controlled screening-speed comparison**, human reading time, usability evidence, or a browser throughput limit.
- MiniLM was tested with real WASM inference, semantic-relatedness fixtures, persistent vector reuse and offline fusion. Its incremental screening effectiveness is **unmeasured** here. Hardware WebGPU execution, multilingual accuracy and PICO extraction accuracy are also unvalidated.
- **Rayyan comparison, human screening speed and reviewer usability: unavailable.** No paid workspace, independent timed reviewers or fresh adjudication study was supplied. Documentation comparison is in [the workflow review](../UPGRADE-2026-10-18.md); it must not be substituted for measured comparative performance.

## Reproduce

Install the Python versions in `requirements.txt` and Node.js. From the repository root:

```text
python screen/benchmark/run.py
python screen/benchmark/run.py --seeds 101 --output screen/benchmark/repeatability
python screen/benchmark/summarize.py
```

The last command checks original CSV hashes, complete record permutations, independently recomputes metrics, verifies repeated orders/configuration, and regenerates this report. The first two commands can take many minutes. Model and dataset downloads are not part of the measured runs; both datasets are included with source attribution and their recorded CC-BY licenses.
'''
    (ROOT / 'README.md').write_text(report, encoding='utf-8')
    print('\n'.join(rows))
    print('Verified 12 primary runs and 4 exact-order repeats.')


if __name__ == '__main__':
    main()
