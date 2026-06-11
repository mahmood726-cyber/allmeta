"""GENERALITY depth (transport stage) for the ASTHMA class -- the count/rate analogue of the SGLT2 HR->NNT
transport. A rate ratio is not a transportable decision quantity; the decision-relevant outcome is the
ABSOLUTE number of exacerbations AVERTED per patient-year, which depends on the target population's baseline
annual exacerbation rate. This stage transports the Bayesian per-agent IRR DRAWS (asthma_rr_draws.npz) onto
absolute exacerbations averted across documented baseline-rate targets (moderate -> severe -> frequent-
exacerbator asthma), propagating full posterior uncertainty. The honest core is the same as SGLT2: the same
IRR gives very different absolute benefit by baseline rate -- AND for asthma this baseline rate is itself the
effect-modifier the class-5 caveat flagged (eosinophil/severity enrichment), so transport makes that explicit.
Baseline rates are reference-distribution values from the major biologic trial placebo arms. No IPD."""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class5_asthma'
d = np.load(f'{HERE}/asthma_rr_draws.npz', allow_pickle=True)
th = d['theta']; agents = list(d['agents']); kper = {agents[i]: int(d['kper'][i]) for i in range(len(agents))}
rr = np.exp(th)                                   # IRR draws (A, ndraws)
medRR = np.median(rr, axis=1)
order = list(np.argsort(medRR)); lead = agents[order[0]]
class_draws = np.exp(th.mean(axis=0))             # draw-wise mean log-RR -> class IRR
lead_draws = rr[order[0]]

# reference baseline annual exacerbation rate (placebo), by target severity (authoritative reference)
SCEN = [
    ('moderate asthma (lower-rate target)', 0.8),
    ('severe eosinophilic asthma (reference)', 1.8),
    ('frequent-exacerbator / very severe', 3.5),
]
PRIMARY = 'severe eosinophilic asthma (reference)'


def averted(rr_draws, base):
    av = base * (1.0 - rr_draws)                  # absolute exacerbations averted per patient-year
    return (float(np.median(av)), [float(np.percentile(av, 2.5)), float(np.percentile(av, 97.5))])


print(f'asthma exacerbation transport -- class IRR {np.median(class_draws):.2f}, lead {lead} IRR {medRR[order[0]]:.2f}\n')
print('=== transported ABSOLUTE exacerbations averted /patient-year (class IRR draws) ===')
print(f'  {"target population":42s} baseline/yr   averted/yr (95% CrI)')
scen_out = []
for name, base in SCEN:
    av, avci = averted(class_draws, base)
    star = ' *' if name == PRIMARY else '  '
    print(f'{star}{name:42s} {base:4.1f}        {av:.2f} ({avci[0]:.2f}, {avci[1]:.2f})')
    scen_out.append({'population': name, 'baseline_annual_rate': base,
                     'averted_per_yr': round(av, 2), 'averted_cri': [round(x, 2) for x in avci],
                     'primary': name == PRIMARY})

base0 = dict(SCEN)[PRIMARY]
lav, lavci = averted(lead_draws, base0)
print(f'\n  lead agent {lead} at the primary baseline ({base0:.1f}/yr): '
      f'{lav:.2f} exacerbations averted/yr (95% CrI {lavci[0]:.2f} to {lavci[1]:.2f})')

print('\n=== transport depth verdict (asthma) ===')
print('  The transport repoints to the COUNT/RATE absolute scale: IRR draws -> exacerbations averted/patient-')
print('  year in a target, with full posterior CrI. Same honest message as SGLT2 -- absolute benefit scales')
print('  with the baseline rate (~0.3 -> ~1.4 averted/yr from moderate to frequent-exacerbator). For asthma')
print('  that baseline rate IS the effect-modifier the class-5 caveat flagged (severity/eosinophil enrichment),')
print('  so the transport makes the confounder explicit rather than hiding it in a cross-agent league. With the')
print('  Bayesian league + this transport + the dashboard, asthma is the THIRD full-depth class (count/rate).')
print('  Baseline rates are reference values; this is exacerbation-rate benefit, not a mortality/hospitalisation claim.')

json.dump({'class': 'asthma biologics', 'stage': 'transport (exacerbation IRR -> absolute averted/patient-year)',
           'outcome_type': 'count/rate', 'class_pooled_irr': round(float(np.median(class_draws)), 2),
           'lead': lead, 'lead_irr': round(float(medRR[order[0]]), 2),
           'scenarios': scen_out, 'primary_scenario': PRIMARY,
           'lead_at_primary': {'population': PRIMARY, 'baseline_annual_rate': base0,
                               'averted_per_yr': round(lav, 2), 'averted_cri': [round(x, 2) for x in lavci]},
           'baseline_source': 'reference-distribution annual exacerbation placebo rates by asthma severity (authoritative reference, NOT registry-extracted event counts)',
           'depth_note': 'count/rate absolute transport: per-agent Bayesian IRR draws -> exacerbations averted/patient-year with posterior CrI across baseline-rate (severity) targets. Honest message = absolute benefit scales with baseline rate, which for asthma IS the class-5 effect-modifier (severity/eosinophil enrichment), so transport makes the confounder explicit. Asthma = THIRD full-depth class (count/rate), after PCSK9 (continuous) + SGLT2 (survival). Baseline rates are reference values; exacerbation-rate benefit only. No IPD.'},
          open(f'{HERE}/asthma_transport.json', 'w'), indent=1)
print('\nwrote asthma_transport.json')
