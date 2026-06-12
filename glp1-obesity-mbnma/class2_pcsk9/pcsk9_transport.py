"""GENERALITY depth (transport stage) for the PCSK9 class -- the analogue of the incretin pipeline's
NHANES transport. The incretin engine transports a % weight-loss effect to a US target population using a
real NHANES effect-modifier distribution (diabetes prevalence). Here we transport each PCSK9i's % LDL-C
reduction to ABSOLUTE LDL-C lowering (mg/dL and mmol/L) in a real target population -- US adults with
elevated LDL-C -- whose baseline LDL-C distribution comes from NHANES 2017-March 2020 survey-weighted
microdata (the same authoritative reference source the incretin transport uses). This matters clinically:
CTT shows CV risk tracks ABSOLUTE LDL lowering (mmol/L), not the percentage, so the transported absolute
reduction is the decision-relevant quantity. Registry effect (% reduction) x authoritative target baseline.
No IPD, no full text. Fail closed on a partial NHANES download."""
import io, sys, json, urllib.request
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class2_pcsk9'
BASE = 'https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2017/DataFiles/'
HDR = {'User-Agent': 'Mozilla/5.0'}
LDL_THRESHOLD = 100.0   # mg/dL: a PCSK9i-relevant elevated-LDL adult target (ACC/AHA secondary-prevention goal)
MMOL = 0.0258601        # mg/dL -> mmol/L for LDL-C


def xpt(name):
    raw = urllib.request.urlopen(urllib.request.Request(BASE + name, headers=HDR), timeout=90).read()
    if len(raw) < 10000:
        raise RuntimeError(f'NHANES {name} download too small ({len(raw)} bytes) -- refusing partial data')
    return pd.read_sas(io.BytesIO(raw), format='xport')


print('downloading NHANES 2017-2020 LDL-C + demo microdata...', flush=True)
tri = xpt('P_TRIGLY.xpt')[['SEQN', 'WTSAFPRP', 'LBDLDL']]   # Friedewald LDL-C (mg/dL), fasting subsample weight
demo = xpt('P_DEMO.xpt')[['SEQN', 'RIDAGEYR']]
df = tri.merge(demo, on='SEQN', how='left')
adult = df[(df.RIDAGEYR >= 18) & df.LBDLDL.notna() & df.WTSAFPRP.notna() & (df.WTSAFPRP > 0)].copy()
tgt = adult[adult.LBDLDL >= LDL_THRESHOLD].copy()
if len(tgt) < 200:
    raise RuntimeError(f'target subset too small ({len(tgt)}) -- refusing to transport')

w = tgt.WTSAFPRP.values.astype(float); ldl = tgt.LBDLDL.values.astype(float)
Lbar = float(np.sum(w * ldl) / np.sum(w))                          # survey-weighted mean baseline LDL
neff = float(np.sum(w) ** 2 / np.sum(w ** 2))                      # Kish effective n
var_w = float(np.sum(w * (ldl - Lbar) ** 2) / np.sum(w))          # weighted variance
se_L = float(np.sqrt(var_w / neff))                                # SE of the weighted mean
print(f'target = US adults with LDL-C >= {LDL_THRESHOLD:.0f} mg/dL: n={len(tgt)} (Kish n_eff={neff:.0f}), '
      f'survey-weighted baseline LDL-C = {Lbar:.1f} mg/dL (SE {se_L:.2f}) = {Lbar*MMOL:.2f} mmol/L\n')

res = json.load(open(f'{HERE}/pcsk9_results.json'))
nma = res['ldl_nma']
agents = sorted(nma, key=lambda a: nma[a]['ldl'])   # most % reduction first

