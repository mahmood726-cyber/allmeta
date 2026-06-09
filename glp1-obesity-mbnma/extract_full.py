"""Generalized arm-level extractor for the full obesity cohort (candidates.csv).
Fixes the 4 prototype gaps:
  1. code-name aliases -> agent
  2. best-outcome selection: among weight % outcomes, keep the one yielding the MOST
     parseable dose arms (fixes 'only placebo extracted'); ties -> longest follow-up week
  3. estimand dedup: one row per (agent, dose), most precise
  4. schedule: detect weekly/daily -> weekly-equivalent dose
Output: arms_full.csv  {nct, agent, dose_mg, schedule, dose_wk, n, mean_pct, var_of_mean, timepoint}
"""
import io, sys, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np
import pandas as pd
from aact_kit import load_table, location_from_path

LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')
ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'

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
# agents that are ORAL DAILY (others assumed weekly SC unless title says daily/QD)
ORAL_DAILY = {'orforglipron', 'danuglipron'}
NEG = ('not ', 'non', 'never', 'without', 'placebo-to')


def parse_arm(title, desc=''):
    t = (title or '').lower()
    full = (t + ' ' + (desc or '').lower())
    if 'placebo' in t and not any(a in t for a in ALIAS2AGENT):
        return ('placebo', 0.0, 'placebo', 0.0)
    if 'pooled' in t:
        return None
    agent = next((ALIAS2AGENT[a] for a in ALIAS2AGENT if a in t), None)
    if agent is None:
        return None
    m = re.findall(r'(\d+(?:\.\d+)?)\s*mg', t)
    if not m:
        return None
    dose = max(float(x) for x in m)
    # schedule
    if agent in ORAL_DAILY or re.search(r'\bdaily\b|\bqd\b|once a day|once daily|/day|per day', full):
        sched, dose_wk = 'daily', dose * 7
    else:
        sched, dose_wk = 'weekly', dose
    return (agent, dose, sched, dose_wk)


def arms_for_outcome(oid, nct, OM, RG, OC, tf):
    om = OM[(OM['nct_id'] == nct) & (OM['outcome_id'] == oid)]
    rg = RG[(RG['nct_id'] == nct) & (RG['result_type'] == 'Outcome')] \
        .drop_duplicates('ctgov_group_code').set_index('ctgov_group_code')
    oc = OC[(OC['nct_id'] == nct) & (OC['outcome_id'] == oid)]
    ncount = (oc[oc['units'].str.contains('participant', case=False, na=False)]
              .set_index('ctgov_group_code')['count']) if not oc.empty else pd.Series(dtype=float)
    rows = []
    for _, r in om.iterrows():
        code = r['ctgov_group_code']
        title = rg['title'].get(code, '') if code in rg.index else ''
        desc = rg['description'].get(code, '') if code in rg.index else ''
        if any(neg in (title or '').lower() for neg in NEG):
            continue
        arm = parse_arm(title, desc)
        if arm is None:
            continue
        agent, dose, sched, dose_wk = arm
        mean = r.get('param_value_num')
        if pd.isna(mean):
            continue
        dt = (r.get('dispersion_type') or '').lower()
        dv = r.get('dispersion_value_num')
        n = ncount.get(code)
        n = float(n) if pd.notna(n) else None
        if 'error' in dt and pd.notna(dv):
            var = float(dv) ** 2
        elif 'deviation' in dt and pd.notna(dv) and n:
            var = float(dv) ** 2 / n
        else:
            var = None
        rows.append({'nct': nct, 'agent': agent, 'dose_mg': dose, 'schedule': sched,
                     'dose_wk': dose_wk, 'n': n, 'mean_pct': float(mean),
                     'var_of_mean': var, 'timepoint': tf})
    return rows


def week_of(tf):
    w = re.findall(r'week\s*(\d+)', (tf or '').lower())
    return max(int(x) for x in w) if w else -1


def main():
    cand = pd.read_csv(f'{ROOT}/candidates.csv')
    ncts = cand['nct'].tolist()
    print(f'loading AACT tables for {len(ncts)} candidate trials...', flush=True)
    OUT = load_table('outcomes', location=LOC,
                     columns=['id', 'nct_id', 'outcome_type', 'title', 'time_frame', 'param_type', 'units'])
    OUT = OUT[OUT['nct_id'].isin(ncts)].copy()
    OM = load_table('outcome_measurements', location=LOC,
                    columns=['nct_id', 'outcome_id', 'ctgov_group_code', 'param_value_num',
                             'dispersion_type', 'dispersion_value_num'])
    OM = OM[OM['nct_id'].isin(ncts)].copy()
    RG = load_table('result_groups', location=LOC,
                    columns=['nct_id', 'result_type', 'ctgov_group_code', 'title', 'description'])
    RG = RG[RG['nct_id'].isin(ncts)].copy()
    OC = load_table('outcome_counts', location=LOC,
                    columns=['nct_id', 'outcome_id', 'ctgov_group_code', 'units', 'count'])
    OC = OC[OC['nct_id'].isin(ncts)].copy()
    print(f'  outcomes={len(OUT)} om={len(OM)} rg={len(RG)} oc={len(OC)}', flush=True)

    all_rows, summary = [], []
    for nct in ncts:
        out = OUT[OUT['nct_id'] == nct]
        w = out[out['title'].str.contains('weight', case=False, na=False)
                & (out['title'].str.contains('percent|percentage|%', case=False, na=False, regex=True)
                   | out['units'].str.contains('percent', case=False, na=False))
                & ~out['title'].str.contains('pooled|achieve|participants who|>=|≥|category|proportion', case=False, na=False, regex=True)
                & out['param_type'].isin(['MEAN', 'LEAST_SQUARES_MEAN'])]
        if w.empty:
            summary.append((nct, 0, 'no % weight outcome')); continue
        # best-outcome selection: try each, keep the one with most distinct (agent,dose) arms
        best, best_key = [], (-1, -1)
        for _, o in w.iterrows():
            rows = arms_for_outcome(int(o['id']), nct, OM, RG, OC, o['time_frame'])
            ndist = len({(r['agent'], r['dose_mg']) for r in rows})
            key = (ndist, week_of(o['time_frame']))
            if key > best_key:
                best, best_key = rows, key
        # estimand dedup: one row per (agent,dose), most precise
        if best:
            bdf = pd.DataFrame(best)
            bdf = (bdf.sort_values('var_of_mean').drop_duplicates(['agent', 'dose_mg'], keep='first'))
            best = bdf.to_dict('records')
        all_rows.extend(best)
        summary.append((nct, len(best), 'ok' if best else 'no parseable arms'))

    df = pd.DataFrame(all_rows)
    sdf = pd.DataFrame(summary, columns=['nct', 'arms', 'status'])
    print(f"\n=== extraction summary: {len(df)} arms across {df['nct'].nunique() if not df.empty else 0} trials ===", flush=True)
    print(sdf.to_string(index=False))
    if not df.empty:
        df.to_csv(f'{ROOT}/arms_full.csv', index=False)
        non_pl = df[df.agent != 'placebo']
        print(f"\nagents: {sorted(df['agent'].unique())}")
        print('non-placebo arms per agent:')
        print(non_pl.groupby('agent').agg(arms=('dose_mg', 'size'),
              doses=('dose_mg', lambda s: sorted(s.unique())),
              trials=('nct', 'nunique')).to_string())
        print(f"\ntrials with a placebo arm (connectable): "
              f"{df[df.agent=='placebo']['nct'].nunique()}/{df['nct'].nunique()}")
        print('wrote arms_full.csv')


if __name__ == '__main__':
    main()
