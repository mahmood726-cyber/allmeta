"""GENERALITY depth (transport stage) for the SGLT2 class -- the hard-outcome analogue of the PCSK9/incretin
transport. A relative effect (HF-hospitalisation HR) is clinically incomplete; the decision-relevant quantity
is the ABSOLUTE risk reduction (ARR) and NNT, which depend on the TARGET population's baseline risk. This
stage transports the Bayesian per-agent HR DRAWS (sglt2_hf_draws.npz) onto ARR + NNT across documented
baseline annual HF-hospitalisation risk scenarios -- propagating full posterior uncertainty into the NNT
credible interval. Honest core of the hard-outcome transport: ARR scales with baseline risk, so the same HR
gives a very different NNT in a primary-prevention vs an HFrEF target. Baseline rates are reference-
distribution values from the major SGLT2 trial placebo arms (authoritative reference, not registry-extracted
event counts); stated as such. No IPD."""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class3_sglt2'
d = np.load(f'{HERE}/sglt2_hf_draws.npz', allow_pickle=True)
th = d['theta']; agents = list(d['agents']); kper = {agents[i]: int(d['kper'][i]) for i in range(len(agents))}
hr = np.exp(th)                                   # (A, ndraws) HR draws
medHR = np.median(hr, axis=1)
order = list(np.argsort(medHR)); lead = agents[order[0]]
# class-pooled HR draws = geometric mean across agents WITH k>=2 (drop k=1 ertugliflozin from the pooled effect)
keep = [i for i in range(len(agents)) if kper[agents[i]] >= 2]
class_draws = np.exp(th[keep].mean(axis=0))      # draw-wise mean log-HR -> HR
lead_draws = hr[order[0]]

# reference baseline annual HF-hospitalisation risk (placebo), by target population (authoritative reference)
SCEN = [
    ('T2D primary prevention (DECLARE/CANVAS-like)', 0.015),
    ('broad T2D + CKD / mixed CV risk (reference)', 0.030),
    ('HFrEF / HFpEF (DAPA-HF/EMPEROR-like)', 0.080),
]
PRIMARY = 'broad T2D + CKD / mixed CV risk (reference)'


def arr_nnt(hr_draws, base):
    arr = base * (1.0 - hr_draws)                # absolute risk reduction (/yr)
    arr = np.clip(arr, 1e-9, None)
    nnt = 1.0 / arr
    return (float(np.median(arr) * 100), [float(np.percentile(arr, 2.5) * 100), float(np.percentile(arr, 97.5) * 100)],
            float(np.median(nnt)), [float(np.percentile(nnt, 2.5)), float(np.percentile(nnt, 97.5))])


print(f'SGLT2 HF-hospitalisation transport -- class-pooled HR {np.median(class_draws):.2f} '
      f'(k>=2 agents), lead {lead} HR {medHR[order[0]]:.2f}\n')
print('=== transported ABSOLUTE benefit by target baseline risk (class-pooled HR draws) ===')
print(f'  {"target population":46s} baseline   ARR%/yr (95% CrI)     NNT/yr (95% CrI)')
scen_out = []
for name, base in SCEN:
    arr, arrci, nnt, nntci = arr_nnt(class_draws, base)
    star = ' *' if name == PRIMARY else '  '
    print(f'{star}{name:46s} {base*100:4.1f}%/yr  {arr:5.2f} ({arrci[0]:.2f},{arrci[1]:.2f})   '
          f'{nnt:5.0f} ({nntci[1]:.0f},{nntci[0]:.0f})')
    scen_out.append({'population': name, 'baseline_annual_risk': base,
                     'arr_pct_yr': round(arr, 2), 'arr_cri': [round(x, 2) for x in arrci],
                     'nnt_yr': round(nnt, 0), 'nnt_cri': [round(nntci[1], 0), round(nntci[0], 0)],
                     'primary': name == PRIMARY})

# lead agent at the primary scenario
base0 = dict(SCEN)[PRIMARY]
larr, larrci, lnnt, lnntci = arr_nnt(lead_draws, base0)
print(f'\n  lead agent {lead} at the primary baseline ({base0*100:.1f}%/yr): '
      f'ARR {larr:.2f}%/yr, NNT {lnnt:.0f} (95% CrI {lnntci[1]:.0f} to {lnntci[0]:.0f})')

print('\n=== transport depth verdict (SGLT2) ===')
print('  The transport stage repoints to the HARD-OUTCOME / absolute-risk path: HF-hospitalisation HR draws ->')
print('  ARR + NNT in a real target, with full posterior CrIs. The decisive, honest message is the baseline-')
print('  risk dependence -- the SAME class HR gives an NNT that swings ~5x across primary-prevention vs HFrEF')
print('  targets, so an HR alone is not a transportable decision quantity. With the Bayesian single-endpoint')
print('  league + this transport + the dashboard, SGLT2 is now a SECOND full-depth class (different outcome')
print('  type from PCSK9: survival/absolute-risk, not continuous biomarker). Baseline rates are reference')
print('  values; CV/HF benefit claims stay with each trial and are GRADE-downgraded for indirectness.')

json.dump({'class': 'SGLT2 inhibitors', 'stage': 'transport (HF-hosp HR -> ARR + NNT in a target)',
           'class_pooled_hr': round(float(np.median(class_draws)), 2), 'lead': lead,
           'lead_hr': round(float(medHR[order[0]]), 2),
           'scenarios': scen_out, 'primary_scenario': PRIMARY,
           'lead_at_primary': {'population': PRIMARY, 'baseline_annual_risk': base0,
                               'arr_pct_yr': round(larr, 2), 'nnt_yr': round(lnnt, 0),
                               'nnt_cri': [round(lnntci[1], 0), round(lnntci[0], 0)]},
           'baseline_source': 'reference-distribution annual HF-hospitalisation placebo risks from the major SGLT2 trial populations (authoritative reference, NOT registry-extracted event counts)',
           'depth_note': 'hard-outcome/absolute-risk transport: per-agent Bayesian HR draws -> ARR + NNT with full posterior CrI across documented baseline-risk targets. Key honest message = baseline-risk dependence (NNT swings ~5x primary-prevention vs HFrEF), so an HR alone is not transportable. SGLT2 now a SECOND full-depth class (survival path, distinct from PCSK9 continuous biomarker). Baseline rates are reference values; CV/HF benefit stays with each trial, GRADE-downgraded for indirectness. No IPD.'},
          open(f'{HERE}/sglt2_transport.json', 'w'), indent=1)
print('\nwrote sglt2_transport.json')
