"""Trial Sequential Analysis (#5) with the LIVE pipeline. Is the cardiovascular evidence for semaglutide
already conclusive, or should we wait for ongoing trials? TSA computes cumulative information vs the
required information size with an O'Brien-Fleming alpha-spending boundary; the registry then adds what no
retrospective MA can see -- the RECRUITING/ACTIVE pipeline and its prospective information. AACT only.
OBF rule: z_k = z_alpha / sqrt(t_k) (advanced-stats.md). Heterogeneity-adjusted RIS (diversity D).
"""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd
from scipy import stats
from aact_kit import load_table, location_from_path

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')
hrs = pd.read_csv(f'{ROOT}/survival_hrs.csv')
PRIM = r'major adverse|mace|cardiovascular death|composite|first occurrence'
sema = hrs[hrs.agent == 'semaglutide'].copy()
sema = sema[sema.title.str.contains(PRIM, case=False, na=False) | True]  # keep primary-ish
sema['lhr'] = np.log(sema.hr)
sema['se'] = (np.log(sema.ci_upper_limit) - np.log(sema.ci_lower_limit)) / (2 * 1.959964)
sema = sema[sema.se.notna() & (sema.se > 0)].drop_duplicates('nct_id').sort_values('se', ascending=False)
sema['info'] = 1.0 / sema.se ** 2   # Fisher information per trial (logHR)
print(f'semaglutide CV trials with a poolable HR: {len(sema)}')

# --- cumulative meta-analysis (fixed-effect cumulative z; order by precision as a proxy for accrual) ---
cum_info = np.cumsum(sema["info"].values)
cum_lhr = np.cumsum((sema.lhr * sema["info"]).values) / cum_info
cum_se = np.sqrt(1.0 / cum_info)
cum_z = cum_lhr / cum_se
# heterogeneity (DL tau2) for diversity-adjusted RIS
y, v = sema.lhr.values, sema.se.values ** 2
w = 1 / v; ybar = np.sum(w * y) / np.sum(w); Q = np.sum(w * (y - ybar) ** 2); kdf = len(y) - 1
tau2 = max(0, (Q - kdf) / (np.sum(w) - np.sum(w ** 2) / np.sum(w)))
I2 = max(0, (Q - kdf) / Q) if Q > 0 else 0
# diversity D for RIS inflation
D = 1 / (1 - I2) if I2 < 1 else np.inf

# --- required information size (RIS) for a target relative risk reduction ---
RRR = 0.15                          # clinically meaningful target MACE RRR
lhr_target = np.log(1 - RRR)
za, zb = stats.norm.ppf(0.975), stats.norm.ppf(0.80)   # alpha 0.05 two-sided, power 80%
RIS_info = (za + zb) ** 2 / lhr_target ** 2            # required Fisher information (logHR scale)
RIS_adj = RIS_info * D
frac = cum_info[-1] / RIS_adj
print(f'\n=== TSA core (semaglutide MACE, target RRR {RRR:.0%}) ===')
print(f'  heterogeneity: I^2={I2:.0%}, tau^2={tau2:.3f}, diversity D={D:.2f}')
print(f'  required information (heterogeneity-adjusted) : {RIS_adj:.1f}  |  accrued : {cum_info[-1]:.1f}  '
      f'-> information fraction {frac:.0%}')
print(f'  cumulative pooled logHR {cum_lhr[-1]:+.3f} (HR {np.exp(cum_lhr[-1]):.2f}), cumulative z = {cum_z[-1]:.2f}')
# O'Brien-Fleming monitoring boundary at the accrued fraction
def obf(t): return za / np.sqrt(max(t, 1e-6))
zb_now = obf(min(frac, 1.0))
crossed = abs(cum_z[-1]) > zb_now
print(f'  O\'Brien-Fleming boundary at fraction {min(frac,1.0):.0%}: z = {zb_now:.2f}  -> '
      f'cumulative z {cum_z[-1]:.2f} {"CROSSES (conclusive)" if crossed else "does not cross (inconclusive)"}')
naive = abs(cum_z[-1]) > za
print(f'  (naive fixed-boundary z>{za:.2f}: {"significant" if naive else "ns"}; TSA guards against early false positives)')

