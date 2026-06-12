"""Workstream A: registry-native vs literature-visible DELTA + reporting-bias (ROB-ME style).
Quantifies what a literature-only meta (which cannot see results-posted-but-unpublished trials)
misses, and whether ghost trials show systematically smaller effects.
Data: AACT arm-level (arms_full.csv) + PubMed-confirmed ghost list. PubMed-abstracts-only respected.
"""
import io, sys, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
GHOSTS = {'NCT04779697', 'NCT04969939', 'NCT05093205', 'NCT05144984', 'NCT05579249', 'NCT06041217'}
arms = pd.read_csv(f'{ROOT}/arms_full.csv')


def wk(t):
    m = re.findall(r'week\s*(\d+)', str(t).lower()); return max(int(x) for x in m) if m else -1
arms['wk'] = arms['timepoint'].map(wk)
arms['ghost'] = arms['nct'].isin(GHOSTS)


def contrasts(df, min_week):
    rows = []
    for nct, g in df.groupby('nct'):
        pl = g[g.agent == 'placebo']
        if pl.empty:
            continue
        pm, pv = pl['mean_pct'].iloc[0], pl['var_of_mean'].iloc[0]
        if pd.isna(pv):
            continue
        for _, r in g[g.agent != 'placebo'].iterrows():
            if pd.isna(r['var_of_mean']) or (r['wk'] >= 0 and r['wk'] < min_week):
                continue
            rows.append({'nct': nct, 'agent': r['agent'], 'dose': r['dose_mg'],
                         'loss': pm - r['mean_pct'], 'var': r['var_of_mean'] + pv,
                         'ghost': nct in GHOSTS})
    return pd.DataFrame(rows)


def ivw(d):
    w = 1 / d['var'].values
    return float(np.sum(d['loss'] * w) / np.sum(w)), float(np.sqrt(1 / np.sum(w)))


print('=== ghost contribution to the analysis cohort ===')
in_arms = sorted(GHOSTS & set(arms.nct))
print(f'6 PubMed-confirmed ghosts; {len(in_arms)} have extracted arms: {in_arms}')
gpl = [n for n in in_arms if (arms[arms.nct == n].agent == 'placebo').any()]
print(f'ghosts with a placebo arm (analysable as a contrast): {gpl}')

# Reporting-bias check: semaglutide 2.4mg weekly, ghost vs published (the node where ghosts cluster)
sem = arms[(arms.agent == 'semaglutide') & (np.abs(arms.dose_mg - 2.4) < 1e-6)].copy()
# build per-trial placebo contrast for sema 2.4 where a placebo exists in-trial
def sem_contrasts(df):
    out = []
    for nct, g in df.groupby('nct'):
        pls = arms[(arms.nct == nct) & (arms.agent == 'placebo')]
        a = g[(g.agent == 'semaglutide') & (np.abs(g.dose_mg - 2.4) < 1e-6)]
        if pls.empty or a.empty or pd.isna(pls['var_of_mean'].iloc[0]) or pd.isna(a['var_of_mean'].iloc[0]):
            continue
        out.append({'nct': nct, 'loss': pls['mean_pct'].iloc[0] - a['mean_pct'].iloc[0],
                    'var': a['var_of_mean'].iloc[0] + pls['var_of_mean'].iloc[0], 'ghost': nct in GHOSTS})
    return pd.DataFrame(out)
sc = sem_contrasts(arms)
print('\n=== reporting-bias probe: semaglutide 2.4 mg vs placebo, ghost vs published ===')
print(sc.to_string(index=False))
if (sc.ghost).any() and (~sc.ghost).any():
    gm, gse = ivw(sc[sc.ghost]); pm, pse = ivw(sc[~sc.ghost])
    print(f'published sema-2.4 pooled loss: {pm:.1f}pp (SE {pse:.2f}, k={int((~sc.ghost).sum())})')
    print(f'GHOST     sema-2.4 pooled loss: {gm:.1f}pp (SE {gse:.2f}, k={int((sc.ghost).sum())})')
    print(f'ghost-vs-published difference: {gm-pm:+.1f}pp  '
          f'({"ghosts SMALLER (reporting-bias direction)" if gm < pm else "ghosts not smaller"})')

# Delta on the network: ranking WITH vs WITHOUT ghosts (primary >=36wk + all-timepoint)
for mw, lbl in [(36, 'PRIMARY >=36wk'), (0, 'all-timepoint')]:
    call = contrasts(arms, mw); cpub = contrasts(arms[~arms.ghost], mw)
    def node_eff(c):
        c = c.copy()
        c['node'] = np.where((c.agent == 'semaglutide') & (c.dose >= 3), 'semaglutide-oral',
                    np.where(c.agent == 'semaglutide', 'semaglutide-sc', c.agent))
        res = {}
        for nd, g in c.groupby('node'):
            md = g.dose.max(); top = g[g.dose == md]; res[nd] = ivw(top)[0]
        return res
    ea, ep = node_eff(call), node_eff(cpub)
    shared = sorted(set(ea) & set(ep))
    print(f'\n=== network delta ({lbl}): node effect WITH vs WITHOUT ghosts ===')
    print(f'{"node":24s} with-ghost  pub-only   delta')
    for nd in shared:
        print(f'{nd:24s} {ea[nd]:8.1f}   {ep[nd]:8.1f}   {ea[nd]-ep[nd]:+.2f}')
    only = set(ea) - set(ep)
    if only:
        print(f'nodes present only WITH ghosts: {sorted(only)}')

json.dump({'ghosts_confirmed': sorted(GHOSTS), 'ghosts_with_arms': in_arms,
           'ghosts_analysable': gpl}, open(f'{ROOT}/ghost_delta.json', 'w'), indent=1)
print('\nwrote ghost_delta.json')
