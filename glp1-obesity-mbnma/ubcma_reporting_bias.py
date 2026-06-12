"""Complementary method #1 (frontier 4): UBCMA -- the INFERENTIAL pair to the registry-native ghost-
measurement. The ghost-measurement (GHOST_TRIALS.md / workstream_A_delta) *directly observes* the hidden
effect: semaglutide-2.4mg pools 11.7pp in the 13 published trials but 8.5pp in the 2 results-posted-but-
unpublished 'ghost' trials -> a 3.2pp reporting-bias signal a literature-only meta cannot see. UBCMA
(Unified Bias-Calibrated Meta-Analysis, the portfolio method) is the inferential counterpart: fit on the
LITERATURE-VISIBLE 13 ALONE and let its selection-bias model *infer* a corrected pooled effect. The test:
does the inference, blind to the ghosts, move in the same direction the ghosts directly reveal? We have the
hidden trials as ground truth -- a rare chance to check a publication-bias correction against the truth it
is trying to recover. AACT contrasts only; no IPD."""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:/Projects/ubcma/src')
import numpy as np, pandas as pd
from ubcma import MetaAnalysisDataset, UBCMAFit, dersimonian_laird, reml_estimator

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
GHOSTS = {'NCT04779697', 'NCT04969939', 'NCT05093205', 'NCT05144984', 'NCT05579249', 'NCT06041217'}
arms = pd.read_csv(f'{ROOT}/arms_full.csv')


def sem_contrasts():
    out = []
    for nct, g in arms.groupby('nct'):
        pls = arms[(arms.nct == nct) & (arms.agent == 'placebo')]
        a = g[(g.agent == 'semaglutide') & (np.abs(g.dose_mg - 2.4) < 1e-6)]
        if pls.empty or a.empty or pd.isna(pls['var_of_mean'].iloc[0]) or pd.isna(a['var_of_mean'].iloc[0]):
            continue
        out.append({'nct': nct, 'yi': float(pls['mean_pct'].iloc[0] - a['mean_pct'].iloc[0]),
                    'vi': float(a['var_of_mean'].iloc[0] + pls['var_of_mean'].iloc[0]), 'ghost': nct in GHOSTS})
    return pd.DataFrame(out)


sc = sem_contrasts()
sc['sei'] = np.sqrt(sc['vi'])
pub = sc[~sc.ghost].copy()
allt = sc.copy()
print(f'semaglutide-2.4mg vs placebo: {len(pub)} published + {int(sc.ghost.sum())} ghost = {len(sc)} total\n')


def ivw(d):
    w = 1 / d['vi'].values
    return float(np.sum(d['yi'] * w) / np.sum(w)), float(np.sqrt(1 / np.sum(w)))


# ground truth we can see ONLY because the pipeline is registry-native
pub_mu, pub_se = ivw(pub)
all_mu, all_se = ivw(allt)
ghost_mu, ghost_se = ivw(sc[sc.ghost])
print('=== the directly-observed ghost-measurement (registry-native ground truth) ===')
print(f'  published-only IV pool : {pub_mu:.2f}pp (SE {pub_se:.2f}, k={len(pub)})')
print(f'  GHOST-only IV pool     : {ghost_mu:.2f}pp (SE {ghost_se:.2f}, k={int(sc.ghost.sum())})')
print(f'  all-trials IV pool     : {all_mu:.2f}pp (SE {all_se:.2f}, k={len(sc)})  <- the value a literature meta MISSES')
print(f'  reporting-bias gap (published - all): {pub_mu - all_mu:+.2f}pp\n')

# DL / REML on the VISIBLE 13 (what a literature meta-analyst would report)
dl = dersimonian_laird(pub['yi'].to_numpy(), pub['sei'].to_numpy())
re = reml_estimator(pub['yi'].to_numpy(), pub['sei'].to_numpy())
print('=== standard estimators on the LITERATURE-VISIBLE 13 ===')
print(f'  DerSimonian-Laird mu = {dl["mu"]:.2f}  CI [{dl["ci_low"]:.2f}, {dl["ci_high"]:.2f}]')
print(f'  REML              mu = {re["mu"]:.2f}  CI [{re["ci_low"]:.2f}, {re["ci_high"]:.2f}]')

