"""Registry-native vs literature-emulated meta-analysis — the head-to-head DELTA.
Same MBNMA engine, three nested trial sets, to decompose what registry-native sourcing adds:
  S0 REGISTRY-NATIVE  = all extracted trials (incl. ghosts + T2D-secondary-outcome trials)
  S1 minus ghosts     = drop results-posted-but-unpublished -> effect of unpublished evidence
  S2 LITERATURE-EMUL. = drop ghosts AND drop T2D-population trials (weight is secondary there)
                        -> emulates an obesity-weight-loss literature search (cf. Xie 2024)
Reports per-node effect, ranking, POTH, coverage (k, patients) across sets + Xie 2024 anchors.
AACT + PubMed-abstracts only.
"""
import io, sys, re, json, subprocess
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
MIN_WEEK = 36
GHOSTS = {'NCT04779697', 'NCT04969939', 'NCT05093205', 'NCT05144984', 'NCT05579249', 'NCT06041217'}
arms = pd.read_csv(f'{ROOT}/arms_full.csv')
arms['wk'] = arms['timepoint'].map(lambda t: max([int(x) for x in re.findall(r'week\s*(\d+)', str(t).lower())] or [-1]))
pop = pd.read_csv(f'{ROOT}/transitivity.csv').set_index('nct')['population'].to_dict()
T2D = {n for n, p in pop.items() if p == 'T2D'}
XIE = {'tirzepatide': 16.53, 'retatrutide': 22.10}   # Xie 2024 published vs-placebo % (PubMed)


def fmt(v):
    return f'{v:5.1f}' if isinstance(v, (int, float)) and v == v else '   - '


def node_of(a, d, s):
    if a == 'semaglutide':
        return 'semaglutide-sc-weekly' if s == 'weekly' else ('semaglutide-oral' if d >= 3 else 'semaglutide-sc-daily')
    return a


def contrasts(df):
    rows = []
    for nct, g in df.groupby('nct'):
        pl = g[g.agent == 'placebo']
        if pl.empty or pd.isna(pl.var_of_mean.iloc[0]):
            continue
        pm, pv = pl.mean_pct.iloc[0], pl.var_of_mean.iloc[0]
        for _, r in g[(g.agent != 'placebo') & (g.wk >= MIN_WEEK)].iterrows():
            if pd.isna(r.var_of_mean):
                continue
            rows.append({'nct': nct, 'node': node_of(r.agent, r.dose_mg, r.schedule),
                         'dose': r.dose_mg, 'loss': pm - r.mean_pct, 'var': r.var_of_mean + pv,
                         'n': (r.n or 0) + (pl.n.iloc[0] or 0)})
    return pd.DataFrame(rows)


def analyse(df, modal):
    """Pool each node's contrasts at its MODAL dose (where the extra trials actually contribute),
    so the sourcing delta is visible. modal: dict node->dose fixed across sets for comparability."""
    c = contrasts(df)
    eff, k = {}, {}
    for nd, g in c.groupby('node'):
        d = modal.get(nd, g.dose.max()); at = g[np.abs(g.dose - d) < 1e-6]
        if at.empty:
            at = g[g.dose == g.dose.max()]
        w = 1 / at['var'].values
        eff[nd] = float(np.sum(at['loss'] * w) / np.sum(w)); k[nd] = at.nct.nunique()
    return {'eff': eff, 'k': k, 'order': sorted(eff, key=lambda x: -eff[x]),
            'ntrials': c.nct.nunique(), 'npts': int(c.n.sum())}


# modal dose per node = the dose with the most contributing trials in the full set
cfull = contrasts(arms)
MODAL = {nd: g.groupby('dose').nct.nunique().idxmax() for nd, g in cfull.groupby('node')}


S0 = analyse(arms, MODAL)
S1 = analyse(arms[~arms.nct.isin(GHOSTS)], MODAL)
S2 = analyse(arms[~arms.nct.isin(GHOSTS) & ~arms.nct.isin(T2D)], MODAL)

print('=== coverage (the registry-native advantage) ===')
print(f'S0 registry-native : {S0["ntrials"]} trials, {S0["npts"]:,} pt-contributions')
print(f'S1 minus ghosts    : {S1["ntrials"]} trials, {S1["npts"]:,}')
print(f'S2 literature-emul.: {S2["ntrials"]} trials, {S2["npts"]:,}')
print(f'  -> registry-native captures +{S0["ntrials"]-S2["ntrials"]} trials / '
      f'+{S0["npts"]-S2["npts"]:,} pt-contributions a literature-weight-loss search would miss '
      f'({len(GHOSTS & set(arms.nct))} ghosts + {len(T2D & set(arms.nct))} T2D-secondary-outcome).')

allnodes = sorted(set(S0['eff']) | set(S2['eff']))
print(f'\n=== per-node POOLED effect at modal dose (pp) — where the extra trials contribute ===')
print(f'{"node (modal dose)":28s} S0-reg  S1-noGh  S2-lit   Xie24   reg-vs-lit  k:reg/lit')
for nd in allnodes:
    e0, e1, e2 = S0['eff'].get(nd), S1['eff'].get(nd), S2['eff'].get(nd)
    xi = XIE.get(nd); d = (e0 - e2) if (e0 is not None and e2 is not None) else None
    lbl = f'{nd} ({MODAL.get(nd,"?"):g}mg)'
    print(f'{lbl:28s} {fmt(e0)}  {fmt(e1)}  {fmt(e2)}  {fmt(xi)}   {("%+.1f"%d) if d is not None else "  -  "}      {S0["k"].get(nd,0)}/{S2["k"].get(nd,0)}')

print('\n=== ranking by set ===')
for lbl, S in [('registry-native', S0), ('literature-emul', S2)]:
    print(f'  {lbl:16s}: ' + ' > '.join(f'{n}({S["eff"][n]:.0f})' for n in S['order']))

json.dump({'S0_registry': S0, 'S1_no_ghost': S1, 'S2_literature': S2,
           'ghosts_in_cohort': sorted(GHOSTS & set(arms.nct)), 'T2D_in_cohort': sorted(T2D & set(arms.nct))},
          open(f'{ROOT}/delta_comparison.json', 'w'), indent=1, default=float)
print('\nwrote delta_comparison.json')
