"""RA per-trial ACR-responder harvest for the RapidMeta conversion -- thin wrapper over the shared, audited
binary-responder harvester (rm_harvest_binary.py). All correctness logic (timepoint-aware, unit-aware, arm-clean,
fail-closed plausibility, reconciling funnel) lives in the shared module so RA and psoriasis cannot drift.
Registry-native (AACT); no IPD."""
import io, sys, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma')
from rm_harvest_binary import harvest_binary_responder
from aact_kit import location_from_path

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class6_ra'
LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')
DRUGS = ['adalimumab', 'etanercept', 'infliximab', 'golimumab', 'certolizumab', 'tocilizumab', 'sarilumab',
         'tofacitinib', 'baricitinib', 'upadacitinib', 'abatacept', 'rituximab']
CLASS = {'adalimumab': 'TNF', 'etanercept': 'TNF', 'infliximab': 'TNF', 'golimumab': 'TNF', 'certolizumab': 'TNF',
         'tocilizumab': 'IL-6', 'sarilumab': 'IL-6', 'tofacitinib': 'JAK', 'baricitinib': 'JAK',
         'upadacitinib': 'JAK', 'abatacept': 'T-cell', 'rituximab': 'B-cell'}

out = harvest_binary_responder(LOC, DRUGS, CLASS, r'acr.?(20|50|70)', [50, 20, 70], label='ACR')
json.dump(out, open(f'{HERE}/ra_trials.json', 'w', encoding='utf-8'), indent=1)
s = out['screening']
print(f"RA harvest: {s['search_hits']} search -> {s['acr_reporting']} ACR-reporting -> {s['included']} included "
      f"(reconciles={s['funnel_reconciles']})")
print(f"  excluded: {s['excluded']}")
ex = next((t for t in out['trials'] if t['nct'] == 'NCT00870467'), None)
if ex:
    print(f"  count-bug check NCT00870467: {ex['_agent']} {ex['tE']}/{ex['tN']} vs {ex['cE']}/{ex['cN']} "
          f"({ex['tE']/ex['tN']:.0%} vs {ex['cE']/ex['cN']:.0%})")
print(f"wrote ra_trials.json ({s['included']} trials)")
