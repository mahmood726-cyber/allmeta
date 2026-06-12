"""Discover the full obesity weight-loss cohort for the post-2010 incretin agents.
Finds interventional trials that (a) test one of the agents (INN or code-name alias)
and (b) post a '% change body weight' MEAN/LS-MEAN outcome with results.
Outputs candidates.csv (nct, agents, n_weight_outcomes, phase, start_date).
"""
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pandas as pd
from aact_kit import load_table, location_from_path

LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')
ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'

# post-2010 incretin agents (GLP-1 / GIP / glucagon / amylin) — INN + development code names
AGENT_ALIASES = {
    'semaglutide':  ['semaglutide', 'nn9535', 'nnc0113-0217'],
    'tirzepatide':  ['tirzepatide', 'ly3298176'],
    'retatrutide':  ['retatrutide', 'ly3437943'],
    'orforglipron': ['orforglipron', 'ly3502970', 'owl833', 'owl-833'],
    'survodutide':  ['survodutide', 'bi 456906', 'bi456906'],
    'mazdutide':    ['mazdutide', 'ibi362', 'ly3305677'],
    'cagrilintide': ['cagrilintide', 'am833', 'nnc0174-0833'],
    'maridebart':   ['maridebart', 'amg133', 'amg 133', 'amg-133', 'maritide'],
    'pemvidutide':  ['pemvidutide', 'alt-801', 'alt801'],
    'danuglipron':  ['danuglipron', 'pf-06882961', 'pf06882961'],
    'ecnoglutide':  ['ecnoglutide', 'xw003'],
}
ALIAS2AGENT = {a: g for g, al in AGENT_ALIASES.items() for a in al}
ALL_ALIASES = list(ALIAS2AGENT)


def main():
    print('loading interventions/studies/outcomes...', flush=True)
    iv = load_table('interventions', location=LOC, columns=['nct_id', 'name'])
    iv['nl'] = iv['name'].str.lower().fillna('')
    # map each trial to the set of agents it tests
    nct_agents = {}
    for alias, agent in ALIAS2AGENT.items():
        hit = iv[iv['nl'].str.contains(alias, na=False, regex=False)]['nct_id'].unique()
        for n in hit:
            nct_agents.setdefault(n, set()).add(agent)
    agent_ncts = set(nct_agents)
    print(f'trials testing >=1 target agent: {len(agent_ncts)}', flush=True)

    studies = load_table('studies', location=LOC,
                         columns=['nct_id', 'study_type', 'phase', 'start_date', 'overall_status'])
    inter = set(studies[studies['study_type'] == 'INTERVENTIONAL']['nct_id'])

    out = load_table('outcomes', location=LOC, columns=['nct_id', 'title', 'param_type', 'units'])
    out = out[out['nct_id'].isin(agent_ncts)].copy()
    out['tl'] = out['title'].str.lower().fillna('')
    out['ul'] = out['units'].str.lower().fillna('')
    wt = out[out['tl'].str.contains('weight', na=False)
             & (out['tl'].str.contains('percent|percentage|%', na=False, regex=True)
                | out['ul'].str.contains('percent', na=False))
             & ~out['tl'].str.contains('pooled|achieve|participants who|>=|≥|category|proportion', na=False, regex=True)
             & out['param_type'].isin(['MEAN', 'LEAST_SQUARES_MEAN'])]
    wt_ncts = set(wt['nct_id'])

    rows = []
    for n in sorted(agent_ncts & inter & wt_ncts):
        st = studies[studies['nct_id'] == n].iloc[0]
        rows.append({
            'nct': n, 'agents': ','.join(sorted(nct_agents[n])),
            'n_weight_outcomes': int((wt['nct_id'] == n).sum()),
            'phase': st['phase'], 'start_date': st['start_date'], 'status': st['overall_status'],
        })
    cand = pd.DataFrame(rows)
    cand.to_csv(f'{ROOT}/candidates.csv', index=False)
    print(f'\n=== candidate trials (interventional, target agent, posted % weight outcome): {len(cand)} ===', flush=True)
    print(cand.to_string(index=False))
    print('\nagent coverage:')
    ac = {}
    for a in cand['agents']:
        for x in a.split(','):
            ac[x] = ac.get(x, 0) + 1
    for a, c in sorted(ac.items(), key=lambda kv: -kv[1]):
        print(f'  {a:13s} {c}')


if __name__ == '__main__':
    main()
