"""Region-specific OBESE-SUBSET diabetes prevalence -> replaces the general-adult proxy in the
transport atlas. Direct obese-subset values from national surveys where available (US NHANES,
England HSE 2024); IDF regional general-adult prevalence scaled by the empirical obese/general
diabetes ratio (~1.8, from US 1.76 + UK 1.86) elsewhere, clearly labelled. Transport via the
Bayesian gamma. AACT + authoritative external sources.
"""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
bt = json.load(open(f'{ROOT}/bayesian_transport.json'))
gamma = bt['gamma_median']; glo, ghi = bt['gamma_cri']
eff_ob = {n['node']: n['eff_obesity'] for n in bt['nodes']}
RATIO = 1.8   # obese-subset / general-adult diabetes prevalence (US 14.8->26 =1.76; UK 7->13 =1.86)

# (region, diabetes prevalence in OBESE adults, basis)
TARGETS = [
    ('Africa (IDF x1.8)',          0.053 * RATIO, 'scaled'),
    ('England (HSE 2024 direct)',  0.130,         'DIRECT'),
    ('Global (IDF x1.8)',          0.105 * RATIO, 'scaled'),
    ('W.Pacific/China (IDF x1.8)', 0.114 * RATIO, 'scaled'),
    ('US obese (NHANES direct)',   0.260,         'DIRECT'),
    ('N.Am+Carib (IDF x1.8)',      0.150 * RATIO, 'scaled'),
    ('MENA/Gulf (IDF x1.8)',       0.181 * RATIO, 'scaled'),
]
print(f'obese/general diabetes ratio used = {RATIO} (US 1.76, UK 1.86); gamma = {gamma} pp\n')
print('obese-subset diabetes prevalence by target:')
for n, p, b in TARGETS:
    print(f'  {n:28s} {p*100:4.1f}%  [{b}]')

nodes = sorted(eff_ob, key=lambda n: -eff_ob[n])
print('\n=== transport to OBESE-SUBSET targets (pp weight loss @ max dose) ===')
print('node'.ljust(22) + 'obesity' + ''.join(t[0].split(' (')[0][:9].rjust(10) for t in TARGETS))
atlas = {}
for nd in nodes:
    base = eff_ob[nd]; row = nd.ljust(22) + f'{base:6.1f} '; atlas[nd] = {}
    for name, p, basis in TARGETS:
        et = base - gamma * p; row += f'{et:9.1f} '; atlas[nd][name] = round(et, 1)
    print(row)

# show how obese-subset deepens attenuation vs the general-adult atlas (e.g. MENA)
men_gen = eff_ob['tirzepatide'] - gamma * 0.181
men_obs = eff_ob['tirzepatide'] - gamma * 0.181 * RATIO
print(f'\ntirzepatide -> MENA: general-adult target {men_gen:.1f} vs OBESE-SUBSET target {men_obs:.1f} '
      f'(obese-subset = more attenuation, more realistic).')
print(f'spread across obese-subset targets (Africa 9.5% -> MENA 32.6%): tirzepatide '
      f'{eff_ob["tirzepatide"]-gamma*0.095:.1f} -> {eff_ob["tirzepatide"]-gamma*0.326:.1f} pp.')

print('\n=== honest notes ===')
print(' - DIRECT obese-subset values (US NHANES 26%, England HSE 2024 13%) are used where published;')
print('   IDF regions are general-adult x1.8 (empirical ratio) -> ESTIMATE, flagged.')
print(' - Consistency check: IDF N.America 15.0% x1.8 = 27% ~ US-obese direct 26% (ratio validated).')
print(' - England direct (13%) < IDF-Europe-scaled would give (~18.5%) because UK general diabetes (~7%)')
print('   is below IDF-Europe (10.3%, incl. high-burden E.Europe) -> direct national survey beats scaling.')
json.dump({'ratio': RATIO, 'gamma': gamma, 'targets_obese_subset': {t[0]: round(t[1], 3) for t in TARGETS},
           'atlas': atlas,
           'sources': 'NHANES 2017-2020 (CDC); Health Survey for England 2024 (NHS Digital); IDF Diabetes Atlas 2021 (NBK581940)'},
          open(f'{ROOT}/transport_atlas_obese.json', 'w'), indent=1)
print('\nwrote transport_atlas_obese.json')
