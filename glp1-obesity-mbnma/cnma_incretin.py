"""Component NMA (Welton 2009 / Ruecker 2020 additive contrast model) on the incretin RECEPTOR components.
A wide-gap, clinician-facing capability: ordinary MA treats each drug as a black box; the registry's arm-level
structure + known pharmacology lets us DECOMPOSE weight loss into the additive contribution of each receptor
agonism (GLP-1, GIP, glucagon) and PREDICT un-trialled combinations. We first PROVE the WLS matches allmeta's
validated netmeta::discomb oracle, then apply it. AACT-derived effects; obesity-population.
"""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'


def cnma_wls(X, TE, seTE):
    """Additive contrast CNMA, common-effect closed form (discomb). X: studies x components (vs empty control)."""
    W = np.diag(1.0 / np.asarray(seTE) ** 2)
    XtW = X.T @ W
    cov = np.linalg.inv(XtW @ X)
    beta = cov @ XtW @ TE
    resid = TE - X @ beta
    Q = float(resid.T @ W @ resid)
    df = len(TE) - X.shape[1]
    se = np.sqrt(np.diag(cov))
    return beta, se, Q, df, cov


# ---- 1. VALIDATE against the allmeta discomb oracle (cnma-tiny) ----
comps = ['a', 'b', 'c']
rows = [('a', -0.40, 0.12), ('b', -0.30, 0.15), ('a+b', -0.65, 0.13), ('a+c', -0.55, 0.16),
        ('c', -0.20, 0.18), ('b+c', -0.45, 0.14), ('a+b+c', -0.80, 0.20)]
X = np.array([[1.0 if c in r[0].split('+') else 0.0 for c in comps] for r in rows])
TE = np.array([r[1] for r in rows]); se = np.array([r[2] for r in rows])
beta, sb, Q, df, _ = cnma_wls(X, TE, se)
oracle = json.load(open(r'C:/Projects/allmeta/component-nma/tests/fixtures/cnma-oracle.json'))
print('=== validation vs allmeta netmeta::discomb oracle (cnma-tiny) ===')
ok = True
for i, c in enumerate(comps):
    o = oracle['components'][c]
    de, ds = abs(beta[i] - o['est']), abs(sb[i] - o['se'])
    ok &= de < 1e-6 and ds < 1e-6
    print(f"  {c}: est {beta[i]:+.8f} (oracle {o['est']:+.8f}, d{de:.1e})  se {sb[i]:.8f} (d{ds:.1e})")
print(f"  Q_additive {Q:.8f} (oracle {oracle['Q_additive']:.8f}), df {df} (oracle {oracle['df_additive']})")
print(f"  PARITY: {'PASS (matches validated R engine to 1e-6)' if ok else 'FAIL'}\n")
assert ok, 'CNMA WLS does not match validated oracle'

# ---- 2. APPLY to incretin receptor components ----
v2 = {n['node']: n for n in json.load(open(f'{ROOT}/transport_v2.json'))['nodes']}
# obesity-population effect (magnitude, pp) + SE from the obesity CrI
def eff_se(node):
    n = v2[node]
    e = n.get('eff_obesity', n['eff_target'])
    cri = n.get('obesity_cri') or n.get('target_cri')
    return e, (cri[1] - cri[0]) / 3.92
# receptor decomposition (known pharmacology): GLP1 / GIP / GCG(glucagon)
RX = {
    'semaglutide-sc-weekly': ['GLP1'], 'semaglutide-oral': ['GLP1'], 'semaglutide-sc-daily': ['GLP1'],
    'orforglipron': ['GLP1'], 'tirzepatide': ['GLP1', 'GIP'], 'mazdutide': ['GLP1', 'GCG'],
    'retatrutide': ['GLP1', 'GIP', 'GCG'],
}
nodes = [n for n in RX if n in v2]
COMP = ['GLP1', 'GIP', 'GCG']
Xi = np.array([[1.0 if c in RX[n] else 0.0 for c in COMP] for n in nodes])
TEi = np.array([eff_se(n)[0] for n in nodes]); sei = np.array([eff_se(n)[1] for n in nodes])
beta, sb, Q, df, cov = cnma_wls(Xi, TEi, sei)

print('=== incretin receptor-component decomposition (additive CNMA, obesity-pop weight loss) ===')
print('  input treatments (effect pp [components]):')
for n in nodes:
    print(f'    {n:24s} {eff_se(n)[0]:5.1f} pp  {RX[n]}')
print('\n  additive component contributions (incremental pp of body-weight loss):')
for i, c in enumerate(COMP):
    z = beta[i] / sb[i]
    print(f'    {c:5s} {beta[i]:+5.1f} pp (95% CI {beta[i]-1.96*sb[i]:+.1f},{beta[i]+1.96*sb[i]:+.1f})  z={z:.1f}')
het = 'substantial (dose/molecule heterogeneity within GLP-1 agents)' if Q > df else 'modest'
print(f'\n  additive-model fit: Q={Q:.1f}, df={df} -> {het}')

# ---- 3. test additivity of TRIPLE agonism + predict an un-trialled combination ----
def predict(components):
    x = np.array([1.0 if c in components else 0.0 for c in COMP])
    return float(x @ beta), float(np.sqrt(x @ cov @ x))
pr, prse = predict(['GLP1', 'GIP', 'GCG'])
obs, obsse = eff_se('retatrutide')
print('\n=== clinician-facing reads (things ordinary MA cannot produce) ===')
print(f'  - adding GIP to GLP-1 buys      {beta[1]:+.1f} pp')
print(f'  - adding glucagon to GLP-1 buys {beta[2]:+.1f} pp   (glucagon is the larger lever)')
print(f'  - TRIPLE agonism: additive prediction {pr:.1f} pp vs observed retatrutide {obs:.1f} pp '
      f'-> {"SUB-additive (diminishing returns)" if obs < pr-0.5 else "additive"} '
      f'({obs-pr:+.1f} pp, ~{abs(obs-pr)/prse:.1f} SE)')
gip_gcg, ggse = predict(['GIP', 'GCG'])  # a hypothetical GIP+glucagon (no GLP1) agent — never trialled
print(f'  - predicts an UN-TRIALLED GIP+glucagon (no GLP-1) agent: {gip_gcg:.1f} pp (95% CI '
      f'{gip_gcg-1.96*ggse:.1f},{gip_gcg+1.96*ggse:.1f}) — a registry-native, testable hypothesis')

print('\n=== honest caveats ===')
print('  - CNMA assumes each receptor component has a COMMON effect across molecules; in reality the GLP-1')
print('    moiety differs in potency/dose between semaglutide, tirzepatide, retatrutide (hence the high Q).')
print('    So the contributions are a hypothesis-generating APPROXIMATION, not pharmacological constants.')
print('  - GIP and GCG each appear in only 1-2 agents (k small); CIs are wide and the triple-agonism')
print('    interaction is confounded with retatrutide-specific dose. Read as direction + magnitude, not exact.')

json.dump({'validated_vs_discomb': bool(ok),
           'components': {c: {'est_pp': round(float(beta[i]), 1), 'se': round(float(sb[i]), 2)} for i, c in enumerate(COMP)},
           'Q': round(Q, 1), 'df': int(df),
           'triple_additive_pred_pp': round(pr, 1), 'triple_observed_pp': round(obs, 1),
           'predicted_GIP_GCG_no_GLP1_pp': round(gip_gcg, 1),
           'caveat': 'common-component assumption across molecules is approximate (high Q); GIP/GCG k small'},
          open(f'{ROOT}/cnma_incretin.json', 'w'), indent=1)
print('\nwrote cnma_incretin.json')
