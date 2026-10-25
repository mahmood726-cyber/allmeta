"""Re-export exact package records from the pinned, public CRAN R data blobs.

No R results are stored here. pyreadr only decodes R serialization; all
method-specific transformations happen in alm-examples.js and are checked in R.
"""
import base64
import csv
import hashlib
import io
import json
import math
import sys
from pathlib import Path

import pyreadr

ROOT = Path(__file__).resolve().parent


def source_bytes(source):
    raw = base64.b64decode(source['content'])
    blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    if blob != source['sha']:
        raise ValueError('Source blob identity mismatch: ' + source['dataset'])
    return raw


def decode(source):
    raw = source_bytes(source)
    # Stay within this task's writable tree, not a machine-specific temp root.
    path = ROOT / (source['dataset'] + '.source.rda')
    try:
        path.write_bytes(raw)
        frame = pyreadr.read_r(str(path))[source['dataset']]
    finally:
        if path.exists():
            path.unlink()
    records = [{key: None if isinstance(value, float) and math.isnan(value) else value
                for key, value in row.items()} for row in frame.to_dict(orient='records')]
    return records, frame


CITATIONS = {
    'Baker2009': 'Baker WL, Baker EL, Coleman CI (2009). Pharmacologic Treatments for Chronic Obstructive Pulmonary Disease: A Mixed-Treatment Comparison Meta-analysis. Pharmacotherapy 29:891–905.',
    'dat.bcg': 'Colditz GA et al. (1994). Efficacy of BCG vaccine in the prevention of tuberculosis: meta-analysis of the published literature. JAMA 271:698–702. doi:10.1001/jama.1994.03510330076038.',
    'dat.konstantopoulos2011': 'Konstantopoulos S (2011). Fixed effects and variance components estimation in three-level meta-analysis. Research Synthesis Methods 2:61–76. doi:10.1002/jrsm.35. Original review: Cooper et al. (2003), Review of Educational Research 73:1–52.',
    'dat.molloy2014': "Molloy GJ, O’Carroll RE, Ferguson E (2014). Conscientiousness and medication adherence: a meta-analysis. Annals of Behavioral Medicine 47:92–101. doi:10.1007/s12160-013-9524-4.",
    'smokingcessation': 'Dias S, Welton NJ, Sutton AJ, Caldwell DM, Lu G, Ades AE (2013). Evidence Synthesis for Decision Making 4: Inconsistency in networks of evidence based on randomized controlled trials. Medical Decision Making 33:641–656.',
    'AuditC': 'Kriston L, Hölzel L, Weiser A, Berner M, Haerter M (2008). Meta-analysis: Are 3 Questions Enough to Detect Unhealthy Alcohol Use? Annals of Internal Medicine 149:879–888.'
}
APPS = [
    (3, 'dta-sroc', 'AuditC', '#f-data'), (4, 'nma', 'smokingcessation', '#f-data'),
    (5, 'heterogeneity', 'dat.bcg', '#f-data'), (6, 'pubbias-tests', 'dat.bcg', '#src'),
    (7, 'multilevel-ma', 'dat.konstantopoulos2011', '#src'), (8, 'meta-regression', 'dat.bcg', '#f-data'),
    (9, 'proportion-ma', 'dat.bcg', '#src'), (10, 'mh-peto', 'dat.bcg', '#src'),
    (11, 'influence', 'dat.bcg', '#src'), (12, 'limit-ma', 'dat.bcg', '#src'),
    (13, 'gosh', 'dat.bcg', '#src'), (14, 'cumulative-subgroup', 'dat.bcg', '#f-data'),
    (15, 'rve-meta', 'dat.konstantopoulos2011', '#src'),
    (16, 'nma-inconsistency', 'smokingcessation', '#src'),
    (17, 'correlation-ma', 'dat.molloy2014', '#f-data'),
    (19, 'component-nma', 'Baker2009', '#src')
]
VERSIONS = {'metadat': '1.6-0', 'mada': '0.5.12', 'netmeta': '3.7-0'}


