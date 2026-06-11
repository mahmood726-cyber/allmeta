"""Psoriasis per-trial PASI-responder harvest for the RapidMeta conversion -- thin wrapper over the shared,
audited binary-responder harvester (rm_harvest_binary.py). Same correctness guarantees as RA. Headline outcome =
PASI-90 (fallback PASI-75/100). Registry-native (AACT); no IPD."""
import io, sys, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma')
from rm_harvest_binary import harvest_binary_responder
from aact_kit import location_from_path

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class4_psoriasis'
LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')
DRUGS = ['secukinumab', 'ixekizumab', 'guselkumab', 'risankizumab', 'ustekinumab', 'brodalumab',
         'bimekizumab', 'tildrakizumab', 'adalimumab', 'etanercept']
CLASS = {'ixekizumab': 'IL-17', 'secukinumab': 'IL-17', 'brodalumab': 'IL-17', 'bimekizumab': 'IL-17/23',
         'risankizumab': 'IL-23', 'guselkumab': 'IL-23', 'tildrakizumab': 'IL-23',
         'ustekinumab': 'IL-12/23', 'adalimumab': 'TNF', 'etanercept': 'TNF'}

out = harvest_binary_responder(LOC, DRUGS, CLASS, r'pasi.?(75|90|100)', [90, 75, 100], label='PASI-')
json.dump(out, open(f'{HERE}/psoriasis_trials.json', 'w', encoding='utf-8'), indent=1)
s = out['screening']
print(f"Psoriasis harvest: {s['search_hits']} search -> {s['acr_reporting']} PASI-reporting -> {s['included']} "
      f"included (reconciles={s['funnel_reconciles']})")
print(f"  excluded: {s['excluded']}")
print(f"  agents: {sorted(set(t['_agent'] for t in out['trials']))}")
if out['trials']:
    t0 = out['trials'][0]
    print(f"  top: {t0['name'][:24]} {t0['_agent']} {t0['tE']}/{t0['tN']} vs {t0['cE']}/{t0['cN']} @{t0['_headline']}")
print(f"wrote psoriasis_trials.json ({s['included']} trials)")
