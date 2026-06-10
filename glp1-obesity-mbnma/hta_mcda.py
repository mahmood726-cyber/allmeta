"""HTA integrator (proof-of-concept): Network MCDA fusing ALL our analyses into one decision metric.
Combines the TRANSPORTED efficacy (weight loss), the survival NMA (CV HR), and benefit-risk (nausea) per
agent into a single value score with Monte-Carlo uncertainty from the posteriors. Defensible (ISPOR MCDA
good-practice) + cutting-edge (registry-native NMA -> transported -> network MCDA + a VOI proxy). The full
EVPPI/CEA/Markov is the validated allmeta/HTA engine's job (reuse, not rebuild). AACT-derived inputs.
"""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
rng = np.random.default_rng(7)
v2 = {n['node']: n for n in json.load(open(f'{ROOT}/transport_v2.json'))['nodes']}
surv = {r['agent']: r for r in json.load(open(f'{ROOT}/survival_nma.json'))['survival_nma_by_agent']}
br = {n['node']: n for n in json.load(open(f'{ROOT}/benefit_risk.json'))['nodes']}


def base_agent(node):
    return 'semaglutide' if node.startswith('semaglutide') else node


# pick the primary route per agent for efficacy (semaglutide -> sc-weekly product)
EFF_NODE = {'semaglutide': 'semaglutide-sc-weekly', 'tirzepatide': 'tirzepatide',
            'retatrutide': 'retatrutide', 'mazdutide': 'mazdutide', 'orforglipron': 'orforglipron'}
agents = [a for a in EFF_NODE if EFF_NODE[a] in v2]

# partial value functions (0-1): efficacy weight-loss 0..25pp; survival benefit (1-HR) 0..0.4; safety low nausea
def mc(agent, n=8000):
    nd = v2[EFF_NODE[agent]]
    lo, hi = nd['target_cri']; eff = rng.normal(nd['eff_target'], (hi - lo) / 3.92, n)         # transported efficacy
    s = surv.get(agent)
    if s:
        clo, chi = s['ci']; lhr = rng.normal(np.log(s['pooled_hr']), (np.log(chi) - np.log(clo)) / 3.92, n)
        cvben = 1 - np.exp(lhr)                                                                 # 1-HR (benefit)
    else:
        cvben = np.full(n, np.nan)
    bn = br.get(EFF_NODE[agent]) or next((br[k] for k in br if k.startswith(agent)), None)
    naus = bn['nausea_pct'] if bn else np.nan
    return eff, cvben, naus


# value functions
def v_eff(x): return np.clip(x / 25.0, 0, 1)
def v_cv(x): return np.clip(x / 0.4, 0, 1)
def v_safe(x): return np.clip(1 - (x - 4) / 50.0, 0, 1)   # nausea 4%(placebo)->54% mapped 1->0

WEIGHTS = {'efficacy': 0.45, 'cv': 0.35, 'safety': 0.20}   # base-case (ISPOR: elicited; here illustrative)
print('Network MCDA — fusing transported efficacy + CV survival + safety (base weights '
      f'{WEIGHTS}):\n')
data = {a: mc(a) for a in agents}
V = {}
for a in agents:
    eff, cv, naus = data[a]
    has_cv = not np.isnan(cv).all()
    val = WEIGHTS['efficacy'] * v_eff(eff) + WEIGHTS['safety'] * v_safe(naus)
    val = val + WEIGHTS['cv'] * (v_cv(cv) if has_cv else np.nan)
    V[a] = val
# rank among agents with full data (efficacy+CV+safety)
full = [a for a in agents if not np.isnan(V[a]).all()]
M = np.vstack([V[a] for a in full])
ranks = (-M).argsort(0).argsort(0) + 1
pbest = {full[i]: float(np.mean(ranks[i] == 1)) for i in range(len(full))}
print(f'{"agent":13s} value(95% CrI)        P(best)   [transported eff / CV-HR / nausea]')
for a in sorted(full, key=lambda x: -np.median(V[x])):
    eff, cv, naus = data[a]
    print(f'{a:13s} {np.median(V[a]):.3f} ({np.percentile(V[a],2.5):.3f},{np.percentile(V[a],97.5):.3f})   '
          f'{pbest[a]:.2f}     [{np.median(eff):.1f}pp / {np.exp(np.median(np.log(np.clip(1-cv,1e-3,None)))) if not np.isnan(cv).all() else float("nan"):.2f} / {naus:.0f}%]')
agents_noCV = [a for a in agents if a not in full]
if agents_noCV:
    print(f'\nefficacy+safety only (no posted CV outcome): '
          + ', '.join(f'{a} {np.median(WEIGHTS["efficacy"]*v_eff(data[a][0])+WEIGHTS["safety"]*v_safe(data[a][2])):.3f}' for a in agents_noCV))

# VOI proxy: which criterion's uncertainty most affects the top-rank probability (fix each at its mean, see P(best) change)
print('\n=== value-of-information proxy: which uncertainty drives the decision ===')
top = max(full, key=lambda x: np.median(V[x]))
base_pbest = pbest[top]
for crit in ['efficacy', 'cv', 'safety']:
    Vf = {}
    for a in full:
        eff, cv, naus = data[a]
        e = v_eff(np.median(eff)) if crit == 'efficacy' else v_eff(eff)
        c = v_cv(np.median(1 - np.exp(np.log(np.clip(1 - cv, 1e-3, None))))) if crit == 'cv' and not np.isnan(cv).all() else (v_cv(cv) if not np.isnan(cv).all() else np.nan)
        s = v_safe(naus)
        Vf[a] = WEIGHTS['efficacy'] * e + WEIGHTS['cv'] * (c if not np.isnan(np.atleast_1d(c)).all() else 0) + WEIGHTS['safety'] * s
    Mf = np.vstack([np.broadcast_to(Vf[a], (8000,)) for a in full])
    rf = (-Mf).argsort(0).argsort(0) + 1
    pf = float(np.mean(rf[full.index(top)] == 1))
    print(f'  resolve {crit:9s} uncertainty -> P({top} best) {base_pbest:.2f} -> {pf:.2f}  (delta {pf-base_pbest:+.2f})')
print('  -> the criterion with the largest delta is where more research is most valuable (EVPPI direction;')
print('     full EVPPI/EVSI via allmeta/HTA evppi.js, evsi.js).')

json.dump({'weights': WEIGHTS, 'agents_full': full,
           'value_median': {a: round(float(np.median(V[a])), 3) for a in full},
           'p_best': pbest, 'note': 'PoC network MCDA fusing transported efficacy + CV survival + safety; full CEA/EVPPI = allmeta/HTA engine'},
          open(f'{ROOT}/hta_mcda.json', 'w'), indent=1)
print('\nwrote hta_mcda.json')
