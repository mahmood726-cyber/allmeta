"""Item 4: ethnicity-specific transport — replaces the global 1.8 obese/general scalar with EMPIRICAL
NHANES obese-subset diabetes prevalence BY ETHNICITY (RIDRETH3). Models the ethnicity-varying obesity-
diabetes association that fix3 could only flag. Transport via the Bayesian gamma. AACT + NHANES microdata.
"""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
nh = json.load(open(f'{ROOT}/nhanes_target.json'))
bt = json.load(open(f'{ROOT}/bayesian_transport.json'))
gamma = bt['gamma_median']
eff_ob = {n['node']: n['eff_obesity'] for n in bt['nodes']}
eth = nh['diabetes_by_ethnicity_pct']

# map NHANES ethnicity -> the atlas region it best anchors empirically
ETH_REGION = {'NHAsian': 'Western-Pacific/China (NHANES Asian-obese)',
              'NHWhite': 'US/Europe White (NHANES)', 'NHBlack': 'US Black (NHANES)',
              'MexicanAmerican': 'Latin America proxy (NHANES Mexican-American)',
              'OtherHispanic': 'Hispanic (NHANES)'}
print(f'gamma = {gamma} pp. Ethnicity-specific OBESE-subset diabetes prevalence (NHANES, empirical):')
for e, p in sorted(eth.items(), key=lambda kv: kv[1]):
    print(f'  {e:16s} {p:4.1f}%  -> {ETH_REGION.get(e,e)}')

print('\n=== ethnicity-specific transported effect (tirzepatide & semaglutide-sc-weekly) ===')
out = {}
for nd in ['tirzepatide', 'semaglutide-sc-weekly']:
    base = eff_ob[nd]; out[nd] = {}
    row = f'{nd:22s} obesity {base:.1f}: '
    for e, p in sorted(eth.items(), key=lambda kv: kv[1]):
        et = base - gamma * (p / 100); out[nd][e] = round(et, 1)
        row += f'{e[:7]}={et:.1f} '
    print(row)

print('\n=== honest note ===')
print(' - This MODELS the ethnicity-varying obesity-diabetes association (Item 4) with empirical NHANES')
print('   obese-subset prevalences, replacing the single 1.8 obese/general scalar (workstream_obese_subset).')
print(' - NHANES ethnicity strata are US-resident; using NHAsian-obese diabetes for a China/W-Pacific target')
print('   is a proxy (US-resident Asian-Americans, not mainland) - better than a global scalar, still flagged.')
print(' - Within the US, the transported effect varies by ethnicity through the obese-diabetes prevalence.')

json.dump({'gamma': gamma, 'diabetes_by_ethnicity_pct': eth, 'ethnicity_region_map': ETH_REGION,
           'transported': out}, open(f'{ROOT}/ethnicity_atlas.json', 'w'), indent=1)
print('\nwrote ethnicity_atlas.json')