# UBCMA on the VISIBLE 13 -- the inferential selection-bias correction (blind to the ghosts)
data = MetaAnalysisDataset.from_dataframe(pub.rename(columns={}), effect_col='yi', se_col='sei', study_id_col='nct')
fit = UBCMAFit(n_restarts=24, maxiter=200).fit(data, allow_failed=True)
print(f'\n=== UBCMA (inferential selection-bias model, fit on the visible 13, BLIND to ghosts) ===')
print(f'  UBCMA mu = {fit.mu:.2f}  (tau1={fit.tau1:.2f}, tau2={fit.tau2:.2f}, mix={fit.mix_weight:.2f})')
shift_ubcma = fit.mu - dl['mu']
shift_truth = all_mu - dl['mu']
print(f'  UBCMA correction vs DL : {shift_ubcma:+.2f}pp')
print(f'  truth correction vs DL : {shift_truth:+.2f}pp  (DL on 13 -> all-15 IV pool)')
same_dir = (shift_ubcma <= 0 and shift_truth <= 0) or (shift_ubcma >= 0 and shift_truth >= 0)
recovered = abs(fit.mu - all_mu) < abs(dl['mu'] - all_mu)
print(f'  same direction as the ghost truth? {same_dir}   moved closer to the all-15 truth? {recovered}')

print('\n=== inferential-pair verdict ===')
if same_dir and recovered:
    msg = ('UBCMA, blind to the ghosts, inferred a DOWNWARD correction in the same direction the ghost-'
           'measurement directly observed, landing closer to the all-15 registry truth than the naive '
           'published pool. The inferential and the direct (registry-native) tools AGREE -- mutual corroboration.')
elif same_dir:
    msg = ('UBCMA inferred a correction in the same DIRECTION the ghosts reveal, but did not fully reach the '
           'all-15 truth -- selection signal is partially detectable from the visible set; the registry-native '
           'direct measurement remains the stronger, model-free tool.')
else:
    msg = ('UBCMA found little/▒no detectable selection asymmetry within the visible 13 (its mu stays near the '
           'naive pool): the bias is NOT recoverable from the published set alone. This is the key argument FOR '
           'the registry-native ghost-measurement -- direct observation sees what selection-model inference cannot.')
msg = msg.replace('▒', '')
print('  ' + msg)
print('  Either way: the inferential method (UBCMA, visible-only) and the direct method (ghost-measurement,')
print('  registry-native) form a pair -- one infers the hidden effect, the other observes it. Reported as a')
print('  reporting-bias SENSITIVITY pairing, NOT a change to the headline ranking (sema-2.4 node unchanged).')

json.dump({'method': 'UBCMA (Unified Bias-Calibrated Meta-Analysis)', 'role': 'inferential pair to the registry-native ghost-measurement',
           'node': 'semaglutide 2.4 mg vs placebo (%TBWL)', 'k_published': len(pub), 'k_ghost': int(sc.ghost.sum()),
           'observed': {'published_iv': round(pub_mu, 2), 'ghost_iv': round(ghost_mu, 2), 'all_iv': round(all_mu, 2),
                        'reporting_bias_gap_pp': round(pub_mu - all_mu, 2)},
           'visible_estimators': {'DL': round(dl['mu'], 2), 'REML': round(re['mu'], 2)},
           'ubcma': {'mu': round(float(fit.mu), 2), 'tau1': round(float(fit.tau1), 2), 'tau2': round(float(fit.tau2), 2),
                     'mix_weight': round(float(fit.mix_weight), 2)},
           'ubcma_correction_vs_DL_pp': round(shift_ubcma, 2), 'truth_correction_vs_DL_pp': round(shift_truth, 2),
           'same_direction_as_ghost_truth': bool(same_dir), 'moved_closer_to_all15_truth': bool(recovered),
           'verdict': msg,
           'scope_note': 'reporting-bias SENSITIVITY pairing of an inferential selection-bias model (UBCMA, fit on the visible set) with the direct registry-native ghost-measurement; does NOT change the headline ranking (sema-2.4 is a saturated node). Small ghost k (2) -- signal, not proof. No IPD; AACT contrasts + PubMed-confirmed ghost status only.'},
          open(f'{ROOT}/ubcma_reporting_bias.json', 'w'), indent=1)
print('\nwrote ubcma_reporting_bias.json')