print('=== transported ABSOLUTE LDL-C lowering in the elevated-LDL target (registry % x NHANES baseline) ===')
rows = []
for a in agents:
    pct = nma[a]['ldl']; se_pct = nma[a]['se']        # pct is negative (reduction)
    frac = -pct / 100.0; se_frac = se_pct / 100.0
    abs_mg = Lbar * frac                               # absolute mg/dL reduction
    # delta-method SE: Var(L*f) ~= f^2 Var(L) + L^2 Var(f)  (L, f independent sources)
    se_mg = float(np.sqrt(frac ** 2 * se_L ** 2 + Lbar ** 2 * se_frac ** 2))
    lo, hi = abs_mg - 1.959964 * se_mg, abs_mg + 1.959964 * se_mg
    abs_mmol = abs_mg * MMOL
    print(f'  {a:13s} -{abs_mg:5.1f} mg/dL ({lo:.0f},{hi:.0f})  = -{abs_mmol:.2f} mmol/L   (from {pct:.1f}% x {Lbar:.0f})')
    rows.append({'agent': a, 'pct_reduction': round(pct, 1),
                 'abs_mg_dl': round(abs_mg, 1), 'abs_ci_mg_dl': [round(lo, 1), round(hi, 1)],
                 'abs_mmol_l': round(abs_mmol, 2)})

# CTT context (illustrative, NOT a CV claim): ~22% RR reduction in major vascular events per 1 mmol/L LDL
lead = rows[0]
print(f'\n  CTT context (illustrative only): every 1 mmol/L absolute LDL lowering ~= 22% RR in major vascular')
print(f'  events (CTT 2010). Lead agent {lead["agent"]} -> {lead["abs_mmol_l"]:.2f} mmol/L absolute lowering in')
print(f'  this target. This is a TRANSPORT of the surrogate, NOT a CV-outcome claim -- the CV benefit must come')
print(f'  from the agent\'s own CVOT, and is downgraded for indirectness exactly as the league/GRADE layer does.')

print('\n=== transport depth verdict (PCSK9) ===')
print('  The transport stage repointed to PCSK9 using the SAME authoritative reference source (NHANES survey-')
print('  weighted microdata) as the incretin transport -- here mapping a registry % LDL reduction onto the')
print('  decision-relevant ABSOLUTE (mmol/L) lowering in a real elevated-LDL US target. Honest bound: this')
print('  assumes the % reduction is approximately population-transportable (PCSK9i % LDL reduction is broadly')
print('  baseline-stable; the modifier carried is the target BASELINE LDL, not the percentage). With league +')
print('  GRADE (pcsk9_league) + this transport, PCSK9 now spans 3 of the 4 named depth stages; the HTML')
print('  dashboard (pcsk9_dashboard.html) renders them. Registry-native + NHANES; no IPD.')

json.dump({'class': 'PCSK9 inhibitors', 'stage': 'transport (% LDL -> absolute LDL lowering in a target)',
           'target': {'definition': f'US adults with LDL-C >= {LDL_THRESHOLD:.0f} mg/dL',
                      'source': 'NHANES 2017-March 2020 prepandemic fasting microdata (CDC/NCHS), survey-weighted WTSAFPRP',
                      'n': int(len(tgt)), 'kish_neff': round(neff, 0),
                      'baseline_ldl_mg_dl': round(Lbar, 1), 'baseline_ldl_se': round(se_L, 2),
                      'baseline_ldl_mmol_l': round(Lbar * MMOL, 2)},
           'transported': rows,
           'ctt_context': 'illustrative only: ~22% RR in major vascular events per 1 mmol/L absolute LDL lowering (CTT Lancet 2010 376:1670); transporting the surrogate is NOT a CV-outcome claim',
           'depth_note': 'transport stage repointed with the SAME authoritative NHANES reference source as the incretin transport; maps registry % LDL reduction to decision-relevant ABSOLUTE (mmol/L) lowering in a real elevated-LDL US target. Assumes % reduction is approximately population-transportable (modifier carried = target baseline LDL, not the percentage). PCSK9 now spans 3 of 4 named depth stages (league + GRADE + transport); dashboard renders them. No IPD, no full text.'},
          open(f'{HERE}/pcsk9_transport.json', 'w'), indent=1)
print('\nwrote pcsk9_transport.json')
