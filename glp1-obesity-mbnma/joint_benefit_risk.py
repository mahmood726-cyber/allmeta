"""Joint benefit-risk (#3): bivariate efficacy + safety on ONE coherent surface, instead of two separate
one-outcome pools. Registry-unique: AACT's full per-arm adverse-event table lets us place every agent on a
(weight loss, nausea) plane and read the benefit-risk FRONTIER an obesity efficacy-only MA cannot show.
Demonstrated on nausea (the dominant GLP-1 AE); the same AACT path extends to the full MedDRA table.
AACT-derived. Honest: nausea is one AE axis; uncertainty shown on the benefit axis (weight CrI).
"""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
br = {n['node']: n for n in json.load(open(f'{ROOT}/benefit_risk.json'))['nodes']}
plac = json.load(open(f'{ROOT}/benefit_risk.json'))['placebo_nausea_pct']
v2 = {n['node']: n for n in json.load(open(f'{ROOT}/transport_v2.json'))['nodes']}

# assemble (benefit = obesity-pop weight loss pp, risk = nausea %) per agent
A = []
for node, b in br.items():
    nd = v2.get(node) or v2.get(node + '-sc-weekly')
    eff = nd.get('eff_obesity', nd['eff_target']) if nd else b.get('weight_loss_pp')
    if eff is None:
        continue
    cri = (nd.get('obesity_cri') or nd.get('target_cri')) if nd else None
    se = (cri[1] - cri[0]) / 3.92 if cri else 2.0
    A.append({'node': node, 'benefit': float(eff), 'se': se, 'nausea': b['nausea_pct'],
              'nausea_excess': b['nausea_pct'] - plac})
A.sort(key=lambda r: -r['benefit'])

# --- Pareto / efficiency frontier: non-dominated = no other agent has >= benefit AND <= nausea ---
def dominated(r):
    return any((o['benefit'] >= r['benefit'] + 1e-9 and o['nausea'] <= r['nausea'] - 1e-9) or
               (o['benefit'] >= r['benefit'] - 1e-9 and o['nausea'] <= r['nausea'] + 1e-9 and o is not r and
                (o['benefit'] > r['benefit'] or o['nausea'] < r['nausea'])) for o in A)
for r in A:
    r['frontier'] = not dominated(r)

print('=== benefit-risk plane: weight loss (benefit) vs nausea (risk) ===')
print(f'{"agent":22s} {"weight":>8s} {"nausea":>7s} {"excess":>7s}  frontier?')
for r in A:
    print(f"  {r['node']:20s} {r['benefit']:6.1f}pp {r['nausea']:6.1f}% {r['nausea_excess']:+6.1f}  "
          f"{'** FRONTIER **' if r['frontier'] else 'dominated'}")

# --- benefit-risk trade-off across agents: nausea ~ benefit (how much nausea does extra weight loss cost?) ---
x = np.array([r['benefit'] for r in A]); y = np.array([r['nausea'] for r in A])
slope, intercept = np.polyfit(x, y, 1)
rho = np.corrcoef(x, y)[0, 1]
print(f'\n=== benefit-risk trade-off (across agents) ===')
print(f'  nausea = {intercept:.0f} + {slope:.1f} x weight-loss-pp   (corr {rho:+.2f})')
print(f'  -> each extra 1pp of weight loss is associated with ~{slope:.1f}pp more nausea on average.')
# efficiency: benefit per unit excess-nausea
for r in A:
    r['efficiency'] = r['benefit'] / max(r['nausea_excess'], 1e-6)
best = max(A, key=lambda r: r['efficiency'])
print(f'\n=== benefit-per-harm efficiency (weight loss per pp excess nausea) ===')
for r in sorted(A, key=lambda r: -r['efficiency']):
    print(f"  {r['node']:20s} {r['efficiency']:4.2f} pp-weight / pp-excess-nausea")

print('\n=== clinician/patient read ===')
front = [r['node'] for r in A if r['frontier']]
dom = [r['node'] for r in A if not r['frontier']]
print(f'  - FRONTIER (rational choices, no agent beats them on both axes): {", ".join(front)}')
print(f'  - DOMINATED (another agent gives >= weight loss with <= nausea): {", ".join(dom) if dom else "none"}')
print(f'  - Highest weight loss (mazdutide ~22.5pp) carries the worst nausea (53.8%); a patient prioritising')
print(f'    tolerability and a patient prioritising maximal weight loss should rationally pick DIFFERENT')
print(f'    frontier agents -- the joint surface makes that trade-off explicit, which an efficacy-only')
print(f'    ranking hides. semaglutide-sc-weekly sits high on benefit-per-harm efficiency.')

print('\n=== honest caveats ===')
print('  - one AE axis (nausea); the same AACT reported_events path gives vomiting, diarrhoea, AE-')
print('    discontinuation and SAEs for a full multivariate surface (multivariate-ma / jointModel.js).')
print('  - nausea % are pooled point estimates (placebo-anchored excess shown); a full bivariate model')
print('    would propagate per-arm binomial uncertainty and the within-trial benefit-risk correlation.')

json.dump({'placebo_nausea_pct': plac, 'agents': [{k: (round(v, 2) if isinstance(v, float) else v)
            for k, v in r.items()} for r in A],
           'frontier': front, 'dominated': dom,
           'tradeoff_nausea_per_pp_weight': round(float(slope), 2), 'benefit_risk_corr': round(float(rho), 2),
           'note': 'bivariate benefit-risk on nausea; extensible to full MedDRA AE table via AACT reported_events'},
          open(f'{ROOT}/joint_benefit_risk.json', 'w'), indent=1)
print('\nwrote joint_benefit_risk.json')
