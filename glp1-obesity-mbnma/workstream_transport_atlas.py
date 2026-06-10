"""Multi-target transport ATLAS — transport the dose-response effects to several authoritative
real-world target populations (not just NHANES). Uses the Bayesian NMR diabetes modifier gamma:
  eff_target(node, region) = eff_obesity(node) - gamma * P_diabetes(region).
Target diabetes-prevalence from IDF Diabetes Atlas 2021 (regional, general-adult) + NHANES (US obese).
Honest: IDF figures are GENERAL-adult (obese-subset is higher), so those targets slightly OVERSTATE
weight loss for the obese population; the US-obese (NHANES 26%) is the properly population-matched anchor.
"""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
bt = json.load(open(f'{ROOT}/bayesian_transport.json'))
gamma = bt['gamma_median']; glo, ghi = bt['gamma_cri']
eff_ob = {n['node']: n['eff_obesity'] for n in bt['nodes']}

# authoritative target diabetes prevalence (fraction) + source + population basis
TARGETS = [
    ('Africa (IDF)',                 0.053, 'general-adult'),
    ('Europe (IDF)',                 0.103, 'general-adult'),
    ('Global (IDF)',                 0.105, 'general-adult'),
    ('Western Pacific (IDF)',        0.114, 'general-adult'),
    ('N.America+Caribbean (IDF)',    0.150, 'general-adult'),
    ('MENA/Gulf (IDF)',              0.181, 'general-adult'),
    ('US obese adults (NHANES)',     0.260, 'OBESE-subset (matched)'),
]

print(f'Bayesian diabetes modifier gamma = {gamma} pp (95% CrI {glo}-{ghi}); eff_target = eff_obesity - gamma*P_diabetes\n')
nodes = sorted(eff_ob, key=lambda n: -eff_ob[n])
hdr = 'node'.ljust(22) + 'obesity ' + ''.join(t[0].split(' (')[0][:9].rjust(10) for t in TARGETS)
print(hdr)
atlas = {}
for nd in nodes:
    base = eff_ob[nd]
    row = nd.ljust(22) + f'{base:6.1f} '
    atlas[nd] = {}
    for name, p, basis in TARGETS:
        et = base - gamma * p
        row += f'{et:9.1f} '
        atlas[nd][name] = round(et, 1)
    print(row)

# uncertainty band for a representative node (tirzepatide) at the matched US-obese target
nd = 'tirzepatide'
if nd in eff_ob:
    b = eff_ob[nd]; p = 0.26
    lo = b - ghi * p; hi = b - glo * p
    print(f'\n{nd} transported to US-obese (26% diabetes): {b-gamma*p:.1f} pp '
          f'(gamma-uncertainty band {lo:.1f}-{hi:.1f}); obesity-population {b:.1f}.')

print('\n=== reading the atlas ===')
print(f' - Effect varies by target population diabetes burden: lowest-diabetes (Africa 5.3%) ->')
print(f'   highest weight loss; highest-diabetes (US-obese 26%, MENA 18%) -> most attenuation.')
print(f' - Range across targets is modest (~{gamma*0.26:.1f} pp for the obesity->US-obese span), because')
print(f'   gamma is moderate and diabetes prevalence spans ~5-26%.')
print(' - HONEST CAVEAT: IDF regional figures are GENERAL-adult diabetes prevalence; the obese-eligible')
print('   subpopulation has higher diabetes (US: 14.8% general -> 26% obese), so the IDF-region targets')
print('   slightly OVERSTATE weight loss for the obese population. US-obese (NHANES) is the matched anchor;')
print('   region-specific obese-subset prevalences would lower those transported effects further.')

json.dump({'gamma': gamma, 'gamma_cri': [glo, ghi], 'targets': {t[0]: t[1] for t in TARGETS},
           'atlas': atlas, 'sources': 'IDF Diabetes Atlas 2021 (NBK581940); NHANES 2017-2020 (CDC)'},
          open(f'{ROOT}/transport_atlas.json', 'w'), indent=1)
print('\nwrote transport_atlas.json')