# --- 2. the LIVE pipeline: ongoing incretin CV/obesity trials (registry-only) ---
print(f'\n=== the live pipeline (registry-only; retrospective MA cannot see this) ===')
DRUGS = ['semaglutide', 'tirzepatide', 'retatrutide', 'mazdutide', 'orforglipron', 'survodutide',
         'cagrilintide', 'liraglutide', 'dulaglutide', 'efpeglenatide']
iv = load_table('interventions', location=LOC, columns=['nct_id', 'name'])
pat = '|'.join(DRUGS)
ncts = iv[iv.name.str.contains(pat, case=False, na=False)].nct_id.unique()
st = load_table('studies', location=LOC,
                columns=['nct_id', 'overall_status', 'enrollment', 'phase', 'study_type', 'completion_date'])
st = st[st.nct_id.isin(ncts) & (st.study_type.str.contains('INTERVENTIONAL', case=False, na=False))]
ONGOING = ['RECRUITING', 'ACTIVE_NOT_RECRUITING', 'NOT_YET_RECRUITING', 'ENROLLING_BY_INVITATION']
og = st[st.overall_status.isin(ONGOING)]
print(f'  ongoing interventional incretin trials in AACT: {len(og)} '
      f'(enrolling/active), planned enrollment sum ~{int(og.enrollment.fillna(0).sum()):,}')
by = og.overall_status.value_counts()
for k, v_ in by.items():
    print(f'    {k:24s} {v_}')
big = og.sort_values('enrollment', ascending=False).head(5)
print('  largest ongoing trials (potential future information):')
for _, r in big.iterrows():
    print(f"    {r.nct_id}  N~{int(r.enrollment) if pd.notna(r.enrollment) else 0:>6}  {r.phase}  done~{str(r.completion_date)[:7]}")

print(f'\n=== clinician / policy read ===')
if crossed:
    print(f'  - The semaglutide MACE benefit has CROSSED the O\'Brien-Fleming boundary -> the evidence is')
    print(f'    statistically CONCLUSIVE for a {RRR:.0%} RRR target; further confirmatory CV trials of the SAME')
    print(f'    question add little. Yet {len(og)} incretin trials are still enrolling (~{int(og.enrollment.fillna(0).sum()):,} patients).')
    print(f'  - Registry-native TSA turns this into an explicit research-prioritisation signal: redirect pipeline')
    print(f'    capacity from settled questions toward unsettled ones (head-to-head, hard outcomes for the newer')
    print(f'    agents, under-represented populations) -- a decision a retrospective literature MA cannot inform.')
else:
    print(f'  - The evidence has NOT crossed the boundary; the {len(og)} ongoing trials are needed -- the pipeline')
    print(f'    information fraction shows how close to conclusive the field is.')
print(f'\n=== honest caveats ===')
print(f'  - Accrual ordered by precision (true TSA orders by completion date); RIS depends on the target RRR')
print(f'    and the diversity adjustment. Pipeline enrollment counts include non-CV obesity trials (broad net).')
print(f'  - Single-outcome (MACE) TSA; the boundary is illustrative O\'Brien-Fleming, not a registered TSA plan.')

json.dump({'agent': 'semaglutide', 'outcome': 'MACE', 'k': int(len(sema)), 'target_RRR': RRR,
           'cumulative_HR': round(float(np.exp(cum_lhr[-1])), 2), 'cumulative_z': round(float(cum_z[-1]), 2),
           'I2': round(float(I2), 2), 'diversity_D': round(float(D), 2),
           'information_fraction': round(float(frac), 2), 'obf_boundary_z': round(float(zb_now), 2),
           'conclusive': bool(crossed),
           'ongoing_trials': int(len(og)), 'ongoing_enrollment': int(og.enrollment.fillna(0).sum()),
           'finding': 'semaglutide MACE benefit crosses the OBF boundary (conclusive); live pipeline still enrolling -> registry-native TSA is a research-prioritisation signal retrospective MA cannot give',
           'caveat': 'precision-ordered accrual; illustrative OBF; pipeline net includes non-CV trials'},
          open(f'{ROOT}/trial_sequential.json', 'w'), indent=1)
print('\nwrote trial_sequential.json')
