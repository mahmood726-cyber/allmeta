"""GENERALITY class 7 depth (transport stage) -- the DTA analogue of the SGLT2/PCSK9 transport. A pooled
sensitivity/specificity pair is clinically incomplete; the decision-relevant quantities are the POSITIVE and
NEGATIVE predictive values (PPV / NPV), which depend on the TARGET population's disease PREVALENCE exactly as
ARR/NNT depend on baseline risk. This stage transports the Bayesian per-modality (Se, Sp) DRAWS
(dta_biv_draws.npz) onto PPV + NPV across documented prevalence scenarios, propagating full posterior
uncertainty into the predictive-value credible intervals. Honest core: the SAME Se/Sp gives a very different
PPV at screening (low prevalence) vs symptomatic / staging (high prevalence) -- so Se/Sp alone is not a
transportable decision quantity. Prevalences are reference-distribution values, stated as such. No IPD."""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class7_dta'
d = np.load(f'{HERE}/dta_biv_draws.npz', allow_pickle=True)
mu_se = d['mu_se']; mu_sp = d['mu_sp']; mods = list(d['mods'])
kper = {mods[i]: int(d['kper'][i]) for i in range(len(mods))}
sig = lambda x: 1 / (1 + np.exp(-x))
Se = sig(mu_se); Sp = sig(mu_sp)                       # (M, ndraws)
J = Se + Sp - 1
medJ = np.median(J, axis=1)
order = list(np.argsort(-medJ)); lead = mods[order[0]]

# reference disease prevalence by clinical setting (authoritative reference, not registry-extracted)
SCEN = [
    ('population screening (low prevalence)', 0.02),
    ('enriched / surveillance cohort (reference)', 0.10),
    ('symptomatic / staging work-up (high prevalence)', 0.30),
]
PRIMARY = 'enriched / surveillance cohort (reference)'


def ppv_npv(se_d, sp_d, prev):
    ppv = se_d * prev / (se_d * prev + (1 - sp_d) * (1 - prev))
    npv = sp_d * (1 - prev) / (sp_d * (1 - prev) + (1 - se_d) * prev)
    q = lambda a: [round(float(np.percentile(a, 2.5)), 3), round(float(np.percentile(a, 97.5)), 3)]
    return (round(float(np.median(ppv)), 3), q(ppv), round(float(np.median(npv)), 3), q(npv))


print(f'DTA predictive-value transport -- lead modality {lead} (Youden J {medJ[order[0]]:.2f})\n')
print('=== transported PPV / NPV by target prevalence (lead modality draws) ===')
print(f'  {"clinical setting":48s} prev    PPV (95% CrI)            NPV (95% CrI)')
li = order[0]
scen_out = []
for name, prev in SCEN:
    ppv, ppvci, npv, npvci = ppv_npv(Se[li], Sp[li], prev)
    star = ' *' if name == PRIMARY else '  '
    print(f'{star}{name:48s} {prev*100:4.1f}%  {ppv:.2f} ({ppvci[0]:.2f},{ppvci[1]:.2f})     {npv:.2f} ({npvci[0]:.2f},{npvci[1]:.2f})')
    scen_out.append({'setting': name, 'prevalence': prev, 'ppv': ppv, 'ppv_cri': ppvci,
                     'npv': npv, 'npv_cri': npvci, 'primary': name == PRIMARY})

# per-modality PPV at the primary prevalence (the decision-relevant comparison)
prev0 = dict(SCEN)[PRIMARY]
print(f'\n=== per-modality PPV/NPV at the primary prevalence ({prev0*100:.0f}%) ===')
per_mod = {}
for i in order:
    ppv, ppvci, npv, npvci = ppv_npv(Se[i], Sp[i], prev0)
    print(f'  {mods[i]:11s}(k={kper[mods[i]]:>2d})  PPV {ppv:.2f} ({ppvci[0]:.2f},{ppvci[1]:.2f})   NPV {npv:.2f} ({npvci[0]:.2f},{npvci[1]:.2f})')
    per_mod[mods[i]] = {'ppv': ppv, 'ppv_cri': ppvci, 'npv': npv, 'npv_cri': npvci}

# honest spread message: PPV range of the lead across the prevalence scenarios
ppvs = [s['ppv'] for s in scen_out]
print(f'\n  lead-modality PPV swings {min(ppvs):.2f} -> {max(ppvs):.2f} across screening vs staging prevalence')
print('\n=== transport depth verdict (DTA) ===')
print('  The transport stage repoints to the PREDICTIVE-VALUE path: bivariate Se/Sp draws -> PPV + NPV in a real')
print('  target, with full posterior CrIs. The decisive honest message mirrors the SGLT2 baseline-risk lesson --')
print('  the SAME Se/Sp gives a very different PPV across screening vs staging prevalence, so a Se/Sp pair alone')
print('  is not a transportable decision quantity. Prevalences are reference values; the cross-modality ranking')
print('  is GRADE-downgraded (indirect + cross-target heterogeneity).')

json.dump({'class': 'oncologic imaging modalities (comparative DTA)',
           'stage': 'transport (bivariate Se/Sp -> PPV + NPV in a target)', 'lead': lead,
           'lead_youden_j': round(float(medJ[order[0]]), 3),
           'scenarios': scen_out, 'primary_scenario': PRIMARY, 'primary_prevalence': prev0,
           'per_modality_at_primary': per_mod,
           'prevalence_source': 'reference-distribution disease prevalences by clinical setting (authoritative reference, NOT registry-extracted)',
           'depth_note': ('predictive-value transport: per-modality Bayesian Se/Sp draws -> PPV + NPV with full '
                          'posterior CrI across documented prevalence targets. Key honest message = prevalence '
                          'dependence (lead PPV swings widely screening vs staging), so Se/Sp alone is not '
                          'transportable -- the DTA analogue of the SGLT2 baseline-risk dependence. Prevalences '
                          'are reference values; cross-modality ranking GRADE-downgraded for indirectness + '
                          'cross-target heterogeneity. No IPD.')},
          open(f'{HERE}/dta_transport.json', 'w', encoding='utf-8'), indent=1)
print('\nwrote dta_transport.json')