def source_files(sources, check=False):
    """Expose the same pinned R objects to base R, without JSON or library drift."""
    folder = ROOT / 'source-data'
    rows = []
    used = {entry[2] for entry in APPS}
    for name, source in sorted(sources.items()):
        if name not in used:
            continue
        raw = source_bytes(source)
        package = source['source_package']
        version = VERSIONS[package]
        relative = f'{package}/{version}/{name}.rda'
        path = folder / relative
        if check:
            if path.read_bytes() != raw:
                raise ValueError('Pinned R source differs: ' + name)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(raw)
        rows.append([package, version, name, source['sha'], relative,
                     hashlib.md5(raw).hexdigest()])
    stream = io.StringIO(newline='')
    writer = csv.writer(stream, lineterminator='\n')
    writer.writerow(['source_package', 'version', 'dataset', 'source_blob', 'file', 'md5'])
    writer.writerows(rows)
    index = folder / 'index.csv'
    if check:
        if index.read_text(encoding='utf-8') != stream.getvalue():
            raise ValueError('Pinned R source index differs')
    else:
        index.write_text(stream.getvalue(), encoding='utf-8')


NOTES = {
    'proportion-ma': 'Control-arm TB case proportions across different populations and follow-up durations; descriptive demonstration, not a common-time incidence rate or vaccine effect.',
    'meta-regression': 'Log risk ratio on absolute latitude in degrees; ecological moderator analysis.',
    'cumulative-subgroup': 'Log risk ratio; chronological order uses the source publication year; subgroup is the source allocation method.',
    'nma': 'Independent two-arm subset only. Entire three-arm trials are excluded, never split into independent observations. Log odds ratios for successful cessation; higher is better.',
    'nma-inconsistency': 'Independent two-arm subset only. Entire three-arm trials are excluded. Log odds ratios for successful cessation.',
    'component-nma': 'Independent two-arm subset of Baker2009; entire multi-arm trials excluded. Placebo is renamed control; drug components and Fluticasone+Salmeterol are the source package treatment names. Log odds ratios for COPD exacerbation (lower is better). Additivity is a model assumption, not a finding of the source review.',
    'rve-meta': 'CORR robust variance model clustered by district, intercept only, rho=0.8; a sensitivity assumption, not a measured within-district correlation.',
    'multilevel-ma': 'Schools nested within districts; sampling variances retained exactly and converted to SE only at the app input boundary.',
    'dta-sroc': 'The package supplies 14 count rows without study names; labels are package row numbers, not invented study identifiers.',
    'correlation-ma': 'All 16 source correlations and sample sizes, without rounding or changing signs.'
}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')


if __name__ == '__main__':
    sources = {s['dataset']: s for s in json.loads((ROOT / 'sources.json').read_text(encoding='utf-8'))}
    source_files(sources, check='--check' in sys.argv)
    if '--source-files-only' in sys.argv:
        print('Pinned R source files exported; existing datasets unchanged')
        sys.exit(0)
    decoded = {name: decode(source)[0] for name, source in sources.items()}
    manifest = []
    for paper, app, dataset, input_selector in APPS:
        source = sources[dataset]
        pkg = source['source_package']
        payload = dict(source_package=pkg, version=VERSIONS[pkg], dataset=dataset,
                       citation=CITATIONS[dataset],
                       licence='Data values are facts; cite the source paper and the R package. Package licence: ' + ('GPL-2' if pkg == 'mada' else 'GPL (>= 2)') + '.',
                       source_url=source['display_url'], source_blob=source['sha'],
                       columns=list(decoded[dataset][0]),
                       values=decoded[dataset],
                       notes=NOTES.get(app, 'BCG trial counts transformed to log risk ratios and standard errors without decimal rounding.'),
                       source_documentation=('https://wviechtb.github.io/metadat/reference/' + dataset + '.html' if pkg == 'metadat' else
                                             'https://github.com/cran/' + pkg + '/blob/master/man/' + ('mada-data' if pkg == 'mada' else dataset) + '.Rd'))
        destination = ROOT / app / (dataset + '.json')
        if '--check' in sys.argv:
            if json.loads(destination.read_text(encoding='utf-8')) != payload:
                raise ValueError('Source/provenance mismatch: ' + app)
        else:
            write_json(destination, payload)
        manifest.append(dict(paper=paper, app=app, dataset=dataset, input=input_selector))
        print(app, dataset, len(payload['values']), 'source records')
    if '--check' in sys.argv:
        if json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8')) != manifest:
            raise ValueError('Manifest mismatch')
        print('SOURCE_CHECK_PASS')
    else:
        write_json(ROOT / 'manifest.json', manifest)
